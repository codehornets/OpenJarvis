import { useEffect, useRef } from 'react';

import { fetchManagedAgents, fetchPendingApprovals } from '../lib/api';
import { useAllAgentEvents } from '../lib/useAgentEvents';
import { useAgentStatusStore } from '../lib/agent-status-store';
import {
  initialNotifyState,
  notifyOS,
  shouldNotify,
  type NotifyState,
} from '../lib/notify';
import { sfx } from '../lib/sfx';
import type { AgentActivity } from '../lib/agent-status';

const SNAPSHOT_POLL_MS = 5000;
const APPROVALS_POLL_MS = 10_000;
const SWEEP_MS = 1000;

/**
 * Invisible singleton (mounted in Layout): funnels the global agent event
 * feed, ManagedAgent snapshots, and the approvals queue into the status
 * store, runs the staleness sweep, and fires notification cues on
 * meaningful transitions. Keeping it here means alerts work on every route,
 * not just the Agents page.
 */
export function AgentStatusHost() {
  const applyEvent = useAgentStatusStore((s) => s.applyEvent);
  const applySnapshot = useAgentStatusStore((s) => s.applySnapshot);
  const applyApprovals = useAgentStatusStore((s) => s.applyApprovals);
  const sweep = useAgentStatusStore((s) => s.sweep);

  const agentNames = useRef<Record<string, string>>({});

  useAllAgentEvents(applyEvent);

  // Mirror the REST snapshot (also names the agents for notifications).
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetchManagedAgents()
        .then((agents) => {
          if (cancelled) return;
          for (const a of agents) {
            agentNames.current[a.id] = a.name;
            applySnapshot(a.id, a.status);
          }
        })
        .catch(() => { /* offline — the sweep handles staleness */ });
    poll();
    const interval = setInterval(poll, SNAPSHOT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applySnapshot]);

  // Approvals: attribute by payload agent id when present, else global.
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetchPendingApprovals()
        .then((approvals) => {
          if (cancelled) return;
          const byAgent: Record<string, number> = {};
          let unattributed = 0;
          for (const approval of approvals) {
            const p = approval.payload ?? {};
            const agentId = (p['agent_id'] ?? p['agent']) as unknown;
            if (typeof agentId === 'string' && agentId) {
              byAgent[agentId] = (byAgent[agentId] ?? 0) + 1;
            } else {
              unattributed += 1;
            }
          }
          applyApprovals(byAgent, unattributed);
        })
        .catch(() => { /* bell surfaces connectivity separately */ });
    poll();
    const interval = setInterval(poll, APPROVALS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyApprovals]);

  // Staleness sweep.
  useEffect(() => {
    const interval = setInterval(sweep, SWEEP_MS);
    return () => clearInterval(interval);
  }, [sweep]);

  // Transition watcher → SFX + OS notifications.
  const prevActivities = useRef<Record<string, AgentActivity>>({});
  const notifyState = useRef<NotifyState>(initialNotifyState());
  const seededRef = useRef(false);

  useEffect(() => {
    const unsubscribe = useAgentStatusStore.subscribe((state) => {
      const prev = prevActivities.current;
      const focused = typeof document !== 'undefined' && document.hasFocus();

      // First emission seeds the baseline silently — no alert storm on load.
      if (!seededRef.current) {
        seededRef.current = true;
        for (const [id, status] of Object.entries(state.statuses)) {
          prev[id] = status.activity;
        }
        return;
      }

      for (const [id, status] of Object.entries(state.statuses)) {
        const before = prev[id];
        const after = status.activity;
        if (before === after) continue;
        prev[id] = after;
        if (before === undefined) continue; // newly discovered, not a transition

        const name = agentNames.current[id] ?? 'Agent';
        if (after === 'done' && before === 'working') {
          sfx.done();
          const gate = shouldNotify(notifyState.current, {
            agentId: id,
            kind: 'done',
            at: Date.now(),
            windowFocused: focused,
          });
          notifyState.current = gate.next;
          if (gate.fire) void notifyOS(`${name} finished`, 'The run completed.');
        } else if (after === 'waiting' && status.flags.awaitingInput) {
          sfx.needsYou();
          const gate = shouldNotify(notifyState.current, {
            agentId: id,
            kind: 'needsYou',
            at: Date.now(),
            windowFocused: focused,
          });
          notifyState.current = gate.next;
          if (gate.fire) void notifyOS(`${name} needs you`, status.errorText ?? 'Approval or input required.');
        }
      }
    });
    return unsubscribe;
  }, []);

  return null;
}
