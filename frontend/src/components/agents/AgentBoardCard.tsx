import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { useAgentStatusStore } from '../../lib/agent-status-store';
import { BOARD_COLUMNS, type BoardColumnId } from '../../lib/session-board';
import type { AgentActivity } from '../../lib/agent-status';
import type { ManagedAgent } from '../../lib/api';

const ACTIVITY_STYLE: Record<AgentActivity, { label: string; color: string }> = {
  working: { label: 'Working', color: 'var(--color-accent)' },
  waiting: { label: 'Needs You', color: 'var(--color-warning)' },
  blocked: { label: 'Blocked', color: 'var(--color-error)' },
  done: { label: 'Idle', color: 'var(--color-text-tertiary)' },
};

/**
 * Fallback for agents the status machine hasn't seen yet (first paint, before
 * the snapshot poll lands). The live store always wins once it has an entry.
 */
export function activityFromManagedStatus(status: ManagedAgent['status']): AgentActivity {
  switch (status) {
    case 'running':
      return 'working';
    case 'needs_attention':
      return 'waiting';
    case 'error':
    case 'stalled':
    case 'budget_exceeded':
      return 'blocked';
    default:
      return 'done';
  }
}

/** m:ss, capped presentation-wise by the caller (states rarely run for hours). */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function PinMenu({ pinned, onPin }: { pinned: BoardColumnId | null; onPin: (column: BoardColumnId | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded cursor-pointer"
        style={{ color: 'var(--color-text-tertiary)' }}
        title="Card placement"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-6 z-20 rounded-lg py-1 min-w-[150px]"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div className="hud-label px-3 py-1" style={{ fontSize: '9px' }}>
            Pin to column
          </div>
          {BOARD_COLUMNS.map((column) => (
            <button
              key={column.id}
              onClick={(e) => {
                e.stopPropagation();
                onPin(column.id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs cursor-pointer"
              style={{ color: pinned === column.id ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
            >
              {column.title}
            </button>
          ))}
          <div className="my-1" style={{ borderTop: '1px solid var(--color-border)' }} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin(null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs cursor-pointer"
            style={{ color: pinned === null ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            Auto (release pin)
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One agent on the session board. The pill is driven by the status machine —
 * `agent.status` is only a fallback for agents the store hasn't observed yet.
 */
export function AgentBoardCard({
  agent,
  pinned = null,
  onClick,
  onPin,
}: {
  agent: ManagedAgent;
  pinned?: BoardColumnId | null;
  onClick: () => void;
  onPin: (column: BoardColumnId | null) => void;
}) {
  const status = useAgentStatusStore((s) => s.statuses[agent.id]);
  const activity = status?.activity ?? activityFromManagedStatus(agent.status);
  const style = ACTIVITY_STYLE[activity];

  const enteredAt = status?.enteredAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (enteredAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enteredAt]);

  const detail = status?.errorText ?? agent.current_activity;

  return (
    <div onClick={onClick} className="hud-panel p-3 cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
          {agent.name}
        </span>
        <PinMenu pinned={pinned} onPin={onPin} />
      </div>

      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: style.color }}>
        <span className="hud-glow-dot" />
        <span className="hud-mono uppercase" style={{ fontSize: '9px', letterSpacing: '0.12em' }}>
          {style.label}
        </span>
      </div>

      {detail && (
        <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          {detail}
        </p>
      )}

      <div className="flex items-center justify-between" style={{ color: 'var(--color-text-tertiary)' }}>
        <span className="hud-mono" style={{ fontSize: '10px' }}>
          {enteredAt === undefined ? '—' : formatElapsed(now - enteredAt)}
        </span>
        {agent.total_cost != null && (
          <span className="hud-mono" style={{ fontSize: '10px' }}>
            ${agent.total_cost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}
