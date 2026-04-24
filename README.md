# Kumbengo Lab

Learn the kora, one piece at a time. A static site for browsing kora pieces, viewing printable tablature, and playing back pieces interactively with a bridge diagram and timeline.

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

Create a YAML file in `src/content/pieces/`:

```yaml
title: My Piece
slug: my-piece
difficulty: beginner    # beginner | intermediate | advanced
tuning: silaba
tempo: 90
tags: [traditional]

layers:
  - name: Melody only
    difficulty: beginner
    steps:
      - { t: 0,   string: L4 }
      - { t: 0.5, string: R2 }
      - { t: 1,   strings: [L1, L5] }  # multiple strings on one beat
```

Each step has a beat time `t` and either `string` (single) or `strings` (array).

## Tech stack

Astro 6, TypeScript, superdough (Web Audio), Vitest. Deployed to Cloudflare Pages.

## License

AGPL-3.0
