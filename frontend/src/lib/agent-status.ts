// Pure agent-status state machine. Normalizes the mixed event vocabulary from
// /v1/agents/events (WS), ManagedAgent snapshots (REST poll), and the approvals
// queue into one activity model the UI can trust.
//
// No React, no DOM, no store imports — unit-tested in isolation.

export type AgentActivity = 'working' | 'waiting' | 'blocked' | 'done';

export type ManagedAgentStatusValue =
  | 'idle'
  | 'running'
  | 'paused'
  | 'error'
  | 'archived'
  | 'needs_attention'
  | 'budget_exceeded'
  | 'stalled';

export interface AgentStatusFlags {
  /** Set on tick start, cleared by the first tool/inference event of the turn. */
  newTurn: boolean;
  /** The run ended abnormally (stale sweep, stall) rather than by finishing. */
  interrupted: boolean;
  /** A human must act (pending approval, escalation, needs_attention). */
  awaitingInput: boolean;
}

export interface AgentStatus {
  activity: AgentActivity;
  flags: AgentStatusFlags;
  /** Last time any event or live snapshot refreshed this agent (staleness clock). */
  lastEventAt: number;
  /** When the current activity value was entered. */
  enteredAt: number;
  errorText?: string;
}

export interface AgentEventLike {
  type: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export type StatusInput =
  | { kind: 'event'; event: AgentEventLike }
  | { kind: 'snapshot'; status: ManagedAgentStatusValue }
  | { kind: 'approvals'; pending: number }
  | { kind: 'sweep' };

/**
 * Tick events carry `agent_id`; tool/inference events carry `agent`; inference
 * events from plain (non-agent) chat carry neither and MUST be ignored — the
 * global feed is shared with ordinary chat traffic.
 */
export function agentIdOf(event: AgentEventLike): string | null {
  const data = event.data ?? {};
  const id = (data['agent_id'] ?? data['agent']) as unknown;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Events arriving up to this long after a tick ends are treated as stragglers
 * from the finished turn (the backend emits hook events concurrently, so a
 * late tool_call_end can land after agent_tick_end). They never restart a
 * "done" agent — only agent_tick_start does.
 */
export const DONE_HOLDOFF_MS = 3000;

/** A "working" agent with no events for this long is presumed crashed. */
export const STALE_WORKING_MS = 120_000;

const PROGRESS_EVENTS = new Set([
  'tool_call_start',
  'tool_call_end',
  'inference_start',
  'inference_end',
  'agent_message_received',
  'agent_checkpoint_saved',
]);

export function initialAgentStatus(now: number): AgentStatus {
  return {
    activity: 'done',
    flags: { newTurn: false, interrupted: false, awaitingInput: false },
    lastEventAt: now,
    enteredAt: now,
  };
}

function enter(
  prev: AgentStatus,
  activity: AgentActivity,
  now: number,
  patch?: Partial<Pick<AgentStatus, 'errorText'>> & { flags?: Partial<AgentStatusFlags> },
): AgentStatus {
  return {
    activity,
    flags: { ...prev.flags, ...patch?.flags },
    lastEventAt: now,
    enteredAt: activity === prev.activity ? prev.enteredAt : now,
    errorText: patch && 'errorText' in patch ? patch.errorText : activity === 'blocked' ? prev.errorText : undefined,
  };
}

export function reduceAgentStatus(prev: AgentStatus, input: StatusInput, now: number): AgentStatus {
  switch (input.kind) {
    case 'event':
      return reduceEvent(prev, input.event, now);
    case 'snapshot':
      return reduceSnapshot(prev, input.status, now);
    case 'approvals':
      return reduceApprovals(prev, input.pending, now);
    case 'sweep':
      return reduceSweep(prev, now);
  }
}

function reduceEvent(prev: AgentStatus, event: AgentEventLike, now: number): AgentStatus {
  const type = event.type;

  if (type === 'agent_tick_start') {
    // The one signal that always restarts work, from any state.
    return enter(prev, 'working', now, {
      flags: { newTurn: true, interrupted: false, awaitingInput: prev.flags.awaitingInput },
      errorText: undefined,
    });
  }

  if (type === 'agent_tick_end') {
    // A pending human request survives the turn ending (e.g. the turn ended
    // *because* the agent asked for input/approval).
    if (prev.flags.awaitingInput) {
      return enter(prev, 'waiting', now, { flags: { newTurn: false } });
    }
    return enter(prev, 'done', now, { flags: { newTurn: false, interrupted: false }, errorText: undefined });
  }

  if (type === 'agent_tick_error') {
    const data = event.data ?? {};
    const errorType = typeof data['error_type'] === 'string' ? (data['error_type'] as string) : '';
    const message = typeof data['error'] === 'string' ? (data['error'] as string) : 'agent error';
    if (errorType === 'escalate') {
      // The agent is asking a human to intervene — that's "needs you", not a crash.
      return enter(prev, 'waiting', now, { flags: { newTurn: false, awaitingInput: true }, errorText: message });
    }
    return enter(prev, 'blocked', now, { flags: { newTurn: false }, errorText: message });
  }

  if (type === 'agent_budget_exceeded') {
    return enter(prev, 'blocked', now, { flags: { newTurn: false }, errorText: 'Budget exceeded' });
  }

  if (type === 'approval_requested') {
    // The agent queued an action a human must decide on. Same "needs you"
    // state as an escalation, but nothing failed — no error text.
    return enter(prev, 'waiting', now, {
      flags: { newTurn: false, awaitingInput: true },
      errorText: undefined,
    });
  }

  if (type === 'agent_stall_detected') {
    return enter(prev, 'blocked', now, {
      flags: { newTurn: false, interrupted: true },
      errorText: 'Stalled: no activity detected',
    });
  }

  if (PROGRESS_EVENTS.has(type)) {
    // Straggler guard: a finished agent is only restarted by tick_start.
    if (prev.activity === 'done') {
      if (now - prev.enteredAt < DONE_HOLDOFF_MS) {
        // Expected late hook from the turn that just closed — refresh nothing.
        return prev;
      }
      return prev;
    }
    if (prev.activity === 'blocked') {
      return prev;
    }
    if (prev.activity === 'waiting' && !prev.flags.awaitingInput) {
      // Approval was resolved and the run kept going.
      return enter(prev, 'working', now, { flags: { newTurn: false } });
    }
    if (prev.activity === 'waiting') {
      // Still needs the human; progress events don't clear that.
      return { ...prev, lastEventAt: now };
    }
    // working
    return { ...prev, lastEventAt: now, flags: { ...prev.flags, newTurn: false } };
  }

  // Unknown event type: refresh the staleness clock only.
  return { ...prev, lastEventAt: now };
}

function reduceSnapshot(prev: AgentStatus, status: ManagedAgentStatusValue, now: number): AgentStatus {
  switch (status) {
    case 'running':
      // The poll only confirms liveness; WS events carry the fine detail.
      if (prev.activity === 'working' || prev.activity === 'waiting') {
        return { ...prev, lastEventAt: now };
      }
      return enter(prev, 'working', now, { flags: { interrupted: false } });
    case 'needs_attention':
      return enter(prev, 'waiting', now, { flags: { awaitingInput: true } });
    case 'paused':
      return enter(prev, 'waiting', now, { flags: { awaitingInput: false } });
    case 'error':
      return enter(prev, 'blocked', now, { errorText: prev.errorText ?? 'Agent errored' });
    case 'stalled':
      return enter(prev, 'blocked', now, {
        flags: { interrupted: true },
        errorText: prev.errorText ?? 'Stalled: no activity detected',
      });
    case 'budget_exceeded':
      return enter(prev, 'blocked', now, { errorText: prev.errorText ?? 'Budget exceeded' });
    case 'idle':
      // Rescue signal only: it may settle a working agent whose stream went
      // quiet, but it must never clear a pending human request.
      if (prev.flags.awaitingInput) {
        return { ...prev, lastEventAt: now };
      }
      if (prev.activity === 'working' && now - prev.lastEventAt < DONE_HOLDOFF_MS) {
        // Fresh WS activity outranks a possibly-stale poll.
        return prev;
      }
      return enter(prev, 'done', now, { flags: { interrupted: false }, errorText: undefined });
    case 'archived':
      return enter(prev, 'done', now, { errorText: undefined });
  }
}

function reduceApprovals(prev: AgentStatus, pending: number, now: number): AgentStatus {
  if (pending > 0) {
    return enter(prev, 'waiting', now, { flags: { awaitingInput: true } });
  }
  if (!prev.flags.awaitingInput) {
    return prev;
  }
  // Approval resolved. Stay in waiting until the run proves it moved on
  // (progress event or snapshot); just drop the needs-you flag.
  return { ...prev, flags: { ...prev.flags, awaitingInput: false } };
}

function reduceSweep(prev: AgentStatus, now: number): AgentStatus {
  if (prev.activity === 'working' && now - prev.lastEventAt > STALE_WORKING_MS) {
    return {
      ...prev,
      activity: 'blocked',
      enteredAt: now,
      flags: { ...prev.flags, interrupted: true },
      errorText: 'No activity for 2 minutes — the run may have crashed',
    };
  }
  return prev;
}
