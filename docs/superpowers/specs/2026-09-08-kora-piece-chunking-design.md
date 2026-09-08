# Kora Piece Chunking — Design

Date: 2026-09-08
Status: Draft (pending user review)

## Problem

Long generated transcriptions (e.g. `mad-world.yaml`, 447 steps / ~3 min) are a
wall of notes to learn from. Learners benefit from small, loopable chunks that
follow the piece's own repeated structure — learn chunk 3, then chunk 4, then
play 3+4 together. The split should happen automatically at generation time in
`tools/midi2kora.py`, and the resulting chunks should be musically sensible:
they should correspond to the piece's repeated phrases, not arbitrary page
breaks.

## Design summary

- **Data model:** a chunk is a *contiguous window* (`start`/`end` step indices,
  inclusive) into the single canonical `Full` arrangement. Chunks are emitted
  as an optional top-level `chunks` field in the piece YAML.
- **Generator:** `midi2kora.py` always emits `chunks` — repeat-guided where
  repeats are found, falling back to rest-based splits at a target size. Each
  occurrence of a repeated phrase becomes its own chunk (duplicates kept), per
  the user's future "combine adjacent chunks" plan.
- **Frontend:** when `chunks` is present, the player shows a chunk selector;
  selecting a chunk loops only that window (using the existing Loop checkbox).
  When `chunks` is absent (hand-written YAML), the UI is exactly today's
  single full piece — no default splitting.
- **Reuse:** maintained libraries for the standard hard sub-problems
  (`rapidfuzz`/`Levenshtein` for approximate matching, `pyahocorasick` for
  candidate enumeration); our own code stays a thin, tested *decision layer*
  over them, because boundary choice + rest-anchoring is product logic, not a
  solved packaged problem. `music21` is optional and verified during planning.

## Data model

A chunk is a window into the `Full` arrangement:

```yaml
arrangements:
  - name: Full
    steps: [...]          # canonical, stored once

chunks:
  - { name: Intro,   start: 0,  end: 23 }
  - { name: Verse A, start: 24, end: 52 }
  - { name: Verse A, start: 53, end: 81 }   # 2nd occurrence, same name
  - ...
```

- `start`/`end` are inclusive step indices into `Full.steps`.
- Each occurrence of a repeated phrase is its own chunk (duplicates kept).
- Names are generic (`Chunk 1`, `Chunk 2`, …) at generation time; the user
  renames in YAML. The generator does not attempt musical section names — that
  is a human labeling task.
- Adjacency (for the future "combine chunks" capability) is implicit in the
  indices — `steps[start₃:end₄]` plays chunks 3+4 together. No extra metadata.
- `chunks` is optional; absence means a single full piece in the UI.

## Generator algorithm

Inputs per step: `d` (duration) and `strings` (pitch content). These are the
only musical signals available. The algorithm runs after existing
transpose/fold/drop/playability steps, just before YAML emission.

### Stage 1 — Tokenize

Map each step to a transposition-invariant token: `(interval-to-previous-pitch,
quantized-duration)`. This is the standard SIA encoding — matching on
shape/interval rather than absolute pitch — and duration-quantization absorbs
small timing drift between repeats. The first step has no previous pitch; its
interval token uses the piece's lowest pitch as an implicit baseline (a
constant, so it does not confer transposition sensitivity).

### Stage 2 — Find repeated windows

- Enumerate candidate repeated substrings over the token sequence using
  `pyahocorasick` (instant at n≈450).
- Merge near-repeats with a *bounded* edit-distance pass (`rapidfuzz` /
  `Levenshtein`, the Mongeau–Sankoff trick) so ornaments/small timing drift
  don't break detection.
- Candidate boundaries are the cuts between repeated blocks. Prefer boundaries
  that also coincide with a rest gap (≥ ~1.5× median inter-onset gap, floor
  ~0.5s) — the rest-anchor behavior.

### Stage 3 — Emit chunks + fallback

- Walk the piece in order, emitting one chunk per detected boundary occurrence.
- Regions with no detected repeat get split at the largest internal gaps,
  targeting `--max-chunk-size` (default ~10–20s of music).
- If nothing meaningful repeats or segments, emit size-based splits over the
  whole piece. `chunks` is therefore **always present** in generated files.

**Partition model (worked example).** The sequence of detected repeat
occurrences partitions the piece in order: each occurrence is a chunk
(duplicates kept, so `Verse A` appears twice). Leftover regions between
occurrences — material that repeats insufficiently or not at all — are
subdivided by rest-based fallback splits, so the whole piece tiles exactly.

```
steps:   [1 .. 100]
repeats: A@24-52, A@53-81, B@90-100
chunks:  [Intro 0-23] [A 24-52] [A 53-81] [rest-split 82-89] [B 90-100]
```

Here `0-23` and `82-89` may themselves be merged or split further as the
repeated/rest signals dictate; the invariant is exact tiling (`chunks` cover
`0..100` with no gap/overlap).

### Thresholds & CLI

All thresholds are CLI flags (tunable, no magic numbers):
`--max-chunk-size`, `--min-chunk-size`, `--rest-threshold`, and thresholds for
minimum repeated-block length / required occurrence count. Agreed defaults
(finalized against real pieces in `test-data/` during planning):

- Target chunk size: **10–20s of music** (`--max-chunk-size` upper bound;
  `--min-chunk-size` floor).
- Minimum repeated-block length that counts as evidence: **~3 steps**,
  recurring **≥ 2×**.
- Rest-gap threshold for a natural cut: **≥ ~1.5× the median inter-onset gap**,
  floor ~0.5s.

## Frontend

### Schema (`src/content.config.ts`)

Add an optional `chunks` field:

```ts
const chunkSchema = z.object({
  name: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).refine(c => c.start <= c.end);
```

### Content validation (`[slug].astro` `getStaticPaths`)

- Every chunk must satisfy `0 ≤ start ≤ end < Full.steps.length`.
- `chunks` present ⇒ a `Full` arrangement exists.
- Invalid data → **build error** (loud failure in CI), so hand-written YAML
  mistakes surface.

### Player loop-region

- Add a loop-region concept: `(start, end)` step indices into `Full.steps`.
  With no chunks, no region is set and behavior is today's full-piece loop.
- A `Chunk` select appears in the player bar when chunks exist: options `All`
  + each chunk (labeled by name). Selecting one stops playback and sets the
  region; `All` clears it.
- Loop checkbox loops just the region window; with Loop off, the chunk plays
  once and stops.
- The scheduler keeps absolute indices; the lookahead narrows to the chunk's
  steps by hiding items outside the region (reuses the `hidden` class — no
  per-chunk DOM rebuild).
- **This is the seam for the future enhancement:** "play chunks 3+4 together"
  is just changing the region to `steps[start₃..end₄]` — no new machinery.

### Out of scope (frontend)

- Per-chunk tablature/print (whole-piece printable view remains; per-chunk
  printing can be added cheaply if requested).
- Auto-numbering/renaming UI (rename happens in YAML).
- Combining chunks UI (future enhancement; the data model supports it).

## Error handling & quality gates

| Layer | Guarantee |
|---|---|
| Generator invariant | every emitted chunk `0 ≤ start ≤ end < len(Full.steps)`; chunks exactly tile `Full.steps` (each step in exactly one chunk, no gap/overlap). Asserted by the generator itself. |
| Generator stderr report | `Chunked into N parts (M repeat-derived chunks, K fallback chunks)` — M = chunks that come from a detected repeat occurrence, K = chunks finalized by rest/size fallback; M + K = N. |
| Schema | `chunks` optional; structure + `start ≤ end` validated by zod at build |
| Content validation | in-range + `Full` existence → **build error** if violated |
| Player runtime (defense-in-depth) | clamp `start`/`end` into `[0, len(steps)-1]`; empty region → treat as `All` |

## Reuse strategy (validated)

| Sub-problem | Library | Status |
|---|---|---|
| MIDI parsing | `mido` (already in script) | maintained |
| Approx. matching / edit distance | `rapidfuzz` or `Levenshtein` C ext | actively maintained |
| Candidate enumeration over token sequence | `pyahocorasick` | maintained |
| Optional symbolic modeling | `music21` | maintained but marginal fit — verify during planning, keep out unless it earns its place (YAGNI) |

Dependencies are declared in the PEP 723 `# dependencies = [...]` header of
`midi2kora.py` (uv-managed; no `pyproject.toml`, per repo convention).

Not adopted: SIA/SIATEC-family pattern discovery (only research code,
unmaintained), audio structure analysis (MSAF, audio features, section-level
granularity — wrong layer for symbolic chunking).

## Testing

- **Python (`tools/test_midi2kora.py`):** tokenization; repeated-substring
  detection on synthetic token sequences; near-repeat merge via bounded edit
  distance; rest-anchored boundary preference; fallback splitting; generator
  invariant (chunks tile exactly, all in-range); CLI smoke on `mad-world.midi`
  asserting `Chunk of N parts` stderr + valid output.
- **TypeScript (`src/lib/*.test.ts` + `player-logic.test.ts`):** schema
  accepts valid chunks / rejects out-of-range & `start > end`; content
  validation build-error path; player region behavior (region set → plays
  window; cleared → All; empty region → All); lookahead narrowing.
- **Real pieces:** plan-phase ground-truth pass against `mad-world.midi`,
  `uskudar-silaba`, etc. — the detector's thresholds are tuned to make real
  kora transcriptions chunk into learnable parts, not to look good in a
  vacuum.

## Out of scope

- Combining adjacent chunks UI (future enhancement; data model supports it).
- Per-chunk print/tablature.
- Musical section naming (generator emits `Chunk N`; user renames in YAML).
- Changing existing hand-written pieces (they render as single pieces today).
- Finger-travel / sequential playability modeling (from the playability design).