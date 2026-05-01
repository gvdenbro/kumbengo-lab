# Drop Tempo — Implementation Plan

> **For Claude:** Execute this plan task-by-task. Run tests and verify after each task.
>
> **To launch:** `Execute the implementation plan at docs/plans/2026-05-01-drop-tempo-plan.md task by task.`

**Goal:** Remove tempo as a concept. Treat `d` values as seconds. Speed slider is a pure multiplier.

**Design doc:** `docs/plans/2026-05-01-drop-tempo-design.md`

---

### Task 1: Simplify player-logic.ts

**Files:**
- Modify: `src/lib/player-logic.ts`
- Modify: `src/lib/player-logic.test.ts`

**Step 1: Rewrite `computeOnsets`**

```typescript
export function computeOnsets(steps: Step[], speedPercent: number): number[] {
  const scale = 100 / speedPercent;
  const onsets: number[] = [];
  let t = 0;
  for (const step of steps) {
    onsets.push(t * scale);
    t += step.d;
  }
  return onsets;
}
```

**Step 2: Remove `getCps` and `getPlaybackDurationMs`**

No longer needed — total duration is just `sum(d) * (100/speed)`.

Add a simple helper instead:

```typescript
export function getTotalDuration(steps: Step[], speedPercent: number): number {
  return getTotalBeats(steps) * (100 / speedPercent);
}
```

(Rename `getTotalBeats` to `getTotalSeconds` or keep it — it just sums `d` values.)

**Step 3: Update tests**

- Remove `getCps` and `getPlaybackDurationMs` tests
- Update `computeOnsets` tests to use new signature (no tempo param)
- Test: steps [d:0.34, d:0.17] at 100% → onsets [0, 0.34]
- Test: same at 50% → onsets [0, 0.68]

**Step 4: Run tests**

Run: `npm test`

**Step 5: Commit**

```bash
git add src/lib/player-logic.ts src/lib/player-logic.test.ts
git commit -m "refactor(player): simplify to seconds-based timing, remove tempo math"
```

---

### Task 2: Update Player.tsx

**Files:**
- Modify: `src/components/Player.tsx`

**Step 1: Remove `tempo` from Props**

Remove `tempo` from the Props interface and all references.

**Step 2: Update scheduler to use new `computeOnsets`**

Replace `computeOnsets(steps, tempo, tempoPercentRef.current)` with `computeOnsets(steps, tempoPercentRef.current)`.

Replace duration calculation `step.d / bps` with `step.d * (100 / tempoPercentRef.current)`.

**Step 3: Update stop timer**

Use `getTotalDuration(steps, tempoPercentRef.current)` for the non-loop stop delay.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/components/Player.tsx
git commit -m "refactor(player): remove tempo prop, use seconds directly"
```

---

### Task 3: Update schema and piece page

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/pages/pieces/[slug].astro`
- Modify: all piece YAML files

**Step 1: Make `tempo` optional in schema**

Change `tempo: z.number()` to `tempo: z.number().optional()`.

**Step 2: Remove tempo from piece page**

- Remove `tempo` from destructuring
- Remove `tempo={tempo}` prop from `<Player>`
- Remove the "BPM" display in the `<small>` tag

**Step 3: Remove `tempo` from piece YAML files**

Remove the `tempo:` line from all pieces.

**Step 4: Verify**

Run: `npm run build && npm test`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove tempo from pieces schema and YAML files"
```

---

### Task 4: Verify end-to-end

**Step 1: Run tests and build**

Run: `npm test && npm run build`

**Step 2: Confirm**

- Pieces with transcribed durations play at correct speed
- Speed slider works (50% = half speed, 150% = 1.5x)
- No references to `tempo` remain in Player logic

**Step 3: Final commit if needed**
