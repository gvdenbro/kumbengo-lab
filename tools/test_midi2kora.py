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
