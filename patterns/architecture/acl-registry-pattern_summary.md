# ACL Registry — Rule Card
<!-- Egzekwowalne streszczenie acl-registry-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, drzewo decyzji, przykłady testów): acl-registry-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Architecture · **Applies to**: `*.adapter.ts` w `**/infrastructure/acl/`, porty konsumenckie (`*.service.ts`, `*.handler.ts` wołające cross-context), rejestracja w `*.module.ts`
**Base**: `IACLAdapter` (@shared/infrastructure/acl) · **ADR**: 0032, 0037

## MUST
- **ACL1** — komunikacja cross-context WYŁĄCZNIE przez `aclRegistry.getGlobalRequired<T>(key)` — nigdy bezpośredni import z innego kontekstu.
- **ACL2** — `ACLRegistryService` wstrzykiwany przez `@Inject(ACL_REGISTRY_SERVICE)` (token NestJS — nie class injection).
- **ACL3** — interfejs adaptera definiowany inline przy wywołaniu (`getGlobalRequired<{ method(...): ... }>(key)`) — żadnych importów klas z kontekstu dostawcy.
- **ACL4** — adapter rejestrowany w `onModuleInit()` kontekstu dostawcy: `this.aclRegistry.registerGlobal(key, adapter, description)`.
- **ACL5** — adapter implementuje `IACLAdapter` i pochodzi z `**/infrastructure/acl/` kontekstu dostawcy.
- **ACL6** — klucz rejestru to lowercase nazwa kontekstu (`'authorization'`, `'auth'`, `'geographic-auth'`).
- **ACL7** — metody adaptera zwracają `Result<T, Error>` — hybrid error handling, nigdy wyjątek.
- **ACL8** — moduł konsumenta importuje tylko `ACLModule` (globalny), nie moduł dostawcy.
- **ACL9** — adapter pobierany wewnątrz metody (nie w konstruktorze) — gwarancja kolejności inicjalizacji.

## MUST NOT
- **N1** — ❌ `import { XxxModule } from '@contexts/xxx/xxx.module'` w innym kontekście — tworzy circular dep i łamie izolację BC.
- **N2** — ❌ `import { XxxContextAPI } from '@contexts/xxx/infrastructure/acl/...'` — import klasy adaptera między kontekstami niszczy sens wzorca.
- **N3** — ❌ `this.adapter = this.aclRegistry.getGlobalRequired(...)` w konstruktorze — adapter może nie być jeszcze zarejestrowany.
- **N4** — ❌ `throw` z metody adaptera — zawsze `Result.fail(new Error(...))`.
- **N5** — ❌ `implements OnModuleInit` pominięte w module dostawcy — adapter nigdy nie trafi do rejestru.

## Minimal correct skeleton
```ts
// --- DOSTAWCA: src/contexts/authorization/infrastructure/acl/authorization-context-api.ts ---
import { Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';
import { IACLAdapter } from '@shared/infrastructure/acl';

@Injectable()
export class AuthorizationContextAPI implements IACLAdapter<any, any, any> { // ACL5
  async getUserCapabilities(
    userId: string
  ): Promise<Result<{ userId: string; capabilities: string[] }, Error>> {     // ACL7
    try {
      // ... query repo ...
      return Result.ok({ userId, capabilities: [] });
    } catch (e) {
      return Result.fail(new Error(`Failed: ${e.message}`));                  // N4
    }
  }
}

// --- DOSTAWCA: src/contexts/authorization/authorization.module.ts ---
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { ACL_REGISTRY_SERVICE, ACLRegistryService } from '@shared/infrastructure/acl';

export class AuthorizationModule implements OnModuleInit {                    // ACL4, N5
  constructor(
    @Inject(ACL_REGISTRY_SERVICE)                                             // ACL2
    private readonly aclRegistry: ACLRegistryService,
    @Inject(AuthorizationContextAPI)
    private readonly api: AuthorizationContextAPI,
  ) {}

  onModuleInit() {
    this.aclRegistry.registerGlobal('authorization', this.api, 'Authorization context API'); // ACL4, ACL6
  }
}

// --- KONSUMENT: src/contexts/auth/application/services/capabilities-calculator.service.ts ---
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';
import { ACL_REGISTRY_SERVICE, ACLRegistryService } from '@shared/infrastructure/acl';

@Injectable()
export class UserCapabilitiesCalculatorService {
  constructor(
    @Inject(ACL_REGISTRY_SERVICE)                                             // ACL2
    private readonly aclRegistry: ACLRegistryService,
  ) {}

  async calculateAllCapabilities(userId: string): Promise<Result<string[], Error>> {
    try {
      const adapter = this.aclRegistry.getGlobalRequired<{                   // ACL1, ACL3, ACL9
        getUserCapabilities: (uid: string) => Promise<Result<{ userId: string; capabilities: string[] }, Error>>;
      }>('authorization');                                                     // ACL6

      const result = await adapter.getUserCapabilities(userId);
      if (result.isFailure) return Result.ok([]);                            // ACL7
      return Result.ok(result.value.capabilities);
    } catch (e) {
      return Result.fail(new Error(`Failed to calculate capabilities: ${e.message}`));
    }
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `import { XxxModule } from '@contexts/xxx/...'` w innym BC | N1 |
| `import { XxxContextAPI } from '@contexts/xxx/infrastructure/...'` | N2 |
| `this.adapter = this.aclRegistry.getGlobalRequired(...)` w `constructor` | N3 |
| `throw new Error(...)` w metodzie adaptera | N4 |
| moduł dostawcy bez `implements OnModuleInit` / bez `onModuleInit()` | N5 |
| klucz rejestru niezgodny z lowercase nazwą kontekstu | ACL6 |
| metoda adaptera zwraca `T` zamiast `Result<T, Error>` | ACL7 |
| konsument importuje moduł dostawcy zamiast tylko `ACLModule` | ACL8 |
| brak `@Inject(ACL_REGISTRY_SERVICE)` (użyty class injection) | ACL2 |

**Pełny wzorzec**: [`acl-registry-pattern.md`](./acl-registry-pattern.md)
