import { useState, useEffect, useRef, useCallback } from 'react';
import { repl, pure, silence, fastcat, stack } from '@strudel/core';
import { webaudioOutput } from '@strudel/webaudio';
import { samples, initAudioOnFirstClick, getAudioContext } from '@strudel/web';

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

export default function Player({ layers, tuning, tempo }: Props) {
  const replRef = useRef<ReturnType<typeof repl> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [layerIndex, setLayerIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const audioReady = initAudioOnFirstClick();
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
      beforeStart: () => audioReady,
    });
    samples(
      'https://strudel.b-cdn.net/vcsl.json',
      'https://strudel.b-cdn.net/VCSL/',
      { prebake: true },
    ).then(() => setReady(true));
    replRef.current = r;
    return () => { r.stop(); };
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

  const buildAndPlay = useCallback(() => {
    const r = replRef.current;
    if (!r || !ready) return;

    const steps = layers[layerIndex].steps;
    const tempoMul = tempoPercent / 100;
    const lastT = steps[steps.length - 1].t;
    const totalBeats = lastT + 0.5;
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
  }, [ready, layerIndex, tempoPercent, layers, tuning, tempo, looping, clearStopTimer, stopPlayback]);

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
    // Show/hide layer tabs in the DOM
    document.querySelectorAll('.layer-tab').forEach((tab, i) => {
      (tab as HTMLElement).style.display = i === idx ? '' : 'none';
    });
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

  return (
    <div id="player">
      {layers.length > 1 && (
        <div id="layer-selector">
          <label htmlFor="layer-select">Layer: </label>
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
      <div className="player-controls">
        <button onClick={playing ? stopPlayback : buildAndPlay} disabled={!ready}>
          {!ready ? '⏳ Loading…' : playing ? '■ Stop' : '▶ Play'}
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
      </div>
    </div>
  );
}
