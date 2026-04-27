import { describe, it, expect } from 'vitest';
import { getStepStrings } from './piece';

describe('getStepStrings', () => {
  it('returns array for single string', () => {
    expect(getStepStrings({ d: 1, string: 'L4' })).toEqual(['L4']);
  });

  it('returns array for multiple strings', () => {
    expect(getStepStrings({ d: 1, strings: ['L1', 'L4'] })).toEqual(['L1', 'L4']);
  });
});
