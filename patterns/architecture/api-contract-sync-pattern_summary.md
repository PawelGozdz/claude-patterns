# API Contract Sync — Rule Card

**Tags**: "api:api-surface:contract", "any:process"
<!-- Egzekwowalne streszczenie api-contract-sync-pattern.md.
     Pełny wzorzec: api-contract-sync-pattern.md -->

**Layer**: Architecture · **Status**: production
**Source**: api-contract-sync-pattern.md

## MUST
- **AC1** — Diff the backend's current OpenAPI/Swagger doc against the **last-known snapshot**
  (snapshot-based-incremental-review mechanism), not against a hardcoded/previous manual copy.
- **AC2** — For every changed endpoint/schema fragment, grep **each consumer repo** (mobile,
  web) for concrete usages and report file:line — not just "field X changed".
- **AC3** — Report is advisory only: **never edit consumer repos automatically** — a human
  reviews and applies the change in each repo's own context.
- **AC4** — When the current branch matches the configured task-id convention, tag the report
  with that ID so matching branches across repos can be cross-referenced.
- **AC5** — Save the updated snapshot only **after** the developer has acted on the report
  (same timing rule as the incremental-review pattern), never before.
- **AC6** — Keep config (`.claude/rules/api-clients-context.md`) and snapshots in the
  **consuming project**, never checked into claude-patterns itself.

## MUST NOT
- **N1** — ❌ Wire this into a CI merge gate — it is an on-demand developer tool, not
  contract-testing automation (use Pact/OpenAPI-diff CI for that).
- **N2** — ❌ Auto-apply "safe-looking" field renames in consumer repos — semantic changes a
  grep-based scan can't see may be hidden.
- **N3** — ❌ Skip the task-id tag — without it, coordinated backend+client changes across
  repos have no way to be recognized as the same unit of work.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Backend + mobile/web consumers in separate repos with no shared monorepo tooling.
- ✅ Planning or mid-flight backend API change, need blast-radius across consumers first.
- ✅ Coordinating a backend change with client changes under the same task/PR id.
- ❌ Substitute for real contract testing (schema validation in CI).
- ❌ Auto-editing consumer repos.
- ❌ Monorepo with shared types already catching drift at compile time.

## Verifier — najczęstsze naruszenia
| Symptom | Złamana reguła |
|---|---|
| Skrypt/agent edytuje plik w repo konsumenta | N1/AC3 |
| Snapshot zapisany PRZED reviewem developera | AC5 |
| Config/snapshot leży w claude-patterns, nie w projekcie konsumenta | AC6 |
| Raport bez konkretnego `plik:linia` per konsument | AC2 |
| Brak tagu task-id mimo zgodnej nazwy brancha | AC4 |

**Pełny wzorzec**: [`api-contract-sync-pattern.md`](./api-contract-sync-pattern.md)
