/**
 * Orb loudness envelope — a 0..1 scalar the scene reads every frame to drive
 * particle displacement, colour and scale.
 *
 * Real audio drives it whenever a live source is registered (see
 * lib/audio-reactive). With no source, speech is faked with two detuned sines
 * plus a little noise; the low-pass keeps it from looking like a jitter storm.
 * The step is a free function so useFrame can call it without touching React.
 */

import { useRef } from 'react';
import type { RefObject } from 'react';

/** Envelope while idle — a visible breath, not a flat line. */
const IDLE_FLOOR = 0.08;
/** Floor while a live source is registered: silence still breathes, just fainter. */
const LIVE_FLOOR = 0.05;
const SMOOTHING = 0.1;

/**
 * `rms` is the measured loudness of the live source, or null when there is
 * none. A real signal outranks `speaking` — the mic knows whether anything is
 * actually being said, and the caller's flag is only a guess about the model.
 */
export function stepEnvelopeLive(
  env: number,
  speaking: boolean,
  tSeconds: number,
  rms: number | null,
): number {
  let target = IDLE_FLOOR;

  if (rms != null) {
    target = rms < LIVE_FLOOR ? LIVE_FLOOR : rms > 1 ? 1 : rms;
  } else if (speaking) {
    target =
      0.5 +
      0.3 * Math.sin(tSeconds * 2.1) +
      0.2 * Math.sin(tSeconds * 5.7) +
      0.15 * (Math.random() - 0.5);
    if (target < 0) target = 0;
    else if (target > 1) target = 1;
  }

  return env + (target - env) * SMOOTHING;
}

export function stepEnvelope(env: number, speaking: boolean, tSeconds: number): number {
  return stepEnvelopeLive(env, speaking, tSeconds, null);
}

export function useOrbEnvelope(): RefObject<number> {
  return useRef(IDLE_FLOOR);
}
