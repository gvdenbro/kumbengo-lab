# MIDI→Kora Auto-Transpose Implementation Plan

**Goal:** Add `--transpose auto` to `tools/midi2kora.py` that picks the transpose dropping the fewest notes.

**Architecture:** Two pure helpers (`count_dropped`, `best_transpose`) built on the existing `midi_to_string`, plus argparse + main() wiring. Executed inline with TDD on branch `feat/kora-playability`.

**Tech Stack:** Python 3.11+, PEP 723 inline deps (`mido`, `pyyaml`), pytest via `uv run --with`.

## Global Constraints
- Python >=3.11; deps via uv; no pyproject.toml (PEP 723 inline).
- `--transpose` accepts either an integer (default `0`) or the literal `auto`.
- Search range −12…+12; minimize dropped notes; tie-break toward smallest |transpose|.
- stderr report format: `Auto-transpose: {t:+d} (drops {n} note(s))`.

---

### Task 1: `count_dropped` + `best_transpose` helpers (TDD)

**Files:** Modify `tools/midi2kora.py` (add after `reduce_to_playable`); Test `tools/test_midi2kora.py` (append).

- [ ] **Step 1: Failing tests** — append to `tools/test_midi2kora.py`:
```python
def test_count_dropped_on_scale_zero():
    assert m.count_dropped([65], 0, fold=False) == 0        # F4 is on-scale


def test_count_dropped_off_scale_one():
    assert m.count_dropped([61], 0, fold=False) == 1        # C#4 off-scale


def test_count_dropped_off_scale_recovered_by_shift():
    assert m.count_dropped([61], 1, fold=False) == 0        # +1 -> D4


def test_best_transpose_recovers_off_scale():
    t, dropped = m.best_transpose([61, 61, 61], fold=False)
    assert dropped == 0
    assert t == -1                                          # tie |1|==|-1|, -1 sorts first


def test_best_transpose_zero_when_already_optimal():
    assert m.best_transpose([65], fold=False) == (0, 0)
```

- [ ] **Step 2: Run — expect fail** (`AttributeError: count_dropped`):
`uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`

- [ ] **Step 3: Implement** — add after `reduce_to_playable` in `tools/midi2kora.py`:
```python
def count_dropped(pitches: list[int], transpose: int, *, fold: bool) -> int:
    """Number of pitches that map to no Silaba string at this transpose."""
    return sum(
        1 for n in pitches
        if midi_to_string(n + transpose, fold=fold, drop=True) is None
    )


def best_transpose(
    pitches: list[int], *, fold: bool, search_range: range = range(-12, 13)
) -> tuple[int, int]:
    """Return (transpose, dropped_count) minimizing dropped notes.

    Ties break toward the smallest absolute transpose (closest to the
    original key).
    """
    best_t, best_dropped = 0, None
    for t in sorted(search_range, key=lambda x: (abs(x), x)):
        dropped = count_dropped(pitches, t, fold=fold)
        if best_dropped is None or dropped < best_dropped:
            best_t, best_dropped = t, dropped
    return best_t, best_dropped
```

- [ ] **Step 4: Run — expect pass.**

- [ ] **Step 5: Commit** `feat(midi2kora): add auto-transpose search helpers`.

---

### Task 2: Wire `--transpose auto` into the CLI (TDD-lite + smoke)

**Files:** Modify `tools/midi2kora.py` (argparse + main()).

- [ ] **Step 1: Change argparse** — replace the `--transpose` line:
```python
    parser.add_argument("--transpose", default="0",
                        help="Semitones to transpose, or 'auto' to minimize dropped notes")
```

- [ ] **Step 2: Resolve transpose in main()** — after `onset_groups` is built and before the step loop, add:
```python
    if args.transpose == "auto":
        all_pitches = [n for group in onset_groups.values() for n in group]
        transpose, auto_dropped = best_transpose(all_pitches, fold=args.fold)
        import sys
        print(f"Auto-transpose: {transpose:+d} (drops {auto_dropped} note(s))", file=sys.stderr)
    else:
        transpose = int(args.transpose)
```
Then replace the mapping line `transposed = [n + args.transpose for n in pitches]` with:
```python
        transposed = [n + transpose for n in pitches]
```

- [ ] **Step 3: Run full suite — expect pass:**
`uv run --with pytest --with mido --with pyyaml pytest tools/test_midi2kora.py -v`

- [ ] **Step 4: CLI smoke:**
`uv run tools/midi2kora.py test-data/mad-world.midi --transpose auto --drop-unplayable -o /tmp/at.yaml`
Expected: prints `Auto-transpose: {t:+d} (drops N note(s))`; N is ≤ the drop count at `--transpose 0`. Delete /tmp/at.yaml.

- [ ] **Step 5: Commit** `feat(midi2kora): support --transpose auto`.
