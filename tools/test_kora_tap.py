# /// script
# requires-python = ">=3.12"
# dependencies = ["pytest", "pyyaml"]
# ///
"""Tests for kora-tap pure functions."""

import subprocess
import sys
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

# Load kora-tap.py as a module
_spec = spec_from_file_location("kora_tap", Path(__file__).parent / "kora-tap.py",
                                 submodule_search_locations=[])
tap = module_from_spec(_spec)
_spec.loader.exec_module(tap)


class TestDetectTempo:
    def test_steady_90bpm(self):
        # 90 BPM = 0.667s intervals
        taps = [0.0, 0.667, 1.333, 2.0]
        assert abs(tap.detect_tempo(taps) - 90) < 1

    def test_steady_120bpm(self):
        # 120 BPM = 0.5s intervals
        taps = [0.0, 0.5, 1.0, 1.5, 2.0]
        assert abs(tap.detect_tempo(taps) - 120) < 1

    def test_one_outlier_uses_median(self):
        # 120 BPM with one bad tap
        taps = [0.0, 0.5, 1.0, 1.8, 2.3]  # 1.0→1.8 is outlier
        bpm = tap.detect_tempo(taps)
        assert abs(bpm - 120) < 5  # median still close to 0.5s


class TestChooseResolution:
    def test_half_beat_taps(self):
        # Taps on exact half beats at 120 BPM (0.5s per beat)
        taps = [0.0, 0.25, 0.5, 0.75, 1.0]  # every half beat
        assert tap.choose_resolution(taps, 120) == 0.5

    def test_quarter_beat_taps(self):
        # Taps on quarter beats at 120 BPM
        beat_dur = 0.5  # 120 BPM
        taps = [i * beat_dur * 0.25 for i in range(9)]  # 0, 0.125, 0.25, ...
        assert tap.choose_resolution(taps, 120) == 0.25


class TestQuantizeTaps:
    def test_snaps_to_half_beats(self):
        # 120 BPM, 0.5s per beat, taps slightly off grid
        taps = [0.0, 0.26, 0.48, 0.77]
        beats = tap.quantize_taps(taps, 120, 0.5)
        assert beats == [0.0, 0.5, 1.0, 1.5]

    def test_deduplicates(self):
        # Two taps that snap to the same beat
        taps = [0.0, 0.05, 0.5]
        beats = tap.quantize_taps(taps, 120, 0.5)
        assert beats == [0.0, 1.0]

    def test_quarter_beat_grid(self):
        taps = [0.0, 0.125, 0.25, 0.375, 0.5]
        beats = tap.quantize_taps(taps, 120, 0.25)
        assert beats == [0.0, 0.25, 0.5, 0.75, 1.0]

    def test_sorted_output(self):
        taps = [0.0, 0.5, 0.25]
        beats = tap.quantize_taps(taps, 120, 0.5)
        assert beats == sorted(beats)


class TestQuantizationError:
    def test_perfect_grid_zero_error(self):
        taps = [0.0, 0.5, 1.0, 1.5]  # exact half beats at 120 BPM
        err = tap.quantization_error(taps, 120, 0.5)
        assert err < 0.01

    def test_off_grid_has_error(self):
        taps = [0.0, 0.3, 0.7, 1.1]  # not on grid
        err = tap.quantization_error(taps, 120, 0.5)
        assert err > 0.1
