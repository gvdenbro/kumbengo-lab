import { useRef, useEffect, useState } from 'react';
import { VISIBLE_RANGE_CENTS, IN_TUNE_CENTS } from '../lib/tuner-logic';

interface Props {
  cents: number | null;
}

const MAX_VIBRATION_PX = 3;

function lerpColor(cents: number): string {
  const abs = Math.abs(cents);
  if (abs <= IN_TUNE_CENTS) return '#2ecc71';
  if (abs <= 10) return '#f39c12';
  return '#ff6b6b';
}

export default function VibrationLine({ cents }: Props) {
  const rafRef = useRef<number>(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (cents === null) { setOffset(0); return; }

    function animate() {
      const amplitude = (Math.abs(cents!) / VISIBLE_RANGE_CENTS) * MAX_VIBRATION_PX;
      setOffset((Math.random() - 0.5) * 2 * amplitude);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cents]);

  if (cents === null) return null;

  const position = 50 + (cents / VISIBLE_RANGE_CENTS) * 30;
  const color = lerpColor(cents);

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(${position}% + ${offset}px)`,
        top: 0,
        bottom: 0,
        width: '3px',
        background: color,
        borderRadius: '2px',
        boxShadow: `0 0 10px ${color}, 0 0 4px ${color}`,
        opacity: 0.9,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    />
  );
}
