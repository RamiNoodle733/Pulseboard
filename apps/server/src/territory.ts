import pg from 'pg';

export interface TerritoryNode {
  id: number;
  name: string;
  type: 'world' | 'country' | 'state' | 'city';
  parentId: number | null;
  lat: number;
  lon: number;
  currentEnergy: number;
  momentum: number;
  dailyEnergy: number;
  allTimeEnergy: number;
  activeUsers: number;
}

export interface TerritorySnapshot {
  territories: Array<{
    id: number;
    name: string;
    type: string;
    parentId: number | null;
    energy: number;
    momentum: number;
    activeUsers: number;
  }>;
  topCities: Array<{ name: string; energy: number; momentum: number }>;
  topCountries: Array<{ name: string; energy: number }>;
  worldEnergy: number;
}

// Diffusion rates from child → parent
const DIFFUSION_CITY_TO_STATE = 0.30;
const DIFFUSION_STATE_TO_COUNTRY = 0.20;
const DIFFUSION_COUNTRY_TO_WORLD = 0.10;
const DECAY_RATE = 0.98;
const MOMENTUM_ALPHA = 0.1;

export interface TerritoryManager {
  ensureHierarchy(city: string, country: string, state: string, lat: number, lon: number): Promise<number>;
  addEnergy(cityTerritoryId: number, energy: number): void;
  setActiveUsers(cityTerritoryId: number, count: number): void;
  tick(): Promise<void>;
  getSnapshot(): TerritorySnapshot;
  getCityTerritoryId(city: string): number | undefined;
}

export function createTerritoryManager(pool: pg.Pool): TerritoryManager {
  // In-memory cache of territories for fast access
  const cache = new Map<number, TerritoryNode>();
  const nameTypeToId = new Map<string, number>();
  const cityToTerritoryId = new Map<string, number>();
  let loaded = false;

  function cacheKey(name: string, type: string): string {
    return `${type}::${name}`;
  }

  async function loadAll(): Promise<void> {
    if (loaded) return;
    try {
      const { rows } = await pool.query(
        'SELECT id, name, type, parent_id, lat, lon, current_energy, momentum, daily_energy, all_time_energy, active_users FROM territories',
      );
      for (const r of rows) {
        const node: TerritoryNode = {
          id: r.id,
          name: r.name,
          type: r.type,
          parentId: r.parent_id,
          lat: r.lat,
          lon: r.lon,
          currentEnergy: Number(r.current_energy),
          momentum: Number(r.momentum),
          dailyEnergy: Number(r.daily_energy),
          allTimeEnergy: Number(r.all_time_energy),
          activeUsers: r.active_users,
        };
        cache.set(node.id, node);
        nameTypeToId.set(cacheKey(node.name, node.type), node.id);
        if (node.type === 'city') {
          cityToTerritoryId.set(node.name, node.id);
        }
      }
      loaded = true;
    } catch (err) {
      console.error('[territory] failed to load:', err);
    }
  }

  async function ensureTerritory(
    name: string,
    type: 'world' | 'country' | 'state' | 'city',
    parentId: number | null,
    lat: number,
    lon: number,
  ): Promise<number> {
    const key = cacheKey(name, type);
    const existing = nameTypeToId.get(key);
    if (existing !== undefined) return existing;

    try {
      const { rows } = await pool.query(
        `INSERT INTO territories (name, type, parent_id, lat, lon)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name, type) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [name, type, parentId, lat, lon],
      );
      const id = rows[0].id;
      const node: TerritoryNode = {
        id,
        name,
        type,
        parentId,
        lat,
        lon,
        currentEnergy: 0,
        momentum: 0,
        dailyEnergy: 0,
        allTimeEnergy: 0,
        activeUsers: 0,
      };
      cache.set(id, node);
      nameTypeToId.set(key, id);
      if (type === 'city') {
        cityToTerritoryId.set(name, id);
      }
      return id;
    } catch (err) {
      // Race condition: another connection created it, try to fetch
      const { rows } = await pool.query(
        'SELECT id FROM territories WHERE name = $1 AND type = $2',
        [name, type],
      );
      if (rows.length > 0) {
        const id = rows[0].id;
        nameTypeToId.set(key, id);
        if (type === 'city') cityToTerritoryId.set(name, id);
        return id;
      }
      throw err;
    }
  }

  async function ensureHierarchy(
    city: string,
    country: string,
    state: string,
    lat: number,
    lon: number,
  ): Promise<number> {
    await loadAll();

    if (!city || !country) return 0;

    // Ensure world root
    const worldKey = cacheKey('World', 'world');
    let worldId = nameTypeToId.get(worldKey);
    if (worldId === undefined) {
      worldId = await ensureTerritory('World', 'world', null, 0, 0);
    }

    // Ensure country
    const countryId = await ensureTerritory(country, 'country', worldId, 0, 0);

    // Ensure state (use country as state if state is empty)
    const stateName = state || country;
    const stateId = await ensureTerritory(stateName, 'state', countryId, 0, 0);

    // Ensure city
    const cityId = await ensureTerritory(city, 'city', stateId, lat, lon);

    return cityId;
  }

  function addEnergy(cityTerritoryId: number, energy: number): void {
    const node = cache.get(cityTerritoryId);
    if (!node) return;
    node.currentEnergy += energy;
    node.dailyEnergy += energy;
    node.allTimeEnergy += energy;
  }

  function setActiveUsers(cityTerritoryId: number, count: number): void {
    const node = cache.get(cityTerritoryId);
    if (node) node.activeUsers = count;
  }

  async function tick(): Promise<void> {
    await loadAll();

    // Decay all territories
    for (const node of cache.values()) {
      const prevEnergy = node.currentEnergy;
      node.currentEnergy *= DECAY_RATE;

      // Update momentum (EMA of energy change)
      const delta = node.currentEnergy - prevEnergy;
      node.momentum = node.momentum * (1 - MOMENTUM_ALPHA) + delta * MOMENTUM_ALPHA;
    }

    // Diffuse energy upward: city → state → country → world
    for (const node of cache.values()) {
      if (node.type === 'city' && node.currentEnergy > 0.1 && node.parentId) {
        const diffused = node.currentEnergy * DIFFUSION_CITY_TO_STATE;
        const parent = cache.get(node.parentId);
        if (parent) {
          parent.currentEnergy += diffused;
          parent.allTimeEnergy += diffused;
        }
      }
      if (node.type === 'state' && node.currentEnergy > 0.1 && node.parentId) {
        const diffused = node.currentEnergy * DIFFUSION_STATE_TO_COUNTRY;
        const parent = cache.get(node.parentId);
        if (parent) {
          parent.currentEnergy += diffused;
          parent.allTimeEnergy += diffused;
        }
      }
      if (node.type === 'country' && node.currentEnergy > 0.1 && node.parentId) {
        const diffused = node.currentEnergy * DIFFUSION_COUNTRY_TO_WORLD;
        const parent = cache.get(node.parentId);
        if (parent) {
          parent.currentEnergy += diffused;
          parent.allTimeEnergy += diffused;
        }
      }
    }

    // Periodically persist to DB (every tick is fine since it's cheap, batched)
    persistSnapshot().catch((err) => console.error('[territory] persist error:', err));
  }

  let lastPersist = 0;
  async function persistSnapshot(): Promise<void> {
    const now = Date.now();
    if (now - lastPersist < 30_000) return; // Only persist every 30s
    lastPersist = now;

    const values: string[] = [];
    const params: (string | number)[] = [];
    let idx = 1;
    for (const node of cache.values()) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
      params.push(node.id, node.currentEnergy, node.momentum, node.activeUsers);
      idx += 4;
    }
    if (values.length === 0) return;

    try {
      await pool.query(
        `UPDATE territories SET
          current_energy = v.energy,
          momentum = v.momentum,
          active_users = v.users,
          updated_at = NOW()
        FROM (VALUES ${values.join(',')}) AS v(id, energy, momentum, users)
        WHERE territories.id = v.id::int`,
        params,
      );
    } catch { /* ignore persist errors */ }
  }

  function getSnapshot(): TerritorySnapshot {
    const territories: TerritorySnapshot['territories'] = [];
    let worldEnergy = 0;

    for (const node of cache.values()) {
      if (node.type === 'world') worldEnergy = node.currentEnergy;
      territories.push({
        id: node.id,
        name: node.name,
        type: node.type,
        parentId: node.parentId,
        energy: Math.round(node.currentEnergy * 100) / 100,
        momentum: Math.round(node.momentum * 100) / 100,
        activeUsers: node.activeUsers,
      });
    }

    const cities = Array.from(cache.values())
      .filter((n) => n.type === 'city')
      .sort((a, b) => b.currentEnergy - a.currentEnergy);

    const countries = Array.from(cache.values())
      .filter((n) => n.type === 'country')
      .sort((a, b) => b.currentEnergy - a.currentEnergy);

    return {
      territories,
      topCities: cities.slice(0, 10).map((c) => ({
        name: c.name,
        energy: Math.round(c.currentEnergy * 100) / 100,
        momentum: Math.round(c.momentum * 100) / 100,
      })),
      topCountries: countries.slice(0, 10).map((c) => ({
        name: c.name,
        energy: Math.round(c.currentEnergy * 100) / 100,
      })),
      worldEnergy: Math.round(worldEnergy * 100) / 100,
    };
  }

  function getCityTerritoryId(city: string): number | undefined {
    return cityToTerritoryId.get(city);
  }

  return {
    ensureHierarchy,
    addEnergy,
    setActiveUsers,
    tick,
    getSnapshot,
    getCityTerritoryId,
  };
}
