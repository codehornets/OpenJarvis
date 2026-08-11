/**
 * Maps app state onto the two signals the orb actually renders.
 *
 * Two separate selectors rather than one returning an object: zustand
 * compares selector results by reference, so an object literal would make the
 * orb re-render on every store write.
 */

import { useAppStore } from '../../lib/store';

export function useOrbState(): { connected: boolean; speaking: boolean } {
  const connected = useAppStore((s) => !!s.serverInfo);
  const speaking = useAppStore((s) => s.streamState.isStreaming || s.micRecording);

  return { connected, speaking };
}
