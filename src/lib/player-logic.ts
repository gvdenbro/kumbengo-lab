import { getStepStrings, type Step } from './piece';

export { getStepStrings, type Step };

export function getTotalDuration(steps: Step[], speedPercent: number = 100): number {
  if (steps.length === 0) return 0;
  return steps.reduce((sum, s) => sum + s.d, 0) * (100 / speedPercent);
}

export function getMidiNotes(
  strings: string[],
  tuning: Record<string, { midi: number }>,
): number[] {
  return strings.map(str => {
    const info = tuning[str];
    if (!info) console.warn(`Unknown string "${str}" in tuning`);
    return info?.midi ?? 60;
  });
}

export function computeOnsets(steps: Step[], speedPercent: number): number[] {
  const scale = 100 / speedPercent;
  const onsets: number[] = [];
  let t = 0;
  for (const step of steps) {
    onsets.push(t * scale);
    t += step.d;
  }
  return onsets;
}
