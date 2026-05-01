# Nav & Footer — Implementation Plan

> **For Claude:** Execute this plan task-by-task. Run tests and verify after each task.
>
> **To launch:** `Execute the implementation plan at docs/plans/2026-05-01-nav-and-footer-plan.md task by task.`

**Goal:** Add site-wide navigation links (Pieces, Transcribe) and a footer (GitHub repo, license) to the Base layout.

---

### Task 1: Add nav links to Base.astro

**Files:**
- Modify: `src/layouts/Base.astro`

**Step 1: Add Pieces and Transcribe links to the nav**

In the existing `<nav>`, add a second `<ul>` (right side) with links to `/` (Pieces) and `/transcribe` (Transcribe). Keep the notation select where it is — it should appear after the nav links when `showNotation` is true.

The nav should look like:
- Left: `Kumbengo Lab` (home link, already exists)
- Right: `Pieces` | `Transcribe` | [notation select if showNotation]

**Step 2: Verify**

Run: `npm run build` — confirm all pages build.

**Step 3: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat(nav): add Pieces and Transcribe links to nav bar"
```

---

### Task 2: Add footer to Base.astro

**Files:**
- Modify: `src/layouts/Base.astro`

**Step 1: Add a footer after `</main>`**

```html
<footer class="container">
  <small>
    <a href="https://github.com/gvdenbro/kumbengo-lab">GitHub</a> ·
    AGPL-3.0
  </small>
</footer>
```

Use the actual GitHub URL: `https://github.com/gvdenbro/kumbengo-lab`.

**Step 2: Style the footer**

Minimal styling: centered text, muted color, some top margin. Pico's `<small>` inside `<footer>` should handle most of this. Add a small `margin-top: 2rem` if needed.

**Step 3: Verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat(layout): add footer with GitHub link and license"
```

---

### Task 3: Verify and final commit

**Step 1: Run tests**

Run: `npm test`

**Step 2: Run build**

Run: `npm run build`

**Step 3: Visual check**

Confirm nav links appear on all pages and footer is visible at the bottom.
