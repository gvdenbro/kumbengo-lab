import { describe, it, expect } from 'vitest';
import { getTotalBeats, getCps, getPlaybackDurationMs, buildSlotMap, getMidiNotes } from './player-logic';

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

describe('buildSlotMap', () => {
  it('maps steps to half-beat slots', () => {
    const steps = [
      { d: 0.5, string: 'L1' },
      { d: 0.5, string: 'R2' },
      { d: 1, strings: ['L1', 'L5'] },
    ];
    const { slots, slotMap } = buildSlotMap(steps);
    expect(slots).toBe(4); // totalBeats=2, resolution=0.5 -> 4 slots
    expect(slotMap.get(0)).toEqual({ index: 0, strings: ['L1'] });
    expect(slotMap.get(1)).toEqual({ index: 1, strings: ['R2'] });
    expect(slotMap.get(2)).toEqual({ index: 2, strings: ['L1', 'L5'] });
    expect(slotMap.has(3)).toBe(false);
  });

  it('skips rest steps but advances time', () => {
    const steps = [
      { d: 0.5, string: 'L1' },
      { d: 1 },                      // rest - no string
      { d: 0.5, string: 'R2' },
    ];
    const { slots, slotMap } = buildSlotMap(steps);
    expect(slots).toBe(4); // 0.5 + 1 + 0.5 = 2 beats -> 4 slots
    expect(slotMap.get(0)).toEqual({ index: 0, strings: ['L1'] });
    expect(slotMap.has(1)).toBe(false); // slot 1 = beat 0.5 (rest)
    expect(slotMap.has(2)).toBe(false); // slot 2 = beat 1.0 (rest continues)
    expect(slotMap.get(3)).toEqual({ index: 2, strings: ['R2'] });
  });

  it('returns empty map for empty steps', () => {
    const { slots, slotMap } = buildSlotMap([]);
    expect(slots).toBe(0);
    expect(slotMap.size).toBe(0);
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
