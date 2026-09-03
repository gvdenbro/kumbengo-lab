# MIDI→Kora Playability Reduction — Design

Date: 2026-09-03
Status: Approved (pending spec review)

## Problem

`tools/midi2kora.py` converts a MIDI file (often a piano rendition) into a kora
piece YAML. Piano arrangements routinely contain note-combinations that are
physically impossible on a kora — for example, chords in `mad-world.yaml` such
as `[L9, L7, L6]` (three left-hand strings at once) or `[R6, L8, L7, L6]`
(three left-hand strings plus a right). The converter should produce only
combinations a player can actually play, while keeping the result sounding as
close to the original as the instrument allows.

Target: **guaranteed physically playable**, not guaranteed musically perfect.
A fully "foolproof" musically-optimal reduction is not achievable automatically
(choosing which voice to keep is a musical judgment); a guaranteed-playable
reduction that follows consistent, instrument-shaped heuristics is.

## Physical model

Established from kora-specific sources (thekoracafe.com construction & notation
pages, thekoraworkshop.co.uk, The Strad interview, chantshistoiremande.free.fr):

- The bridge holds strings in **two rows: 11 on the left, 10 on the right**.
  Each hand plays only its own row.
- Each hand plays with **thumb + index only** (other fingers grip the hand
  posts). Thumb plays the **lower** strings (bass line), index plays the
  **higher** strings (melody/ornament).
- Therefore: **at most 2 notes per hand, at most 4 notes total** at any instant.
- Every pitch maps to exactly one string on one specific side, so **the hand is
  forced by the pitch** — the converter never chooses L vs R.
- The thumb/index boundary is **not a fixed fret**; it is posture-based and
  described in the sources as flexible ("slightly movable"). We model it as a
  **soft split at the middle of each row with a small overlap zone**.

### String metadata

Derived directly from the existing `SILABA_MIDI_TO_STRING` mapping in
`midi2kora.py`. String IDs encode everything needed:

- Side: first character (`L` or `R`).
- Position within side: integer suffix (`L1`..`L11`, `R1`..`R10`). Higher number
  = higher pitch = further from the thumb end. (Verified against
  `src/data/tunings.yaml`: positions are monotonic in pitch on each side.)

### Default finger regions

Middle-of-row split with ~1-string overlap. As module constants, overridable by
optional CLI flags:

- Left row (`L1`..`L11`): thumb reaches `L1`–`L6`, index reaches `L5`–`L11`
  (overlap zone: `L5`, `L6`).
- Right row (`R1`..`R10`): thumb reaches `R1`–`R6`, index reaches `R5`–`R10`
  (overlap zone: `R5`, `R6`).

## Feasibility test (per onset)

A set of strings played at the same instant is playable iff, after splitting the
set by side:

- each hand has **≤2 strings**, and
- if a hand has exactly 2, the **lower** one is thumb-reachable and the
  **higher** one is index-reachable (respecting the overlap zone).

A hand with 0 or 1 string is always feasible (any single string is reachable by
at least one digit, since the regions cover the whole row).

## Reduction algorithm ("A-into-C", simultaneity only)

Each onset (chord) is reduced independently. We do **not** model finger travel
time between successive onsets — only what is playable at a single instant. (The
kora is plucked fast enough that same-instant density is the constraint that
actually breaks pieces; sequential-speed modeling can be added later if needed.)

Per onset:

1. Order the chord's notes by "outerness": the **melody (highest pitch)** and
   **bass (lowest pitch)** first, then working inward toward the middle.
2. Greedily add notes in that order, keeping a note only if the running kept-set
   still passes the feasibility test.
3. Result: outer notes are always kept (melody + bass), inner notes are filled
   in wherever a finger is still free, and any note with no free/reachable digit
   is dropped.

This mirrors the instrument's own division (thumb = bass, index = melody) and
keeps the piece as full as the kora physically allows, rather than collapsing to
a bare two-voice skeleton.

Rests (steps with a duration but no strings) are left untouched. Single-note
onsets pass through unchanged.

## Integration

- Add a pure function, e.g. `reduce_to_playable(strings: list[str]) -> list[str]`,
  independently unit-testable, taking the list of string IDs for one onset and
  returning the playable subset (order preserved for the kept notes).
- Optionally expose the finger-region bounds via parameters/CLI flags with the
  defaults above.
- Call it in `main()` **after** the existing transpose / fold / drop-unplayable
  steps, before building each YAML step.
- Print a summary to stderr, matching the style of the existing
  `Dropped N unplayable note(s)` message, e.g. `Reduced N note(s) for playability`.

## Testing

- Add `tools/test_midi2kora.py`, run via `uv run --with pytest pytest tools/`.
- Cases:
  - Impossible left-hand triad `[L9, L7, L6]` → reduces to a playable pair.
  - `[R6, L8, L7, L6]` → keeps outer notes plus one reachable inner note,
    drops the rest; result passes the feasibility test.
  - Already-playable chords (≤2 per hand, correctly split) pass through
    unchanged.
  - Single note and rest onsets untouched.
  - Overlap-zone assignment: two left-hand notes both near the middle
    (e.g. one in `L5`/`L6`) assign correctly to distinct digits.
  - The kept set always satisfies the feasibility test (property-style check).

## Out of scope

- Finger-travel / sequential-speed constraints between onsets.
- Choosing L vs R for a pitch (forced by tuning).
- Musically-optimal voice selection beyond the outer-notes-first heuristic.
