# Drop Tempo — Design

> Treat `d` values as seconds directly. Remove tempo as a required field. The speed slider becomes a pure multiplier.

## Problem

The transcriber outputs `d` values in seconds (from real audio timing). The Player interprets them as beats and divides by BPM, causing playback at the wrong speed. Tempo is not meaningful for transcribed kora pieces.

## Solution

- `d` values are seconds. No conversion needed.
- Remove `tempo` from the piece schema (make optional, display-only).
- `computeOnsets` sums `d` values directly: onset[i] = sum of previous d's, scaled by speed multiplier.
- The speed slider (50%–150%) divides durations to speed up or multiplies to slow down.

## Changes

| File | Change |
|------|--------|
| `src/content.config.ts` | Make `tempo` optional |
| `src/pages/pieces/[slug].astro` | Stop passing `tempo` to Player; remove "BPM" display |
| `src/components/Player.tsx` | Remove `tempo` prop; `computeOnsets` uses speed% only |
| `src/lib/player-logic.ts` | Simplify `computeOnsets(steps, speedPercent)` — just cumulative `d` / (speed/100). Remove `getCps`, `getPlaybackDurationMs`. |
| `src/lib/player-logic.test.ts` | Update tests |
| Piece YAML files | Remove `tempo` field |
| `src/components/Transcriber.tsx` | No change (already outputs seconds) |

## Player speed logic

```
onset[i] = (sum of d[0..i-1]) / (speedPercent / 100)
duration[i] = d[i] / (speedPercent / 100)
```

At 100% speed: plays at original timing.
At 50% speed: everything takes 2x longer.
At 150% speed: everything takes 0.67x as long.
