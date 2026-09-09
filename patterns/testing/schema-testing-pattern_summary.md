# Schema Testing — Rule Card

**Tags**: "api:tests:contract", "api:api-surface"
<!-- Egzekwowalne streszczenie schema-testing-pattern.md (ADR-0021).
     Pełny wzorzec: schema-testing-pattern.md -->

**Layer**: Testing
**Status**: Production-enforced
**Source**: schema-testing-pattern.md

## MUST
- **ST1** — Test ALL 6 categories for every Zod schema: Valid Inputs, Invalid Inputs, Security
  Attack Vectors (format only), Type Safety & Coercion, Business Logic Edge Cases, Performance &
  DoS Protection.
- **ST2** — Schema tests **accept** malicious content (XSS, SQL injection) as long as it's the
  right **format** — per ADR-0021, content security is a business-layer concern, format
  validation is the schema's only job.
- **ST3** — Test Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż) wherever the schema accepts
  free-text — a domain-specific edge case, not optional.
- **ST4** — Benchmark schema parse performance: < 10ms for 1000 iterations (DoS protection).
- **ST5** — Test boundary values: min, max, zero, negative.
- **ST6** — If the schema uses `z.coerce`, add explicit coercion tests (e.g. `"false"` → does it
  actually become `false`? — see nestjs-module-import-pitfalls.md Problem 3 for the concrete
  `z.coerce.boolean()` trap this category exists to catch).
- **ST7** — Assert with the `ZodError` type specifically, not a bare `expect().toThrow()`.

## MUST NOT
- **N1** — ❌ Make a schema test **reject** XSS/SQL-injection-shaped input — that's a business
  layer concern (Anti-Pattern 1); the schema only validates format, not content safety.
- **N2** — ❌ Skip performance tests — DoS protection depends on parse-time benchmarks existing.
- **N3** — ❌ Skip edge cases (optional fields, empty objects) — Anti-Pattern 3, incomplete
  boundary testing.
- **N4** — ❌ Use `expect(() => schema.parse(x)).toThrow()` without checking the thrown error is
  a `ZodError` — a non-Zod exception would pass the same assertion.
- **N5** — ❌ Skip explicit tests for `z.coerce` fields — Anti-Pattern 4; coercion bugs (string
  `"false"` becoming boolean `true`) are silent and only caught by a dedicated test.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Every Zod schema used at an API/request boundary.
- ✅ Schemas with `z.coerce` fields (env vars, query params).
- ✅ Schemas accepting free-text fields that may include Polish characters or attack-vector
  shaped strings.
- ❌ Testing business-rule rejection of malicious content — that belongs to L1 Specification
  tests in the domain layer, not schema tests.
- ❌ Domain aggregate/entity tests — this pattern is specifically for the Zod validation layer.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| Test schematu oczekuje odrzucenia `<script>` XSS payload | ST2/N1 |
| Brak testu benchmarku parse < 10ms / 1000 iteracji | ST4/N2 |
| `expect(() => schema.parse(x)).toThrow()` bez sprawdzenia `ZodError` | ST7/N4 |
| Schema z `z.coerce.boolean()` bez dedykowanego testu `"false"` | ST6/N5 |
| Brak testu polskich znaków dla pola tekstowego | ST3 |

**Pełny wzorzec**: [`schema-testing-pattern.md`](./schema-testing-pattern.md)
