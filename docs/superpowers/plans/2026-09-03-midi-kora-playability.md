# MIDI→Kora Playability Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tools/midi2kora.py` emit only note-combinations a kora player can physically play, dropping the minimum needed and favoring outer (melody + bass) notes.

**Architecture:** Add two pure helpers to `midi2kora.py` — a per-onset feasibility test (`is_playable`) and a greedy reducer (`reduce_to_playable`) — then call the reducer in `main()` after the existing transpose/fold/drop steps and report how many notes were dropped. Reduction is per-onset (simultaneity only); no finger-travel modeling.

**Tech Stack:** Python 3.11+ (PEP 723 inline-script deps: `mido`, `pyyaml`), pytest via `uv run --with`.

## Global Constraints

- Python `>=3.11` (matches the existing script header).
- Dependencies managed with `uv`; do not add a `pyproject.toml` — keep the PEP 723 inline metadata in `tools/midi2kora.py`.
- Hand is forced by pitch (string side); never reassign L/R.
- Reduction is per-onset only — no sequential/finger-travel constraints.
- String IDs: side = first char (`L`/`R`), position = integer suffix; higher position = higher pitch.
- Default finger reach (soft split + overlap): both sides `thumb_max = 6`, `index_min = 5`; left has 11 strings, right has 10.

---

### Task 1: Feasibility test (`is_playable`)

**Files:**
- Modify: `tools/midi2kora.py` (add constants + helpers after the `midi_to_string` function, ~line 45)
- Test: `tools/test_midi2kora.py` (create)

**Interfaces:**
- Produces:
  - `FINGER_REACH: dict[str, dict[str, int]]`
  - `parse_string(s: str) -> tuple[str, int]`
  - `is_playable(strings: list[str]) -> bool`

- [ ] **Step 1: Write the failing tests**

Create `tools/test_midi2kora.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import midi2kora as m


def test_parse_string():
    assert m.parse_string("L11") == ("L", 11)
    assert m.parse_string("R1") == ("R", 1)


def test_single_note_is_playable():
    assert m.is_playable(["L9"]) is True


def test_two_notes_split_across_hands_is_playable():
    assert m.is_playable(["L3", "R7"]) is True


def test_two_left_notes_thumb_and_index_is_playable():
    # L6 (pos 6, thumb) + L9 (pos 9, index)
    assert m.is_playable(["L6", "L9"]) is True


def test_three_left_notes_not_playable():
    assert m.is_playable(["L6", "L7", "L9"]) is False


def test_two_high_left_notes_not_playable():
    # both above thumb_max=6 -> only the index can reach, one digit
    assert m.is_playable(["L8", "L9"]) is False


def test_two_low_left_notes_not_playable():
    # both below index_min=5 -> only the thumb can reach, one digit
    assert m.is_playable(["L2", "L3"]) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'parse_string'`.

- [ ] **Step 3: Write minimal implementation**

Add to `tools/midi2kora.py` immediately after the `midi_to_string` function:

```python
# Soft thumb/index split per side (position numbers). Thumb reaches
# positions 1..thumb_max; index reaches index_min..count. Positions in
# [index_min, thumb_max] are the overlap zone (either digit).
FINGER_REACH: dict[str, dict[str, int]] = {
    "L": {"thumb_max": 6, "index_min": 5, "count": 11},
    "R": {"thumb_max": 6, "index_min": 5, "count": 10},
}


def parse_string(s: str) -> tuple[str, int]:
    """Split a string ID like 'L11' into ('L', 11)."""
    return s[0], int(s[1:])


def is_playable(strings: list[str]) -> bool:
    """True if all strings can sound at the same instant on a kora.

    Each hand has a thumb (low strings) and index (high strings): at most
    2 notes per side, and if 2, the lower must be thumb-reachable and the
    higher index-reachable.
    """
    by_side: dict[str, list[int]] = {"L": [], "R": []}
    for s in strings:
        side, pos = parse_string(s)
        by_side[side].append(pos)
    for side, positions in by_side.items():
        if len(positions) > 2:
            return False
        if len(positions) == 2:
            low, high = sorted(positions)
            reach = FINGER_REACH[side]
            if not (low <= reach["thumb_max"] and high >= reach["index_min"]):
                return False
    return True
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): add per-onset kora playability test"
```

---

### Task 2: Greedy reducer (`reduce_to_playable`)

**Files:**
- Modify: `tools/midi2kora.py` (add reverse map + reducer after `is_playable`)
- Test: `tools/test_midi2kora.py` (append cases)

**Interfaces:**
- Consumes: `is_playable`, `SILABA_MIDI_TO_STRING`
- Produces:
  - `STRING_TO_MIDI: dict[str, int]`
  - `reduce_to_playable(strings: list[str]) -> list[str]`

- [ ] **Step 1: Write the failing tests**

Append to `tools/test_midi2kora.py`:

```python
def test_reduce_passthrough_single():
    assert m.reduce_to_playable(["L9"]) == ["L9"]


def test_reduce_passthrough_playable_pair():
    assert m.reduce_to_playable(["L3", "R7"]) == ["L3", "R7"]


def test_reduce_impossible_left_triad_keeps_outer_pair():
    # L6=Bb3(bass), L7=D4(mid), L9=A4(melody) -> drop the middle
    result = m.reduce_to_playable(["L9", "L7", "L6"])
    assert result == ["L9", "L6"]
    assert m.is_playable(result)


def test_reduce_four_note_chord_keeps_reachable_inner():
    # R6=Bb4(melody), L8=F4, L7=D4, L6=Bb3(bass)
    result = m.reduce_to_playable(["R6", "L8", "L7", "L6"])
    assert result == ["R6", "L7", "L6"]
    assert m.is_playable(result)


def test_reduce_result_preserves_input_order():
    result = m.reduce_to_playable(["R7", "L6", "L9"])
    assert result == [s for s in ["R7", "L6", "L9"] if s in result]
    assert m.is_playable(result)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'reduce_to_playable'`.

- [ ] **Step 3: Write minimal implementation**

Add to `tools/midi2kora.py` immediately after `is_playable`:

```python
STRING_TO_MIDI: dict[str, int] = {v: k for k, v in SILABA_MIDI_TO_STRING.items()}


def reduce_to_playable(strings: list[str]) -> list[str]:
    """Return the playable subset of a chord, keeping outer notes first.

    Notes are considered in order of 'outerness' (distance from the chord's
    pitch center, so melody and bass come first); each is kept only if the
    running set stays playable. Inner notes fill in where a digit is free.
    Result preserves the original input order.
    """
    if len(strings) <= 1:
        return list(strings)
    pitches = {s: STRING_TO_MIDI[s] for s in strings}
    center = (min(pitches.values()) + max(pitches.values())) / 2
    ordered = sorted(strings, key=lambda s: (-abs(pitches[s] - center), pitches[s]))
    kept: list[str] = []
    for s in ordered:
        if is_playable(kept + [s]):
            kept.append(s)
    return [s for s in strings if s in kept]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`
Expected: PASS (all 12).

- [ ] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): add greedy outer-notes-first chord reducer"
```

---

### Task 3: Wire reducer into conversion + reporting

**Files:**
- Modify: `tools/midi2kora.py` (the step-building loop in `main()`, ~lines 100-118, and the reporting block near the end of `main()`)
- Test: `tools/test_midi2kora.py` (append integration-style case)

**Interfaces:**
- Consumes: `reduce_to_playable`

- [ ] **Step 1: Write the failing test**

Append to `tools/test_midi2kora.py`:

```python
def test_every_reduced_chord_is_playable_across_range():
    # Exhaustive-ish: a spread of chords must always come out playable.
    chords = [
        ["L9", "L7", "L6"],
        ["R6", "L8", "L7", "L6"],
        ["L1", "L2", "L3", "L4"],
        ["R8", "R9", "R10"],
        ["L11", "R10", "L1", "R1"],
    ]
    for chord in chords:
        reduced = m.reduce_to_playable(chord)
        assert m.is_playable(reduced), f"{chord} -> {reduced} not playable"
        assert len(reduced) <= 4
```

Also confirm the `main()` loop uses the reducer — this is verified by the CLI smoke check in Step 4.

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py::test_every_reduced_chord_is_playable_across_range -v`
Expected: PASS for the property test (logic already exists from Task 2). This task's real change is wiring + reporting, verified in Step 4.

- [ ] **Step 3: Wire the reducer into `main()`**

In `tools/midi2kora.py`, find the reporting counter initialization near the top of `main()`:

```python
    steps = []
    dropped = 0
```

Change it to:

```python
    steps = []
    dropped = 0
    reduced = 0
```

Then in the step-building loop, replace this block:

```python
        strings = list(dict.fromkeys(s for s in mapped if s is not None))

        step: dict = {"d": d_seconds}
```

with:

```python
        strings = list(dict.fromkeys(s for s in mapped if s is not None))
        playable = reduce_to_playable(strings)
        reduced += len(strings) - len(playable)
        strings = playable

        step: dict = {"d": d_seconds}
```

Then find the existing dropped-notes report near the end of `main()`:

```python
    if dropped:
        import sys
        print(f"Dropped {dropped} unplayable note(s)", file=sys.stderr)
```

and add the reduced report immediately after it:

```python
    if reduced:
        import sys
        print(f"Reduced {reduced} note(s) for playability", file=sys.stderr)
```

- [ ] **Step 4: Run the full test suite and a CLI smoke check**

Run: `uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`
Expected: PASS (all 13).

Then regenerate the known problem file and confirm no impossible chords remain:

Run: `uv run tools/midi2kora.py test-data/mad-world.midi --tempo 100 --title "Mad World" -o /tmp/mad-world-check.yaml`
Expected: prints a `Reduced N note(s) for playability` line to stderr.

Run: `grep -nE '\[(L[0-9]+, ){2}' /tmp/mad-world-check.yaml || echo "no impossible left-hand triads"`
Expected: prints `no impossible left-hand triads` (no chord has 3+ left strings).

- [ ] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): apply playability reduction during conversion"
```

---

## Notes for the implementer

- Run every command from the repo root (`/home/devlin/dev/personal/kumbengo-lab`).
- The `--with mido --with pyyaml` flags are required because `tools/midi2kora.py`
  imports those at module load; the test imports the module by path.
- Do not regenerate the committed `src/content/pieces/mad-world.yaml` as part of
  this work — regenerating pieces is a separate content decision. The Step 4
  smoke check writes to `/tmp` only; delete it afterward.
