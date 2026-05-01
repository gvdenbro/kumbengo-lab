import { getTuning } from './tuning';

export function getStringLabel(
  stringId: string,
  mode: 'position' | 'note' | 'distance',
  tuningId?: string,
): string {
  if (mode === 'note') {
    if (!tuningId) throw new Error('tuningId required for note mode');
    return getTuning(tuningId).strings[stringId]?.note ?? stringId;
  }

  if (mode === 'distance') {
    const side = stringId[0] as 'L' | 'R';
    const num = parseInt(stringId.slice(1), 10);
    const total = side === 'L' ? 11 : 10;
    const mid = Math.ceil(total / 2);
    return num <= mid ? `${side}⇧${num}` : `${side}⇩${total - num + 1}`;
  }

  return stringId;
}
