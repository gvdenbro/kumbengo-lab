import { describe, it, expect } from 'vitest';
import { getTotalBeats, getCps, getPlaybackDurationMs, getMidiNotes, computeOnsets } from './player-logic';

describe('getTotalBeats', () => {
  it('returns 0 for empty steps', () => {
    expect(getTotalBeats([])).toBe(0);
  });

  it('returns sum of d values', () => {
    expect(getTotalBeats([{ d: 0.5, string: 'L1' }, { d: 4, string: 'R2' }])).toBe(4.5);
  });

  it('works with single step', () => {
    expect(getTotalBeats([{ d: 1, string: 'L1' }])).toBe(1);
  });
});

describe('getCps', () => {
  it('calculates CPS at 100% tempo', () => {
    expect(getCps(90, 100, 4)).toBeCloseTo(0.375);
  });

  it('scales with tempo percent', () => {
    expect(getCps(90, 50, 4)).toBeCloseTo(0.1875);
  });
});

describe('getPlaybackDurationMs', () => {
  it('calculates duration at 100% tempo', () => {
    expect(getPlaybackDurationMs(4, 120, 100)).toBeCloseTo(2000);
  });

  it('scales with tempo percent', () => {
    expect(getPlaybackDurationMs(4, 120, 50)).toBeCloseTo(4000);
  });
});

describe('getMidiNotes', () => {
  const tuning = { L1: { midi: 41 }, R2: { midi: 57 } };

  it('maps string IDs to MIDI notes', () => {
    expect(getMidiNotes(['L1', 'R2'], tuning)).toEqual([41, 57]);
  });

  it('falls back to 60 for unknown strings', () => {
    expect(getMidiNotes(['X1'], tuning)).toEqual([60]);
  });
});

describe('computeOnsets', () => {
  it('computes onset times in seconds at 120bpm', () => {
    const steps = [{ d: 1, string: 'L1' }, { d: 1, string: 'R2' }, { d: 1, string: 'L1' }, { d: 1, string: 'R2' }];
    const onsets = computeOnsets(steps, 120, 100);
    expect(onsets).toHaveLength(4);
    expect(onsets[0]).toBeCloseTo(0);
    expect(onsets[1]).toBeCloseTo(0.5);
    expect(onsets[2]).toBeCloseTo(1.0);
    expect(onsets[3]).toBeCloseTo(1.5);
  });

  it('scales with tempo percent', () => {
    const steps = [{ d: 1, string: 'L1' }, { d: 1, string: 'R2' }];
    const onsets = computeOnsets(steps, 60, 50);
    // 50% of 60bpm = 30bpm = 0.5 bps, so 1 beat = 2 seconds
    expect(onsets[0]).toBeCloseTo(0);
    expect(onsets[1]).toBeCloseTo(2.0);
  });

  it('handles non-grid durations', () => {
    const steps = [{ d: 0.34, string: 'L1' }, { d: 0.17, string: 'R2' }, { d: 0.45, string: 'L1' }];
    const onsets = computeOnsets(steps, 60, 100);
    // 60bpm = 1 bps, so onset = beat time in seconds
    expect(onsets[0]).toBeCloseTo(0);
    expect(onsets[1]).toBeCloseTo(0.34);
    expect(onsets[2]).toBeCloseTo(0.51);
  });

  it('returns empty for empty steps', () => {
    expect(computeOnsets([], 120, 100)).toEqual([]);
  });
});
