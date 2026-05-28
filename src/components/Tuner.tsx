import { useState, useEffect, useRef } from 'react';
import { usePitchStream } from '../lib/use-pitch-stream';
import { getTuning } from '../lib/tuning';
import {
  centsFromTarget,
  snapToTarget,
  isInTune,
  advanceGuided,
  AUTO_ADVANCE_MS,
} from '../lib/tuner-logic';
import BridgeDiagramInteractive from './BridgeDiagramInteractive';
import VibrationLine from './VibrationLine';

type Mode = 'guided' | 'free';

export default function Tuner() {
  const tuning = getTuning('silaba');
  const [mode, setMode] = useState<Mode>('guided');
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<string | null>('L1');
  const [locked, setLocked] = useState<string | null>(null);
  const [tunedStrings, setTunedStrings] = useState<Set<string>>(new Set());
  const greenSince = useRef<number | null>(null);

  const { hz } = usePitchStream(active);

  const detected = hz ? snapToTarget(hz, tuning.strings, locked ?? undefined) : null;
  const currentTarget = locked ?? detected ?? target;
  const targetMidi = currentTarget ? tuning.strings[currentTarget]?.midi : null;
  const cents = hz && targetMidi != null ? centsFromTarget(hz, targetMidi) : null;
  const inTune = cents !== null && isInTune(cents);

  const tunedRef = useRef<Set<string>>(tunedStrings);
  tunedRef.current = tunedStrings;

  const advance = (target: string) => {
    setTunedStrings(prev => {
      const updated = new Set([...prev, target]);
      const next = advanceGuided(target, updated);
      setTarget(next);
      return updated;
    });
    setLocked(null);
    greenSince.current = null;
  };

  // Auto-advance in guided mode
  useEffect(() => {
    if (mode !== 'guided' || !inTune || !currentTarget) {
      greenSince.current = null;
      return;
    }

    if (greenSince.current === null) {
      greenSince.current = Date.now();
    }

    const elapsed = Date.now() - greenSince.current;
    if (elapsed >= AUTO_ADVANCE_MS) {
      advance(currentTarget);
      return;
    }

    const timer = setTimeout(() => advance(currentTarget), AUTO_ADVANCE_MS - elapsed);
    return () => clearTimeout(timer);
  }, [inTune, currentTarget, mode, tunedStrings]);

  const handleStringClick = (id: string) => {
    setLocked(id);
    setTarget(id);
  };

  const handleModeSwitch = (m: Mode) => {
    setMode(m);
    setLocked(null);
    if (m === 'guided') {
      setTarget('L1');
      setTunedStrings(new Set());
    }
  };

  const targetInfo = currentTarget ? tuning.strings[currentTarget] : null;
  const allTuned = tunedStrings.size === 21;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
        <button
          onClick={() => handleModeSwitch('guided')}
          style={{ padding: '0.3rem 0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: mode === 'guided' ? 'var(--pico-primary-background)' : '#333', color: mode === 'guided' ? 'white' : '#aaa' }}
        >Guided</button>
        <button
          onClick={() => handleModeSwitch('free')}
          style={{ padding: '0.3rem 0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: mode === 'free' ? 'var(--pico-primary-background)' : '#333', color: mode === 'free' ? 'white' : '#aaa' }}
        >Free</button>
      </div>

      {!active ? (
        <button onClick={() => setActive(true)}>Start Tuner</button>
      ) : (
        <>
          <div style={{ textAlign: 'center' }}>
            {allTuned ? (
              <div style={{ fontSize: '1.5rem', color: '#2ecc71' }}>All tuned ✓</div>
            ) : currentTarget && targetInfo ? (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{targetInfo.note}</div>
                <div style={{ fontSize: '0.85rem', color: '#aaa' }}>{currentTarget}</div>
                {cents !== null && <div style={{ fontSize: '0.75rem', color: inTune ? '#2ecc71' : '#aaa' }}>{cents > 0 ? '+' : ''}{cents.toFixed(0)}¢</div>}
              </>
            ) : (
              <div style={{ fontSize: '1rem', color: '#888' }}>Play a string…</div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <VibrationLine cents={cents} />
            <BridgeDiagramInteractive
              onStringClick={handleStringClick}
              activeString={currentTarget}
              tunedStrings={tunedStrings}
            />
          </div>

          <button onClick={() => setActive(false)} style={{ fontSize: '0.8rem' }}>Stop</button>
        </>
      )}
    </div>
  );
}
