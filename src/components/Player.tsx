import { useState, useEffect, useRef, useCallback } from 'react';
import { repl, pure, silence, fastcat, stack } from '@strudel/core';
import { getAudioContext, webaudioOutput, initAudioOnFirstClick, samples, registerSynthSounds, getSampleInfo, soundMap, loadBuffer } from '@strudel/webaudio';

interface Step {
  t: number;
  string?: string;
  strings?: string[];
}

interface Layer {
  name: string;
  difficulty: string;
  steps: Step[];
}

interface Props {
  layers: Layer[];
  tuning: Record<string, { midi: number }>;
  tempo: number;
}

function getStepStrings(step: Step): string[] {
  return step.strings ?? (step.string ? [step.string] : []);
}

// Start loading samples + audio init at module level (same pattern as strudel website)
let prebaked: Promise<void> | undefined;
let audioReady: Promise<void> | undefined;
if (typeof window !== 'undefined') {
  prebaked = Promise.all([
    registerSynthSounds(),
    samples('https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/', { prebake: true }),
  ]).then(() => {});
  audioReady = initAudioOnFirstClick();
}

export default function Player({ layers, tuning, tempo }: Props) {
  const replRef = useRef<ReturnType<typeof repl> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [layerIndex, setLayerIndex] = useState(0);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const r = repl({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      editPattern: (pat: any) =>
        pat.onTrigger((hap: any) => {
          const v = hap.value ?? {};
          if (v._stepIndex !== undefined) {
            document.dispatchEvent(
              new CustomEvent('player-step', {
                detail: { index: v._stepIndex, strings: v._strings ?? [] },
              }),
            );
          }
        }, false),
    });
    replRef.current = r;
    return () => { r.stop(); };
  }, []);

  // Fire initial notation event so bridge/tablature labels update
  useEffect(() => {
    const mode = localStorage.getItem('notation-mode') || 'position';
    document.dispatchEvent(new CustomEvent('notation-change', { detail: mode }));
  }, []);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current != null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const clearVisuals = useCallback(() => {
    document.querySelectorAll('.string-dot').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.timeline-step').forEach(d => d.classList.remove('current', 'past'));
  }, []);

  const stopPlayback = useCallback(() => {
    replRef.current?.stop();
    clearStopTimer();
    setPlaying(false);
    clearVisuals();
  }, [clearStopTimer, clearVisuals]);

  const buildAndPlay = useCallback(async () => {
    const r = replRef.current;
    if (!r) return;

    setLoading(true);

    // Wait for samples + audio context (same as strudel website's beforeEval)
    await Promise.all([prebaked, audioReady]);

    // Preload the actual audio buffers for notes used in this layer
    const steps = layers[layerIndex].steps;
    const uniqueMidi = [...new Set(
      steps.flatMap(s => getStepStrings(s).map(str => tuning[str]?.midi ?? 60))
    )];
    const sMap = soundMap.get();
    const folkharp = sMap.folkharp;
    if (folkharp?.data?.samples) {
      const ac = getAudioContext();
      const sampleData = folkharp.data.samples;
      const baseUrl = folkharp.data.baseUrl ?? '';
      const urls = uniqueMidi.map(midi => {
        try {
          const info = getSampleInfo({ s: 'folkharp', note: midi, n: 0 }, sampleData);
          if (!info?.url) return null;
          return info.url.startsWith('http') ? info.url : baseUrl + '/' + info.url;
        } catch { return null; }
      }).filter(Boolean) as string[];
      await Promise.all(urls.map(url => loadBuffer(url, ac, 'folkharp')));
    }

    setLoading(false);

    const tempoMul = tempoPercent / 100;
    const lastT = steps[steps.length - 1].t;
    const totalBeats = lastT + 1;
    const cps = (tempoMul * tempo) / 60 / totalBeats;

    const resolution = 0.5;
    const slots = Math.round(totalBeats / resolution);
    const stepMap = new Map<number, { index: number; strings: string[] }>();
    for (let i = 0; i < steps.length; i++) {
      stepMap.set(Math.round(steps[i].t / resolution), {
        index: i,
        strings: getStepStrings(steps[i]),
      });
    }

    const slotPatterns = [];
    for (let s = 0; s < slots; s++) {
      const info = stepMap.get(s);
      if (!info) { slotPatterns.push(silence); continue; }
      const midiNotes = info.strings.map(str => tuning[str]?.midi ?? 60);
      const base = { s: 'folkharp', _stepIndex: info.index, _strings: info.strings };
      if (midiNotes.length === 1) {
        slotPatterns.push(pure({ note: midiNotes[0], ...base }));
      } else {
        slotPatterns.push(stack(...midiNotes.map(n => pure({ note: n, ...base }))));
      }
    }

    const pattern = fastcat(...slotPatterns);
    r.setCps(cps);
    r.setPattern(pattern, true);
    r.start();
    setPlaying(true);

    if (!looping) {
      clearStopTimer();
      stopTimerRef.current = window.setTimeout(stopPlayback, (totalBeats / (tempoMul * tempo / 60)) * 1000 + 200);
    }
  }, [layerIndex, tempoPercent, layers, tuning, tempo, looping, clearStopTimer, stopPlayback]);

  const handleTempoChange = (value: number) => {
    setTempoPercent(value);
    if (playing && replRef.current) {
      const steps = layers[layerIndex].steps;
      const lastT = steps[steps.length - 1].t;
      const totalBeats = lastT + 0.5;
      replRef.current.setCps((value / 100 * tempo) / 60 / totalBeats);
    }
  };

  const handleLayerChange = (idx: number) => {
    setLayerIndex(idx);
    if (playing) stopPlayback();
    document.querySelectorAll('.layer-tab').forEach((tab, i) => {
      (tab as HTMLElement).style.display = i === idx ? '' : 'none';
    });
    document.dispatchEvent(new CustomEvent('player-layer', { detail: { index: idx } }));
  };

  const handleLoopChange = (checked: boolean) => {
    setLooping(checked);
    if (playing) {
      if (!checked) {
        const steps = layers[layerIndex].steps;
        const lastT = steps[steps.length - 1].t;
        const totalBeats = lastT + 0.5;
        const tempoMul = tempoPercent / 100;
        clearStopTimer();
        stopTimerRef.current = window.setTimeout(stopPlayback, (totalBeats / (tempoMul * tempo / 60)) * 1000 + 200);
      } else {
        clearStopTimer();
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, select, textarea')) return;
      if (e.key === ' ') {
        e.preventDefault();
        playing ? stopPlayback() : buildAndPlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleTempoChange(Math.max(50, tempoPercent - 5));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleTempoChange(Math.min(150, tempoPercent + 5));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [playing, tempoPercent, buildAndPlay, stopPlayback]);

  return (
    <div id="player" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
      {layers.length > 1 && (
        <div id="layer-selector">
          <label htmlFor="layer-select">Arrangement: </label>
          <select
            id="layer-select"
            value={layerIndex}
            onChange={e => handleLayerChange(Number(e.target.value))}
          >
            {layers.map((layer, i) => (
              <option key={i} value={i}>
                {layer.name} ({layer.difficulty})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="player-controls" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button onClick={playing ? stopPlayback : buildAndPlay} disabled={loading}>
          {loading ? '⏳ Loading…' : playing ? '■ Stop' : '▶ Play'}
        </button>
        <label>
          <input
            type="checkbox"
            checked={looping}
            onChange={e => handleLoopChange(e.target.checked)}
          />{' '}
          Loop
        </label>
        <label>
          Tempo:{' '}
          <input
            type="range"
            min={50}
            max={150}
            value={tempoPercent}
            onChange={e => handleTempoChange(Number(e.target.value))}
          />
          <span>{tempoPercent}%</span>
        </label>
        <label>
          Notation:{' '}
          <select
            defaultValue={typeof localStorage !== 'undefined' ? localStorage.getItem('notation-mode') || 'position' : 'position'}
            onChange={e => {
              const mode = e.target.value;
              localStorage.setItem('notation-mode', mode);
              document.dispatchEvent(new CustomEvent('notation-change', { detail: mode }));
            }}
            style={{ fontSize: '0.875rem' }}
          >
            <option value="position">String (L1, R2)</option>
            <option value="note">Note (C4, F3)</option>
            <option value="distance">Near/Far (⇧⇩)</option>
          </select>
        </label>
      </div>
    </div>
  );
}
