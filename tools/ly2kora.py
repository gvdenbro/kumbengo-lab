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
    """Map a MIDI note number to the exact Silaba kora string ID.

    Folds octaves to fit within kora range (41-81).
    Raises ValueError if the pitch class is not in the Silaba scale.
    """
    # Fold into kora range by shifting octaves
    while midi > 81:
        midi -= 12
    while midi < 41:
        midi += 12
    if midi not in SILABA_MIDI_TO_STRING:
        raise ValueError(f"MIDI {midi} (pitch class {midi % 12}) is not in Silaba tuning")
    return SILABA_MIDI_TO_STRING[midi]


import yaml

import ly.document
import ly.pitch

NOTE_TO_SEMITONE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def _pitch_to_midi(pitch: ly.pitch.Pitch) -> int:
    """Convert a python-ly Pitch to MIDI note number."""
    semitone = [0, 2, 4, 5, 7, 9, 11][pitch.note]
    midi = 60 + (pitch.octave * 12) + semitone + int(pitch.alter * 2)
    return midi


def _read_duration(tokens: list, i: int) -> tuple[float, int] | None:
    """Try to read a duration (number + dots) starting at index i."""
    from ly.lex import lilypond
    if i >= len(tokens) or not isinstance(tokens[i], lilypond.Duration):
        return None
    beats = 4.0 / int(str(tokens[i]))
    i += 1
    while i < len(tokens) and isinstance(tokens[i], lilypond.Dot):
        beats *= 1.5
        i += 1
    return (beats, i)


def parse_voice(ly_text: str, start_pitch_name: str = "c", start_octave: int = 4) -> list[tuple[float, list[int], float]]:
    """Parse a LilyPond \\relative voice into (onset_beats, [midi_notes], duration_beats) events."""
    from ly.lex import lilypond

    doc = ly.document.Document(ly_text)
    cursor = ly.document.Cursor(doc)
    tokens = list(ly.document.Source(cursor, tokens_with_position=True))

    events: list[tuple[float, list[int], float]] = []
    onset = 0.0
    current_duration = 1.0
    tie_active = False

    ref_note = NOTE_TO_SEMITONE[start_pitch_name]
    ref_octave = start_octave - 4
    last_pitch = ly.pitch.Pitch(
        note=[n for n, s in enumerate([0, 2, 4, 5, 7, 9, 11]) if s == ref_note][0],
        octave=ref_octave,
    )

    i = 0
    in_chord = False
    chord_pitches: list[int] = []
    skip_next_note = False  # Skip notes that are part of \key, \tempo etc.

    # Skip tokens before SequentialStart '{' (the \relative reference pitch)
    while i < len(tokens) and not isinstance(tokens[i], lilypond.SequentialStart):
        i += 1
    if i < len(tokens):
        i += 1  # skip the '{' itself

    while i < len(tokens):
        token = tokens[i]

        # Track commands that consume a pitch (e.g. \key c \major)
        if isinstance(token, (lilypond.PitchCommand, lilypond.Tempo)):
            skip_next_note = True
            i += 1
            continue

        if isinstance(token, lilypond.Tie):
            tie_active = True
            i += 1
            continue

        if isinstance(token, lilypond.Rest):
            i += 1
            dur = _read_duration(tokens, i)
            if dur is not None:
                current_duration = dur[0]
                i = dur[1]
            tie_active = False
            events.append((onset, [], current_duration))
            onset += current_duration
            continue

        if isinstance(token, lilypond.ChordStart):
            in_chord = True
            chord_pitches = []
            chord_base_pitch = last_pitch.copy()
            i += 1
            continue

        if isinstance(token, lilypond.ChordEnd):
            in_chord = False
            i += 1
            dur = _read_duration(tokens, i)
            if dur is not None:
                current_duration = dur[0]
                i = dur[1]
            if tie_active and events:
                events[-1] = (events[-1][0], events[-1][1], events[-1][2] + current_duration)
                tie_active = False
                onset += current_duration
            else:
                events.append((onset, chord_pitches, current_duration))
                onset += current_duration
            continue

        if isinstance(token, lilypond.Note):
            pitch_result = ly.pitch.pitchReader("nederlands")(str(token))
            if pitch_result is None:
                i += 1
                continue
            note_num, alter = pitch_result
            i += 1
            octave_mod = 0
            while i < len(tokens) and isinstance(tokens[i], lilypond.Octave):
                octave_mod = ly.pitch.octaveToNum(str(tokens[i]))
                i += 1
            while i < len(tokens) and isinstance(tokens[i], lilypond.OctaveCheck):
                i += 1

            # Skip notes that are arguments to \key, \tempo, etc.
            if skip_next_note:
                skip_next_note = False
                while i < len(tokens) and isinstance(tokens[i], (lilypond.Duration, lilypond.Dot)):
                    i += 1
                continue

            pitch = ly.pitch.Pitch(note=note_num, alter=alter, octave=octave_mod)
            if in_chord:
                pitch.makeAbsolute(chord_base_pitch)
                chord_base_pitch = pitch.copy()
                # Update last_pitch to the last chord note for post-chord relative calcs
                last_pitch = pitch.copy()
            else:
                pitch.makeAbsolute(last_pitch)
                last_pitch = pitch.copy()
            midi = _pitch_to_midi(pitch)

            if in_chord:
                chord_pitches.append(midi)
                continue

            dur = _read_duration(tokens, i)
            if dur is not None:
                current_duration = dur[0]
                i = dur[1]

            if tie_active and events:
                events[-1] = (events[-1][0], events[-1][1], events[-1][2] + current_duration)
                tie_active = False
                onset += current_duration
            else:
                events.append((onset, [midi], current_duration))
                onset += current_duration
            continue

        i += 1

    return events


def merge_voices(voices: list[list[tuple[float, list[int], float]]]) -> list[tuple[float, list[int], float]]:
    """Merge multiple voice event lists into a single timeline.

    Events at the same onset are combined (pitches merged).
    Duration (d) becomes time-to-next-event, except for the last event
    which keeps its written duration.
    """
    all_events: dict[float, list[int]] = {}
    all_durations: dict[float, float] = {}

    for voice in voices:
        for onset, pitches, duration in voice:
            onset_r = round(onset, 6)
            if onset_r in all_events:
                all_events[onset_r].extend(pitches)
            else:
                all_events[onset_r] = list(pitches)
            all_durations[onset_r] = max(all_durations.get(onset_r, 0), duration)

    sorted_onsets = sorted(all_events.keys())

    merged: list[tuple[float, list[int], float]] = []
    for idx, onset in enumerate(sorted_onsets):
        pitches = all_events[onset]
        if idx < len(sorted_onsets) - 1:
            d = sorted_onsets[idx + 1] - onset
        else:
            d = all_durations[onset]
        merged.append((round(onset, 6), pitches, round(d, 6)))

    return merged


def events_to_yaml(events: list[tuple[float, list[int], float]], *, title: str, transpose: int, tempo: int) -> str:
    """Convert merged events to Kumbengo Lab piece YAML."""
    beat_duration = 60.0 / tempo
    steps = []

    for onset, pitches, d_beats in events:
        d_seconds = round(d_beats * beat_duration, 3)
        step: dict = {"d": d_seconds}

        if pitches:
            transposed = [midi + transpose for midi in pitches]
            strings = list(dict.fromkeys(midi_to_string(m) for m in transposed))
            if len(strings) == 1:
                step["string"] = strings[0]
            elif len(strings) > 1:
                step["strings"] = strings

        steps.append(step)

    piece = {
        "title": title,
        "tuning": "silaba",
        "tags": ["cover"],
        "arrangements": [{"name": "Full", "steps": steps}],
    }
    return yaml.dump(piece, default_flow_style=None, sort_keys=False, allow_unicode=True)


import argparse
import re
import sys


def extract_voices(ly_content: str) -> list[tuple[str, str, int]]:
    """Extract voice blocks from a LilyPond file.

    Returns list of (voice_ly_text, start_pitch_name, start_octave).
    Finds \\relative <pitch><octave> { ... } blocks.
    """
    pattern = r"\\relative\s+([a-g])([',]*)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}"
    matches = re.findall(pattern, ly_content, re.DOTALL)

    voices = []
    for note_name, octave_str, body in matches:
        octave = 3 + ly.pitch.octaveToNum(octave_str)
        voice_text = rf"\relative {note_name}{octave_str} {{ {body} }}"
        voices.append((voice_text, note_name, octave))
    return voices


def main():
    parser = argparse.ArgumentParser(description="Convert LilyPond to kora piece YAML")
    parser.add_argument("input", help="Input .ly file")
    parser.add_argument("--transpose", type=int, default=0, help="Semitones to transpose")
    parser.add_argument("--tempo", type=int, default=None, help="BPM (overrides file tempo)")
    parser.add_argument("-o", "--output", help="Output YAML path (default: stdout)")
    parser.add_argument("--title", help="Piece title (default: from file header)")
    args = parser.parse_args()

    content = open(args.input).read()

    # Extract title from header if not specified
    title = args.title
    if not title:
        m = re.search(r'title\s*=\s*"([^"]+)"', content)
        title = m.group(1) if m else "Untitled"

    # Extract tempo from file if not specified
    tempo = args.tempo
    if not tempo:
        m = re.search(r"\\tempo\s+4\s*=\s*(\d+)", content)
        tempo = int(m.group(1)) if m else 120

    # Extract and parse voices
    voice_specs = extract_voices(content)
    if not voice_specs:
        print("Error: no \\relative voices found in input", file=sys.stderr)
        sys.exit(1)

    parsed_voices = []
    for voice_text, start_name, start_oct in voice_specs:
        events = parse_voice(voice_text, start_pitch_name=start_name, start_octave=start_oct)
        parsed_voices.append(events)

    # Merge and generate
    merged = merge_voices(parsed_voices)
    output = events_to_yaml(merged, title=title, transpose=args.transpose, tempo=tempo)

    if args.output:
        open(args.output, "w").write(output)
        print(f"Written to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
