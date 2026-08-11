import { useEffect, useRef } from 'react';
import { getBase } from './api';

export interface AgentEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

function buildWsUrl(agentId?: string): string {
  const base = getBase();
  let origin: string;
  if (base) {
    origin = base.replace(/^http/, 'ws');
  } else {
    const loc = window.location;
    origin = `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}`;
  }
  const path = '/v1/agents/events';
  return agentId
    ? `${origin}${path}?agent_id=${encodeURIComponent(agentId)}`
    : `${origin}${path}`;
}

/**
 * Shared socket effect. `agentId` set → that agent's feed; `agentId`
 * undefined → no connection (per-agent hook) or the unfiltered global feed
 * (all-events hook), controlled by `connectWithoutId`.
 */
function useAgentEventsSocket(
  agentId: string | undefined,
  connectWithoutId: boolean,
  onEvent: (event: AgentEvent) => void,
  eventTypes?: readonly string[],
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const typesRef = useRef(eventTypes);
  typesRef.current = eventTypes;

  useEffect(() => {
    if (!agentId && !connectWithoutId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(buildWsUrl(agentId));
      } catch {
        schedule();
        return;
      }
      ws.onopen = () => {
        retry = 0;
      };
      ws.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data) as AgentEvent;
          const allowed = typesRef.current;
          if (allowed && !allowed.includes(payload.type)) return;
          onEventRef.current(payload);
        } catch {
          // ignore malformed payload
        }
      };
      ws.onclose = () => {
        if (!closed) schedule();
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    const schedule = () => {
      if (closed) return;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(retry, 5));
      retry += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [agentId, connectWithoutId]);
}

/**
 * Subscribe to one agent's events over WebSocket.
 * Auto-reconnects with backoff when the socket drops.
 */
export function useAgentEvents(
  agentId: string | undefined,
  onEvent: (event: AgentEvent) => void,
  eventTypes?: readonly string[],
): void {
  useAgentEventsSocket(agentId, false, onEvent, eventTypes);
}

/**
 * Subscribe to the unfiltered global event feed (every agent, plus chat
 * inference events that carry no agent key — callers must filter).
 */
export function useAllAgentEvents(
  onEvent: (event: AgentEvent) => void,
  eventTypes?: readonly string[],
): void {
  useAgentEventsSocket(undefined, true, onEvent, eventTypes);
}
