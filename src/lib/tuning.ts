import tuningsRaw from '../data/tunings.yaml';

export interface StringInfo {
  note: string;
  midi: number;
}

export interface Tuning {
  name: string;
  strings: Record<string, StringInfo>;
}

const tunings: Record<string, Tuning> = tuningsRaw as any;

export function getTuning(id: string): Tuning {
  const t = tunings[id];
  if (!t) throw new Error(`Unknown tuning: ${id}`);
  return t;
}

export function getMidiNote(tuningId: string, stringId: string): number {
  return getTuning(tuningId).strings[stringId].midi;
}

const LEFT_COUNT = 11;
const RIGHT_COUNT = 10;

export function getStringLabel(
  stringId: string,
  mode: 'position' | 'note',
  tuningId?: string,
): string {
  if (mode === 'note') {
    if (!tuningId) throw new Error('tuningId required for note mode');
    return getTuning(tuningId).strings[stringId].note;
  }

  const side = stringId[0] as 'L' | 'R';
  const num = parseInt(stringId.slice(1), 10);
  const total = side === 'L' ? LEFT_COUNT : RIGHT_COUNT;
  const threshold = Math.ceil(total / 2);

  if (num <= threshold) return `${side}${num}`;

  const fromFar = total - num + 1;
  return `${side}${fromFar} (far)`;
}
