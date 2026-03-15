import pg from 'pg';

export interface AchievementDef {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  category: string;
  threshold: number;
}

export interface UserAchievement {
  achievementId: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
}

export interface AchievementManager {
  loadDefinitions(): Promise<void>;
  checkAndAward(userId: number, context: AchievementContext): Promise<UserAchievement | null>;
  getUserAchievements(userId: number): Promise<UserAchievement[]>;
  getDefinitions(): AchievementDef[];
}

export interface AchievementContext {
  totalPulses?: number;
  totalSyncs?: number;
  currentStreak?: number;
  level?: number;
  totalEnergy?: number;
  citiesCount?: number;
  loginStreak?: number;
}

export function createAchievementManager(pool: pg.Pool): AchievementManager {
  const defs = new Map<string, AchievementDef>();
  let loaded = false;

  async function loadDefinitions(): Promise<void> {
    if (loaded) return;
    try {
      const { rows } = await pool.query(
        'SELECT id, slug, name, description, icon, xp_reward, category, threshold FROM achievements',
      );
      for (const r of rows) {
        defs.set(r.slug, {
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          icon: r.icon,
          xpReward: r.xp_reward,
          category: r.category,
          threshold: r.threshold,
        });
      }
      loaded = true;
    } catch (err) {
      console.error('[achievements] failed to load definitions:', err);
    }
  }

  // Check if a specific achievement should be awarded based on context
  function shouldAward(slug: string, ctx: AchievementContext): boolean {
    const def = defs.get(slug);
    if (!def) return false;

    switch (slug) {
      case 'first_pulse':
        return (ctx.totalPulses ?? 0) >= def.threshold;
      case 'first_sync':
        return (ctx.totalSyncs ?? 0) >= def.threshold;
      case 'level_5':
        return (ctx.level ?? 0) >= 5;
      case 'level_10':
        return (ctx.level ?? 0) >= 10;
      case 'streak_10':
        return (ctx.currentStreak ?? 0) >= 10;
      case 'streak_25':
        return (ctx.currentStreak ?? 0) >= 25;
      case 'cities_5':
        return (ctx.citiesCount ?? 0) >= 5;
      case 'energy_1000':
        return (ctx.totalEnergy ?? 0) >= 1000;
      case 'energy_10000':
        return (ctx.totalEnergy ?? 0) >= 10000;
      case 'login_7':
        return (ctx.loginStreak ?? 0) >= 7;
      default:
        return false;
    }
  }

  async function checkAndAward(userId: number, ctx: AchievementContext): Promise<UserAchievement | null> {
    await loadDefinitions();

    // Get already-earned achievements for this user
    const { rows: earned } = await pool.query(
      'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
      [userId],
    );
    const earnedIds = new Set(earned.map((r: { achievement_id: number }) => r.achievement_id));

    // Check each achievement
    for (const [slug, def] of defs) {
      if (earnedIds.has(def.id)) continue;
      if (!shouldAward(slug, ctx)) continue;

      // Award it
      try {
        await pool.query(
          'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, def.id],
        );

        return {
          achievementId: def.id,
          slug: def.slug,
          name: def.name,
          description: def.description,
          icon: def.icon,
          earnedAt: Date.now(),
        };
      } catch {
        // Race condition or duplicate, skip
        continue;
      }
    }

    return null;
  }

  async function getUserAchievements(userId: number): Promise<UserAchievement[]> {
    await loadDefinitions();
    const { rows } = await pool.query(
      `SELECT a.id, a.slug, a.name, a.description, a.icon, ua.earned_at
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = $1
       ORDER BY ua.earned_at DESC`,
      [userId],
    );
    return rows.map((r: { id: number; slug: string; name: string; description: string; icon: string; earned_at: Date }) => ({
      achievementId: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      icon: r.icon,
      earnedAt: new Date(r.earned_at).getTime(),
    }));
  }

  function getDefinitions(): AchievementDef[] {
    return Array.from(defs.values());
  }

  return { loadDefinitions, checkAndAward, getUserAchievements, getDefinitions };
}
