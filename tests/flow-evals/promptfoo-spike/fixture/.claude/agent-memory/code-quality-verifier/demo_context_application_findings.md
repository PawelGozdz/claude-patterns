---
name: demo-context-application-findings
description: Recurring issues found in demo context's application layer as of 2026-08-18 (CreateWidget command/handler) — watch on re-verify
metadata:
  type: project
---

**Update 2026-08-18 (second pass, `{PATTERNS}` properly injected this time —
5 cross-layer cards: domain-errors, safe-error-propagation,
security-invariants, conventions, logger — see resolution note in
[[project-patterns-injection-gap]]):**

Confirmed against real Rule Cards, VETO issued:
- `create-widget.handler.ts:15` — `await this.widgetRepository.save(...)`
  result is never captured/checked → violates **DE1** (caller must check
  `isFailure`) and **SEP2** (handler must log the raw repo error before
  returning a generic one) — currently there is no error handling and no
  logger at all, so a save failure is silently swallowed.
- `create-widget.handler.ts:9` — `WidgetRepository` injected via bare
  constructor param, no `@Inject()`. Per `conventions-pattern` **CV2**,
  `*.repository.ts` (no `-kysely` suffix) names the *interface*, so this is
  very likely a TS interface with no runtime token → will break DI at
  runtime. This is the global CLAUDE.md DI rule, not one of the 5 injected
  card IDs — cited separately in the verdict.
- Neither file carries a `📚 Patterns read:` header/per-rule attribution →
  automatic VETO trigger, still unresolved from the first pass.
- `create-widget.command.ts` itself: `userId` as a plain field is only an
  **SI1** *concern* (IDOR risk), not a confirmed violation — the actual
  violation site (Zod body schema) lives in the controller, which is
  `infrastructure`, still out of scope. Flagged as advisory for the future
  infra-layer pass, not VETOed here — do not repeat the juz-ide-api-2 mistake
  of blocking on another layer's not-yet-written code.

**Why:** These are concrete, re-checkable symptoms tied to real rule IDs now
(DE1, SEP2, CV2) instead of generic gates.

**How to apply:** On the next verify pass for `demo/application` (if
re-implemented) or `demo/infrastructure` (once it exists — check the eventual
controller's Zod schema against SI1 for the `userId` question), confirm these
were fixed before treating the layer as clean.
