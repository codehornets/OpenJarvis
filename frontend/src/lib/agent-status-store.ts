// Live agent-status store: the single place where WS events, REST snapshots,
// approval counts, and the staleness sweep meet the pure reducer.
// Kept separate from store.ts deliberately — it's high-churn state with no
// persistence, and the main store is already 600 lines.

import { create } from 'zustand';

import {
  agentIdOf,
  initialAgentStatus,
  reduceAgentStatus,
  type AgentEventLike,
  type AgentStatus,
  type ManagedAgentStatusValue,
  type StatusInput,
} from './agent-status';

interface AgentStatusState {
  statuses: Record<string, AgentStatus>;
  /** Approvals that could not be attributed to a specific agent. */
  globalPendingApprovals: number;
  applyEvent: (event: AgentEventLike) => void;
  applySnapshot: (agentId: string, status: ManagedAgentStatusValue) => void;
  applyApprovals: (pendingByAgent: Record<string, number>, unattributed: number) => void;
  sweep: () => void;
}

function applyInput(
  statuses: Record<string, AgentStatus>,
  agentId: string,
  input: StatusInput,
  now: number,
): Record<string, AgentStatus> {
  const prev = statuses[agentId] ?? initialAgentStatus(now);
  const next = reduceAgentStatus(prev, input, now);
  if (next === prev) return statuses;
  return { ...statuses, [agentId]: next };
}

export const useAgentStatusStore = create<AgentStatusState>((set) => ({
  statuses: {},
  globalPendingApprovals: 0,

  applyEvent: (event) => {
    const agentId = agentIdOf(event);
    if (!agentId) return; // plain-chat inference noise — not an agent
    const now = Date.now();
    set((s) => {
      const statuses = applyInput(s.statuses, agentId, { kind: 'event', event }, now);
      return statuses === s.statuses ? s : { statuses };
    });
  },

  applySnapshot: (agentId, status) => {
    const now = Date.now();
    set((s) => {
      const statuses = applyInput(s.statuses, agentId, { kind: 'snapshot', status }, now);
      return statuses === s.statuses ? s : { statuses };
    });
  },

  applyApprovals: (pendingByAgent, unattributed) => {
    const now = Date.now();
    set((s) => {
      let statuses = s.statuses;
      // Every known agent gets its count (0 clears a stale awaitingInput).
      for (const agentId of Object.keys(statuses)) {
        statuses = applyInput(
          statuses,
          agentId,
          { kind: 'approvals', pending: pendingByAgent[agentId] ?? 0 },
          now,
        );
      }
      // Agents we only know through approvals still surface as waiting.
      for (const [agentId, pending] of Object.entries(pendingByAgent)) {
        if (!(agentId in statuses) && pending > 0) {
          statuses = applyInput(statuses, agentId, { kind: 'approvals', pending }, now);
        }
      }
      if (statuses === s.statuses && unattributed === s.globalPendingApprovals) return s;
      return { statuses, globalPendingApprovals: unattributed };
    });
  },

  sweep: () => {
    const now = Date.now();
    set((s) => {
      let statuses = s.statuses;
      for (const agentId of Object.keys(statuses)) {
        statuses = applyInput(statuses, agentId, { kind: 'sweep' }, now);
      }
      return statuses === s.statuses ? s : { statuses };
    });
  },
}));
