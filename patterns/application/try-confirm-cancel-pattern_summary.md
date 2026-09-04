# Rule Card: Try Confirm Cancel

**Tags**: "api:app"
**Pattern**: `patterns/application/try-confirm-cancel-pattern.md`
**Layer**: Application
**Level**: quickstart

## Why this card exists

A reserve→confirm/release dance copy-pasted per handler means one root-cause bug (fail-open
on an unavailable ACL) ships identically N times — confirmed as the P0-2 finding, 8
handlers, one root cause.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **TCC1** | Extract a per-context application service once the same reserve→confirm/release protocol appears in ≥3 handlers of one bounded context (`C2`). Below 3, leave it in the handler. | A service with one real caller is premature abstraction; the audit's threshold call was 8-10 call sites / 2-3 contexts → service per context, never a shared cross-context helper. |
| **TCC2** | The service is GENERIC — `feature`, `actionType`, `radiusBucket`, `contextEntityId` are caller-supplied parameters, never hardcoded to one content type. | A service that assumes one content type either forks per caller or leaks that caller's vocabulary into every other caller's error messages. |
| **TCC3** | The service fails with ONE generic error type (`kind: 'validation' \| 'infrastructure'` + `code`) — never a context-specific error class. | Callers can't share the service without also sharing error classes that don't describe their domain. |
| **TCC4** | Every caller translates the generic error into its OWN domain error via its own small mapping function — the service never manufactures a caller-flavored message. | The service accreting per-caller message strings is the first sign the abstraction has already broken (Anti-Pattern 2). |
| **TCC5** | Reservation state crosses the transaction boundary through the `prepared` object (`prepare()` → `executeBusinessLogic()` → `compensate()`), never through an instance field on the handler. | NestJS handler providers are singletons; an instance field leaks one request's reservation id into another concurrent request's compensation. |
| **TCC6** | `prepare()` never loads the mutated aggregate — for UPDATE-shape callers the lock + reservation stay interleaved inside `executeBusinessLogic()` (`A3`/`A4`, `command-handler-pattern.md`). | A "preview" load in `prepare()` is thrown away and introduces a TOCTOU race between the unlocked read and the transactional load. |
| **TCC7** | Never call the underlying ACL directly (`getGlobal`/`getGlobalRequired`) from a handler once that context has adopted the service — always go through the service's methods. | Bypassing the service reintroduces the exact fail-open shape (P0-2: `getGlobal` degrades silently on an unregistered ACL) the service exists to close. |
| **TCC8** | A caller may release inline (bypassing `compensate()`) ONLY when a documented ordering requirement (e.g. an audit write that must happen after release but before rollback) makes the post-rollback hook structurally unable to satisfy it — document the exception where it lives, don't generalize it. | Treating every release as inline-optional erodes `compensate()` down to "sometimes runs", defeating the point of a single post-rollback hook. |
| **TCC9** | `mapXxxReservationError()` (TCC4) MUST branch on `error.kind` and preserve the validation/infrastructure distinction in what it returns (different error class and/or HTTP status per branch) — collapsing both `kind` values into one class/status is a VETO, not a style nit. | A legitimate denial (e.g. insufficient tokens) becomes indistinguishable from a real outage: `kind: 'validation'` mapped to a 503-class error invites client retry storms against a token-reserving endpoint, and the caller loses the one piece of information ("top up", not "try again later") that made the failure actionable. Real incident: TS-ARCH-HANDLER-CONTRACT-001 Faza 5 fala A — two independently-written callers (`boost-event`, `boost-group`) each shipped a `mapTokenReservationError()` that returned ONE error class for both `kind` values; per-unit `code-quality-verifier` saw "caller has its own mapper" (TCC4 satisfied) and did not check that the mapper actually discriminates — caught only by the cross-cutting final gate. |

**Verifier check (TCC4/TCC9):** grep `mapTokenReservationError\|map.*ReservationError` in the caller. Count the `if (error.kind === ...)` (or `error.code === ...`) branches vs the distinct error classes/codes returned. One branch or one returned class covering both `kind` values = TCC9 violation, not a pass.

<!-- Karta to jest to, co realnie wkleja się do promptu implementera (§2b′ w
     commands/orchestrate.md). Limit ~8 KB — powyżej lint-patterns.mjs ostrzega, bo to
     znak, że wzorzec potrzebuje podziału. -->
