import { config } from './env.js';

/** Files the AI is allowed to see and modify */
export const ALLOWED_FILES = [
  'apps/client/src/Canvas.tsx',
  'apps/client/src/particles.ts',
  'apps/client/src/index.css',
  'apps/client/src/components/StreakDisplay.tsx',
  'apps/client/src/components/CityTicker.tsx',
  'apps/client/src/components/DataBar.tsx',
  'apps/client/src/audio.ts',
] as const;

export type AllowedFile = (typeof ALLOWED_FILES)[number];

export interface FileChange {
  path: string;
  content: string;
}

export interface AIResult {
  changes: FileChange[];
  summary: string;
  reasoning: string;
}

function buildSystemPrompt(fileContents: Record<string, string>): string {
  const fileList = Object.entries(fileContents)
    .map(([path, content]) => `=== ${path} ===\n${content}`)
    .join('\n\n');

  return `You are modifying a live collaborative website called Pulseboard. Users submit prompts to change how the site looks and behaves.

You will be given the current contents of specific source files. You may ONLY produce changes to these files. You cannot create new files.

RULES:
- Do NOT import new npm packages
- Do NOT modify any component's props interface or exported function signature
- Do NOT remove existing functionality — only add to it or modify visual behavior
- Keep changes minimal and focused on the user's request
- The site uses React 18, TypeScript, Tailwind CSS, HTML5 Canvas, and Web Audio API
- Canvas.tsx has a ref-based animation loop — add visual effects inside the animate() function
- particles.ts has a ParticleSystem class with emitPulseTrail and emitSyncBurst methods
- audio.ts uses Web Audio API with noise buffers — no musical tones, only percussive hits

Respond ONLY with a JSON object (no markdown, no code fences) in this exact format:
{
  "summary": "one-line description of what you changed (max 70 chars)",
  "reasoning": "brief explanation of your approach (1-2 sentences)",
  "changes": [
    {
      "path": "exact/file/path.tsx",
      "content": "the COMPLETE new file content (not a diff)"
    }
  ]
}

If the request is impossible within these constraints, respond with:
{
  "summary": "Cannot fulfill request",
  "reasoning": "explanation of why",
  "changes": []
}

Here are the current source files:

${fileList}`;
}

async function fetchFileFromGitHub(path: string): Promise<string | null> {
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) return null;

  try {
    const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}?ref=${config.githubDefaultBranch}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content: string; encoding: string };
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchAllowedFileContents(): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};

  const results = await Promise.all(
    ALLOWED_FILES.map(async (path) => {
      const content = await fetchFileFromGitHub(path);
      return { path, content };
    }),
  );

  for (const { path, content } of results) {
    if (content) contents[path] = content;
  }

  return contents;
}

function isAllowedFile(path: string): path is AllowedFile {
  return (ALLOWED_FILES as readonly string[]).includes(path);
}

export async function generateChanges(userPrompt: string): Promise<AIResult> {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const fileContents = await fetchAllowedFileContents();
  if (Object.keys(fileContents).length === 0) {
    throw new Error('Could not fetch source files from GitHub');
  }

  const systemPrompt = buildSystemPrompt(fileContents);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      max_tokens: 16384,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response');

  // Parse JSON from response (strip any markdown fences if present)
  let jsonText = content.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: { summary: string; reasoning: string; changes: Array<{ path: string; content: string }> };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Failed to parse AI response as JSON');
  }

  if (!parsed.summary || !parsed.reasoning || !Array.isArray(parsed.changes)) {
    throw new Error('AI response missing required fields');
  }

  // Validate all file paths are in the allow-list
  const validChanges: FileChange[] = [];
  for (const change of parsed.changes) {
    if (!isAllowedFile(change.path)) {
      console.warn(`[ai] rejected change to unauthorized file: ${change.path}`);
      continue;
    }
    if (!change.content || typeof change.content !== 'string') {
      console.warn(`[ai] rejected empty content for: ${change.path}`);
      continue;
    }
    validChanges.push({ path: change.path, content: change.content });
  }

  return {
    changes: validChanges,
    summary: parsed.summary.slice(0, 70),
    reasoning: parsed.reasoning,
  };
}
