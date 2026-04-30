# Tap & Assign Transcription Tool — Design

## Goal

Replace the automated (and inaccurate) audio transcription pipeline with an interactive two-phase browser tool where the user captures rhythm by tapping along to a looped audio sample, then assigns notes one at a time via the bridge diagram with immediate playback feedback.

## Location

`/transcribe` page in the Astro site (dev-only tool, not deployed).

## Phase 1 — Rhythm Capture

1. Load audio via file picker (drag-and-drop or browse button).
2. Speed control (50% / 75% / 100%) slows playback for easier tapping. Tap timestamps are scaled back to real-time automatically.
3. Audio plays in a loop. User taps spacebar on each note onset.
4. Multiple loop iterations. Taps are clustered across iterations; median of each cluster gives stable onset positions.
5. User stops tapping (button or key). Durations derived from gaps between final onsets.
6. Extracted rhythm plays back as short tones for verification.
7. "Retry" discards all taps and restarts Phase 1.
8. "Confirm" locks in the rhythm and transitions to Phase 2.

### Clustering algorithm

- Taps from all iterations are collected as a flat list of positions (0 to loop-duration).
- Taps within a tolerance window (e.g. 80ms) are grouped into clusters.
- Each cluster's median becomes a confirmed onset.
- Durations are the gaps between consecutive onsets.

## Phase 2 — Note Assignment

1. Steps listed sequentially; current step highlighted.
2. Bridge diagram displayed; user clicks a string to assign it to the current step.
3. After clicking: synthesized playback from the beginning through the current step (correct notes + rhythm). Unassigned steps are silent.
4. Auto-advances to next step.
5. Step list is clickable to jump to any step. Back button for quick one-step undo.
6. "Play audio" button replays the original sample on demand (not looping).

## Output

- Live YAML preview panel showing the arrangement as it's built.
- Copy-to-clipboard button. User can select/copy just the parts they want from the preview text.

## Tech Stack

- Web Audio API: sample playback, playback rate control, tap timing (high-resolution timestamps).
- Superdough: synthesized note playback (already in project).
- Existing `BridgeDiagram` component for note picking.
- No backend; everything client-side.
- State managed in a single React/Preact component (or framework-agnostic with signals).

## Out of Scope

- Automatic note detection (Basic Pitch). User assigns all notes manually.
- Audio slicing/trimming. User provides pre-sliced samples.
- Saving directly to filesystem. Output is clipboard-based.
- Tempo/BPM. Durations are raw (relative timing from taps), no grid quantization.
