# Tap & Assign Transcription Tool — Implementation Plan

> **For Claude:** Execute this plan task-by-task. Run tests and verify after each task.
>
> **To launch:** `Execute the implementation plan at docs/plans/2026-04-30-tap-and-assign-plan.md task by task.`

**Goal:** Build an interactive `/transcribe` page with two phases: rhythm capture (tap along to looped audio) and note assignment (click bridge diagram strings with playback feedback).

**Design doc:** `docs/plans/2026-04-30-tap-and-assign-design.md`

**Tech:** React component (already configured via `@astrojs/react`), Web Audio API, Strudel/superdough for synthesis, existing BridgeDiagram pattern.

---

### Task 1: Create the page shell and audio loader

**Files:**
- Create: `src/pages/transcribe.astro`
- Create: `src/components/Transcriber.tsx`

**Step 1: Create the Astro page**

```astro
---
import Base from '../layouts/Base.astro';
import Transcriber from '../components/Transcriber.tsx';
---
<Base title="Transcribe">
  <h1>Transcribe</h1>
  <Transcriber client:only="react" />
</Base>
```

**Step 2: Create the Transcriber component skeleton**

A React component with three states: `'load'`, `'rhythm'`, `'assign'`.

In the `'load'` state:
- A file input (accept audio/video) with drag-and-drop zone
- On file select: decode audio via Web Audio API `decodeAudioData`, store the `AudioBuffer`
- Transition to `'rhythm'` state

**Step 3: Verify**

Run: `npm run dev` — navigate to `/transcribe`, confirm file picker appears and audio loads without errors.

**Step 4: Commit**

```bash
git add src/pages/transcribe.astro src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): page shell with audio file loader"
```

---

### Task 2: Implement rhythm capture — looped playback with speed control

**Files:**
- Modify: `src/components/Transcriber.tsx`

**Step 1: Add looped playback**

In the `'rhythm'` state:
- Play the loaded `AudioBuffer` in a loop using `AudioBufferSourceNode`
- Track loop start time to compute tap positions relative to loop start
- On each loop restart, record the loop iteration number

**Step 2: Add speed control**

- Three buttons: 50% / 75% / 100%
- Set `source.playbackRate.value` accordingly
- Store the current rate to scale tap timestamps back to real-time

**Step 3: Add stop button**

- Stop playback and transition to tap processing

**Step 4: Commit**

```bash
git add src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): looped audio playback with speed control"
```

---

### Task 3: Implement tap capture and clustering

**Files:**
- Modify: `src/components/Transcriber.tsx`
- Create: `src/lib/tap-rhythm.ts`
- Create: `src/lib/tap-rhythm.test.ts`

**Step 1: Capture taps**

- Listen for spacebar keydown during playback
- Record each tap as `(audioContext.currentTime - loopStartTime) * playbackRate` modulo loop duration
- This gives tap position within the loop in real-time seconds

**Step 2: Implement clustering in `tap-rhythm.ts`**

```typescript
export interface TapCluster {
  onset: number;  // median position in seconds
  count: number;  // how many taps contributed
}

export function clusterTaps(taps: number[], tolerance: number): TapCluster[] {
  // Sort taps, group within tolerance, take median of each group
}

export function clustersToSteps(clusters: TapCluster[], loopDuration: number): { d: number }[] {
  // Convert onset gaps to duration values
  // Last step's duration = loopDuration - lastOnset + firstOnset (wraps around)
}
```

**Step 3: Write tests**

Test `clusterTaps`:
- Taps at [0.1, 0.11, 0.5, 0.51, 1.0, 0.99] with tolerance 0.08 → 3 clusters at ~0.105, ~0.505, ~0.995
- Single tap per cluster works
- Empty input returns empty

Test `clustersToSteps`:
- Evenly spaced clusters → equal durations
- Uneven spacing → proportional durations

**Step 4: Wire into component**

After stop: run `clusterTaps` on collected taps, then `clustersToSteps` to get the rhythm skeleton.

**Step 5: Run tests**

Run: `npm test`

**Step 6: Commit**

```bash
git add src/lib/tap-rhythm.ts src/lib/tap-rhythm.test.ts src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): tap capture with clustering algorithm"
```

---

### Task 4: Rhythm verification playback

**Files:**
- Modify: `src/components/Transcriber.tsx`

**Step 1: Play back rhythm as clicks**

After clustering, play the extracted rhythm as short click sounds (use a simple oscillator or noise burst) at the computed onset times. This lets the user hear if the rhythm matches.

**Step 2: Add Retry and Confirm buttons**

- "Retry": clear taps, go back to looped playback
- "Confirm": lock in the rhythm (array of `{ d: number }` steps), transition to `'assign'` state

**Step 3: Show tap count**

Display how many taps were captured and how many steps resulted (clusters found).

**Step 4: Commit**

```bash
git add src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): rhythm verification playback with retry/confirm"
```

---

### Task 5: Note assignment — bridge diagram interaction

**Files:**
- Modify: `src/components/Transcriber.tsx`
- Create: `src/components/BridgeDiagramInteractive.tsx`

**Step 1: Create interactive bridge diagram**

A React version of the existing BridgeDiagram that:
- Renders the same layout (left L1-L11, right R1-R10)
- Each string dot is clickable
- Fires an `onStringClick(stringId: string)` callback
- Highlights the clicked string briefly

**Step 2: Build the assignment UI**

In the `'assign'` state:
- Show list of steps with their index and duration; current step highlighted
- Show the interactive bridge diagram
- On string click: assign that string to the current step, advance to next
- "Back" button to go to previous step
- Click any step in the list to jump to it

**Step 3: Commit**

```bash
git add src/components/Transcriber.tsx src/components/BridgeDiagramInteractive.tsx
git commit -m "feat(transcribe-ui): note assignment with interactive bridge diagram"
```

---

### Task 6: Playback after each assignment

**Files:**
- Modify: `src/components/Transcriber.tsx`

**Step 1: Play arrangement from start after each note assignment**

After a string is clicked:
- Build a pattern from all assigned steps (steps without a note are silent)
- Play from the beginning through the current step using Strudel/superdough (same approach as Player.tsx)
- Use the `folkharp` sample

**Step 2: Add "Play audio" button**

- Plays the original audio sample once (not looping) so user can compare

**Step 3: Commit**

```bash
git add src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): playback after each note assignment"
```

---

### Task 7: YAML preview and clipboard

**Files:**
- Modify: `src/components/Transcriber.tsx`

**Step 1: Generate YAML preview**

- Show a `<pre>` block with the arrangement YAML as it's being built
- Update live as notes are assigned
- Format steps in flow style: `- {d: 0.5, string: L7}`

**Step 2: Add copy button**

- Copy the YAML text to clipboard via `navigator.clipboard.writeText()`
- Brief "Copied!" feedback

**Step 3: Commit**

```bash
git add src/components/Transcriber.tsx
git commit -m "feat(transcribe-ui): YAML preview with copy to clipboard"
```

---

### Task 8: Polish and verify

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Manual test**

- Load an audio file
- Tap rhythm at 75% speed over 3 loops
- Verify rhythm playback sounds correct
- Assign notes via bridge diagram
- Confirm playback plays correct sequence
- Copy YAML and paste into a piece file
- Run `npm run build` to verify the piece works

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(transcribe-ui): complete tap & assign transcription tool"
```
