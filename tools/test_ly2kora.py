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

from ly2kora import parse_voice

def test_parse_voice_simple_notes():
    """Parse a relative voice with quarter and eighth notes."""
    ly_text = r"\relative a'' { a2. a8 b16 c16 }"
    events = parse_voice(ly_text, start_pitch_name="a", start_octave=5)
    # a'' in lilypond = A5 = midi 81 (but \relative a'' means next a is A5)
    # a2. = dotted half = 3 beats at onset 0
    # a8 = eighth = 0.5 beats at onset 3
    # b16 = sixteenth = 0.25 beats at onset 3.5
    # c16 = sixteenth = 0.25 beats at onset 3.75
    assert len(events) == 4
    assert events[0] == (0.0, [81], 3.0)    # A5 dotted half
    assert events[1] == (3.0, [81], 0.5)    # A5 eighth
    assert events[2] == (3.5, [83], 0.25)   # B5 sixteenth
    assert events[3] == (3.75, [84], 0.25)  # C6 sixteenth

def test_parse_voice_chord():
    """Parse chords into multiple simultaneous pitches."""
    ly_text = r"\relative e' { <e a>8 b'8 }"
    events = parse_voice(ly_text, start_pitch_name="e", start_octave=4)
    # <e a> = E4 + A4, eighth note
    # b' = B5 relative to a (goes up), eighth note
    assert events[0] == (0.0, [64, 69], 0.5)  # E4 + A4
    assert events[1] == (0.5, [83], 0.5)       # B5

def test_parse_voice_tie():
    """Tied notes extend duration, no new event."""
    ly_text = r"\relative c'' { c4 ~ c4 d4 }"
    events = parse_voice(ly_text, start_pitch_name="c", start_octave=5)
    # c4 ~ c4 = one event of duration 2 beats
    # d4 at onset 2
    assert len(events) == 2
    assert events[0] == (0.0, [72], 2.0)  # C5, tied = 2 beats
    assert events[1] == (2.0, [74], 1.0)  # D5
