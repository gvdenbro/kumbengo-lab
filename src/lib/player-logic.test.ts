import { describe, it, expect } from 'vitest';
import { getTotalDuration, getMidiNotes, computeOnsets } from './player-logic';

describe('getTotalDuration', () => {
  it('returns 0 for empty steps', () => {
    expect(getTotalDuration([])).toBe(0);
  });

  it('returns sum of d values at 100% speed', () => {
    expect(getTotalDuration([{ d: 0.5, string: 'L1' }, { d: 1.5, string: 'R2' }])).toBe(2);
  });

  it('scales with speed percent', () => {
    expect(getTotalDuration([{ d: 1, string: 'L1' }], 50)).toBe(2);
    expect(getTotalDuration([{ d: 1, string: 'L1' }], 200)).toBe(0.5);
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
  it('computes cumulative onset times at 100% speed', () => {
    const steps = [{ d: 0.34, string: 'L1' }, { d: 0.17, string: 'R2' }, { d: 0.45, string: 'L1' }];
    const onsets = computeOnsets(steps, 100);
    expect(onsets[0]).toBeCloseTo(0);
    expect(onsets[1]).toBeCloseTo(0.34);
    expect(onsets[2]).toBeCloseTo(0.51);
  });

  it('scales with speed percent', () => {
    const steps = [{ d: 1, string: 'L1' }, { d: 1, string: 'R2' }];
    const onsets = computeOnsets(steps, 50);
    expect(onsets[0]).toBeCloseTo(0);
    expect(onsets[1]).toBeCloseTo(2.0); // 1 second at half speed = 2 seconds
  });

  it('at 150% speed durations are compressed', () => {
    const steps = [{ d: 1, string: 'L1' }, { d: 1, string: 'R2' }];
    const onsets = computeOnsets(steps, 150);
    expect(onsets[1]).toBeCloseTo(0.667, 2);
  });

  it('returns empty for empty steps', () => {
    expect(computeOnsets([], 100)).toEqual([]);
  });
});
