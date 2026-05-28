import { useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';
import { openMic, closeMic, type MicHandle } from './pitch-detect';
import { CLARITY_THRESHOLD } from './tuner-logic';

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

      function loop() {
        if (cancelled) return;
        handle.analyser.getFloatTimeDomainData(buf);
        const [freq, clarity] = detector.findPitch(buf, handle.ctx.sampleRate);

        if (clarity >= CLARITY_THRESHOLD && freq >= 60 && freq <= 2000) {
          setFrame({ hz: freq, clarity });
        } else {
          setFrame({ hz: null, clarity });
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
