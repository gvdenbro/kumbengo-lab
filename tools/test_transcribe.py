import pytest
from transcribe import title_from_stem, VIDEO_EXTENSIONS, snap_midi_to_kora


class TestTitleFromStem:
    def test_dashes_to_spaces(self):
        assert title_from_stem("lesson-recording") == "Lesson Recording"

    def test_underscores_to_spaces(self):
        assert title_from_stem("my_piece_name") == "My Piece Name"

    def test_mixed(self):
        assert title_from_stem("jarabi-intro_v2") == "Jarabi Intro V2"

    def test_single_word(self):
        assert title_from_stem("jarabi") == "Jarabi"


class TestVideoExtensions:
    def test_mp4_is_video(self):
        assert ".mp4" in VIDEO_EXTENSIONS

    def test_wav_is_not_video(self):
        assert ".wav" not in VIDEO_EXTENSIONS

    def test_mov_is_video(self):
        assert ".mov" in VIDEO_EXTENSIONS


class TestSnapMidiToKora:
    def test_exact_match(self):
        assert snap_midi_to_kora(60) == "R3"  # C4

    def test_one_semitone_above(self):
        assert snap_midi_to_kora(61) == "R3"  # C#4 snaps to C4

    def test_one_semitone_below(self):
        assert snap_midi_to_kora(59) == "L6"  # B3 snaps to Bb3 (58)

    def test_too_far(self):
        assert snap_midi_to_kora(30) is None  # way below kora range

    def test_highest_kora_note(self):
        assert snap_midi_to_kora(81) == "R10"  # A5
