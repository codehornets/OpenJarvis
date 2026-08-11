/**
 * Corner-overlay bus.
 *
 * The cinematic HUDs (research, agent console) are event-driven widgets, not
 * routed panels: something happens in a run and the matching overlay flies in
 * at the bottom-right, then retires itself when the run is over. Only one can
 * be on screen at a time — last writer wins — so this store is deliberately
 * tiny: which one, and whether the user asked for it by hand.
 */

import { create } from 'zustand';

export type OverlayKind = 'research-hud' | 'agent-console';

interface OverlayState {
  active: OverlayKind | null;
  /** Opened manually (command palette) — auto-dismiss leaves it alone. */
  pinned: boolean;
  show: (kind: OverlayKind, opts?: { pinned?: boolean }) => void;
  dismiss: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  active: null,
  pinned: false,
  show: (kind, opts) => set({ active: kind, pinned: opts?.pinned ?? false }),
  dismiss: () => set({ active: null, pinned: false }),
}));

/**
 * Run clock as m:ss. Shared by both overlays so their headers tick in the
 * same voice.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
