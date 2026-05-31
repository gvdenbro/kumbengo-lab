export const IN_TUNE_CENTS = 3;
export const IN_TUNE_EXIT_CENTS = 6;
export const VISIBLE_RANGE_CENTS = 30;
export const CLARITY_THRESHOLD = 0.93;
export const AUTO_ADVANCE_MS = 500;
export const SNAP_MAX_SEMITONES = 2;

const GUIDED_ORDER: string[] = [
  ...Array.from({ length: 11 }, (_, i) => `L${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `R${i + 1}`),
];

export function centsFromTarget(hz: number, targetMidi: number): number {
  const targetHz = 440 * Math.pow(2, (targetMidi - 69) / 12);
  const cents = 1200 * Math.log2(hz / targetHz);
  return Math.max(-VISIBLE_RANGE_CENTS, Math.min(VISIBLE_RANGE_CENTS, Math.round(cents * 100) / 100));
}

export function snapToTarget(
  hz: number,
  tuning: Record<string, { midi: number }>,
  locked?: string,
): string | null {
  if (locked) return locked;
  const midi = 12 * Math.log2(hz / 440) + 69;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, info] of Object.entries(tuning)) {
    const dist = Math.abs(info.midi - midi);
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  return bestDist <= SNAP_MAX_SEMITONES ? best : null;
}

export function isInTune(cents: number): boolean {
  return Math.abs(cents) <= IN_TUNE_CENTS;
}

export function advanceGuided(current: string, tunedSet: Set<string>): string | null {
  const idx = GUIDED_ORDER.indexOf(current);
  for (let i = idx + 1; i < GUIDED_ORDER.length; i++) {
    if (!tunedSet.has(GUIDED_ORDER[i])) return GUIDED_ORDER[i];
  }
  return null;
}
