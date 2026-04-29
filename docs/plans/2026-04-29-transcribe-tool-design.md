# Audio/Video to YAML Piece Transcription Tool

## Summary

Replace `tools/transcribe.py` with a uv-based single-file script that transcribes audio or video recordings of kora performances into piece YAML files. Handles background noise via Demucs source separation, auto-detects tempo with user confirmation, and writes directly to `src/content/pieces/`.

## Usage

```
uv run tools/transcribe.py lesson-recording.mp4
uv run tools/transcribe.py clean-audio.wav --tempo 90 --no-separate
```

## Pipeline

1. **Input detection** — if video (mp4/mov/avi/mkv), extract audio via ffmpeg to temp WAV
2. **Source separation** — Demucs isolates the "other" stem (kora). Skip with `--no-separate`
3. **Tempo detection** — librosa estimates BPM, user confirms or overrides. Skip with `--tempo N`
4. **Note detection** — Basic Pitch transcribes audio to note events
5. **String mapping** — map MIDI→kora strings (deterministic 1:1 mapping, 1-semitone snap tolerance)
6. **Quantize** — snap onsets to beat grid, compute relative durations (`d`)
7. **Write YAML** — output to `src/content/pieces/<input-stem>.yaml`

## CLI arguments

- Positional: input file (audio or video)
- `--title`: piece title (default: filename stem, title-cased, dashes/underscores to spaces)
- `--tempo`: skip auto-detection, use this BPM
- `--no-separate`: skip Demucs source separation
- `--resolution`: beat grid resolution (default 0.5)
- `--min-velocity`: amplitude threshold 0-1 (default 0.3)
- `--difficulty`: beginner/intermediate/advanced (default beginner)
- `--arrangement`: arrangement name (default "Transcribed")
- `--tags`: comma-separated tags (default "transcribed")

## Dependencies

```python
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "basic-pitch",
#     "demucs",
#     "librosa",
#     "pyyaml",
# ]
# ///
```

ffmpeg is a system dependency — script checks for it at startup and errors if missing.

## Design decisions

- **Single monolithic script** with uv inline metadata. Matches kora-tap.py pattern.
- **Source separation always on** by default. Recordings have background speech and other koras from course setting.
- **Tempo: auto-detect with confirmation**. Librosa guesses, user confirms or overrides. `--tempo` skips the prompt.
- **No interactive string disambiguation**. The MIDI→kora mapping is 1:1 (deterministic). No ambiguity at runtime.
- **No preview step**. Writes YAML directly after processing.
- **Errors if output file exists** rather than silently overwriting.
- **Title defaults to filename** stem (dashes/underscores to spaces, title-cased).

## Tempo detection UX

```
[2/4] Detecting tempo...
   → Estimated: 92 BPM

Tempo [92]: _
```

User presses Enter to accept or types a number to override.

## Output

Writes to `src/content/pieces/<input-stem>.yaml` with compact flow-style steps:

```yaml
title: Lesson Recording
difficulty: beginner
tuning: silaba
tempo: 92
tags:
- transcribed
arrangements:
- name: Transcribed
  difficulty: beginner
  steps:
  - {d: 0.5, string: R2}
  - {d: 0.5, string: L4}
  - {d: 1, strings: [L1, R3]}
```
