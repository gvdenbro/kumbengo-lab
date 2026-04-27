#!/usr/bin/env python3
"""Transcribe a kora recording to a Kumbengo Lab arrangement YAML.

Pipeline:
  1. (Optional) Isolate the kora with Demucs source separation
  2. Detect notes with Spotify Basic Pitch
  3. Quantize onsets to a beat grid
  4. Map MIDI pitches to kora string IDs
  5. Emit arrangement YAML

Usage:
  pip install basic-pitch demucs pyyaml
  python tools/transcribe.py recording.mp3 --title "My Piece" --tempo 90

  # Skip source separation if the recording is already clean:
  python tools/transcribe.py clean.wav --title "My Piece" --tempo 90 --no-separate
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Kora tuning: MIDI note -> string ID (silaba)
# When two strings share a MIDI note this prefers the right-hand string,
# since right-hand strings are melodically more common.
# ---------------------------------------------------------------------------
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
    # Find closest kora note (max 1 semitone tolerance)
    closest = min(KORA_MIDI_NOTES, key=lambda k: abs(k - midi))
    if abs(closest - midi) <= 1:
        return SILABA_STRINGS[closest]
    return None


def quantize(time_s: float, tempo: float, resolution: float = 0.5) -> float:
    """Snap a time in seconds to the nearest beat grid position."""
    beat = time_s * tempo / 60.0
    quantized = round(beat / resolution) * resolution
    return round(quantized, 4)


# ---------------------------------------------------------------------------
# Step 1: Source separation with Demucs
# ---------------------------------------------------------------------------
def separate(audio_path: Path, output_dir: Path) -> Path:
    """Run Demucs and return the path to the 'other' stem."""
    print(f"[1/3] Separating sources with Demucs...")
    subprocess.run(
        [sys.executable, "-m", "demucs", "-o", str(output_dir), str(audio_path)],
        check=True,
    )
    # Demucs outputs to <output_dir>/htdemucs/<stem_name>/other.wav
    stem_name = audio_path.stem
    other = output_dir / "htdemucs" / stem_name / "other.wav"
    if not other.exists():
        # Try alternate model name
        for d in (output_dir / "htdemucs").iterdir():
            candidate = d / "other.wav"
            if candidate.exists():
                other = candidate
                break
    if not other.exists():
        print(f"Warning: could not find separated stem, using original audio")
        return audio_path
    print(f"   → Isolated kora: {other}")
    return other


# ---------------------------------------------------------------------------
# Step 2: Note detection with Basic Pitch
# ---------------------------------------------------------------------------
def detect_notes(audio_path: Path, min_freq: float, max_freq: float):
    """Run Basic Pitch and return note events."""
    print(f"[2/3] Detecting notes with Basic Pitch...")
    from basic_pitch.inference import predict

    _model_output, _midi_data, note_events = predict(
        str(audio_path),
        minimum_frequency=min_freq,
        maximum_frequency=max_freq,
    )
    # note_events: list of (start_time_s, end_time_s, midi_pitch, amplitude, [pitch_bend])
    print(f"   → Detected {len(note_events)} raw note events")
    return note_events


# ---------------------------------------------------------------------------
# Step 3: Map to kora strings and quantize
# ---------------------------------------------------------------------------
def build_steps(note_events, tempo: float, resolution: float, min_velocity: float):
    """Convert note events to quantized kora steps."""
    print(f"[3/3] Mapping to kora strings (tempo={tempo}, resolution={resolution})...")

    # Group simultaneous notes by quantized beat
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
        print(f"   → Skipped {skipped} events (below velocity threshold or out of kora range)")

    # Build step list sorted by beat
    steps = []
    for beat in sorted(beat_map.keys()):
        strings = beat_map[beat]
        if len(strings) == 1:
            steps.append({"t": beat, "string": strings[0]})
        else:
            steps.append({"t": beat, "strings": strings})

    print(f"   → {len(steps)} steps in arrangement")
    return steps


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def emit_yaml(
    steps: list[dict],
    title: str,
    tempo: int,
    difficulty: str,
    arrangement_name: str,
    tags: list[str],
) -> str:
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
    return yaml.dump(piece, default_flow_style=None, sort_keys=False, allow_unicode=True)


# ---------------------------------------------------------------------------
# Custom YAML representer: compact step format like { t: 0, string: L4 }
# ---------------------------------------------------------------------------
def _represent_step(dumper, data):
    """Represent a step dict in flow style (single line)."""
    if set(data.keys()) <= {"t", "string", "strings"}:
        return dumper.represent_mapping("tag:yaml.org,2002:map", data, flow_style=True)
    return dumper.represent_mapping("tag:yaml.org,2002:map", data)


yaml.add_representer(dict, _represent_step)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Transcribe a kora recording to Kumbengo Lab YAML"
    )
    parser.add_argument("audio", type=Path, help="Input audio file")
    parser.add_argument("--title", required=True, help="Piece title")
    parser.add_argument("--tempo", type=int, required=True, help="BPM of the recording")
    parser.add_argument("--difficulty", default="beginner", choices=["beginner", "intermediate", "advanced"])
    parser.add_argument("--arrangement", default="Transcribed", help="Arrangement name")
    parser.add_argument("--tags", default="transcribed", help="Comma-separated tags")
    parser.add_argument("--resolution", type=float, default=0.5, help="Beat grid resolution (default: 0.5 = eighth notes)")
    parser.add_argument("--min-velocity", type=float, default=0.3, help="Minimum note amplitude 0-1 (filters weak detections)")
    parser.add_argument("--no-separate", action="store_true", help="Skip Demucs source separation")
    parser.add_argument("-o", "--output", type=Path, help="Output YAML path (default: stdout)")

    args = parser.parse_args()

    if not args.audio.exists():
        print(f"Error: {args.audio} not found", file=sys.stderr)
        sys.exit(1)

    # Kora range: F2 (87 Hz) to A5 (880 Hz)
    min_freq = 85.0
    max_freq = 900.0

    audio = args.audio

    # Step 1: Source separation
    if not args.no_separate:
        tmp = Path(tempfile.mkdtemp(prefix="kora-transcribe-"))
        audio = separate(audio, tmp)

    # Step 2: Note detection
    note_events = detect_notes(audio, min_freq, max_freq)

    # Step 3: Map and quantize
    steps = build_steps(note_events, args.tempo, args.resolution, args.min_velocity)

    if not steps:
        print("No kora notes detected. Try lowering --min-velocity or checking the audio.", file=sys.stderr)
        sys.exit(1)

    # Output
    result = emit_yaml(
        steps,
        title=args.title,
        tempo=args.tempo,
        difficulty=args.difficulty,
        arrangement_name=args.arrangement,
        tags=[t.strip() for t in args.tags.split(",")],
    )

    if args.output:
        args.output.write_text(result)
        print(f"\nWritten to {args.output}")
    else:
        print("\n--- Generated YAML ---")
        print(result)


if __name__ == "__main__":
    main()
