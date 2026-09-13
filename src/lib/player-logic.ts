import { type Step, type Chunk } from './piece';

export interface Region {
  start: number;
  end: number;
}

/** Region as dispatched on `player-region` — nulls mean "All" (whole piece). */
export interface LookaheadRegion {
  start: number | null;
  end: number | null;
}

export function regionFromChunk(
  chunks: Chunk[],
  index: number,
  fullSteps: Step[],
): Region | null {
  // index 0 is the "All" option
  if (!chunks || index === 0 || index > chunks.length) return null;
  const chunk = chunks[index - 1];
  const n = fullSteps.length;
  const start = Math.max(0, Math.min(chunk.start, n - 1));
  const end = Math.max(0, Math.min(chunk.end, n - 1));
  if (start > end) return null;
  return { start, end };
}

export function chunkSteps(fullSteps: Step[], region: Region | null): Step[] {
  if (!region) return fullSteps;
  if (region.start > region.end) return [];
  return fullSteps.slice(region.start, region.end + 1);
}

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

/**
 * Deterministic visibility decision for a lookahead item.
 *
 * Returns true when item `index` should be shown at playback position
 * `currentIndex` (which may be -1 = no playback yet) within `region`
 * (null or {start: null} = whole piece). Items outside the region are
 * ALWAYS hidden — this is what prevents stale notes (from earlier
 * playback or a previously selected chunk) from staying on screen.
 * Before playback starts, the window anchors on the region start (or 0
 * for the whole piece), matching what "only that chunk's items are shown"
 * means for a freshly selected chunk.
 */
export function lookaheadItemVisible(
  index: number,
  currentIndex: number,
  region: LookaheadRegion | null,
): boolean {
  const inside =
    region === null ||
    region.start === null ||
    (index >= region.start && region.end !== null && index <= region.end);
  if (!inside) return false;
  const start =
    currentIndex >= 0
      ? currentIndex
      : (region?.start != null ? region.start : 0);
  return index >= start && index - start <= 4;
}
