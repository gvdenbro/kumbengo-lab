# Relative Beat Timing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace absolute beat timestamps (`t`) with relative durations (`d`) in piece YAML files and all consuming code. Enable pattern reuse via YAML anchors/aliases with array flattening.

**Architecture:** `d` (duration-after) is the canonical representation. YAML files use `d`. The Zod schema flattens nested arrays from YAML aliases via `z.preprocess()`. Lookahead reads `d` directly. `buildSlotMap` and `getTotalBeats` compute cumulative positions internally.

**Tech Stack:** TypeScript, Astro 6, Zod, Vitest, Python 3.12, PyYAML

**Design doc:** `docs/plans/2026-04-27-relative-beat-timing-design.md`

---

### Task 1: Update Step interface

**Files:**
- Modify: `src/lib/piece.ts:1-5`
- Modify: `src/lib/piece.test.ts`

**Step 1: Update the Step interface**

In `src/lib/piece.ts`, replace `t: number` with `d: number`:

```typescript
export interface Step {
  d: number;
  string?: string;
  strings?: string[];
}
```

`getStepStrings` is unchanged — it doesn't use `t` or `d`.

**Step 2: Update piece.test.ts fixtures**

Replace `t: 0` with `d: 1` in test fixtures:

```typescript
import { describe, it, expect } from 'vitest';
import { getStepStrings } from './piece';

describe('getStepStrings', () => {
  it('returns array for single string', () => {
    expect(getStepStrings({ d: 1, string: 'L4' })).toEqual(['L4']);
  });

  it('returns array for multiple strings', () => {
    expect(getStepStrings({ d: 1, strings: ['L1', 'L4'] })).toEqual(['L1', 'L4']);
  });
});
```

**Step 3: Run tests to verify**

Run: `npm test`
Expected: piece.test.ts passes. player-logic.test.ts fails (still uses `t`). That's expected — we fix it next.

**Step 4: Commit**

```bash
git add src/lib/piece.ts src/lib/piece.test.ts
git commit -m "refactor: change Step interface from t to d"
```

---

### Task 2: Update player-logic

**Files:**
- Modify: `src/lib/player-logic.ts:3-5,22-33`
- Modify: `src/lib/player-logic.test.ts`

**Step 1: Write updated tests**

Replace `src/lib/player-logic.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { getTotalBeats, getCps, getPlaybackDurationMs, buildSlotMap, getMidiNotes } from './player-logic';

describe('getTotalBeats', () => {
  it('returns 0 for empty steps', () => {
    expect(getTotalBeats([])).toBe(0);
  });

  it('returns sum of d values', () => {
    expect(getTotalBeats([{ d: 0.5, string: 'L1' }, { d: 4, string: 'R2' }])).toBe(4.5);
  });

  it('works with single step', () => {
    expect(getTotalBeats([{ d: 1, string: 'L1' }])).toBe(1);
  });
});

describe('getCps', () => {
  it('calculates CPS at 100% tempo', () => {
    expect(getCps(90, 100, 4)).toBeCloseTo(0.375);
  });

  it('scales with tempo percent', () => {
    expect(getCps(90, 50, 4)).toBeCloseTo(0.1875);
  });
});

describe('getPlaybackDurationMs', () => {
  it('calculates duration at 100% tempo', () => {
    expect(getPlaybackDurationMs(4, 120, 100)).toBeCloseTo(2000);
  });

  it('scales with tempo percent', () => {
    expect(getPlaybackDurationMs(4, 120, 50)).toBeCloseTo(4000);
  });
});

describe('buildSlotMap', () => {
  it('maps steps to half-beat slots', () => {
    const steps = [
      { d: 0.5, string: 'L1' },
      { d: 0.5, string: 'R2' },
      { d: 1, strings: ['L1', 'L5'] },
    ];
    const { slots, slotMap } = buildSlotMap(steps);
    expect(slots).toBe(4); // totalBeats=2, resolution=0.5 → 4 slots
    expect(slotMap.get(0)).toEqual({ index: 0, strings: ['L1'] });
    expect(slotMap.get(1)).toEqual({ index: 1, strings: ['R2'] });
    expect(slotMap.get(2)).toEqual({ index: 2, strings: ['L1', 'L5'] });
    expect(slotMap.has(3)).toBe(false);
  });

  it('skips rest steps but advances time', () => {
    const steps = [
      { d: 0.5, string: 'L1' },
      { d: 1 },                      // rest — no string
      { d: 0.5, string: 'R2' },
    ];
    const { slots, slotMap } = buildSlotMap(steps);
    expect(slots).toBe(4); // 0.5 + 1 + 0.5 = 2 beats → 4 slots
    expect(slotMap.get(0)).toEqual({ index: 0, strings: ['L1'] });
    expect(slotMap.has(1)).toBe(false); // slot 1 = beat 0.5 (rest)
    expect(slotMap.has(2)).toBe(false); // slot 2 = beat 1.0 (rest continues)
    expect(slotMap.get(3)).toEqual({ index: 2, strings: ['R2'] });
  });

  it('returns empty map for empty steps', () => {
    const { slots, slotMap } = buildSlotMap([]);
    expect(slots).toBe(0);
    expect(slotMap.size).toBe(0);
  });
});

describe('getMidiNotes', () => {
  const tuning = { L1: { midi: 41 }, R2: { midi: 57 } };

  it('maps string IDs to MIDI notes', () => {
    expect(getMidiNotes(['L1', 'R2'], tuning)).toEqual([41, 57]);
  });

  it('falls back to 60 for unknown strings', () => {
    expect(getMidiNotes(['X1'], tuning)).toEqual([60]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `getTotalBeats` and `buildSlotMap` tests fail (implementation still uses `t`).

**Step 3: Update getTotalBeats and buildSlotMap**

Replace `src/lib/player-logic.ts` with:

```typescript
import { getStepStrings, type Step } from './piece';

export function getTotalBeats(steps: Step[]): number {
  if (steps.length === 0) return 0;
  return steps.reduce((sum, s) => sum + s.d, 0);
}

export function getCps(tempo: number, tempoPercent: number, totalBeats: number): number {
  return (tempoPercent / 100 * tempo) / 60 / totalBeats;
}

export function getPlaybackDurationMs(totalBeats: number, tempo: number, tempoPercent: number): number {
  return (totalBeats / (tempoPercent / 100 * tempo / 60)) * 1000;
}

export interface SlotInfo {
  index: number;
  strings: string[];
}

export function buildSlotMap(
  steps: Step[],
  resolution = 0.5,
): { slots: number; slotMap: Map<number, SlotInfo> } {
  const totalBeats = getTotalBeats(steps);
  const slots = Math.round(totalBeats / resolution);
  const slotMap = new Map<number, SlotInfo>();
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].string || steps[i].strings) {
      slotMap.set(Math.round(t / resolution), {
        index: i,
        strings: getStepStrings(steps[i]),
      });
    }
    t += steps[i].d;
  }
  return { slots, slotMap };
}

export function getMidiNotes(
  strings: string[],
  tuning: Record<string, { midi: number }>,
): number[] {
  return strings.map(str => {
    const info = tuning[str];
    if (!info) console.warn(`Unknown string "${str}" in tuning`);
    return info?.midi ?? 60;
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/lib/player-logic.ts src/lib/player-logic.test.ts
git commit -m "refactor: player-logic uses d instead of t"
```

---

### Task 3: Update Zod schema

**Files:**
- Modify: `src/content.config.ts`

**Step 1: Update the schema**

Replace `src/content.config.ts` with:

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const stringId = z.string().regex(
  /^(L([1-9]|1[01])|R([1-9]|10))$/,
  'String ID must be L1–L11 or R1–R10',
);

const stepSchema = z.object({
  d: z.number().positive(),
  string: stringId.optional(),
  strings: z.array(stringId).optional(),
}).refine(d => !(d.string && d.strings), {
  message: 'Use string or strings, not both',
});

const arrangementSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  steps: z.preprocess(
    (val) => Array.isArray(val) ? val.flat() : val,
    z.array(stepSchema),
  ),
});

const knownTunings = ['silaba'] as const;

const pieces = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/pieces' }),
  schema: z.object({
    title: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    tuning: z.enum(knownTunings),
    tempo: z.number(),
    tags: z.array(z.string()),
    arrangements: z.array(arrangementSchema).min(1),
  }),
});

export const collections = { pieces };
```

Key changes:
- `t: z.number()` → `d: z.number().positive()`
- Removed the "must have string or strings" refinement (rests are now valid)
- Added `z.preprocess()` to flatten nested arrays from YAML aliases

**Step 2: Commit**

Don't run build yet — YAML files still use `t`. We'll migrate them next.

```bash
git add src/content.config.ts
git commit -m "refactor: schema uses d, supports rests and alias flattening"
```

---

### Task 4: Migrate YAML piece files

**Files:**
- Modify: `src/content/pieces/jarabi.yaml`
- Modify: `src/content/pieces/mali-sadio.yaml`
- Modify: `src/content/pieces/mad-world.yaml`
- Modify: `src/content/pieces/dummy.yaml`
- Modify: `src/content/pieces/test.yaml`

**Step 1: Write a migration script**

Create `tools/migrate-t-to-d.py`:

```python
#!/usr/bin/env python3
"""Migrate piece YAMLs from absolute t to relative d."""
import sys
from pathlib import Path
import yaml


def migrate(steps: list[dict]) -> list[dict]:
    result = []
    for i, step in enumerate(steps):
        t_current = step["t"]
        if i < len(steps) - 1:
            d = round(steps[i + 1]["t"] - t_current, 4)
        else:
            d = 1
        new_step = {"d": d}
        if "string" in step:
            new_step["string"] = step["string"]
        if "strings" in step:
            new_step["strings"] = step["strings"]
        result.append(new_step)
    return result


def _represent_step(dumper, data):
    if set(data.keys()) <= {"d", "string", "strings"}:
        return dumper.represent_mapping("tag:yaml.org,2002:map", data, flow_style=True)
    return dumper.represent_mapping("tag:yaml.org,2002:map", data)


yaml.add_representer(dict, _represent_step)


def main():
    for path in sorted(Path("src/content/pieces").glob("*.yaml")):
        with open(path) as f:
            raw = f.read()
        piece = yaml.safe_load(raw)
        if not piece or "arrangements" not in piece:
            continue
        for arr in piece["arrangements"]:
            if arr.get("steps") and "t" in arr["steps"][0]:
                arr["steps"] = migrate(arr["steps"])
        # Preserve comments by writing fresh YAML
        with open(path, "w") as f:
            yaml.dump(piece, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
        print(f"Migrated {path}")


if __name__ == "__main__":
    main()
```

**Step 2: Run the migration**

Run: `python tools/migrate-t-to-d.py`
Expected: All 5 YAML files migrated.

**Step 3: Spot-check a migrated file**

Open `src/content/pieces/jarabi.yaml` and verify:
- First step has `d: 0.5` (was `t: 0`, next was `t: 0.5`)
- Last step has `d: 1`
- No `t` keys remain

**Step 4: Run the build**

Run: `npm run build`
Expected: Build succeeds — Zod schema validates `d` and all YAML files now use `d`.

**Step 5: Commit**

```bash
git add src/content/pieces/
git commit -m "refactor: migrate all piece YAMLs from t to d"
```

**Step 6: Delete migration script**

```bash
rm tools/migrate-t-to-d.py
git add -A && git commit -m "chore: remove migration script"
```

---

### Task 5: Update Lookahead component

**Files:**
- Modify: `src/components/Lookahead.astro:9-14,32-37,82-87`

**Step 1: Simplify getGap and remove data-beat**

In `src/components/Lookahead.astro`, make these changes:

Replace the `getGap` function and `DEFAULT_GAP` constant (lines 9-14):
```typescript
const DEFAULT_GAP = 0.5;

function getGap(steps: Step[], i: number): number {
  if (i < steps.length - 1) return steps[i + 1].t - steps[i].t;
  return DEFAULT_GAP;
}
```
with:
```typescript
function getGap(steps: Step[], i: number): number {
  return steps[i].d;
}
```

Replace the `<li>` element (around lines 31-38):
```html
          <li
            class="lookahead-item"
            data-index={i}
            data-beat={step.t}
            data-strings={JSON.stringify(getStepStrings(step))}
            style={`min-height:${gapToHeight(getGap(arr.steps, i), minGap)}`}
          >
            <span class="lookahead-strings">{getStepStrings(step).join(', ')}</span>
            <span class="lookahead-beat">{step.t}</span>
          </li>
```
with:
```html
          <li
            class="lookahead-item"
            data-index={i}
            data-d={step.d}
            data-strings={JSON.stringify(getStepStrings(step))}
            style={`min-height:${gapToHeight(getGap(arr.steps, i), minGap)}`}
          >
            <span class="lookahead-strings">{getStepStrings(step).join(', ')}</span>
          </li>
```

**Step 2: Update the client-side script**

The `updateVisibility` function uses `data-beat` to window which items are visible. Replace the beat-based windowing with cumulative-d windowing.

Replace the `updateVisibility` function (around lines 82-95):
```typescript
  function updateVisibility(currentIndex: number) {
    const track = document.querySelector('.lookahead-track[data-active="true"]');
    if (!track) return;
    const items = track.querySelectorAll('.lookahead-item');
    const beats = Array.from(items).map(el => Number((el as HTMLElement).dataset.beat));
    const startBeat = currentIndex < 0 ? beats[0] ?? 0 : beats[currentIndex] ?? 0;

    items.forEach((item, i) => {
      const el = item as HTMLElement;
      const beat = beats[i];
      el.classList.toggle('current', i === currentIndex);
      if (i < currentIndex || beat > startBeat + LOOKAHEAD_BEATS) {
        el.classList.add('hidden');
      } else {
        el.classList.remove('hidden');
      }
    });
  }
```
with:
```typescript
  function updateVisibility(currentIndex: number) {
    const track = document.querySelector('.lookahead-track[data-active="true"]');
    if (!track) return;
    const items = track.querySelectorAll('.lookahead-item');
    const durations = Array.from(items).map(el => Number((el as HTMLElement).dataset.d));

    items.forEach((item, i) => {
      const el = item as HTMLElement;
      el.classList.toggle('current', i === currentIndex);
      if (i < currentIndex) {
        el.classList.add('hidden');
      } else {
        // Sum durations from current index to i to get beats ahead
        let beatsAhead = 0;
        for (let j = Math.max(0, currentIndex); j < i; j++) beatsAhead += durations[j];
        if (beatsAhead > LOOKAHEAD_BEATS) {
          el.classList.add('hidden');
        } else {
          el.classList.remove('hidden');
        }
      }
    });
  }
```

**Step 3: Remove the `.lookahead-beat` CSS rules**

Remove these CSS rules (they styled the now-removed beat display):
```css
  .lookahead-beat {
    font-size: 0.625rem;
    opacity: 0.6;
    margin-left: 0.5rem;
  }
  .current .lookahead-beat { opacity: 0.8; }
```

And from the mobile media query, remove:
```css
    .lookahead-beat { font-size: 0.5rem; }
```

**Step 4: Run the build and verify**

Run: `npm run build`
Expected: Build succeeds.

Run: `npm run dev` and manually verify the lookahead displays correctly on a piece page.

**Step 5: Commit**

```bash
git add src/components/Lookahead.astro
git commit -m "refactor: lookahead uses d directly, drop beat display"
```

---

### Task 6: Update transcribe.py

**Files:**
- Modify: `tools/transcribe.py:117-130`

**Step 1: Update build_steps to emit d**

Replace the step-building loop at the end of `build_steps` (around lines 117-130):

```python
    # Build step list sorted by beat
    steps = []
    for beat in sorted(beat_map.keys()):
        strings = beat_map[beat]
        if len(strings) == 1:
            steps.append({"t": beat, "string": strings[0]})
        else:
            steps.append({"t": beat, "strings": strings})
```

with:

```python
    # Build step list sorted by beat, using relative durations
    sorted_beats = sorted(beat_map.keys())
    steps = []
    for i, beat in enumerate(sorted_beats):
        d = round(sorted_beats[i + 1] - beat, 4) if i < len(sorted_beats) - 1 else 1
        strings = beat_map[beat]
        if len(strings) == 1:
            steps.append({"d": d, "string": strings[0]})
        else:
            steps.append({"d": d, "strings": strings})
```

**Step 2: Commit**

```bash
git add tools/transcribe.py
git commit -m "refactor: transcribe.py emits d instead of t"
```

---

### Task 7: Update kora-tap.py

**Files:**
- Modify: `tools/kora-tap.py:143`

**Step 1: Update step generation**

Replace line 143:
```python
    steps = [{"t": b, "string": default_string} for b in beats]
```

with:

```python
    steps = []
    for i, b in enumerate(beats):
        d = round(beats[i + 1] - b, 4) if i < len(beats) - 1 else 1
        steps.append({"d": d, "string": default_string})
```

**Step 2: Commit**

```bash
git add tools/kora-tap.py
git commit -m "refactor: kora-tap.py emits d instead of t"
```

---

### Task 8: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update the piece YAML example in README**

Find the example in the "Adding a piece" section and replace:

```yaml
arrangements:
  - name: Melody only
    difficulty: beginner
    steps:
      - { t: 0,   string: L4 }
      - { t: 0.5, string: R2 }
      - { t: 1,   strings: [L1, L5] }  # multiple strings on one beat
```

with:

```yaml
arrangements:
  - name: Melody only
    difficulty: beginner
    steps:
      - { d: 0.5, string: L4 }
      - { d: 0.5, string: R2 }
      - { d: 1,   strings: [L1, L5] }  # multiple strings on one beat
```

Update the description line from:
```
Each step has a beat time `t` and either `string` (single) or `strings` (array).
```
to:
```
Each step has a duration `d` (beats until next event) and either `string` (single) or `strings` (array). Steps with `d` but no string are rests. YAML anchors/aliases can reuse step sequences across arrangements.
```

Remove the "Relative beat timing" item from the TODO section.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for relative beat timing"
```

---

### Task 9: Final verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Manual smoke test**

Run: `npm run dev`
- Open a piece page (e.g., Jarabi)
- Press Play — verify audio plays correctly
- Verify lookahead items scroll and highlight
- Switch arrangements — verify it works
- Check a longer piece (Mad World) — verify timing sounds right
