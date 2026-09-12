# Pattern: Temporary Copy To Consumer

**Tags**: "any:process", "any:app:external-integration"
**Layer**: Cross-layer
**Level**: core
**Status**: experimental
**Scope**: project-specific (iam) — single-project derivation, not yet validated in a second
codebase. Excluded from `retrieve_patterns` by default; pass `project: "iam"` to include it.
Promote to universal once a second project adopts this shape.

## What This Is

A module that a second repo needs today, but that isn't worth packaging as a real
cross-repo dependency yet (no publish pipeline, unstable interface, one consumer), gets
**copied** into the consumer's tree instead — and the owning repo's own README declares the
module temporary and copy-ready *before* a consumer exists, naming the expected consumer by
name. The copy, in turn, records exactly where it came from and what changed.

## When to Use

**Use this pattern for:**
- ✅ A small, self-contained module (CLI, client, adapter) a second repo needs now, where a
  real dependency (npm package, git submodule, monorepo package) isn't justified yet — the
  interface hasn't stabilized, or there's no build/publish pipeline to hang it on
- ✅ The owning repo is willing to write its own README declaring "this is temporary code,
  meant to be copied," naming the mechanism for tracking copies
- ✅ The copy's local modifications are small and enumerable (one flag, one function) — worth
  stating explicitly, not silently forked

**Do NOT use for:**
- ❌ A module that already has, or will clearly have, 3+ consumers — that is what a real
  package or monorepo boundary is for; copying doesn't scale past ~2 without drift
- ❌ A module whose interface changes often — every owner-side change needs someone to notice
  and re-copy by hand; without an explicit guard this decays into the same silent drift
  `registry-drift-guard-pattern` warns about, one level up (a copy IS a hand-maintained
  registry of one)
- ❌ Copying without declaring it — that's a duplicate nobody tracks, not this pattern

## Implementation

Owner side (`iam`'s `src/tooling/pat-login-cli/README.md`) states the deal up front, before
the consumer exists:

```markdown
This module is temporary code, meant to be copied into consumers — not imported as a
cross-repo dependency. Expected first consumer: grant-flow's `grantflow-log-time` CLI
(TS-SSO-028 follow-up). Copy the whole directory; do not import across repos.
```

Consumer side (`tools/integrations/grant-flow/pat-login-cli/README.md`, the actual copy)
records provenance and the exact diff, in three lines:

```markdown
Skopiowane z iam@d032ec4, src/tooling/pat-login-cli/, 2026-09-08.
Jedyna lokalna zmiana: cli.ts ma dodatkową flagę --invalidate (zob. jej nagłówek).
Pełny oryginalny opis modułu: README.upstream.md
```

Three properties make this worth naming as a pattern rather than "someone copied a file":

- **The owner names the consumer before the consumer needs it.** `pat-login-cli`'s README
  called out `grantflow-log-time` as the expected consumer while grant-flow's own task
  (TS-SSO-028) was still open — the copy required zero interface adaptation because the
  owner had already designed for it.
- **The copy states its source as `<repo>@<commit>`, not "based on iam's tool."** A commit
  hash is checkable; prose is not.
- **The copy enumerates its own diff from upstream**, however small. "One flag" is a fact
  someone can verify in seconds; "some local tweaks" is not.

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| Copying without a source marker | Six months later nobody can tell if this is the current version or a stale fork — the exact class `registry-drift-guard-pattern` warns about, applied to a copy of one. |
| Modifying the copy without recording what changed | The "one flag" line is what makes the next re-sync (or the next audit) a five-minute diff instead of a full file-by-file review. |
| Publishing a real package too early to avoid "just copying" | Forces a build/publish/version pipeline onto an interface that hasn't proven itself with a second consumer yet — the one-flag diff becomes a version bump nobody wants to cut for one consumer. |
| Copying the whole owner repo instead of the one module | Drags in unrelated code and dependencies the consumer doesn't need, and multiplies the diff surface the next time the owner changes anything. |
