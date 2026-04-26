# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml"]
# ///
"""kora-tap: Record rhythm by tapping spacebar, add arrangement to a piece YAML file."""

import sys
import os
import time
import tty
import termios
import statistics
from pathlib import Path

import yaml


def read_key(fd: int) -> str:
    """Read a single keypress from raw terminal."""
    ch = os.read(fd, 1)
    return ch.decode("utf-8", errors="ignore")


def record_taps() -> list[float]:
    """Record spacebar taps, return list of timestamps. Enter ends recording."""
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    taps: list[float] = []
    try:
        tty.setraw(fd)
        while True:
            ch = read_key(fd)
            if ch in ("\r", "\n"):
                break
            if ch == " ":
                taps.append(time.monotonic())
                sys.stdout.write("  · ")
                sys.stdout.flush()
            elif ch == "\x03":  # Ctrl-C
                raise KeyboardInterrupt
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
    print()
    return taps


def detect_tempo(taps: list[float]) -> float:
    """Derive BPM from median interval between taps."""
    intervals = [taps[i + 1] - taps[i] for i in range(len(taps) - 1)]
    median = statistics.median(intervals)
    return 60.0 / median


def quantization_error(taps: list[float], bpm: float, resolution: float) -> float:
    """Total quantization error for a given resolution."""
    beat_dur = 60.0 / bpm
    total = 0.0
    for t in taps:
        beat = (t - taps[0]) / beat_dur
        snapped = round(beat / resolution) * resolution
        total += abs(beat - snapped)
    return total


def choose_resolution(taps: list[float], bpm: float) -> float:
    """Pick 0.5 or 0.25 beat resolution based on quantization error."""
    err_half = quantization_error(taps, bpm, 0.5)
    err_quarter = quantization_error(taps, bpm, 0.25)
    return 0.25 if err_quarter < err_half * 0.7 else 0.5


def quantize_taps(taps: list[float], bpm: float, resolution: float) -> list[float]:
    """Convert tap timestamps to quantized beat positions."""
    beat_dur = 60.0 / bpm
    beats = []
    seen: set[float] = set()
    for t in taps:
        beat = (t - taps[0]) / beat_dur
        snapped = round(round(beat / resolution) * resolution, 4)
        if snapped not in seen:
            seen.add(snapped)
            beats.append(snapped)
    return sorted(beats)


def prompt(msg: str, default: str = "") -> str:
    """Prompt with optional default."""
    suffix = f" [{default}]" if default else ""
    val = input(f"{msg}{suffix}: ").strip()
    return val or default


def main():
    if len(sys.argv) != 2:
        print(f"Usage: uv run {sys.argv[0]} <piece.yaml>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"Error: {path} not found")
        sys.exit(1)

    with open(path) as f:
        piece = yaml.safe_load(f)

    if not isinstance(piece, dict) or "title" not in piece:
        print(f"Error: {path} is not a valid piece YAML")
        sys.exit(1)

    title = piece["title"]
    current_tempo = piece.get("tempo", 0)
    print(f"\nPiece: {title} (current tempo: {current_tempo} BPM)")
    print("Tap spacebar in rhythm. Press Enter when done.\n")

    taps = record_taps()

    if len(taps) < 2:
        print("Error: need at least 2 taps")
        sys.exit(1)

    bpm = detect_tempo(taps)
    bpm_rounded = round(bpm)
    beats = quantize_taps(taps, bpm, 0.5)

    intervals = [taps[i + 1] - taps[i] for i in range(len(taps) - 1)]
    cv = statistics.stdev(intervals) / statistics.mean(intervals) if len(intervals) > 1 else 0
    if cv > 0.3:
        print(f"Warning: irregular tapping (CV={cv:.2f}). Tempo may be inaccurate.\n")

    print(f"\n{len(taps)} taps, detected tempo: {bpm_rounded} BPM")
    print(f"Quantized to 0.5-beat grid ({len(beats)} steps):\n")
    for b in beats:
        print(f"  {b:5.1f}  ♩")

    # Suggest quarter-beat grid if it fits significantly better
    err_half = quantization_error(taps, bpm, 0.5)
    err_quarter = quantization_error(taps, bpm, 0.25)
    if err_quarter < err_half * 0.7:
        beats_quarter = quantize_taps(taps, bpm, 0.25)
        print(f"\nQuarter-beat grid (0.25) fits better ({len(beats_quarter)} steps):")
        for b in beats_quarter:
            print(f"  {b:5.2f}  ♩")
        ans = prompt("Use quarter-beat grid instead?", "N")
        if ans.lower().startswith("y"):
            beats = beats_quarter

    # Tempo update
    update_tempo = False
    if current_tempo and abs(bpm_rounded - current_tempo) > 2:
        ans = prompt(f"\nPiece tempo is {current_tempo}, detected {bpm_rounded}. Update?", "N")
        update_tempo = ans.lower().startswith("y")

    # Arrangement details
    print()
    name = prompt("Arrangement name", "Tapped rhythm")
    difficulty = prompt("Difficulty (beginner/intermediate/advanced)", "beginner")
    default_string = prompt("Default string for all notes", "R1")

    # Build arrangement
    steps = [{"t": b, "string": default_string} for b in beats]
    arrangement = {"name": name, "difficulty": difficulty, "steps": steps}

    if "arrangements" not in piece:
        piece["arrangements"] = []
    piece["arrangements"].append(arrangement)

    if update_tempo:
        piece["tempo"] = bpm_rounded

    with open(path, "w") as f:
        yaml.dump(piece, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print(f"\n✓ Added arrangement \"{name}\" ({len(beats)} steps, {default_string}) to {path}")
    if update_tempo:
        print(f"✓ Updated tempo to {bpm_rounded} BPM")
    print("Note: YAML comments were not preserved.")


if __name__ == "__main__":
    main()
