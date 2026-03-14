import pg from 'pg';

export const XP_PER_PRESENCE_MINUTE = 1;
export const XP_PER_ENERGY_UNIT = 0.5;
export const XP_PER_SYNC = 10;
export const XP_WORLD_EVENT_BONUS = 5;
export const XP_DAILY_LOGIN_BASE = 20;
export const XP_DAILY_LOGIN_STREAK_MULT = 5;

export interface XPProfile {
  userId: number;
  xp: number;
  totalXP: number;
  level: number;
  xpToNextLevel: number;
  loginStreak: number;
}

export interface XPAwardResult {
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  xpToNextLevel: number;
}

export function calculateLevel(totalXP: number): number {
  let level = 1;
  while (totalXP >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(1.4, level - 2));
}

export function xpToNextLevel(totalXP: number): number {
  const level = calculateLevel(totalXP);
  const nextLevelXP = xpForLevel(level + 1);
  return nextLevelXP - totalXP;
}

export interface XPManager {
  awardXP(userId: number, amount: number): Promise<XPAwardResult>;
  getProfile(userId: number): Promise<XPProfile | null>;
  spendXP(userId: number, amount: number): Promise<boolean>;
  recordDailyLogin(userId: number): Promise<{ streak: number; bonusXP: number }>;
}

export function createXPManager(pool: pg.Pool): XPManager {
  async function ensureRow(userId: number): Promise<void> {
    await pool.query(
      'INSERT INTO user_xp (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
  }

  async function awardXP(userId: number, amount: number): Promise<XPAwardResult> {
    await ensureRow(userId);

    const today = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `UPDATE user_xp
       SET xp = xp + $2,
           total_xp = total_xp + $2,
           daily_xp = CASE WHEN daily_xp_date = $3::date THEN daily_xp + $2 ELSE $2 END,
           daily_xp_date = $3::date,
           last_xp_at = NOW()
       WHERE user_id = $1
       RETURNING xp, total_xp, level`,
      [userId, amount, today],
    );

    const row = rows[0];
    const newLevel = calculateLevel(row.total_xp);

    if (newLevel !== row.level) {
      await pool.query(
        'UPDATE user_xp SET level = $2 WHERE user_id = $1',
        [userId, newLevel],
      );
    }

    return {
      newXP: Number(row.xp),
      newLevel,
      leveledUp: newLevel > row.level,
      xpToNextLevel: xpToNextLevel(Number(row.total_xp)),
    };
  }

  async function getProfile(userId: number): Promise<XPProfile | null> {
    await ensureRow(userId);
    const { rows } = await pool.query(
      'SELECT xp, total_xp, level, login_streak FROM user_xp WHERE user_id = $1',
      [userId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      userId,
      xp: Number(r.xp),
      totalXP: Number(r.total_xp),
      level: r.level,
      xpToNextLevel: xpToNextLevel(Number(r.total_xp)),
      loginStreak: r.login_streak,
    };
  }

  async function spendXP(userId: number, amount: number): Promise<boolean> {
    const { rowCount } = await pool.query(
      'UPDATE user_xp SET xp = xp - $2 WHERE user_id = $1 AND xp >= $2',
      [userId, amount],
    );
    return (rowCount ?? 0) > 0;
  }

  async function recordDailyLogin(userId: number): Promise<{ streak: number; bonusXP: number }> {
    await ensureRow(userId);
    const { rows } = await pool.query(
      'SELECT login_streak, last_login_date FROM user_xp WHERE user_id = $1',
      [userId],
    );

    const r = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const lastLogin = r.last_login_date ? new Date(r.last_login_date).toISOString().slice(0, 10) : null;

    if (lastLogin === today) {
      return { streak: r.login_streak, bonusXP: 0 };
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastLogin === yesterday ? r.login_streak + 1 : 1;

    await pool.query(
      'UPDATE user_xp SET login_streak = $2, last_login_date = $3::date WHERE user_id = $1',
      [userId, newStreak, today],
    );

    const bonusXP = XP_DAILY_LOGIN_BASE + newStreak * XP_DAILY_LOGIN_STREAK_MULT;
    return { streak: newStreak, bonusXP };
  }

  return { awardXP, getProfile, spendXP, recordDailyLogin };
}
