# Kora Tuner

A real-time chromatic tuner for the kora, inspired by GuitarTuna. The player sees the bridge diagram with a vibrating vertical line overlaying it. The line drifts left (flat) or right (sharp) and turns green when the string is in tune.

## Features

### Modes

- **Guided mode**: Walks through all 21 strings in order (L1→L11, then R1→R10). Auto-advances to the next string after holding continuously within ±3¢ for 1 second.
- **Free mode**: Player clicks any string in the bridge diagram to tune it. No auto-advance.

### Pitch detection

- Continuous real-time feedback via microphone. The vibrating line updates every animation frame.
- Auto-detect: by default, snaps to the closest string in the current tuning based on heard pitch.
- Lock: clicking a string in the bridge diagram locks the tuner to that target note regardless of what pitch is heard.
- Clarity threshold: ignore readings below ~0.85 clarity (background noise, unclear signal).

### Thresholds

- In tune: ±3 cents (line turns green, string marked as tuned)
- Visible range: ±30 cents (line clamps at edges beyond this)

All tuning sensitivity values live as named constants at the top of `tuner-logic.ts` for easy adjustment during testing:

```ts
const IN_TUNE_CENTS = 3;
const VISIBLE_RANGE_CENTS = 30;
const CLARITY_THRESHOLD = 0.85;
const AUTO_ADVANCE_MS = 1000;
```

## UI Layout

Mobile-first single column, no horizontal breakpoints needed.

From top to bottom:

1. **Mode toggle** — Guided / Free pill buttons
2. **Note display** — Target note name (e.g. "A4"), string ID ("L9"), frequency, and cents offset
3. **Bridge diagram with vibrating line overlay** — Full bridge showing both L column (11 strings) and R column (10 strings) with the bridge divider between them. The vibrating line spans the full height of the diagram and slides horizontally.

### Vibrating line behavior

- The bridge divider (center line between L and R columns) is the "in tune" position.
- Flat: line drifts toward the L column.
- Sharp: line drifts toward the R column.
- At ±30¢ the line reaches the outer edge of the bridge and clamps.
- Color: red/orange when far off, transitions to green within ±3¢.
- Glow effect (box-shadow) to feel alive. Semi-transparent so dots remain visible underneath.
- Hidden (or faded) when no sound is detected.
- **Vibration**: The line oscillates rapidly around its position. Amplitude is proportional to `|cents|` — shakes a lot when far off-pitch, becomes nearly still when within ±3¢. Implemented as a small random horizontal offset applied each animation frame, scaled from ~3px (at ±30¢) down to 0px (at 0¢).

### Bridge diagram states

- **Grey** — pending (not yet tuned)
- **Blue/highlighted** — current target string
- **Green** — tuned (held ±3¢ for ~1s)

Clicking a dot in free mode selects that string as the target. In guided mode, clicking a green dot switches to free mode for re-checking; guided sequence resumes from where it left off.

## Architecture

Approach: Hook + view separation.

### Files

| File | Purpose |
|------|---------|
| `src/pages/tune.astro` | Astro page at `/tune`, mounts Tuner with `client:only="react"` |
| `src/components/Tuner.tsx` | View component: composes hook, logic, bridge diagram, and vibration line |
| `src/components/VibrationLine.tsx` | Presentational: renders the animated vertical line given `cents` and `inTune` |
| `src/lib/use-pitch-stream.ts` | React hook: opens mic, runs rAF loop with pitchy, emits `{ hz, clarity }` per frame |
| `src/lib/tuner-logic.ts` | Pure functions: `centsFromTarget`, `snapToTarget`, `isInTune`, `advanceGuided` |
| `src/lib/tuner-logic.test.ts` | Unit tests for all pure tuner logic |

### Data flow

```
Mic → AnalyserNode → pitchy → usePitchStream hook
  → { hz, clarity } per frame
  → tuner-logic.snapToTarget(hz, tuning, lockedString?)
  → tuner-logic.centsFromTarget(hz, targetMidi)
  → Tuner.tsx updates state
  → VibrationLine renders position + color
  → BridgeDiagramInteractive renders dot states
```

### Key functions in tuner-logic.ts

- `centsFromTarget(hz: number, targetMidi: number): number` — Returns cents offset, clamped to ±30.
- `snapToTarget(hz: number, tuning: Record<string, {midi: number}>, locked?: string): string | null` — Returns locked string if set, otherwise closest string ID. Returns null if no string within 2 semitones.
- `isInTune(cents: number): boolean` — True if |cents| ≤ 3.
- `advanceGuided(current: string, tunedSet: Set<string>): string | null` — Returns next string in L1→L11→R1→R10 order, or null if all tuned.

### usePitchStream hook

- Opens mic via existing `openMic()` from `pitch-detect.ts`.
- Runs a `requestAnimationFrame` loop reading from `AnalyserNode` + `PitchDetector`.
- Returns `{ hz: number | null, clarity: number }` that updates every frame.
- Handles start/stop lifecycle, cleans up on unmount.

### Reused existing code

- `openMic()` / `closeMic()` from `src/lib/pitch-detect.ts`
- `BridgeDiagramInteractive` component (extended with `activeString` and `tunedStrings` props)
- `getTuning()` from `src/lib/tuning.ts`
- `pitchy` library (already a dependency)

## Edge cases

- **No sound**: Line hidden, note display shows "Play a string…"
- **Low clarity**: Ignore readings below 0.85. Line stays hidden.
- **Auto-detect ambiguity**: Snap to string closer to current target (guided) or lower-pitched (free).
- **Guided completion**: After R10 turns green, show "All tuned ✓". Player can still click strings to re-check.
- **Mic permission denied**: Show message with instructions to allow mic access.
- **Beyond ±30¢**: Line clamps at edge, doesn't disappear.

## Out of scope

- Multiple tunings (only silaba for now; structure supports adding more later)
- Reference tone playback
- Tuning history or calibration (A4 = 440 Hz fixed)
