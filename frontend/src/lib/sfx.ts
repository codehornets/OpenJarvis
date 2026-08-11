// Sci-fi UI sound synth — Web Audio oscillators only, no asset files.
// Every cue is <300ms and very quiet (master gain 0.12); a Settings toggle
// (settings.sfxEnabled) silences everything. Deliberately NO hover sounds.

import { useAppStore } from './store';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed: Record<string, number> = {};

function ensureContext(): { ctx: AudioContext; master: GainNode } | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      // Fire-and-forget: succeeds once the user has interacted with the page.
      void ctx.resume();
    }
    return master ? { ctx, master } : null;
  } catch {
    return null;
  }
}

/** Call once from a real user gesture (e.g. app-level pointerdown) so the
 * AudioContext is unlocked before the first programmatic cue fires. */
export function unlockAudio(): void {
  ensureContext();
}

function enabled(name: string): boolean {
  if (!useAppStore.getState().settings.sfxEnabled) return false;
  const now = performance.now();
  if (lastPlayed[name] != null && now - lastPlayed[name] < 80) return false;
  lastPlayed[name] = now;
  return true;
}

function tone(
  freq: number,
  type: OscillatorType,
  durationMs: number,
  volume = 1,
  delayMs = 0,
  freqEnd?: number,
): void {
  const audio = ensureContext();
  if (!audio) return;
  try {
    const t0 = audio.ctx.currentTime + delayMs / 1000;
    const t1 = t0 + durationMs / 1000;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, t1);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t1 + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // never let a sound effect break the app
  }
}

export const sfx = {
  /** Message sent / palette opened — bright double blip. */
  select(): void {
    if (!enabled('select')) return;
    tone(1200, 'sine', 60, 0.9);
    tone(2000, 'sine', 50, 0.5, 50);
  },
  /** Power-up sweep — boot finish, connection established. */
  engage(): void {
    if (!enabled('engage')) return;
    tone(200, 'sawtooth', 250, 0.5, 0, 600);
  },
  /** Two descending saws — request failed, stream errored. */
  error(): void {
    if (!enabled('error')) return;
    tone(400, 'sawtooth', 180, 0.5, 0, 200);
    tone(300, 'sawtooth', 200, 0.4, 90, 150);
  },
  /** Rising 8-bit arpeggio — long-running work finished. */
  done(): void {
    if (!enabled('done')) return;
    tone(523, 'square', 70, 0.35);
    tone(659, 'square', 70, 0.35, 75);
    tone(784, 'square', 110, 0.35, 150);
  },
  /** Clipped glitch bleeps — an agent needs the human. Distinct from done(). */
  needsYou(): void {
    if (!enabled('needsYou')) return;
    tone(880, 'square', 40, 0.45, 0, 830);
    tone(880, 'square', 60, 0.45, 110, 990);
  },
  /** Mic armed / released — short chirps mirroring direction. */
  micOn(): void {
    if (!enabled('micOn')) return;
    tone(500, 'sine', 120, 0.6, 0, 900);
  },
  micOff(): void {
    if (!enabled('micOff')) return;
    tone(900, 'sine', 120, 0.5, 0, 450);
  },
};
