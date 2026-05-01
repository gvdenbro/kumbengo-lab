import { useState, useEffect, useRef, useCallback, Component, type ReactNode } from 'react';
import { getAudioContext, initAudioOnFirstClick, samples, registerSynthSounds, getSampleInfo, soundMap, loadBuffer } from '@strudel/webaudio';
import { superdough } from 'superdough';
import { getStepStrings, type Step } from '../lib/piece';
import { getTotalDuration, getMidiNotes, computeOnsets } from '../lib/player-logic';

interface Arrangement {
  name: string;
  steps: Step[];
}

interface Props {
  arrangements: Arrangement[];
  tuning: Record<string, { midi: number }>;
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

const LOOKAHEAD = 0.1;
const INTERVAL = 25;

type PlayerState = 'stopped' | 'loading' | 'playing' | 'paused';

interface NoteEntry { index: number; strings: string[]; time: number; }

function PlayerInner({ arrangements, tuning }: Props) {
  const [state, setState] = useState<PlayerState>('stopped');
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [arrangementIndex, setArrangementIndex] = useState(0);

  const schedulerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const nextIndexRef = useRef(0);
  const noteQueueRef = useRef<NoteEntry[]>([]);
  const loopingRef = useRef(looping);
  const tempoPercentRef = useRef(tempoPercent);

  useEffect(() => { loopingRef.current = looping; }, [looping]);
  useEffect(() => { tempoPercentRef.current = tempoPercent; }, [tempoPercent]);

  useEffect(() => {
    const sel = document.getElementById('arrangement-select') as HTMLSelectElement | null;
    if (sel) setArrangementIndex(Number(sel.value));
    const onArrangementChange = ((e: CustomEvent) => {
      setArrangementIndex(e.detail.index);
      stopPlayback();
    }) as EventListener;
    document.addEventListener('player-arrangement', onArrangementChange);
    return () => document.removeEventListener('player-arrangement', onArrangementChange);
  }, []);

  const clearVisuals = useCallback(() => {
    document.querySelectorAll('.string-dot').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.lookahead-item').forEach(d => d.classList.remove('current'));
  }, []);

  const stopScheduler = useCallback(() => {
    if (schedulerRef.current != null) { clearTimeout(schedulerRef.current); schedulerRef.current = null; }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (stopTimerRef.current != null) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
  }, []);

  useEffect(() => () => { stopScheduler(); }, [stopScheduler]);

  const stopPlayback = useCallback(() => {
    stopScheduler();
    noteQueueRef.current = [];
    nextIndexRef.current = 0;
    clearVisuals();
    setState('stopped');
  }, [stopScheduler, clearVisuals]);

  const drawLoop = useCallback(() => {
    const ctx = getAudioContext();
    const queue = noteQueueRef.current;
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const entry = queue.shift()!;
      document.dispatchEvent(new CustomEvent('player-step', {
        detail: { index: entry.index, strings: entry.strings },
      }));
    }
    rafRef.current = requestAnimationFrame(drawLoop);
  }, []);

  const startScheduler = useCallback((steps: Step[]) => {
    const ctx = getAudioContext();

    function schedule() {
      const speed = tempoPercentRef.current;
      const scale = 100 / speed;
      const onsets = computeOnsets(steps, speed);
      const totalDuration = getTotalDuration(steps, speed);

      while (nextIndexRef.current < steps.length) {
        const onset = startTimeRef.current + onsets[nextIndexRef.current];
        if (onset > ctx.currentTime + LOOKAHEAD) break;

        const step = steps[nextIndexRef.current];
        const strings = getStepStrings(step);
        if (strings.length > 0) {
          const midiNotes = getMidiNotes(strings, tuning);
          for (const note of midiNotes) {
            superdough({ s: 'folkharp', note }, onset, step.d * scale);
          }
        }
        noteQueueRef.current.push({ index: nextIndexRef.current, strings, time: onset });
        nextIndexRef.current++;
      }

      if (nextIndexRef.current >= steps.length) {
        if (loopingRef.current) {
          startTimeRef.current += totalDuration;
          nextIndexRef.current = 0;
        } else {
          const lastOnset = startTimeRef.current + onsets[steps.length - 1];
          const lastDur = steps[steps.length - 1].d * scale;
          const delay = (lastOnset + lastDur - ctx.currentTime) * 1000 + 100;
          if (delay > 0) {
            stopTimerRef.current = window.setTimeout(() => {
              stopPlayback();
            }, delay);
          }
          return;
        }
      }

      schedulerRef.current = window.setTimeout(schedule, INTERVAL);
    }

    schedule();
    rafRef.current = requestAnimationFrame(drawLoop);
  }, [tuning, drawLoop, stopPlayback]);

  const buildAndPlay = useCallback(async () => {
    setState('loading');
    try {
      await Promise.all([prebaked, audioReady]);

      const steps = arrangements[arrangementIndex].steps;
      if (steps.length === 0) { setState('stopped'); return; }

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

      const ctx = getAudioContext();
      await ctx.resume();
      startTimeRef.current = ctx.currentTime;
      nextIndexRef.current = 0;
      noteQueueRef.current = [];
      setState('playing');
      startScheduler(steps);
    } catch (err) {
      console.error('Playback failed:', err);
      setState('stopped');
    }
  }, [arrangementIndex, arrangements, tuning, startScheduler]);

  const pause = useCallback(() => {
    stopScheduler();
    getAudioContext().suspend();
    setState('paused');
  }, [stopScheduler]);

  const resume = useCallback(() => {
    getAudioContext().resume();
    setState('playing');
    startScheduler(arrangements[arrangementIndex].steps);
  }, [arrangementIndex, arrangements, startScheduler]);

  const togglePlayPause = useCallback(() => {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    else buildAndPlay();
  }, [state, pause, resume, buildAndPlay]);

  const handleTempoChange = useCallback((value: number) => {
    setTempoPercent(value);
    // Tempo change takes effect naturally on next scheduler tick via tempoPercentRef
  }, []);

  const handleLoopChange = useCallback((checked: boolean) => {
    setLooping(checked);
  }, []);

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
    <>
    <div id="player" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '1rem 0' }}>
      <button onClick={stopPlayback} aria-label="Restart" className="outline secondary" disabled={!isActive} style={{ padding: '0.5rem 0.75rem' }}>
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
        Speed:{' '}
        <input
          type="range"
          min={50}
          max={150}
          value={tempoPercent}
          onChange={e => handleTempoChange(Number(e.target.value))}
          aria-valuetext={`${tempoPercent}% of original speed`}
        />
        <span>{tempoPercent}%</span>
      </label>
    </div>
    <p className="keyboard-hint" style={{ textAlign: 'center', fontSize: '0.75rem', opacity: 0.5, margin: 0 }}>
      ⌨ Space play/pause · ← → speed
    </p>
    </>
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
