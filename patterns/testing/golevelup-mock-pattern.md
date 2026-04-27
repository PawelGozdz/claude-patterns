# @golevelup/ts-vitest Mock Pattern

## 🎯 Problem

**Ręczne factory functions i inline obiekty z `vi.fn()` niszczą type safety i generują boilerplate.**

W testach L1/L2 pojawia się kilka anty-wzorców:

```typescript
// ANTY-WZORZEC 1 — własne factory functions
function createMockLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}
// Problem: każda zmiana ILoggerService wymaga aktualizacji tej funkcji.
// Problem: zwraca any, tsc nie wykryje błędów gdy interfejs się zmieni.

// ANTY-WZORZEC 2 — inline obiekty
const mockRepo = { findById: vi.fn(), save: vi.fn() };
// Problem: brak gwarancji że wszystkie metody interfejsu są pokryte.

// ANTY-WZORZEC 3 — proste klasy Mock
class MockLogger implements Partial<ILoggerService> {
  log = vi.fn();
  error = vi.fn();
}
// Problem: boilerplate, brak auto-update przy zmianie interfejsu.

// ANTY-WZORZEC 4 — redundantne vi.fn() w createMock overrides
mockLogger = createMock<ILoggerService>({
  debug: vi.fn(),   // zbędne — createMock już to robi
  info: vi.fn(),    // zbędne
});
```

**Rzeczywisty koszt**: zmiana interfejsu o 1 metodę wymaga aktualizacji dziesiątek factory functions. TypeScript nie wyłapie brakujących metod przy `as any`.

## ✅ Solution

**`createMock<T>()` z `@golevelup/ts-vitest`** — auto-mockuje każdą metodę interfejsu jako `vi.fn()`, zwraca `DeepMocked<T>` z pełnym type safety.

```typescript
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';

// Wszystkie metody ILoggerService → automatycznie vi.fn()
// Zmiana interfejsu → TypeScript natychmiast wykryje błąd w teście
mockLogger = createMock<ILoggerService>();
```

## 🔧 Implementation

### Wzorzec bazowy (L1 handler.spec.ts — 80% przypadków)

```typescript
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Result } from '@vytches/ddd';

describe('SomeCommandHandler (L1 Unit)', () => {
  let handler: SomeCommandHandler;
  let mockRepository: DeepMocked<ISomeRepository>;
  let mockLogger: DeepMocked<ILoggerService>;
  let mockRequestContext: DeepMocked<RequestContextService>;

  const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockRepository = createMock<ISomeRepository>();
    mockLogger = createMock<ILoggerService>();
    mockRequestContext = createMock<RequestContextService>();

    // Override tylko tam gdzie potrzebna konkretna wartość
    mockRequestContext.getUserId.mockReturnValue(TEST_USER_ID);

    handler = new SomeCommandHandler(mockLogger, mockRequestContext, mockRepository);
  });

  it('should do something on success', async () => {
    mockRepository.findById.mockResolvedValue(Result.ok(someAggregate));
    mockRepository.save.mockResolvedValue(Result.empty());

    const result = await handler.executeBusinessLogic(new SomeCommand());

    expect(result.isSuccess).toBe(true);
    expect(mockRepository.save).toHaveBeenCalledOnce();
  });
});
```

### Wzorzec z customową logiką (Redis, conditional returns)

Gdy mock potrzebuje logiki warunkowej — użyj `createMock` z partial override zamiast własnej factory function:

```typescript
// PRZED
function createMockRedis(storedOtp: string | null = VALID_OTP) {
  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.endsWith(':otp')) return storedOtp;
      return null;
    }),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
  };
}

// PO — createMock jako baza, override tylko dla potrzebnych metod
let mockRedis: DeepMocked<RedisClient>;
beforeEach(() => {
  mockRedis = createMock<RedisClient>({
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.endsWith(':otp')) return VALID_OTP;
      return null;
    }),
  });
  // del, incr i reszta → automatycznie vi.fn() z createMock
});
```

### Testowanie wariantów (parametryzowane)

Gdy test potrzebuje różnych zachowań mocka — rekonfiguruj w każdym teście:

```typescript
beforeEach(() => {
  mockRedis = createMock<RedisClient>();
});

it('returns OTP when key exists', async () => {
  mockRedis.get.mockImplementation(async (key) =>
    key.endsWith(':otp') ? VALID_OTP : null
  );
  // ...
});

it('returns null when OTP expired', async () => {
  mockRedis.get.mockResolvedValue(null);
  // ...
});
```

---

## 🚫 Co NIE wymaga migracji

### 1. `vi.mock()` — mockowanie modułów Node.js

```typescript
vi.mock('@nestjs/config', () => ({ ConfigService: vi.fn() }));
// Ortogonalne do tematu — zostawić.
```

### 2. `vi.spyOn()` — szpiegowanie na realnych obiektach

```typescript
vi.spyOn(aggregate, 'someMethod').mockReturnValue(Result.ok(value));
// Zostawić — tu chodzi o realny obiekt, nie interfejs.
```

### 3. Mock-klasy ze stanem wewnętrznym

```typescript
// ZOSTAWIĆ — śledzenie wywołań przez własne pola jest intencjonalne
class MockJobRequestRepository implements Partial<IJobRequestCommandRepository> {
  public findCalls: string[] = [];
  public saveCalls: JobRequestAggregate[] = [];

  async findById(id: EntityId<string>) {
    this.findCalls.push(id.value);
    return Result.ok(this.mockJobRequest);
  }
}
```

### 4. Mock-klasy dziedziczące z realnej klasy

```typescript
// ZOSTAWIĆ — extends wymaga prawdziwego konstruktora
class MockRequestContextService extends RequestContextService {
  private mockUserId: string = randomUUID();
  constructor() { super(null as any); }
  setMockUserId(userId: string) { this.mockUserId = userId; }
  override getUserId(): string { return this.mockUserId; }
}
```

### 5. Testy E2E (`.e2e.spec.ts`)

E2E testy mają własny kontekst mockowania (moduły NestJS, real HTTP). Oceniać indywidualnie.

---

## 🔍 Weryfikacja po migracji

```bash
tsc --noEmit   # zero błędów TypeScript — główny sygnał że migracja jest poprawna
vitest run     # wszystkie testy zielone
```

Grep do sprawdzenia pozostałości:

```bash
# Znajdź pliki z własną funkcją createMockXxx (do migracji)
grep -r "function createMock[A-Z]" src/ --include="*.spec.ts" --include="*.test.ts" -l

# Znajdź pliki z redundantnymi vi.fn() w createMock overrides (do uproszczenia)
grep -rA5 "createMock<" src/ --include="*.spec.ts" | grep "vi\.fn()," | grep -v "mockImplementation\|mockReturnValue\|mockResolvedValue"
```

---

## 📂 Przykłady w codebase

### Dobre wzorce (kopiować)

```
src/contexts/neighborhood-economy/application/service-provider/commands/deactivate-service-provider/__tests__/handler.spec.ts
src/contexts/neighborhood-economy/application/service-provider/commands/enable-service-provider/__tests__/handler.spec.ts
src/contexts/community-communication/application/events/commands/apply-event-moderation-decision/__tests__/handler.spec.ts
```

### Do migracji — factory functions (Wzorzec 1)

```
src/contexts/auth/application/commands/confirm-change-email-phone/__tests__/handler.spec.ts
src/contexts/auth/application/commands/verify-phone-registration/__tests__/handler.spec.ts
src/contexts/auth/application/commands/login-with-phone/__tests__/handler.spec.ts
```

### Do oceny — mock-klasy (Wzorzec 4, selektywna konwersja)

```
src/contexts/neighborhood-economy/application/quick-jobs/commands/submit-job-request-for-moderation/__tests__/handler.spec.ts
```

---

## 🔗 Powiązane wzorce

- `testing-pyramid-pattern.md` — kiedy pisać L1 vs L2 vs L3
- `e2e-hybrid-fixture-pattern.md` — setup danych w testach E2E
- `context-isolation-pattern.md` — izolacja między kontekstami w testach

## 📋 Scope migracji (LocalHero, 2026-04-19)

| Kategoria | Pliki | Akcja |
|---|---|---|
| Już używają @golevelup | 28 | Weryfikacja Wzorca 4 (redundantne vi.fn()) |
| Factory functions (`function createMockXxx`) | 62 | Migracja — Faza 1+2 |
| Inline obiekty (`{ method: vi.fn() }`) | 30 | Migracja — Faza 1+2 |
| Mock-klasy proste | ~25 z 98 | Migracja — Faza 3 |
| Mock-klasy stanowe / extends | ~73 z 98 | Zostawić |
| `vi.mock()` | 19 | Zostawić |
| `vi.spyOn()` | 205 | Zostawić |
