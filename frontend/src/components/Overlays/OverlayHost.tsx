/**
 * Overlay host — mounted once in App, next to the toaster.
 *
 * Owns the corner slot (above the composer, never over it) and the
 * auto-trigger rules: a deep-research run raises the research HUD, a
 * tool-calling run raises the agent console, and the end of a run lets the
 * last frame linger for a beat before retiring it. Overlays opened by hand
 * from the command palette are pinned and sit out all of that.
 */

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { useAppStore } from '../../lib/store';
import { useOverlayStore, type OverlayKind } from '../../lib/overlay-bus';
import { ResearchHUD } from './ResearchHUD';
import { AgentConsole } from './AgentConsole';

/** How long the finished HUD stays up after a run ends. */
const LINGER_MS = 1200;

export function OverlayHost() {
  const active = useOverlayStore((s) => s.active);
  const show = useOverlayStore((s) => s.show);
  const dismiss = useOverlayStore((s) => s.dismiss);

  const deepResearch = useAppStore((s) => s.deepResearch);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const toolCount = useAppStore((s) => s.streamState.activeToolCalls.length);

  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDesired = useRef<OverlayKind | null>(null);

  // Auto-trigger. Acting only on *changes* to the desired overlay is what
  // makes the close button stick: dismissing mid-run doesn't get undone by
  // the next tool call, since the desired overlay hasn't changed.
  useEffect(() => {
    const desired: OverlayKind | null = !isStreaming
      ? null
      : deepResearch
        ? 'research-hud'
        : toolCount > 0
          ? 'agent-console'
          : null;

    if (desired === prevDesired.current) return;
    prevDesired.current = desired;

    if (lingerRef.current) {
      clearTimeout(lingerRef.current);
      lingerRef.current = null;
    }

    // A pinned overlay was asked for by hand — leave it alone in both
    // directions.
    if (useOverlayStore.getState().pinned) return;

    if (desired) {
      show(desired);
      return;
    }

    lingerRef.current = setTimeout(() => {
      lingerRef.current = null;
      if (!useOverlayStore.getState().pinned) dismiss();
    }, LINGER_MS);
  }, [deepResearch, isStreaming, toolCount, show, dismiss]);

  useEffect(
    () => () => {
      if (lingerRef.current) clearTimeout(lingerRef.current);
    },
    [],
  );

  // Escape retires the overlay — only bound while one is up, so it doesn't
  // shadow Escape anywhere else.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, dismiss]);

  return (
    <div className="fixed bottom-24 right-4 z-40 w-[320px] max-w-[90vw] pointer-events-none">
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="pointer-events-auto"
          >
            {active === 'research-hud' ? <ResearchHUD /> : <AgentConsole />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
