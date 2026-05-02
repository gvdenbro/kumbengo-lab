import { type Step } from './piece';

export function getTotalDuration(steps: Step[], speedPercent: number = 100): number {
  if (steps.length === 0) return 0;
  if (speedPercent <= 0) throw new RangeError(`speedPercent must be positive, got ${speedPercent}`);
  return steps.reduce((sum, s) => sum + s.d, 0) * (100 / speedPercent);
}

export function getMidiNotes(
  strings: string[],
  tuning: Record<string, { midi: number }>,
): number[] {
  return strings.map(str => {
    const info = tuning[str];
    if (!info) throw new Error(`Unknown string "${str}" — not found in tuning`);
    return info.midi;
  });
}

export function computeOnsets(steps: Step[], speedPercent: number): number[] {
  if (speedPercent <= 0) throw new RangeError(`speedPercent must be positive, got ${speedPercent}`);
  const scale = 100 / speedPercent;
  const onsets: number[] = [];
  let t = 0;
  for (const step of steps) {
    onsets.push(t * scale);
    t += step.d;
  }
  return onsets;
}
