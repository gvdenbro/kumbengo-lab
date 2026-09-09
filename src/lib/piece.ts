export interface Step {
  d: number;
  string?: string;
  strings?: string[];
}

export interface Chunk {
  name: string;
  start: number;
  end: number;
}

export function assertChunksValid(
  chunks: Chunk[] | undefined,
  fullSteps: Step[],
  pieceId: string,
): void {
  if (!chunks || chunks.length === 0) return;
  const n = fullSteps.length;
  for (const c of chunks) {
    if (c.start < 0 || c.end >= n || c.start > c.end) {
      throw new Error(
        `Piece "${pieceId}" chunk "${c.name}" range [${c.start}, ${c.end}] out of bounds (Full has ${n} steps)`,
      );
    }
  }
}

export function getStepStrings(step: Step): string[] {
  if (step.strings) return step.strings;
  if (step.string) return [step.string];
  return [];
}
