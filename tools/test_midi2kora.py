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
