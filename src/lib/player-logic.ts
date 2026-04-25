import { getStepStrings, type Step } from './piece';

export function getTotalBeats(steps: Step[]): number {
  if (steps.length === 0) return 0;
  return steps[steps.length - 1].t + 1;
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
  for (let i = 0; i < steps.length; i++) {
    slotMap.set(Math.round(steps[i].t / resolution), {
      index: i,
      strings: getStepStrings(steps[i]),
    });
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
