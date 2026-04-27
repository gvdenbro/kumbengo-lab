# Kumbengo Lab

Learn the kora, one piece at a time. A static site for browsing kora pieces, viewing printable tablature, and playing back pieces interactively with a bridge diagram and lookahead display.

## Getting started

```bash
mise install   # install Node 22
npm install
npm run dev    # http://localhost:4321
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build static site to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Run tests |

## Adding a piece

Create a YAML file in `src/content/pieces/`. The filename becomes the URL slug (e.g., `my-piece.yaml` → `/pieces/my-piece/`).

```yaml
title: My Piece
difficulty: beginner    # beginner | intermediate | advanced
tuning: silaba
tempo: 90
tags: [traditional]

arrangements:
  - name: Melody only
    difficulty: beginner
    steps:
      - { d: 0.5, string: L4 }
      - { d: 0.5, string: R2 }
      - { d: 1,   strings: [L1, L5] }  # multiple strings on one beat
```

Each step has a duration `d` (beats until next event) and either `string` (single) or `strings` (array). Steps with `d` but no string are rests. YAML anchors/aliases can reuse step sequences across arrangements. String IDs are `L1`–`L11` (left hand) and `R1`–`R10` (right hand).

## Tech stack

Astro 6, TypeScript, Pico CSS, superdough (Web Audio), Vitest. Deployed to Cloudflare Pages.

## TODO

- **Tempo control rethink** — The tempo slider is functional but crude. Analyze alternatives (tap tempo, BPM number input, preset speed buttons like 50%/75%/100%, or a combination).
- **Kora sound sample** — Replace the VCSL `folkharp` with an actual kora sample. No free, openly-licensed kora multisample pack exists today; options include recording one, commissioning samples, or sourcing from a rights-cleared library.
- **Arrangement from a real recording** — Transcribe an arrangement from an actual kora performance recording, rather than composing arrangements from scratch.

## License

AGPL-3.0
