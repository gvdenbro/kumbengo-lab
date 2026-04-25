import tuningsRaw from '../data/tunings.yaml';

export { getStringLabel } from './labels';

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
  const info = getTuning(tuningId).strings[stringId];
  if (!info) throw new Error(`Unknown string "${stringId}" in tuning "${tuningId}"`);
  return info.midi;
}
