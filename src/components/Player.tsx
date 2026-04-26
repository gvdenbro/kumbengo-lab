import { useState, useEffect, useRef, useCallback } from 'react';
import { repl, pure, silence, fastcat, stack } from '@strudel/core';
import { getAudioContext, webaudioOutput, initAudioOnFirstClick, samples, registerSynthSounds, getSampleInfo, soundMap, loadBuffer } from '@strudel/webaudio';
import { getStepStrings, type Step } from '../lib/piece';
import { getTotalBeats, getCps, getPlaybackDurationMs, buildSlotMap, getMidiNotes } from '../lib/player-logic';

interface Arrangement {
  name: string;
  difficulty: string;
  steps: Step[];
}

interface Props {
  arrangements: Arrangement[];
  tuning: Record<string, { midi: number }>;
  tempo: number;
}

let prebaked: Promise<void> | undefined;
let audioReady: Promise<void> | undefined;
if (typeof window !== 'undefined') {
  prebaked = Promise.all([
    registerSynthSounds(),
    samples('https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/', { prebake: true }),
  ]).then(() => {}).catch(err => console.error('Sample preload failed:', err));
  audioReady = initAudioOnFirstClick().catch(err => console.error('Audio init failed:', err));
}

export default function Player({ arrangements, tuning, tempo }: Props) {
  const replRef = useRef<ReturnType<typeof repl> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [arrangementIndex, setArrangementIndex] = useState(0);
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

  // Listen for arrangement changes from the page-level selector
  useEffect(() => {
    const onArrangementChange = ((e: CustomEvent) => {
      setArrangementIndex(e.detail.index);
      if (replRef.current) {
        replRef.current.stop();
        setPlaying(false);
      }
    }) as EventListener;
    document.addEventListener('player-arrangement', onArrangementChange);
    return () => document.removeEventListener('player-arrangement', onArrangementChange);
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
    try {
      await Promise.all([prebaked, audioReady]);

      const steps = arrangements[arrangementIndex].steps;
      const uniqueMidi = [...new Set(
        steps.flatMap(s => getMidiNotes(getStepStrings(s), tuning))
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

      const totalBeats = getTotalBeats(steps);
      const cps = getCps(tempo, tempoPercent, totalBeats);
      const { slots, slotMap } = buildSlotMap(steps);

      const slotPatterns = [];
      for (let s = 0; s < slots; s++) {
        const info = slotMap.get(s);
        if (!info) { slotPatterns.push(silence); continue; }
        const midiNotes = getMidiNotes(info.strings, tuning);
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
        stopTimerRef.current = window.setTimeout(stopPlayback, getPlaybackDurationMs(totalBeats, tempo, tempoPercent) + 200);
      }
    } catch (err) {
      console.error('Playback failed:', err);
      setLoading(false);
      setPlaying(false);
    }
  }, [arrangementIndex, tempoPercent, arrangements, tuning, tempo, looping, clearStopTimer, stopPlayback]);

  const handleTempoChange = useCallback((value: number) => {
    setTempoPercent(value);
    if (playing && replRef.current) {
      const steps = arrangements[arrangementIndex].steps;
      const totalBeats = getTotalBeats(steps);
      replRef.current.setCps(getCps(tempo, value, totalBeats));
    }
  }, [playing, arrangementIndex, arrangements, tempo]);

  const handleLoopChange = (checked: boolean) => {
    setLooping(checked);
    if (playing) {
      if (!checked) {
        const steps = arrangements[arrangementIndex].steps;
        const totalBeats = getTotalBeats(steps);
        clearStopTimer();
        stopTimerRef.current = window.setTimeout(stopPlayback, getPlaybackDurationMs(totalBeats, tempo, tempoPercent) + 200);
      } else {
        clearStopTimer();
      }
    }
  };

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
  }, [playing, tempoPercent, buildAndPlay, stopPlayback, handleTempoChange]);

  const playLabel = loading ? 'Loading' : playing ? 'Stop' : 'Play';

  return (
    <div id="player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '1rem 0' }}>
      <button
        onClick={playing ? stopPlayback : buildAndPlay}
        disabled={loading}
        aria-label={playLabel}
      >
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
          aria-valuetext={`${tempoPercent}% of original tempo`}
        />
        <span>{tempoPercent}%</span>
      </label>
    </div>
  );
}
