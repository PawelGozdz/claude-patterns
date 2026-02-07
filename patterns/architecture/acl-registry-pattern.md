# ACL Registry Pattern

## 🎯 Problem

**Bounded contexts need to communicate without violating DDD isolation principles.**

When implementing DDD in a monolithic NestJS application:
- Contexts need immediate data from other contexts (can't always use eventual consistency)
- Direct module imports create circular dependencies and tight coupling
- Importing adapters from other contexts breaks bounded context autonomy
- Type safety is still required for compile-time checking

**Real Project Example**: Auth context needs verification capabilities from Authorization context to generate JWT tokens with user capabilities during login.

## ✅ Solution

**ACL Registry Pattern** uses a global service locator to retrieve cross-context adapters at runtime, maintaining type safety through TypeScript generics with inline interfaces.

**Key Components**:
1. **ACLRegistryService** - Global `@Global()` module providing service locator
2. **Context Adapters** - Each context exposes an API adapter (e.g., `AuthorizationContextAPI`)
3. **Runtime Retrieval** - Contexts inject registry and retrieve adapters via `getGlobalRequired<T>()`
4. **Inline Interfaces** - Type safety without cross-context imports

## 🔧 Implementation

### Step 1: Module Setup (Source Context)

**✅ CORRECT**: Import only ACLModule (global)

```typescript
// src/contexts/auth/auth.module.ts
import { ACLModule } from '@shared/infrastructure/acl';

@Module({
  imports: [
    ACLModule, // Global module - provides ACL registry everywhere
  ],
  providers: [
    UserCapabilitiesCalculatorService, // Service needing cross-context access
  ],
})
export class AuthModule {}
```

**❌ WRONG**: Direct context import

```typescript
// ❌ NEVER DO THIS
import { AuthorizationModule } from '@contexts/authorization/authorization.module';

@Module({
  imports: [
    AuthorizationModule, // VIOLATES DDD! Creates tight coupling + circular deps
  ],
})
export class AuthModule {}
```

### Step 2: Service Implementation (Consumer)

**Real Project Code** from `src/contexts/auth/application/services/user-capabilities-calculator.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';
import { ACL_REGISTRY_SERVICE, ACLRegistryService } from '@shared/infrastructure/acl';

@Injectable()
export class UserCapabilitiesCalculatorService {
  constructor(
    @Inject(ACL_REGISTRY_SERVICE)
    private readonly aclRegistry: ACLRegistryService
  ) {}

  async calculateAllCapabilities(userId: string): Promise<Result<string[], Error>> {
    try {
      const capabilities: string[] = [];

      // ✅ Step A: Retrieve adapter from registry with inline interface
      // NO imports from Authorization context - type safety via generics
      const authorizationAdapter = this.aclRegistry.getGlobalRequired<{
        getUserCapabilities: (
          userId: string
        ) => Promise<Result<{ userId: string; capabilities: string[] }, Error>>;
      }>('authorization'); // Registry key = context name

      // ✅ Step B: Call methods on retrieved adapter
      const verificationResult = await authorizationAdapter.getUserCapabilities(userId);

      if (verificationResult.isFailure) {
        // Handle gracefully - continue with empty capabilities
        return Result.ok([]);
      }

      capabilities.push(...verificationResult.value.capabilities);
      return Result.ok(capabilities);
    } catch (error) {
      return Result.fail(new Error(`Failed to calculate capabilities: ${error.message}`));
    }
  }
}
```

**Key Points**:
- `@Inject(ACL_REGISTRY_SERVICE)` - standard NestJS injection token
- `getGlobalRequired<T>('authorization')` - runtime retrieval with type parameter
- Inline interface definition - NO imports from Authorization context
- Throws if adapter not registered (fail-fast for missing dependencies)

### Step 3: Adapter Registration (Provider Context)

**Real Project Code** from `src/contexts/authorization/authorization.module.ts`:

```typescript
import { OnModuleInit } from '@nestjs/common';
import { ACL_REGISTRY_SERVICE, ACLRegistryService } from '@shared/infrastructure/acl';

export class AuthorizationModule implements OnModuleInit {
  constructor(
    @Inject(ACL_REGISTRY_SERVICE)
    private readonly aclRegistry: ACLRegistryService,
    @Inject(AuthorizationContextAPI)
    private readonly authorizationContextAPI: AuthorizationContextAPI
  ) {}

  onModuleInit() {
    // Register Authorization Context API in global ACL registry
    this.aclRegistry.registerGlobal(
      'authorization', // Registry key - used by other contexts
      this.authorizationContextAPI, // Adapter instance with methods
      'Authorization context API with capabilities' // Description
    );
  }
}
```

**Registry Key Convention**: Lowercase context name (`'authorization'`, `'auth'`, `'geographic-auth'`)

### Step 4: Adapter Implementation

**Real Project Code** from `src/contexts/authorization/infrastructure/acl/authorization-context-api.ts`:

```typescript
@Injectable()
export class AuthorizationContextAPI implements IACLAdapter<any, any, any> {
  constructor(
    @Inject(USER_CAPABILITIES_QUERY_REPOSITORY)
    private readonly capabilitiesRepo: IUserCapabilitiesQueryRepository
  ) {}

  /**
   * Get user capabilities - called by other contexts via ACL Registry
   */
  async getUserCapabilities(
    userId: string
  ): Promise<Result<{ userId: string; capabilities: string[] }, Error>> {
    try {
      const capabilities = await this.capabilitiesRepo.getUserCapabilities(userId);

      if (!capabilities) {
        return Result.ok({ userId, capabilities: [] });
      }

      return Result.ok({
        userId,
        capabilities: capabilities.capabilities || [],
      });
    } catch (error) {
      return Result.fail(new Error(`Failed to get user capabilities: ${error.message}`));
    }
  }

  // Other cross-context operations...
}
```

## 📋 Rules

### MUST

- ✅ **MUST** inject `ACLRegistryService` using `@Inject(ACL_REGISTRY_SERVICE)` token
- ✅ **MUST** define adapter interface inline with TypeScript generics (no imports)
- ✅ **MUST** register adapters in `onModuleInit()` of provider context
- ✅ **MUST** use lowercase context names as registry keys
- ✅ **MUST** return `Result<T, E>` from adapter methods (hybrid error handling)
- ✅ **MUST** handle adapter retrieval failures gracefully

### MUST NOT

- ❌ **MUST NOT** import modules from other bounded contexts
- ❌ **MUST NOT** import adapter classes from other contexts (use inline interfaces)
- ❌ **MUST NOT** inject adapters directly in constructor
- ❌ **MUST NOT** store adapter references in class properties (retrieve each time)
- ❌ **MUST NOT** throw exceptions from adapter methods (use Result pattern)

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Direct Module Import

```typescript
// ❌ WRONG: Cross-context module import
import { AuthorizationModule } from '@contexts/authorization/authorization.module';

@Module({
  imports: [AuthorizationModule], // Creates circular dependency!
})
export class AuthModule {}
```

**Why Bad**: Violates DDD bounded context isolation, creates tight coupling, causes circular dependency errors.

**Fix**: Import only `ACLModule` and use registry for runtime retrieval.

### Anti-Pattern 2: Importing Adapter Class

```typescript
// ❌ WRONG: Importing adapter type from another context
import { AuthorizationContextAPI } from '@contexts/authorization/infrastructure/acl/authorization-context-api';

const adapter = this.aclRegistry.getGlobalRequired<AuthorizationContextAPI>('authorization');
```

**Why Bad**: Creates compile-time dependency between contexts, defeats purpose of ACL pattern.

**Fix**: Use inline interface definition with generics.

### Anti-Pattern 3: Constructor Retrieval

```typescript
// ❌ WRONG: Retrieving adapter in constructor
constructor(@Inject(ACL_REGISTRY_SERVICE) private readonly aclRegistry: ACLRegistryService) {
  this.adapter = this.aclRegistry.getGlobalRequired<AdapterInterface>('authorization');
}
```

**Why Bad**: Adapter may not be registered yet (module initialization order), fails silently.

**Fix**: Retrieve adapter at method call time, not in constructor.

### Anti-Pattern 4: Missing onModuleInit Registration

```typescript
// ❌ WRONG: Adapter provided but never registered
@Module({
  providers: [AuthorizationContextAPI], // Provided but not registered!
})
export class AuthorizationModule {} // No onModuleInit!
```

**Why Bad**: Other contexts will throw "Adapter not found" errors at runtime.

**Fix**: Implement `OnModuleInit` and register in `onModuleInit()`.

## 📚 References

### ADRs
- **ADR-0032**: Module Organization & Circular Dependency Prevention
- **ADR-0037**: Phone-First Authentication with Capabilities Model (first usage)

### Related Patterns
- **User Projection Pattern**: Contexts have local user tables, ACL for immediate queries
- **Hybrid Event System**: Use events for eventual consistency, ACL for immediate needs

### Implementation Files
- `src/shared/infrastructure/acl/acl.module.ts` - Global ACL module
- `src/shared/infrastructure/acl/registry/acl-registry.service.ts` - Registry service
- `src/shared/infrastructure/acl/interfaces/iacl-adapter.interface.ts` - Adapter interface

### Real Examples
1. **Auth → Authorization** (`user-capabilities-calculator.service.ts`)
2. **Community-Communication → Geographic-Auth** (`create-event/handler.ts`)
3. **Authorization → Auth** (`permission-migration.service.ts`)

## 🎯 When to Use

**Use ACL Registry Pattern when:**

1. ✅ **Cross-Context Queries** - One context needs data/operations from another
2. ✅ **Immediate Consistency Required** - Cannot use eventual consistency (domain events)
3. ✅ **Type-Safe Communication** - Need compile-time type checking
4. ✅ **Bounded Context Isolation** - Must maintain DDD autonomy

**Do NOT use ACL Registry when:**

1. ❌ **Eventual Consistency Acceptable** - Use domain events (ADR-0025)
2. ❌ **Same Bounded Context** - Use direct service injection
3. ❌ **One-Way Data Flow** - Use integration events for async communication

### Decision Tree

```
Need data/operation from another bounded context?
├─ Can use eventual consistency (domain events)?
│  ├─ YES → Use Domain Events (ADR-0025)
│  └─ NO → Need immediate consistency
│         └─ Use ACL Registry Pattern ✅
│
└─ Is this same bounded context?
   └─ YES → Direct service injection (no ACL needed)
```

### Testing

**Unit Tests**: Mock ACL Registry

```typescript
describe('UserCapabilitiesCalculatorService', () => {
  let mockAclRegistry: DeepMocked<ACLRegistryService>;

  beforeEach(async () => {
    mockAclRegistry = createMock<ACLRegistryService>();

    const module = await Test.createTestingModule({
      providers: [
        UserCapabilitiesCalculatorService,
        { provide: ACL_REGISTRY_SERVICE, useValue: mockAclRegistry },
      ],
    }).compile();
  });

  it('should retrieve capabilities via ACL Registry', async () => {
    const mockAdapter = {
      getUserCapabilities: vi.fn().mockResolvedValue(
        Result.ok({ userId: 'user-1', capabilities: ['email_verified'] })
      ),
    };
    mockAclRegistry.getGlobalRequired.mockReturnValue(mockAdapter as any);

    const result = await service.calculateAllCapabilities('user-1');

    expect(mockAclRegistry.getGlobalRequired).toHaveBeenCalledWith('authorization');
    expect(result.value).toContain('email_verified');
  });
});
```

**E2E Tests**: Real registry (no mocking needed)

```typescript
describe('Cross-Context Communication (E2E)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule, // Imports ACLModule
        AuthorizationModule, // Registers adapter in onModuleInit()
      ],
    }).compile();

    await app.init(); // Triggers onModuleInit() - adapter registration
  });

  it('should get capabilities from Authorization context', async () => {
    const result = await authService.calculateAllCapabilities('test-user-1');
    expect(result.value).toEqual(expect.arrayContaining(['email_verified']));
  });
});
```

---

**Pattern Discovered**: 2025-12-16 (TS-SPRINT0-002)
**Status**: Production-proven (3 contexts using)
**Lines**: 296
