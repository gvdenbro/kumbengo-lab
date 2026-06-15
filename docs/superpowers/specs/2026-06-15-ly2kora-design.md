# LilyPond to Kora Converter — Design Spec

## Goal

Convert a LilyPond guitar arrangement of "Hy a Scullyas Lyf Adhagrow" (Aphex Twin) into a playable Kumbengo Lab piece YAML, transposed to fit the Silaba kora tuning.

## Input

`test-data/aphex.ly` — a two-voice LilyPond file (Simon Farintosh guitar arrangement). Key of C major, ♩=65, 4/4 time, 12 bars per voice.

## Output

`src/content/pieces/hy-a-scullyas.yaml` — a piece file matching the existing format with title, tuning, tags, and a single "Full" arrangement containing a flat step timeline.

## Script

**`tools/ly2kora.py`**

Usage:
```bash
uv run tools/ly2kora.py test-data/aphex.ly --transpose 5 --tempo 65 -o src/content/pieces/hy-a-scullyas.yaml
```

CLI arguments:
- Positional: input `.ly` file path
- `--transpose`: semitones to shift (default 0)
- `--tempo`: quarter-note BPM for duration calculation (default from file)
- `-o` / `--output`: output YAML path (default stdout)

Dependency: `python-ly` (managed via `uv`; script uses inline metadata `# /// script` block)

## Pipeline

1. **Parse** — Use `python-ly` (`ly.document`, `ly.music`) to build a music tree from the LilyPond file.
2. **Walk voices** — Extract both voice blocks. For each voice, iterate the tree tracking:
   - Current pitch (resolving `\relative` octave inference)
   - Current duration (LilyPond's sticky duration rule)
   - Ties (extend previous note, no new event)
   - Chords (`<e a>`) → multiple pitches at one onset
3. **Merge** — Each voice produces `(onset_time_in_beats, pitches, duration_in_beats)` events. Merge into one list sorted by onset time.
4. **Transpose & map** — Add `--transpose` semitones to each MIDI pitch. Look up the exact Silaba kora string from a hardcoded table (21 strings, F2–A5, midi 41–81).
5. **Compute durations** — Each step's `d` = time gap to next event in seconds. One beat = 60 / tempo. Last note uses its own written duration.
6. **Emit YAML** — Write piece file with:
   - `title: Hy a Scullyas Lyf Adhagrow`
   - `tuning: silaba`
   - `tags: [cover]`
   - One arrangement "Full" with the merged step list.

## Pitch mapping (after +5 semitone transposition)

C major → F major. Every note maps exactly:

| Original | Transposed | Kora strings (by octave) |
|----------|-----------|--------------------------|
| C | F | L1(F2), R1(F3), L8(F4), R8(F5) |
| D | G | L5(G3), R5(G4), R9(G5) |
| E | A | R2(A3), L9(A4), R10(A5) |
| F | Bb | L6(Bb3), R6(Bb4) |
| G | C | L2(C3), R3(C4), L10(C5) |
| A | D | L3(D3), L7(D4), R7(D5) |
| B | E | L4(E3), R4(E4), L11(E5) |

Octave selection is determined by the absolute pitch from the LilyPond `\relative` resolution.

## Edge cases

- **Simultaneous notes** — Events at the same onset become one step with `strings: [...]`.
- **Ties** — Extend previous event's duration; no new step emitted.
- **Rests** — A step with `d` but no `string`/`strings` field.
- **Dotted rhythms** — Duration × 1.5 (double dot × 1.75 if encountered).
- **Range validation** — Assert every transposed pitch is midi 41–81. Error with note name and bar number if out of range.
- **No repeats** — The file has no `\repeat` constructs; unrolling is out of scope.

## Testing

- Unit test the pitch transposition and string mapping (pure function, easy to test).
- Run the script against `test-data/aphex.ly` and validate the output YAML loads correctly as a piece (schema validation via the content config).
- Spot-check a few measures against manual calculation.

## Constraints

- Python 3, consistent with existing `tools/` scripts.
- Single dependency: `python-ly`, declared via PEP 723 inline script metadata for use with `uv run`.
- Output must conform to the existing piece YAML schema (validated by `src/content.config.ts`).
