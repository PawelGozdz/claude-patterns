# Fresh Context Pattern — Rule Card

**Tags**: "any:process"
<!-- Egzekwowalne streszczenie fresh-context-pattern.md — orchestrator lean, subagents
     fresh/focused. Pełny wzorzec: fresh-context-pattern.md -->

**Layer**: Orchestration
**Status**: production
**Source**: fresh-context-pattern.md

## MUST
- **FC1** — Keep orchestrator context at ~15-20% at the start of delegation (system
  instructions + task analysis + routing + recent decisions), reserving ~50% headroom.
- **FC2** — Scope each subagent's loaded patterns to its own layer only (domain agent → domain
  patterns; application agent → application patterns; infrastructure agent → infrastructure
  patterns) — 4-6 relevant patterns (~3,000 lines), not the full corpus.
- **FC3** — Use a **continuation agent** (same agent, preserved context) only for tightly
  coupled sequential phases of the SAME feature (e.g. Domain → Application → Infrastructure for
  one aggregate) where the next phase needs the prior phase's concrete structure.
- **FC4** — Use a **fresh/resume agent** (reset context) for unrelated or loosely coupled tasks
  where carrying prior context would only pollute the new one.
- **FC5** — Delegate with an explicit input/output contract (what the subagent needs, what it
  must return) rather than letting it inherit the orchestrator's full context.

## MUST NOT
- **N1** — ❌ Let the orchestrator accumulate implementation code, detailed test results, full
  pattern file contents, debugging logs, or multiple iterations of the same code — reference
  paths only.
- **N2** — ❌ Load all patterns "just in case" for every subagent — this is the "Full Pattern
  Loading" anti-pattern (Anti-Pattern 2) and defeats the fresh-context budget.
- **N3** — ❌ Let a subagent inherit 100% of the orchestrator's context before starting work —
  leaves no room to work; budget for ~40%+ reserved for the subagent's own reasoning/output.
- **N4** — ❌ Use the orchestrator itself as an implementation agent (Anti-Pattern 1) — it
  coordinates, it does not write code.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Orchestrator context exceeds ~30% before delegation — compact/clear between tasks.
- ✅ A subagent is seeing patterns/context irrelevant to its own layer.
- ✅ Token costs escalate unexpectedly for simple coordination tasks.
- ✅ Multiple related tasks run in sequence and need a continuation-vs-fresh decision.
- ❌ A single, self-contained task with no multi-agent delegation (no orchestrator to budget).

## Verifier — najczęstsze naruszenia
| Symptom | Złamana reguła |
|---|---|
| Orchestrator prompt zawiera pełny kod implementacji subagenta | N1 |
| Subagent domenowy dostaje wzorce infrastructure/application | FC2 |
| Nowy, niepowiązany task kontynuuje agenta z poprzedniego (zamiast fresh) | FC4 |
| Orchestrator sam edytuje pliki produkcyjne | N4 |

**Pełny wzorzec**: [`fresh-context-pattern.md`](./fresh-context-pattern.md)
