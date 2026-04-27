import { getStepStrings, type Step } from './piece';

export function getTotalBeats(steps: Step[]): number {
  if (steps.length === 0) return 0;
  return steps.reduce((sum, s) => sum + s.d, 0);
}

export function getCps(tempo: number, tempoPercent: number, totalBeats: number): number {
  return (tempoPercent / 100 * tempo) / 60 / totalBeats;
}

export function getPlaybackDurationMs(totalBeats: number, tempo: number, tempoPercent: number): number {
  return (totalBeats / (tempoPercent / 100 * tempo / 60)) * 1000;
}

export interface SlotInfo {
  index: number;
  strings: string[];
}

export function buildSlotMap(
  steps: Step[],
  resolution = 0.5,
): { slots: number; slotMap: Map<number, SlotInfo> } {
  const totalBeats = getTotalBeats(steps);
  const slots = Math.round(totalBeats / resolution);
  const slotMap = new Map<number, SlotInfo>();
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].string || steps[i].strings) {
      slotMap.set(Math.round(t / resolution), {
        index: i,
        strings: getStepStrings(steps[i]),
      });
    }
    t += steps[i].d;
  }
  return { slots, slotMap };
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
