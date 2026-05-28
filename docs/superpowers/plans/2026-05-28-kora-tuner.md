# Kora Tuner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time kora tuner at `/tune` with a vibrating line overlay on the bridge diagram.

**Architecture:** Hook + view separation. Pure tuner logic in `tuner-logic.ts` (testable), a `usePitchStream` React hook for mic→pitch streaming, and a `Tuner.tsx` view component composing the bridge diagram with a `VibrationLine` overlay.

**Tech Stack:** Astro 6, React, TypeScript, pitchy (existing), Vitest

---

### Task 1: Tuner Logic — Pure Functions

**Files:**
- Create: `src/lib/tuner-logic.ts`
- Create: `src/lib/tuner-logic.test.ts`

- [ ] **Step 1: Write failing tests for `centsFromTarget`**

```ts
// src/lib/tuner-logic.test.ts
import { describe, it, expect } from 'vitest';
import { centsFromTarget, snapToTarget, isInTune, advanceGuided } from './tuner-logic';

describe('centsFromTarget', () => {
  it('returns 0 for exact match', () => {
    expect(centsFromTarget(440, 69)).toBe(0);
  });

  it('returns positive cents when sharp', () => {
    const cents = centsFromTarget(445, 69);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeCloseTo(19.56, 0);
  });

  it('returns negative cents when flat', () => {
    const cents = centsFromTarget(435, 69);
    expect(cents).toBeLessThan(0);
    expect(cents).toBeCloseTo(-19.78, 0);
  });

  it('clamps to +30', () => {
    expect(centsFromTarget(500, 69)).toBe(30);
  });

  it('clamps to -30', () => {
    expect(centsFromTarget(400, 69)).toBe(-30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/tuner-logic.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `centsFromTarget`**

```ts
// src/lib/tuner-logic.ts
export const IN_TUNE_CENTS = 3;
export const VISIBLE_RANGE_CENTS = 30;
export const CLARITY_THRESHOLD = 0.85;
export const AUTO_ADVANCE_MS = 1000;
export const SNAP_MAX_SEMITONES = 2;

export function centsFromTarget(hz: number, targetMidi: number): number {
  const targetHz = 440 * Math.pow(2, (targetMidi - 69) / 12);
  const cents = 1200 * Math.log2(hz / targetHz);
  return Math.max(-VISIBLE_RANGE_CENTS, Math.min(VISIBLE_RANGE_CENTS, Math.round(cents * 100) / 100));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/tuner-logic.test.ts`
Expected: `centsFromTarget` tests PASS

- [ ] **Step 5: Write failing tests for `snapToTarget`**

Add to `src/lib/tuner-logic.test.ts`:

```ts
describe('snapToTarget', () => {
  const tuning = {
    L1: { midi: 41 }, L9: { midi: 69 }, R3: { midi: 60 }, R5: { midi: 67 },
  };

  it('returns locked string when provided', () => {
    expect(snapToTarget(260, tuning, 'R3')).toBe('R3');
  });

  it('snaps to closest string by hz', () => {
    expect(snapToTarget(440, tuning)).toBe('L9');
  });

  it('returns null if no string within 2 semitones', () => {
    expect(snapToTarget(200, tuning)).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `snapToTarget`**

Add to `src/lib/tuner-logic.ts`:

```ts
export function snapToTarget(
  hz: number,
  tuning: Record<string, { midi: number }>,
  locked?: string,
): string | null {
  if (locked) return locked;
  const midi = 12 * Math.log2(hz / 440) + 69;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, info] of Object.entries(tuning)) {
    const dist = Math.abs(info.midi - midi);
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  return bestDist <= SNAP_MAX_SEMITONES ? best : null;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- --run src/lib/tuner-logic.test.ts`
Expected: All `snapToTarget` tests PASS

- [ ] **Step 8: Write failing tests for `isInTune` and `advanceGuided`**

Add to `src/lib/tuner-logic.test.ts`:

```ts
describe('isInTune', () => {
  it('returns true within threshold', () => {
    expect(isInTune(2)).toBe(true);
    expect(isInTune(-3)).toBe(true);
    expect(isInTune(0)).toBe(true);
  });

  it('returns false outside threshold', () => {
    expect(isInTune(4)).toBe(false);
    expect(isInTune(-3.1)).toBe(false);
  });
});

describe('advanceGuided', () => {
  it('advances from L1 to L2', () => {
    expect(advanceGuided('L1', new Set(['L1']))).toBe('L2');
  });

  it('advances from L11 to R1', () => {
    expect(advanceGuided('L11', new Set(['L11']))).toBe('R1');
  });

  it('advances from R9 to R10', () => {
    expect(advanceGuided('R9', new Set(['R9']))).toBe('R10');
  });

  it('returns null when all tuned', () => {
    const all = new Set([
      ...Array.from({ length: 11 }, (_, i) => `L${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `R${i + 1}`),
    ]);
    expect(advanceGuided('R10', all)).toBeNull();
  });

  it('skips already-tuned strings', () => {
    expect(advanceGuided('L1', new Set(['L1', 'L2', 'L3']))).toBe('L4');
  });
});
```

- [ ] **Step 9: Implement `isInTune` and `advanceGuided`**

Add to `src/lib/tuner-logic.ts`:

```ts
const GUIDED_ORDER: string[] = [
  ...Array.from({ length: 11 }, (_, i) => `L${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `R${i + 1}`),
];

export function isInTune(cents: number): boolean {
  return Math.abs(cents) <= IN_TUNE_CENTS;
}

export function advanceGuided(current: string, tunedSet: Set<string>): string | null {
  const idx = GUIDED_ORDER.indexOf(current);
  for (let i = idx + 1; i < GUIDED_ORDER.length; i++) {
    if (!tunedSet.has(GUIDED_ORDER[i])) return GUIDED_ORDER[i];
  }
  return null;
}
```

- [ ] **Step 10: Run all tests**

Run: `npm test -- --run src/lib/tuner-logic.test.ts`
Expected: All tests PASS

- [ ] **Step 11: Commit**

```bash
git add src/lib/tuner-logic.ts src/lib/tuner-logic.test.ts
git commit -m "feat(tuner): add tuner-logic with centsFromTarget, snapToTarget, isInTune, advanceGuided"
```

---

### Task 2: usePitchStream Hook

**Files:**
- Create: `src/lib/use-pitch-stream.ts`

This hook wraps mic access and continuous pitch detection into a React-friendly interface. It cannot be unit-tested with Vitest (requires browser APIs), so we verify it manually via the Tuner component later.

- [ ] **Step 1: Create the hook**

```ts
// src/lib/use-pitch-stream.ts
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

    start();

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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/use-pitch-stream.ts`
Expected: No errors (or only unrelated ambient type issues)

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-pitch-stream.ts
git commit -m "feat(tuner): add usePitchStream hook for continuous mic pitch detection"
```

---

### Task 3: VibrationLine Component

**Files:**
- Create: `src/components/VibrationLine.tsx`

A presentational component that renders the animated vertical line. Position and vibration are driven by `cents`.

- [ ] **Step 1: Create VibrationLine**

```tsx
// src/components/VibrationLine.tsx
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
        transition: 'left 0.05s linear',
      }}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/VibrationLine.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/VibrationLine.tsx
git commit -m "feat(tuner): add VibrationLine component with cents-proportional vibration"
```

---

### Task 4: Extend BridgeDiagramInteractive with Tuner States

**Files:**
- Modify: `src/components/BridgeDiagramInteractive.tsx`

Add `activeString` and `tunedStrings` props to color-code dots (grey=pending, blue=active, green=tuned).

- [ ] **Step 1: Update Props interface and dot styling**

Replace the full content of `src/components/BridgeDiagramInteractive.tsx` with:

```tsx
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
  return num <= mid ? `${side}⇧${num}` : `${side}⇩${total - num + 1}`;
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
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npm test -- --run`
Expected: All 38 tests PASS (no tests for this component, but nothing should break)

- [ ] **Step 3: Commit**

```bash
git add src/components/BridgeDiagramInteractive.tsx
git commit -m "feat(tuner): extend BridgeDiagramInteractive with activeString and tunedStrings props"
```

---

### Task 5: Tuner View Component

**Files:**
- Create: `src/components/Tuner.tsx`

The main view component that composes everything: mode toggle, note display, bridge diagram with vibration line overlay.

- [ ] **Step 1: Create Tuner.tsx**

```tsx
// src/components/Tuner.tsx
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

  const detected = hz ? snapToTarget(hz, tuning.strings, locked) : null;
  const currentTarget = locked ?? detected ?? target;
  const targetMidi = currentTarget ? tuning.strings[currentTarget]?.midi : null;
  const cents = hz && targetMidi != null ? centsFromTarget(hz, targetMidi) : null;
  const inTune = cents !== null && isInTune(cents);

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
      setTunedStrings(prev => new Set([...prev, currentTarget]));
      const next = advanceGuided(currentTarget, new Set([...tunedStrings, currentTarget]));
      setTarget(next);
      setLocked(null);
      greenSince.current = null;
      return;
    }

    const timer = setTimeout(() => {
      setTunedStrings(prev => new Set([...prev, currentTarget]));
      const next = advanceGuided(currentTarget, new Set([...tunedStrings, currentTarget]));
      setTarget(next);
      setLocked(null);
      greenSince.current = null;
    }, AUTO_ADVANCE_MS - elapsed);

    return () => clearTimeout(timer);
  }, [inTune, currentTarget, mode, tunedStrings]);

  // Reset greenSince when not in tune
  useEffect(() => {
    if (!inTune) greenSince.current = null;
  }, [inTune]);

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
      {/* Mode toggle */}
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

      {/* Start/stop */}
      {!active ? (
        <button onClick={() => setActive(true)}>Start Tuner</button>
      ) : (
        <>
          {/* Note display */}
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

          {/* Bridge + vibration line */}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/Tuner.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Tuner.tsx
git commit -m "feat(tuner): add Tuner view component with mode toggle, auto-advance, and bridge overlay"
```

---

### Task 6: Astro Page and Integration

**Files:**
- Create: `src/pages/tune.astro`

- [ ] **Step 1: Create the tune page**

```astro
---
// src/pages/tune.astro
import Base from '../layouts/Base.astro';
import Tuner from '../components/Tuner.tsx';
---
<Base title="Tune">
  <h1>Kora Tuner</h1>
  <Tuner client:only="react" />
</Base>
```

- [ ] **Step 2: Verify the dev server starts without errors**

Run: `npm run dev` (check for build errors, then stop)
Expected: No build errors, page accessible at `/tune`

- [ ] **Step 3: Run all tests to confirm nothing is broken**

Run: `npm test -- --run`
Expected: All tests PASS (38 existing + new tuner-logic tests)

- [ ] **Step 4: Commit**

```bash
git add src/pages/tune.astro
git commit -m "feat(tuner): add /tune page mounting Tuner component"
```

---

### Task 7: Manual Smoke Test

No code changes — verify the feature works end-to-end in the browser.

- [ ] **Step 1: Open http://localhost:4321/tune**

- [ ] **Step 2: Click "Start Tuner" and allow mic permission**

- [ ] **Step 3: Verify guided mode works**
- Play a note near L1 (F2, ~87 Hz) — line should appear and drift based on pitch
- Adjust until green — should auto-advance to L2 after ~1s

- [ ] **Step 4: Verify free mode works**
- Switch to Free mode
- Click any string dot — tuner locks to that target
- Play the corresponding note — line responds

- [ ] **Step 5: Verify vibration behavior**
- When far off-pitch, line should shake noticeably
- When near in-tune, line should be nearly still

- [ ] **Step 6: Verify mobile layout**
- Open browser dev tools, toggle device toolbar (mobile viewport)
- Confirm single-column layout works, all elements visible
