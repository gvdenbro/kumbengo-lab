# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-ly",
#     "pyyaml",
# ]
# ///
"""Convert a LilyPond file to a Kumbengo Lab kora piece YAML.

Usage:
  uv run tools/ly2kora.py test-data/aphex.ly --transpose 5 --tempo 65 -o src/content/pieces/hy-a-scullyas.yaml
"""

# Silaba tuning: midi -> string ID
SILABA_MIDI_TO_STRING: dict[int, str] = {
    41: "L1",  48: "L2",  50: "L3",  52: "L4",  55: "L5",
    58: "L6",  62: "L7",  65: "L8",  69: "L9",  72: "L10",
    76: "L11", 53: "R1",  57: "R2",  60: "R3",  64: "R4",
    67: "R5",  70: "R6",  74: "R7",  77: "R8",  79: "R9",
    81: "R10",
}


def midi_to_string(midi: int) -> str:
    """Map a MIDI note number to the exact Silaba kora string ID."""
    if midi < 41 or midi > 81:
        raise ValueError(f"MIDI {midi} is out of kora range (41-81)")
    if midi not in SILABA_MIDI_TO_STRING:
        raise ValueError(f"MIDI {midi} is not in Silaba tuning")
    return SILABA_MIDI_TO_STRING[midi]
