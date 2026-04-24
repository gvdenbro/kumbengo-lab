# Kora Tablature Site — Revised Implementation Plan v2

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Revision reason:** Deep analysis of the strudel.cc Astro website source (Codeberg) revealed the correct architecture for integrating strudel audio + visualization. The previous attempts failed because we used the `@strudel/web` CDN bundle which doesn't expose the scheduler or draw system. The strudel website uses the npm packages directly (`@strudel/core`, `@strudel/webaudio`, `@strudel/draw`) and wires them together with `repl()` + `Drawer` + `editPattern`.

**Goal:** Build a static site that lets kora beginners browse pieces, view printable tablature, and play back pieces interactively with a bridge diagram and timeline.

**Architecture:** Astro static site. YAML piece files are the single source of truth. Audio uses strudel npm packages directly (not CDN): `@strudel/core` for the pattern engine + scheduler, `@strudel/webaudio` for audio output + sample loading, `@strudel/draw` for the animation loop synced to the scheduler. A React island component handles the interactive player.

**Key learnings from strudel.cc source:**

1. **MiniRepl pattern:** The strudel website embeds playable patterns in Astro pages using a React component (`MiniRepl.jsx`) hydrated with `client:only="react"`. It creates a `repl()` instance (scheduler + pattern engine) and a `Drawer` instance (rAF loop synced to scheduler).

2. **editPattern hook:** The `repl()` function accepts an `editPattern` callback that transforms the pattern before it reaches the scheduler. This is where `.onTrigger(callback, false)` and `.onPaint(painter)` are attached — the pattern flows through audio AND custom visualization.

3. **Drawer class:** From `@strudel/draw`, the `Drawer` wraps `requestAnimationFrame` and reads `scheduler.now()` each frame. It queries the pattern for visible haps, filters by time window, and calls registered `onPaint` painters. This is how the pianoroll stays synced to audio.

4. **Sample loading:** VCSL samples (folkharp) are loaded via `samples('https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/', { prebake: true })` from `@strudel/webaudio`. The `samples()` function handles pitched sample maps (note-keyed objects) and registers them in the global sound map.

5. **Tempo control:** The `Cyclist` scheduler has `setCps(cps)` method. The `repl()` function returns `{ scheduler, setPattern, ... }`. Direct access to `scheduler.setCps()` is the correct way to change tempo.

6. **No CodeMirror needed:** We don't need the editor. We use `repl()` directly with `webaudioOutput`, attach `editPattern` for our custom visualization hooks, and call `scheduler.setPattern(pattern, true)` to play.

**Tech Stack:** Astro 6, TypeScript, React (for player island), @strudel/core + @strudel/webaudio + @strudel/draw (npm), Vitest, Cloudflare Pages.

---

## Existing work to keep

Tasks 1–6 from the original plan are implemented and working:
- Project scaffolding (Astro, mise, vitest, AGPL-3.0)
- Tuning data & lookup logic (with tests)
- Piece content schema & sample data (Jarabi, Mali Sadio, Mad World)
- Library page (homepage)
- Piece detail page & static tablature
- Notation toggle (position vs note name)

---

### Task 7: Install strudel npm packages and React

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`

**Step 1: Install dependencies**

```bash
npm install @strudel/core @strudel/webaudio @strudel/draw @astrojs/react react react-dom
npm install -D @types/react @types/react-dom
```

**Step 2: Add React integration to Astro config**

Update `astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  site: 'https://kumbengo-lab.pages.dev',
  integrations: [react()],
  vite: { plugins: [yaml()] },
});
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
jj describe -m "chore: add strudel npm packages and React integration"
jj new
```

---

### Task 8: Player React Component

**Files:**
- Create: `src/components/Player.tsx`
- Modify: `src/pages/pieces/[slug].astro`

**Approach:** Create a React island component that:
1. Creates a `repl()` instance with `webaudioOutput`
2. Loads folkharp samples via `samples()` in a prebake step
3. Builds a strudel pattern from the piece's step data
4. Uses `editPattern` to attach `onTrigger(callback, false)` for bridge/timeline sync
5. Exposes play/stop/tempo controls

**Step 1: Create the Player component**

Create `src/components/Player.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { repl, noteToMidi } from '@strudel/core';
import { webaudioOutput, initAudioOnFirstClick, getAudioContext, samples, registerSynthSounds } from '@strudel/webaudio';

interface Step {
  t: number;
  string?: string;
  strings?: string[];
}

interface Layer {
  name: string;
  difficulty: string;
  steps: Step[];
}

interface Props {
  layers: Layer[];
  tuning: Record<string, { midi: number }>;
  tempo: number;
}

export default function Player({ layers, tuning, tempo }: Props) {
  const replRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(true);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [layerIndex, setLayerIndex] = useState(0);
  const [ready, setReady] = useState(false);

  // Initialize repl once
  useEffect(() => {
    const audioReady = initAudioOnFirstClick();
    const r = repl({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      editPattern: (pat) => {
        return pat.onTrigger((hap, deadline, duration, cps, t) => {
          // Fire custom event for bridge diagram and timeline sync
          const value = hap.value || {};
          const stepIndex = value._stepIndex;
          const strings = value._strings;
          if (stepIndex !== undefined) {
            document.dispatchEvent(new CustomEvent('player-step', {
              detail: { index: stepIndex, strings: strings || [] }
            }));
          }
        }, false); // false = don't suppress audio output
      },
      beforeStart: () => audioReady,
    });

    // Load samples
    Promise.all([
      registerSynthSounds(),
      samples('https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/', { prebake: true }),
    ]).then(() => setReady(true));

    replRef.current = r;
    return () => r.scheduler.stop();
  }, []);

  const getStepStrings = (step: Step): string[] => {
    return step.strings || (step.string ? [step.string] : []);
  };

  const getMidi = (s: string): number => {
    return tuning[s]?.midi ?? 60;
  };

  const buildAndPlay = useCallback(() => {
    const r = replRef.current;
    if (!r || !ready) return;

    const steps = layers[layerIndex].steps;
    const tempoMul = tempoPercent / 100;
    const lastT = steps[steps.length - 1].t;
    const totalBeats = lastT + 0.5;
    const cps = (tempoMul * tempo) / 60 / totalBeats;

    // Build pattern: sequence of note events at correct beat positions
    // Use 0.5-beat resolution slots
    const resolution = 0.5;
    const slots = Math.round(totalBeats / resolution);

    // Create pattern using strudel's core API
    // Each slot is a mini-pattern value with midi note(s) + metadata
    const { Pattern, pure, silence, stack, seq, cat } = require('@strudel/core');

    // Build slot patterns
    const slotPatterns = [];
    const stepMap: Record<number, { index: number; strings: string[] }> = {};

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const strings = getStepStrings(step);
      const slotIdx = Math.round(step.t / resolution);
      stepMap[slotIdx] = { index: i, strings };
    }

    for (let s = 0; s < slots; s++) {
      if (stepMap[s]) {
        const { index, strings } = stepMap[s];
        const midiNotes = strings.map(getMidi);
        if (midiNotes.length === 1) {
          slotPatterns.push(pure({
            note: midiNotes[0],
            s: 'folkharp',
            _stepIndex: index,
            _strings: strings,
          }));
        } else {
          // Stack simultaneous notes
          slotPatterns.push(stack(
            ...midiNotes.map((m, j) => pure({
              note: m,
              s: 'folkharp',
              _stepIndex: index,
              _strings: strings,
            }))
          ));
        }
      } else {
        slotPatterns.push(silence);
      }
    }

    const pattern = cat(...slotPatterns);
    r.scheduler.setCps(cps);
    r.scheduler.setPattern(pattern, true);
    setPlaying(true);
  }, [ready, layerIndex, tempoPercent, layers, tuning, tempo]);

  const stop = useCallback(() => {
    replRef.current?.scheduler.stop();
    setPlaying(false);
    // Clear visuals
    document.querySelectorAll('.string-dot').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.timeline-step').forEach(d => {
      d.classList.remove('current', 'past');
    });
  }, []);

  const handleTempoChange = (value: number) => {
    setTempoPercent(value);
    if (playing) {
      const tempoMul = value / 100;
      const steps = layers[layerIndex].steps;
      const lastT = steps[steps.length - 1].t;
      const totalBeats = lastT + 0.5;
      const cps = (tempoMul * tempo) / 60 / totalBeats;
      replRef.current?.scheduler.setCps(cps);
    }
  };

  const handleLayerChange = (idx: number) => {
    setLayerIndex(idx);
    if (playing) {
      stop();
    }
  };

  return (
    <div id="player">
      <button onClick={playing ? stop : buildAndPlay} disabled={!ready}>
        {!ready ? '⏳ Loading…' : playing ? '■ Stop' : '▶ Play'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={looping}
          onChange={(e) => setLooping(e.target.checked)}
        /> Loop
      </label>
      <label>
        Tempo: <input
          type="range"
          min={50}
          max={150}
          value={tempoPercent}
          onInput={(e) => handleTempoChange(Number((e.target as HTMLInputElement).value))}
        />
        <span>{tempoPercent}%</span>
      </label>
    </div>
  );
}
```

Note: The `require('@strudel/core')` in the callback is a placeholder — the actual implementation should use imports at the top level. The pattern construction uses strudel's `cat()` (concatenate) and `stack()` (simultaneous) combinators to build the sequence from step data.

**Step 2: Wire Player into piece page**

Replace the current inline `<script>` player in `src/pages/pieces/[slug].astro` with:

```astro
<Player
  client:only="react"
  layers={layers}
  tuning={tunings[tuning]}
  tempo={tempo}
/>
```

Import the tuning data in the frontmatter and pass it as a prop. The `client:only="react"` directive ensures the component only runs in the browser (no SSR issues with Web Audio).

**Step 3: Handle loop toggle**

In the Player component, use the `Drawer` from `@strudel/draw` to track cycle position. When `looping` is false and a cycle completes, call `stop()`:

```tsx
// Inside the Drawer's frame callback or a rAF loop:
const phase = scheduler.now();
const cycle = Math.floor(phase);
if (!looping && cycle > 0) {
  stop();
}
```

**Step 4: Verify audio plays with correct folkharp sound**

Run: `npm run dev`
Navigate to a piece page. Click Play.
Expected: Folkharp samples play at correct pitches. Tempo slider changes speed in real-time. Loop toggle works.

**Step 5: Commit**

```bash
jj describe -m "feat: add Player react component with strudel audio engine"
jj new
```

---

### Task 9: Bridge Diagram & Timeline Sync

**Files:**
- Keep: `src/components/BridgeDiagram.astro` (already listens for `player-step` events)
- Keep: `src/components/TimelineStrip.astro` (already listens for `player-step` events)

**Approach:** The Player component's `editPattern` callback already attaches `onTrigger(callback, false)` which dispatches `player-step` custom events with `{ index, strings }`. The existing BridgeDiagram and TimelineStrip components already listen for these events. This task is about verifying the sync works correctly.

**Step 1: Verify bridge diagram highlights in sync**

Play a piece. Watch the bridge diagram.
Expected: String dots highlight at the exact moment each note sounds. Multiple simultaneous strings highlight together.

**Step 2: Verify timeline strip scrolls in sync**

Play a piece. Watch the timeline strip.
Expected: Current step highlights blue, past steps fade. Auto-scrolls to keep current step visible.

**Step 3: Fix any timing issues**

If visuals are slightly ahead of audio (because `onTrigger` fires at schedule time, not playback time), add a small delay to the event dispatch matching the scheduler's latency (~100ms).

**Step 4: Commit**

```bash
jj describe -m "feat: verify bridge diagram and timeline sync with audio"
jj new
```

---

### Task 10: Layer Selector Integration

**Files:**
- Modify: `src/pages/pieces/[slug].astro`

**Step 1: Wire layer selector to Player**

The layer selector (`<select id="layer-select">`) needs to communicate with the React Player component. Options:
- Pass `layerIndex` as a prop and use a custom event to update it
- Or move the layer selector into the Player component

Simplest: move the layer selector into the Player component so it's all in one React tree.

**Step 2: Verify layer switching stops and restarts playback**

Expected: Changing layers while playing stops playback. Pressing play again uses the new layer.

**Step 3: Commit**

```bash
jj describe -m "feat: integrate layer selector with player component"
jj new
```

---

### Task 11: Cleanup & Polish

**Files:**
- Remove: `src/pages/test/strudel.astro`
- Remove: `src/data/folkharp-samples.json`
- Remove: unused `@strudel/web` CDN script tags
- Verify: all 3 pieces work correctly

**Step 1: Remove test files and unused code**

**Step 2: Verify all pieces**

Test Jarabi, Mali Sadio, Mad World:
- Folkharp sound ✓
- Tempo slider ✓
- Loop toggle ✓
- Bridge diagram sync ✓
- Timeline sync ✓
- Layer selector ✓
- Notation toggle ✓
- Print mode ✓

**Step 3: Run build and tests**

```bash
npm run build && npm test
```

**Step 4: Commit**

```bash
jj describe -m "chore: cleanup test files and verify all pieces"
jj new
```

---

### Task 12: Deploy to Cloudflare Pages

(Unchanged from original plan)

**Step 1: Verify build output**

```bash
npm run build
ls dist/
```

Expected: Static HTML files for all pages, JS bundles for React islands.

**Step 2: Deploy**

Set `CLOUDFLARE_API_TOKEN` and run:
```bash
npx wrangler pages deploy dist --project-name kumbengo-lab
```

Or connect via Cloudflare dashboard with build command `npm run build`, output `dist`.
