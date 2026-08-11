import { describe, expect, it } from 'vitest';

import {
  DONE_HOLDOFF_MS,
  STALE_WORKING_MS,
  agentIdOf,
  initialAgentStatus,
  reduceAgentStatus,
  type AgentStatus,
  type StatusInput,
} from './agent-status';

const T0 = 1_000_000;

const ev = (type: string, data: Record<string, unknown> = {}): StatusInput => ({
  kind: 'event',
  event: { type, timestamp: T0, data },
});

function run(inputs: Array<[StatusInput, number]>, from?: AgentStatus): AgentStatus {
  let s = from ?? initialAgentStatus(T0);
  for (const [input, at] of inputs) {
    s = reduceAgentStatus(s, input, at);
  }
  return s;
}

describe('agentIdOf', () => {
  it('reads agent_id (tick events) and agent (tool/inference events)', () => {
    expect(agentIdOf({ type: 'agent_tick_start', data: { agent_id: 'a1' } })).toBe('a1');
    expect(agentIdOf({ type: 'tool_call_start', data: { agent: 'a1', tool: 'x' } })).toBe('a1');
  });

  it('returns null for plain-chat events with no agent key', () => {
    expect(agentIdOf({ type: 'inference_start', data: { model: 'qwen3:4b', engine: 'ollama' } })).toBeNull();
    expect(agentIdOf({ type: 'inference_end', data: {} })).toBeNull();
    expect(agentIdOf({ type: 'inference_end' })).toBeNull();
    expect(agentIdOf({ type: 'x', data: { agent_id: '' } })).toBeNull();
  });
});

describe('turn lifecycle', () => {
  it('tick_start → working with newTurn; first progress event clears newTurn', () => {
    let s = run([[ev('agent_tick_start', { agent_id: 'a1' }), T0]]);
    expect(s.activity).toBe('working');
    expect(s.flags.newTurn).toBe(true);

    s = run([[ev('tool_call_start', { agent: 'a1' }), T0 + 100]], s);
    expect(s.activity).toBe('working');
    expect(s.flags.newTurn).toBe(false);
  });

  it('tick_end(ok) → done', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_tick_end', { status: 'ok' }), T0 + 500],
    ]);
    expect(s.activity).toBe('done');
    expect(s.errorText).toBeUndefined();
  });
});

describe('DONE_HOLDOFF: late stragglers never restart a finished agent', () => {
  const done = run([
    [ev('agent_tick_start'), T0],
    [ev('agent_tick_end'), T0 + 500],
  ]);

  it('tool_call_end inside the holdoff stays done', () => {
    const s = run([[ev('tool_call_end', { agent: 'a1' }), T0 + 500 + DONE_HOLDOFF_MS - 1]], done);
    expect(s.activity).toBe('done');
  });

  it('progress events beyond the holdoff still do not restart — only tick_start does', () => {
    const s = run([[ev('inference_start', { agent: 'a1' }), T0 + 500 + DONE_HOLDOFF_MS + 5000]], done);
    expect(s.activity).toBe('done');
  });

  it('tick_start restarts from done at any time', () => {
    const s = run([[ev('agent_tick_start'), T0 + 100_000]], done);
    expect(s.activity).toBe('working');
    expect(s.flags.newTurn).toBe(true);
  });
});

describe('stale-working sweep', () => {
  it('working with no events past STALE_WORKING_MS → blocked/interrupted', () => {
    const working = run([[ev('agent_tick_start'), T0]]);
    const s = run([[{ kind: 'sweep' }, T0 + STALE_WORKING_MS + 1]], working);
    expect(s.activity).toBe('blocked');
    expect(s.flags.interrupted).toBe(true);
    expect(s.errorText).toMatch(/no activity/i);
  });

  it('a running snapshot resets the staleness clock', () => {
    const working = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'snapshot', status: 'running' }, T0 + STALE_WORKING_MS - 1000],
    ]);
    const s = run([[{ kind: 'sweep' }, T0 + STALE_WORKING_MS + 1]], working);
    expect(s.activity).toBe('working');
  });

  it('sweep leaves non-working states alone', () => {
    const done = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_tick_end'), T0 + 10],
    ]);
    const s = run([[{ kind: 'sweep' }, T0 + STALE_WORKING_MS * 2]], done);
    expect(s.activity).toBe('done');
  });
});

describe('waiting survives turn end', () => {
  it('pending approval + tick_end → still waiting', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'approvals', pending: 1 }, T0 + 100],
      [ev('agent_tick_end'), T0 + 200],
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
  });

  it('escalate error → waiting with awaitingInput and errorText', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_tick_error', { error_type: 'escalate', error: 'needs human' }), T0 + 100],
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
    expect(s.errorText).toBe('needs human');
  });

  it('approval resolution + progress event resumes working', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'approvals', pending: 1 }, T0 + 100],
      [{ kind: 'approvals', pending: 0 }, T0 + 200],
      [ev('tool_call_start', { agent: 'a1' }), T0 + 300],
    ]);
    expect(s.activity).toBe('working');
    expect(s.flags.awaitingInput).toBe(false);
  });

  it('progress events do not clear a pending approval', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'approvals', pending: 1 }, T0 + 100],
      [ev('inference_start', { agent: 'a1' }), T0 + 200],
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
  });

  it('approval_requested → waiting with awaitingInput and no errorText', () => {
    const s = run([
      [ev('agent_tick_start', { agent_id: 'a1' }), T0],
      [ev('approval_requested', { agent_id: 'a1', action_id: 'x1', tier: 'medium' }), T0 + 100],
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
    expect(s.errorText).toBeUndefined();
  });

  it('approval_requested + tick_end → still waiting', () => {
    const s = run([
      [ev('agent_tick_start', { agent_id: 'a1' }), T0],
      [ev('approval_requested', { agent_id: 'a1', action_id: 'x1' }), T0 + 100],
      [ev('agent_tick_end', { agent_id: 'a1', status: 'ok' }), T0 + 200],
    ]);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
  });
});

describe('failure states never stick on working', () => {
  it('fatal tick_error → blocked with errorText', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_tick_error', { error_type: 'fatal', error: 'boom' }), T0 + 100],
    ]);
    expect(s.activity).toBe('blocked');
    expect(s.errorText).toBe('boom');
  });

  it('budget_exceeded and stall_detected → blocked', () => {
    expect(
      run([
        [ev('agent_tick_start'), T0],
        [ev('agent_budget_exceeded', { total_cost: 5 }), T0 + 100],
      ]).activity,
    ).toBe('blocked');
    const stalled = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_stall_detected'), T0 + 100],
    ]);
    expect(stalled.activity).toBe('blocked');
    expect(stalled.flags.interrupted).toBe(true);
  });

  it('snapshot error/stalled/budget_exceeded → blocked; blocked ignores progress events', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'snapshot', status: 'error' }, T0 + 100],
      [ev('tool_call_start', { agent: 'a1' }), T0 + 200],
    ]);
    expect(s.activity).toBe('blocked');
  });

  it('blocked recovers via tick_start', () => {
    const s = run([
      [ev('agent_tick_start'), T0],
      [ev('agent_tick_error', { error_type: 'fatal', error: 'boom' }), T0 + 100],
      [ev('agent_tick_start'), T0 + 200],
    ]);
    expect(s.activity).toBe('working');
    expect(s.errorText).toBeUndefined();
  });
});

describe('idle snapshot is rescue-only', () => {
  it('settles a quiet working agent to done', () => {
    const working = run([[ev('agent_tick_start'), T0]]);
    const s = run([[{ kind: 'snapshot', status: 'idle' }, T0 + DONE_HOLDOFF_MS + 1000]], working);
    expect(s.activity).toBe('done');
  });

  it('does not override fresh working activity', () => {
    const working = run([
      [ev('agent_tick_start'), T0],
      [ev('tool_call_start', { agent: 'a1' }), T0 + 1000],
    ]);
    const s = run([[{ kind: 'snapshot', status: 'idle' }, T0 + 1500]], working);
    expect(s.activity).toBe('working');
  });

  it('never clears a pending approval', () => {
    const waiting = run([
      [ev('agent_tick_start'), T0],
      [{ kind: 'approvals', pending: 1 }, T0 + 100],
    ]);
    const s = run([[{ kind: 'snapshot', status: 'idle' }, T0 + 60_000]], waiting);
    expect(s.activity).toBe('waiting');
    expect(s.flags.awaitingInput).toBe(true);
  });
});
