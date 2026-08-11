import { afterEach, describe, expect, it } from 'vitest';

import { currentAnalyser, readRms, registerAnalyser, unregisterAnalyser } from './audio-reactive';

/**
 * AnalyserNode does not exist under node, and the only surface readRms touches
 * is fftSize plus the fill call — so a plain object is a complete stand-in.
 */
function stubAnalyser(fftSize: number, sample: (i: number) => number): AnalyserNode {
  return {
    fftSize,
    getByteTimeDomainData(array: Uint8Array) {
      for (let i = 0; i < array.length; i++) array[i] = sample(i);
    },
  } as unknown as AnalyserNode;
}

afterEach(() => {
  const analyser = currentAnalyser();
  if (analyser) unregisterAnalyser(analyser);
});

describe('readRms', () => {
  it('returns null with no source registered', () => {
    expect(readRms(null)).toBeNull();
  });

  it('reads silence as zero', () => {
    registerAnalyser(stubAnalyser(512, () => 128));
    expect(readRms(null)?.rms).toBe(0);
  });

  it('scales a quarter-amplitude signal by the gain', () => {
    // 32/128 = 0.25 amplitude on every sample, so RMS is 0.25 before gain.
    registerAnalyser(stubAnalyser(512, () => 160));
    expect(readRms(null)?.rms).toBeCloseTo(0.625, 5);
  });

  it('clamps a full-scale signal to 1', () => {
    registerAnalyser(stubAnalyser(512, (i) => (i % 2 === 0 ? 0 : 255)));
    expect(readRms(null)?.rms).toBe(1);
  });

  it('reuses the scratch buffer when it matches the window, reallocating when it does not', () => {
    registerAnalyser(stubAnalyser(512, () => 128));
    const first = readRms(null)?.scratch;
    expect(first).toHaveLength(512);
    expect(readRms(first ?? null)?.scratch).toBe(first);

    registerAnalyser(stubAnalyser(1024, () => 128));
    const resized = readRms(first ?? null)?.scratch;
    expect(resized).not.toBe(first);
    expect(resized).toHaveLength(1024);
  });

  it('survives an analyser that throws', () => {
    registerAnalyser({
      fftSize: 512,
      getByteTimeDomainData() {
        throw new Error('context closed');
      },
    } as unknown as AnalyserNode);
    expect(readRms(null)).toBeNull();
  });
});

describe('analyser registry', () => {
  it('hands over to the newest source', () => {
    const mic = stubAnalyser(512, () => 128);
    const playback = stubAnalyser(512, () => 128);
    registerAnalyser(playback);
    registerAnalyser(mic);
    expect(currentAnalyser()).toBe(mic);
  });

  it('ignores a stale unregister so a late teardown cannot unhook the live source', () => {
    const mic = stubAnalyser(512, () => 128);
    const playback = stubAnalyser(512, () => 128);
    registerAnalyser(playback);
    registerAnalyser(mic);

    unregisterAnalyser(playback);
    expect(currentAnalyser()).toBe(mic);

    unregisterAnalyser(mic);
    expect(currentAnalyser()).toBeNull();
  });
});
