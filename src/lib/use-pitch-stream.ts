import { useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';
import { openMic, closeMic, type MicHandle } from './pitch-detect';
import { CLARITY_THRESHOLD, SNAP_MAX_SEMITONES } from './tuner-logic';

const STABLE_FRAMES = 3;

export interface PitchFrame {
  hz: number | null;
  clarity: number;
}

export function usePitchStream(active: boolean): PitchFrame {
  const [frame, setFrame] = useState<PitchFrame>({ hz: null, clarity: 0 });
  const handleRef = useRef<MicHandle | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setFrame({ hz: null, clarity: 0 });
      return;
    }

    let cancelled = false;

    async function start() {
      const handle = await openMic();
      if (cancelled) { closeMic(handle); return; }
      handleRef.current = handle;

      const detector = PitchDetector.forFloat32Array(handle.analyser.fftSize);
      const buf = new Float32Array(handle.analyser.fftSize);
      let lastMidi = -1;
      let stableCount = 0;
      let smoothedHz: number | null = null;
      const SMOOTH_FACTOR = 0.3;
      const HOLD_MS = 500;
      let lastGoodTime = 0;
      let lastGoodFrame: PitchFrame = { hz: null, clarity: 0 };

      function loop() {
        if (cancelled) return;
        handle.analyser.getFloatTimeDomainData(buf);
        const [freq, clarity] = detector.findPitch(buf, handle.ctx.sampleRate);

        if (clarity >= CLARITY_THRESHOLD && freq >= 60 && freq <= 2000) {
          const midi = Math.round(12 * Math.log2(freq / 440) + 69);
          if (Math.abs(midi - lastMidi) <= SNAP_MAX_SEMITONES) {
            stableCount++;
          } else {
            stableCount = 1;
            lastMidi = midi;
            smoothedHz = null;
          }
          if (stableCount >= STABLE_FRAMES) {
            smoothedHz = smoothedHz === null ? freq : SMOOTH_FACTOR * freq + (1 - SMOOTH_FACTOR) * smoothedHz;
            lastGoodFrame = { hz: smoothedHz, clarity };
            lastGoodTime = performance.now();
            setFrame(lastGoodFrame);
          }
        } else {
          stableCount = 0;
          if (lastGoodFrame.hz !== null && performance.now() - lastGoodTime < HOLD_MS) {
            setFrame(lastGoodFrame);
          } else {
            smoothedHz = null;
            setFrame({ hz: null, clarity });
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    start().catch(() => {
      if (!cancelled) setFrame({ hz: null, clarity: 0 });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (handleRef.current) {
        closeMic(handleRef.current);
        handleRef.current = null;
      }
    };
  }, [active]);

  return frame;
}
