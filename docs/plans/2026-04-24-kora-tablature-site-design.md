# Kora Tablature & Player — Design

## Problem

The kora is traditionally learned mouth-to-mouth with no written notation. Beginners who own a kora have no standardized way to learn pieces independently. This project provides a piece-based library with printable tablature and an interactive audio player, all driven from a single data source.

## Audience

People who already own a kora and want to learn to play it.

## Approach

Tablature-first with embedded player. A single YAML data file per piece drives both the printable tablature view and the interactive audio player. Audio is synthesized client-side using superdough's folkharp samples — no media files to host. The site is fully static.

## Piece Data Model

Each piece is a YAML file in `src/content/pieces/`:

```yaml
title: Jarabi
slug: jarabi
difficulty: intermediate  # beginner | intermediate | advanced
tuning: silaba
tempo: 90  # BPM
tags: [traditional, mandinka]

layers:
  - name: Melody only
    difficulty: beginner
    steps:
      - { t: 0,   string: L4 }
      - { t: 0.5, string: R3 }
      - { t: 1,   string: L5 }
      - { t: 1.5, string: R4 }

  - name: Melody + bass
    difficulty: intermediate
    steps:
      - { t: 0,   strings: [L4, R1] }
      - { t: 0.5, string: R3 }
      - { t: 1,   strings: [L5, R2] }

  - name: Full kumbengo
    difficulty: intermediate
    steps:
      # full pattern
```

- Strings identified by position: L1–L11, R1–R10 (numbered from closest to player).
- Timing is beat-based (not absolute time), so tempo changes are trivial.
- Layers ordered from simplest to most complex. Each layer is a complete playable version.
- Each piece has an overall difficulty rating plus per-layer difficulty.

## Tuning Data

Predefined tunings in `src/data/tunings.yaml`. Silaba confirmed from the player's actual kora:

```yaml
silaba:
  name: Silaba (F major)
  strings:
    # Left hand (11 strings), closest to farthest from player
    L1:  { note: F2,  midi: 41 }
    L2:  { note: C3,  midi: 48 }
    L3:  { note: D3,  midi: 50 }
    L4:  { note: E3,  midi: 52 }
    L5:  { note: G3,  midi: 55 }
    L6:  { note: Bb3, midi: 58 }
    L7:  { note: D4,  midi: 62 }
    L8:  { note: F4,  midi: 65 }
    L9:  { note: A4,  midi: 69 }
    L10: { note: C5,  midi: 72 }
    L11: { note: E5,  midi: 76 }
    # Right hand (10 strings), closest to farthest from player
    R1:  { note: F3,  midi: 53 }
    R2:  { note: A3,  midi: 57 }
    R3:  { note: C4,  midi: 60 }
    R4:  { note: E4,  midi: 64 }
    R5:  { note: G4,  midi: 67 }
    R6:  { note: Bb4, midi: 70 }
    R7:  { note: D5,  midi: 74 }
    R8:  { note: F5,  midi: 77 }
    R9:  { note: G5,  midi: 79 }
    R10: { note: A5,  midi: 81 }
```

Adding a new tuning (e.g. sauta) is just adding another block. No tuning editor, no custom tunings — just a predefined set.

## Notation Display

User-selectable, stored in localStorage:

- **String position (auto-optimized)**: shows whichever direction (closest/farthest) gives the smaller number. Left hand has 11 strings: if position from closest > 6, show from farthest instead. Right hand has 10 strings: if position from closest > 5, show from farthest instead.
- **Note name**: shows the Western note name from the tuning lookup (e.g. "E3", "Bb4").

## Site Architecture

```
src/
  content/
    pieces/
      jarabi.yaml
      mali-sadio.yaml
      mad-world.yaml
  data/
    tunings.yaml
  components/
    TablatureView.astro   # printable tablature (static HTML/CSS)
    Player.tsx            # interactive player (Astro island, client-side JS)
    NotationToggle.tsx    # user preference: position vs note name
  pages/
    index.astro           # piece library with difficulty tags
    pieces/
      [slug].astro        # piece detail page (tablature + player)
  layouts/
    Base.astro
```

- Astro islands architecture: tablature is static HTML, player is a client-side interactive island that loads superdough only when needed.
- One page per piece, generated at build time from YAML files.
- Mobile-first CSS with print stylesheet for paper output.

## Interactive Player

### Audio Engine

`@strudel/webaudio` (superdough) with folkharp samples. AGPL-3.0 licensed — the project is open source under AGPL.

- Samples loaded lazily on first play tap.
- Each step triggers the sample at the correct pitch (MIDI note from tuning lookup).
- Simultaneous plucks triggered together.

### Controls

- Play/pause, tempo slider (50%–150% of original BPM).
- Layer selector (e.g. "Melody only" → "Full kumbengo").

### Visual Layout

**Top: Bridge diagram** — a static visual of the kora bridge (left strings on the left, right strings on the right). The string(s) to pluck right now light up. When nothing is active, all strings are dim. Primary "glance down, pluck" view.

**Bottom: Timeline strip** — a horizontal scrolling strip showing upcoming steps. Current step centered/highlighted, past steps fade left, future steps visible to the right. Each step shows string label(s) in the user's preferred notation.

Both views stay in sync with audio playback and respond to tempo changes.

## Print Mode

A "Print" button triggers `window.print()` with a clean print stylesheet. No player controls, no bridge diagram — just the sequential tablature for the selected layer. Fits on standard paper, readable at arm's length while playing.

## Error Handling

- Audio context blocked by browser autoplay policy: "Tap to enable audio" overlay (superdough's `initAudioOnFirstClick`).
- Invalid piece YAML: Astro build fails with a clear error (schema validation via content collections).
- No runtime errors beyond audio — the site is static HTML.

## Testing

- Unit tests for tuning data (MIDI mappings) and display-mode logic (auto-optimized position labels).
- Piece schema validation at build time.
- Manual testing on mobile + desktop for v1.

## Deployment

Astro on Cloudflare Pages, deployed from main branch on push. No environment variables, no secrets, no server-side anything.

## V1 Scope

- 3 pieces: Jarabi, Mali Sadio, Mad World (at least 2 layers each).
- Silaba tuning only.
- English only.
- Mobile-friendly, printable tablature.

## Out of Scope (for now)

- Multiple tunings in use (data model supports it, no pieces need it yet).
- Multilingual support.
- Web-based piece editor.
- Custom/user-defined tunings.
- Video recordings.
- Curriculum or lesson structure.
