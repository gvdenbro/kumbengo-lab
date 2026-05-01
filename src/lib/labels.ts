import tuningsRaw from '../data/tunings.yaml';

const tunings: Record<string, any> = tuningsRaw as any;

export function getStringLabel(stringId: string, notation: string, tuningId: string): string {
  if (notation === 'position') return stringId;
  const info = tunings[tuningId]?.strings?.[stringId];
  if (!info) return stringId;
  if (notation === 'note') return info.note;
  if (notation === 'distance') {
    const side = stringId[0];
    const num = parseInt(stringId.slice(1));
    const max = side === 'L' ? 11 : 10;
    const mid = Math.ceil(max / 2);
    const arrow = num <= mid ? '⇩' : '⇧';
    return `${arrow}${num}`;
  }
  return stringId;
}
