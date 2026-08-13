# Domain-Colocated Fixture Mother Pattern

**Pattern Type**: Testing Pattern
**Tags**: "api:tests:fixtures"

**Layer**: Domain (L1 construction) + Test Infrastructure (L2/L3 persistence)
**Introduced**: TS-TEST-FIXTURE-001 (2026-07-10)
**Status**: ACTIVE
**Version**: 1.0
**Created**: 2026-07-12

## Problem

The pre-existing `UserIdentityFixtureClass` (`test/shared/fixtures/auth/user-identity-fixture-class.ts`, 604 lines) built test users through a monolithic `HybridFixture` (ADR-0061) that constructed aggregate props inline and, in its `createAsync()` mode, persisted them via **raw `INSERT`** rather than the real domain pipeline. A repo-wide audit (`TS-TEST-FIXTURE-001`) measured the actual cost of this shape across the codebase:

- **185 occurrences of `as any`** and **11 helpers typed `db: any`** in fixture code, despite a correctly-typed `Kysely<Database>` being available everywhere else in the same repo.
- **109/203 e2e files (53.7%)** did raw `.insertInto()`/`.updateTable()`/`` sql` `` directly inside test bodies instead of a shared helper.
- **Concrete, already-observed drift**: an identical 15-field `economy_users` insert literal was copy-pasted across 16 files; one copy silently dropped the `phone_number` field the other 15 had.
- `createProjections()` (183 of the 604 lines in the old fixture class) inserted rows into **7 projection tables in one transaction**, entirely bypassing the mapper/event/optimistic-locking pipeline those tables get in production.

**The bypass consequence was worse than duplication — it hid regressions.** Because the old `createAsync()` did a raw `INSERT` that emitted zero domain events, a test asserting *"0 events exist for this user"* passed for the wrong reason (the fixture never emitted events for anyone) rather than because the code under test genuinely didn't emit events. When `get-age-restricted-capabilities/handler.integration.spec.ts` was migrated to real `repository.save()`, the assertion started failing — not because of a regression, but because the *real* `UserRegisteredEvent` + `EmailVerifiedEvent` are now persisted at construction time, exactly as production does it. The test had to be rewritten to diff event counts before/after the operation instead of assuming a zero baseline — the old fixture had been quietly authorizing an assertion built on an artifact of its own bypass.

A second, independent problem: `domain/**/__fixtures__/` directories (e.g. `geographic-auth/domain/geo-auth/aggregates/__fixtures__/user-residence.fixtures.ts`) already existed for some aggregates, but nothing stopped them from importing `@shared/database` types and reaching for `as any` when persisting — because `.dependency-cruiser.js`'s `domain-should-not-import-infrastructure` rule never actually covered `domain/** → @shared/database/**`.

## Rozwiązanie

**Construction is shared, persistence is strategy-specific.** One pure function builds "what a correct X looks like" through the aggregate's own public API; how (and whether) that gets written to Postgres is a separate, explicit concern layered on top.

### Category 1 — Aggregate Mother (pure construction)

```
src/contexts/{ctx}/domain/aggregates/__fixtures__/{aggregate}.mother.ts
```

A Mother is a **pure domain function** — zero imports from `infrastructure/`, `application/`, or `test/` — that builds a real aggregate instance through its public factory methods. It never uses `as any` on props and never calls `reconstituteFromPersistence()` as a shortcut to skip invariant checks.

Real example, `src/contexts/auth/domain/aggregates/__fixtures__/user-identity.mother.ts` (five variants, derived from `UserIdentityAggregate`'s actual factory methods, not guessed):

```typescript
// Zero imports from infrastructure/, application/, test/ — enforced by dependency-cruiser.

// UserIdentityAggregate.create() is positional, does NOT return Result
// (validation already happened in the VOs passed to it):
//   create(email, hashedPassword, isAdult, displayName, firstName, lastName?)
export function createUnverifiedUser(overrides: Partial<MotherOverrides> = {}): UserIdentityAggregate {
  return UserIdentityAggregate.create(
    createTestEmail({ value: overrides.email }),
    createTestHashedPassword(),
    true,
    overrides.displayName ?? 'Test User',
    overrides.firstName ?? 'Jan',
    overrides.lastName,
  );
}

export function createVerifiedUser(overrides: Partial<MotherOverrides> = {}): UserIdentityAggregate {
  const user = createUnverifiedUser(overrides);
  const token = user.generateEmailVerificationToken(); // real state transition, not a flag flip
  user.verifyEmail(token);
  return user;
}

// createWithSocialLogin() / createProvisional() DO return Result<UserIdentityAggregate, AuthValidationError>
export function createSocialLoginUser(overrides: Partial<MotherOverrides> = {}): UserIdentityAggregate {
  const result = UserIdentityAggregate.createWithSocialLogin(/* real VO args */);
  if (result.isFailure) throw new Error(result.error.message);
  return result.value;
}

export function createProvisionalPhoneUser(overrides: Partial<MotherOverrides> = {}): UserIdentityAggregate {
  const result = UserIdentityAggregate.createProvisional(/* real VO args */);
  if (result.isFailure) throw new Error(result.error.message);
  return result.value;
}

export function createActivatedPhoneUser(overrides: Partial<MotherOverrides> = {}): UserIdentityAggregate {
  const user = createProvisionalPhoneUser(overrides);
  user.activateViaPhone(/* real state transition */);
  return user;
}
```

Each variant exists because it corresponds to a **real, already-implemented state transition read off the aggregate**, not an assumed one — a GDPR anonymization variant was deliberately *not* built because no consumer needed it yet (see "Status migracji" below).

**Naming footnote**: the auth Mother uses the `.mother.ts` suffix (introduced Faza 4 of `TS-TEST-FIXTURE-001`). The earlier quick-jobs pilot (Faza 2+, same task) used `.fixtures.ts` for the same concept — e.g. `src/contexts/neighborhood-economy/domain/quick-jobs/aggregates/__fixtures__/job-request.fixtures.ts` with `createDraftJobRequest()` / `createModeratedDraftJobRequest()` / `createPublishedJobRequest()`. Both are the same pattern; the suffix drifted between sessions and has not been retroactively unified — check the actual file, don't assume the suffix.

**Zero DB types needed.** A Mother's signature is the aggregate's own factory signature — e.g. `job-request.fixtures.ts` types its overrides as `Parameters<typeof JobRequestAggregate.create>[0]`, no `Kysely`/`Database` import anywhere. `@shared/database` types only enter the picture once persistence starts, which is exactly why persistence lives in `test/`, not `domain/`.

### Persistence — real `repository.save()` via DI

```
test/shared/fixtures/{ctx}/{aggregate}-repository.fixture.ts
```

This layer takes the command repository out of the test application's DI container and calls its real `.save()` — mappers, domain events, and optimistic locking all run exactly as in production:

```typescript
// test/shared/fixtures/auth/user-identity-repository.fixture.ts
export async function saveTestVerifiedUser(
  app: INestApplication,
  overrides: Partial<MotherOverrides> = {},
): Promise<{ userId: string; user: UserIdentityAggregate }> {
  const user = createVerifiedUser(overrides);
  const repository = app.get(USER_IDENTITY_COMMAND_REPOSITORY);
  await repository.save(user);
  return { userId: user.id.toString(), user };
}
// saveTestUnverifiedUser / saveTestSocialLoginUser / saveTestProvisionalPhoneUser /
// saveTestActivatedPhoneUser follow the same shape, one per Mother variant.
```

**Event control is a DI-override, not a fixture flag.** `test/shared/nestjs-test-setup.ts` exposes `eventDispatcher?: { mode: 'real' | 'capture' }` on app setup — `'capture'` swaps both `IEventDispatcher` and its `UNIVERSAL_EVENT_DISPATCHER_TOKEN` alias for the same no-op capture instance (so `repository.save()`'s alias-injected dispatcher and any direct `IEventDispatcher` usage stay consistent), exposed back as `TestAppContext.capturedEventDispatcher` for assertions. Default is `undefined`/`'real'` — **never a silent bypass**. A microbenchmark in `TS-TEST-FIXTURE-001` Faza 2+ measured real `repository.save()` (capture mode, 20 calls) at **avg 62.38ms** — same order of magnitude as the old `createAsync()`'s ~50ms, ~13× faster than the `setTimeout(800)` some tests used to wait for handlers.

### Category 2 — projection row-builders (no repository to save through)

Tables synced only by a cross-context event handler (e.g. `economy_users`) have **no local repository to call `.save()` on**. Those get a typed `Insertable<Database[K]>` row-builder colocated with the real repo that syncs them — this is its own pattern, fully documented in [`typed-projection-row-builder-pattern.md`](./typed-projection-row-builder-pattern.md). This file only covers how row-builders compose with the Mother above.

### The composite — Mother + save + N typed row-builders

```
test/shared/fixtures/auth/user-identity-composite.fixture.ts
```

For `UserIdentity` specifically, seven contexts read a `{context}_users` projection that in production is created by an event handler reacting to `UserRegisteredEvent`. The composite is the direct replacement for the old `createProjections()`: Mother → `repository.save()` (delegates to the repository fixture above) → `Promise.all` over 6 new typed row-builders + the pre-existing `economyUserProjectionRow()`, preserving the **original per-table `onConflict` semantics 1:1**, not unified/reinvented:

```typescript
// test/shared/fixtures/auth/user-identity-composite.fixture.ts
export async function saveTestVerifiedUserWithProjections(
  app: INestApplication,
  overrides: UserProjectionOverrides = {},
): Promise<{ userId: string }> {
  const { userId } = await saveTestVerifiedUser(app, overrides);
  const db = app.get(DATABASE_TOKEN);

  await Promise.all([
    // economy_users / community_communication_users / organization_users: onConflict(user_id).doNothing()
    db.insertInto('economy_users').values(economyUserProjectionRow({ user_id: userId, ...overrides }))
      .onConflict(oc => oc.column('user_id').doNothing()).execute(),
    // geographic_auth_users / engagement_users: plain insert, no onConflict — matches original createProjections()
    db.insertInto('geographic_auth_users').values(geographicAuthUserProjectionRow({ user_id: userId, ...overrides })).execute(),
    db.insertInto('engagement_users').values(engagementUserProjectionRow({ user_id: userId, ...overrides })).execute(),
    // user_profiles / user_profile_stats: onConflict(user_id).doUpdateSet(...)
    db.insertInto('user_profiles').values(userProfileProjectionRow({ user_id: userId, ...overrides }))
      .onConflict(oc => oc.column('user_id').doUpdateSet(/* ... */)).execute(),
  ]);

  return { userId };
}
```

`db` is resolved internally via `app.get(DATABASE_TOKEN)` — callers only ever pass `app`, symmetric with the repository fixture. There are **4 composite functions** — `saveTest{Unverified,Verified,ProvisionalPhone,ActivatedPhone}UserWithProjections()` — not 5: `createSocialLoginUser()` exists on the Mother but has no composite wrapper yet, because no migrated consumer needed one.

`UserIdentityAggregate` (post an earlier migration) doesn't store `displayName`/`firstName`/`lastName`/`locale`/`timezone`/`profilePictureUrl` as aggregate state — those live only in `user_profiles` (user-profile context write model) and are only propagated into the registration event. The composite therefore takes them as a separate `UserProjectionOverrides` input rather than reading them off the built aggregate — matching how the old `createProjections()` also sourced them from `params`, not from the aggregate.

## Reguła dependency-cruiser

`.dependency-cruiser.js` gained a new, unconditional rule during `TS-TEST-FIXTURE-001` Faza 2+ (`domain-fixtures-should-not-import-shared-database`):

> **Pełny zakaz, bez wyjątków**: `domain/**/__fixtures__/** ⇏ @shared/database/**`

No exception for "just the persistence part" — a Mother that needs to persist gets that capability by moving persistence to `test/`, not by importing `@shared/database` into `domain/`. This single rule, run live against `src/contexts/auth`, is what proved (not assumed) that the auth domain barrel's re-export of the old `UserIdentityFixture` was a `not-in-allowed` `warn` (not yet `error` — raising that threshold is `TS-TEST-FIXTURE-006`, blocked until zero consumers remain).

## Kiedy używać czego

| Need | Use | Example |
|---|---|---|
| Pure L1 aggregate/spec test, no DB | **Mother directly** | `createUnverifiedUser({ email: createTestEmail({ value }) })` in `user-identity-events.spec.ts`/`user-identity-security.spec.ts` — no `test/` layer at all |
| L2/L3 test needs a real row in the aggregate's own table + real events, but doesn't read another context's projection | **Repository fixture** (Mother + `repository.save()`, no projections) | `saveTestVerifiedUser(app)` — used by the roundtrip verification test `user-identity-mother-repository-roundtrip.integration.spec.ts` |
| L2/L3 test in **another** context that just needs "a user to exist" (reads `economy_users`, `user_profiles`, etc.) | **Composite** — this is the default for the 133 migrated consumers | `saveTestUnverifiedUserWithProjections(context.app, overrides)` |
| Test needs only a projection row, no backing aggregate/user at all | **Row-builder alone** (Category 2, no Mother) | `economyUserProjectionRow({ user_id, trust_score: 0.8 })` — see [`typed-projection-row-builder-pattern.md`](./typed-projection-row-builder-pattern.md) |
| Test updates a user created by a **real** `POST /auth/register` call (SUT is the registration flow itself) | **DB helpers**, not Mother/composite — Mother builds from scratch, this mutates an existing SUT-created row | `markEmailVerified(db, userId)` from `user-identity-db-helpers.fixture.ts` |
| Load/perf test needs **thousands** of users at k6 VU scale | **`SeederRunner`** (`test/load/`), NOT Mother/composite — a permanent, documented Category 4 exception, not unmigrated debt | `test/load/seed-load-test-users.ts` / `seed-load-test-users-direct.ts` |

## Category 4 — bulk/load-test seeding (permanent exception, not a migration target)

`test/load/` seeds users at k6 VU scale (thousands of virtual users per run). A full Mother + `repository.save()` + real event flow (~50-800ms/user per the perf guide's targets) does not scale to that volume — this is a **throughput constraint**, not an oversight. `TS-TEST-FIXTURE-001` confirmed `SeederRunner` alive and explicitly did not migrate it; every task in the `-001`..`-007` series has left `test/load/` untouched. Do not propose migrating `test/load/` seeding to Mother/composite without first re-litigating the performance budget this exception exists for — that is a distinct decision from "did we forget this directory."

## Status migracji [2026-07-12]

**The old code still physically exists, by design.** `UserIdentityFixtureClass.createProjections()` (156 of what were originally 604 lines) has **not been deleted** — `TS-TEST-FIXTURE-006` confirmed it has exactly one remaining transitive consumer, `authorization-seeders.ts` (`seedAuthorizedUser` → `UserIdentityFixture.createAsync()` → `createProjections()`), itself a documented Category 3 exception with a 272-file blast radius. This is now a **closed, intentional exception**, not a pending removal — do not attempt to delete it without first migrating `authorization-seeders.ts` internally to Mother/composite, which is its own unscoped architectural decision.

Rollout status across the task series (eight tasks and counting):

- **`TS-TEST-FIXTURE-001`** (done) — architecture + `.dependency-cruiser.js` rule + `createProjections()` decision + pilot (2 quick-jobs e2e files). `AtomicCreators` (1201 lines, zero real consumers) **REMOVED entirely**, not merely deprecated. `TestDataFactory`/`TestPersonas` removed (dead, already-abandoned). `SeederRunner` (load-test bulk seeding) confirmed alive and **unchanged** — different purpose, not migrated (see Category 4 above).
- **`TS-TEST-FIXTURE-002`** (done, 2026-07-11) — full `UserIdentity` rollout: **133 of 135 real consumer files** migrated to Mother/composite (auth 12, authorization+pricing+community-communication 4, geographic-auth 23, neighborhood-economy 47, user-profile 23, organization 20, e2e+security-operations 4). 2 documented, intentional exceptions: `user-identity-fixture.spec.ts` (tests the old class itself) and `authorization-seeders.ts` (in scope of `TS-TEST-FIXTURE-003` instead, as a Category 3 orchestrator).
- **`TS-TEST-FIXTURE-003`** (done, 2026-07-11) — audited 6 previously-unaudited fixture directories. `authorization`: `permission.mother.ts` + `user-verification-capabilities.mother.ts` built (Category 1); `authorization-seeders.ts` stays as a legal Category 3 exception (272-file blast radius); `user-projection-seeder.ts` had its 15 structural `as any` removed by delegating to the Category 2 builders from `TS-TEST-FIXTURE-001`. `scenarios/` (`ScenarioBuilder`/`RelationshipBuilder`/`FixtureRegistry`) turned out to be **dead, unregistered, unusable code — deleted**, not a legal exception as first assumed. `booking/service-provider.fixture.ts` kept unchanged — a documented `ANTI_PATTERNS.md` exception. `events/event-seeders.ts` **consolidated into `EventTestFixtures`** (old directory removed, 9 e2e files migrated). `trust/trust-seeders.ts` — a `Trust BC removed` no-op stub — cleaned from 28/29 call sites, file itself not yet deleted (1 skipped-test consumer remains).
- **`TS-TEST-FIXTURE-004`** (done, 2026-07-11) — remaining 9 `quick-jobs` e2e files migrated (9/9, 0 failures); discovered and fixed a `target_area` PostGIS backfill bug in the shared `job-request-repository.fixture.ts` that the old raw-SQL seeder had handled but the Mother migration initially dropped.
- **`TS-TEST-FIXTURE-005`** (status: `ready`, staged but **not yet committed** as of 2026-07-12) — 44 of 45 `*.integration.spec.ts` files migrated from raw `economy_users` inserts to `economyUserProjectionRow()`; 1 file intentionally excluded (`sync-economy-user.handler.integration.spec.ts` — the source-of-truth test of the sync mechanism itself).
- **`TS-TEST-FIXTURE-006`** (status: `ready`, done 2026-07-12, staged but **not yet committed**) — removed the 3 genuinely dead `UserIdentityFixtureClass` methods (`setPhoneNumber`/`getUserIdByEmail`/static `markEmailVerified` — 0 consumers each; `markEmailVerified`'s live logic already lived in `user-identity-db-helpers.fixture.ts` since `-002`) and the fully-dead barrel `auth/domain/aggregates/__fixtures__/index.ts` (0 consumers). Did **not** remove `createProjections()` — see "Status migracji" intro above. Reviewed whether other `-003`-audited contexts qualify for the same `not-in-allowed` warn→error tightening: none do (their barrels only re-export sibling `domain/**/__fixtures__/*.mother.ts` files, none leak into `test/`).
- **`TS-TEST-FIXTURE-007`** (done, 2026-07-12) — audited the 8 fixture files across `neighborhood-economy`, `geographic-auth`, `engagement`, `core` that were never in scope of any prior task. Per-file outcome:
  - `geographic-auth-seeders.ts`: `seedResidence()`/`seedResidenceE2E()` confirmed as a documented, intentional Category 3 exception (test-seeding-performance-guide.md explicitly benchmarks these as unchanged, ~10-15ms/~30-40ms fast paths) — **open question resolved: NO delegation to the `UserResidence` Mother**, kept as-is. Fixed all 4 `as any` in `syncResidenceToContextProjections()` by replacing the dynamic-table-name anti-pattern with 3 explicit typed branches (`engagement_users`/`economy_users`/`community_communication_users`), no behavior change. Real blast radius re-grepped much higher than the pre-audit table (139/32/31 files per function, not 38 total).
  - `moderation-helpers.ts`: cross-context Category 3 orchestrator (polls 4 tables across 2 bounded contexts for a shared BullMQ moderation pipeline). Fixed both `as any` the same way (typed per-table branches, no dynamic table name). Deleted 2 confirmed-dead exports found during the audit: `waitForJobOfferModeration()` (0 consumers) and the generic `resetModerationStatus()` test helper (0 consumers — all apparent matches were an unrelated aggregate method of the same name).
  - `local-share-seeders.ts` / `service-offering-seeders.ts`: both are real Category 1 candidates (`LocalShareAggregate`/`ServiceOfferingAggregate` exist, zero Mother today) but **not migrated** — both aggregates require a 2-step state transition (draft → submit → moderate) with no existing shortcut, and real blast radius is large (26 and 18 files respectively, re-grepped). Documented via header note as a recommended follow-up task mirroring `UserIdentity`'s `-001`→`-002` two-phase split, rather than rushing a Mother within an 8-file audit.
  - `quick-jobs-seeders.ts`: **duplication resolved** — `job-request.fixtures.ts`/`job-offer.fixtures.ts` are NOT a stale ADR-0035 leftover; they're the original Mother pilot (see naming footnote above), and `job-request-repository.fixture.ts`/`job-offer-repository.fixture.ts` (built in `-001`/`-004`) are the full Category 1 composite already built specifically to replace this seeder. Re-grepped consumers show genuine incomplete migration (18 files still on the old raw-SQL seeder vs. 8 on the composite) — documented, follow-up migration task recommended, new consumers steered toward the composite via header note.
  - `admin-boundary-seeders.ts`: already fully Category-1-compliant (real `GeographicLocation.create()` + `repository.save()`, zero `as any`) — no changes needed. Found `seedAdminBoundaries()`/`cleanAdminBoundaries()` have 0 real consumers (the one related test file duplicates the same construction inline with different TERYT codes); documented as a consolidation candidate, not touched (TERYT mismatch may be deliberate test isolation, and rewriting a passing PostGIS geometry test without dedicated verification time is unsafe).
  - `address-points-seed.ts`: not an aggregate — bulk-imported external reference/geocoding data (GUGIK PRG), same shape as `polishCities` constants. Fixed the 1 real `as any` (pre-audit table said 0) via `Insertable<Database['address_points']>` + `sql<string>`, no behavior change.
  - `engagement-seeders.ts`: no `Comment` aggregate exists in `engagement` at all (only `UserActionAggregate`), so `seedCommentE2E()` isn't bypassing anything — no Category 1 candidate. Fixed the 1 `as any` (turned out to be entirely unnecessary — both casts were removable with zero type errors). Deleted `seedEngagementUserTrust()` — confirmed 0 real consumers, same dead-code shape as `scenarios/` in `-003`.
  - All 8 files: `pnpm typecheck` clean, `npx depcruise src test` shows 0 new errors (2 pre-existing errors unrelated to these files, unchanged `not-in-allowed` warn baseline for `test/shared/fixtures/**`).
  - See `TS-TEST-FIXTURE-007-audit-remaining-context-native-seeders.md` (moved to `completed-tasks/`) for full detail.
- **`TS-TEST-FIXTURE-008`** (done, 2026-07-12, staged but **not yet committed**) — repo-wide migration across 6 areas, all completed and independently re-verified (typecheck/depcruise/targeted tests re-run outside the implementing agent). **Analysis-stage correction**: the task's own premise that `reputation`+`vouch` share one table (`reputation_profiles`) was **false** — fresh grep confirmed 3 independent aggregates, each owning its own separate table(s); built as 3 independent Mothers, no synchronizing composite. New `.mother.ts` suffix decision (2026-07-12, human call after panel split `.mother.ts` vs `.fixtures.ts`): the 3 brand-new Category 1 files this round use `.mother.ts`; existing `.fixtures.ts` Mother-role files are **not** retroactively renamed.
  - `discovery`: Category 2, `map-markers.fixtures.ts` (PostGIS `ST_SetSRID` typing repeats the `-007` `address-points-seed.ts` precedent). 3 consumer files migrated.
  - `announcements`: Category 1, `announcement.mother.ts` (draft/published/archived — archived added beyond the minimum 2 asked for, still linear no-branching lifecycle). 6 consumer files migrated (5 L2 + 1 L1 aggregate spec), 4/4 targeted tests pass.
  - `organization-reputation`+`metrics`: Category 2, 2 new row-builders (`organization-reputation.fixtures.ts`, `neighborhood-health-snapshot.fixtures.ts`); real blast radius came in wider than the pre-audit estimate (3+3 files, not 2+2) — all migrated, plus 2 unrelated `as any` removed in `organization-hierarchy.e2e.spec.ts` by reusing the existing `OrganizationFixtures.createRepresentativeRecord()` instead of a new duplicate. `OrganizationFixtures` itself untouched, as decided. Found and documented (not fixed, out of scope) a pre-existing vitest-e2e-enhanced.config.ts include-glob gap: `test/e2e/metrics/**` was never actually running. 39/39 targeted tests pass.
  - `pricing`: Category 1 (`subscription.mother.ts`, 4 lifecycle variants — CANCELLED excluded, unreachable from the aggregate's public API; activation channel PAYU/ADMIN/TOKENS modeled as a parameter, not 3 Mothers) + Category 2 (3 row-builders: `subscription-plan-row`/`subscription-row`/`subscription-renewal-attempt-row.fixtures.ts` — `subscription_renewal_attempts` confirmed a real standalone audit-trail table from migration 013, not an in-aggregate VO). Real audit found 13 raw-SQL consumer files (not 13-14), all migrated to row-builders (none needed the Mother — none of the 13 asserted aggregate/event logic directly), 51/51 tests pass. One pre-existing flaky test (`process-auto-renewal`, timing-dependent) reproduced identically pre/post migration via `git stash` baseline comparison — documented, not fixed (out of scope).
  - `user-profile`: Category 1 (`user-profile.mother.ts` — the aggregate is **not** empty, it holds `profileStatus`/`bio`/`availabilityStatus`/private data, BR-UP-001..006) + a composite (`test/shared/fixtures/user-profile/user-profile-composite.fixture.ts`, colocated next to `user-identity-composite.fixture.ts` per existing convention) that calls the real `CreateUserProfileCommand`, not a raw insert. Row-builders for `user_profiles`/`user_profile_stats` already existed from `-001`; one new one added for `user_profile_groups`. Real audit found 11 local `createUserWithProfile()` duplicates (not the task's guessed 6) — all migrated, plus 3 raw-insert query test files. 103/103 tests pass.
  - `reputation`+`vouch`: Category 1, 3 independent Mothers (`reputation.mother.ts`, `user-signal-profile.mother.ts`, `vouch-registry.mother.ts`) + 1 Category 2 background/FK-only row-builder for `users`. The `users` builder was deliberately placed in `test/shared/fixtures/auth/user-row.fixtures.ts` — **not** domain-colocated in `reputation`/`vouch` — because `.dependency-cruiser.js`'s `no-cross-context-imports` rule would have blocked every other bounded context (9 found by grep) from importing it if it lived inside one context's `src/`; `test/` is outside that rule's `from: '^src/'` scope. Real audit found only 5 consumer files (all in `reputation`; `vouch`'s handler tests were already pure unit tests on mocks, needing no migration) — `user-signal-profile.mother.ts` and `vouch-registry.mother.ts` currently have zero consumers (built per the decision, ready for the next real need). 2 files intentionally left as raw SQL — DB CHECK-constraint tests asserting on values the domain layer would reject at construction, so they must stay outside the aggregate. 32 passed/1 skipped, re-confirmed independently.
  - Full-repo `pnpm typecheck` and `npx depcruise src test`: 0 errors (warnings only, pre-existing baseline). See `TS-TEST-FIXTURE-008-migrate-remaining-repo-wide-fixture-debt.md` (moved to `completed-tasks/`) for full detail.

## Anti-Patterns

**1. `as any` on aggregate props to work around a missing setter.** `permission-fixture.class.ts` had `(permission as any)._id = PermissionId.fromString(...)` to force an ID — removed in `TS-TEST-FIXTURE-003` once the Mother migration showed it was dead code (zero of 19 consumers ever passed an id). If a Mother needs a capability the aggregate's public API doesn't expose, that's a signal to add the capability to the aggregate, not to reach around it.

**2. `reconstituteFromPersistence()` used as a construction shortcut.** A Mother must go through `create()`/named factories — `reconstituteFromPersistence()` exists to rebuild from a persisted row, not to skip invariant/business-rule checks during construction.

**3. A "no events" mode built into the fixture itself.** Event control belongs to the DI-override (`eventDispatcher: { mode: 'capture' }`), never to a fixture-internal bypass flag — a bypass flag creates a second write path that silently drifts from the one production actually uses (exactly how the old `createAsync()`'s raw `INSERT` ended up producing false-positive "zero events" assertions, see Problem above).

**4. Domain fixtures importing `@shared/database`.** `user-residence.fixtures.ts` did this pre-fix (5× `as any`) because it did persistence, mocked, inside `domain/`. Now blocked unconditionally by `domain-fixtures-should-not-import-shared-database`.

**5. One dynamic-table-name builder shared across contexts for Category 2.** `authorization/user-projection-seeder.ts` insert into 4 different contexts' tables from one file, forcing 15 structural `as any` (Kysely can't type a dynamic table name). One typed builder per table, colocated with its owner context — see [`typed-projection-row-builder-pattern.md`](./typed-projection-row-builder-pattern.md).

**6. Rip-and-replacing a Category 3 orchestrator because it "should" use Mothers.** `authorization-seeders.ts` has a 272-file blast radius — it stays exactly as-is, and should eventually delegate to Category 1 Mothers *internally*, not be migrated away wholesale. Verify blast radius by grep before assuming any fixture file is a small, safe migration — `TS-TEST-FIXTURE-001`'s own audit initially underestimated `UserIdentityFixture`'s blast radius by 6×.

## References

- [`typed-projection-row-builder-pattern.md`](./typed-projection-row-builder-pattern.md) — Category 2 in full detail (row-builder shape, colocation rule, anti-patterns).
- [`e2e-hybrid-fixture-pattern.md`](./e2e-hybrid-fixture-pattern.md) — the surrounding "fixture what you don't test" philosophy this pattern implements for construction+persistence specifically.
- [`test-seeding-performance-guide.md`](./test-seeding-performance-guide.md) — performance targets and mode-selection guidance this pattern's composite now fulfils for `UserIdentity`.
- Source tasks: `TS-TEST-FIXTURE-001` through `TS-TEST-FIXTURE-006` (`project-orchestration/{tasks,completed-tasks}/` in the originating repo).
