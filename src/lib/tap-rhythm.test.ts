import { describe, it, expect } from 'vitest';
import { clusterTaps, clustersToSteps, parseAudacityLabels } from './tap-rhythm';

describe('clusterTaps', () => {
  it('groups taps within tolerance', () => {
    const taps = [0.1, 0.11, 0.5, 0.51, 1.0, 0.99];
    const clusters = clusterTaps(taps, 0.08);
    expect(clusters).toHaveLength(3);
    expect(clusters[0].onset).toBeCloseTo(0.105);
    expect(clusters[1].onset).toBeCloseTo(0.505);
    expect(clusters[2].onset).toBeCloseTo(0.995);
    expect(clusters[0].count).toBe(2);
  });

  it('handles single tap per cluster', () => {
    const clusters = clusterTaps([0.2, 0.8, 1.5], 0.05);
    expect(clusters).toHaveLength(3);
    expect(clusters[0]).toEqual({ onset: 0.2, count: 1 });
  });

  it('returns empty for empty input', () => {
    expect(clusterTaps([], 0.1)).toEqual([]);
  });
});

describe('clustersToSteps', () => {
  it('converts evenly spaced clusters to equal durations', () => {
    const clusters = [
      { onset: 0, count: 1 },
      { onset: 1, count: 1 },
      { onset: 2, count: 1 },
      { onset: 3, count: 1 },
    ];
    const steps = clustersToSteps(clusters, 4);
    expect(steps).toEqual([{ d: 1 }, { d: 1 }, { d: 1 }, { d: 1 }]);
  });

  it('handles uneven spacing', () => {
    const clusters = [
      { onset: 0, count: 1 },
      { onset: 0.5, count: 1 },
      { onset: 2, count: 1 },
    ];
    const steps = clustersToSteps(clusters, 4);
    expect(steps[0].d).toBeCloseTo(0.5);
    expect(steps[1].d).toBeCloseTo(1.5);
    expect(steps[2].d).toBeCloseTo(2); // wrap: 4 - 2 + 0
  });

  it('returns empty for empty clusters', () => {
    expect(clustersToSteps([], 4)).toEqual([]);
  });
});

describe('parseAudacityLabels', () => {
  it('parses tab-delimited labels into steps', () => {
    const text = '0.500000\t0.500000\t0.500000\n1.200000\t1.200000\t1.200000\n2.000000\t2.000000\t2.000000';
    const steps = parseAudacityLabels(text, 3);
    expect(steps).toEqual([{ d: 0.5 }, { d: 0.7 }, { d: 0.8 }, { d: 1 }]);
  });

  it('returns empty for no valid lines', () => {
    expect(parseAudacityLabels('', 4)).toEqual([]);
    expect(parseAudacityLabels('garbage', 4)).toEqual([]);
  });

  it('ignores lines with fewer than 3 columns', () => {
    const text = '0.5\t0.5\t0.5\nbad line\n1.0\t1.0\t1.0';
    const steps = parseAudacityLabels(text, 2);
    expect(steps).toEqual([{ d: 0.5 }, { d: 0.5 }, { d: 1 }]);
  });

  it('uses audio duration for last step', () => {
    const text = '0.300000\t0.300000\t0.300000';
    const steps = parseAudacityLabels(text, 1.5);
    expect(steps).toEqual([{ d: 0.3 }, { d: 1.2 }]);
  });
});
