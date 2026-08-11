/**
 * Agent console corner overlay.
 *
 * Tool-calling runs are the noisy ones: this is the live tail — run clock,
 * tool counts, and the last few log lines scrolling past like a terminal.
 */

import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';

import { OrbDot } from '../Orb/OrbDot';
import { useAppStore } from '../../lib/store';
import { formatElapsed, useOverlayStore } from '../../lib/overlay-bus';

const MAX_LINES = 8;

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="hud-mono text-sm truncate" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="hud-label truncate">{label}</div>
    </div>
  );
}

export function AgentConsole() {
  const dismiss = useOverlayStore((s) => s.dismiss);
  const elapsedMs = useAppStore((s) => s.streamState.elapsedMs);
  const activeToolCalls = useAppStore((s) => s.streamState.activeToolCalls);
  const logEntries = useAppStore((s) => s.logEntries);

  const running = useMemo(() => {
    for (let i = activeToolCalls.length - 1; i >= 0; i--) {
      if (activeToolCalls[i].status === 'running') return activeToolCalls[i].tool;
    }
    return '—';
  }, [activeToolCalls]);

  const lines = useMemo(
    () =>
      logEntries
        .filter((e) => e.category === 'tool' || e.category === 'chat')
        .slice(-MAX_LINES),
    [logEntries],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="hud-panel p-3">
      <div className="flex items-center gap-2">
        <OrbDot speaking size={16} />
        <span className="hud-label flex-1" style={{ color: 'var(--color-accent)' }}>
          Agent Console
        </span>
        <span
          className="hud-mono text-[11px]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {formatElapsed(elapsedMs)}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="p-0.5 rounded cursor-pointer"
          style={{ color: 'var(--color-text-tertiary)', background: 'transparent', border: 'none' }}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      <div className="mt-2 flex items-start gap-3">
        <Tile value={formatElapsed(elapsedMs)} label="Elapsed" />
        <Tile value={String(activeToolCalls.length)} label="Tools" />
        <Tile value={running} label="Running" />
      </div>

      <div
        ref={scrollRef}
        className="mt-3 max-h-40 overflow-y-auto flex flex-col gap-0.5"
      >
        {lines.length === 0 ? (
          <div className="hud-label">Awaiting activity</div>
        ) : (
          lines.map((entry, i) => {
            const latest = i === lines.length - 1;
            return (
              <motion.div
                key={`${entry.timestamp}-${entry.category}-${entry.message}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className={`hud-mono text-[10px] leading-relaxed truncate ${latest ? 'animate-pulse' : ''}`}
                style={{
                  color: latest ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              >
                › {entry.message}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
