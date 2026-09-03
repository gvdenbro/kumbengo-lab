# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "mido",
#     "pyyaml",
# ]
# ///
"""Convert a MIDI file to a Kumbengo Lab kora piece YAML.

Usage:
  uv run tools/midi2kora.py test-data/aphex-compat.mid --transpose -7 --tempo 65 -o src/content/pieces/hy-a-scullyas.yaml
"""

import argparse
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


def midi_to_string(midi: int, *, fold: bool = False, drop: bool = False) -> str | None:
    """Map a MIDI note number to a Silaba kora string ID.

    If fold=True, shifts octaves to fit range. Otherwise returns None for out-of-range.
    If drop=True, returns None for notes not on a Silaba string (off-scale or gap notes).
    Otherwise raises ValueError for such notes.
    """
    if fold:
        while midi > 81:
            midi -= 12
        while midi < 41:
            midi += 12
    elif midi < 41 or midi > 81:
        return None
    if midi not in SILABA_MIDI_TO_STRING:
        if drop:
            return None
        raise ValueError(f"MIDI {midi} (pitch class {midi % 12}) is not in Silaba tuning")
    return SILABA_MIDI_TO_STRING[midi]


# Soft thumb/index split per side (position numbers). Thumb reaches
# positions 1..thumb_max; index reaches index_min..count. Positions in
# [index_min, thumb_max] are the overlap zone (either digit).
FINGER_REACH: dict[str, dict[str, int]] = {
    "L": {"thumb_max": 6, "index_min": 5, "count": 11},
    "R": {"thumb_max": 6, "index_min": 5, "count": 10},
}


def parse_string(s: str) -> tuple[str, int]:
    """Split a string ID like 'L11' into ('L', 11)."""
    return s[0], int(s[1:])


def is_playable(strings: list[str]) -> bool:
    """True if all strings can sound at the same instant on a kora.

    Each hand has a thumb (low strings) and index (high strings): at most
    2 notes per side, and if 2, the lower must be thumb-reachable and the
    higher index-reachable.
    """
    by_side: dict[str, list[int]] = {"L": [], "R": []}
    for s in strings:
        side, pos = parse_string(s)
        by_side[side].append(pos)
    for side, positions in by_side.items():
        if len(positions) > 2:
            return False
        if len(positions) == 2:
            low, high = sorted(positions)
            reach = FINGER_REACH[side]
            if not (low <= reach["thumb_max"] and high >= reach["index_min"]):
                return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Convert MIDI to kora piece YAML")
    parser.add_argument("input", help="Input .mid file")
    parser.add_argument("--transpose", type=int, default=0, help="Semitones to transpose")
    parser.add_argument("--tempo", type=int, default=120, help="BPM for duration calculation")
    parser.add_argument("--title", default="Untitled", help="Piece title")
    parser.add_argument("--fold", action="store_true", help="Fold out-of-range notes into nearest octave (default: drop)")
    parser.add_argument("--drop-unplayable", action="store_true", help="Drop notes with no Silaba string (off-scale or gap notes) instead of erroring")
    parser.add_argument("-o", "--output", help="Output YAML path (default: stdout)")
    args = parser.parse_args()

    mid = mido.MidiFile(args.input)

    # Find track with note events
    for track in mid.tracks:
        if any(m.type == 'note_on' and m.velocity > 0 for m in track):
            break
    else:
        print("Error: no note events found in MIDI", file=__import__('sys').stderr)
        raise SystemExit(1)

    # Extract note onsets grouped by time
    abs_time = 0
    onset_groups: dict[int, list[int]] = defaultdict(list)
    for msg in track:
        abs_time += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            onset_groups[abs_time].append(msg.note)

    # Build steps
    sorted_onsets = sorted(onset_groups.keys())
    tpb = mid.ticks_per_beat
    beat_dur = 60.0 / args.tempo
    steps = []
    dropped = 0

    for idx, onset in enumerate(sorted_onsets):
        d_ticks = sorted_onsets[idx + 1] - onset if idx < len(sorted_onsets) - 1 else tpb
        d_seconds = round((d_ticks / tpb) * beat_dur, 3)

        pitches = onset_groups[onset]
        transposed = [n + args.transpose for n in pitches]
        mapped = [midi_to_string(m, fold=args.fold, drop=args.drop_unplayable) for m in transposed]
        dropped += sum(1 for s in mapped if s is None)
        strings = list(dict.fromkeys(s for s in mapped if s is not None))

        step: dict = {"d": d_seconds}
        if len(strings) == 1:
            step["string"] = strings[0]
        elif len(strings) > 1:
            step["strings"] = strings
        steps.append(step)

    piece = {
        "title": args.title,
        "tuning": "silaba",
        "tags": ["cover"],
        "arrangements": [{"name": "Full", "steps": steps}],
    }
    output = yaml.dump(piece, default_flow_style=None, sort_keys=False, allow_unicode=True)

    if dropped:
        import sys
        print(f"Dropped {dropped} unplayable note(s)", file=sys.stderr)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
