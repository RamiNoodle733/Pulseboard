import { config } from './env.js';
import type { FileChange } from './ai.js';

const API = 'https://api.github.com';

export interface PRResult {
  prNumber: number;
  prUrl: string;
  branchName: string;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function repoPath(): string {
  return `${API}/repos/${config.githubOwner}/${config.githubRepo}`;
}

async function ghFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${repoPath()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function getHeadSha(): Promise<string> {
  const ref = await ghFetch<{ object: { sha: string } }>(
    `/git/ref/heads/${config.githubDefaultBranch}`,
  );
  return ref.object.sha;
}

async function createBranch(branchName: string, sha: string): Promise<void> {
  await ghFetch(`/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });
}

async function commitFiles(
  branchName: string,
  baseSha: string,
  changes: FileChange[],
  message: string,
): Promise<string> {
  // Get the base tree
  const commit = await ghFetch<{ tree: { sha: string } }>(
    `/git/commits/${baseSha}`,
  );
  const baseTreeSha = commit.tree.sha;

  // Create tree with all file changes
  const tree = changes.map((change) => ({
    path: change.path,
    mode: '100644' as const,
    type: 'blob' as const,
    content: change.content,
  }));

  const newTree = await ghFetch<{ sha: string }>(`/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });

  // Create commit
  const newCommit = await ghFetch<{ sha: string }>(`/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [baseSha],
    }),
  });

  // Update branch ref
  await ghFetch(`/git/refs/heads/${branchName}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return newCommit.sha;
}

export async function createPR(
  changes: FileChange[],
  title: string,
  body: string,
  proposalId: string,
): Promise<PRResult> {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
    throw new Error('GitHub not configured');
  }

  const branchName = `ai/proposal-${proposalId}`;
  const headSha = await getHeadSha();

  await createBranch(branchName, headSha);
  await commitFiles(branchName, headSha, changes, title);

  const pr = await ghFetch<{ number: number; html_url: string }>(`/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: config.githubDefaultBranch,
    }),
  });

  console.log(`[github] PR #${pr.number} created: ${pr.html_url}`);

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    branchName,
  };
}

export async function mergePR(prNumber: number): Promise<boolean> {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
    return false;
  }

  try {
    await ghFetch(`/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: 'squash',
      }),
    });
    console.log(`[github] PR #${prNumber} merged`);
    return true;
  } catch (err) {
    console.error(`[github] merge failed for PR #${prNumber}:`, err);
    return false;
  }
}

export async function closePR(prNumber: number): Promise<void> {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) return;

  try {
    await ghFetch(`/pulls/${prNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    console.log(`[github] PR #${prNumber} closed`);
  } catch (err) {
    console.error(`[github] close failed for PR #${prNumber}:`, err);
  }
}
