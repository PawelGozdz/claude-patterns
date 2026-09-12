# Rule Card: Temporary Copy To Consumer

**Tags**: "any:process", "any:app:external-integration"
**Pattern**: `patterns/cross-layer/temporary-copy-to-consumer-pattern.md`
**Layer**: Cross-layer
**Level**: quickstart

## Why this card exists

An undeclared copy of another repo's module is a duplicate nobody tracks — it drifts from
its source silently, the same way a hand-maintained registry drifts from the files it claims
to describe.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **X1** | Declare the copy's source as `<repo>@<commit>, <date>` in the copy's own README — never copy silently. | Nobody downstream can tell if the copy is current or a stale fork; there is nothing to diff against. |
| **X2** | Enumerate every local modification to the copy, however small — not "some tweaks." | The next re-sync (or audit) becomes a full file-by-file review instead of a five-minute diff. |
| **X3** | Stop copying once a module has, or will clearly have, 3+ consumers — promote to a real package/dependency instead. | Copies multiply drift risk linearly with consumer count; past two, the maintenance cost exceeds a real publish pipeline. |
