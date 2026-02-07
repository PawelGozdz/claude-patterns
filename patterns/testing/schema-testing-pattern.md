# Schema Testing Pattern

## 🎯 Problem

**Zod schemas need comprehensive testing to prevent security vulnerabilities and runtime errors.**

In API validation layers:
- Incomplete schema tests miss edge cases (null, undefined, wrong types)
- Security vulnerabilities in format validation (XSS, SQL injection)
- Performance issues with large payloads (DoS attacks)
- Type coercion bugs (string "123" vs number 123)
- Missing boundary testing (min/max values)

**Real Risk**: Untested schemas allow malicious input into business layer.

## ✅ Solution

**6-Category Testing Methodology** ensures comprehensive coverage for ALL Zod schemas:

1. **✅ Valid Inputs** - Boundary testing with realistic scenarios
2. **🚫 Invalid Inputs** - Type rejection and format validation
3. **🔒 Security Attack Vectors** - Format validation ONLY (ADR-0021)
4. **📐 Type Safety & Coercion** - Strict type enforcement
5. **🎯 Business Logic Edge Cases** - Domain-specific scenarios (Polish characters, etc.)
6. **⚡ Performance & DoS Protection** - Benchmarks < 10ms for 1000 iterations

## 🔧 Implementation

### Test Template Structure

**Real Project Code** from `shared/database/schemas/__tests__/postgis.schemas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { coordinateSchema } from '../postgis.schemas';

describe('Coordinate Schema - Security Tests', () => {
  const validCoordinate = {
    longitude: 21.1557,
    latitude: 51.0434,
  }; // Starachowice, Poland coordinates

  // 1. ✅ Valid Inputs - Boundary testing
  describe('✅ Valid Inputs', () => {
    it('should accept valid Starachowice coordinates', () => {
      expect(() => coordinateSchema.parse(validCoordinate)).not.toThrow();
    });

    it('should accept minimum longitude (-180)', () => {
      expect(() => coordinateSchema.parse({ longitude: -180, latitude: 0 })).not.toThrow();
    });

    it('should accept maximum longitude (180)', () => {
      expect(() => coordinateSchema.parse({ longitude: 180, latitude: 0 })).not.toThrow();
    });

    it('should accept high precision decimals', () => {
      expect(() =>
        coordinateSchema.parse({ longitude: 21.155728392847, latitude: 51.043482934829 })
      ).not.toThrow();
    });

    it('should accept integer coordinates', () => {
      expect(() => coordinateSchema.parse({ longitude: 21, latitude: 51 })).not.toThrow();
    });
  });

  // 2. 🚫 Invalid Inputs - Type rejection
  describe('🚫 Invalid Inputs', () => {
    it('should reject longitude below minimum (-180)', () => {
      expect(() => coordinateSchema.parse({ longitude: -181, latitude: 0 })).toThrow(ZodError);
    });

    it('should reject longitude above maximum (180)', () => {
      expect(() => coordinateSchema.parse({ longitude: 181, latitude: 0 })).toThrow(ZodError);
    });

    it('should reject missing longitude', () => {
      expect(() => coordinateSchema.parse({ latitude: 51.0434 })).toThrow(ZodError);
    });

    it('should reject string instead of number', () => {
      expect(() => coordinateSchema.parse({ longitude: '21.1557', latitude: 51 })).toThrow(
        ZodError
      );
    });
  });

  // 3. 🔒 Security Attack Vectors - Format validation ONLY (ADR-0021)
  describe('🔒 Security Attack Vectors - Format Validation Only', () => {
    it('should accept XSS-like content (format only per ADR-0021)', () => {
      const schema = z.object({ name: z.string() });
      expect(() =>
        schema.parse({ name: '<script>alert("xss")</script>' })
      ).not.toThrow();
    });

    it('should accept SQL injection-like content (format only per ADR-0021)', () => {
      const schema = z.object({ query: z.string() });
      expect(() =>
        schema.parse({ query: "'; DROP TABLE users; --" })
      ).not.toThrow();
    });

    it('should accept command injection-like content (format only per ADR-0021)', () => {
      const schema = z.object({ cmd: z.string() });
      expect(() =>
        schema.parse({ cmd: '$(rm -rf /)' })
      ).not.toThrow();
    });
  });

  // 4. 📐 Type Safety & Coercion
  describe('📐 Type Safety & Coercion', () => {
    it('should reject non-integer for integer fields', () => {
      const schema = z.object({ count: z.number().int() });
      expect(() => schema.parse({ count: 3.14 })).toThrow(ZodError);
    });

    it('should reject non-boolean for boolean fields', () => {
      const schema = z.object({ active: z.boolean() });
      expect(() => schema.parse({ active: 'true' })).toThrow(ZodError);
    });

    it('should COERCE string to number (if using z.coerce)', () => {
      const schema = z.object({ page: z.coerce.number().int() });
      const result = schema.parse({ page: '42' });
      expect(result.page).toBe(42);
      expect(typeof result.page).toBe('number');
    });
  });

  // 5. 🎯 Business Logic Edge Cases
  describe('🎯 Business Logic Edge Cases', () => {
    it('should accept Polish characters (Łódź, Wróbel)', () => {
      const schema = z.object({ name: z.string() });
      expect(() =>
        schema.parse({ name: 'Łukasz Wróbel z Łodzi' })
      ).not.toThrow();
    });

    it('should handle empty optional nested objects', () => {
      const schema = z.object({ meta: z.object({}).optional() });
      expect(() => schema.parse({ meta: {} })).not.toThrow();
    });

    it('should accept valid enum combinations', () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive']),
        type: z.enum(['free', 'premium']),
      });
      expect(() =>
        schema.parse({ status: 'active', type: 'premium' })
      ).not.toThrow();
    });
  });

  // 6. ⚡ Performance & DoS Protection
  describe('⚡ Performance & DoS Protection', () => {
    it('should validate efficiently (< 10ms for 1000 iterations)', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        coordinateSchema.parse(validCoordinate);
      }
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10);
    });

    it('should handle large arrays (100+ items)', () => {
      const schema = z.object({ items: z.array(z.string()) });
      const largeArray = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      expect(() => schema.parse({ items: largeArray })).not.toThrow();
    });

    it('should enforce string length limits', () => {
      const schema = z.object({ name: z.string().max(100) });
      const tooLong = 'a'.repeat(101);
      expect(() => schema.parse({ name: tooLong })).toThrow(ZodError);
    });
  });
});
```

### Zod-Specific Patterns

**z.coerce Testing**:
```typescript
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

it('should COERCE string page to number', () => {
  const result = querySchema.parse({ page: '5' });
  expect(result.page).toBe(5);
  expect(typeof result.page).toBe('number');
});
```

**z.refine Testing**:
```typescript
const registrationSchema = z.object({
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'Must accept terms',
  }),
});

it('should reject acceptTerms as false (must be true)', () => {
  expect(() => registrationSchema.parse({ acceptTerms: false })).toThrow(ZodError);
});
```

**z.literal Testing**:
```typescript
const errorSchema = z.object({
  status: z.literal('fail'),
});

it('should reject non-literal status', () => {
  expect(() => errorSchema.parse({ status: 'error' })).toThrow(ZodError);
});
```

## 📋 Rules

### MUST

- ✅ **MUST** test ALL 6 categories for every schema
- ✅ **MUST** accept malicious content (XSS, SQL injection) per ADR-0021 (format only)
- ✅ **MUST** test Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż)
- ✅ **MUST** benchmark performance (< 10ms for 1000 iterations)
- ✅ **MUST** test boundary values (min, max, zero, negative)
- ✅ **MUST** test z.coerce if schema uses it

### MUST NOT

- ❌ **MUST NOT** reject XSS/SQL injection (content security is business layer concern)
- ❌ **MUST NOT** skip performance tests (DoS protection)
- ❌ **MUST NOT** skip edge cases (optional fields, empty objects)
- ❌ **MUST NOT** use expect().toThrow() without ZodError type

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Content Security in Schema Tests

```typescript
// ❌ WRONG: Testing content security (ADR-0021 violation)
it('should reject XSS content', () => {
  expect(() => schema.parse({ name: '<script>alert("xss")</script>' })).toThrow();
});
```

**Why Bad**: ADR-0021 separates format validation (API) from content security (business layer).

**Fix**: Expect schema to ACCEPT malicious content (format is valid).

### Anti-Pattern 2: Missing Performance Tests

```typescript
// ❌ WRONG: No performance benchmarks
describe('Schema Tests', () => {
  it('should validate input', () => {
    expect(() => schema.parse(validData)).not.toThrow();
  });
  // Missing: Performance & DoS Protection tests
});
```

**Why Bad**: Allows inefficient schemas causing DoS vulnerabilities.

**Fix**: Add Category 6 tests with < 10ms benchmark for 1000 iterations.

### Anti-Pattern 3: Incomplete Boundary Testing

```typescript
// ❌ WRONG: Only testing happy path
it('should accept valid coordinates', () => {
  expect(() => schema.parse({ longitude: 21, latitude: 51 })).not.toThrow();
});
```

**Why Bad**: Misses edge cases (min/max values, high precision decimals).

**Fix**: Test boundary values (-180/180 for longitude, -90/90 for latitude).

### Anti-Pattern 4: Missing z.coerce Tests

```typescript
// ❌ WRONG: Schema uses z.coerce but no test for string→number conversion
const schema = z.object({ page: z.coerce.number() });

it('should accept page number', () => {
  expect(() => schema.parse({ page: 5 })).not.toThrow();
  // Missing: Test with string input '5'
});
```

**Why Bad**: Doesn't verify coercion behavior, runtime bugs possible.

**Fix**: Test with both string and number inputs, verify type after parse.

## 📚 References

### ADRs
- **ADR-0021**: Validation Layer Separation (format validation vs content security)
- **ADR-0020**: Zod Schema Architecture (centralized schemas)

### Related Patterns
- **Dual Identity Pattern**: userId NOT in schemas (security)
- **API Controller Patterns**: Zod schema validation in controllers

### Implementation Files
- `src/shared/database/schemas/postgis.schemas.ts` - Schema definitions
- `src/shared/database/schemas/__tests__/postgis.schemas.test.ts` - Real example
- `project-orchestration/ddd/patterns/schema-testing-pattern.md` - Full template

## 🎯 When to Use

**Use Schema Testing Pattern for:**

1. ✅ **ALL Zod schemas** (request DTOs, query params, response DTOs)
2. ✅ **API validation schemas** (controllers, endpoints)
3. ✅ **Database validation schemas** (PostGIS, geometry, etc.)

**Do NOT use for:**

1. ❌ **Domain validation** (use Specification tests instead)
2. ❌ **Business rules** (use domain layer tests)
3. ❌ **Authorization** (use separate authorization tests)

### Testing Checklist

**For Each Schema**:
- [ ] Category 1: Valid inputs (min, max, zero, negative, high precision)
- [ ] Category 2: Invalid inputs (below min, above max, wrong types)
- [ ] Category 3: Security vectors (XSS, SQL, command injection - ACCEPT per ADR-0021)
- [ ] Category 4: Type safety (z.coerce, z.refine, z.literal)
- [ ] Category 5: Edge cases (Polish characters, empty objects, enums)
- [ ] Category 6: Performance (< 10ms for 1000 iterations, length limits)

---

**Pattern Type**: Testing (MANDATORY for all schemas)
**Status**: Production-enforced
**Lines**: 253
