# Business Rules YAML — Rule Card

**Tags**: "api:tests", "api:domain"
<!-- Egzekwowalne streszczenie business-rules-yaml-pattern.md.
     Pełny wzorzec: business-rules-yaml-pattern.md -->

**Layer**: Testing
**Status**: Production
**Source**: business-rules-yaml-pattern.md

## MUST
- **BR1** — Use pure **multi-line** YAML for every rule field — never condensed
  `{key: value, key: value}` inline objects (breaks clean git diffs and YAML lint).
- **BR2** — Every rule has a `category`: `validation` | `authorization` | `invariant` |
  `policy` | `guard` — apply the domain-expert test ("would a business stakeholder care?") to
  decide if something belongs here at all.
- **BR3** — Name rules `BR-{CTX}-{GROUP?}-{SEQ}` (e.g. `BR-QJ-PUB-001`) — sequential within a
  group, no gaps, no `-A`/`-B` suffixes.
- **BR4** — Every rule requires `title`, `description`, `rationale`, `enforcement.primary`,
  `category`, `on_failure` (`null` if it can't fail, else an object with `error_code`).
- **BR5** — Track test coverage via `enforcement.primary.class` matching + CI tooling, not
  manual `tests:` blocks — for explicit overrides only, use the slim v2.1 form
  (`tests: { L1_spec: file.spec.ts }`), never the verbose v1 per-level status blocks.
- **BR6** — Put orchestration (rule sequencing, "what happens next") in **flows**, not in the
  rule itself — a rule doesn't know its execution context.
- **BR7** — Rules provide `on_failure.error_code`/`error_class` only; the **flow** decides what
  to do with the failure (abort/rollback/continue/retry) via `terminal`, not the rule.
- **BR8** — Document event emission at the **flow** level (`on_success.emits: [...]`), not as a
  separate business rule.

## MUST NOT
- **N1** — ❌ Hardcode a business value (a threshold, a count) inside `on_failure`/a rule
  condition — reference only the error code; the value lives in code and would go stale in YAML.
- **N2** — ❌ Add a `next:` field to a business rule pointing at another rule — context-dependent
  sequencing belongs to a flow's `steps`, not the rule.
- **N3** — ❌ Document infrastructure concerns (repository save, transaction boundary, "returns
  the ID") as business rules — apply the domain-expert test; these belong in L2/L3 tests, not
  `BUSINESS_RULES.yaml`.
- **N4** — ❌ Put `terminal: true` inside a rule's `on_failure` — terminality is a flow decision.
- **N5** — ❌ Keep manual, per-test-file `tests:` status blocks that require hand-updating on
  every test run — use enforcement-matching CI tooling instead.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ DDD apps using the specification pattern.
- ✅ Mobile/frontend teams needing workflow documentation.
- ✅ Projects using Claude Code / LLM agents for development.
- ✅ Needing automated test-coverage visibility per business rule, or dependency graphs between
  rules.
- ❌ Simple CRUD apps (overkill).
- ❌ No testing strategy yet — implement Testing Pyramid Pattern first.
- ❌ No specification pattern — enforcement matching won't work without it.

## Verifier — najczęstsze naruszenia
| Symptom w YAML | Złamana reguła |
|---|---|
| `on_failure: {error_code: X, error_class: Y}` (jedna linia) | BR1/N1 |
| Reguła z polem `next:` wskazującym inną regułę | N2 |
| Reguła bez `category` | BR2 |
| Reguła dokumentująca `Repository.save()` / transaction boundary | N3 |
| `terminal: true` wewnątrz reguły zamiast we flow | BR7/N4 |
| Rozbudowany blok `tests: { L1_unit: [{file, status, coverage}] }` (styl v1) | BR5/N5 |

**Pełny wzorzec**: [`business-rules-yaml-pattern.md`](./business-rules-yaml-pattern.md)
