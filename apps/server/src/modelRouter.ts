import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './env.js';

type Tier = 'cheap' | 'medium' | 'expensive';

interface TierConfig {
  models: string[];
  maxTokens: number;
  budgetClass: 'mini' | 'premium';
}

const TIERS: Record<Tier, TierConfig> = {
  cheap: {
    models: ['gpt-4.1-nano', 'gpt-4o-mini', 'gpt-4.1-mini'],
    maxTokens: 500,
    budgetClass: 'mini',
  },
  medium: {
    models: ['gpt-4o', 'gpt-4.1'],
    maxTokens: 4096,
    budgetClass: 'premium',
  },
  expensive: {
    models: ['gpt-4o', 'gpt-4.1'],
    maxTokens: 16384,
    budgetClass: 'premium',
  },
};

const USAGE_PATH = './data/tokenUsage.json';
const DAILY_PREMIUM_BUDGET = config.openaiDailyPremiumBudget;
const DAILY_MINI_BUDGET = config.openaiDailyMiniBudget;

interface DailyUsage {
  date: string;
  premiumUsed: number;
  miniUsed: number;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage(): DailyUsage {
  try {
    if (existsSync(USAGE_PATH)) {
      const raw = readFileSync(USAGE_PATH, 'utf-8');
      const data = JSON.parse(raw) as DailyUsage;
      if (data.date === todayUTC()) return data;
    }
  } catch { /* start fresh */ }
  return { date: todayUTC(), premiumUsed: 0, miniUsed: 0 };
}

let usage = loadUsage();

function saveUsage(): void {
  try {
    const dir = dirname(USAGE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2), 'utf-8');
  } catch (err) {
    console.error('[modelRouter] failed to save usage:', err);
  }
}

function ensureToday(): void {
  const today = todayUTC();
  if (usage.date !== today) {
    usage = { date: today, premiumUsed: 0, miniUsed: 0 };
    saveUsage();
  }
}

function getBudgetRemaining(budgetClass: 'mini' | 'premium'): number {
  ensureToday();
  if (budgetClass === 'mini') return DAILY_MINI_BUDGET - usage.miniUsed;
  return DAILY_PREMIUM_BUDGET - usage.premiumUsed;
}

function recordTokens(budgetClass: 'mini' | 'premium', tokens: number): void {
  ensureToday();
  if (budgetClass === 'mini') {
    usage.miniUsed += tokens;
  } else {
    usage.premiumUsed += tokens;
  }
  saveUsage();
}

export interface RouteResult {
  content: string;
  model: string;
  tokensUsed: number;
}

export async function routeRequest(
  tier: Tier,
  prompt: string,
  systemPrompt?: string,
): Promise<RouteResult> {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  let effectiveTier = tier;

  // Downgrade if budget is low
  const tierConfig = TIERS[effectiveTier];
  const remaining = getBudgetRemaining(tierConfig.budgetClass);
  if (remaining < tierConfig.maxTokens * 2) {
    if (effectiveTier === 'expensive') effectiveTier = 'medium';
    else if (effectiveTier === 'medium') effectiveTier = 'cheap';
  }

  const finalConfig = TIERS[effectiveTier];
  const finalRemaining = getBudgetRemaining(finalConfig.budgetClass);
  if (finalRemaining < finalConfig.maxTokens) {
    throw new Error(`Daily ${finalConfig.budgetClass} token budget exhausted`);
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  // Try models in order
  for (const model of finalConfig.models) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: finalConfig.maxTokens,
          messages,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.warn(`[modelRouter] ${model} failed (${res.status}): ${body.slice(0, 100)}`);
        continue;
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;

      const tokensUsed = data.usage?.total_tokens || 0;
      recordTokens(finalConfig.budgetClass, tokensUsed);

      console.log(`[modelRouter] ${effectiveTier}/${model} used ${tokensUsed} tokens (${finalConfig.budgetClass} remaining: ${getBudgetRemaining(finalConfig.budgetClass)})`);

      return { content, model, tokensUsed };
    } catch (err) {
      console.warn(`[modelRouter] ${model} error:`, err);
      continue;
    }
  }

  throw new Error(`All models failed for tier ${effectiveTier}`);
}

export function getUsageStats() {
  ensureToday();
  return {
    date: usage.date,
    premiumUsed: usage.premiumUsed,
    premiumBudget: DAILY_PREMIUM_BUDGET,
    premiumRemaining: DAILY_PREMIUM_BUDGET - usage.premiumUsed,
    miniUsed: usage.miniUsed,
    miniBudget: DAILY_MINI_BUDGET,
    miniRemaining: DAILY_MINI_BUDGET - usage.miniUsed,
  };
}
