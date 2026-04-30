import { useState, useRef, useCallback, useEffect } from 'react';

type Phase = 'load' | 'rhythm' | 'assign';

export default function Transcriber() {
  const [phase, setPhase] = useState<Phase>('load');
  const [dragOver, setDragOver] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const loopStartRef = useRef(0);
  const tapsRef = useRef<number[]>([]);

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
    setPlaying(true);
  }, [getCtx, speed]);

  const stopPlayback = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
  }, []);

  // Update playback rate live when speed changes
  useEffect(() => {
    if (sourceRef.current) sourceRef.current.playbackRate.value = speed;
  }, [speed]);

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
        {playing && <p style={{ marginTop: '0.5rem' }}>Taps: {tapsRef.current.length} (press spacebar)</p>}
      </div>
    );
  }

  return <p>Phase: {phase}</p>;
}
