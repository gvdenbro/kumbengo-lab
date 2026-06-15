from ly2kora import midi_to_string

def test_midi_to_string_exact_matches():
    assert midi_to_string(41) == "L1"   # F2
    assert midi_to_string(48) == "L2"   # C3
    assert midi_to_string(60) == "R3"   # C4
    assert midi_to_string(65) == "L8"   # F4
    assert midi_to_string(81) == "R10"  # A5

def test_midi_to_string_out_of_range():
    import pytest
    with pytest.raises(ValueError):
        midi_to_string(40)
    with pytest.raises(ValueError):
        midi_to_string(82)

def test_midi_to_string_not_in_tuning():
    import pytest
    with pytest.raises(ValueError):
        midi_to_string(42)  # F#2 not in Silaba
