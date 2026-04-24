import { describe, it, expect } from 'vitest';
import { getTuning, getStringLabel, getMidiNote } from './tuning';

describe('getTuning', () => {
  it('returns silaba tuning', () => {
    const t = getTuning('silaba');
    expect(t.name).toBe('Silaba (F major)');
    expect(Object.keys(t.strings)).toHaveLength(21);
  });

  it('throws for unknown tuning', () => {
    expect(() => getTuning('unknown')).toThrow();
  });
});

describe('getMidiNote', () => {
  it('returns correct midi for L1 silaba', () => {
    expect(getMidiNote('silaba', 'L1')).toBe(41);
  });

  it('returns correct midi for R10 silaba', () => {
    expect(getMidiNote('silaba', 'R10')).toBe(81);
  });
});

describe('getStringLabel', () => {
  it('position mode: L1 stays L1 (close)', () => {
    expect(getStringLabel('L1', 'position')).toBe('L1');
  });

  it('position mode: L11 becomes L1 (far)', () => {
    expect(getStringLabel('L11', 'position')).toBe('L1 (far)');
  });

  it('position mode: L6 stays L6 (threshold)', () => {
    expect(getStringLabel('L6', 'position')).toBe('L6');
  });

  it('position mode: L7 flips to L5 (far)', () => {
    expect(getStringLabel('L7', 'position')).toBe('L5 (far)');
  });

  it('position mode: R6 flips to R5 (far)', () => {
    expect(getStringLabel('R6', 'position')).toBe('R5 (far)');
  });

  it('position mode: R5 stays R5', () => {
    expect(getStringLabel('R5', 'position')).toBe('R5');
  });

  it('note mode: returns note name from tuning', () => {
    expect(getStringLabel('L1', 'note', 'silaba')).toBe('F2');
  });

  it('note mode: returns note name for R10', () => {
    expect(getStringLabel('R10', 'note', 'silaba')).toBe('A5');
  });

  it('distance mode: L1 close', () => {
    expect(getStringLabel('L1', 'distance')).toBe('L⇧1');
  });

  it('distance mode: L6 close (threshold)', () => {
    expect(getStringLabel('L6', 'distance')).toBe('L⇧6');
  });

  it('distance mode: L7 far', () => {
    expect(getStringLabel('L7', 'distance')).toBe('L⇩5');
  });

  it('distance mode: L11 far', () => {
    expect(getStringLabel('L11', 'distance')).toBe('L⇩1');
  });

  it('distance mode: R1 close', () => {
    expect(getStringLabel('R1', 'distance')).toBe('R⇧1');
  });

  it('distance mode: R10 far', () => {
    expect(getStringLabel('R10', 'distance')).toBe('R⇩1');
  });
});
