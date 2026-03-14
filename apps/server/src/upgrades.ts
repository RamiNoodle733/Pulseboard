import pg from 'pg';
import type { XPManager } from './xp.js';

export interface UpgradeDef {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: 'power' | 'cosmetic' | 'territory';
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  effectType: string;
  effectValue: number;
}

export interface UserUpgrade {
  upgradeId: number;
  slug: string;
  name: string;
  category: string;
  level: number;
  maxLevel: number;
}

export interface UserMultipliers {
  pulseRateMult: number;
  energyMult: number;
  influenceRadius: number;
  cityEnergyMult: number;
  diffusionRange: number;
  trailStyle: number;
  particleStyle: number;
  extraColors: number;
  badgeTier: number;
  territoryClaimBonus: number;
}

export const DEFAULT_MULTIPLIERS: UserMultipliers = {
  pulseRateMult: 1,
  energyMult: 1,
  influenceRadius: 1,
  cityEnergyMult: 1,
  diffusionRange: 1,
  trailStyle: 0,
  particleStyle: 0,
  extraColors: 0,
  badgeTier: 0,
  territoryClaimBonus: 0,
};

export interface UpgradeManager {
  getAvailableUpgrades(): Promise<UpgradeDef[]>;
  getUserUpgrades(userId: number): Promise<UserUpgrade[]>;
  purchaseUpgrade(userId: number, upgradeSlug: string, xpManager: XPManager): Promise<{ success: boolean; error?: string; upgrade?: UserUpgrade; xpSpent?: number }>;
  getUserMultipliers(userId: number): Promise<UserMultipliers>;
}

export function createUpgradeManager(pool: pg.Pool): UpgradeManager {
  let cachedUpgrades: UpgradeDef[] | null = null;

  async function getAvailableUpgrades(): Promise<UpgradeDef[]> {
    if (cachedUpgrades) return cachedUpgrades;
    const { rows } = await pool.query(
      'SELECT id, slug, name, description, category, max_level, base_cost, cost_multiplier, effect_type, effect_value FROM upgrades ORDER BY category, id',
    );
    cachedUpgrades = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      maxLevel: r.max_level,
      baseCost: r.base_cost,
      costMultiplier: parseFloat(r.cost_multiplier),
      effectType: r.effect_type,
      effectValue: parseFloat(r.effect_value),
    }));
    return cachedUpgrades;
  }

  async function getUserUpgrades(userId: number): Promise<UserUpgrade[]> {
    const { rows } = await pool.query(
      `SELECT uu.upgrade_id, u.slug, u.name, u.category, uu.level, u.max_level
       FROM user_upgrades uu
       JOIN upgrades u ON u.id = uu.upgrade_id
       WHERE uu.user_id = $1
       ORDER BY u.category, u.id`,
      [userId],
    );
    return rows.map((r) => ({
      upgradeId: r.upgrade_id,
      slug: r.slug,
      name: r.name,
      category: r.category,
      level: r.level,
      maxLevel: r.max_level,
    }));
  }

  async function purchaseUpgrade(
    userId: number,
    upgradeSlug: string,
    xpManager: XPManager,
  ): Promise<{ success: boolean; error?: string; upgrade?: UserUpgrade; xpSpent?: number }> {
    const allUpgrades = await getAvailableUpgrades();
    const def = allUpgrades.find((u) => u.slug === upgradeSlug);
    if (!def) return { success: false, error: 'Upgrade not found' };

    // Get current user level for this upgrade
    const { rows } = await pool.query(
      'SELECT level FROM user_upgrades WHERE user_id = $1 AND upgrade_id = $2',
      [userId, def.id],
    );
    const currentLevel = rows.length > 0 ? rows[0].level : 0;

    if (currentLevel >= def.maxLevel) {
      return { success: false, error: 'Already at max level' };
    }

    const cost = Math.floor(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
    const spent = await xpManager.spendXP(userId, cost);
    if (!spent) {
      return { success: false, error: `Not enough XP (need ${cost})` };
    }

    const newLevel = currentLevel + 1;
    await pool.query(
      `INSERT INTO user_upgrades (user_id, upgrade_id, level)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, upgrade_id)
       DO UPDATE SET level = $3, purchased_at = NOW()`,
      [userId, def.id, newLevel],
    );

    return {
      success: true,
      xpSpent: cost,
      upgrade: {
        upgradeId: def.id,
        slug: def.slug,
        name: def.name,
        category: def.category,
        level: newLevel,
        maxLevel: def.maxLevel,
      },
    };
  }

  async function getUserMultipliers(userId: number): Promise<UserMultipliers> {
    const { rows } = await pool.query(
      `SELECT u.effect_type, u.effect_value, uu.level
       FROM user_upgrades uu
       JOIN upgrades u ON u.id = uu.upgrade_id
       WHERE uu.user_id = $1`,
      [userId],
    );

    const m: UserMultipliers = { ...DEFAULT_MULTIPLIERS };

    for (const r of rows) {
      const val = parseFloat(r.effect_value) * r.level;
      switch (r.effect_type) {
        case 'pulse_rate_mult': m.pulseRateMult += val; break;
        case 'energy_mult': m.energyMult += val; break;
        case 'influence_radius': m.influenceRadius += val; break;
        case 'city_energy_mult': m.cityEnergyMult += val; break;
        case 'diffusion_range': m.diffusionRange += val; break;
        case 'trail_style': m.trailStyle = Math.max(m.trailStyle, r.level); break;
        case 'particle_style': m.particleStyle = Math.max(m.particleStyle, r.level); break;
        case 'extra_colors': m.extraColors += r.level; break;
        case 'badge_tier': m.badgeTier = Math.max(m.badgeTier, r.level); break;
        case 'territory_claim': m.territoryClaimBonus += val; break;
      }
    }

    return m;
  }

  return { getAvailableUpgrades, getUserUpgrades, purchaseUpgrade, getUserMultipliers };
}
