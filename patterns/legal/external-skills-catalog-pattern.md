# Pattern: External Skills Catalog (License-Fragmented Ecosystems)

**Layer**: Legal / Cross-Layer
**Status**: production
**Sister patterns**: `legal/jurisdiction-aware-disclaimer-pattern.md`,
`finance/layered-knowledge-pattern.md`
**Agent**: `legal-strategist` (applies this pattern primarily); pattern
generalizes to any skill ecosystem with mixed licensing

---

## What This Is

A pattern for managing skill ecosystems where **some skills can be
vendored** (compatible licenses: MIT, Apache 2.0) and **others cannot**
(copyleft like AGPL-3.0, or proprietary). The pattern keeps both
discoverable to users while avoiding license contamination of the host
codebase.

Three components:

1. **Vendored skills** in `skills/<domain>/` — licenses verified at
   vendor time, listed in `README.md` with per-skill license tag
2. **External catalog** in `skills/<domain>/EXTERNAL.md` — every
   non-vendored skill, with license + author + upstream URL + install
   instructions + per-license commercial-use warning
3. **Sync script** with license verification (`--verify-licenses` mode)
   to catch upstream license changes that would require re-categorization

---

## When to Use

- Domain has fragmented licensing across the upstream skill ecosystem
- Some authors use copyleft (AGPL-3.0), others permissive (MIT/Apache),
  others proprietary
- Host codebase has a permissive license (MIT) and **must not be
  contaminated** by AGPL when projects symlink/reference claude-patterns
- Users still need discoverability across the full ecosystem (so they
  can install AGPL skills *in their own project* per their own license
  choices)

---

## When NOT to Use

- All upstream skills share the same compatible license (just vendor
  everything — see marketing/finance integration where everything is MIT)
- All upstream skills are incompatible (don't vendor anything; the
  whole domain is reference-only)
- Single-author ecosystem (just check the one license)

---

## Why AGPL is the Trigger Case

**AGPL-3.0** is the most common "incompatible" license in skill
ecosystems and has unique propagation properties:

- **Copyleft**: any project incorporating AGPL code must release its
  full source under AGPL
- **Network propagation**: even SaaS use ("served over network")
  triggers source-disclosure obligations
- **Mixing rules**: combining AGPL with MIT creates a derived work
  bound by AGPL, not by the more permissive parent license

For an MIT host (claude-patterns) shared via symlinks to many projects:
vendoring AGPL skills would obligate every dependent project to AGPL
their own code. That's not what users opted into when they pulled an
MIT toolkit.

The pattern's resolution: **vendor only compatible licenses, catalog the
rest**, so users keep discoverability while making informed install
choices in their own project (where they control the license boundary).

---

## Catalog Structure (skills/<domain>/EXTERNAL.md)

```markdown
# External <Domain> Skills (NOT Vendored)

## ⚠️ License Categories

### AGPL-3.0 (N skills)
[explanation of copyleft + commercial implications]

### Proprietary "all rights reserved" (N skills)
[explanation: read upstream LICENSE before installing]

## How to Install (per skill)
[step-by-step: clone upstream, copy skill folder into local
.claude/skills, NOT symlinked from claude-patterns]

## Catalog by Domain Subarea

### <Subarea 1> (N skills)
| Skill | Author | License | What it does |
|---|---|---|---|
| ... | ... | AGPL-3.0 | ... |

### <Subarea 2> (N skills)
...
```

The catalog is **never automatically installed** — it's a discovery
surface. The sync script populates and refreshes it; the user installs
specific entries themselves, in their own project, under their own
license decisions.

---

## Sync Script Responsibilities

A sync script following this pattern (e.g., `sync-legal-skills.sh`) must:

1. **Pull upstream** of each tracked source (e.g., lawvable + evolsb)
2. **Re-read each skill's `metadata.license`** to detect drift
3. **Vendor only compatible licenses** (configurable allowlist:
   `["MIT", "Apache-2.0", "BSD-3-Clause"]`)
4. **Update `EXTERNAL.md`** with current AGPL/proprietary skills + their
   metadata
5. **Flag drift**: if a vendored skill's upstream license changed to
   AGPL, fail loudly — operator must remove from `skills/<domain>/`
6. **Flag opportunity**: if an AGPL skill changed to Apache 2.0,
   surface as "candidate for vendoring"

```bash
./scripts/sync-legal-skills.sh --verify-licenses    # check only
./scripts/sync-legal-skills.sh                      # interactive sync + verify
```

The verification step is what makes this pattern **safe over time**.
Without it, an upstream relicense from MIT to AGPL would silently
contaminate the host codebase.

---

## Anti-Patterns

### ❌ "Vendor everything, sort licenses later"

**Bad**: Bulk-vendor an entire upstream `skills/` folder, hope
compatibility works out.

**Good**: Per-skill license check before each vendor. Sync script enforces
this on every refresh.

---

### ❌ Hidden AGPL inside an MIT codebase

**Bad**: Vendor an AGPL skill into an MIT project without flagging.
Users symlinking the MIT project unknowingly take on AGPL obligations.

**Good**: Refuse to vendor AGPL. Surface in EXTERNAL.md with explicit
copyleft warning. Let users install in their own project where they
control the license boundary.

---

### ❌ "Reference-only" with no install path

**Bad**: List external skills with their names but no install
instructions or license context. Users don't know how to use them or
what they're agreeing to.

**Good**: Each entry in EXTERNAL.md includes upstream URL, license,
install command, and commercial-use warning matched to the license type.

---

### ❌ Static catalog that drifts from upstream

**Bad**: EXTERNAL.md is hand-edited once, never refreshed. Skills
appear/disappear/relicense upstream; catalog rots.

**Good**: Sync script auto-populates EXTERNAL.md from upstream's
current state. Manual edits are limited to pattern documentation, not
the per-skill entries.

---

### ❌ License-blind vendoring of "compatible" repos

**Bad**: Trust the repo-level LICENSE (e.g., `lawvable/awesome-legal-skills`
is CC BY-NC-ND) and conclude either *all* skills are CC BY-NC-ND or
*none* are vendored.

**Good**: Read **per-skill** `metadata.license` field. Repo-level license
applies to the *list and structure*; individual skills retain their own
licenses. Vendor each one independently based on its own license.

---

## Why This Pattern Matters

Skill ecosystems mature unpredictably. Today's small permissive collection
may include AGPL contributors tomorrow. Today's AGPL skill may relicense
to MIT next quarter. Today's vendor source may be acquired and proprietized.

A sync script that re-verifies licenses on every refresh, with a clear
distinction between "vendored (we own the license relationship)" and
"cataloged (you own the license relationship)", protects the host
codebase from drift while keeping the user's choice surface visible.

The legal domain forced this pattern (because of the AGPL prevalence).
But it generalizes: any future domain (medical, scientific, regulated
industry) with mixed licensing can use the same structure.

---

## See Also

- [`jurisdiction-aware-disclaimer-pattern.md`](jurisdiction-aware-disclaimer-pattern.md) —
  the disclaimer pattern that applies inside legal-strategist's outputs
- [`agents/universal/legal-strategist.md`](../../agents/universal/legal-strategist.md) —
  the agent that uses both `skills/legal/` (vendored) and `skills/legal/EXTERNAL.md` (catalog)
- [`scripts/sync-legal-skills.sh`](../../scripts/sync-legal-skills.sh) — the sync
  script implementing this pattern
