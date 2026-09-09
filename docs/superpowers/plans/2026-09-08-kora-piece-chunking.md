# Kora Piece Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make `tools/midi2kora.py` automatically split generated kora transcriptions into musically sensible, loopable chunks (each occurrence of a repeated phrase its own chunk, size-based fallback), and give the player a chunk selector that loops within a chunk using the existing Loop checkbox — all while keeping hand-written YAML without chunks working as today.

**Architecture:** A three-stage chunking pipeline in `midi2kora.py`: (1) tokenize each step into a transposition-invariant `(interval, quantized-duration)` token, (2) find significant repeated substrings over the token sequence and merge near-repeats via edit distance, (3) pick the dominant phrase, make each of its occurrences a chunk, and fall back to rest-based splits over the leftover gaps. On the frontend, `chunks` is validated at build time, and the Player learns a "region" (start,end step indices) that it loops; with no chunks the region is unset and behavior is unchanged.

**Tech Stack:** Python 3.11+ PEP 723 inline-script deps (`mido`, `pyyaml`, `rapidfuzz`) run via `uv`; pytest for the generator; Astro + TypeScript + Vitest for the site.

**Spec:** `docs/superpowers/specs/2026-09-08-kora-piece-chunking-design.md`

## Global Constraints

- Python `>=3.11`; executed via `uv run`; do not add a `pyproject.toml` — keep PEP 723 inline metadata in `tools/midi2kora.py`.
- All pytest commands gain `--with rapidfuzz` (module now imports it at load).
- `chunks` is optional in the YAML schema; absence → single full piece in the UI, exactly today's behavior.
- Generated files: `chunks` always present; each chunk `0 ≤ start ≤ end < len(Full.steps)`; chunks exactly tile `Full.steps` (first start 0, last end n−1, consecutive chunks adjacent). Sealed by a generator-internal assertion.
- Generator names chunks generically (`Chunk 1`, `Chunk 2`, …); no musical section naming.
- Per-occurrence: a repeated phrase that occurs twice appears as two separate chunks (duplicates kept).
- Hand-written YAML may omit `chunks`; if present it must validate (build error otherwise).
- Reuse: `rapidfuzz` for edit distance (near-repeat merge). **Deviation from spec:** `pyahocorasick` is dropped — with n≈450, bounded-window enumeration (max pattern length 48) is O(n·48) microseconds and needs no automaton; `music21` is also dropped (verified during planning: corpus n-gram search, not intra-piece chunking). Documented here so the reader reviews the deviation at plan time.

---

### Task 1: Tokenize steps into interval/duration tokens

**Files:**
- Modify: `tools/midi2kora.py` (add constants + `tokenize_steps` after `reduce_to_playable`, before `count_dropped`)
- Test: `tools/test_midi2kora.py` (append)

**Interfaces:**
- Consumes: `STRING_TO_MIDI: dict[str, int]` (already defined in the module)
- Produces: `DUR_SHORT: float = 0.45`, `DUR_MED: float = 0.70`, `tokenize_steps(steps: list[dict]) -> list[str]` — one 2-char token per step.

- [x] **Step 1: Write the failing tests**

Append to `tools/test_midi2kora.py`:

```python
def test_tokenize_single_note_start():
    assert m.tokenize_steps([{"d": 0.35, "string": "L5"}]) == ["S1"]


def test_tokenize_intervals_up_down_same():
    # L5 (F3=53), R3 (C4=60) up, L4 (E3=52) down, L4 again same
    steps = [
        {"d": 0.35, "string": "L5"},
        {"d": 0.35, "string": "R3"},
        {"d": 0.35, "string": "L4"},
        {"d": 0.35, "string": "L4"},
    ]
    assert m.tokenize_steps(steps) == ["S1", "U1", "D1", "=1"]


def test_tokenize_duration_quantization():
    # <=0.45 -> '1'; 0.45<d<0.70 -> '2'; >=0.70 -> '3'
    steps = [
        {"d": 0.35, "string": "L1"},
        {"d": 0.50, "string": "L1"},
        {"d": 0.90, "string": "L1"},
        {"d": 0.45, "string": "L1"},
        {"d": 0.70, "string": "L1"},
    ]
    assert m.tokenize_steps(steps) == ["S1", "=2", "=3", "=1", "=3"]


def test_tokenize_rest_and_leading_rest():
    # rests carry 'R'+dur; a leading rest keeps prev=None so the first
    # sounding note still gets 'S'
    steps = [
        {"d": 0.30},
        {"d": 0.50, "string": "L1"},
        {"d": 0.35},
        {"d": 1.00, "string": "L1"},
    ]
    assert m.tokenize_steps(steps) == ["R1", "S2", "R1", "=3"]
```

- [x] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py::test_tokenize_single_note_start -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'tokenize_steps'`.

- [x] **Step 3: Write minimal implementation**

Add to `tools/midi2kora.py` after `reduce_to_playable`:

```python
# Duration quantization for tokens: d <= DUR_SHORT -> '1', d < DUR_MED -> '2',
# else '3'. Coarse enough to absorb timing drift between repeats.
DUR_SHORT = 0.45
DUR_MED = 0.70


def _quantize_duration(d: float) -> str:
    if d <= DUR_SHORT:
        return "1"
    if d < DUR_MED:
        return "2"
    return "3"


def tokenize_steps(steps: list[dict]) -> list[str]:
    """Map steps to transposition-invariant 2-char tokens.

    Token = interval char + quantized-duration char. The interval is relative
    to the previous sounding step's lowest pitch ('U' up / 'D' down / '=' same);
    the first sounding step uses 'S'. Rests use 'R' + duration char. Comparing
    shape/interval rather than absolute pitch makes repeats detected later
    transposition-invariant.
    """
    tokens: list[str] = []
    prev: int | None = None
    for step in steps:
        d = step.get("d", 0.0)
        dur = _quantize_duration(d)
        strings = step.get("strings") or ([step["string"]] if "string" in step else [])
        if not strings:
            tokens.append("R" + dur)
            continue
        p = min(STRING_TO_MIDI[s] for s in strings)
        if prev is None:
            iv = "S"
        elif p > prev:
            iv = "U"
        elif p < prev:
            iv = "D"
        else:
            iv = "="
        prev = p
        tokens.append(iv + dur)
    return tokens
```

- [x] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py -v`
Expected: PASS (all 4 tokenize tests, plus existing playability/transpose tests).

- [x] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): add transposition-invariant step tokenizer"
```

---

### Task 2: Find significant exact repeated substrings

**Files:**
- Modify: `tools/midi2kora.py` (add `find_repeated_blocks` + `significant_repeats` after `tokenize_steps`)
- Test: `tools/test_midi2kora.py` (append)

**Interfaces:**
- Consumes: `tokenize_steps` (Task 1)
- Produces: `find_repeated_blocks(tokens, *, min_len=3, max_len=48, min_occ=2) -> dict[tuple[str, ...], list[int]]`, `significant_repeats(hits, *, max_occ=12) -> dict[tuple[str, ...], list[int]]`

- [x] **Step 1: Write the failing tests**

Append to `tools/test_midi2kora.py`:

```python
def test_find_repeated_blocks_basic():
    # 'U1' repeated twice at positions 2 and 4
    tokens = ["S1", "D1", "U1", "D1", "U1", "D1"]
    hits = m.find_repeated_blocks(tokens, min_len=2, max_len=6, min_occ=2)
    assert ("U1", "D1") in hits
    assert hits[("U1", "D1")] == [2, 4]


def test_find_repeated_blocks_greedy_nonoverlap():
    # pattern 'S1 U1' at 0,2,4 -- greedy keeps all three (non-overlapping: [0,1],[2,3],[4,5])
    tokens = ["S1", "U1", "S1", "U1", "S1", "U1"]
    hits = m.find_repeated_blocks(tokens, min_len=2, max_len=6, min_occ=2)
    assert tuple(tokens[0:2]) in hits
    # non-overlapping starts: 0 (covers 0..1), 2 (covers 2..3), 4 (covers 4..5)
    assert hits[tuple(tokens[0:2])] == [0, 2, 4]


def test_find_repeated_blocks_no_repeat():
    tokens = ["S1", "U1", "D2", "U1", "D3"]
    hits = m.find_repeated_blocks(tokens, min_len=3, max_len=6, min_occ=2)
    assert hits == {}


def test_significant_repeats_drops_short_prefix():
    # 'U1 D1' is a prefix of the longer 'U1 D1 U1' at the same starts -> dropped
    hits = {
        ("U1", "D1"): [2, 8],
        ("U1", "D1", "U1"): [2, 8],
    }
    sig = m.significant_repeats(hits, max_occ=12)
    assert ("U1", "D1") not in sig
    assert ("U1", "D1", "U1") in sig


def test_significant_repeats_drops_too_frequent():
    hits = {("U1", "D1"): list(range(20))}
    sig = m.significant_repeats(hits, max_occ=12)
    assert sig == {}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py::test_find_repeated_blocks_basic -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'find_repeated_blocks'`.

- [x] **Step 3: Write minimal implementation**

Add to `tools/midi2kora.py` after `tokenize_steps`:

```python
def find_repeated_blocks(
    tokens: list[str], *, min_len: int = 3, max_len: int = 48, min_occ: int = 2
) -> dict[tuple[str, ...], list[int]]:
    """Return every exact repeated substring of the token sequence.

    For each window length in [min_len, max_len] count occurrences, then keep
    patterns seen >= min_occ times. Occurrences per pattern are greedily
    non-overlapping (a later start must be >= previous start + length) so a
    repeated block's occurrences tile like real musical phrases. Bounded window
    length keeps this O(n*max_len) — microseconds at mad-world's n=447.
    """
    n = len(tokens)
    hits: dict[tuple[str, ...], list[int]] = {}
    for L in range(min_len, min(max_len, n) + 1):
        windows: dict[tuple[str, ...], list[int]] = {}
        for i in range(n - L + 1):
            w = tuple(tokens[i : i + L])
            windows.setdefault(w, []).append(i)
        for w, pos in windows.items():
            if len(pos) < min_occ:
                continue
            npos: list[int] = []
            for p in pos:
                if not npos or p >= npos[-1] + L:
                    npos.append(p)
            if len(npos) >= min_occ:
                hits[w] = npos
    return hits


def significant_repeats(
    hits: dict[tuple[str, ...], list[int]], *, max_occ: int = 12
) -> dict[tuple[str, ...], list[int]]:
    """Filter repeated blocks down to structurally meaningful ones.

    Drop a block when (a) it occurs too often (trivial micro-motif returning
    everywhere), or (b) it is a prefix of a longer repeated block that is its
    strict extension at the same occurrence starts (redundant — the longer one
    carries the same structural information).
    """
    kept = dict(hits)
    for pat in list(kept):
        if len(kept[pat]) > max_occ:
            del kept[pat]
            continue
        for other in list(kept):
            if other is pat or len(other) <= len(pat):
                continue
            if other[: len(pat)] == pat and set(kept[other]) >= set(kept[pat]):
                del kept[pat]
                break
    return kept
```

- [x] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py -v`
Expected: PASS (all 4 find/significant tests, plus existing tests).

- [x] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): add repeated-substring detection and significance filter"
```

---

### Task 3: Merge near-repeats and pick the dominant phrase

**Files:**
- Modify: `tools/midi2kora.py` (add `merge_near_repeats` + `pick_dominant` + `occurrence_spans` after `significant_repeats`; add `from rapidfuzz.distance import Levenshtein` at top)
- Test: `tools/test_midi2kora.py` (append)

**Interfaces:**
- Consumes: `rapidfuzz.distance.Levenshtein` (new import), `significant_repeats` (Task 2)
- Produces: `merge_near_repeats(blocks, *, max_edits=1) -> list[dict]` where each dict is `{"pattern": tuple[str,...], "positions": list[int]}`; `pick_dominant(groups, steps, *, max_dur=20.0, phrase_min_len=8) -> dict | None`; `occurrence_spans(groups, steps, *, max_dur=20.0) -> list[tuple[int, int]]`

- [x] **Step 1: Write the failing tests**

Append to `tools/test_midi2kora.py`:

```python
def test_merge_near_repeats_merges_similar():
    # 'U1 D1 U1' vs 'U1 D1 U2' differ by one substitution -> merged
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("U1", "D1", "U2"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 1
    assert groups[0]["positions"] == [0, 9]


def test_merge_near_repeats_keeps_distinct():
    # 'U1 D1 U1' vs 'D1 U1 D1' differ by > 1 edit -> separate
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("D1", "U1", "D1"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 2


def test_merge_near_repeats_merges_similar():
    # 'U1 D1 U1' vs 'U1 D1 U2' differ by one substitution -> merged
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("U1", "D1", "U2"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 1
    assert groups[0]["positions"] == [0, 9]


def test_merge_near_repeats_keeps_distinct():
    # 'U1 D1 U1' vs 'D1 U1 D1' differ by > 1 edit -> separate
    blocks = {
        ("U1", "D1", "U1"): [0],
        ("D1", "U1", "D1"): [9],
    }
    groups = m.merge_near_repeats(blocks, max_edits=1)
    assert len(groups) == 2


def test_pick_dominant_longest_first():
    # two groups: len 3 occ 5 vs len 5 occ 3 — both fit (scores tie at 15,
    # tie-break to the longer pattern). phrase_min_len lowered to 3 so both
    # qualify (default 8 would reject both).
    steps = [{"d": 0.5, "string": "L1"}] * 40
    groups = [
        {"pattern": ("U1", "D1", "U1"), "positions": [0, 4, 8, 12, 16]},
        {"pattern": ("U1", "D1", "U1", "D1", "U1"), "positions": [2, 10, 20]},
    ]
    dom = m.pick_dominant(groups, steps, phrase_min_len=3)
    assert dom["pattern"] == ("U1", "D1", "U1", "D1", "U1")


def test_pick_dominant_skips_short_and_oversized():
    # phrase_min_len=8: all blocks too short -> None (fallback path)
    steps = [{"d": 0.5, "string": "L1"}] * 40
    groups = [{"pattern": ("U1", "D1", "U1"), "positions": [0, 9]},]
    assert m.pick_dominant(groups, steps, phrase_min_len=8) is None
    # len 8 passes phrase_min_len but 8 steps * 0.5s = 4.0s > max_dur=1.0 -> None
    groups = [{"pattern": ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1"), "positions": [0, 9]},]
    assert m.pick_dominant(groups, steps, max_dur=1.0) is None


def test_occurrence_spans_nonoverlapping():
    steps = [{"d": 0.5, "string": "L1"}] * 60
    groups = [{"pattern": ("U1", "D1", "U1", "U1", "D1", "U1", "D1", "U1"), "positions": [5, 8, 20, 40]}]
    spans = m.occurrence_spans(groups, steps)
    # positions 5 -> (5,12); 8 overlaps (5..12) and is skipped; 20 and 40 kept
    assert spans == [(5, 12), (20, 27), (40, 47)]
```

- [x] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py::test_merge_near_repeats_merges_similar -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'merge_near_repeats'`.

- [x] **Step 3: Write minimal implementation**

At the top of `tools/midi2kora.py`, add the import after the existing imports:

```python
from rapidfuzz.distance import Levenshtein
```

Add after `significant_repeats`:

```python
def merge_near_repeats(
    blocks: dict[tuple[str, ...], list[int]], *, max_edits: int = 1
) -> list[dict]:
    """Merge repeated blocks whose token strings are within max_edits edits.

    Real repeats carry ornaments and small drift, so two occurrences should
    still count as one phrase when their token strings are nearly identical.
    Uses rapidfuzz's C Levenshtein (maintained; the Mongeau--Sankoff trick).
    Returns a list of groups (pattern token-tuple + union of occurrence starts).
    """
    groups: list[dict] = []
    for pat, pos in sorted(blocks.items(), key=lambda kv: (len(kv[0]), kv[1])):
        s = "".join(pat)
        placed = False
        for g in groups:
            if Levenshtein.distance(s, "".join(g["pattern"])) <= max_edits:
                g["positions"] = sorted(set(g["positions"]) | set(pos))
                placed = True
                break
        if not placed:
            groups.append({"pattern": pat, "positions": list(pos)})
    return groups


def _span_duration(steps: list[dict], start: int, length: int) -> float:
    """Total duration of steps[start:start+length]."""
    return sum(st.get("d", 0.0) for st in steps[start : start + length])


def pick_dominant(
    groups: list[dict],
    steps: list[dict],
    *,
    max_dur: float = 20.0,
    phrase_min_len: int = 8,
) -> dict | None:
    """Pick the single repeated block that best defines the piece's phrases.

    A candidate must be at least `phrase_min_len` tokens long (a phrase, not a
    micro-motif) and have at least one occurrence whose span duration fits
    within `max_dur` (so each occurrence is itself a learnable chunk). Among
    candidates, the strongest wins: highest `len * occurrence_count`, ties to
    the longer pattern. Returns the group dict, or None when nothing qualifies
    (caller falls back to rest-based splitting).
    """
    best = None
    for g in groups:
        L = len(g["pattern"])
        if L < phrase_min_len:
            continue
        if not any(
            p + L <= len(steps) and _span_duration(steps, p, L) <= max_dur
            for p in g["positions"]
        ):
            continue
        score = (L * len(g["positions"]), L)
        if best is None or score > best[0]:
            best = (score, g)
    return best[1] if best else None


def occurrence_spans(
    groups: list[dict], steps: list[dict], *, max_dur: float = 20.0
) -> list[tuple[int, int]]:
    """Return non-overlapping occurrence spans of the dominant phrase.

    Spans are (start, end) inclusive step indices, greedy non-overlapping so
    each phrase occurrence becomes exactly one chunk. Occurrences are sorted;
    a later occurrence that overlaps the previous span is skipped (shifted
    variant of the same phrase).
    """
    dom = pick_dominant(groups, steps, max_dur=max_dur)
    if dom is None:
        return []
    L = len(dom["pattern"])
    spans: list[tuple[int, int]] = []
    for p in sorted(dom["positions"]):
        if p + L > len(steps):
            break
        if spans and p <= spans[-1][1]:
            continue
        spans.append((p, p + L - 1))
    return spans
```

- [x] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py -v`
Expected: PASS (all merge/pick/spans tests plus existing).

- [x] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): merge near-repeats and pick the dominant phrase"
```

---

### Task 4: Partition steps into exactly-tiling chunks with fallback

**Files:**
- Modify: `tools/midi2kora.py` (add `_interval_duration` + `_split_range` + `partition_chunks` after `occurrence_spans`)
- Test: `tools/test_midi2kora.py` (append)

**Interfaces:**
- Consumes: `occurrence_spans` (Task 3)
- Produces: `partition_chunks(steps, groups, *, max_dur=20.0, min_dur=8.0) -> list[tuple[tuple[int, int], bool]]` — list of `((start, end), is_repeat)` where `start`/`end` are inclusive step indices and `is_repeat` True when the chunk came from the dominant phrase occurrence span.

- [x] **Step 1: Write the failing tests**

Append to `tools/test_midi2kora.py`:

```python
def test_partition_tiles_whole_piece():
    # Patterns must be >= phrase_min_len=8 tokens to qualify as a dominant
    # phrase (see pick_dominant). Verified: spans (5,12),(20,27); gap (13,19)
    # of 7s < min_dur merges into the first repeat -> (5,19); the 12s gap
    # (28,39) does not merge.
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1"), "positions": [5, 20]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    prev_end = -1
    for (s, e), _ in out:
        assert s == prev_end + 1
        prev_end = e
    assert prev_end == len(steps) - 1
    assert out[0][0][0] == 0
    assert out[-1][0][1] == len(steps) - 1
    assert out == [((0, 4), False), ((5, 19), True), ((20, 27), True), ((28, 39), False)]


def test_partition_fallback_subdivides_long_leftover():
    # 50s of continuous notes with no repeats: must split at largest gaps, all <= max_dur
    steps = [{"d": 10.0, "string": "L1"}] * 5  # 50s, gaps all equal
    out = m.partition_chunks(steps, [], max_dur=20.0, min_dur=8.0)
    for (s, e), is_rep in out:
        assert is_rep is False
        dur = sum(st["d"] for st in steps[s : e + 1])
        assert dur <= 20.0
    # largest-gap-first cascade: 10, 10, 10, 20 seconds
    assert [e - s + 1 for (s, e), _ in out] == [1, 1, 1, 2]


def test_partition_repeat_chunk_stays_whole():
    # a detected repeat span is kept as a single True chunk, and does not get
    # merged into the (>= min_dur) gap that follows it
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1"), "positions": [0, 20]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    assert out[0] == ((0, 7), True)  # first occurrence whole
    assert out[2] == ((20, 27), True)  # second occurrence whole


def test_partition_merges_tiny_gap_forward():
    # two repeat spans one step apart: the 1s gap (13,13) is smaller than
    # min_dur=8 and the merge stays <= max_dur, so it is absorbed into the
    # first repeat chunk
    steps = [{"d": 1.0, "string": "L1"}] * 40
    groups = [{"pattern": ("U1", "D1", "U1", "D1", "U1", "D1", "U1", "D1"), "positions": [5, 14]}]
    out = m.partition_chunks(steps, groups, max_dur=20.0, min_dur=8.0)
    assert out == [((0, 4), False), ((5, 13), True), ((14, 21), True), ((22, 39), False)]

- [x] **Step 2: Run tests to verify they fail**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py::test_partition_tiles_whole_piece -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'partition_chunks'`.

- [x] **Step 3: Write minimal implementation**

Add after `occurrence_spans`:

```python
def _interval_duration(steps: list[dict], s: int, e: int) -> float:
    """Total duration of steps[s:e] (half-open)."""
    return sum(st.get("d", 0.0) for st in steps[s:e])


def _split_range(steps: list[dict], s: int, e: int, max_dur: float) -> list[tuple[int, int]]:
    """Split inclusive range [s,e] at the largest internal rests until every
    piece is <= max_dur. Returns inclusive (start, end) pairs."""
    if s > e:
        return []
    if _interval_duration(steps, s, e + 1) <= max_dur:
        return [(s, e)]
    segs = [(s, e)]
    while True:
        done = True
        for i, (a, b) in enumerate(segs):
            if _interval_duration(steps, a, b + 1) <= max_dur:
                continue
            done = False
            best = max(range(a, b), key=lambda k: steps[k].get("d", 0.0))
            segs[i : i + 1] = [(a, best), (best + 1, b)]
            break
        if done:
            break
    return segs


def partition_chunks(
    steps: list[dict],
    groups: list[dict],
    *,
    max_dur: float = 20.0,
    min_dur: float = 8.0,
) -> list[tuple[tuple[int, int], bool]]:
    """Partition steps into contiguous, exactly-tiling chunks.

    Chunks are the occurrence spans of the dominant repeated phrase (each
    occurrence one chunk, labeled is_repeat=True, kept whole — the point of
    practice) interleaved with the leftover gaps. Gaps longer than max_dur are
    subdivided by `_split_range` at the largest internal rests; gaps shorter
    than min_dur are merged forward into the previous chunk while the merged
    duration stays <= max_dur. With no qualifying phrase, the whole piece is
    simply split by `_split_range`. The result always exactly tiles and covers
    every step.
    """
    n = len(steps)
    spans = [(s, e) for s, e in occurrence_spans(groups, steps, max_dur=max_dur)]
    if not spans:
        return [((a, b), False) for a, b in _split_range(steps, 0, n - 1, max_dur)]

    out: list[tuple[tuple[int, int], bool]] = []
    prev = 0
    for s, e in spans:
        if s > prev:
            out.append(((prev, s - 1), False))
        out.append(((s, e), True))
        prev = e + 1
    if prev < n:
        out.append(((prev, n - 1), False))

    final: list[tuple[tuple[int, int], bool]] = []
    for (s, e), is_repeat in out:
        if is_repeat or _interval_duration(steps, s, e + 1) <= max_dur:
            final.append(((s, e), is_repeat))
        else:
            for a, b in _split_range(steps, s, e, max_dur):
                final.append(((a, b), False))

    merged: list[tuple[tuple[int, int], bool]] = []
    for (s, e), is_repeat in final:
        if (
            merged
            and _interval_duration(steps, merged[-1][0][0], e + 1) <= max_dur
            and _interval_duration(steps, s, e + 1) < min_dur
        ):
            ms, me = merged[-1][0]
            merged[-1] = ((ms, e), merged[-1][1])
        else:
            merged.append(((s, e), is_repeat))
    return merged
```

- [x] **Step 4: Run tests to verify they pass**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py -v`
Expected: PASS (all 4 partition tests, plus existing).

- [x] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py
git commit -m "feat(midi2kora): partition steps into exactly-tiling chunks with size fallback"
```

---

### Task 5: Wire chunking into `main()` + CLI + stderr report

**Files:**
- Modify: `tools/midi2kora.py` (argparse args; call chunking before YAML assembly; emit `chunks`; invariant assert; stderr report)
- Modify: `tools/test_midi2kora.py` (append integration test)
- Test: CLI smoke against `test-data/mad-world.midi`
- Docs: `README.md` (options table + Chunking paragraph)

**Interfaces:**
- Consumes: `tokenize_steps`, `find_repeated_blocks`, `significant_repeats`, `merge_near_repeats`, `partition_chunks` (Tasks 1–4)
- Produces: new CLI flags `--no-chunks`, `--max-chunk-size`, `--min-chunk-size`, `--min-repeat-len`, `--min-repeat-occ`; YAML gains top-level `chunks` unless disabled.
- Note: `main()` imports `tokenize_steps` etc. at call time, and the script now imports `rapidfuzz` at module load — **add `"rapidfuzz"` to the PEP 723 `# dependencies = [...]` header** (currently `mido`, `pyyaml`) so a plain `uv run tools/midi2kora.py` resolves it without `--with rapidfuzz`.

- [x] **Step 1: Write the failing test**

Append to `tools/test_midi2kora.py`:

```python
def test_chunk_invariants_across_range():
    """Property-style: for varied random-ish step sequences the chunk plumbing
    always produces an exact tiling with in-range windows."""
    import random
    rng = random.Random(42)
    strings = ["L1", "L5", "R3", "R7", "L9"]
    steps = []
    prev = None
    for i in range(120):
        s = rng.choice(strings)
        # bias toward repeating the previous string to create runs
        if prev is not None and rng.random() < 0.5:
            s = prev
        prev = s
        steps.append({"d": round(rng.uniform(0.3, 1.2), 3), "string": s})
    tokens = m.tokenize_steps(steps)
    hits = m.find_repeated_blocks(tokens)
    sig = m.significant_repeats(hits)
    groups = m.merge_near_repeats(sig)
    out = m.partition_chunks(steps, groups)
    assert out, "must always produce at least one chunk"
    prev_end = -1
    for (s, e), _ in out:
        assert s == prev_end + 1 and 0 <= s <= e < len(steps)
        prev_end = e
    assert prev_end == len(steps) - 1
```

- [x] **Step 2: Run test to verify it fails**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/test_midi2kora.py::test_chunk_invariants_across_range -v`
Expected: FAIL — `AttributeError: module 'midi2kora' has no attribute 'tokenize_steps'` or a later plumbing attribute; this is the integration test that lands with Task 5's wiring (the helpers exist from Tasks 1–4, so it should PASS once main() plumbing exists — run it again after Step 3).

- [x] **Step 3: Wire chunking into `main()`**

In `main()`, extend the argument parser (after the existing `--drop-unplayable` arg):

```python
    parser.add_argument("--no-chunks", action="store_true",
                        help="Disable automatic chunking (emit no `chunks` field)")
    parser.add_argument("--max-chunk-size", type=float, default=20.0,
                        help="Upper bound on fallback chunk duration in seconds (default 20)")
    parser.add_argument("--min-chunk-size", type=float, default=8.0,
                        help="Lower bound hint for fallback chunk duration in seconds (default 8)")
    parser.add_argument("--min-repeat-len", type=int, default=3,
                        help="Minimum repeated-block length in steps counting as evidence (default 3)")
    parser.add_argument("--min-repeat-occ", type=int, default=2,
                        help="Minimum occurrences for a repeated block to count (default 2)")
```

Before the `piece = { ... }` assembly block, insert the chunking pipeline (after the `steps` loop, before `piece`):

```python
    # --- Chunking ---
    if args.no_chunks:
        chunk_list: list[dict] = []
    else:
        tokens = tokenize_steps(steps)
        hits = find_repeated_blocks(tokens, min_len=args.min_repeat_len, min_occ=args.min_repeat_occ)
        sig = significant_repeats(hits)
        groups = merge_near_repeats(sig)
        chunked = partition_chunks(steps, groups, max_dur=args.max_chunk_size, min_dur=args.min_chunk_size)

        # Hard invariant: exact tiling, in-range windows (a tokenization guarantee)
        prev_end = -1
        for (s, e), _ in chunked:
            assert 0 <= s <= e < len(steps)
            assert s == prev_end + 1
            prev_end = e
        assert prev_end == len(steps) - 1

        chunk_list = [
            {"name": f"Chunk {i + 1}", "start": s, "end": e}
            for i, ((s, e), _) in enumerate(chunked)
        ]
        n_repeat = sum(1 for _, is_rep in chunked if is_rep)
        n_fallback = len(chunked) - n_repeat
        import sys
        print(f"Chunked into {len(chunked)} parts ({n_repeat} repeat-derived chunks, {n_fallback} fallback chunks)", file=sys.stderr)
```

Then add `chunks` to the piece dict (after `"arrangements"`):

```python
    piece = {
        "title": args.title,
        "tuning": "silaba",
        "tags": ["cover"],
        "arrangements": [{"name": "Full", "steps": steps}],
    }
    if chunk_list:
        piece["chunks"] = chunk_list
```

- [x] **Step 4: Run the full Python suite + CLI smoke**

Run: `uv run --with pytest --with mido --with pyyaml --with rapidfuzz pytest tools/ -v`
Expected: PASS (all tests).

Run the smoke check on the real piece:

```bash
uv run tools/midi2kora.py test-data/mad-world.midi --transpose auto --tempo 100 --title "Mad World" --drop-unplayable -o /tmp/mad-world-chunked.yaml
```

Expected: stderr prints a `Chunked into N parts (...)` line. Then sanity-check:

```bash
python3 -c "
import yaml
d = yaml.safe_load(open('/tmp/mad-world-chunked.yaml'))
full = d['arrangements'][0]['steps']
chunks = d['chunks']
n = len(full)
prev = -1
for c in chunks:
    assert 0 <= c['start'] <= c['end'] < n, c
    assert c['start'] == prev + 1, c
    prev = c['end']
assert prev == n - 1
print('chunks:', len(chunks), 'steps:', n, 'coverage OK')
print('names sample:', [c['name'] for c in chunks[:5]])
"
```

Expected: prints `chunks: N steps: 447 coverage OK`. From the planning prototype + verification pass, `mad-world.midi` (auto-transpose +2) has a dominant length-29 phrase recurring 7× at ~29-step spacing, so expect **N = 12** (7 repeat-derived, 5 fallback) with the repeat chunks being exactly the verse-sized windows (e.g. Chunk 2 = steps 25–53) and all durations in the 7–20s range. Manual inspection: verify chunks align with the phrase starts [25, 54, 83, 112, 226, 255, 284] rather than mid-phrase. Delete `/tmp/mad-world-chunked.yaml` when done.

Also update `README.md`: add the five options to the options table in the "MIDI to kora" section (`--no-chunks`, `--max-chunk-size`, `--min-chunk-size`, `--min-repeat-len`, `--min-repeat-occ`), and add a short "**Chunking (automatic).**" paragraph after the existing **Playability reduction** paragraph describing: generated pieces get a `chunks` field; each repeated phrase occurrence is its own chunk; fallback splits non-repeating regions at rest gaps targeting `--max-chunk-size`; chunks are windows (start/end indices) into the `Full` arrangement; hand-written YAML may omit `chunks` for a single full piece.

- [x] **Step 5: Commit**

```bash
git add tools/midi2kora.py tools/test_midi2kora.py README.md
git commit -m "feat(midi2kora): emit chunk windows with CLI tuning and stderr report"
```

---

### Task 6: Schema + build-time validation for `chunks`

**Files:**
- Modify: `src/content.config.ts` (add `chunkSchema`, `chunks` field)
- Modify: `src/lib/piece.ts` (add `Chunk` interface + `assertChunksValid`)
- Modify: `src/pages/pieces/[slug].astro` (`getStaticPaths` calls `assertChunksValid`)
- Test: `src/lib/piece.test.ts` (append)

**Interfaces:**
- Consumes: none from earlier tasks (independent of Python)
- Produces: `Chunk { name: string; start: number; end: number }`; `assertChunksValid(chunks: Chunk[] | undefined, fullSteps: Step[], pieceId: string): void` — throws `Error` on out-of-range or missing `Full`.

- [x] **Step 1: Write the failing test**

Append to `src/lib/piece.test.ts`:

```ts
import { getStepStrings, assertChunksValid, type Chunk } from './piece';

describe('assertChunksValid', () => {
  const full: Chunk[] = [{ name: 'A', start: 0, end: 9 }];
  const steps = Array.from({ length: 10 }, () => ({ d: 0.5, string: 'L1' }));

  it('passes for empty/absent chunks', () => {
    expect(() => assertChunksValid(undefined, steps, 'p')).not.toThrow();
    expect(() => assertChunksValid([], steps, 'p')).not.toThrow();
  });

  it('passes for valid in-range chunks', () => {
    expect(() => assertChunksValid(full, steps, 'p')).not.toThrow();
  });

  it('throws when end >= full steps length', () => {
    const bad: Chunk[] = [{ name: 'A', start: 0, end: 10 }];
    expect(() => assertChunksValid(bad, steps, 'p')).toThrow(/out of bounds/);
  });

  it('throws when start > end', () => {
    const bad: Chunk[] = [{ name: 'A', start: 5, end: 4 }];
    expect(() => assertChunksValid(bad, steps, 'p')).toThrow(/out of bounds/);
  });
});
```

(Adjust the existing imports at the top of `piece.test.ts` to include the new imports.)

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/piece.test.ts`
Expected: FAIL — `assertChunksValid is not a function`.

- [x] **Step 3: Write minimal implementation**

In `src/lib/piece.ts`, after the `Step` interface:

```ts
export interface Chunk {
  name: string;
  start: number;
  end: number;
}

export function assertChunksValid(
  chunks: Chunk[] | undefined,
  fullSteps: Step[],
  pieceId: string,
): void {
  if (!chunks || chunks.length === 0) return;
  const n = fullSteps.length;
  for (const c of chunks) {
    if (c.start < 0 || c.end >= n || c.start > c.end) {
      throw new Error(
        `Piece "${pieceId}" chunk "${c.name}" range [${c.start}, ${c.end}] out of bounds (Full has ${n} steps)`,
      );
    }
  }
}
```

In `src/content.config.ts`, add the chunk schema after `stepSchema`:

```ts
const chunkSchema = z.object({
  name: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).refine((c) => c.start <= c.end, {
  message: 'chunk start must be <= end',
});
```

and add `chunks: z.array(chunkSchema).optional(),` to the `pieces` collection schema (after `arrangements`).

In `src/pages/pieces/[slug].astro`, import and call it in `getStaticPaths`:

```ts
import { assertChunksValid } from '../../lib/piece';

export async function getStaticPaths() {
  const pieces = (await getCollection('pieces')).filter((p) => !p.data.draft);
  for (const p of pieces) {
    assertChunksValid(p.data.chunks, p.data.arrangements.find(a => a.name === 'Full')?.steps ?? [], p.id);
  }
  return pieces.map((piece) => ({
    params: { slug: piece.id },
    props: { piece },
  }));
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/piece.test.ts`
Expected: PASS (all tests, including the new describe block).

- [x] **Step 5: Commit**

```bash
git add src/content.config.ts src/lib/piece.ts src/lib/piece.test.ts src/pages/pieces/[slug].astro
git commit -m "feat(site): add chunks schema and build-time validation"
```

---

### Task 7: Region helpers in player-logic

**Files:**
- Modify: `src/lib/player-logic.ts` (add `Region`, `regionFromChunk`, `chunkSteps`)
- Test: `src/lib/player-logic.test.ts` (append)

**Interfaces:**
- Consumes: `getTotalDuration` (already in file); `Chunk` type from `src/lib/piece.ts`
- Produces: `interface Region { start: number; end: number }`; `regionFromChunk(chunks: Chunk[], index: number, fullSteps: Step[]): Region | null`; `chunkSteps(fullSteps: Step[], region: Region | null): Step[]`

- [x] **Step 1: Write the failing test**

Append to `src/lib/player-logic.test.ts`:

```ts
import { getTotalDuration, getMidiNotes, computeOnsets, regionFromChunk, chunkSteps, type Region } from './player-logic';
```

Add:

```ts
describe('regionFromChunk', () => {
  const steps = Array.from({ length: 30 }, () => ({ d: 1, string: 'L1' }));
  // chunks array holds only real chunks; index 0 of the selector is the
  // virtual "All" option (regionFromChunk returns null for it).
  const chunks = [
    { name: 'A', start: 0, end: 9 },
    { name: 'B', start: 10, end: 19 },
    { name: 'C', start: 20, end: 29 },
  ];

  it('returns null for All (index 0)', () => {
    expect(regionFromChunk(chunks, 0, steps)).toBeNull();
  });

  it('returns the window for a chunk', () => {
    const r = regionFromChunk(chunks, 1, steps);
    expect(r).toEqual({ start: 0, end: 9 });
  });

  it('clamps an out-of-range chunk to valid bounds', () => {
    const bad = [{ name: 'X', start: 5, end: 999 }];
    const r = regionFromChunk(bad, 1, steps);
    expect(r).toEqual({ start: 5, end: 29 });
  });
});

describe('chunkSteps', () => {
  const steps = Array.from({ length: 30 }, (_, i) => ({ d: 1, string: `L${(i % 11) + 1}` }));

  it('returns all steps for a null region', () => {
    expect(chunkSteps(steps, null)).toHaveLength(30);
  });

  it('returns only the window for a region', () => {
    const r: Region = { start: 10, end: 19 };
    const out = chunkSteps(steps, r);
    expect(out).toHaveLength(10);
    expect(out[0].string).toBe('L11'); // index 10 -> (10 % 11) + 1 = 11
  });

  it('empty region (start > end) yields empty steps', () => {
    expect(chunkSteps(steps, { start: 5, end: 4 })).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/player-logic.test.ts`
Expected: FAIL — `regionFromChunk is not a function`.

- [x] **Step 3: Write minimal implementation**

In `src/lib/player-logic.ts`, add the import and functions:

```ts
import { type Step, type Chunk } from './piece';
```

```ts
export interface Region {
  start: number;
  end: number;
}

export function regionFromChunk(
  chunks: Chunk[],
  index: number,
  fullSteps: Step[],
): Region | null {
  // index 0 is the "All" option
  if (!chunks || index === 0 || index > chunks.length) return null;
  const chunk = chunks[index - 1];
  const n = fullSteps.length;
  const start = Math.max(0, Math.min(chunk.start, n - 1));
  const end = Math.max(0, Math.min(chunk.end, n - 1));
  if (start > end) return null;
  return { start, end };
}

export function chunkSteps(fullSteps: Step[], region: Region | null): Step[] {
  if (!region) return fullSteps;
  if (region.start > region.end) return [];
  return fullSteps.slice(region.start, region.end + 1);
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/lib/player-logic.test.ts`
Expected: PASS (all tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/player-logic.ts src/lib/player-logic.test.ts
git commit -m "feat(player): add chunk region helpers"
```

---

### Task 8: Player chunk selector + region-aware playback + lookahead narrowing

**Files:**
- Modify: `src/components/Player.tsx` (region state, scheduler region, chunk select)
- Modify: `src/components/Lookahead.astro` (hide items outside region on `player-region` event)
- Modify: `src/pages/pieces/[slug].astro` (pass `chunks` to `Player`)
- Verify: `npm run dev` manual check with a chunked temporary piece

**Interfaces:**
- Consumes: `regionFromChunk`, `chunkSteps`, `Region` from `src/lib/player-logic.ts` (Task 7); `type Chunk` from `src/lib/piece.ts`
- Dispatches: `player-region` CustomEvent with `detail: { start: number | null, end: number | null }` (null = All)

- [x] **Step 1: Add region state + scheduler region support**

In `Player.tsx`:

- Add `chunks` to `Props`:

```ts
interface Props {
  arrangements: Arrangement[];
  tuning: Record<string, { midi: number }>;
  chunks?: Chunk[];
}
```

- Import the new helpers at the top (extend existing `player-logic` import):

```ts
import { getTotalDuration, getMidiNotes, computeOnsets, regionFromChunk, chunkSteps, type Region } from '../lib/player-logic';
import { getStepStrings, type Step, type Chunk } from '../lib/piece';
```

- Add state + mirror refs inside `PlayerInner` (near `looping`):

```ts
const [region, setRegion] = useState<Region | null>(null);
const regionRef = useRef<Region | null>(null);
useEffect(() => { regionRef.current = region; }, [region]);
```

- Add an `onRegionChange` callback that dispatches the event (place near `handleLoopChange`):

```ts
const handleRegionChange = useCallback((r: Region | null) => {
  setRegion(r);
  document.dispatchEvent(new CustomEvent('player-region', {
    detail: { start: r ? r.start : null, end: r ? r.end : null },
  }));
}, []);
```

- Rework `startScheduler` to accept a region and schedule only its window, with **absolute indices** for lookahead alignment. Replace the body of `schedule()` and the surrounding logic:

```ts
const startScheduler = useCallback((steps: Step[], region: Region | null) => {
    const ctx = getAudioContext();
    const segSteps = chunkSteps(steps, region);
    const startOffset = region ? region.start : 0;

    function schedule() {
      const speed = tempoPercentRef.current;
      const scale = 100 / speed;
      const onsets = computeOnsets(segSteps, speed);
      const totalDuration = getTotalDuration(segSteps, speed);

      while (nextIndexRef.current < segSteps.length) {
        const loopStart = startTimeRef.current + loopCountRef.current * totalDuration;
        const relOnset = onsets[nextIndexRef.current];
        const onset = loopStart + relOnset;
        if (onset > ctx.currentTime + LOOKAHEAD) break;

        const step = segSteps[nextIndexRef.current];
        const strings = getStepStrings(step);
        if (strings.length > 0) {
          const midiNotes = getMidiNotes(strings, tuning);
          for (const note of midiNotes) {
            superdough({ s: 'folkharp', note }, onset, step.d * scale);
          }
        }
        noteQueueRef.current.push({ index: startOffset + nextIndexRef.current, strings, time: onset });
        nextIndexRef.current++;
      }

      if (nextIndexRef.current >= segSteps.length) {
        if (loopingRef.current) {
          loopCountRef.current++;
          nextIndexRef.current = 0;
        } else {
          const loopStart = startTimeRef.current + loopCountRef.current * totalDuration;
          const lastOnset = loopStart + onsets[segSteps.length - 1];
          const lastDur = segSteps[segSteps.length - 1].d * scale;
          const delay = (lastOnset + lastDur - ctx.currentTime) * 1000 + 100;
          if (delay > 0) {
            stopTimerRef.current = window.setTimeout(() => { stopPlayback(); }, delay);
          }
          return;
        }
      }

      schedulerRef.current = window.setTimeout(schedule, INTERVAL);
    }

    schedule();
    rafRef.current = requestAnimationFrame(drawLoop);
  }, [tuning, drawLoop, stopPlayback]);
```

- Update the **`buildAndPlay`** and **`resume`** bodies to play the `Full`
  arrangement's window when a chunk region is active (chunks index into
  `Full.steps`, not the currently-selected arrangement):

In `buildAndPlay`, replace the `const steps = arrangements[arrangementIndex].steps;` line with:

```ts
const fullSteps = arrangements.find(a => a.name === 'Full')?.steps ?? arrangements[0].steps;
const steps = regionRef.current ? fullSteps : arrangements[arrangementIndex].steps;
...
startScheduler(steps, regionRef.current);
```

In `resume`, replace `startScheduler(arrangements[arrangementIndex].steps)` with:

```ts
const fullSteps = arrangements.find(a => a.name === 'Full')?.steps ?? arrangements[0].steps;
const steps = regionRef.current ? fullSteps : arrangements[arrangementIndex].steps;
startScheduler(steps, regionRef.current);
```

- [x] **Step 2: Add the chunk selector UI + wiring**

Before the `return` statement, compute the currently-selected chunk index (0 = All) and a `fullSteps` reference (chunks always index into the `Full` arrangement):

```tsx
const fullSteps = arrangements.find(a => a.name === 'Full')?.steps ?? arrangements[0].steps;
let selectedIdx = 0;
if (region) {
  const i = chunks.findIndex(c => c.start === region.start && c.end === region.end);
  selectedIdx = i >= 0 ? i + 1 : 0;
}
```

In the returned JSX, after the Loop checkbox and before the Speed label, add (guarded so no chunks → no control):

```tsx
{chunks && chunks.length > 0 && (
  <label>
    Chunk:{' '}
    <select
      value={String(selectedIdx)}
      onChange={e => {
        const idx = Number(e.target.value);
        stopPlayback();
        handleRegionChange(regionFromChunk(chunks, idx, fullSteps));
      }}
    >
      <option value="0">All</option>
      {chunks.map((c, i) => (
        <option key={i} value={i + 1} title={`steps ${c.start}–${c.end}`}>{c.name}</option>
      ))}
    </select>
  </label>
)}
```

- [x] **Step 3: Narrow the lookahead to the region**

In `src/components/Lookahead.astro` script, add a region variable and update the
`updateVisibility` function so it never un-hides (or hides) items outside the
active chunk region:

```ts
let region: { start: number | null; end: number | null } | null = null;

function updateVisibility(currentIndex: number) {
  const track = document.querySelector('.lookahead-track[data-active="true"]');
  if (!track) return;
  const items = track.querySelectorAll('.lookahead-item');
  const start = Math.max(currentIndex, 0);

  items.forEach((item, i) => {
    const el = item as HTMLElement;
    const inside = region === null || region.start === null || (i >= region.start && i <= region.end);
    el.classList.toggle('current', inside && i === currentIndex);
    if (!inside) return;                    // keep outside-region items hidden, leave them alone
    if (i < currentIndex) {
      el.classList.add('hidden');
    } else if (i - start > 4) {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  });
}
```

Add a listener after the `player-arrangement` listener:

```ts
document.addEventListener('player-region', ((e: CustomEvent) => {
  region = e.detail;
  updateVisibility(-1);
}) as EventListener);
```

The `player-region` handler stores the region and re-applies visibility. When a
chunk is selected (`player-region` has non-null start), only that chunk's items
are shown; the existing `player-step` handler keeps following playback within
it. When `All` is selected (start null), behavior is exactly today's.

- [x] **Step 4: Wire `chunks` into the page**

In `src/pages/pieces/[slug].astro`, pass chunks to Player:

```tsx
<Player
  client:only="react"
  arrangements={arrangements}
  tuning={tuningData}
  chunks={piece.data.chunks}
/>
```

- [x] **Step 5: Verify with tests + manual dev run**

Run: `npm test`
Expected: PASS (all existing + new tests).

Generate a chunked piece with the generator (uses the Task 5 wiring):

```bash
uv run tools/midi2kora.py test-data/mad-world.midi --transpose auto --tempo 100 --title "Mad World Chunked" --drop-unplayable -o src/content/pieces/mad-world-chunked.yaml
npm run dev
```

Manual check (http://localhost:4321/pieces/mad-world-chunked/): the player shows a `Chunk` select with `All` + `Chunk 1..N`; selecting a chunk plays only that window; Loop loops just that chunk; lookahead shows only that chunk's steps; `All` plays the full piece; selecting `All`/switching chunks stops playback. Then remove the temporary piece and the temp file:

```bash
rm src/content/pieces/mad-world-chunked.yaml
# confirm the site still builds without chunks
npm run build
```

Expected: build succeeds with the committed pieces.

- [x] **Step 6: Commit**

```bash
git add src/components/Player.tsx src/components/Lookahead.astro src/pages/pieces/[slug].astro
git commit -m "feat(player): chunk selector with region-aware looping and narrowed lookahead"
```

---

## Notes for the implementer

- Run every command from the repo root (`/home/devlin/dev/personal/kumbengo-lab`).
- The `--with mido --with pyyaml --with rapidfuzz` flags are required because
  `tools/midi2kora.py` imports those at module load; the tests import the
  module by path.
- Do not regenerate the committed `src/content/pieces/mad-world.yaml` as part
  of this work — regenerating committed piece content is a separate decision
  for the user. The smoke checks write to `/tmp` or a temporary
  `mad-world-chunked.yaml` that gets deleted.
- Threshold defaults (max chunk 20s, min 8s, rest floor 0.5s, min repeat len 3,
  min occurrences 2, max_edits 1) are grounded against `mad-world.midi`
  (median gap 0.3s → floor wins; length-24 repeats at ~29-step spacing) and
  are all CLI-tunable per the spec.
- If `mad-world.midi` output lands outside the expected 8–20 chunks, prefer
  tuning `--min-repeat-len`/`--max-chunk-size` in the smoke command over
  editing the algorithm; if a real piece genuinely needs different defaults,
  raise it rather than silently changing Global Constraints.