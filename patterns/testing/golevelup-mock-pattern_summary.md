# @golevelup/ts-vitest Mock — Rule Card

**Tags**: "api:tests:unit"
<!-- Egzekwowalne streszczenie golevelup-mock-pattern.md. Pełny wzorzec: golevelup-mock-pattern.md -->

**Layer**: Testing
**Status**: Production (LocalHero migration scope: 28 already using, 92 files to migrate)
**Source**: golevelup-mock-pattern.md

## MUST
- **GM1** — Use `createMock<T>()` from `@golevelup/ts-vitest` to mock any interface in an
  L1/L2 spec — auto-mocks every method as `vi.fn()`, typed as `DeepMocked<T>`.
- **GM2** — For a mock needing custom/conditional behavior on one method, pass it as a partial
  override to `createMock<T>({ method: vi.fn().mockImplementation(...) })` — let `createMock`
  auto-mock the rest, don't hand-write the other methods.
- **GM3** — After migrating a file, verify with `tsc --noEmit` (zero errors) and `vitest run`
  (all green) — `tsc` is the primary signal the migration didn't silently drop a method.
- **GM4** — Leave `vi.mock()` (Node module mocking), `vi.spyOn()` (real-object spying), stateful
  mock classes, and `extends`-based mock classes untouched — they're orthogonal, not in scope.

## MUST NOT
- **N1** — ❌ Hand-write a `function createMockXxx()` factory for an interface — breaks the
  moment the interface changes; `createMock<T>()` catches that at compile time instead.
- **N2** — ❌ Use an inline `{ method: vi.fn() }` object as a mock — no guarantee every interface
  method is covered.
- **N3** — ❌ Pass redundant `vi.fn()` overrides into `createMock<T>({ method: vi.fn() })` when
  no custom behavior is needed — `createMock` already auto-mocks it; only override methods that
  need `mockReturnValue`/`mockResolvedValue`/`mockImplementation`.
- **N4** — ❌ Migrate a Mock class that intentionally tracks call state internally, or that
  `extends` a real class — these are legitimate exceptions, not migration targets.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Mocking any interface in an L1/L2 spec.
- ✅ A mock needing conditional/custom behavior for one method (partial override).
- ✅ An interface changed shape — want `tsc` to catch drift.
- ❌ `vi.mock()` module mocking.
- ❌ `vi.spyOn()` on a real object instance.
- ❌ Stateful or `extends`-based mock classes.
- ❌ E2E tests (`.e2e.spec.ts`) — different mocking context.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `grep -r "function createMock[A-Z]"` trafienie w `.spec.ts` | N1/GM1 |
| `{ method: vi.fn() }` inline zamiast `createMock<T>()` | N2 |
| `createMock<T>({ x: vi.fn() })` bez `mockImplementation/mockReturnValue/mockResolvedValue` | N3 |
| Migracja stanowej mock-klasy (`findCalls: string[]`) na `createMock` | N4 |

**Pełny wzorzec**: [`golevelup-mock-pattern.md`](./golevelup-mock-pattern.md)
