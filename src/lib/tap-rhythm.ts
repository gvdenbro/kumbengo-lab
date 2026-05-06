export interface TapCluster {
  onset: number;
  count: number;
}

export function clusterTaps(taps: number[], tolerance: number): TapCluster[] {
  if (!taps.length) return [];
  const sorted = [...taps].sort((a, b) => a - b);
  const clusters: TapCluster[] = [];
  let group = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - group[group.length - 1] <= tolerance) {
      group.push(sorted[i]);
    } else {
      clusters.push({ onset: median(group), count: group.length });
      group = [sorted[i]];
    }
  }
  clusters.push({ onset: median(group), count: group.length });
  return clusters;
}

export function clustersToSteps(clusters: TapCluster[], loopDuration: number): { d: number }[] {
  if (clusters.length === 0) return [];
  const steps: { d: number }[] = [];
  for (let i = 0; i < clusters.length - 1; i++) {
    steps.push({ d: round2(clusters[i + 1].onset - clusters[i].onset) });
  }
  steps.push({ d: round2(loopDuration - clusters[clusters.length - 1].onset + clusters[0].onset) });
  return steps;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function parseAudacityLabels(text: string, audioDuration: number): { d: number }[] {
  const onsets = [0];
  for (const line of text.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const t = parseFloat(cols[2]);
    if (!isNaN(t) && t > 0) onsets.push(t);
  }
  if (onsets.length < 2) return [];
  onsets.sort((a, b) => a - b);
  const steps: { d: number }[] = [];
  for (let i = 0; i < onsets.length - 1; i++) {
    steps.push({ d: round2(onsets[i + 1] - onsets[i]) });
  }
  steps.push({ d: round2(audioDuration - onsets[onsets.length - 1]) });
  return steps;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
