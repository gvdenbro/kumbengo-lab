import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import midi2kora as m
from midi2kora import midi_to_string


def test_midi_to_string_exact_matches():
    assert midi_to_string(41) == "L1"   # F2
    assert midi_to_string(48) == "L2"   # C3
    assert midi_to_string(60) == "R3"   # C4
    assert midi_to_string(65) == "L8"   # F4
    assert midi_to_string(81) == "R10"  # A5


def test_midi_to_string_out_of_range():
    """Out-of-range notes return None by default, or fold if requested."""
    assert midi_to_string(40) is None
    assert midi_to_string(82) is None
    assert midi_to_string(40, fold=True) == "L4"   # 40+12=52=L4
    assert midi_to_string(82, fold=True) == "R6"   # 82-12=70=R6


def test_midi_to_string_not_in_tuning():
    import pytest
    with pytest.raises(ValueError):
        midi_to_string(42)  # F#2 not in Silaba
    with pytest.raises(ValueError):
        midi_to_string(42, fold=True)


def test_midi_to_string_drop_off_scale():
    """With drop=True, off-scale notes return None instead of raising."""
    assert midi_to_string(42, drop=True) is None  # F#2 not in Silaba scale


def test_midi_to_string_drop_gap_note():
    """With drop=True, in-range notes with no string (gap) return None."""
    # midi 43 (G2) is within range 41-81 but has no Silaba string
    # (the kora jumps from F2=41 to C3=48 in the low register)
    assert midi_to_string(43, drop=True) is None
    # fold + drop together: G2 stays 43 (already in range), no string -> None
    assert midi_to_string(43, fold=True, drop=True) is None


def test_midi_to_string_drop_preserves_valid():
    """drop=True still returns the string for playable notes."""
    assert midi_to_string(41, drop=True) == "L1"
    assert midi_to_string(81, drop=True) == "R10"


def test_parse_string():
    assert m.parse_string("L11") == ("L", 11)
    assert m.parse_string("R1") == ("R", 1)


def test_single_note_is_playable():
    assert m.is_playable(["L9"]) is True


def test_two_notes_split_across_hands_is_playable():
    assert m.is_playable(["L3", "R7"]) is True


def test_two_left_notes_thumb_and_index_is_playable():
    # L6 (pos 6, thumb) + L9 (pos 9, index)
    assert m.is_playable(["L6", "L9"]) is True


def test_three_left_notes_not_playable():
    assert m.is_playable(["L6", "L7", "L9"]) is False


def test_two_high_left_notes_not_playable():
    # both above thumb_max=6 -> only the index can reach, one digit
    assert m.is_playable(["L8", "L9"]) is False


def test_two_low_left_notes_not_playable():
    # both below index_min=5 -> only the thumb can reach, one digit
    assert m.is_playable(["L2", "L3"]) is False


def test_reduce_passthrough_single():
    assert m.reduce_to_playable(["L9"]) == ["L9"]


def test_reduce_passthrough_playable_pair():
    assert m.reduce_to_playable(["L3", "R7"]) == ["L3", "R7"]


def test_reduce_impossible_left_triad_keeps_outer_pair():
    # L6=Bb3(bass), L7=D4(mid), L9=A4(melody) -> drop the middle
    result = m.reduce_to_playable(["L9", "L7", "L6"])
    assert result == ["L9", "L6"]
    assert m.is_playable(result)


def test_reduce_four_note_chord_keeps_reachable_inner():
    # R6=Bb4(melody), L8=F4, L7=D4, L6=Bb3(bass)
    result = m.reduce_to_playable(["R6", "L8", "L7", "L6"])
    assert result == ["R6", "L7", "L6"]
    assert m.is_playable(result)


def test_reduce_result_preserves_input_order():
    result = m.reduce_to_playable(["R7", "L6", "L9"])
    assert result == [s for s in ["R7", "L6", "L9"] if s in result]
    assert m.is_playable(result)


def test_every_reduced_chord_is_playable_across_range():
    # Exhaustive-ish: a spread of chords must always come out playable.
    chords = [
        ["L9", "L7", "L6"],
        ["R6", "L8", "L7", "L6"],
        ["L1", "L2", "L3", "L4"],
        ["R8", "R9", "R10"],
        ["L11", "R10", "L1", "R1"],
    ]
    for chord in chords:
        reduced = m.reduce_to_playable(chord)
        assert m.is_playable(reduced), f"{chord} -> {reduced} not playable"
        assert len(reduced) <= 4


def test_overlap_zone_pair_is_playable():
    # L5/L6 are the overlap zone (index_min=5, thumb_max=6): L5->thumb, L6->index.
    assert m.is_playable(["L5", "L6"]) is True
    # extremes across the row still split across the two digits
    assert m.is_playable(["L1", "L6"]) is True
    assert m.is_playable(["L5", "L11"]) is True


def test_reduce_empty_returns_empty():
    assert m.reduce_to_playable([]) == []


def test_count_dropped_on_scale_zero():
    assert m.count_dropped([65], 0, fold=False) == 0        # F4 is on-scale


def test_count_dropped_off_scale_one():
    assert m.count_dropped([61], 0, fold=False) == 1        # C#4 off-scale


def test_count_dropped_off_scale_recovered_by_shift():
    assert m.count_dropped([61], 1, fold=False) == 0        # +1 -> D4


def test_best_transpose_recovers_off_scale():
    t, dropped = m.best_transpose([61, 61, 61], fold=False)
    assert dropped == 0
    assert t == -1                                          # tie |1|==|-1|, -1 sorts first


def test_best_transpose_zero_when_already_optimal():
    assert m.best_transpose([65], fold=False) == (0, 0)


def test_tokenize_single_note_start():
    assert m.tokenize_steps([{"d": 0.35, "string": "L5"}]) == ["S1"]


def test_tokenize_intervals_up_down_same():
    # L5 (F3=53), R3 (C4=60) up, L4 (E3=52) down, L4 again same
    steps = [
        {"d": 0.35, "string": "L5"},
        {"d": 0.35, "string": "R3"},
        {"d": 0.35, "string": "L4"},
        {"d": 0.35, "string": "L4"},
    ]
    assert m.tokenize_steps(steps) == ["S1", "U1", "D1", "=1"]


def test_tokenize_duration_quantization():
    # <=0.45 -> '1'; 0.45<d<0.70 -> '2'; >=0.70 -> '3'
    steps = [
        {"d": 0.35, "string": "L1"},
        {"d": 0.50, "string": "L1"},
        {"d": 0.90, "string": "L1"},
        {"d": 0.45, "string": "L1"},
        {"d": 0.70, "string": "L1"},
    ]
    assert m.tokenize_steps(steps) == ["S1", "=2", "=3", "=1", "=3"]


def test_tokenize_rest_and_leading_rest():
    # rests carry 'R'+dur; a leading rest keeps prev=None so the first
    # sounding note still gets 'S'
    steps = [
        {"d": 0.30},
        {"d": 0.50, "string": "L1"},
        {"d": 0.35},
        {"d": 1.00, "string": "L1"},
    ]
    assert m.tokenize_steps(steps) == ["R1", "S2", "R1", "=3"]


def test_find_repeated_blocks_basic():
    # 'U1' repeated twice at positions 2 and 4
    tokens = ["S1", "D1", "U1", "D1", "U1", "D1"]
    hits = m.find_repeated_blocks(tokens, min_len=2, max_len=6, min_occ=2)
    assert ("U1", "D1") in hits
    assert hits[("U1", "D1")] == [2, 4]


def test_find_repeated_blocks_greedy_nonoverlap():
    # pattern 'S1 U1' at 0,2,4 -- greedy keeps all three (non-overlapping: [0,1],[2,3],[4,5])
    tokens = ["S1", "U1", "S1", "U1", "S1", "U1"]
    hits = m.find_repeated_blocks(tokens, min_len=2, max_len=6, min_occ=2)
    assert tuple(tokens[0:2]) in hits
    # non-overlapping starts: 0 (covers 0..1), 2 (covers 2..3), 4 (covers 4..5)
    assert hits[tuple(tokens[0:2])] == [0, 2, 4]


def test_find_repeated_blocks_no_repeat():
    tokens = ["S1", "U1", "D2", "U1", "D3"]
    hits = m.find_repeated_blocks(tokens, min_len=3, max_len=6, min_occ=2)
    assert hits == {}


def test_significant_repeats_drops_short_prefix():
    # 'U1 D1' is a prefix of the longer 'U1 D1 U1' at the same starts -> dropped
    hits = {
        ("U1", "D1"): [2, 8],
        ("U1", "D1", "U1"): [2, 8],
    }
    sig = m.significant_repeats(hits, max_occ=12)
    assert ("U1", "D1") not in sig
    assert ("U1", "D1", "U1") in sig


def test_significant_repeats_drops_too_frequent():
    hits = {("U1", "D1"): list(range(20))}
    sig = m.significant_repeats(hits, max_occ=12)
    assert sig == {}


def test_merge_near_repeats_merges_similar():
    # 'U1 D1 U1' vs 'U1 D1 U2' differ by one substitution -> merged
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("U1", "D1", "U2"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 1
    assert groups[0]["positions"] == [0, 9]


def test_merge_near_repeats_keeps_distinct():
    # 'U1 D1 U1' vs 'D1 U1 D1' differ by > 1 edit -> separate
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("D1", "U1", "D1"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 2


def test_pick_dominant_longest_first():
    # two groups: len 3 occ 5 vs len 5 occ 3 — both fit; the longer wins
    steps = [{"d": 0.5, "string": "L1"}] * 40
    groups = [
        {"pattern": ("U1", "D1", "U1"), "positions": [0, 4, 8, 12, 16]},
        {"pattern": ("U1", "D1", "U1", "D1", "U1"), "positions": [2, 10, 20]},
    ]
    dom = m.pick_dominant(groups, steps, phrase_min_len=3)
    assert dom["pattern"] == ("U1", "D1", "U1", "D1", "U1")


def test_pick_dominant_skips_short_and_oversized():
    # phrase_min_len=8: all blocks too short -> None (fallback path)
    steps = [{"d": 0.5, "string": "L1"}] * 40
    groups = [{"pattern": ("U1", "D1", "U1"), "positions": [0, 9]},]
    assert m.pick_dominant(groups, steps, phrase_min_len=8) is None
    # len 8 passes phrase_min_len but 8 steps * 0.5s = 4.0s > max_dur=1.0 -> None
    groups = [{"pattern": ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1"), "positions": [0, 9]},]
    assert m.pick_dominant(groups, steps, max_dur=1.0) is None


def test_occurrence_spans_nonoverlapping():
    steps = [{"d": 0.5, "string": "L1"}] * 60
    groups = [{"pattern": ("U1", "D1", "U1", "U1", "D1", "U1", "D1", "U1"), "positions": [5, 8, 20, 40]}]
    spans = m.occurrence_spans(groups, steps)
    # positions 5 -> (5,12); 8 overlaps (5..12) and is skipped; 20 and 40 kept
    assert spans == [(5, 12), (20, 27), (40, 47)]


# Patterns must be >= phrase_min_len=8 tokens to qualify as a dominant phrase
# (see pick_dominant); shorter patterns never enter the repeat-chunk path.
PAT8 = ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1")


def test_partition_tiles_whole_piece():
    # dominant phrase repeated across the piece -> repeat chunks + gap fallback,
    # everything tiles exactly, and a repeat chunk is labeled True.
    # Verified: spans (5,12),(20,27); gap (13,19) of 7s < min_dur merges into
    # the first repeat -> (5,19); the 12s gap (28,39) does not merge.
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": PAT8, "positions": [5, 20]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    prev_end = -1
    for (s, e), _ in out:
        assert s == prev_end + 1
        prev_end = e
    assert prev_end == len(steps) - 1
    assert out[0][0][0] == 0
    assert out[-1][0][1] == len(steps) - 1
    assert out == [((0, 4), False), ((5, 19), True), ((20, 27), True), ((28, 39), False)]


def test_partition_fallback_subdivides_long_leftover():
    # 50s of continuous notes with no repeats: must split at largest gaps, all <= max_dur
    steps = [{"d": 10.0, "string": "L1"}] * 5  # 50s, gaps all equal
    out = m.partition_chunks(steps, [], max_dur=20.0, min_dur=8.0)
    for (s, e), is_rep in out:
        assert is_rep is False
        dur = sum(st["d"] for st in steps[s : e + 1])
        assert dur <= 20.0
    # largest-gap-first cascade: 10, 10, 10, 20 seconds
    assert [e - s + 1 for (s, e), _ in out] == [1, 1, 1, 2]


def test_partition_repeat_chunk_stays_whole():
    # a detected repeat span is kept as a single True chunk, and does not get
    # merged into the (>= min_dur) gap that follows it
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": PAT8, "positions": [0, 20]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    assert out[0] == ((0, 7), True)  # first occurrence whole
    assert out[2] == ((20, 27), True)  # second occurrence whole


def test_partition_merges_tiny_gap_forward():
    # two repeat spans one step apart: the 1s gap (13,13) is smaller than
    # min_dur=8 and the merge stays <= max_dur, so it is absorbed into the
    # first repeat chunk
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": PAT8, "positions": [5, 14]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    assert out == [((0, 4), False), ((5, 13), True), ((14, 21), True), ((22, 39), False)]
