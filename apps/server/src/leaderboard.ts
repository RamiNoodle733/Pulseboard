import pg from 'pg';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string | null;
  avatarUrl: string | null;
  score: number;
  level?: number;
}

export interface LeaderboardManager {
  refreshAll(): Promise<void>;
  getBoard(type: string, limit?: number): Promise<LeaderboardEntry[]>;
}

export function createLeaderboardManager(pool: pg.Pool): LeaderboardManager {
  async function refreshAll(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM leaderboard_cache');

      // Global XP leaderboard
      await client.query(`
        INSERT INTO leaderboard_cache (board_type, user_id, rank, score, extra)
        SELECT 'global_xp', x.user_id, ROW_NUMBER() OVER (ORDER BY x.total_xp DESC),
               x.total_xp,
               jsonb_build_object('username', u.username, 'avatarUrl', u.avatar_url, 'level', x.level)
        FROM user_xp x
        JOIN users u ON u.id = x.user_id
        WHERE x.total_xp > 0
        ORDER BY x.total_xp DESC
        LIMIT 100
      `);

      // Global Level leaderboard
      await client.query(`
        INSERT INTO leaderboard_cache (board_type, user_id, rank, score, extra)
        SELECT 'global_level', x.user_id, ROW_NUMBER() OVER (ORDER BY x.level DESC, x.total_xp DESC),
               x.level,
               jsonb_build_object('username', u.username, 'avatarUrl', u.avatar_url, 'totalXP', x.total_xp)
        FROM user_xp x
        JOIN users u ON u.id = x.user_id
        WHERE x.level > 1
        ORDER BY x.level DESC, x.total_xp DESC
        LIMIT 100
      `);

      // Weekly XP leaderboard
      await client.query(`
        INSERT INTO leaderboard_cache (board_type, user_id, rank, score, extra)
        SELECT 'weekly_xp', x.user_id, ROW_NUMBER() OVER (ORDER BY x.daily_xp DESC),
               x.daily_xp,
               jsonb_build_object('username', u.username, 'avatarUrl', u.avatar_url, 'level', x.level)
        FROM user_xp x
        JOIN users u ON u.id = x.user_id
        WHERE x.daily_xp_date >= CURRENT_DATE - 7 AND x.daily_xp > 0
        ORDER BY x.daily_xp DESC
        LIMIT 100
      `);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[leaderboard] refresh failed:', err);
    } finally {
      client.release();
    }
  }

  async function getBoard(type: string, limit: number = 50): Promise<LeaderboardEntry[]> {
    const { rows } = await pool.query(
      `SELECT user_id, rank, score, extra
       FROM leaderboard_cache
       WHERE board_type = $1
       ORDER BY rank ASC
       LIMIT $2`,
      [type, limit],
    );

    return rows.map((r) => ({
      rank: r.rank,
      userId: r.user_id,
      username: r.extra?.username ?? null,
      avatarUrl: r.extra?.avatarUrl ?? null,
      score: Number(r.score),
      level: r.extra?.level,
    }));
  }

  return { refreshAll, getBoard };
}
