import { describe, it, expect } from 'vitest';
import { getStepStrings } from './piece';

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
