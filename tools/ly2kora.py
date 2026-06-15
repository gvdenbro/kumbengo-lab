# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "mido",
#     "pyyaml",
# ]
# ///
"""Convert a LilyPond file to a Kumbengo Lab kora piece YAML.

Invokes LilyPond to export MIDI (ensuring correct pitch resolution),
then parses the MIDI to extract note events, transposes, and maps to kora strings.

Usage:
  uv run tools/ly2kora.py test-data/aphex.ly --transpose -7 --tempo 65 -o src/content/pieces/hy-a-scullyas.yaml
"""

import argparse
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import mido
import yaml

# Silaba tuning: midi -> string ID
SILABA_MIDI_TO_STRING: dict[int, str] = {
    41: "L1",  48: "L2",  50: "L3",  52: "L4",  55: "L5",
    58: "L6",  62: "L7",  65: "L8",  69: "L9",  72: "L10",
    76: "L11", 53: "R1",  57: "R2",  60: "R3",  64: "R4",
    67: "R5",  70: "R6",  74: "R7",  77: "R8",  79: "R9",
    81: "R10",
}


def midi_to_string(midi: int, *, fold: bool = False) -> str | None:
    """Map a MIDI note number to a Silaba kora string ID.

    If fold=True, shifts octaves to fit range. Otherwise returns None for out-of-range.
    Raises ValueError if the pitch class is not in the Silaba scale.
    """
    if fold:
        while midi > 81:
            midi -= 12
        while midi < 41:
            midi += 12
    elif midi < 41 or midi > 81:
        return None
    if midi not in SILABA_MIDI_TO_STRING:
        raise ValueError(f"MIDI {midi} (pitch class {midi % 12}) is not in Silaba tuning")
    return SILABA_MIDI_TO_STRING[midi]


def ly_to_midi(ly_path: Path) -> Path:
    """Invoke LilyPond to export MIDI from a .ly file.

    Adds \\midi block if not present. Returns path to the .mid file.
    """
    content = ly_path.read_text()

    # Ensure an active \midi block exists in the score
    if not re.search(r'^\s*\\midi\s*\{', content, re.MULTILINE):
        content = content.replace(r"\layout {}", r"\layout {} \midi {}")

    # Downgrade version if needed for local LilyPond
    result = subprocess.run(["lilypond", "--version"], capture_output=True, text=True)
    local_version = re.search(r"(\d+\.\d+\.\d+)", result.stdout)
    if local_version:
        content = re.sub(r'\\version\s+"[^"]+"', r'\\version "' + local_version.group(1) + '"', content)

    tmp_dir = Path(tempfile.mkdtemp())
    tmp_ly = tmp_dir / "input.ly"
    tmp_ly.write_text(content)

    subprocess.run(
        ["lilypond", "--loglevel=ERROR", "-dmidi-extension=mid", "-o", str(tmp_dir / "output"), str(tmp_ly)],
        check=True,
        capture_output=True,
    )
    mid_path = tmp_dir / "output.mid"
    if not mid_path.exists():
        raise RuntimeError(f"LilyPond did not produce MIDI output")
    return mid_path


def midi_to_events(mid_path: Path) -> list[tuple[int, list[int]]]:
    """Parse a MIDI file into (onset_ticks, [midi_notes]) groups."""
    mid = mido.MidiFile(str(mid_path))

    # Find the track with note events
    for track in mid.tracks:
        has_notes = any(m.type == 'note_on' and m.velocity > 0 for m in track)
        if has_notes:
            break
    else:
        raise RuntimeError("No note events found in MIDI")

    abs_time = 0
    onset_groups: dict[int, list[int]] = defaultdict(list)
    for msg in track:
        abs_time += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            onset_groups[abs_time].append(msg.note)

    sorted_onsets = sorted(onset_groups.keys())
    return [(onset, onset_groups[onset]) for onset in sorted_onsets], mid.ticks_per_beat


def events_to_yaml(events: list[tuple[int, list[int]]], *, tpb: int, title: str, transpose: int, tempo: int) -> str:
    """Convert MIDI events to Kumbengo Lab piece YAML."""
    beat_dur = 60.0 / tempo
    steps = []

    for idx, (onset, pitches) in enumerate(events):
        if idx < len(events) - 1:
            d_ticks = events[idx + 1][0] - onset
        else:
            d_ticks = tpb  # last event: 1 beat
        d_seconds = round((d_ticks / tpb) * beat_dur, 3)

        transposed = [n + transpose for n in pitches]
        strings = [s for m in transposed if (s := midi_to_string(m)) is not None]
        strings = list(dict.fromkeys(strings))  # deduplicate

        step: dict = {"d": d_seconds}
        if len(strings) == 1:
            step["string"] = strings[0]
        elif len(strings) > 1:
            step["strings"] = strings
        steps.append(step)

    piece = {
        "title": title,
        "tuning": "silaba",
        "tags": ["cover"],
        "arrangements": [{"name": "Full", "steps": steps}],
    }
    return yaml.dump(piece, default_flow_style=None, sort_keys=False, allow_unicode=True)


def main():
    parser = argparse.ArgumentParser(description="Convert LilyPond to kora piece YAML")
    parser.add_argument("input", help="Input .ly file")
    parser.add_argument("--transpose", type=int, default=0, help="Semitones to transpose")
    parser.add_argument("--tempo", type=int, default=None, help="BPM (overrides file tempo)")
    parser.add_argument("-o", "--output", help="Output YAML path (default: stdout)")
    parser.add_argument("--title", help="Piece title (default: from file header)")
    args = parser.parse_args()

    ly_path = Path(args.input)
    content = ly_path.read_text()

    # Extract title from header if not specified
    title = args.title
    if not title:
        m = re.search(r'title\s*=\s*"([^"]+)"', content)
        title = m.group(1) if m else "Untitled"

    # Extract tempo from file if not specified
    tempo = args.tempo
    if not tempo:
        m = re.search(r"\\tempo\s+4\s*=\s*(\d+)", content)
        tempo = int(m.group(1)) if m else 120

    # Convert LilyPond → MIDI → events
    mid_path = ly_to_midi(ly_path)
    events, tpb = midi_to_events(mid_path)

    # Generate YAML
    output = events_to_yaml(events, tpb=tpb, title=title, transpose=args.transpose, tempo=tempo)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
