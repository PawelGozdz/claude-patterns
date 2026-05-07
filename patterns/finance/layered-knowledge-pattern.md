# Pattern: Layered Knowledge for Domain Skills

**Layer**: Finance / Cross-Layer
**Status**: production
**Origin**: vendored from [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT)
**Skills**: 84 skills in `skills/finance/` declare `## Layer N` headers
**Agent**: `finance-strategist` (agents/universal/)

---

## What This Is

A two-dimensional organization for large skill collections that have both
**knowledge depth** (foundations → applications) and **functional breadth**
(separate concerns within a domain).

Finance has 84 skills. Without structure, an agent picking a skill faces
combinatorial chaos. With this pattern, navigation becomes:

1. **Plugin axis (functional)** — what domain are we in? `core`,
   `wealth-management`, `compliance`, `advisory-practice`,
   `trading-operations`, `client-operations`, `data-integration`
2. **Layer axis (depth)** — what knowledge depth do we need? Layer 0
   (math foundations) up to Layer 7 (behavioral, reporting,
   communication)

Each skill sits at a specific (plugin, layer) cell.

---

## When to Use

- A skill collection has > 30 skills and clear conceptual layering
  (foundations → applications)
- Skills have **hierarchical dependencies** (advanced concepts require
  foundational ones)
- Multiple **disjoint functional areas** share the same foundations
  (in finance: every plugin depends on `core` math/stats)
- An agent needs to **pick a reading order**, not just a single skill

---

## When NOT to Use

- Small collections (< 20 skills) — flat is fine
- Skills are independent and roughly equal in depth (e.g.,
  `marketing-skills` — 41 skills, mostly all "applied", no
  foundations vs applications distinction). The marketing system
  uses a simpler one-dimensional functional grouping.

---

## How It Looks in Finance

### Plugin axis (7 plugins)

```
core ────────────────────┐
                         ↓
                   foundational math
                         ↓
   ┌─────────────┬───────┴──────┬─────────────┬──────────────┐
   ↓             ↓              ↓             ↓              ↓
wealth-      compliance    trading-      client-       data-
management   16 skills     operations    operations    integration
32 skills                  9 skills      8 skills      4 skills
   ↓
advisory-
practice
12 skills
```

`advisory-practice` formally depends on `wealth-management` (advisor
workflows assume investment knowledge). Other plugins depend only on
`core`.

### Layer axis (8 layers within wealth-management)

| Layer | Topic | Example skills |
|---|---|---|
| 0 | Math foundations | `return-calculations`, `time-value-of-money` (in `core/`) |
| 1a | Historical risk | `historical-risk`, `volatility-modeling` |
| 1b | Forward-looking risk | `scenario-analysis`, `stress-testing` |
| 2 | Asset classes | `equities`, `fixed-income`, `currencies-and-fx`, `real-assets` |
| 3 | Valuation | `dcf-valuation`, `relative-valuation` |
| 4 | Portfolio construction | `asset-allocation`, `rebalancing` |
| 5 | Policy & planning | `tax-efficiency`, `tax-loss-harvesting`, `withdrawal-strategies` |
| 6 | Personal finance | `emergency-fund`, `savings-goals`, `debt-management` |
| 7 | Behavioral, reporting | `behavioral-biases`, `performance-reporting` |

Skills outside `core/` and `wealth-management/` (e.g., compliance,
trading) operate at the workflow level — no explicit layer.

---

## Agent Routing Logic

When the user asks a question, the `@finance-strategist` agent:

1. **Pick plugin** by topic match (compliance question → `compliance/`)
2. **Pick layer** by depth needed:
   - Concept question (*"what is TWR?"*) → Layer 0, just one skill
   - Application question (*"build me an allocation"*) → Layer 4, but
     read prerequisite Layer 0 + Layer 1 skills first
   - Multi-step task (*"design a quarterly review"*) → reads multiple
     skills across plugins
3. **Verify dependencies are enabled**: if the question requires
   `compliance` skills but `finance/compliance` isn't in
   `project.yml`, agent flags this before proceeding

---

## Implementation

### Adding a new layered domain

Suppose you wanted to add `legal-skills` with similar two-dimensional
structure:

```
skills/legal/
├── core/                 # legal reasoning fundamentals
├── corporate/            # entity formation, M&A, contracts
├── ip/                   # patents, trademarks, copyright
├── employment/           # hiring, terminations, comp plans
└── litigation/           # disputes, depositions, discovery
```

Each `SKILL.md` declares `## Layer N` for depth (statute reading →
case law → strategic application).

The agent (`legal-strategist`) follows the same pattern as
`finance-strategist` — check plugin enabled, walk layer dependencies,
contextual disclaimer per category.

### Required artifacts

- `skills/<domain>/PLUGINS.md` — plugin map + dependency graph
- `agents/universal/<domain>-strategist.md` — coordinator with routing
  table and dependency enforcement
- `commands/<domain>.md` — `/<domain>` entry point
- `patterns/<domain>/` — pattern docs explaining the architecture
- `scripts/sync-<domain>-skills.sh` — refresh from upstream (if
  vendored)

---

## Anti-Patterns

### ❌ Flattening when layers matter

**Bad**: Putting all 84 finance skills in `skills/finance/<skill>/`
without plugin grouping. Agent picks `tax-loss-harvesting` for a
question about asset allocation — wrong layer entirely.

**Good**: Plugin grouping forces the agent to think about *which
domain* before *which skill*, naturally aligning with knowledge depth.

---

### ❌ Hard-coded reading order

**Bad**: Every skill says *"first read X, then read Y, then read Z"*
in its body. Skills become brittle — a new foundational skill breaks
all dependents.

**Good**: Layer numbers are declarative metadata. The agent computes
the reading order from `## Layer N` headers and plugin dependencies
at runtime.

---

### ❌ Treating layers as folders

**Bad**: `skills/finance/layer-0/`, `skills/finance/layer-1a/` —
folder structure follows depth axis, breaks on the functional axis.
A skill that touches multiple layers has no home.

**Good**: Folders = plugins (functional axis). Layer = metadata in
`SKILL.md` body. Two axes, properly orthogonal.

---

### ❌ Single global disclaimer

**Bad**: Every output ends with `"This is not financial advice. Consult
a licensed advisor."` Becomes noise; users tune it out.

**Good**: Apply `regulatory-disclaimer-pattern.md` — disclaimer matched
to the question category, not pasted globally.

---

## Why This Pattern Matters

A 1-dimensional flat collection of 84 skills is a search problem. The
agent picks the wrong skill ~40% of the time because semantic similarity
between skill descriptions misleads it.

With two-dimensional structure (plugin × layer), the agent's first
decision narrows to ~12 skills, the second decision to 1-3 — and reading
order becomes derivable from layer numbers.

This compounds the more skills you have. At 41 skills (marketing) the
benefit is small; at 84 (finance) it's substantial; at 200+ it would be
required.
