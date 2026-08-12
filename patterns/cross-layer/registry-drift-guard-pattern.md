# Pattern: Registry Drift Guard

**Layer**: Cross-Layer
**Status**: production
**Tags**: "any:process", "any:tests"

## What This Is

A hand-maintained registry — a list of migrations, an event map, a routing table, a set of
enabled hooks — that must stay in step with something else: files on disk, symbols in code,
or another config. Nothing enforces that agreement, so the two drift apart **silently**. The
registry keeps looking correct, because it is internally consistent; it is just no longer a
description of reality.

The guard is the cheap countermeasure: one test (or one generator) that compares the registry
against the ground truth it claims to describe, and fails loudly when they diverge.

Two shapes, in order of preference:

1. **Generate the registry** from the ground truth, so drift is impossible by construction.
2. **Guard the registry** with a test that enumerates the ground truth and asserts equality
   with the list — for when the registry must stay hand-written (ordering matters, entries
   carry extra metadata, or the file is someone else's to own).

## When to Use

**Use this pattern for:**
- ✅ A list of migrations, seeds or jobs registered by hand next to the files that implement them
- ✅ A map from event name → handler, error code → mapper, path → owning module
- ✅ A routing or ownership table that mirrors a directory structure
- ✅ Any config declaring "these N things are enabled" while the things live elsewhere
- ✅ A registry that has already failed once — a single silent miss proves the class is real

**Do NOT use for:**
- ❌ Lists that ARE the ground truth (a feature-flag set nobody mirrors) — nothing to compare against
- ❌ Deliberate subsets ("only these three run in CI") — there the difference is the point;
  assert the *rule* defining the subset, not equality
- ❌ Ordering-only concerns — use a lint rule; a drift guard checks membership, not sequence
- ❌ Cases where generation is trivially possible: then generate instead of guarding (shape 1 beats shape 2)

## Implementation

The guard is deliberately dumb — it enumerates and compares, it does not interpret:

```ts
// migrations.guard.spec.ts — AVAILABLE_MIGRATIONS must list every migration file, and nothing else.
import { readdirSync } from 'node:fs';
import { AVAILABLE_MIGRATIONS } from '../available-migrations';

it('registry matches the files on disk', () => {
  const onDisk = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.ts$/.test(f))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
  const registered = AVAILABLE_MIGRATIONS.map((m) => m.name).sort();

  // Both directions matter: a file nobody registered never runs, and a registered
  // file that no longer exists breaks startup instead of the test suite.
  expect(registered).toEqual(onDisk);
});
```

For the generated shape the registry becomes a build artifact, and the check becomes
"is the committed copy still current":

```bash
node scripts/generate-registry.mjs --check   # non-zero exit when the committed file is stale
```

Two properties make this worth writing:

- **It fails at the cheapest possible moment.** A missing migration surfaces in a test run,
  not three weeks later when someone wonders why a column is absent in production.
- **Its failure message names the delta**, not the symptom. "Registered but missing on disk: 225"
  beats "column does not exist".

Wire it where the ground truth changes: a unit test in the suite, or a check inside the same
script that materializes the config.

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| A comment saying "remember to add it to the registry" | The reminder is read by the person who already remembered. Migration 225 had exactly this and never ran. |
| Guard checking one direction only (registry ⊆ disk) | Catches deleted files, misses the far more common case: a file nobody registered. |
| Guard living in the same file as the registry | It gets edited together with the thing it guards, so the edit that breaks the registry silences the guard in the same commit. |
| Asserting a count (`expect(registry).toHaveLength(42)`) | Passes when one entry is swapped for another, and turns every legitimate addition into a two-line edit. |
| Treating drift as a documentation problem | Registry drift produces wrong runtime behaviour: an unexecuted migration, an unrouted event, a hook that never fires. |

## Real cases this came from

- **`AVAILABLE_MIGRATIONS`** (juz-ide-api): manual import plus list entry. Migration 225 was
  written and never executed, found long afterwards; 254 nearly repeated it.
- **`hooks/lib/pattern-routing.js`** (claude-patterns): 31 hand-kept path→pattern rules, maintained
  separately from the blocks declaring the same mapping — being migrated to generation from `runtime.yml`.
- **`hooks:` in runtime.yml vs `settings.json`**: config declared 4 hooks while 8 were active;
  the drift stayed invisible until a verifier compared both lists.
