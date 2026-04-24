# Kora Tablature Site Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static site that lets kora beginners browse pieces, view printable tablature, and play back pieces interactively with a bridge diagram and timeline.

**Architecture:** Astro static site with island components for interactivity. YAML piece files are the single source of truth. Superdough generates audio client-side. Deployed to Cloudflare Pages.

**Tech Stack:** Astro 6, TypeScript, @strudel/webaudio (superdough), Vitest, @astrojs/cloudflare

---

### Task 1: Project Scaffolding

**Files:**
- Create: `.mise.toml`
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/pages/index.astro`
- Create: `LICENSE`

**Step 1: Pin tooling with mise**

Create `.mise.toml`:
```toml
[tools]
node = "22"
```

Run:
```bash
mise install
mise trust
node --version
```
Expected: Node 22.x installed and active in this directory.

**Step 2: Initialize Astro project**

Run:
```bash
npx create-astro@latest . -- --template minimal --no-install --typescript strict
```

**Step 3: Install dependencies**

Run:
```bash
npm install @astrojs/cloudflare
npm install -D vitest
```

**Step 3: Configure Astro for Cloudflare static output**

Replace `astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://kumbengo-lab.pages.dev',
});
```

**Step 4: Add AGPL-3.0 license file**

Create `LICENSE` with AGPL-3.0 text.

**Step 5: Add vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 6: Add scripts to package.json**

Add to `scripts`:
```json
{
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**Step 7: Verify build works**

Run: `npm run build`
Expected: Build succeeds, outputs to `dist/`

**Step 8: Commit**

```bash
jj describe -m "chore: scaffold Astro project with vitest and cloudflare config"
jj new
```

---

### Task 2: Tuning Data & Lookup Logic

**Files:**
- Create: `src/data/tunings.yaml`
- Create: `src/lib/tuning.ts`
- Create: `src/lib/tuning.test.ts`

**Step 1: Write the tuning YAML**

Create `src/data/tunings.yaml`:
```yaml
silaba:
  name: Silaba (F major)
  strings:
    L1:  { note: F2,  midi: 41 }
    L2:  { note: C3,  midi: 48 }
    L3:  { note: D3,  midi: 50 }
    L4:  { note: E3,  midi: 52 }
    L5:  { note: G3,  midi: 55 }
    L6:  { note: Bb3, midi: 58 }
    L7:  { note: D4,  midi: 62 }
    L8:  { note: F4,  midi: 65 }
    L9:  { note: A4,  midi: 69 }
    L10: { note: C5,  midi: 72 }
    L11: { note: E5,  midi: 76 }
    R1:  { note: F3,  midi: 53 }
    R2:  { note: A3,  midi: 57 }
    R3:  { note: C4,  midi: 60 }
    R4:  { note: E4,  midi: 64 }
    R5:  { note: G4,  midi: 67 }
    R6:  { note: Bb4, midi: 70 }
    R7:  { note: D5,  midi: 74 }
    R8:  { note: F5,  midi: 77 }
    R9:  { note: G5,  midi: 79 }
    R10: { note: A5,  midi: 81 }
```

**Step 2: Write failing tests for tuning lookup and display logic**

Create `src/lib/tuning.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getTuning, getStringLabel, getMidiNote } from './tuning';

describe('getTuning', () => {
  it('returns silaba tuning', () => {
    const t = getTuning('silaba');
    expect(t.name).toBe('Silaba (F major)');
    expect(Object.keys(t.strings)).toHaveLength(21);
  });

  it('throws for unknown tuning', () => {
    expect(() => getTuning('unknown')).toThrow();
  });
});

describe('getMidiNote', () => {
  it('returns correct midi for L1 silaba', () => {
    expect(getMidiNote('silaba', 'L1')).toBe(41);
  });

  it('returns correct midi for R10 silaba', () => {
    expect(getMidiNote('silaba', 'R10')).toBe(81);
  });
});

describe('getStringLabel', () => {
  it('position mode: L1 stays L1 (close)', () => {
    expect(getStringLabel('L1', 'position')).toBe('L1');
  });

  it('position mode: L11 becomes L1 (far)', () => {
    expect(getStringLabel('L11', 'position')).toBe('L1 (far)');
  });

  it('position mode: L6 stays L6 (threshold)', () => {
    expect(getStringLabel('L6', 'position')).toBe('L6');
  });

  it('position mode: L7 flips to L5 (far)', () => {
    expect(getStringLabel('L7', 'position')).toBe('L5 (far)');
  });

  it('position mode: R6 flips to R5 (far)', () => {
    expect(getStringLabel('R6', 'position')).toBe('R5 (far)');
  });

  it('position mode: R5 stays R5', () => {
    expect(getStringLabel('R5', 'position')).toBe('R5');
  });

  it('note mode: returns note name from tuning', () => {
    expect(getStringLabel('L1', 'note', 'silaba')).toBe('F2');
  });

  it('note mode: returns note name for R10', () => {
    expect(getStringLabel('R10', 'note', 'silaba')).toBe('A5');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found

**Step 4: Implement tuning lookup**

Create `src/lib/tuning.ts`:
```ts
import tuningsRaw from '../data/tunings.yaml';

export interface StringInfo {
  note: string;
  midi: number;
}

export interface Tuning {
  name: string;
  strings: Record<string, StringInfo>;
}

const tunings: Record<string, Tuning> = tuningsRaw as any;

export function getTuning(id: string): Tuning {
  const t = tunings[id];
  if (!t) throw new Error(`Unknown tuning: ${id}`);
  return t;
}

export function getMidiNote(tuningId: string, stringId: string): number {
  return getTuning(tuningId).strings[stringId].midi;
}

const LEFT_COUNT = 11;
const RIGHT_COUNT = 10;

export function getStringLabel(
  stringId: string,
  mode: 'position' | 'note',
  tuningId?: string,
): string {
  if (mode === 'note') {
    if (!tuningId) throw new Error('tuningId required for note mode');
    return getTuning(tuningId).strings[stringId].note;
  }

  const side = stringId[0] as 'L' | 'R';
  const num = parseInt(stringId.slice(1), 10);
  const total = side === 'L' ? LEFT_COUNT : RIGHT_COUNT;
  const threshold = Math.ceil(total / 2);

  if (num <= threshold) return `${side}${num}`;

  const fromFar = total - num + 1;
  return `${side}${fromFar} (far)`;
}
```

**Step 5: Install YAML loader for Vite**

Run: `npm install -D @rollup/plugin-yaml`

Add to `astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  output: 'static',
  site: 'https://kumbengo-lab.pages.dev',
  vite: { plugins: [yaml()] },
});
```

Add to `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  plugins: [yaml()],
  test: { include: ['src/**/*.test.ts'] },
});
```

**Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: All 10 tests PASS

**Step 7: Commit**

```bash
jj describe -m "feat: add tuning data and string label logic with tests"
jj new
```

---

### Task 3: Piece Content Schema & Sample Data

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/pieces/jarabi.yaml`
- Create: `src/lib/piece.test.ts`

**Step 1: Define Astro content collection schema**

Create `src/content.config.ts`:
```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const stepSchema = z.object({
  t: z.number(),
  string: z.string().optional(),
  strings: z.array(z.string()).optional(),
}).refine(d => d.string || d.strings, {
  message: 'Each step needs string or strings',
});

const layerSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  steps: z.array(stepSchema),
});

const pieces = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/pieces' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    tuning: z.string(),
    tempo: z.number(),
    tags: z.array(z.string()),
    layers: z.array(layerSchema).min(1),
  }),
});

export const collections = { pieces };
```

**Step 2: Create sample piece**

Create `src/content/pieces/jarabi.yaml`:
```yaml
title: Jarabi
slug: jarabi
difficulty: intermediate
tuning: silaba
tempo: 90
tags: [traditional, mandinka]

layers:
  - name: Melody only
    difficulty: beginner
    steps:
      - { t: 0,    string: L4 }
      - { t: 0.5,  string: R2 }
      - { t: 1,    string: L5 }
      - { t: 1.5,  string: R3 }
      - { t: 2,    string: L6 }
      - { t: 2.5,  string: R2 }
      - { t: 3,    string: L4 }
      - { t: 3.5,  string: R1 }

  - name: Melody + bass
    difficulty: intermediate
    steps:
      - { t: 0,    strings: [L1, L4] }
      - { t: 0.5,  string: R2 }
      - { t: 1,    strings: [L2, L5] }
      - { t: 1.5,  string: R3 }
      - { t: 2,    strings: [L1, L6] }
      - { t: 2.5,  string: R2 }
      - { t: 3,    strings: [L2, L4] }
      - { t: 3.5,  string: R1 }
```

Note: This is placeholder data to validate the schema and build pipeline. Real Jarabi notation will be added later.

**Step 3: Verify build succeeds with content collection**

Run: `npm run build`
Expected: Build succeeds, piece data is loaded and validated

**Step 4: Write test for piece data access**

Create `src/lib/piece.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getStepStrings } from './piece';

describe('getStepStrings', () => {
  it('returns array for single string', () => {
    expect(getStepStrings({ t: 0, string: 'L4' })).toEqual(['L4']);
  });

  it('returns array for multiple strings', () => {
    expect(getStepStrings({ t: 0, strings: ['L1', 'L4'] })).toEqual(['L1', 'L4']);
  });
});
```

**Step 5: Implement helper**

Create `src/lib/piece.ts`:
```ts
export interface Step {
  t: number;
  string?: string;
  strings?: string[];
}

export function getStepStrings(step: Step): string[] {
  if (step.strings) return step.strings;
  if (step.string) return [step.string];
  return [];
}
```

**Step 6: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 7: Commit**

```bash
jj describe -m "feat: add piece content collection schema and sample Jarabi data"
jj new
```

---

### Task 4: Library Page (Homepage)

**Files:**
- Create: `src/layouts/Base.astro`
- Modify: `src/pages/index.astro`

**Step 1: Create base layout**

Create `src/layouts/Base.astro`:
```astro
---
interface Props { title: string; }
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} — Kumbengo Lab</title>
  <style is:global>
    *, *::before, *::after { box-sizing: border-box; margin: 0; }
    body {
      font-family: system-ui, sans-serif;
      line-height: 1.6;
      max-width: 48rem;
      margin: 0 auto;
      padding: 1rem;
      color: #1a1a1a;
      background: #fafaf8;
    }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <header>
    <a href="/"><strong>Kumbengo Lab</strong></a>
    <p>Learn the kora, one piece at a time</p>
  </header>
  <main>
    <slot />
  </main>
</body>
</html>
```

**Step 2: Create library page**

Replace `src/pages/index.astro`:
```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';

const pieces = await getCollection('pieces');
const sorted = pieces.sort((a, b) => {
  const order = { beginner: 0, intermediate: 1, advanced: 2 };
  return order[a.data.difficulty] - order[b.data.difficulty];
});
---
<Base title="Pieces">
  <h1>Pieces</h1>
  <ul role="list" style="list-style:none;padding:0;">
    {sorted.map((piece) => (
      <li style="margin-bottom:1rem;padding:1rem;border:1px solid #e5e5e5;border-radius:0.5rem;">
        <a href={`/pieces/${piece.data.slug}/`}>
          <strong>{piece.data.title}</strong>
        </a>
        <span style="margin-left:0.5rem;font-size:0.875rem;color:#666;">
          {piece.data.difficulty}
        </span>
        <div style="font-size:0.875rem;color:#888;">
          {piece.data.tags.join(', ')}
        </div>
      </li>
    ))}
  </ul>
</Base>
```

**Step 3: Verify dev server shows the page**

Run: `npm run dev`
Expected: Homepage lists Jarabi with difficulty and tags

**Step 4: Commit**

```bash
jj describe -m "feat: add base layout and piece library homepage"
jj new
```

---

### Task 5: Piece Detail Page & Static Tablature

**Files:**
- Create: `src/pages/pieces/[slug].astro`
- Create: `src/components/TablatureView.astro`
- Create: `src/components/NotationToggle.astro`

**Step 1: Create tablature view component**

Create `src/components/TablatureView.astro`:
```astro
---
interface Step {
  t: number;
  string?: string;
  strings?: string[];
}
interface Props {
  steps: Step[];
  tuning: string;
}
const { steps, tuning } = Astro.props;

function stepStrings(step: Step): string[] {
  return step.strings ?? (step.string ? [step.string] : []);
}
---
<div class="tablature" data-tuning={tuning}>
  <table>
    <thead>
      <tr>
        <th>Beat</th>
        <th>Left</th>
        <th>Right</th>
      </tr>
    </thead>
    <tbody>
      {steps.map((step) => {
        const strings = stepStrings(step);
        const left = strings.filter(s => s.startsWith('L'));
        const right = strings.filter(s => s.startsWith('R'));
        return (
          <tr data-beat={step.t}>
            <td>{step.t}</td>
            <td>{left.join(', ') || '—'}</td>
            <td>{right.join(', ') || '—'}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>

<style>
  .tablature table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .tablature th, .tablature td {
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid #e5e5e5;
    text-align: center;
  }
  .tablature th { font-size: 0.75rem; color: #888; }
  @media print {
    .tablature { break-inside: avoid; }
  }
</style>
```

**Step 2: Create piece detail page**

Create `src/pages/pieces/[slug].astro`:
```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import TablatureView from '../../components/TablatureView.astro';

export async function getStaticPaths() {
  const pieces = await getCollection('pieces');
  return pieces.map((piece) => ({
    params: { slug: piece.data.slug },
    props: { piece },
  }));
}

const { piece } = Astro.props;
const { title, difficulty, tuning, tempo, tags, layers } = piece.data;
---
<Base title={title}>
  <a href="/">← Back to pieces</a>
  <h1>{title}</h1>
  <p>
    <span>{difficulty}</span> · <span>{tempo} BPM</span> · <span>{tags.join(', ')}</span>
  </p>

  <div id="layer-selector">
    <label for="layer-select">Layer:</label>
    <select id="layer-select">
      {layers.map((layer, i) => (
        <option value={i}>{layer.name} ({layer.difficulty})</option>
      ))}
    </select>
  </div>

  {layers.map((layer, i) => (
    <div class="layer-tab" data-layer={i} style={i > 0 ? 'display:none' : ''}>
      <TablatureView steps={layer.steps} tuning={tuning} />
    </div>
  ))}

  <button onclick="window.print()" class="print-btn">Print tablature</button>

  <script>
    const select = document.getElementById('layer-select') as HTMLSelectElement;
    const tabs = document.querySelectorAll('.layer-tab');
    select?.addEventListener('change', () => {
      tabs.forEach((tab, i) => {
        (tab as HTMLElement).style.display = i === select.selectedIndex ? '' : 'none';
      });
    });
  </script>

  <style>
    .print-btn {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
    }
    @media print {
      .print-btn, #layer-selector, a { display: none; }
    }
  </style>
</Base>
```

**Step 3: Verify in dev server**

Run: `npm run dev`
Navigate to: `http://localhost:4321/pieces/jarabi/`
Expected: Piece page shows title, metadata, layer selector, tablature table, print button

**Step 4: Verify print mode**

Press Ctrl+P on the piece page.
Expected: Only tablature table visible, no buttons or navigation

**Step 5: Commit**

```bash
jj describe -m "feat: add piece detail page with static tablature and layer selector"
jj new
```

---

### Task 6: Notation Toggle (Position vs Note Name)

**Files:**
- Create: `src/components/NotationToggle.astro`
- Modify: `src/components/TablatureView.astro`
- Modify: `src/pages/pieces/[slug].astro`

**Step 1: Create notation toggle component**

Create `src/components/NotationToggle.astro`:
```astro
<div class="notation-toggle">
  <label>
    <input type="radio" name="notation" value="position" checked /> String position
  </label>
  <label>
    <input type="radio" name="notation" value="note" /> Note name
  </label>
</div>

<script>
  const radios = document.querySelectorAll('input[name="notation"]');
  const saved = localStorage.getItem('notation-mode');
  if (saved) {
    radios.forEach((r) => {
      (r as HTMLInputElement).checked = (r as HTMLInputElement).value === saved;
    });
  }
  radios.forEach((r) => {
    r.addEventListener('change', (e) => {
      const mode = (e.target as HTMLInputElement).value;
      localStorage.setItem('notation-mode', mode);
      document.dispatchEvent(new CustomEvent('notation-change', { detail: mode }));
    });
  });
  // Fire initial event
  const initial = saved || 'position';
  document.addEventListener('DOMContentLoaded', () => {
    document.dispatchEvent(new CustomEvent('notation-change', { detail: initial }));
  });
</script>

<style>
  .notation-toggle { margin: 0.5rem 0; font-size: 0.875rem; }
  .notation-toggle label { margin-right: 1rem; }
  @media print { .notation-toggle { display: none; } }
</style>
```

**Step 2: Add data attributes to tablature cells for both modes**

Modify `src/components/TablatureView.astro` — update the `<td>` cells to include data attributes:

Replace the `<tbody>` section:
```astro
    <tbody>
      {steps.map((step) => {
        const strings = stepStrings(step);
        const left = strings.filter(s => s.startsWith('L'));
        const right = strings.filter(s => s.startsWith('R'));
        return (
          <tr data-beat={step.t}>
            <td>{step.t}</td>
            <td class="note-cell" data-strings={JSON.stringify(left)}>{left.join(', ') || '—'}</td>
            <td class="note-cell" data-strings={JSON.stringify(right)}>{right.join(', ') || '—'}</td>
          </tr>
        );
      })}
    </tbody>
```

Add a `<script>` at the bottom of `TablatureView.astro` that listens for notation changes and rewrites cell text using the tuning data and label logic. This script will be inlined per-component instance.

**Step 3: Wire notation toggle into piece page**

Add `<NotationToggle />` to `src/pages/pieces/[slug].astro` above the layer tabs.

**Step 4: Verify in dev server**

Run: `npm run dev`
Expected: Toggling between position and note name updates all tablature cells. Preference persists on reload.

**Step 5: Commit**

```bash
jj describe -m "feat: add notation toggle with localStorage persistence"
jj new
```

---

### Task 7: Audio Player with Superdough

**Files:**
- Create: `src/components/Player.tsx` (or `.ts` — vanilla JS island)
- Modify: `src/pages/pieces/[slug].astro`

**Step 1: Install superdough**

Run:
```bash
npm install @strudel/webaudio @strudel/core
```

**Step 2: Create player island**

Create `src/components/Player.ts`:

This is a vanilla JS custom element (no framework needed) that:
- Accepts piece data (steps, tuning, tempo) as JSON via a `data-piece` attribute
- Has play/pause button and tempo slider
- On play: initializes audio context, loads folkharp samples, schedules steps using Web Audio timing
- Dispatches `player-step` custom events with the current step index for the bridge diagram and timeline to consume
- Handles autoplay policy with a tap-to-start overlay

Key implementation details:
- Use `initAudioOnFirstClick` from `@strudel/webaudio`
- Use `getAudioContext` to get the shared audio context
- Schedule notes by converting beat positions to seconds: `beatTime = beat * (60 / tempo)`
- For each step, trigger superdough's sampler with the MIDI note from the tuning lookup
- Tempo slider multiplies the base tempo (range 0.5x to 1.5x)

**Step 3: Wire player into piece page**

Add the player component to `src/pages/pieces/[slug].astro` as a client-side island:
```astro
<div
  id="player"
  data-steps={JSON.stringify(layers[0].steps)}
  data-tuning={tuning}
  data-tempo={tempo}
>
  <button id="play-btn">Play</button>
  <label>
    Tempo: <input type="range" id="tempo-slider" min="50" max="150" value="100" />
    <span id="tempo-display">100%</span>
  </label>
</div>

<script>
  import { initAudioOnFirstClick, getAudioContext } from '@strudel/webaudio';
  // Player logic here — initialize on play button click,
  // schedule steps, dispatch events
</script>
```

Update the layer selector to also update the player's step data.

**Step 4: Verify audio plays**

Run: `npm run dev`
Expected: Clicking play triggers folkharp samples at correct pitches in sequence. Tempo slider adjusts speed.

**Step 5: Commit**

```bash
jj describe -m "feat: add audio player with superdough folkharp samples"
jj new
```

---

### Task 8: Bridge Diagram & Timeline Strip

**Files:**
- Create: `src/components/BridgeDiagram.astro`
- Create: `src/components/TimelineStrip.astro`
- Modify: `src/pages/pieces/[slug].astro`

**Step 1: Create bridge diagram component**

Create `src/components/BridgeDiagram.astro`:

A visual representation of the kora bridge:
- Left column: 11 circles/dots for L1–L11 (top = farthest, bottom = closest)
- Right column: 10 circles/dots for R1–R10
- A vertical line between them representing the bridge
- Each dot has a `data-string` attribute
- Active strings get a CSS class `.active` that highlights them
- Listens for `player-step` custom events and updates active strings

```astro
<div class="bridge-diagram" aria-label="Kora bridge">
  <div class="bridge-side left">
    {Array.from({length: 11}, (_, i) => (
      <div class="string-dot" data-string={`L${11 - i}`}>
        <span class="string-label">{`L${11 - i}`}</span>
      </div>
    ))}
  </div>
  <div class="bridge-center"></div>
  <div class="bridge-side right">
    {Array.from({length: 10}, (_, i) => (
      <div class="string-dot" data-string={`R${10 - i}`}>
        <span class="string-label">{`R${10 - i}`}</span>
      </div>
    ))}
  </div>
</div>

<style>
  .bridge-diagram {
    display: flex;
    justify-content: center;
    gap: 2rem;
    padding: 1rem;
  }
  .bridge-side { display: flex; flex-direction: column; gap: 0.25rem; }
  .bridge-center { width: 2px; background: #ccc; }
  .string-dot {
    width: 2rem; height: 2rem;
    border-radius: 50%;
    border: 2px solid #ccc;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.625rem;
    transition: all 0.1s;
  }
  .string-dot.active {
    background: #2563eb;
    border-color: #2563eb;
    color: white;
  }
  @media print { .bridge-diagram { display: none; } }
</style>

<script>
  document.addEventListener('player-step', ((e: CustomEvent) => {
    document.querySelectorAll('.string-dot').forEach(dot => {
      dot.classList.remove('active');
    });
    const strings: string[] = e.detail.strings;
    strings.forEach(s => {
      document.querySelector(`.string-dot[data-string="${s}"]`)?.classList.add('active');
    });
  }) as EventListener);
</script>
```

**Step 2: Create timeline strip component**

Create `src/components/TimelineStrip.astro`:

A horizontal scrolling strip:
- Each step is a small box showing the string label(s)
- Current step has `.current` class (highlighted)
- Past steps have `.past` class (faded)
- Auto-scrolls to keep current step centered
- Listens for `player-step` events

```astro
---
interface Step { t: number; string?: string; strings?: string[]; }
interface Props { steps: Step[]; }
const { steps } = Astro.props;

function stepStrings(step: Step): string[] {
  return step.strings ?? (step.string ? [step.string] : []);
}
---
<div class="timeline-strip" role="region" aria-label="Timeline">
  <div class="timeline-track">
    {steps.map((step, i) => (
      <div class="timeline-step" data-index={i}>
        <span class="step-beat">{step.t}</span>
        <span class="step-strings">{stepStrings(step).join(', ')}</span>
      </div>
    ))}
  </div>
</div>

<style>
  .timeline-strip {
    overflow-x: auto;
    padding: 0.5rem 0;
    -webkit-overflow-scrolling: touch;
  }
  .timeline-track {
    display: flex;
    gap: 0.25rem;
    min-width: max-content;
  }
  .timeline-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border: 1px solid #e5e5e5;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    min-width: 3rem;
    transition: all 0.15s;
  }
  .timeline-step.current {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }
  .timeline-step.past { opacity: 0.4; }
  .step-beat { font-size: 0.625rem; color: #888; }
  .current .step-beat { color: rgba(255,255,255,0.7); }
  @media print { .timeline-strip { display: none; } }
</style>

<script>
  document.addEventListener('player-step', ((e: CustomEvent) => {
    const idx = e.detail.index;
    const steps = document.querySelectorAll('.timeline-step');
    steps.forEach((step, i) => {
      step.classList.toggle('current', i === idx);
      step.classList.toggle('past', i < idx);
    });
    // Auto-scroll to keep current centered
    const current = steps[idx] as HTMLElement;
    current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }) as EventListener);
</script>
```

**Step 3: Add both components to piece page**

Add `<BridgeDiagram />` and `<TimelineStrip steps={layers[0].steps} />` to the piece page, above and below the player controls respectively.

**Step 4: Verify visual sync**

Run: `npm run dev`
Expected: Playing a piece highlights strings on the bridge diagram and scrolls the timeline strip in sync with audio.

**Step 5: Commit**

```bash
jj describe -m "feat: add bridge diagram and timeline strip with playback sync"
jj new
```

---

### Task 9: Add Remaining Pieces & Final Polish

**Files:**
- Create: `src/content/pieces/mali-sadio.yaml`
- Create: `src/content/pieces/mad-world.yaml`
- Modify: `src/pages/index.astro` (if needed)

**Step 1: Add Mali Sadio piece data**

Create `src/content/pieces/mali-sadio.yaml` with placeholder steps (same structure as Jarabi). At least 2 layers.

**Step 2: Add Mad World piece data**

Create `src/content/pieces/mad-world.yaml` with placeholder steps. At least 2 layers.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds, all 3 piece pages generated

**Step 4: Verify all pages in dev server**

Run: `npm run dev`
Expected: Homepage lists 3 pieces. Each piece page works with layer selector, player, bridge diagram, timeline, print.

**Step 5: Commit**

```bash
jj describe -m "feat: add Mali Sadio and Mad World placeholder pieces"
jj new
```

---

### Task 10: Deploy to Cloudflare Pages

**Step 1: Create Cloudflare Pages project**

Connect the git repo to Cloudflare Pages:
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: 20+

**Step 2: Push and verify deployment**

```bash
jj git push
```

Expected: Cloudflare Pages builds and deploys. Site is live at `kumbengo-lab.pages.dev`.

**Step 3: Test on mobile**

Open the deployed URL on a phone. Verify:
- Homepage is readable
- Piece pages scroll well
- Bridge diagram fits on screen
- Player controls are tappable
- Audio plays after tap

**Step 4: Commit any fixes**

```bash
jj describe -m "chore: cloudflare pages deployment fixes"
jj new
```
