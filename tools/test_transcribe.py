import pytest
from transcribe import title_from_stem, VIDEO_EXTENSIONS


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
