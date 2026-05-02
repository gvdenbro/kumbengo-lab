# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = [
#     "basic-pitch",
#     "demucs",
#     "librosa",
#     "pyyaml",
# ]
#
# [tool.uv]
# extra-index-url = ["https://download.pytorch.org/whl/cpu"]
# override-dependencies = ["torch==2.6.0+cpu", "torchaudio==2.6.0+cpu"]
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


def quantize(time_s: float, tempo: float, resolution: float) -> float:
    """Snap a time in seconds to the nearest beat grid position."""
    beat = time_s * tempo / 60.0
    return round(round(beat / resolution) * resolution, 4)


def build_steps(note_events, tempo: float, resolution: float, min_velocity: float, monophonic: bool = False) -> list[dict]:
    """Convert note events to quantized kora steps with relative durations."""
    print("[4/4] Quantizing and building steps...")

    STRING_TO_MIDI = {v: k for k, v in SILABA_STRINGS.items()}
    beat_map: dict[float, list[tuple[str, float]]] = {}
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
        if not any(s == string_id for s, _ in beat_map[beat]):
            beat_map[beat].append((string_id, amplitude))

    if skipped:
        print(f"   → Skipped {skipped} events (below threshold or out of range)")

    sorted_beats = sorted(beat_map.keys())
    steps = []
    for i, beat in enumerate(sorted_beats):
        d = round(sorted_beats[i + 1] - beat, 4) if i < len(sorted_beats) - 1 else 1
        if monophonic:
            # Keep loudest note within one octave of the lowest detected
            lowest_midi = min(STRING_TO_MIDI[s] for s, _ in beat_map[beat])
            candidates = [(s, a) for s, a in beat_map[beat] if STRING_TO_MIDI[s] - lowest_midi <= 12]
            best = max(candidates, key=lambda x: x[1])[0]
            steps.append({"d": d, "string": best})
        else:
            strings = [s for s, _ in beat_map[beat]]
            if len(strings) == 1:
                steps.append({"d": d, "string": strings[0]})
            else:
                steps.append({"d": d, "strings": strings})

    print(f"   → {len(steps)} steps in arrangement")
    return steps


def _represent_step(dumper, data):
    """Represent a step dict in flow style (single line)."""
    if set(data.keys()) <= {"d", "string", "strings"}:
        return dumper.represent_mapping("tag:yaml.org,2002:map", data, flow_style=True)
    return dumper.represent_mapping("tag:yaml.org,2002:map", data)


yaml.add_representer(dict, _represent_step)


def write_piece(
    arrangements: list[dict],
    output_path: Path,
    title: str,
    tempo: int,
    difficulty: str,
    tags: list[str],
) -> None:
    """Write the piece YAML file."""
    piece = {
        "title": title,
        "difficulty": difficulty,
        "tuning": "silaba",
        "tempo": tempo,
        "tags": tags,
        "arrangements": arrangements,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        yaml.dump(piece, default_flow_style=False, sort_keys=False, allow_unicode=True)
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe a kora recording to piece YAML")
    parser.add_argument("input", type=Path, nargs="+", help="Input audio or video file(s)")
    parser.add_argument("--title", help="Piece title (default: from filename)")
    parser.add_argument("--tempo", type=int, help="BPM (skip auto-detection)")
    parser.add_argument("--no-separate", action="store_true", help="Skip Demucs source separation")
    parser.add_argument("--monophonic", action="store_true", help="Keep only lowest note per beat (filter harmonics)")
    parser.add_argument("--resolution", type=float, default=0.5, help="Beat grid resolution (default: 0.5)")
    parser.add_argument("--min-velocity", type=float, default=0.3, help="Min note amplitude 0-1 (default: 0.3)")
    parser.add_argument("--difficulty", default="beginner", choices=["beginner", "intermediate", "advanced"])
    parser.add_argument("--arrangement", default="Transcribed", help="Arrangement name")
    parser.add_argument("--tags", default="transcribed", help="Comma-separated tags")
    return parser.parse_args()


def main():
    args = parse_args()

    for f in args.input:
        if not f.exists():
            print(f"Error: {f} not found", file=sys.stderr)
            sys.exit(1)

    first = args.input[0]
    title = args.title or title_from_stem(first.stem)
    output_path = PIECES_DIR / f"{first.stem}.yaml"

    if output_path.exists():
        response = input(f"{output_path} already exists. Overwrite? [y/N]: ").strip().lower()
        if response != "y":
            sys.exit(1)

    # Check ffmpeg if any input is video
    if any(f.suffix.lower() in VIDEO_EXTENSIONS for f in args.input):
        check_ffmpeg()

    print(f"Title: {title}")
    print(f"Output: {output_path}")
    print(f"Inputs: {len(args.input)} file(s)\n")

    arrangements = []
    for idx, input_file in enumerate(args.input, 1):
        if len(args.input) > 1:
            arr_name = args.arrangement if len(args.input) == 1 else f"{args.arrangement} {idx}"
            print(f"━━━ Arrangement {idx}: {input_file.name} ━━━\n")
        else:
            arr_name = args.arrangement

        with tempfile.TemporaryDirectory(prefix="kora-transcribe-") as tmp_str:
            tmp = Path(tmp_str)
            is_video = input_file.suffix.lower() in VIDEO_EXTENSIONS

            # Step 0: Extract audio from video if needed
            if is_video:
                print("[0/4] Extracting audio from video...")
                audio = extract_audio(input_file, tmp)
                print(f"   → {audio}")
            else:
                audio = input_file

            # Step 1: Source separation
            if not args.no_separate:
                audio = separate(audio, tmp)
            else:
                print("[1/4] Skipping source separation")

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

            # Step 3: Note detection
            note_events = detect_notes(audio)

            # Step 4: Build steps
            steps = build_steps(note_events, tempo, args.resolution, args.min_velocity, args.monophonic)

        if not steps:
            print(f"Warning: no notes detected in {input_file.name}, skipping", file=sys.stderr)
            continue

        arrangements.append({"name": arr_name, "difficulty": args.difficulty, "steps": steps})

    if not arrangements:
        print("No arrangements produced.", file=sys.stderr)
        sys.exit(1)

    tags = [t.strip() for t in args.tags.split(",")]
    write_piece(arrangements, output_path, title, tempo, args.difficulty, tags)
    print(f"\n✓ Written to {output_path}")
    print(f"  {len(arrangements)} arrangement(s), tempo={tempo} BPM")


if __name__ == "__main__":
    main()
