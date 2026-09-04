# Rule Card: Named Policy

**Tags**: "api:domain"
**Pattern**: `patterns/domain/named-policy-pattern.md`
**Layer**: Domain
**Level**: quickstart

## Why this card exists

A composed policy that nobody calls is worse than no policy — it looks like coverage in a
grep for `BR-*` ids while the handler enforces something else entirely (or nothing), and
that gap survives review because there is no single call site to check against.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **NP1** | When ≥2 specifications sequentially gate one class of content/action, compose them into ONE named `createXxxPolicy()` factory — never leave them as separate statements in the handler. | A gate is easy to omit on one code path with no single place that lists "all gates this action requires" (motivating case: `setTag()` omitted on one branch, 39 commits unnoticed). |
| **NP2** | The composed policy is called from its target handler(s) — a policy exported but never invoked is a finding, not a completed refactor. | `createBookingAccessPolicy()` composes BR-BOOKING-003/005 correctly but is dead code; `create-booking/handler.ts` re-derives the same two rules inline against a differently-shaped object. |
| **NP3** | The handler's only reaction to `.check()` failing is an early `Result.fail()` — never branch on WHICH rule failed. | Branching on the violation code re-implements the policy's internal routing at the call site, defeating the point of having one named gate. |
| **NP4** | Actor/market-class variance is resolved AT CONSTRUCTION (`.forActor()` / conditional `.and()` inside the factory) — never as an `if` wrapped around the single `.check()` call. | Per-call branching reintroduces "gate absent on one path", the exact failure class this pattern exists to close. |
| **NP5** | An intentional exemption (e.g. "organizations skip the residence guardrail") is a visible, named line INSIDE the policy factory — never expressed only by a call's absence on one branch. | A reviewer or a guardian check (D2, `command-handler-pattern.md`) cannot distinguish "deliberate exemption" from "someone forgot the call" when the only evidence is what's missing. |
| **NP6** | Each composed specification stays independently unit-testable and keeps its own `BR-*` id via `@BusinessRule()` — the policy composes, it does not replace, the specifications underneath. | Losing the per-rule id collapses distinct violations into one undifferentiated policy failure, breaking `BUSINESS_RULES.yaml` traceability. |

<!-- Karta to jest to, co realnie wkleja się do promptu implementera (§2b′ w
     commands/orchestrate.md). Limit ~8 KB — powyżej lint-patterns.mjs ostrzega, bo to
     znak, że wzorzec potrzebuje podziału. -->
