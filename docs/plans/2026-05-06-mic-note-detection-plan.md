# Mic-Based Note Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to assign kora strings by plucking their instrument into the laptop mic during the transcription assign phase.

**Architecture:** New `pitch-detect.ts` module wraps pitchfinder's YIN algorithm behind a mic-open/listen/close API. Transcriber component manages mic lifecycle on assign phase entry/exit, spacebar triggers a 3s listening window that resolves early on stable detection.

**Tech Stack:** pitchfinder (YIN), Web Audio API (getUserMedia + AnalyserNode), existing React Transcriber component.

---

### Task 1: Install pitchfinder

**Step 1: Add dependency**

Run: `npm install pitchfinder@2.0.2`

**Step 2: Verify install**

Run: `npm ls pitchfinder`
Expected: `pitchfinder@2.0.2`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add pitchfinder for mic-based pitch detection"
```

---

### Task 2: Create pitch-detect module with tests

**Files:**
- Create: `src/lib/pitch-detect.ts`
- Create: `src/lib/pitch-detect.test.ts`

**Step 1: Write the tests**

```typescript
// src/lib/pitch-detect.test.ts
import { describe, it, expect } from 'vitest';
import { hzToMidi, snapToString } from './pitch-detect';

describe('hzToMidi', () => {
  it('converts 440Hz to MIDI 69', () => {
    expect(hzToMidi(440)).toBe(69);
  });

  it('converts 261.63Hz to MIDI 60', () => {
    expect(hzToMidi(261.63)).toBe(60);
  });

  it('converts 87.31Hz to MIDI 41', () => {
    expect(hzToMidi(87.31)).toBe(41);
  });
});

describe('snapToString', () => {
  const tuning = {
    L1: { midi: 41 }, L7: { midi: 62 }, R3: { midi: 60 },
    R5: { midi: 67 }, L9: { midi: 69 },
  };

  it('snaps exact MIDI to correct string', () => {
    expect(snapToString(69, tuning)).toBe('L9');
  });

  it('snaps nearby MIDI to closest string', () => {
    expect(snapToString(68, tuning)).toBe('L9'); // 69 is closer than 67
  });

  it('returns null if no string within 2 semitones', () => {
    expect(snapToString(50, tuning)).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `hzToMidi` and `snapToString` not found

**Step 3: Write the implementation**

```typescript
// src/lib/pitch-detect.ts
import { YIN } from 'pitchfinder';

export interface MicHandle {
  stream: MediaStream;
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

const LISTEN_TIMEOUT = 3000;
const STABLE_FRAMES = 3;
const AMPLITUDE_THRESHOLD = 0.02;
const SNAP_MAX_DISTANCE = 2; // semitones

export function hzToMidi(hz: number): number {
  return Math.round(12 * Math.log2(hz / 440) + 69);
}

export function snapToString(
  midi: number,
  tuning: Record<string, { midi: number }>,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, info] of Object.entries(tuning)) {
    const dist = Math.abs(info.midi - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return bestDist <= SNAP_MAX_DISTANCE ? best : null;
}

export async function openMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  return { stream, ctx, analyser, source };
}

export function closeMic(handle: MicHandle): void {
  handle.source.disconnect();
  handle.stream.getTracks().forEach(t => t.stop());
  handle.ctx.close();
}

export function listenForNote(
  handle: MicHandle,
  tuning: Record<string, { midi: number }>,
): Promise<string | null> {
  const detect = YIN({ sampleRate: handle.ctx.sampleRate });
  const buf = new Float32Array(handle.analyser.fftSize);
  let stableCount = 0;
  let lastMidi = -1;

  return new Promise(resolve => {
    const deadline = setTimeout(() => { cleanup(); resolve(null); }, LISTEN_TIMEOUT);

    const interval = setInterval(() => {
      handle.analyser.getFloatTimeDomainData(buf);

      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      if (rms < AMPLITUDE_THRESHOLD) { stableCount = 0; return; }

      const freq = detect(buf);
      if (freq === null || freq < 80 || freq > 2000) { stableCount = 0; return; }

      const midi = hzToMidi(freq);
      if (Math.abs(midi - lastMidi) <= 1) {
        stableCount++;
      } else {
        stableCount = 1;
        lastMidi = midi;
      }

      if (stableCount >= STABLE_FRAMES) {
        cleanup();
        resolve(snapToString(lastMidi, tuning));
      }
    }, 50);

    function cleanup() {
      clearTimeout(deadline);
      clearInterval(interval);
    }
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/pitch-detect.ts src/lib/pitch-detect.test.ts
git commit -m "feat: add pitch-detect module with YIN-based mic detection"
```

---

### Task 3: Integrate mic detection into Transcriber assign phase

**Files:**
- Modify: `src/components/Transcriber.tsx`

**Step 1: Add mic lifecycle and detection state**

At the top of the component, add imports and state:

```typescript
import { openMic, closeMic, listenForNote, type MicHandle } from '../lib/pitch-detect';
```

Add refs/state inside the component:

```typescript
const micRef = useRef<MicHandle | null>(null);
const [listening, setListening] = useState(false);
const [detectedString, setDetectedString] = useState<string | null>(null);
```

Add effect to open/close mic on assign phase:

```typescript
useEffect(() => {
  if (phase !== 'assign') return;
  let handle: MicHandle | null = null;
  openMic().then(h => { handle = h; micRef.current = h; }).catch(() => {});
  return () => { if (handle) { closeMic(handle); micRef.current = null; } };
}, [phase]);
```

**Step 2: Add listen trigger function**

```typescript
const startListening = useCallback(async () => {
  if (!micRef.current || listening) return;
  setListening(true);
  setDetectedString(null);
  const result = await listenForNote(micRef.current, tuning);
  setDetectedString(result);
  setListening(false);
}, [listening, tuning]);
```

**Step 3: Add spacebar and Enter handling in assign phase keyboard effect**

Extend the existing assign-phase keyboard effect to handle spacebar (listen) and Enter (confirm detection):

```typescript
if (e.code === 'Space') {
  e.preventDefault();
  startListening();
  return;
}
if (e.key === 'Enter' && detectedString) {
  e.preventDefault();
  assignString(detectedString);
  setDetectedString(null);
  return;
}
```

**Step 4: Add detection UI in assign phase render**

Below the bridge diagram, add a status display:

```tsx
<p style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
  {listening ? '🎤 Listening...' : detectedString ? `Detected: ${detectedString} — Enter to confirm` : '⎵ Space to listen'}
</p>
```

**Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no type errors

**Step 6: Commit**

```bash
git add src/components/Transcriber.tsx
git commit -m "feat: mic-based note detection in transcription assign phase

Spacebar triggers 3s listening window with early resolve.
Enter confirms detected string. Bridge diagram click still works."
```

---

### Task 4: Manual testing

**Step 1:** Run `npm run dev`, navigate to `/transcribe`
**Step 2:** Load an audio file, tap or import labels, confirm rhythm
**Step 3:** In assign phase: press spacebar, pluck a kora string, verify detection shows correct string
**Step 4:** Press Enter, verify it assigns and advances
**Step 5:** Verify bridge diagram click still works
**Step 6:** Verify navigating away from assign phase closes mic (check browser mic indicator)
