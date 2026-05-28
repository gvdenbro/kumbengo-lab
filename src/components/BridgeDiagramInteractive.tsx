// src/components/BridgeDiagramInteractive.tsx
import { useState, useRef, useEffect } from 'react';

interface Props {
  onStringClick: (id: string) => void;
  activeString?: string | null;
  tunedStrings?: Set<string>;
}

function distanceLabel(stringId: string): string {
  const side = stringId[0];
  const num = parseInt(stringId.slice(1), 10);
  const total = side === 'L' ? 11 : 10;
  const mid = Math.ceil(total / 2);
  return num <= mid ? `${side}\u21E7${num}` : `${side}\u21E9${total - num + 1}`;
}

function dotColor(id: string, activeString?: string | null, tunedStrings?: Set<string>) {
  if (id === activeString) return { border: '#4a9eff', color: '#4a9eff', bg: 'rgba(74,158,255,0.15)' };
  if (tunedStrings?.has(id)) return { border: '#2ecc71', color: '#2ecc71', bg: undefined };
  return { border: '#ccc', color: undefined, bg: undefined };
}

export default function BridgeDiagramInteractive({ onStringClick, activeString, tunedStrings }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

  const handleClick = (id: string) => {
    setFlash(id);
    onStringClick(id);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFlash(null), 200);
  };

  const dot = (id: string) => {
    const colors = flash === id
      ? { border: 'var(--pico-primary-border)', color: 'var(--pico-primary-inverse)', bg: 'var(--pico-primary-background)' }
      : dotColor(id, activeString, tunedStrings);

    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        aria-label={id}
        onClick={(e) => { handleClick(id); (e.currentTarget as HTMLElement).blur(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(id); (e.currentTarget as HTMLElement).blur(); } }}
        style={{
          width: '2rem', height: '2rem', borderRadius: '50%',
          border: `2px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.5rem', cursor: 'pointer',
          background: colors.bg,
          color: colors.color,
        }}
      >
        {distanceLabel(id)}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', padding: '1rem' }} aria-label="Kora bridge">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {Array.from({ length: 11 }, (_, i) => dot(`L${11 - i}`))}
      </div>
      <div style={{ width: '2px', background: '#ccc' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: 'calc(2rem + 0.25rem)' }}>
        {Array.from({ length: 10 }, (_, i) => dot(`R${10 - i}`))}
      </div>
    </div>
  );
}
