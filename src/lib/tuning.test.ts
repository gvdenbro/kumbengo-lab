import { describe, it, expect } from 'vitest';
import { getTuning, getMidiNote } from './tuning';
import { getStringLabel } from './labels';

describe('getTuning', () => {
  it('returns silaba tuning', () => {
    const t = getTuning('silaba');
    expect(t.name).toBe('Silaba (F major)');
    expect(t.strings.L1.midi).toBe(41);
    expect(t.strings.R10.midi).toBe(81);
  });

  it('throws for unknown tuning', () => {
    expect(() => getTuning('unknown')).toThrow('Unknown tuning');
  });
});

describe('getMidiNote', () => {
  it('returns midi for known string', () => {
    expect(getMidiNote('silaba', 'L1')).toBe(41);
    expect(getMidiNote('silaba', 'R5')).toBe(67);
  });

  it('throws for unknown string', () => {
    expect(() => getMidiNote('silaba', 'X1')).toThrow('Unknown string');
  });
});

describe('getStringLabel', () => {
  it('returns string ID for position notation', () => {
    expect(getStringLabel('L1', 'position', 'silaba')).toBe('L1');
  });

  it('returns note name for note notation', () => {
    expect(getStringLabel('L1', 'note', 'silaba')).toBe('F2');
    expect(getStringLabel('R3', 'note', 'silaba')).toBe('C4');
  });

  it('returns side + arrow + distance for distance notation', () => {
    expect(getStringLabel('L1', 'distance', 'silaba')).toBe('L⇧1');
    expect(getStringLabel('L11', 'distance', 'silaba')).toBe('L⇩1');
    expect(getStringLabel('R1', 'distance', 'silaba')).toBe('R⇧1');
    expect(getStringLabel('R10', 'distance', 'silaba')).toBe('R⇩1');
  });
});
