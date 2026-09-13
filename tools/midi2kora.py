# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "mido",
#     "pyyaml",
#     "rapidfuzz",
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
from rapidfuzz.distance import Levenshtein

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


def find_repeated_blocks(
    tokens: list[str], *, min_len: int = 3, max_len: int = 48, min_occ: int = 2
) -> dict[tuple[str, ...], list[int]]:
    """Return every exact repeated substring of the token sequence.

    For each window length in [min_len, max_len] count occurrences, then keep
    patterns seen >= min_occ times. Occurrences per pattern are greedily
    non-overlapping (a later start must be >= previous start + length) so a
    repeated block's occurrences tile like real musical phrases. Bounded window
    length keeps this O(n*max_len) — microseconds at mad-world's n=447.
    """
    n = len(tokens)
    hits: dict[tuple[str, ...], list[int]] = {}
    for L in range(min_len, min(max_len, n) + 1):
        windows: dict[tuple[str, ...], list[int]] = {}
        for i in range(n - L + 1):
            w = tuple(tokens[i : i + L])
            windows.setdefault(w, []).append(i)
        for w, pos in windows.items():
            if len(pos) < min_occ:
                continue
            npos: list[int] = []
            for p in pos:
                if not npos or p >= npos[-1] + L:
                    npos.append(p)
            if len(npos) >= min_occ:
                hits[w] = npos
    return hits


def significant_repeats(
    hits: dict[tuple[str, ...], list[int]], *, max_occ: int = 12
) -> dict[tuple[str, ...], list[int]]:
    """Filter repeated blocks down to structurally meaningful ones.

    Drop a block when (a) it occurs too often (trivial micro-motif returning
    everywhere), or (b) it is a prefix of a longer repeated block that is its
    strict extension at the same occurrence starts (redundant — the longer one
    carries the same structural information).
    """
    kept = dict(hits)
    for pat in list(kept):
        if len(kept[pat]) > max_occ:
            del kept[pat]
            continue
        for other in list(kept):
            if other is pat or len(other) <= len(pat):
                continue
            if other[: len(pat)] == pat and set(kept[other]) >= set(kept[pat]):
                del kept[pat]
                break
    return kept


def merge_near_repeats(
    blocks: dict[tuple[str, ...], list[int]], *, max_edits: int = 1
) -> list[dict]:
    """Merge repeated blocks whose token strings are within max_edits edits.

    Real repeats carry ornaments and small drift, so two occurrences should
    still count as one phrase when their token strings are nearly identical.
    Uses rapidfuzz's C Levenshtein (maintained; the Mongeau--Sankoff trick).
    Returns a list of groups (pattern token-tuple + union of occurrence starts).
    """
    groups: list[dict] = []
    for pat, pos in sorted(blocks.items(), key=lambda kv: (len(kv[0]), kv[1])):
        s = "".join(pat)
        placed = False
        for g in groups:
            if Levenshtein.distance(s, "".join(g["pattern"])) <= max_edits:
                g["positions"] = sorted(set(g["positions"]) | set(pos))
                placed = True
                break
        if not placed:
            groups.append({"pattern": pat, "positions": list(pos)})
    return groups


def _span_duration(steps: list[dict], start: int, length: int) -> float:
    """Total duration of steps[start:start+length]."""
    return sum(st.get("d", 0.0) for st in steps[start : start + length])


def pick_dominant(
    groups: list[dict],
    steps: list[dict],
    *,
    max_dur: float = 20.0,
    phrase_min_len: int = 8,
) -> dict | None:
    """Pick the single repeated block that best defines the piece's phrases.

    A candidate must be at least `phrase_min_len` tokens long (a phrase, not a
    micro-motif) and have at least one occurrence whose span duration fits
    within `max_dur` (so each occurrence is itself a learnable chunk). Among
    candidates, the strongest wins: highest `len * occurrence_count`, ties to
    the longer pattern. Returns the group dict, or None when nothing qualifies
    (caller falls back to rest-based splitting).
    """
    best = None
    for g in groups:
        L = len(g["pattern"])
        if L < phrase_min_len:
            continue
        if not any(
            p + L <= len(steps) and _span_duration(steps, p, L) <= max_dur
            for p in g["positions"]
        ):
            continue
        score = (L * len(g["positions"]), L)
        if best is None or score > best[0]:
            best = (score, g)
    return best[1] if best else None


def occurrence_spans(
    groups: list[dict], steps: list[dict], *, max_dur: float = 20.0
) -> list[tuple[int, int]]:
    """Return non-overlapping occurrence spans of the dominant phrase.

    Spans are (start, end) inclusive step indices, greedy non-overlapping so
    each phrase occurrence becomes exactly one chunk. Occurrences are sorted;
    a later occurrence that overlaps the previous span is skipped (shifted
    variant of the same phrase).
    """
    dom = pick_dominant(groups, steps, max_dur=max_dur)
    if dom is None:
        return []
    L = len(dom["pattern"])
    spans: list[tuple[int, int]] = []
    for p in sorted(dom["positions"]):
        if p + L > len(steps):
            break
        if spans and p <= spans[-1][1]:
            continue
        spans.append((p, p + L - 1))
    return spans


def _interval_duration(steps: list[dict], s: int, e: int) -> float:
    """Total duration of steps[s:e] (half-open)."""
    return sum(st.get("d", 0.0) for st in steps[s:e])


def _split_range(steps: list[dict], s: int, e: int, max_dur: float) -> list[tuple[int, int]]:
    """Split inclusive range [s,e] at the largest internal rests until every
    piece is <= max_dur. Returns inclusive (start, end) pairs."""
    if s > e:
        return []
    if _interval_duration(steps, s, e + 1) <= max_dur:
        return [(s, e)]
    segs = [(s, e)]
    while True:
        done = True
        for i, (a, b) in enumerate(segs):
            if _interval_duration(steps, a, b + 1) <= max_dur:
                continue
            done = False
            best = max(range(a, b), key=lambda k: steps[k].get("d", 0.0))
            segs[i : i + 1] = [(a, best), (best + 1, b)]
            break
        if done:
            break
    return segs


def partition_chunks(
    steps: list[dict],
    groups: list[dict],
    *,
    max_dur: float = 20.0,
    min_dur: float = 8.0,
) -> list[tuple[tuple[int, int], bool]]:
    """Partition steps into contiguous, exactly-tiling chunks.

    Chunks are the occurrence spans of the dominant repeated phrase (each
    occurrence one chunk, labeled is_repeat=True, kept whole — the point of
    practice) interleaved with the leftover gaps. Gaps longer than max_dur are
    subdivided by `_split_range` at the largest internal rests; gaps shorter
    than min_dur are merged forward into the previous chunk while the merged
    duration stays <= max_dur. With no qualifying phrase, the whole piece is
    simply split by `_split_range`. The result always exactly tiles and covers
    every step.
    """
    n = len(steps)
    spans = [(s, e) for s, e in occurrence_spans(groups, steps, max_dur=max_dur)]
    if not spans:
        return [((a, b), False) for a, b in _split_range(steps, 0, n - 1, max_dur)]

    out: list[tuple[tuple[int, int], bool]] = []
    prev = 0
    for s, e in spans:
        if s > prev:
            out.append(((prev, s - 1), False))
        out.append(((s, e), True))
        prev = e + 1
    if prev < n:
        out.append(((prev, n - 1), False))

    final: list[tuple[tuple[int, int], bool]] = []
    for (s, e), is_repeat in out:
        if is_repeat or _interval_duration(steps, s, e + 1) <= max_dur:
            final.append(((s, e), is_repeat))
        else:
            for a, b in _split_range(steps, s, e, max_dur):
                final.append(((a, b), False))

    merged: list[tuple[tuple[int, int], bool]] = []
    for (s, e), is_repeat in final:
        if (
            merged
            and _interval_duration(steps, merged[-1][0][0], e + 1) <= max_dur
            and _interval_duration(steps, s, e + 1) < min_dur
        ):
            ms, me = merged[-1][0]
            merged[-1] = ((ms, e), merged[-1][1])
        else:
            merged.append(((s, e), is_repeat))
    return merged


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
    parser.add_argument("--no-chunks", action="store_true", help="Disable automatic chunking (emit no `chunks` field)")
    parser.add_argument("--max-chunk-size", type=float, default=20.0,
                        help="Upper bound on fallback chunk duration in seconds (default 20)")
    parser.add_argument("--min-chunk-size", type=float, default=8.0,
                        help="Lower bound hint for fallback chunk duration in seconds (default 8)")
    parser.add_argument("--min-repeat-len", type=int, default=3,
                        help="Minimum repeated-block length in steps counting as evidence (default 3)")
    parser.add_argument("--min-repeat-occ", type=int, default=2,
                        help="Minimum occurrences for a repeated block to count (default 2)")
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

    # --- Chunking ---
    if args.no_chunks:
        chunk_list: list[dict] = []
    else:
        tokens = tokenize_steps(steps)
        hits = find_repeated_blocks(tokens, min_len=args.min_repeat_len, min_occ=args.min_repeat_occ)
        sig = significant_repeats(hits)
        groups = merge_near_repeats(sig)
        chunked = partition_chunks(steps, groups, max_dur=args.max_chunk_size, min_dur=args.min_chunk_size)

        # Hard invariant: exact tiling, in-range windows (a tokenization guarantee)
        prev_end = -1
        for (s, e), _ in chunked:
            assert 0 <= s <= e < len(steps)
            assert s == prev_end + 1
            prev_end = e
        assert prev_end == len(steps) - 1

        chunk_list = [
            {"name": f"Chunk {i + 1}", "start": s, "end": e}
            for i, ((s, e), _) in enumerate(chunked)
        ]
        n_repeat = sum(1 for _, is_rep in chunked if is_rep)
        n_fallback = len(chunked) - n_repeat
        import sys
        print(f"Chunked into {len(chunked)} parts ({n_repeat} repeat-derived chunks, {n_fallback} fallback chunks)", file=sys.stderr)

    piece = {
        "title": args.title,
        "tuning": "silaba",
        "tags": ["cover"],
        "arrangements": [{"name": "Full", "steps": steps}],
    }
    if chunk_list:
        piece["chunks"] = chunk_list
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
