import tuningsRaw from '../data/tunings.yaml';

const tunings: Record<string, { strings: Record<string, { note: string }> }> = tuningsRaw as any;

export function getStringLabel(
  stringId: string,
  mode: 'position' | 'note' | 'distance',
  tuningId?: string,
): string {
  if (mode === 'note') {
    return tunings[tuningId!]?.strings[stringId]?.note ?? stringId;
  }

  const side = stringId[0] as 'L' | 'R';
  const num = parseInt(stringId.slice(1), 10);
  const total = side === 'L' ? 11 : 10;
  const mid = Math.ceil(total / 2);

  if (mode === 'distance') {
    return num <= mid ? `${side}⇧${num}` : `${side}⇩${total - num + 1}`;
  }

  // position mode
  if (num <= mid) return `${side}${num}`;
  return `${side}${total - num + 1} (far)`;
}
