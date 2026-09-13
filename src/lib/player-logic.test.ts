import { describe, it, expect } from 'vitest';
import { getTotalDuration, getMidiNotes, computeOnsets, regionFromChunk, chunkSteps, lookaheadItemVisible, type Region } from './player-logic';

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

  it('throws on zero speedPercent', () => {
    expect(() => getTotalDuration([{ d: 1, string: 'L1' }], 0)).toThrow('speedPercent must be positive');
  });

  it('throws on negative speedPercent', () => {
    expect(() => getTotalDuration([{ d: 1, string: 'L1' }], -50)).toThrow('speedPercent must be positive');
  });
});

describe('getMidiNotes', () => {
  const tuning = { L1: { midi: 41 }, R2: { midi: 57 } };

  it('maps string IDs to MIDI notes', () => {
    expect(getMidiNotes(['L1', 'R2'], tuning)).toEqual([41, 57]);
  });

  it('throws for unknown strings', () => {
    expect(() => getMidiNotes(['X1'], tuning)).toThrow('Unknown string "X1"');
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

  it('throws on zero speedPercent', () => {
    expect(() => computeOnsets([{ d: 1, string: 'L1' }], 0)).toThrow('speedPercent must be positive');
  });
});


describe('regionFromChunk', () => {
  const steps = Array.from({ length: 30 }, () => ({ d: 1, string: 'L1' }));
  // chunks array holds only real chunks; index 0 of the selector is the
  // virtual "All" option (regionFromChunk returns null for it).
  const chunks = [
    { name: 'A', start: 0, end: 9 },
    { name: 'B', start: 10, end: 19 },
    { name: 'C', start: 20, end: 29 },
  ];

  it('returns null for All (index 0)', () => {
    expect(regionFromChunk(chunks, 0, steps)).toBeNull();
  });

  it('returns the window for a chunk', () => {
    const r = regionFromChunk(chunks, 1, steps);
    expect(r).toEqual({ start: 0, end: 9 });
  });

  it('clamps an out-of-range chunk to valid bounds', () => {
    const bad = [{ name: 'X', start: 5, end: 999 }];
    const r = regionFromChunk(bad, 1, steps);
    expect(r).toEqual({ start: 5, end: 29 });
  });
});

describe('chunkSteps', () => {
  const steps = Array.from({ length: 30 }, (_, i) => ({ d: 1, string: `L${(i % 11) + 1}` }));

  it('returns all steps for a null region', () => {
    expect(chunkSteps(steps, null)).toHaveLength(30);
  });

  it('returns only the window for a region', () => {
    const r: Region = { start: 10, end: 19 };
    const out = chunkSteps(steps, r);
    expect(out).toHaveLength(10);
    expect(out[0].string).toBe('L11'); // index 10 -> (10 % 11) + 1 = 11
  });

  it('empty region (start > end) yields empty steps', () => {
    expect(chunkSteps(steps, { start: 5, end: 4 })).toEqual([]);
  });
});

describe('lookaheadItemVisible', () => {
  const region: Region = { start: 25, end: 53 };

  it('shows a window of current + 4 inside the region', () => {
    expect(lookaheadItemVisible(30, 30, region)).toBe(true);
    expect(lookaheadItemVisible(31, 30, region)).toBe(true);
    expect(lookaheadItemVisible(34, 30, region)).toBe(true);
  });

  it('hides items past the window inside the region', () => {
    expect(lookaheadItemVisible(35, 30, region)).toBe(false);
    expect(lookaheadItemVisible(53, 30, region)).toBe(false);
  });

  it('hides items before the current index (played notes)', () => {
    expect(lookaheadItemVisible(29, 30, region)).toBe(false);
    expect(lookaheadItemVisible(25, 30, region)).toBe(false);
  });

  it('always hides items outside the region, even if previously shown', () => {
    // The stale-state bug: notes visible from earlier playback (or another
    // chunk) must be hidden once a region is active.
    expect(lookaheadItemVisible(5, -1, region)).toBe(false);
    expect(lookaheadItemVisible(5, 30, region)).toBe(false);
    expect(lookaheadItemVisible(60, 30, region)).toBe(false);
    expect(lookaheadItemVisible(0, 30, region)).toBe(false);
  });

  it('region with null start behaves like no region (All selected)', () => {
    expect(lookaheadItemVisible(3, -1, { start: null, end: null })).toBe(true);
    expect(lookaheadItemVisible(4, 0, { start: null, end: null })).toBe(true);
    expect(lookaheadItemVisible(5, 0, { start: null, end: null })).toBe(false);
  });

  it('before playback a selected chunk shows its own opening window', () => {
    // Freshly selected chunk (region 25-53) with no playback yet:
    // only the chunk's first 5 steps are shown — nothing before it.
    expect(lookaheadItemVisible(25, -1, region)).toBe(true);
    expect(lookaheadItemVisible(29, -1, region)).toBe(true);
    expect(lookaheadItemVisible(30, -1, region)).toBe(false);
    expect(lookaheadItemVisible(24, -1, region)).toBe(false);
    expect(lookaheadItemVisible(53, -1, region)).toBe(false);
  });

  it('no region shows the first 5 items before playback starts', () => {
    expect(lookaheadItemVisible(0, -1, null)).toBe(true);
    expect(lookaheadItemVisible(3, -1, null)).toBe(true);
    expect(lookaheadItemVisible(4, -1, null)).toBe(true);
    expect(lookaheadItemVisible(5, -1, null)).toBe(false);
  });

  it('no region hides past notes as playback advances', () => {
    expect(lookaheadItemVisible(2, 3, null)).toBe(false); // past
    expect(lookaheadItemVisible(3, 3, null)).toBe(true);  // current
    expect(lookaheadItemVisible(7, 3, null)).toBe(true);  // +4
    expect(lookaheadItemVisible(8, 3, null)).toBe(false); // beyond window
  });
});
