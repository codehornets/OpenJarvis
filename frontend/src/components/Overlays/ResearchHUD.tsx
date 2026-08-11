/**
 * Deep Research corner HUD.
 *
 * The mission-control readout for a research run: phase, searches, hits, run
 * clock. It augments the inline ResearchTimeline rather than replacing it —
 * the timeline is the transcript, this is the glance.
 */

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { OrbDot } from '../Orb/OrbDot';
import { useAppStore } from '../../lib/store';
import { formatElapsed, useOverlayStore } from '../../lib/overlay-bus';

export function ResearchHUD() {
  const dismiss = useOverlayStore((s) => s.dismiss);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const phase = useAppStore((s) => s.streamState.phase);
  const elapsedMs = useAppStore((s) => s.streamState.elapsedMs);
  const messages = useAppStore((s) => s.messages);

  // The live research message is the last one carrying traces — during a run
  // that is the assistant reply currently being written.
  const traces = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const t = messages[i].researchTraces;
      if (t && t.length > 0) return t;
    }
    return [];
  }, [messages]);

  const hits = traces.reduce((sum, t) => sum + (t.numHits ?? 0), 0);
  const phaseText = phase || (isStreaming ? 'Synthesizing…' : 'Run complete');

  return (
    <div className="hud-panel p-3">
      <div className="flex items-center gap-2">
        <OrbDot speaking size={16} />
        <span className="hud-label flex-1" style={{ color: 'var(--color-accent)' }}>
          Deep Research
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

      <div className="mt-2 h-4 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phaseText}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="block text-xs truncate"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {phaseText}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div>
          <div className="hud-mono text-sm" style={{ color: 'var(--color-text)' }}>
            {traces.length}
          </div>
          <div className="hud-label">Searches</div>
        </div>
        <div>
          <div className="hud-mono text-sm" style={{ color: 'var(--color-text)' }}>
            {hits}
          </div>
          <div className="hud-label">Hits</div>
        </div>
      </div>

      {/* Indeterminate while the run is live, solid emerald once it lands. */}
      <div
        className="mt-3 h-0.5 rounded-full overflow-hidden"
        style={{ background: isStreaming ? 'var(--color-border)' : 'var(--color-accent-2)' }}
      >
        {isStreaming && <div className="hud-shimmer h-full w-full" />}
      </div>
    </div>
  );
}
