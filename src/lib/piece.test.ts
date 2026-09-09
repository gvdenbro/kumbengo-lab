import { describe, it, expect } from 'vitest';
import { getStepStrings, assertChunksValid, type Chunk } from './piece';

describe('getStepStrings', () => {
  it('returns array from strings field', () => {
    expect(getStepStrings({ d: 1, strings: ['L1', 'R2'] })).toEqual(['L1', 'R2']);
  });

  it('returns single-element array from string field', () => {
    expect(getStepStrings({ d: 1, string: 'L5' })).toEqual(['L5']);
  });

  it('returns empty array for rest', () => {
    expect(getStepStrings({ d: 1 })).toEqual([]);
  });
});


describe('assertChunksValid', () => {
  const full: Chunk[] = [{ name: 'A', start: 0, end: 9 }];
  const steps = Array.from({ length: 10 }, () => ({ d: 0.5, string: 'L1' }));

  it('passes for empty/absent chunks', () => {
    expect(() => assertChunksValid(undefined, steps, 'p')).not.toThrow();
    expect(() => assertChunksValid([], steps, 'p')).not.toThrow();
  });

  it('passes for valid in-range chunks', () => {
    expect(() => assertChunksValid(full, steps, 'p')).not.toThrow();
  });

  it('throws when end >= full steps length', () => {
    const bad: Chunk[] = [{ name: 'A', start: 0, end: 10 }];
    expect(() => assertChunksValid(bad, steps, 'p')).toThrow(/out of bounds/);
  });

  it('throws when start > end', () => {
    const bad: Chunk[] = [{ name: 'A', start: 5, end: 4 }];
    expect(() => assertChunksValid(bad, steps, 'p')).toThrow(/out of bounds/);
  });
});
