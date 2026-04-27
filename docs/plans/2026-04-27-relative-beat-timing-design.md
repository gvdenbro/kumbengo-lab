# Relative beat timing for arrangement YAML

## Summary

Replace absolute beat timestamps (`t`) with relative durations (`d`) in piece YAML files. Enable pattern reuse via native YAML anchors and aliases.

## Motivation

Absolute timestamps (`t: 0`, `t: 0.5`, `t: 1`, …) make it hard to insert, reorder, or reuse steps. The Mad World "Full song" arrangement has ~180 lines with heavy duplication across verse/chorus sections. Relative durations fix all three problems.

## Design decisions

- **Duration-after convention**: each step's `d` says how long until the next event. `d: 0.5` on an eighth note, `d: 1` on a quarter note. Reads like sheet music.
- **Reuse via YAML anchors/aliases**: no custom pattern system. Anchors are defined inline where first used. No dedicated `patterns` key.
- **Array flattening**: YAML aliases on arrays create nested arrays (this is per-spec — the YAML spec does not support array splicing). The Zod schema flattens one level via `z.preprocess()` before validation.
- **`d` is the canonical representation**: the `Step` interface uses `d` everywhere. Lookahead reads `d` directly. Only `buildSlotMap` and `getTotalBeats` compute cumulative positions internally.

## YAML format

Before:
```yaml
steps:
  - { t: 0,   string: L4 }
  - { t: 0.5, string: R2 }
  - { t: 1,   string: L5 }
```

After:
```yaml
steps:
  - { d: 0.5, string: L4 }
  - { d: 0.5, string: R2 }
  - { d: 0.5, string: L5 }
```

Rests are steps with `d` but no `string`/`strings`:
```yaml
  - { d: 2 }              # 2-beat rest
  - { d: 0.5, string: R1 }
```

Reuse via anchors:
```yaml
arrangements:
  - name: Verse melody
    steps: &verse
      - { d: 0.5, string: R1 }
      - { d: 0.5, string: R1 }
      - { d: 0.5, string: R2 }
      - { d: 0.5, string: R2 }
      - { d: 1,   string: R1 }

  - name: Full song
    steps:
      - *verse
      - *verse
```

**Caveat**: `*verse` inserts an array as a single element, creating `[[step, …], [step, …]]`. The Zod schema flattens one level before validation. This is the standard community workaround for a known YAML limitation.

## Step interface and schema

```typescript
// piece.ts
interface Step { d: number; string?: string; strings?: string[]; }

// content.config.ts
const stepSchema = z.object({
  d: z.number().positive(),
  string: stringId.optional(),
  strings: z.array(stringId).optional(),
});
// Relax the "must have string or strings" refinement to allow rests

const stepsSchema = z.preprocess(
  (val) => Array.isArray(val) ? val.flat() : val,
  z.array(stepSchema)
);
```

## Player logic changes

`getTotalBeats` — sum of all `d` values:
```typescript
function getTotalBeats(steps: Step[]): number {
  if (steps.length === 0) return 0;
  return steps.reduce((sum, s) => sum + s.d, 0);
}
```

`buildSlotMap` — accumulate running `t`:
```typescript
function buildSlotMap(steps: Step[], resolution = 0.5) {
  const totalBeats = getTotalBeats(steps);
  const slots = Math.round(totalBeats / resolution);
  const slotMap = new Map<number, SlotInfo>();
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].string || steps[i].strings) {
      slotMap.set(Math.round(t / resolution), {
        index: i,
        strings: getStepStrings(steps[i]),
      });
    }
    t += steps[i].d;
  }
  return { slots, slotMap };
}
```

Player component is unchanged.

## Lookahead changes

`getGap` simplifies from computing `steps[i+1].t - steps[i].t` to reading `steps[i].d` directly.

Drop the `data-beat` attribute (absolute beat display) — it was a debug aid.

## YAML migration

Mechanical conversion of all 5 piece files: `d = next_step.t - current_step.t`, last step gets `d: 1`. Gaps (rests) become visible in the `d` value. No anchors added in this migration — deduplication is a follow-up.

## Tool updates

`transcribe.py` and `kora-tap.py` both emit absolute `t` values. Change to compute `d` as the difference between consecutive sorted beats. Last step gets `d: 1`.

## Tests

- Update all fixtures from `{ t: ... }` to `{ d: ... }`
- `getTotalBeats`: test sum-of-d behavior
- `buildSlotMap`: test rest steps advance time but don't appear in slot map
- Schema: test `z.preprocess` flattening of nested arrays
