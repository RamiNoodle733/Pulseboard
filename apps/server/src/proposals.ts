import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { ProposalStatus, ProposalPayload } from './types.js';

export interface Proposal {
  id: string;
  prompt: string;
  submittedBy: string;
  submittedByOrdinal: number;
  submittedAt: number;
  status: ProposalStatus;
  summary: string | null;
  reasoning: string | null;
  changedFiles: string[];
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  upvotes: Set<string>;
  downvotes: Set<string>;
  resolvedAt: number | null;
  error: string | null;
}

interface SerializedProposal {
  id: string;
  prompt: string;
  submittedBy: string;
  submittedByOrdinal: number;
  submittedAt: number;
  status: ProposalStatus;
  summary: string | null;
  reasoning: string | null;
  changedFiles: string[];
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  upvotes: string[];
  downvotes: string[];
  resolvedAt: number | null;
  error: string | null;
}

const PROPOSALS_PATH = './data/proposals.json';
const SAVE_INTERVAL = 30_000;

function calculateMergeThreshold(connectedUsers: number): number {
  if (connectedUsers <= 3) return 2;
  if (connectedUsers <= 10) return 3;
  if (connectedUsers <= 50) return Math.ceil(connectedUsers * 0.2);
  return Math.ceil(connectedUsers * 0.1);
}

export function createProposalManager() {
  const proposals = new Map<string, Proposal>();
  let saveTimer: ReturnType<typeof setInterval> | null = null;

  function load(): void {
    try {
      if (existsSync(PROPOSALS_PATH)) {
        const raw = readFileSync(PROPOSALS_PATH, 'utf-8');
        const list: SerializedProposal[] = JSON.parse(raw);
        for (const sp of list) {
          proposals.set(sp.id, {
            ...sp,
            upvotes: new Set(sp.upvotes),
            downvotes: new Set(sp.downvotes),
          });
        }
        console.log(`[proposals] loaded ${proposals.size} proposals`);
      }
    } catch (err) {
      console.error('[proposals] failed to load:', err);
    }
  }

  function save(): void {
    try {
      const dir = './data';
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const list: SerializedProposal[] = [];
      for (const p of proposals.values()) {
        list.push({
          ...p,
          upvotes: [...p.upvotes],
          downvotes: [...p.downvotes],
        });
      }
      writeFileSync(PROPOSALS_PATH, JSON.stringify(list, null, 2));
    } catch (err) {
      console.error('[proposals] failed to save:', err);
    }
  }

  function startAutoSave(): void {
    load();
    saveTimer = setInterval(save, SAVE_INTERVAL);
  }

  function shutdown(): void {
    if (saveTimer) clearInterval(saveTimer);
    save();
    console.log('[proposals] saved on shutdown');
  }

  function createProposal(
    id: string,
    prompt: string,
    userId: string,
    ordinal: number,
  ): Proposal {
    const proposal: Proposal = {
      id,
      prompt,
      submittedBy: userId,
      submittedByOrdinal: ordinal,
      submittedAt: Date.now(),
      status: 'submitted',
      summary: null,
      reasoning: null,
      changedFiles: [],
      prNumber: null,
      prUrl: null,
      branchName: null,
      upvotes: new Set(),
      downvotes: new Set(),
      resolvedAt: null,
      error: null,
    };
    proposals.set(id, proposal);
    return proposal;
  }

  function updateStatus(
    id: string,
    status: ProposalStatus,
    updates?: Partial<Omit<Proposal, 'upvotes' | 'downvotes'>>,
  ): Proposal | null {
    const p = proposals.get(id);
    if (!p) return null;
    p.status = status;
    if (updates) {
      Object.assign(p, updates);
    }
    return p;
  }

  function vote(
    proposalId: string,
    userId: string,
    direction: 'up' | 'down',
  ): { upvotes: number; downvotes: number } | null {
    const p = proposals.get(proposalId);
    if (!p || p.status !== 'pr-created') return null;

    // Remove existing vote if any
    p.upvotes.delete(userId);
    p.downvotes.delete(userId);

    // Apply new vote
    if (direction === 'up') {
      p.upvotes.add(userId);
    } else {
      p.downvotes.add(userId);
    }

    return { upvotes: p.upvotes.size, downvotes: p.downvotes.size };
  }

  function shouldMerge(proposalId: string, connectedUsers: number): boolean {
    const p = proposals.get(proposalId);
    if (!p || p.status !== 'pr-created') return false;
    const threshold = calculateMergeThreshold(connectedUsers);
    return p.upvotes.size >= threshold && p.upvotes.size > p.downvotes.size;
  }

  function shouldReject(proposalId: string, connectedUsers: number): boolean {
    const p = proposals.get(proposalId);
    if (!p || p.status !== 'pr-created') return false;
    const threshold = calculateMergeThreshold(connectedUsers);
    return p.downvotes.size >= threshold && p.downvotes.size > p.upvotes.size;
  }

  function toPayload(p: Proposal, forUserId: string): ProposalPayload {
    let myVote: 'up' | 'down' | null = null;
    if (p.upvotes.has(forUserId)) myVote = 'up';
    else if (p.downvotes.has(forUserId)) myVote = 'down';

    return {
      id: p.id,
      prompt: p.prompt,
      submittedByOrdinal: p.submittedByOrdinal,
      submittedAt: p.submittedAt,
      status: p.status,
      summary: p.summary,
      reasoning: p.reasoning,
      changedFiles: p.changedFiles,
      prUrl: p.prUrl,
      upvoteCount: p.upvotes.size,
      downvoteCount: p.downvotes.size,
      myVote,
      resolvedAt: p.resolvedAt,
      error: p.error,
    };
  }

  function getActivePayloads(forUserId: string): ProposalPayload[] {
    const active: ProposalPayload[] = [];
    for (const p of proposals.values()) {
      if (p.status === 'merged' || p.status === 'rejected' || p.status === 'failed') {
        // Include resolved proposals from last hour for visibility
        if (p.resolvedAt && Date.now() - p.resolvedAt > 3600000) continue;
      }
      active.push(toPayload(p, forUserId));
    }
    return active.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 50);
  }

  function getPayload(id: string, forUserId: string): ProposalPayload | null {
    const p = proposals.get(id);
    if (!p) return null;
    return toPayload(p, forUserId);
  }

  function getExpiredProposals(ttlMs: number): Proposal[] {
    const now = Date.now();
    const expired: Proposal[] = [];
    for (const p of proposals.values()) {
      if (p.status === 'pr-created' && (now - p.submittedAt) > ttlMs) {
        expired.push(p);
      }
    }
    return expired;
  }

  return {
    createProposal,
    updateStatus,
    vote,
    shouldMerge,
    shouldReject,
    getActivePayloads,
    getPayload,
    getExpiredProposals,
    startAutoSave,
    shutdown,
  };
}
