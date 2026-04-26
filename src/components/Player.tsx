import { useState, useEffect, useRef, useCallback, Component, type ReactNode } from 'react';
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

type PlayerState = 'stopped' | 'loading' | 'playing' | 'paused';

function PlayerInner({ arrangements, tuning, tempo }: Props) {
  const replRef = useRef<ReturnType<typeof repl> | null>(null);
  const [state, setState] = useState<PlayerState>('stopped');
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [arrangementIndex, setArrangementIndex] = useState(0);
  const patternBuiltRef = useRef(false);
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

  useEffect(() => {
    const sel = document.getElementById('arrangement-select') as HTMLSelectElement | null;
    if (sel) setArrangementIndex(Number(sel.value));
    const onArrangementChange = ((e: CustomEvent) => {
      setArrangementIndex(e.detail.index);
      replRef.current?.stop();
      patternBuiltRef.current = false;
      setState('stopped');
      clearVisuals();
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
    document.querySelectorAll('.lookahead-item').forEach(d => d.classList.remove('current'));
  }, []);

  const scheduleStop = useCallback((steps: Step[]) => {
    clearStopTimer();
    const totalBeats = getTotalBeats(steps);
    stopTimerRef.current = window.setTimeout(() => {
      replRef.current?.stop();
      patternBuiltRef.current = false;
      setState('stopped');
      clearVisuals();
    }, getPlaybackDurationMs(totalBeats, tempo, tempoPercent) + 200);
  }, [tempo, tempoPercent, clearStopTimer, clearVisuals]);

  const buildAndPlay = useCallback(async () => {
    const r = replRef.current;
    if (!r) return;

    setState('loading');
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

      r.setCps(cps);
      r.setPattern(fastcat(...slotPatterns), true);
      r.start();
      patternBuiltRef.current = true;
      setState('playing');

      if (!looping) scheduleStop(steps);
    } catch (err) {
      console.error('Playback failed:', err);
      setState('stopped');
    }
  }, [arrangementIndex, tempoPercent, arrangements, tuning, tempo, looping, scheduleStop]);

  const pause = useCallback(() => {
    replRef.current?.pause();
    getAudioContext().suspend();
    clearStopTimer();
    setState('paused');
  }, [clearStopTimer]);

  const resume = useCallback(() => {
    getAudioContext().resume();
    replRef.current?.start();
    setState('playing');
    if (!looping) {
      scheduleStop(arrangements[arrangementIndex].steps);
    }
  }, [looping, arrangementIndex, arrangements, scheduleStop]);

  const restart = useCallback(() => {
    replRef.current?.stop();
    patternBuiltRef.current = false;
    clearStopTimer();
    clearVisuals();
    setState('stopped');
  }, [clearStopTimer, clearVisuals]);

  const togglePlayPause = useCallback(() => {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    else buildAndPlay();
  }, [state, pause, resume, buildAndPlay]);

  const handleTempoChange = useCallback((value: number) => {
    setTempoPercent(value);
    if ((state === 'playing' || state === 'paused') && replRef.current) {
      const steps = arrangements[arrangementIndex].steps;
      const totalBeats = getTotalBeats(steps);
      replRef.current.setCps(getCps(tempo, value, totalBeats));
    }
  }, [state, arrangementIndex, arrangements, tempo]);

  const handleLoopChange = useCallback((checked: boolean) => {
    setLooping(checked);
    if (state === 'playing') {
      if (!checked) {
        scheduleStop(arrangements[arrangementIndex].steps);
      } else {
        clearStopTimer();
      }
    }
  }, [state, arrangementIndex, arrangements, scheduleStop, clearStopTimer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, select, textarea')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
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
  }, [tempoPercent, togglePlayPause, handleTempoChange]);

  const playLabel = state === 'loading' ? 'Loading' : state === 'playing' ? 'Pause' : 'Play';
  const isActive = state === 'playing' || state === 'paused';

  return (
    <div id="player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '1rem 0' }}>
      <button onClick={restart} aria-label="Restart" className="outline secondary" disabled={!isActive} style={{ padding: '0.5rem 0.75rem' }}>
        ⏮
      </button>
      <button
        onClick={togglePlayPause}
        disabled={state === 'loading'}
        aria-label={playLabel}
      >
        {state === 'loading' ? '⏳' : state === 'playing' ? '⏸' : '▶'}
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

class PlayerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <p>Player failed to load. Try refreshing the page.</p>;
    return this.props.children;
  }
}

export default function Player(props: Props) {
  return <PlayerErrorBoundary><PlayerInner {...props} /></PlayerErrorBoundary>;
}
