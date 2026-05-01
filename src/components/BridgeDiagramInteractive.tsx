import { useState } from 'react';

interface Props {
  onStringClick: (id: string) => void;
}

function distanceLabel(stringId: string): string {
  const side = stringId[0];
  const num = parseInt(stringId.slice(1), 10);
  const total = side === 'L' ? 11 : 10;
  const mid = Math.ceil(total / 2);
  return num <= mid ? `${side}⇧${num}` : `${side}⇩${total - num + 1}`;
}

export default function BridgeDiagramInteractive({ onStringClick }: Props) {
  const [flash, setFlash] = useState<string | null>(null);

  const handleClick = (id: string) => {
    setFlash(id);
    onStringClick(id);
    setTimeout(() => setFlash(null), 200);
  };

  const dot = (id: string) => (
    <div
      key={id}
      role="button"
      tabIndex={0}
      aria-label={id}
      onClick={() => handleClick(id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(id); } }}
      style={{
        width: '2rem', height: '2rem', borderRadius: '50%',
        border: '2px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.5rem', cursor: 'pointer',
        background: flash === id ? 'var(--pico-primary-background)' : undefined,
        color: flash === id ? 'var(--pico-primary-inverse)' : undefined,
        borderColor: flash === id ? 'var(--pico-primary-border)' : undefined,
      }}
    >
      {distanceLabel(id)}
    </div>
  );

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
