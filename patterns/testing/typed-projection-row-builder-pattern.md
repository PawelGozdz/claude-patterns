# Typed Projection Row-Builder Pattern

## 🎯 Problem

**Tabele projekcyjne (cross-context user projections) nie mają repozytorium
"create" do przejścia w testach.** W produkcji wiersz jest tworzony/aktualizowany
wyłącznie przez event handler reagujący na zdarzenie z INNEGO kontekstu (np.
`UserRegisteredIntegrationEvent`, `UserRoleChangedIntegrationEvent`) — nigdy
przez komendę wewnątrz kontekstu, który tę projekcję czyta. Testy L2/E2E, które
potrzebują wiersza w tabeli projekcyjnej PRZED wykonaniem właściwego handlera pod
testem, muszą go wstawić bezpośrednio.

**Bez wspólnego buildera to prowadzi do**:

```typescript
// Plik A
await db.insertInto('economy_users').values({
  user_id: requesterId,
  date_of_birth: null,
  trust_score: 0.0,
  capabilities: [],
  provider_rating: null,
  provider_jobs_completed: 0,
  // ... 9 więcej pól, ręcznie przepisanych
}).execute();

// Plik B (skopiowany z pliku A) — brakuje phone_number, bo w międzyczasie
// dodano kolumnę i nikt nie zaktualizował WSZYSTKICH kopii
await db.insertInto('economy_users').values({
  user_id: providerId,
  date_of_birth: null,
  trust_score: 0.0,
  // ...
}).execute();
```

**Rzeczywisty koszt** (LocalHero, `economy_users`): 45 plików `*.integration.spec.ts`
+ 16 plików `*.e2e.spec.ts` z niezależnie skopiowanym literałem. Rename/dodanie
kolumny wymaga ręcznej edycji dziesiątek plików; TypeScript tego nie wyłapie,
bo `.values({...})` z literałem obiektowym typuje się strukturalnie — brakujące
pole o wartości domyślnej po prostu nie jest błędem kompilacji. Odkryty
realny drift: `phone_number` brakujący w części kopii (TS-TEST-FIXTURE-001 Faza 0).

## ✅ Solution

**Jeden typowany builder na tabelę projekcyjną**, kolokowany przy repozytorium,
które faktycznie tej tabeli używa/synchronizuje w produkcji — nie w wspólnym
katalogu fixture'ów, nie w innym bounded contexcie.

```typescript
import type { Insertable } from 'kysely';
import type { Database } from '@shared/database/types/database.types';

function defaults(): Omit<Insertable<Database['economy_users']>, 'user_id'> {
  return {
    role: UserRole.USER,
    date_of_birth: null,
    trust_score: 0,
    capabilities: JSON.stringify([]),
    provider_rating: null,
    provider_jobs_completed: 0,
    display_name: 'Test Provider',
    profile_picture_url: null,
    first_name: 'Jan',
    last_name: 'Testowy',
    phone_number: '+48123456789',
    created_at: new Date(),
    updated_at: new Date(),
    residences: JSON.stringify([]),
  };
}

export function economyUserProjectionRow(
  overrides: Partial<Insertable<Database['economy_users']>> & { user_id: string }
): Insertable<Database['economy_users']> {
  return { ...defaults(), ...overrides };
}
```

Użycie w teście:

```typescript
import { economyUserProjectionRow } from '@contexts/neighborhood-economy/infrastructure/repositories/__fixtures__/economy-user-projection.fixtures';

await db
  .insertInto('economy_users')
  .values(economyUserProjectionRow({ user_id: requesterId, trust_score: 0.8 }))
  .onConflict(oc => oc.column('user_id').doNothing())
  .execute();
```

**Dlaczego to działa**:
- `Insertable<Database['economy_users']>` — TypeScript odrzuci nieistniejącą
  kolumnę lub zły typ w `overrides` przy kompilacji, czego literał obiektowy nie robił.
- Zmiana domyślnej wartości / dodanie kolumny → jedna edycja `defaults()`,
  odczuwalna we WSZYSTKICH konsumentach automatycznie.
- Override tylko pól, które dany test świadomie różnicuje — reszta pól nie jest
  nawet widoczna w call-site (mniej szumu niż 15-polowy literał).

## 🔧 Implementation

### Kolokacja (KRYTYCZNE)

Builder ląduje w `{context}/infrastructure/repositories/__fixtures__/`, obok
repozytorium/handlera, który faktycznie pisze do tej tabeli w produkcji —
**nie** w scentralizowanym katalogu typu `test/shared/fixtures/authorization/`.

Header komentarz builder'a MUSI wskazywać, który handler w produkcji
tworzy/aktualizuje ten wiersz (dokumentuje kontrakt, ułatwia znalezienie
konsumenta przy zmianie schematu):

```typescript
/**
 * @fileoverview Typed row-builder for the `economy_users` projection table.
 *
 * `economy_users` has no repository to "create" through in tests: in production
 * the row is created/updated by event handlers reacting to events from the auth
 * context (see `../user-projection-kysely.repository.ts` and
 * `../../../application/event-handlers/sync-economy-user.handler.ts`), never by
 * a command inside this context. Tests therefore insert the row directly — this
 * builder is the single typed source of defaults for that insert.
 *
 * Colocated next to the repository that owns the real `economy_users` writes so
 * a column rename in one is felt in the other within the same PR/diff.
 */
```

**Dlaczego nie centralnie**: audyt `TS-TEST-FIXTURE-003` znalazł
`user-projection-seeder.ts` w `authorization/` obsługujący 4 różne konteksty
naraz z jednego miejsca, przez dynamiczny insert po nazwie tabeli — wymusiło to
15× `as any` (Kysely nie wspiera dynamicznych nazw tabel w `.insertInto()` z
zachowaniem typów) i rozmyło odpowiedzialność (zmiana schematu `economy_users`
wymagała edycji pliku w `authorization`, nie w `neighborhood-economy`).
Kolokacja per-kontekst eliminuje oba problemy kosztem odrobiny duplikacji
(`defaults()` per tabela, ~10 linii).

### Kiedy używać tego wzorca (Kategoria 2) — a kiedy NIE

Z audytu `TS-TEST-FIXTURE-001`/`003` — trzy kategorie danych testowych, tylko
środkowa dostaje ten wzorzec:

| Kategoria | Kryterium | Wzorzec | Przykład |
|---|---|---|---|
| **1 — Aggregate** | Tabela odpowiada realnemu agregatowi z `domain/aggregates/` | **Mother** (`*.mother.ts`) + `repository.save()`, przechodzi przez prawdziwy event flow | `permission.mother.ts` |
| **2 — Projekcja bez repo zapisu** | Tabela synchronizowana WYŁĄCZNIE przez event handler z innego kontekstu, zero komendy lokalnej | **Ten wzorzec** — typed row-builder + bezpośredni insert | `economyUserProjectionRow()` |
| **3 — Cross-context orkiestrator** | Kompozycja wielu Kategorii 1/2 dla wygody call-site'u, świadomy wyjątek | Zostaje jako jest, NIE migrować do Mothera | `authorization-seeders.ts` (272 konsumentów) |

**Nie wymuszaj Kategorii 1 na Kategorii 2** — próba przepchnięcia projekcji
przez pełny event flow (np. rejestracja usera + emisja integration eventu +
czekanie na handler) w każdym L2 teście innego kontekstu jest bezcelowa
(testujesz orchestration event bus, nie logikę pod testem) i drastycznie
wolniejsza. Odwrotnie też: nie zostawiaj Kategorii 1 (ma agregat, ma
`create()`) jako gołego insertu tylko dlatego, że jest to szybsze — patrz
`repository-pattern.md` i `aggregate-pattern.md`.

### Weryfikacja przed migracją do tego wzorca

Przed napisaniem nowego buildera lub migracją call-site'ów — sprawdź per pole,
czy `overrides` w każdym call-site mieści się w `Insertable<Database[tabela]>`.
Jeśli plik ustawia pole, którego typ tabeli nie zna (literówka, stara kolumna),
to jest **realny drugi drift** do zgłoszenia, nie do cichego pominięcia.

```bash
# Znajdź pozostałe surowe literały do zmigrowania (per tabela)
grep -rl "insertInto('economy_users'" --include="*.integration.spec.ts" --include="*.e2e.spec.ts" src/

# Po migracji: raw literał tuż po insertInto() nie powinien już występować
# (samo wywołanie insertInto('economy_users') ZOSTAJE — zmienia się tylko
# argument .values(), nie insert jako taki)
grep -Pzo "insertInto\('economy_users'\)\s*\n\s*\.values\(\{" src/**/*.spec.ts
```

```bash
tsc --noEmit   # 0 błędów — builder wymusza poprawność pól przy kompilacji
```

## 🚫 Anti-patterns

1. **Jeden generyczny builder dla wielu tabel przez dynamiczną nazwę** —
   wymusza `as any` w Kysely (`tableName as any` w `.insertInto()`), traci
   type safety, którą cały wzorzec ma zapewnić. Jedna funkcja = jedna tabela.
2. **Builder poza kontekstem właściciela tabeli** — patrz "Dlaczego nie
   centralnie" wyżej.
3. **Przepchnięcie Kategorii 2 przez pełny event flow "dla czystości"** —
   projekcja nie ma agregatu do przetestowania; testowanie samego mechanizmu
   sync należy do OSOBNEGO testu handlera synchronizującego (patrz niżej), nie
   do każdego L2 testu, który tej projekcji tylko potrzebuje jako danych wejściowych.
4. **Migracja pliku testującego SAM mechanizm synchronizacji** — jeśli plik
   testuje handler, który ten builder ma tylko IMITOWAĆ (np.
   `sync-economy-user.handler.integration.spec.ts` testujący
   `SyncEconomyUserHandler`), NIE migruj go do buildera — to jest realny
   source-of-truth test, insert tam jest celowo inny/mniejszy niż defaults()
   buildera i to jest oczekiwane, nie drift.

## 📂 Przykłady w codebase (LocalHero)

Siedem tabel projekcyjnych ma dziś ten wzorzec, każda kolokowana przy swoim kontekście:

```
src/contexts/neighborhood-economy/infrastructure/repositories/__fixtures__/economy-user-projection.fixtures.ts
src/contexts/engagement/infrastructure/repositories/__fixtures__/engagement-user-projection.fixtures.ts
src/contexts/geographic-auth/infrastructure/repositories/__fixtures__/geographic-auth-user-projection.fixtures.ts
src/contexts/organization/infrastructure/repositories/__fixtures__/organization-user-projection.fixtures.ts
src/contexts/user-profile/infrastructure/repositories/__fixtures__/user-profile-projection.fixtures.ts
src/contexts/user-profile/infrastructure/repositories/__fixtures__/user-profile-stats-projection.fixtures.ts
src/contexts/community-communication/infrastructure/user-projections/repositories/__fixtures__/community-communication-user-projection.fixtures.ts
```

## 🔗 Powiązane wzorce

- `infrastructure/repository-pattern.md` — dlaczego repozytorium nigdy nie
  zwraca surowego wiersza (ten builder to świadomy wyjątek TYLKO dla test setupu,
  nie dla produkcyjnego kodu repo).
- `domain/aggregate-pattern.md` — Kategoria 1, gdy tabela ma realny agregat.
- `test-seeding-performance-guide.md` — `seedUserProjectionForContext()` jako
  pokrewny, ale odrębny mechanizm (auto-tworzenie projekcji przy rejestracji
  usera, nie ręczny insert w pojedynczym teście).
- `e2e-hybrid-fixture-pattern.md` — ogólna zasada "fixture to, czego NIE
  testujesz", którą ten wzorzec realizuje dla projekcji cross-context.

## 📋 Historia (LocalHero)

| Task | Data | Rezultat |
|---|---|---|
| `TS-TEST-FIXTURE-001` Faza 0 | 2026-07-10 | `economyUserProjectionRow()` powstaje, migruje 16 plików `*.e2e.spec.ts`, naprawia drift `phone_number` |
| `TS-TEST-FIXTURE-001` Faza 5 | 2026-07-10 | Analogiczne buildery dla `engagement`, `geographic-auth`, `organization`, `user-profile` (×2), `community-communication` |
| `TS-TEST-FIXTURE-003` | 2026-07-11 | Audyt potwierdza wzorzec jako docelowy dla Kategorii 2; `authorization/user-projection-seeder.ts` (32+272 konsumentów) zidentyfikowany jako "Kategoria 2 w złym miejscu" — pozostaje przez wzgląd na blast-radius, deleguje wewnętrznie |
| `TS-TEST-FIXTURE-005` | 2026-07-11 | 44 pliki `*.integration.spec.ts` zmigrowane do `economyUserProjectionRow()`; 1 plik świadomie wyłączony (`sync-economy-user.handler.integration.spec.ts` — source-of-truth test mechanizmu sync, patrz Anti-pattern #4) |
