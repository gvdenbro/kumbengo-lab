import pytest
from transcribe import title_from_stem, VIDEO_EXTENSIONS, snap_midi_to_kora, quantize, build_steps


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


class TestQuantize:
    def test_exact_beat(self):
        assert quantize(1.0, 120, 0.5) == 2.0

    def test_snaps_to_half_beat(self):
        assert quantize(0.3, 120, 0.5) == 0.5

    def test_snaps_to_whole_beat(self):
        assert quantize(0.48, 120, 0.5) == 1.0

    def test_zero(self):
        assert quantize(0.0, 90, 0.5) == 0.0


class TestBuildSteps:
    def test_basic(self):
        events = [
            (0.0, 0.5, 60, 0.8),   # C4 = R3
            (0.25, 1.0, 57, 0.7),  # A3 = R2 at 0.25s → beat 0.5
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert steps == [
            {"d": 0.5, "string": "R3"},
            {"d": 1, "string": "R2"},
        ]

    def test_filters_low_velocity(self):
        events = [
            (0.0, 0.5, 60, 0.1),   # below threshold
            (0.5, 1.0, 57, 0.7),
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert len(steps) == 1
        assert steps[0]["string"] == "R2"

    def test_simultaneous_notes(self):
        events = [
            (0.0, 0.5, 60, 0.8),   # R3
            (0.0, 0.5, 41, 0.8),   # L1
        ]
        steps = build_steps(events, tempo=120, resolution=0.5, min_velocity=0.3)
        assert len(steps) == 1
        assert set(steps[0]["strings"]) == {"R3", "L1"}
