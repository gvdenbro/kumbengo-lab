# MIDI→Kora Auto-Transpose — Design

Date: 2026-09-03
Status: Approved

## Problem

Fitting a piano MIDI into the 7-note Silaba scale drops every off-scale /
out-of-range note. The chosen key (transpose) massively changes how many notes
survive — e.g. for `mad-world.midi`, transpose `+2` sounds far closer to the
original than `0`. Users currently have to guess the transpose by trial.

## Solution

Add an auto mode to the existing `--transpose` flag that searches transposes
and picks the one dropping the fewest notes.

- CLI: `--transpose auto`. A plain integer (`--transpose 2`) still forces a
  fixed value; default remains `0`.
- Search integer transposes over **−12…+12** semitones. For each, count how
  many of the piece's notes would be dropped (map to no Silaba string) given
  the current `--fold` setting.
- Pick the transpose with the **fewest dropped notes**; on a tie, prefer the
  **smallest |transpose|** (stay closest to the original key).
- Report the choice to stderr: `Auto-transpose: +2 (drops N note(s))`.

Auto mode only chooses the transpose; the rest of the pipeline (fold, drop,
playability reduction) is unchanged. If the best transpose still leaves
off-scale notes and `--drop-unplayable` was not passed, the run errors exactly
as a fixed transpose would today.

## Interfaces

- `count_dropped(pitches: list[int], transpose: int, *, fold: bool) -> int`
  — number of pitches that map to no Silaba string at that transpose.
- `best_transpose(pitches: list[int], *, fold: bool, search_range=range(-12, 13))
  -> tuple[int, int]` — returns `(transpose, dropped_count)`, minimizing
  dropped, tie-break toward smallest |transpose|.

## Testing

- `count_dropped`: on-scale pitch → 0; off-scale pitch → 1; off-scale becomes 0
  one semitone away.
- `best_transpose`: all-off-scale-at-0 pitches → returns a small shift with 0
  dropped; already-optimal pitches → returns `(0, 0)`; tie-break prefers the
  smaller |transpose|.
- CLI smoke: `--transpose auto` on `mad-world.midi` prints an `Auto-transpose:`
  line and drops no more notes than `--transpose 0`.

## Out of scope

- Non-integer / microtonal transposition.
- Optimizing anything other than dropped-note count (e.g. melodic range fit).
