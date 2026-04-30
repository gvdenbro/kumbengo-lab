import { useState, useRef, useCallback, useEffect } from 'react';
import { getAudioContext, initAudioOnFirstClick, samples, registerSynthSounds } from '@strudel/webaudio';
import { superdough } from 'superdough';
import { clusterTaps, clustersToSteps } from '../lib/tap-rhythm';
import BridgeDiagramInteractive from './BridgeDiagramInteractive';

type Phase = 'load' | 'rhythm' | 'verify' | 'assign';

const TUNING: Record<string, number> = {
  L1:41,L2:48,L3:50,L4:52,L5:55,L6:58,L7:62,L8:65,L9:69,L10:72,L11:76,
  R1:53,R2:57,R3:60,R4:64,R5:67,R6:70,R7:74,R8:77,R9:79,R10:81,
};

let prebaked: Promise<void> | undefined;
if (typeof window !== 'undefined') {
  prebaked = Promise.all([
    registerSynthSounds(),
    samples('https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/', { prebake: true }),
  ]).then(() => {}).catch(err => console.error('Sample preload failed:', err));
  initAudioOnFirstClick().catch(() => {});
}

function buildYaml(steps: { d: number }[], assignments: (string | null)[]): string {
  const lines = steps.map((step, i) => {
    const str = assignments[i];
    if (str) return `  - {d: ${step.d}, string: ${str}}`;
    return `  - {d: ${step.d}}`;
  });
  return `steps:\n${lines.join('\n')}`;
}

export default function Transcriber() {
  const [phase, setPhase] = useState<Phase>('load');
  const [dragOver, setDragOver] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [steps, setSteps] = useState<{ d: number }[]>([]);
  const [assignments, setAssignments] = useState<(string | null)[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopStartRef = useRef(0);
  const tapsRef = useRef<number[]>([]);
  const speedRef = useRef(speed);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const arrayBuf = await file.arrayBuffer();
    const ctx = getCtx();
    bufferRef.current = await ctx.decodeAudioData(arrayBuf);
    setPhase('rhythm');
  }, [getCtx]);

  const startPlayback = useCallback(() => {
    const ctx = getCtx();
    const buf = bufferRef.current;
    if (!buf) return;
    ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = speed;
    src.connect(ctx.destination);
    src.start();
    sourceRef.current = src;
    loopStartRef.current = ctx.currentTime;
    tapsRef.current = [];
    setTapCount(0);
    setPlaying(true);
  }, [getCtx, speed]);

  const stopPlayback = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
    const dur = bufferRef.current!.duration;
    const clusters = clusterTaps(tapsRef.current, 0.08);
    const result = clustersToSteps(clusters, dur);
    setSteps(result);
    if (result.length > 0) setPhase('verify');
  }, []);

  const playClicks = useCallback(() => {
    const ctx = getCtx();
    ctx.resume();
    let time = ctx.currentTime;
    steps.forEach((step, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 1000 : 800;
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.05);
      time += step.d;
    });
  }, [getCtx, steps]);

  const playAssignedNotes = useCallback(async (overrideAssignments?: (string | null)[]) => {
    await prebaked;
    const ctx = getAudioContext();
    await ctx.resume();
    const a = overrideAssignments || assignments;
    const end = currentStep + 1;
    let time = ctx.currentTime + 0.05;
    for (let i = 0; i < end; i++) {
      const str = a[i];
      if (str) {
        superdough({ s: 'folkharp', note: TUNING[str] ?? 60 }, time, steps[i].d);
      }
      time += steps[i].d;
    }
  }, [assignments, currentStep, steps]);

  const playAssigned = useCallback(() => playAssignedNotes(), [playAssignedNotes]);

  const playOriginalAudio = useCallback(() => {
    const ctx = getCtx();
    const buf = bufferRef.current;
    if (!buf) return;
    ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }, [getCtx]);

  const assignString = useCallback((id: string) => {
    const newAssignments = [...assignments];
    newAssignments[currentStep] = id;
    setAssignments(newAssignments);
    playAssignedNotes(newAssignments);
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
  }, [currentStep, steps, assignments, playAssignedNotes]);

  const copyYaml = useCallback(() => {
    navigator.clipboard.writeText(buildYaml(steps, assignments));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [steps, assignments]);

  const retry = useCallback(() => {
    setSteps([]);
    setTapCount(0);
    setPhase('rhythm');
  }, []);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { if (sourceRef.current) sourceRef.current.playbackRate.value = speed; }, [speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !sourceRef.current || !ctxRef.current) return;
      e.preventDefault();
      const elapsed = (ctxRef.current.currentTime - loopStartRef.current) * speedRef.current;
      const dur = bufferRef.current!.duration;
      tapsRef.current.push(elapsed % dur);
      setTapCount(tapsRef.current.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (phase === 'load') {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
        style={{ border: `2px dashed ${dragOver ? 'var(--pico-primary)' : '#ccc'}`, padding: '2rem', textAlign: 'center', borderRadius: '0.5rem' }}
      >
        <p>Drop an audio file here, or click to select</p>
        <input type="file" accept="audio/*,video/*" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
      </div>
    );
  }

  if (phase === 'rhythm') {
    return (
      <div>
        <p>Play the audio in a loop and tap spacebar to mark beats.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[0.5, 0.75, 1].map(s => (
            <button key={s} className={speed === s ? '' : 'outline'} onClick={() => setSpeed(s)}>
              {s * 100}%
            </button>
          ))}
        </div>
        {!playing ? (
          <button onClick={startPlayback}>▶ Play loop</button>
        ) : (
          <button onClick={stopPlayback}>⏹ Stop</button>
        )}
        <p style={{ marginTop: '0.5rem' }}>Taps: {tapCount}</p>
      </div>
    );
  }

  if (phase === 'verify') {
    return (
      <div>
        <p>Captured {tapCount} taps → {steps.length} steps. Listen to verify:</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={playClicks}>🔊 Play rhythm</button>
          <button className="outline" onClick={retry}>↩ Retry</button>
          <button onClick={() => { setAssignments(Array(steps.length).fill(null)); setCurrentStep(0); setPhase('assign'); }}>✓ Confirm</button>
        </div>
      </div>
    );
  }

  if (phase === 'assign') {
    return (
      <div>
        <p>Click a string for step {currentStep + 1}/{steps.length}</p>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <BridgeDiagramInteractive onStringClick={assignString} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {steps.map((step, i) => (
                <li
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  style={{
                    padding: '0.25rem 0.5rem', cursor: 'pointer',
                    background: i === currentStep ? 'var(--pico-primary-background)' : undefined,
                    color: i === currentStep ? 'var(--pico-primary-inverse)' : undefined,
                    borderRadius: '0.25rem', marginBottom: '0.125rem',
                  }}
                >
                  {i + 1}. d={step.d.toFixed(2)} → {assignments[i] || '—'}
                </li>
              ))}
            </ol>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {currentStep > 0 && (
                <button className="outline" onClick={() => setCurrentStep(currentStep - 1)}>← Back</button>
              )}
              <button className="outline" onClick={playAssigned}>🔊 Play assigned</button>
              <button className="outline secondary" onClick={playOriginalAudio}>🎵 Play audio</button>
            </div>
          </div>
        </div>
        <details open style={{ marginTop: '1rem' }}>
          <summary>YAML preview <button className="outline" style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={copyYaml}>{copied ? '✓ Copied!' : '📋 Copy'}</button></summary>
          <pre style={{ fontSize: '0.8rem', overflow: 'auto' }}>{buildYaml(steps, assignments)}</pre>
        </details>
      </div>
    );
  }

  return null;
}
