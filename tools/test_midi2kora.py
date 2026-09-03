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
