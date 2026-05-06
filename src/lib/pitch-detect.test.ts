import { describe, it, expect } from 'vitest';
import { hzToMidi, snapToString } from './pitch-detect';

describe('hzToMidi', () => {
  it('converts 440Hz to MIDI 69', () => {
    expect(hzToMidi(440)).toBe(69);
  });

  it('converts 261.63Hz to MIDI 60', () => {
    expect(hzToMidi(261.63)).toBe(60);
  });

  it('converts 87.31Hz to MIDI 41', () => {
    expect(hzToMidi(87.31)).toBe(41);
  });
});

describe('snapToString', () => {
  const tuning = {
    L1: { midi: 41 }, L7: { midi: 62 }, R3: { midi: 60 },
    R5: { midi: 67 }, L9: { midi: 69 },
  };

  it('snaps exact MIDI to correct string', () => {
    expect(snapToString(69, tuning)).toBe('L9');
  });

  it('snaps nearby MIDI to closest string', () => {
    expect(snapToString(70, tuning)).toBe('L9');
  });

  it('returns null if no string within 2 semitones', () => {
    expect(snapToString(50, tuning)).toBeNull();
  });
});
