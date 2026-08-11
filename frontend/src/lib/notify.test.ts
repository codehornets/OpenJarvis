import { describe, expect, it } from 'vitest';

import { NOTIFY_THROTTLE_MS, initialNotifyState, shouldNotify } from './notify';

const T0 = 50_000;

describe('shouldNotify', () => {
  it('fires when unfocused and quiet', () => {
    const { fire } = shouldNotify(initialNotifyState(), {
      agentId: 'a1',
      kind: 'done',
      at: T0,
      windowFocused: false,
    });
    expect(fire).toBe(true);
  });

  it('never fires while the window is focused, and focus does not consume the throttle', () => {
    const s0 = initialNotifyState();
    const focused = shouldNotify(s0, { agentId: 'a1', kind: 'done', at: T0, windowFocused: true });
    expect(focused.fire).toBe(false);
    // Immediately after, unfocused fires — the focused attempt burned nothing.
    const unfocused = shouldNotify(focused.next, { agentId: 'a1', kind: 'done', at: T0 + 1, windowFocused: false });
    expect(unfocused.fire).toBe(true);
  });

  it('throttles repeats of the same (agent, kind) within the window', () => {
    const s0 = initialNotifyState();
    const first = shouldNotify(s0, { agentId: 'a1', kind: 'done', at: T0, windowFocused: false });
    const repeat = shouldNotify(first.next, {
      agentId: 'a1',
      kind: 'done',
      at: T0 + NOTIFY_THROTTLE_MS - 1,
      windowFocused: false,
    });
    expect(repeat.fire).toBe(false);
    const later = shouldNotify(first.next, {
      agentId: 'a1',
      kind: 'done',
      at: T0 + NOTIFY_THROTTLE_MS,
      windowFocused: false,
    });
    expect(later.fire).toBe(true);
  });

  it('different kinds for the same agent fire independently', () => {
    const s0 = initialNotifyState();
    const done = shouldNotify(s0, { agentId: 'a1', kind: 'done', at: T0, windowFocused: false });
    const needsYou = shouldNotify(done.next, { agentId: 'a1', kind: 'needsYou', at: T0 + 100, windowFocused: false });
    expect(needsYou.fire).toBe(true);
  });

  it('different agents do not throttle each other', () => {
    const s0 = initialNotifyState();
    const a = shouldNotify(s0, { agentId: 'a1', kind: 'done', at: T0, windowFocused: false });
    const b = shouldNotify(a.next, { agentId: 'a2', kind: 'done', at: T0 + 1, windowFocused: false });
    expect(b.fire).toBe(true);
  });
});
