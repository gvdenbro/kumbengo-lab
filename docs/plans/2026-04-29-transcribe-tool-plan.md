# Transcribe Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `tools/transcribe.py` with a uv-based script that transcribes audio/video kora recordings into piece YAML files with auto tempo detection and source separation.

**Architecture:** Single-file Python script with uv inline metadata. Linear pipeline: input detection → ffmpeg extraction → Demucs separation → librosa tempo → Basic Pitch notes → MIDI→kora mapping → quantize → write YAML. Pure functions are unit-tested; integration tested manually with real audio.

**Tech Stack:** Python 3.12+, uv, Basic Pitch, Demucs, librosa, PyYAML, ffmpeg (system)

**Design doc:** `docs/plans/2026-04-29-transcribe-tool-design.md`

---

### Task 1: Scaffold the script with uv metadata and CLI parsing

**Files:**
- Create: `tools/transcribe.py` (replaces existing)
- Test: `tools/test_transcribe.py`

**Step 1: Write the script skeleton**

Replace `tools/transcribe.py` with:

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
"""Transcribe a kora recording (audio or video) to a Kumbengo Lab piece YAML.

Usage:
  uv run tools/transcribe.py recording.mp4
  uv run tools/transcribe.py clean.wav --tempo 90 --no-separate
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
PIECES_DIR = Path("src/content/pieces")


def title_from_stem(stem: str) -> str:
    """Convert filename stem to title: dashes/underscores to spaces, title-cased."""
    return stem.replace("-", " ").replace("_", " ").title()


def check_ffmpeg() -> None:
    """Exit with helpful message if ffmpeg is not installed."""
    if not shutil.which("ffmpeg"):
        print("Error: ffmpeg not found. Install it: sudo apt install ffmpeg", file=sys.stderr)
        sys.exit(1)


def extract_audio(video_path: Path, output_dir: Path) -> Path:
    """Extract audio from video file using ffmpeg."""
    out = output_dir / "audio.wav"
    subprocess.run(
        ["ffmpeg", "-i", str(video_path), "-vn", "-ac", "1", "-ar", "44100", "-y", str(out)],
        check=True,
        capture_output=True,
    )
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe a kora recording to piece YAML")
    parser.add_argument("input", type=Path, help="Input audio or video file")
    parser.add_argument("--title", help="Piece title (default: from filename)")
    parser.add_argument("--tempo", type=int, help="BPM (skip auto-detection)")
    parser.add_argument("--no-separate", action="store_true", help="Skip Demucs source separation")
    parser.add_argument("--resolution", type=float, default=0.5, help="Beat grid resolution (default: 0.5)")
    parser.add_argument("--min-velocity", type=float, default=0.3, help="Min note amplitude 0-1 (default: 0.3)")
    parser.add_argument("--difficulty", default="beginner", choices=["beginner", "intermediate", "advanced"])
    parser.add_argument("--arrangement", default="Transcribed", help="Arrangement name")
    parser.add_argument("--tags", default="transcribed", help="Comma-separated tags")
    return parser.parse_args()


def main():
    args = parse_args()

    if not args.input.exists():
        print(f"Error: {args.input} not found", file=sys.stderr)
        sys.exit(1)

    title = args.title or title_from_stem(args.input.stem)
    output_path = PIECES_DIR / f"{args.input.stem}.yaml"

    if output_path.exists():
        print(f"Error: {output_path} already exists", file=sys.stderr)
        sys.exit(1)

    is_video = args.input.suffix.lower() in VIDEO_EXTENSIONS
    if is_video:
        check_ffmpeg()

    print(f"Transcribing: {args.input}")
    print(f"Title: {title}")
    print(f"Output: {output_path}\n")

    # TODO: implement pipeline steps
    print("Pipeline not yet implemented.")


if __name__ == "__main__":
    main()
```

**Step 2: Write tests for pure utility functions**

Create `tools/test_transcribe.py`:

```python
import pytest
from pathlib import Path
from transcribe import title_from_stem, VIDEO_EXTENSIONS


class TestTitleFromStem:
    def test_dashes_to_spaces(self):
        assert title_from_stem("lesson-recording") == "Lesson Recording"

    def test_underscores_to_spaces(self):
        assert title_from_stem("my_piece_name") == "My Piece Name"

    def test_mixed(self):
        assert title_from_stem("jarabi-intro_v2") == "Jarabi Intro V2"

    def test_single_word(self):
        assert title_from_stem("jarabi") == "Jarabi"


class TestVideoExtensions:
    def test_mp4_is_video(self):
        assert ".mp4" in VIDEO_EXTENSIONS

    def test_wav_is_not_video(self):
        assert ".wav" not in VIDEO_EXTENSIONS

    def test_mov_is_video(self):
        assert ".mov" in VIDEO_EXTENSIONS
```

**Step 3: Run tests**

Run: `cd tools && python -m pytest test_transcribe.py -v`
Expected: All pass.

**Step 4: Commit**

```bash
git add tools/transcribe.py tools/test_transcribe.py
git commit -m "feat(transcribe): scaffold script with CLI and utilities"
```

---

### Task 2: Implement source separation

**Files:**
- Modify: `tools/transcribe.py`

**Step 1: Add the separate function**

Add after `extract_audio`:

```python
def separate(audio_path: Path, output_dir: Path) -> Path:
    """Run Demucs source separation, return path to isolated 'other' stem."""
    print("[1/4] Separating sources with Demucs...")
    subprocess.run(
        [sys.executable, "-m", "demucs", "-o", str(output_dir), str(audio_path)],
        check=True,
    )
    stem_name = audio_path.stem
    other = output_dir / "htdemucs" / stem_name / "other.wav"
    if not other.exists():
        # Try finding it in any subdirectory
        for d in (output_dir / "htdemucs").iterdir():
            candidate = d / "other.wav"
            if candidate.exists():
                other = candidate
                break
    if not other.exists():
        print("   Warning: could not find separated stem, using original audio")
        return audio_path
    print(f"   → Isolated kora: {other}")
    return other
```

**Step 2: Wire into main**

Replace the `# TODO: implement pipeline steps` block in `main()` with:

```python
    tmp = Path(tempfile.mkdtemp(prefix="kora-transcribe-"))

    # Step 0: Extract audio from video if needed
    if is_video:
        print("[0/4] Extracting audio from video...")
        audio = extract_audio(args.input, tmp)
        print(f"   → {audio}")
    else:
        audio = args.input

    # Step 1: Source separation
    if not args.no_separate:
        audio = separate(audio, tmp)
    else:
        print("[1/4] Skipping source separation")

    # TODO: steps 2-4
    print("\nRemaining pipeline steps not yet implemented.")
```

**Step 3: Commit**

```bash
git add tools/transcribe.py
git commit -m "feat(transcribe): add video extraction and source separation"
```

---

### Task 3: Implement tempo detection

**Files:**
- Modify: `tools/transcribe.py`
- Modify: `tools/test_transcribe.py`

**Step 1: Add detect_tempo function**

Add after `separate`:

```python
def detect_tempo(audio_path: Path) -> float:
    """Estimate tempo using librosa."""
    import librosa
    y, sr = librosa.load(str(audio_path), sr=44100)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)


def confirm_tempo(estimated: float) -> int:
    """Show estimated tempo, let user confirm or override."""
    rounded = round(estimated)
    response = input(f"Tempo [{rounded}]: ").strip()
    if not response:
        return rounded
    try:
        return int(response)
    except ValueError:
        print(f"   Invalid input, using {rounded}")
        return rounded
```

**Step 2: Wire into main**

Add after the separation step:

```python
    # Step 2: Tempo detection
    if args.tempo:
        tempo = args.tempo
        print(f"[2/4] Using provided tempo: {tempo} BPM")
    else:
        print("[2/4] Detecting tempo...")
        estimated = detect_tempo(audio)
        print(f"   → Estimated: {round(estimated)} BPM\n")
        tempo = confirm_tempo(estimated)
    print()
```

**Step 3: Commit**

```bash
git add tools/transcribe.py
git commit -m "feat(transcribe): add tempo detection with confirmation"
```

---

### Task 4: Implement note detection and string mapping

**Files:**
- Modify: `tools/transcribe.py`
- Modify: `tools/test_transcribe.py`

**Step 1: Add kora tuning map and snap function**

Add after the imports:

```python
SILABA_STRINGS = {
    41: "L1",   # F2
    48: "L2",   # C3
    50: "L3",   # D3
    52: "L4",   # E3
    53: "R1",   # F3
    55: "L5",   # G3
    57: "R2",   # A3
    58: "L6",   # Bb3
    60: "R3",   # C4
    62: "L7",   # D4
    64: "R4",   # E4
    65: "L8",   # F4
    67: "R5",   # G4
    69: "L9",   # A4
    70: "R6",   # Bb4
    72: "L10",  # C5
    74: "R7",   # D5
    76: "L11",  # E5
    77: "R8",   # F5
    79: "R9",   # G5
    81: "R10",  # A5
}

KORA_MIDI_NOTES = sorted(SILABA_STRINGS.keys())


def snap_midi_to_kora(midi: int) -> str | None:
    """Map a MIDI note to the nearest kora string. Returns None if too far."""
    if midi in SILABA_STRINGS:
        return SILABA_STRINGS[midi]
    closest = min(KORA_MIDI_NOTES, key=lambda k: abs(k - midi))
    if abs(closest - midi) <= 1:
        return SILABA_STRINGS[closest]
    return None
```

**Step 2: Add note detection function**

```python
def detect_notes(audio_path: Path):
    """Run Basic Pitch and return note events."""
    print("[3/4] Detecting notes with Basic Pitch...")
    from basic_pitch.inference import predict

    _model_output, _midi_data, note_events = predict(
        str(audio_path),
        minimum_frequency=85.0,
        maximum_frequency=900.0,
    )
    print(f"   → Detected {len(note_events)} raw note events")
    return note_events
```

**Step 3: Write tests for snap_midi_to_kora**

Add to `tools/test_transcribe.py`:

```python
from transcribe import snap_midi_to_kora


class TestSnapMidiToKora:
    def test_exact_match(self):
        assert snap_midi_to_kora(60) == "R3"  # C4

    def test_one_semitone_above(self):
        assert snap_midi_to_kora(61) == "R3"  # C#4 snaps to C4

    def test_one_semitone_below(self):
        assert snap_midi_to_kora(59) == "L6"  # B3 snaps to Bb3 (58)

    def test_too_far(self):
        assert snap_midi_to_kora(30) is None  # way below kora range

    def test_highest_kora_note(self):
        assert snap_midi_to_kora(81) == "R10"  # A5
```

**Step 4: Run tests**

Run: `cd tools && python -m pytest test_transcribe.py -v`
Expected: All pass.

**Step 5: Wire into main**

Add after tempo detection:

```python
    # Step 3: Note detection
    note_events = detect_notes(audio)
```

**Step 6: Commit**

```bash
git add tools/transcribe.py tools/test_transcribe.py
git commit -m "feat(transcribe): add note detection and MIDI-to-kora mapping"
```

---

### Task 5: Implement quantization and step building

**Files:**
- Modify: `tools/transcribe.py`
- Modify: `tools/test_transcribe.py`

**Step 1: Add quantize and build_steps functions**

```python
def quantize(time_s: float, tempo: float, resolution: float) -> float:
    """Snap a time in seconds to the nearest beat grid position."""
    beat = time_s * tempo / 60.0
    return round(round(beat / resolution) * resolution, 4)


def build_steps(note_events, tempo: float, resolution: float, min_velocity: float) -> list[dict]:
    """Convert note events to quantized kora steps with relative durations."""
    print("[4/4] Quantizing and building steps...")

    beat_map: dict[float, list[str]] = {}
    skipped = 0

    for event in note_events:
        onset_s, _end_s, midi, amplitude = event[:4]
        if amplitude < min_velocity:
            skipped += 1
            continue
        string_id = snap_midi_to_kora(round(midi))
        if string_id is None:
            skipped += 1
            continue
        beat = quantize(onset_s, tempo, resolution)
        beat_map.setdefault(beat, [])
        if string_id not in beat_map[beat]:
            beat_map[beat].append(string_id)

    if skipped:
        print(f"   → Skipped {skipped} events (below threshold or out of range)")

    sorted_beats = sorted(beat_map.keys())
    steps = []
    for i, beat in enumerate(sorted_beats):
        d = round(sorted_beats[i + 1] - beat, 4) if i < len(sorted_beats) - 1 else 1
        strings = beat_map[beat]
        if len(strings) == 1:
            steps.append({"d": d, "string": strings[0]})
        else:
            steps.append({"d": d, "strings": strings})

    print(f"   → {len(steps)} steps in arrangement")
    return steps
```

**Step 2: Write tests for quantize**

Add to `tools/test_transcribe.py`:

```python
from transcribe import quantize, build_steps


class TestQuantize:
    def test_exact_beat(self):
        # 1 second at 120 BPM = beat 2.0, snaps to 2.0
        assert quantize(1.0, 120, 0.5) == 2.0

    def test_snaps_to_half_beat(self):
        # 0.3s at 120 BPM = beat 0.6, snaps to 0.5
        assert quantize(0.3, 120, 0.5) == 0.5

    def test_snaps_to_whole_beat(self):
        # 0.48s at 120 BPM = beat 0.96, snaps to 1.0
        assert quantize(0.48, 120, 0.5) == 1.0

    def test_zero(self):
        assert quantize(0.0, 90, 0.5) == 0.0


class TestBuildSteps:
    def test_basic(self):
        # Fake note events: (onset_s, end_s, midi, amplitude)
        events = [
            (0.0, 0.5, 60, 0.8),   # C4 = R3
            (0.5, 1.0, 57, 0.7),   # A3 = R2
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert steps == [
            {"d": 0.5, "string": "R3"},
            {"d": 1, "string": "R2"},
        ]

    def test_filters_low_velocity(self):
        events = [
            (0.0, 0.5, 60, 0.1),   # below threshold
            (0.5, 1.0, 57, 0.7),
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert len(steps) == 1
        assert steps[0]["string"] == "R2"

    def test_simultaneous_notes(self):
        events = [
            (0.0, 0.5, 60, 0.8),   # R3
            (0.0, 0.5, 41, 0.8),   # L1
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert len(steps) == 1
        assert set(steps[0]["strings"]) == {"R3", "L1"}
```

**Step 3: Run tests**

Run: `cd tools && python -m pytest test_transcribe.py -v`
Expected: All pass.

**Step 4: Wire into main**

Add after note detection:

```python
    # Step 4: Build steps
    steps = build_steps(note_events, tempo, args.resolution, args.min_velocity)

    if not steps:
        print("No kora notes detected. Try lowering --min-velocity.", file=sys.stderr)
        sys.exit(1)
```

**Step 5: Commit**

```bash
git add tools/transcribe.py tools/test_transcribe.py
git commit -m "feat(transcribe): add quantization and step building"
```

---

### Task 6: Implement YAML output

**Files:**
- Modify: `tools/transcribe.py`

**Step 1: Add YAML output function and representer**

```python
def _represent_step(dumper, data):
    """Represent a step dict in flow style (single line)."""
    if set(data.keys()) <= {"d", "string", "strings"}:
        return dumper.represent_mapping("tag:yaml.org,2002:map", data, flow_style=True)
    return dumper.represent_mapping("tag:yaml.org,2002:map", data)


yaml.add_representer(dict, _represent_step)


def write_piece(
    steps: list[dict],
    output_path: Path,
    title: str,
    tempo: int,
    difficulty: str,
    arrangement_name: str,
    tags: list[str],
) -> None:
    """Write the piece YAML file."""
    piece = {
        "title": title,
        "difficulty": difficulty,
        "tuning": "silaba",
        "tempo": tempo,
        "tags": tags,
        "arrangements": [
            {
                "name": arrangement_name,
                "difficulty": difficulty,
                "steps": steps,
            }
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        yaml.dump(piece, default_flow_style=False, sort_keys=False, allow_unicode=True)
    )
```

**Step 2: Wire into main**

Add at the end of `main()`:

```python
    # Write output
    tags = [t.strip() for t in args.tags.split(",")]
    write_piece(steps, output_path, title, tempo, args.difficulty, args.arrangement, tags)
    print(f"\n✓ Written to {output_path}")
    print(f"  {len(steps)} steps, tempo={tempo} BPM")
```

**Step 3: Commit**

```bash
git add tools/transcribe.py
git commit -m "feat(transcribe): add YAML output"
```

---

### Task 7: Delete old test file and final cleanup

**Files:**
- Delete: `tools/test_kora_tap.py` (if it tests old transcribe behavior — check first)
- Modify: `tools/test_transcribe.py` (if needed)

**Step 1: Run all tests**

Run: `cd tools && python -m pytest test_transcribe.py -v`
Expected: All pass.

**Step 2: Verify the script runs (dry run with --help)**

Run: `cd /home/devlin/dev/personal/kumbengo-lab && uv run tools/transcribe.py --help`
Expected: Shows help text with all arguments.

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat(transcribe): complete audio/video to YAML transcription tool"
```

---

### Task 8: Manual integration test

**Step 1: Test with a real audio file**

Find or record a short kora audio clip. Run:

```bash
uv run tools/transcribe.py path/to/recording.wav
```

Verify:
- Tempo detection prompt appears
- Steps are generated
- YAML file is written to `src/content/pieces/`
- File validates with `npm run build`

**Step 2: Test with a video file**

```bash
uv run tools/transcribe.py path/to/video.mp4
```

Verify:
- ffmpeg extracts audio
- Rest of pipeline works the same

**Step 3: Test --no-separate and --tempo flags**

```bash
uv run tools/transcribe.py path/to/recording.wav --tempo 90 --no-separate
```

Verify: No Demucs step, no tempo prompt, runs faster.
