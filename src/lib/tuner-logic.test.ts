import { describe, it, expect } from 'vitest';
import { centsFromTarget, snapToTarget, isInTune, advanceGuided } from './tuner-logic';

describe('centsFromTarget', () => {
  it('returns 0 for exact match', () => {
    expect(centsFromTarget(440, 69)).toBe(0);
  });

  it('returns positive cents when sharp', () => {
    const cents = centsFromTarget(445, 69);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeCloseTo(19.56, 0);
  });

  it('returns negative cents when flat', () => {
    const cents = centsFromTarget(435, 69);
    expect(cents).toBeLessThan(0);
    expect(cents).toBeCloseTo(-19.78, 0);
  });

  it('clamps to +30', () => {
    expect(centsFromTarget(500, 69)).toBe(30);
  });

  it('clamps to -30', () => {
    expect(centsFromTarget(400, 69)).toBe(-30);
  });
});

describe('snapToTarget', () => {
  const tuning = {
    L1: { midi: 41 }, L9: { midi: 69 }, R3: { midi: 60 }, R5: { midi: 67 },
  };

  it('returns locked string when provided', () => {
    expect(snapToTarget(260, tuning, 'R3')).toBe('R3');
  });

  it('snaps to closest string by hz', () => {
    expect(snapToTarget(440, tuning)).toBe('L9');
  });

  it('returns null if no string within 2 semitones', () => {
    expect(snapToTarget(200, tuning)).toBeNull();
  });
});

describe('isInTune', () => {
  it('returns true within threshold', () => {
    expect(isInTune(2)).toBe(true);
    expect(isInTune(-3)).toBe(true);
    expect(isInTune(0)).toBe(true);
  });

  it('returns false outside threshold', () => {
    expect(isInTune(4)).toBe(false);
    expect(isInTune(-3.1)).toBe(false);
  });
});

describe('advanceGuided', () => {
  it('advances from L1 to L2', () => {
    expect(advanceGuided('L1', new Set(['L1']))).toBe('L2');
  });

  it('advances from L11 to R1', () => {
    expect(advanceGuided('L11', new Set(['L11']))).toBe('R1');
  });

  it('advances from R9 to R10', () => {
    expect(advanceGuided('R9', new Set(['R9']))).toBe('R10');
  });

  it('returns null when all tuned', () => {
    const all = new Set([
      ...Array.from({ length: 11 }, (_, i) => `L${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `R${i + 1}`),
    ]);
    expect(advanceGuided('R10', all)).toBeNull();
  });

  it('skips already-tuned strings', () => {
    expect(advanceGuided('L1', new Set(['L1', 'L2', 'L3']))).toBe('L4');
  });
});
