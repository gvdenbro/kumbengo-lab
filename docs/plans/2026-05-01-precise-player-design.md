# Precise Player Scheduling — Design

> Replace the Strudel `repl` + `fastcat` slot-grid Player with a lookahead scheduler using direct `superdough` calls for sample-accurate timing of arbitrary note durations.

## Problem

The current Player quantizes all note onsets to a 0.5-beat grid via `buildSlotMap`. Pieces with non-grid durations (e.g., transcribed `d: 0.34`) get their timing destroyed.

## Solution

Use the Web Audio lookahead scheduler pattern (per Chris Wilson's "A Tale of Two Clocks"):

1. A `setTimeout` loop (~25ms) looks ~100ms ahead on the audio clock
2. Notes whose onset falls within the window are scheduled via `superdough`
3. Visual events are tracked in a queue and dispatched via `requestAnimationFrame`
4. Pause/resume uses `AudioContext.suspend()`/`resume()`

## Architecture

```
steps[] + tempo → compute onset times (seconds)
                ↓
        ┌─────────────────┐
        │ Scheduler loop  │  (setTimeout, ~25ms)
        │ looks ahead     │
        │ ~100ms on       │
        │ audio clock     │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    ↓                         ↓
superdough(note, time, dur)   noteQueue.push({index, time})
(audio: hardware clock)       (visuals: rAF polls queue)
```

## Key Decisions

**Why not schedule everything upfront?**
Looping and tempo changes need the ability to alter future scheduling. The lookahead window (~100ms) means tempo changes take effect within 100ms.

**Why not keep Strudel's repl?**
`fastcat` requires equal-time slots. Strudel's `timeCat` exists in mini-notation but isn't reliably available in the JS API. Direct scheduling is simpler and proven.

**Pause/resume:**
`AudioContext.suspend()` freezes all scheduled-but-not-yet-played nodes. On resume, they fire at their correct relative times. The scheduler loop stops on pause and restarts on resume.

**Looping:**
When the scheduler reaches the end of the piece, if looping is enabled, it wraps the position back to 0 and continues scheduling from the top.

## What Changes

| File | Change |
|------|--------|
| `src/components/Player.tsx` | Rewrite: remove `repl`/`fastcat`/`buildSlotMap`, use lookahead scheduler + `superdough` + rAF visual sync |
| `src/lib/player-logic.ts` | Remove `buildSlotMap`, add `computeOnsets(steps, tempo, tempoPercent): number[]` |
| `src/lib/player-logic.test.ts` | Update tests: remove `buildSlotMap` tests, add `computeOnsets` tests |

## What Stays the Same

- `player-step` custom event contract (`{index, strings}`)
- All Astro components (BridgeDiagram, Lookahead, TablatureView)
- Sample preloading (VCSL folkharp)
- UI controls (play/pause, loop, tempo slider, arrangement select)
- `getTotalBeats`, `getCps`, `getPlaybackDurationMs`, `getMidiNotes` helpers

## Visual Sync

A `requestAnimationFrame` loop checks `audioContext.currentTime` against a queue of `{index, strings, time}` entries. When `currentTime >= entry.time`, dispatch `player-step` and shift the queue. This replaces Strudel's `onTrigger` callback.

## Edge Cases

- **Empty steps array**: no-op, don't start scheduler
- **Single step**: schedule it, loop wraps immediately
- **Tempo change while playing**: scheduler picks up new tempo for next note it schedules; already-scheduled notes play at old tempo (acceptable for ~100ms lookahead)
- **Very fast tempo**: scheduler may schedule multiple notes per tick — the `while` loop handles this naturally
