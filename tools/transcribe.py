# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "basic-pitch",
#     "demucs",
#     "librosa",
#     "pyyaml",
# ]
# ///
"""Transcribe a kora recording (audio or video) to a Kumbengo Lab piece YAML.

Usage:
  uv run tools/transcribe.py recording.mp4
  uv run tools/transcribe.py clean.wav --tempo 90 --no-separate
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
PIECES_DIR = Path("src/content/pieces")


def title_from_stem(stem: str) -> str:
    """Convert filename stem to title: dashes/underscores to spaces, title-cased."""
    return stem.replace("-", " ").replace("_", " ").title()


def check_ffmpeg() -> None:
    """Exit with helpful message if ffmpeg is not installed."""
    if not shutil.which("ffmpeg"):
        print("Error: ffmpeg not found. Install it: sudo apt install ffmpeg", file=sys.stderr)
        sys.exit(1)


def extract_audio(video_path: Path, output_dir: Path) -> Path:
    """Extract audio from video file using ffmpeg."""
    out = output_dir / "audio.wav"
    subprocess.run(
        ["ffmpeg", "-i", str(video_path), "-vn", "-ac", "1", "-ar", "44100", "-y", str(out)],
        check=True,
        capture_output=True,
    )
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe a kora recording to piece YAML")
    parser.add_argument("input", type=Path, help="Input audio or video file")
    parser.add_argument("--title", help="Piece title (default: from filename)")
    parser.add_argument("--tempo", type=int, help="BPM (skip auto-detection)")
    parser.add_argument("--no-separate", action="store_true", help="Skip Demucs source separation")
    parser.add_argument("--resolution", type=float, default=0.5, help="Beat grid resolution (default: 0.5)")
    parser.add_argument("--min-velocity", type=float, default=0.3, help="Min note amplitude 0-1 (default: 0.3)")
    parser.add_argument("--difficulty", default="beginner", choices=["beginner", "intermediate", "advanced"])
    parser.add_argument("--arrangement", default="Transcribed", help="Arrangement name")
    parser.add_argument("--tags", default="transcribed", help="Comma-separated tags")
    return parser.parse_args()


def main():
    args = parse_args()

    if not args.input.exists():
        print(f"Error: {args.input} not found", file=sys.stderr)
        sys.exit(1)

    title = args.title or title_from_stem(args.input.stem)
    output_path = PIECES_DIR / f"{args.input.stem}.yaml"

    if output_path.exists():
        print(f"Error: {output_path} already exists", file=sys.stderr)
        sys.exit(1)

    is_video = args.input.suffix.lower() in VIDEO_EXTENSIONS
    if is_video:
        check_ffmpeg()

    print(f"Transcribing: {args.input}")
    print(f"Title: {title}")
    print(f"Output: {output_path}\n")

    # TODO: implement pipeline steps
    print("Pipeline not yet implemented.")


if __name__ == "__main__":
    main()
