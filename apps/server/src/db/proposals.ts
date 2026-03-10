import pg from 'pg';
import type { ProposalStatus, ProposalPayload } from '../types.js';

function calculateMergeThreshold(connectedUsers: number): number {
  if (connectedUsers <= 3) return 2;
  if (connectedUsers <= 10) return 3;
  if (connectedUsers <= 50) return Math.ceil(connectedUsers * 0.2);
  return Math.ceil(connectedUsers * 0.1);
}

export function createDBProposalManager(pool: pg.Pool) {
  async function createProposal(
    id: string,
    prompt: string,
    submittedByDbId: number | null,
    ordinal: number,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO proposals (id, prompt, submitted_by, submitted_by_ordinal, submitted_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'submitted')`,
      [id, prompt, submittedByDbId, ordinal],
    );
  }

  async function updateStatus(
    id: string,
    status: ProposalStatus,
    updates?: {
      summary?: string;
      reasoning?: string;
      changedFiles?: string[];
      prNumber?: number;
      prUrl?: string;
      branchName?: string;
      resolvedAt?: number;
      error?: string;
    },
  ): Promise<void> {
    const sets = ['status = $2'];
    const vals: unknown[] = [id, status];
    let idx = 3;

    if (updates) {
      if (updates.summary !== undefined) { sets.push(`summary = $${idx}`); vals.push(updates.summary); idx++; }
      if (updates.reasoning !== undefined) { sets.push(`reasoning = $${idx}`); vals.push(updates.reasoning); idx++; }
      if (updates.changedFiles !== undefined) { sets.push(`changed_files = $${idx}`); vals.push(updates.changedFiles); idx++; }
      if (updates.prNumber !== undefined) { sets.push(`pr_number = $${idx}`); vals.push(updates.prNumber); idx++; }
      if (updates.prUrl !== undefined) { sets.push(`pr_url = $${idx}`); vals.push(updates.prUrl); idx++; }
      if (updates.branchName !== undefined) { sets.push(`branch_name = $${idx}`); vals.push(updates.branchName); idx++; }
      if (updates.resolvedAt !== undefined) { sets.push(`resolved_at = to_timestamp($${idx} / 1000.0)`); vals.push(updates.resolvedAt); idx++; }
      if (updates.error !== undefined) { sets.push(`error = $${idx}`); vals.push(updates.error); idx++; }
    }

    await pool.query(`UPDATE proposals SET ${sets.join(', ')} WHERE id = $1`, vals);
  }

  async function vote(
    proposalId: string,
    dbUserId: number,
    direction: 'up' | 'down',
  ): Promise<{ upvotes: number; downvotes: number } | null> {
    // Check proposal exists and is votable
    const { rows: pRows } = await pool.query(
      'SELECT status FROM proposals WHERE id = $1',
      [proposalId],
    );
    if (pRows.length === 0 || pRows[0].status !== 'pr-created') return null;

    // Upsert vote
    await pool.query(
      `INSERT INTO votes (proposal_id, user_id, direction)
       VALUES ($1, $2, $3)
       ON CONFLICT (proposal_id, user_id) DO UPDATE SET direction = $3, voted_at = NOW()`,
      [proposalId, dbUserId, direction],
    );

    // Get tallies
    const { rows: tallyRows } = await pool.query(
      `SELECT direction, COUNT(*)::int as count FROM votes WHERE proposal_id = $1 GROUP BY direction`,
      [proposalId],
    );
    let upvotes = 0;
    let downvotes = 0;
    for (const r of tallyRows) {
      if (r.direction === 'up') upvotes = r.count;
      else if (r.direction === 'down') downvotes = r.count;
    }

    return { upvotes, downvotes };
  }

  async function getVoteCounts(proposalId: string): Promise<{ upvotes: number; downvotes: number }> {
    const { rows } = await pool.query(
      `SELECT direction, COUNT(*)::int as count FROM votes WHERE proposal_id = $1 GROUP BY direction`,
      [proposalId],
    );
    let upvotes = 0;
    let downvotes = 0;
    for (const r of rows) {
      if (r.direction === 'up') upvotes = r.count;
      else if (r.direction === 'down') downvotes = r.count;
    }
    return { upvotes, downvotes };
  }

  async function shouldMerge(proposalId: string, connectedUsers: number): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT status FROM proposals WHERE id = $1',
      [proposalId],
    );
    if (rows.length === 0 || rows[0].status !== 'pr-created') return false;
    const { upvotes, downvotes } = await getVoteCounts(proposalId);
    const threshold = calculateMergeThreshold(connectedUsers);
    return upvotes >= threshold && upvotes > downvotes;
  }

  async function shouldReject(proposalId: string, connectedUsers: number): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT status FROM proposals WHERE id = $1',
      [proposalId],
    );
    if (rows.length === 0 || rows[0].status !== 'pr-created') return false;
    const { upvotes, downvotes } = await getVoteCounts(proposalId);
    const threshold = calculateMergeThreshold(connectedUsers);
    return downvotes >= threshold && downvotes > upvotes;
  }

  async function getPayload(id: string, forDbUserId: number | null): Promise<ProposalPayload | null> {
    const { rows } = await pool.query(
      `SELECT id, prompt, submitted_by_ordinal, submitted_at, status, summary, reasoning,
              changed_files, pr_url, resolved_at, error
       FROM proposals WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const p = rows[0];
    const { upvotes, downvotes } = await getVoteCounts(id);

    let myVote: 'up' | 'down' | null = null;
    if (forDbUserId) {
      const { rows: voteRows } = await pool.query(
        'SELECT direction FROM votes WHERE proposal_id = $1 AND user_id = $2',
        [id, forDbUserId],
      );
      if (voteRows.length > 0) myVote = voteRows[0].direction;
    }

    return {
      id: p.id,
      prompt: p.prompt,
      submittedByOrdinal: p.submitted_by_ordinal,
      submittedAt: new Date(p.submitted_at).getTime(),
      status: p.status,
      summary: p.summary,
      reasoning: p.reasoning,
      changedFiles: p.changed_files || [],
      prUrl: p.pr_url,
      upvoteCount: upvotes,
      downvoteCount: downvotes,
      myVote,
      resolvedAt: p.resolved_at ? new Date(p.resolved_at).getTime() : null,
      error: p.error,
    };
  }

  async function getActivePayloads(forDbUserId: number | null): Promise<ProposalPayload[]> {
    const { rows } = await pool.query(
      `SELECT id, prompt, submitted_by_ordinal, submitted_at, status, summary, reasoning,
              changed_files, pr_url, resolved_at, error
       FROM proposals
       ORDER BY submitted_at DESC
       LIMIT 50`,
    );

    const payloads: ProposalPayload[] = [];
    for (const p of rows) {
      const { upvotes, downvotes } = await getVoteCounts(p.id);

      let myVote: 'up' | 'down' | null = null;
      if (forDbUserId) {
        const { rows: voteRows } = await pool.query(
          'SELECT direction FROM votes WHERE proposal_id = $1 AND user_id = $2',
          [p.id, forDbUserId],
        );
        if (voteRows.length > 0) myVote = voteRows[0].direction;
      }

      payloads.push({
        id: p.id,
        prompt: p.prompt,
        submittedByOrdinal: p.submitted_by_ordinal,
        submittedAt: new Date(p.submitted_at).getTime(),
        status: p.status,
        summary: p.summary,
        reasoning: p.reasoning,
        changedFiles: p.changed_files || [],
        prUrl: p.pr_url,
        upvoteCount: upvotes,
        downvoteCount: downvotes,
        myVote,
        resolvedAt: p.resolved_at ? new Date(p.resolved_at).getTime() : null,
        error: p.error,
      });
    }
    return payloads;
  }

  async function search(
    query: string,
    status?: string,
    limit = 20,
    offset = 0,
  ): Promise<{ proposals: ProposalPayload[]; total: number }> {
    let whereClause = '';
    const vals: unknown[] = [];
    let idx = 1;

    if (query.trim()) {
      whereClause = `WHERE to_tsvector('english', coalesce(prompt,'') || ' ' || coalesce(summary,'')) @@ plainto_tsquery('english', $${idx})`;
      vals.push(query.trim());
      idx++;
    }

    if (status && status !== 'all') {
      whereClause += whereClause ? ` AND status = $${idx}` : `WHERE status = $${idx}`;
      vals.push(status);
      idx++;
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int as total FROM proposals ${whereClause}`, vals);
    const total = countResult.rows[0].total;

    const dataVals = [...vals, limit, offset];
    const { rows } = await pool.query(
      `SELECT id, prompt, submitted_by_ordinal, submitted_at, status, summary, reasoning,
              changed_files, pr_url, resolved_at, error
       FROM proposals ${whereClause}
       ORDER BY submitted_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      dataVals,
    );

    const proposals: ProposalPayload[] = rows.map((p) => ({
      id: p.id,
      prompt: p.prompt,
      submittedByOrdinal: p.submitted_by_ordinal,
      submittedAt: new Date(p.submitted_at).getTime(),
      status: p.status,
      summary: p.summary,
      reasoning: p.reasoning,
      changedFiles: p.changed_files || [],
      prUrl: p.pr_url,
      upvoteCount: 0,
      downvoteCount: 0,
      myVote: null,
      resolvedAt: p.resolved_at ? new Date(p.resolved_at).getTime() : null,
      error: p.error,
    }));

    return { proposals, total };
  }

  return {
    createProposal,
    updateStatus,
    vote,
    shouldMerge,
    shouldReject,
    getActivePayloads,
    getPayload,
    search,
  };
}
