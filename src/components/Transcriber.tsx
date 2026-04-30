import { useState, useRef, useCallback, useEffect } from 'react';
import { clusterTaps, clustersToSteps } from '../lib/tap-rhythm';

type Phase = 'load' | 'rhythm' | 'verify' | 'assign';

export default function Transcriber() {
  const [phase, setPhase] = useState<Phase>('load');
  const [dragOver, setDragOver] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [steps, setSteps] = useState<{ d: number }[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopStartRef = useRef(0);
  const tapsRef = useRef<number[]>([]);
  const speedRef = useRef(speed);
  const clickTimersRef = useRef<number[]>([]);

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

  const retry = useCallback(() => {
    setSteps([]);
    setTapCount(0);
    setPhase('rhythm');
  }, []);

  // Keep speedRef in sync
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Update playback rate live
  useEffect(() => {
    if (sourceRef.current) sourceRef.current.playbackRate.value = speed;
  }, [speed]);

  // Spacebar tap capture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !sourceRef.current || !ctxRef.current) return;
      e.preventDefault();
      const elapsed = (ctxRef.current.currentTime - loopStartRef.current) * speedRef.current;
      const dur = bufferRef.current!.duration;
      const pos = elapsed % dur;
      tapsRef.current.push(pos);
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
          <button onClick={() => setPhase('assign')}>✓ Confirm</button>
        </div>
      </div>
    );
  }

  return <p>Phase: {phase}</p>;
}
