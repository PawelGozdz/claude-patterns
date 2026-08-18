---
name: project-patterns-injection-gap
description: Orchestrator call for demo/application layer (2026-08-18) omitted {PATTERNS}/{PATTERN_RULE_CARDS} — verifier had to fall back to generic gates
metadata:
  type: project
---

On 2026-08-18, an `/orchestrate` inner_loop verify call for `demo` context,
`application` layer (files: `create-widget.command.ts`, `create-widget.handler.ts`)
included `{LAYER_SCOPE}` but did **not** include `{PATTERNS}` or
`{PATTERN_RULE_CARDS}`. Per protocol this should trigger STOP-and-report rather
than fabricating rule IDs from memory.

**Why:** Verifying against memorized/generic rule IDs instead of the actual
project Rule Cards risks citing wrong rule IDs or missing project-specific rules,
and masks a real caller-side bug (orchestrator not injecting grounding).

**How to apply:** If a future verify call for this project (or any project) is
missing `{PATTERNS}`, don't silently proceed with a full Rule-Card-cited verdict.
Report the gap explicitly, and fall back only to (a) the automatic-VETO
attribution check (no `📚 Patterns read:` line = VETO) and (b) generic DDD/CQRS
gates + the user's global CLAUDE.md rules (e.g. `@Inject()` required on NestJS
constructor deps). See [[demo-context-application-findings]] for what that
fallback surfaced this time.

**Resolved 2026-08-18 (same day, second call):** a follow-up verify call for
the exact same two files DID include `{PATTERNS}` (5 cross-layer cards). So
the gap is per-call, not a persistent orchestrator bug — worth re-checking
each time rather than assuming it's fixed or broken going forward.
