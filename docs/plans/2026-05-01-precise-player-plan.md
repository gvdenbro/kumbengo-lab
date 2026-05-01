# Precise Player Scheduling — Implementation Plan

> **For Claude:** Execute this plan task-by-task. Run tests and verify after each task.
>
> **To launch:** `Execute the implementation plan at docs/plans/2026-05-01-precise-player-plan.md task by task.`

**Goal:** Replace the slot-grid Player with a lookahead scheduler for sample-accurate playback of arbitrary note durations.

**Design doc:** `docs/plans/2026-05-01-precise-player-design.md`

---

### Task 1: Add `computeOnsets` to player-logic.ts

**Files:**
- Modify: `src/lib/player-logic.ts`
- Modify: `src/lib/player-logic.test.ts`

**Step 1: Add `computeOnsets` function**

```typescript
export function computeOnsets(steps: Step[], tempo: number, tempoPercent: number): number[] {
  const bps = (tempoPercent / 100 * tempo) / 60;
  const onsets: number[] = [];
  let t = 0;
  for (const step of steps) {
    onsets.push(t / bps);
    t += step.d;
  }
  return onsets;
}
```

Returns onset times in seconds for each step at the given tempo.

**Step 2: Add tests**

- 4 steps of d=1 at 120bpm/100% → onsets at [0, 0.5, 1.0, 1.5]
- 2 steps of d=0.5 at 60bpm/100% → onsets at [0, 0.5]
- Tempo percent scaling: 60bpm/50% → half speed
- Empty steps → empty array

**Step 3: Remove `buildSlotMap` tests** (function will be removed in Task 3)

Actually, keep `buildSlotMap` and its tests for now — remove in Task 3 after Player no longer uses it.

**Step 4: Run tests**

Run: `npm test`

**Step 5: Commit**

```bash
git add src/lib/player-logic.ts src/lib/player-logic.test.ts
git commit -m "feat(player): add computeOnsets for precise scheduling"
```

---

### Task 2: Rewrite Player.tsx with lookahead scheduler

**Files:**
- Modify: `src/components/Player.tsx`

**Step 1: Remove Strudel pattern imports**

Remove: `repl`, `pure`, `silence`, `fastcat`, `stack` from `@strudel/core`
Remove: `webaudioOutput` from `@strudel/webaudio`
Add: `superdough` from `superdough`
Keep: `getAudioContext`, `initAudioOnFirstClick`, `samples`, `registerSynthSounds`, `getSampleInfo`, `soundMap`, `loadBuffer` from `@strudel/webaudio`

**Step 2: Replace repl with scheduler state**

Replace the `replRef` with:
- `schedulerRef` — the setTimeout ID
- `nextNoteIndexRef` — which step to schedule next
- `startTimeRef` — audioContext.currentTime when playback started
- `noteQueueRef` — array of `{index, strings, time}` for visual sync
- `rafRef` — requestAnimationFrame ID

**Step 3: Implement the scheduler function**

```typescript
const LOOKAHEAD = 0.1; // seconds
const INTERVAL = 25;   // ms

function schedule() {
  const ctx = getAudioContext();
  const onsets = computeOnsets(steps, tempo, tempoPercent);
  const totalDuration = getTotalBeats(steps) / ((tempoPercent/100 * tempo) / 60);

  while (nextNoteIndex < steps.length) {
    const onset = startTime + onsets[nextNoteIndex];
    if (onset > ctx.currentTime + LOOKAHEAD) break;

    const step = steps[nextNoteIndex];
    const strings = getStepStrings(step);
    if (strings.length > 0) {
      const midiNotes = getMidiNotes(strings, tuning);
      for (const note of midiNotes) {
        superdough({s: 'folkharp', note}, onset, step.d / bps);
      }
    }
    noteQueue.push({index: nextNoteIndex, strings, time: onset});
    nextNoteIndex++;
  }

  // Handle loop
  if (nextNoteIndex >= steps.length) {
    if (looping) {
      startTime += totalDuration;
      nextNoteIndex = 0;
    } else {
      // Will stop after last note plays
    }
  }

  schedulerTimer = window.setTimeout(schedule, INTERVAL);
}
```

**Step 4: Implement visual sync with requestAnimationFrame**

```typescript
function drawLoop() {
  const ctx = getAudioContext();
  while (noteQueue.length && noteQueue[0].time <= ctx.currentTime) {
    const entry = noteQueue.shift();
    document.dispatchEvent(new CustomEvent('player-step', {
      detail: { index: entry.index, strings: entry.strings }
    }));
  }
  rafId = requestAnimationFrame(drawLoop);
}
```

**Step 5: Implement play/pause/stop**

- **Play**: preload samples, set `startTime = ctx.currentTime`, `nextNoteIndex = 0`, start scheduler + rAF
- **Pause**: `ctx.suspend()`, clear scheduler timeout, cancel rAF
- **Resume**: `ctx.resume()`, restart scheduler + rAF
- **Stop**: clear scheduler, cancel rAF, clear noteQueue, reset index, `clearVisuals()`

**Step 6: Keep tempo change handling**

When tempo changes mid-playback: recalculate `startTime` so that the current position stays correct, then let the scheduler pick up the new tempo naturally.

**Step 7: Keep non-looping stop**

Schedule a timeout for `totalDuration` after start to auto-stop when not looping (same as current `scheduleStop`).

**Step 8: Verify**

Run: `npm run build` — confirm no build errors.

**Step 9: Commit**

```bash
git add src/components/Player.tsx
git commit -m "feat(player): rewrite with lookahead scheduler and superdough"
```

---

### Task 3: Remove unused code

**Files:**
- Modify: `src/lib/player-logic.ts`
- Modify: `src/lib/player-logic.test.ts`

**Step 1: Remove `buildSlotMap`**

Remove the function and its `SlotInfo` interface from `player-logic.ts`.

**Step 2: Remove `buildSlotMap` tests**

Remove the `describe('buildSlotMap', ...)` block from the test file.

**Step 3: Run tests**

Run: `npm test`

**Step 4: Commit**

```bash
git add src/lib/player-logic.ts src/lib/player-logic.test.ts
git commit -m "refactor(player): remove unused buildSlotMap"
```

---

### Task 4: Verify end-to-end

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Run build**

Run: `npm run build`

**Step 3: Manual verification checklist**

- Play a piece with clean durations (e.g., `mad-world`) — timing should be identical
- Play `jarabi.yaml` with non-grid durations — timing should now be precise
- Pause/resume works
- Loop works
- Tempo slider works mid-playback
- Bridge diagram highlights correctly
- Lookahead display advances correctly
- Arrangement switching works

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "feat(player): complete precise scheduling migration"
```
