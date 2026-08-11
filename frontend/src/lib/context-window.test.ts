import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../types';
import {
  contextFill,
  contextLimitFor,
  contextUsed,
  formatTokens,
  meterState,
} from './context-window';

const msg = (role: 'user' | 'assistant', usage?: { prompt_tokens: number; completion_tokens: number }): ChatMessage => ({
  id: Math.random().toString(36).slice(2),
  role,
  content: 'x',
  timestamp: 0,
  usage: usage ? { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } : undefined,
});

describe('contextLimitFor', () => {
  it('returns catalog limits for exact ids', () => {
    expect(contextLimitFor('qwen3:4b')).toBe(262_144);
    expect(contextLimitFor('qwen3:8b')).toBe(32_768);
    expect(contextLimitFor('qwen3.5:9b')).toBe(131_072);
    expect(contextLimitFor('llama3.2:3b')).toBe(131_072);
    expect(contextLimitFor('mistral:7b')).toBe(32_768);
    expect(contextLimitFor('glm-4.7-flash')).toBe(131_072);
  });

  it('normalizes case and registry prefixes', () => {
    expect(contextLimitFor('Qwen3:4B')).toBe(262_144);
    expect(contextLimitFor('library/qwen3:4b')).toBe(262_144);
  });

  it('falls back by family for unknown tags', () => {
    expect(contextLimitFor('qwen3:2b-instruct-q4')).toBe(40_960);
    expect(contextLimitFor('qwen3.5:1b-preview')).toBe(131_072);
    expect(contextLimitFor('llama3.1:8b')).toBe(131_072);
  });

  it('returns null for unknown models and empty ids', () => {
    expect(contextLimitFor('phi4:mini')).toBeNull();
    expect(contextLimitFor('')).toBeNull();
  });

  it('prefers a server-provided limit over the table', () => {
    expect(contextLimitFor('qwen3:4b', 8192)).toBe(8192);
    expect(contextLimitFor('totally-unknown', 4096)).toBe(4096);
    expect(contextLimitFor('qwen3:4b', 0)).toBe(262_144);
    expect(contextLimitFor('qwen3:4b', null)).toBe(262_144);
  });
});

describe('contextUsed', () => {
  it('uses the last assistant message with usage', () => {
    const messages = [
      msg('user'),
      msg('assistant', { prompt_tokens: 100, completion_tokens: 50 }),
      msg('user'),
      msg('assistant', { prompt_tokens: 200, completion_tokens: 80 }),
    ];
    expect(contextUsed(messages)).toBe(280);
  });

  it('skips assistant messages without usage', () => {
    const messages = [msg('assistant', { prompt_tokens: 10, completion_tokens: 5 }), msg('assistant')];
    expect(contextUsed(messages)).toBe(15);
  });

  it('returns null when no usage exists', () => {
    expect(contextUsed([msg('user'), msg('assistant')])).toBeNull();
    expect(contextUsed([])).toBeNull();
  });
});

describe('contextFill levels', () => {
  const limit = 1000;
  it.each([
    [690, 'ok'],
    [710, 'warn'],
    [890, 'warn'],
    [910, 'critical'],
  ] as const)('%s/1000 → %s', (used, level) => {
    expect(contextFill(used, limit).level).toBe(level);
  });

  it('clamps pct to 100 (Ollama num_ctx may be smaller than the model max)', () => {
    expect(contextFill(2500, limit).pct).toBe(100);
  });
});

describe('meterState', () => {
  it('unsupported for unknown model, missing before first reply, ok after', () => {
    const noUsage = [msg('user')];
    const withUsage = [msg('assistant', { prompt_tokens: 400, completion_tokens: 100 })];
    expect(meterState(withUsage, 'phi4:mini').status).toBe('unsupported');
    expect(meterState(noUsage, 'qwen3:8b').status).toBe('missing');
    const ok = meterState(withUsage, 'qwen3:8b');
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') {
      expect(ok.data.used).toBe(500);
      expect(ok.data.limit).toBe(32_768);
    }
  });
});

describe('formatTokens', () => {
  it('formats human-scale counts', () => {
    expect(formatTokens(980)).toBe('980');
    expect(formatTokens(12_440)).toBe('12.4k');
    expect(formatTokens(262_144)).toBe('262k');
  });
});
