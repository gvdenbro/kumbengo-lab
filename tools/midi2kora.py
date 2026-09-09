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


# NOTE: reduce_to_playable orders notes by pitch while is_playable reasons about
# string position. This relies on SILABA_MIDI_TO_STRING being monotonic in position
# on each side (higher position number = higher pitch). Preserve that invariant if
# the tuning ever changes.
STRING_TO_MIDI: dict[str, int] = {v: k for k, v in SILABA_MIDI_TO_STRING.items()}


def reduce_to_playable(strings: list[str]) -> list[str]:
    """Return the playable subset of a chord, keeping outer notes first.

    Notes are considered in order of 'outerness' (distance from the chord's
    pitch center, so melody and bass come first); each is kept only if the
    running set stays playable. Inner notes fill in where a digit is free.
    Result preserves the original input order.
    """
    if len(strings) <= 1:
        return list(strings)
    pitches = {s: STRING_TO_MIDI[s] for s in strings}
    center = (min(pitches.values()) + max(pitches.values())) / 2
    ordered = sorted(strings, key=lambda s: (-abs(pitches[s] - center), pitches[s]))
    kept: list[str] = []
    for s in ordered:
        if is_playable(kept + [s]):
            kept.append(s)
    return [s for s in strings if s in kept]


# Duration quantization for tokens: d <= DUR_SHORT -> '1', d < DUR_MED -> '2',
# else '3'. Coarse enough to absorb timing drift between repeats.
DUR_SHORT = 0.45
DUR_MED = 0.70


def _quantize_duration(d: float) -> str:
    if d <= DUR_SHORT:
        return "1"
    if d < DUR_MED:
        return "2"
    return "3"


def tokenize_steps(steps: list[dict]) -> list[str]:
    """Map steps to transposition-invariant 2-char tokens.

    Token = interval char + quantized-duration char. The interval is relative
    to the previous sounding step's lowest pitch ('U' up / 'D' down / '=' same);
    the first sounding step uses 'S'. Rests use 'R' + duration char. Comparing
    shape/interval rather than absolute pitch makes repeats detected later
    transposition-invariant.
    """
    tokens: list[str] = []
    prev: int | None = None
    for step in steps:
        d = step.get("d", 0.0)
        dur = _quantize_duration(d)
        strings = step.get("strings") or ([step["string"]] if "string" in step else [])
        if not strings:
            tokens.append("R" + dur)
            continue
        p = min(STRING_TO_MIDI[s] for s in strings)
        if prev is None:
            iv = "S"
        elif p > prev:
            iv = "U"
        elif p < prev:
            iv = "D"
        else:
            iv = "="
        prev = p
        tokens.append(iv + dur)
    return tokens


def count_dropped(pitches: list[int], transpose: int, *, fold: bool) -> int:
    """Number of pitches that map to no Silaba string at this transpose."""
    return sum(
        1 for n in pitches
        if midi_to_string(n + transpose, fold=fold, drop=True) is None
    )


def best_transpose(
    pitches: list[int], *, fold: bool, search_range: range = range(-12, 13)
) -> tuple[int, int]:
    """Return (transpose, dropped_count) minimizing dropped notes.

    Ties break toward the smallest absolute transpose (closest to the
    original key).
    """
    best_t, best_dropped = 0, None
    for t in sorted(search_range, key=lambda x: (abs(x), x)):
        dropped = count_dropped(pitches, t, fold=fold)
        if best_dropped is None or dropped < best_dropped:
            best_t, best_dropped = t, dropped
    return best_t, best_dropped


def main():
    parser = argparse.ArgumentParser(description="Convert MIDI to kora piece YAML")
    parser.add_argument("input", help="Input .mid file")
    parser.add_argument("--transpose", default="0",
                        help="Semitones to transpose, or 'auto' to minimize dropped notes")
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

    # Resolve transpose: fixed integer, or 'auto' to minimize dropped notes
    if args.transpose == "auto":
        all_pitches = [n for group in onset_groups.values() for n in group]
        transpose, auto_dropped = best_transpose(all_pitches, fold=args.fold)
        import sys
        print(f"Auto-transpose: {transpose:+d} (drops {auto_dropped} note(s))", file=sys.stderr)
    else:
        transpose = int(args.transpose)

    # Build steps
    sorted_onsets = sorted(onset_groups.keys())
    tpb = mid.ticks_per_beat
    beat_dur = 60.0 / args.tempo
    steps = []
    dropped = 0
    reduced = 0

    for idx, onset in enumerate(sorted_onsets):
        d_ticks = sorted_onsets[idx + 1] - onset if idx < len(sorted_onsets) - 1 else tpb
        d_seconds = round((d_ticks / tpb) * beat_dur, 3)

        pitches = onset_groups[onset]
        transposed = [n + transpose for n in pitches]
        mapped = [midi_to_string(m, fold=args.fold, drop=args.drop_unplayable) for m in transposed]
        dropped += sum(1 for s in mapped if s is None)
        strings = list(dict.fromkeys(s for s in mapped if s is not None))
        playable = reduce_to_playable(strings)
        reduced += len(strings) - len(playable)
        strings = playable

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

    if reduced:
        import sys
        print(f"Reduced {reduced} note(s) for playability", file=sys.stderr)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
