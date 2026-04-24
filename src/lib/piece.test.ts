import { describe, it, expect } from 'vitest';
import { getStepStrings } from './piece';

describe('getStepStrings', () => {
  it('returns array for single string', () => {
    expect(getStepStrings({ t: 0, string: 'L4' })).toEqual(['L4']);
  });

  it('returns array for multiple strings', () => {
    expect(getStepStrings({ t: 0, strings: ['L1', 'L4'] })).toEqual(['L1', 'L4']);
  });
});
