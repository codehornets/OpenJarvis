// Context-window fill estimation for the composer/system-panel meter.
// Pure module — no React, no DOM.
//
// Limits mirror the backend catalog (src/handymate/intelligence/model_catalog.py).
// The server does not expose context_length on /v1/models yet; when it does,
// pass it as `serverLimit` and it wins over this table.

import type { ChatMessage } from '../types';

export type ContextFillLevel = 'ok' | 'warn' | 'critical';

export interface ContextFill {
  used: number;
  limit: number;
  /** 0–100, clamped. */
  pct: number;
  level: ContextFillLevel;
}

export type ContextMeterState =
  | { status: 'ok'; data: ContextFill }
  /** No assistant reply with usage yet — nothing to measure. */
  | { status: 'missing' }
  /** Unknown model — no limit table entry and no server-provided limit. */
  | { status: 'unsupported' };

/** Exact model ids from the backend catalog. */
const EXACT_LIMITS: Record<string, number> = {
  'qwen3:0.6b': 40_960,
  'qwen3:1.7b': 40_960,
  'qwen3:4b': 262_144,
  'qwen3:8b': 32_768,
  'qwen3:14b': 40_960,
  'qwen3:30b': 262_144,
  'qwen3:32b': 32_768,
  'qwen3.5:0.8b': 131_072,
  'qwen3.5:2b': 131_072,
  'qwen3.5:9b': 131_072,
  'qwen3.5:27b': 131_072,
  'qwen3.5:35b': 131_072,
  'qwen3.5:122b': 131_072,
  'qwen3.5:397b': 131_072,
  'llama3.3:70b': 131_072,
  'llama3.2:3b': 131_072,
  'deepseek-coder-v2:16b': 131_072,
  'mistral:7b': 32_768,
  'gpt-oss:120b': 131_072,
  'glm-4.7-flash': 131_072,
  'trinity-mini': 128_000,
};

/** Family fallbacks for tags not in the catalog (e.g. qwen3:2b-q4). */
const FAMILY_LIMITS: Array<[prefix: string, limit: number]> = [
  ['qwen3.5', 131_072],
  ['qwen3', 40_960],
  ['llama3', 131_072],
  ['deepseek-coder-v2', 131_072],
  ['mistral', 32_768],
  ['gpt-oss', 131_072],
  ['glm-4.7', 131_072],
];

function normalizeModelId(modelId: string): string {
  const name = (modelId || '').trim().toLowerCase();
  // Strip any registry/namespace path ("library/qwen3:4b" → "qwen3:4b").
  return name.slice(name.lastIndexOf('/') + 1);
}

export function contextLimitFor(modelId: string, serverLimit?: number | null): number | null {
  if (typeof serverLimit === 'number' && serverLimit > 0) return serverLimit;
  const id = normalizeModelId(modelId);
  if (!id) return null;
  if (id in EXACT_LIMITS) return EXACT_LIMITS[id];
  for (const [prefix, limit] of FAMILY_LIMITS) {
    if (id.startsWith(prefix)) return limit;
  }
  return null;
}

/**
 * Tokens the next request will roughly carry: the last assistant message's
 * prompt + completion (its prompt already contained the whole history).
 */
export function contextUsed(messages: ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.usage) {
      return m.usage.prompt_tokens + m.usage.completion_tokens;
    }
  }
  return null;
}

export function contextFill(used: number, limit: number): ContextFill {
  const pct = Math.min(100, Math.max(0, (used / limit) * 100));
  const level: ContextFillLevel = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok';
  return { used, limit, pct, level };
}

export function meterState(
  messages: ChatMessage[],
  modelId: string,
  serverLimit?: number | null,
): ContextMeterState {
  const limit = contextLimitFor(modelId, serverLimit);
  if (limit == null) return { status: 'unsupported' };
  const used = contextUsed(messages);
  if (used == null) return { status: 'missing' };
  return { status: 'ok', data: contextFill(used, limit) };
}

/** Compact token count for HUD labels: 12.4k, 262k, 980. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}
