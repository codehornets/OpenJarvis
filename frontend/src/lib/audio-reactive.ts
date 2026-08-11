/**
 * The one live audio source the visuals may react to.
 *
 * Mic capture and TTS playback each build their own Web Audio graph, and the
 * orb has no business knowing about either — so producers park an AnalyserNode
 * here and the frame loop reads whatever is parked. Last writer wins: if the
 * mic opens while a digest is playing, the mic is what the user is looking at.
 *
 * Deliberately not a store/context. The consumer is a useFrame callback that
 * must not re-render anything, and this state changes a couple of times per
 * session, not per frame.
 */

/** Gain applied to raw RMS — speech rarely exceeds ~0.4 and would barely move the orb. */
const RMS_GAIN = 2.5;

let current: AnalyserNode | null = null;

export interface RmsReading {
  /** 0..1, already gained and clamped. */
  rms: number;
  /** The buffer that was filled — hand it back next call to avoid re-allocating. */
  scratch: Uint8Array;
}

/**
 * Reused between calls so a 60fps caller allocates nothing: read the fields,
 * don't retain the object.
 */
const reading: RmsReading = { rms: 0, scratch: new Uint8Array(0) };

export function registerAnalyser(analyser: AnalyserNode): void {
  current = analyser;
}

/** No-op if someone else has since taken over, so a late teardown can't unhook the live source. */
export function unregisterAnalyser(analyser: AnalyserNode): void {
  if (current === analyser) current = null;
}

export function currentAnalyser(): AnalyserNode | null {
  return current;
}

/**
 * Loudness of the live source, or null when nothing is playing — the caller
 * falls back to its synthetic envelope. Pass the previous `scratch` back in;
 * it is reused whenever it still matches the analyser's window size.
 */
export function readRms(scratch: Uint8Array | null): RmsReading | null {
  const analyser = current;
  if (!analyser) return null;

  try {
    const size = analyser.fftSize;
    const buffer = scratch && scratch.length === size ? scratch : new Uint8Array(size);
    analyser.getByteTimeDomainData(buffer);

    // Samples are unsigned bytes centred on 128; recentre to -1..1 before squaring.
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / size) * RMS_GAIN;
    reading.rms = rms > 1 ? 1 : rms;
    reading.scratch = buffer;
    return reading;
  } catch {
    // A closed context or detached node must not take the frame loop down.
    return null;
  }
}
