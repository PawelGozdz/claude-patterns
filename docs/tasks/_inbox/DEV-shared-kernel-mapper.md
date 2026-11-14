---
id: DEV-shared-kernel-mapper
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: SHARED-KERNEL-MAPPER
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-shared-kernel-mapper

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) — error-mapper.md zna tylko mapper per kontekst. Błędy shared kernelu (Money: CurrencyMismatchError, InvalidMoneyAmountError; identyfikatory PESEL/NIP/REGON) nie mają miejsca na wpis w mapperze ani guardianie, więc trafiają do GlobalFallbackErrorMapper. Karta powinna wskazać, gdzie rejestrować takie błędy (mapper kontekstu wołającego z guardianem?).
