# Kumbengo Lab

Learn the kora, one piece at a time. A static site for browsing kora pieces, viewing printable tablature, and playing back pieces interactively with a bridge diagram and lookahead display. Includes a transcription tool for capturing arrangements from recordings.

## Getting started

```bash
mise install   # install Node 22
npm install
npm run dev    # http://localhost:4321
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build static site to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Run tests |

## Adding a piece

Create a YAML file in `src/content/pieces/`. The filename becomes the URL slug (e.g., `my-piece.yaml` → `/pieces/my-piece/`).

```yaml
title: My Piece
tuning: silaba
tags: [traditional]

arrangements:
  - name: Melody only
    steps:
      - { d: 0.5, string: L4 }
      - { d: 0.5, string: R2 }
      - { d: 1,   strings: [L1, L5] }  # multiple strings at once
```

Each step has a duration `d` (seconds until next event) and either `string` (single) or `strings` (array). Steps with `d` but no string are rests. YAML anchors/aliases can reuse step sequences across arrangements. String IDs are `L1`–`L11` (left hand) and `R1`–`R10` (right hand).

## Transcribe tool

Navigate to `/transcribe` to capture arrangements from audio recordings:

1. Load an audio file (drag-and-drop or file picker)
2. Define the rhythm using one of two methods:
   - **Tap:** Play the audio in a loop at 50%/75%/100% speed and tap spacebar to mark note onsets
   - **Import Audacity labels:** Use Audacity's note onset detection plugin to generate labels, export them (File → Export Labels), and upload the `.txt` file
3. Verify the extracted rhythm, retry if needed
4. Assign strings by clicking the interactive bridge diagram
5. Copy the generated YAML and paste into a piece file

## MIDI to kora

Generate a piece YAML from any MIDI file:

```bash
uv run tools/midi2kora.py input.mid --transpose auto --tempo 100 --title "My Piece" --drop-unplayable -o src/content/pieces/my-piece.yaml
```

Options:
- `--transpose` — semitones to shift, or `auto` to automatically pick the key that drops the fewest notes. Default `0`. In `auto` mode it searches −12…+12 semitones, keeps the fewest-dropped key (ties favor the smallest shift), and prints e.g. `Auto-transpose: +2 (drops 22 note(s))`.
- `--tempo` — BPM for duration calculation (default 120)
- `--title` — piece title in the YAML
- `--fold` — fold out-of-range notes into nearest octave instead of dropping them
- `--drop-unplayable` — drop notes with no Silaba string (off-scale or low-register gap notes) instead of erroring
- `-o` — output file (prints to stdout if omitted)

**Playability reduction (automatic).** Because a kora is played with only the thumb (low strings) and index (high strings) of each hand, at most 2 notes can sound per hand and 4 in total. The converter automatically reduces any chord that exceeds this to its most playable subset — keeping the outer notes (melody + bass) first and filling in inner notes only where a finger is free — and reports `Reduced N note(s) for playability` on stderr. Off-scale or out-of-range notes are separate: handle those with `--transpose`/`--fold`/`--drop-unplayable`.

If your source is LilyPond, export MIDI first:

```bash
lilypond -dmidi-extension=mid file.ly
```

## Tech stack

Astro 6, TypeScript, Pico CSS, superdough (Web Audio), Vitest. Deployed to Cloudflare Pages.

## TODO

- **Kora sound sample** — Replace the VCSL `folkharp` with an actual kora sample. No free, openly-licensed kora multisample pack exists today; options include recording one, commissioning samples, or sourcing from a rights-cleared library.

## License

AGPL-3.0
