# Security Invariants — Rule Card

<!-- Egzekwowalne streszczenie security-invariants-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): security-invariants-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: kontrolery, handlery, guardy, serwisy i repozytoria dotykające HTTP, persystencji albo logów

Pięć niezmienników obowiązujących KAŻDĄ implementację, niezależnie od zakresu funkcji.

## MUST

- **SI1** — Tożsamość użytkownika pochodzi z kontekstu uwierzytelnionego żądania. Schematy Zod ciała żądania na granicy kontrolera **nie zawierają pola `userId`** (IDOR: klient podstawia cudze ID i działa w jego imieniu).
- **SI2** — Każda metoda kontrolera ma jawny dekorator: `@Auth()` (opcjonalnie z `@RequirePermissions(...)`) albo `@Public()` z komentarzem uzasadniającym. Brak dekoratora spada na domyślną politykę, która w incydentach produkcyjnych bywała po cichu przestawiona na „allow".
- **SI3** — Rate limit działa **fail-closed**: gdy backend limitu (Redis, store w pamięci) jest niedostępny, guard rzuca 503. Fail-open pozwala obejść limit przez wywołanie awarii backendu.
- **SI4** — Odpowiedzi HTTP nie zawierają surowego `error.message` ani `error.stack` z błędów infrastruktury — mapowanie na komunikaty generyczne wg `safe-error-propagation-pattern.md`.
- **SI5** — Wywołania loggera nie zawierają PII. Identyfikuj po ID, nie po danych osobowych.

## MUST NOT

- **N1** — ❌ `userId` w schemacie ciała żądania.
- **N2** — ❌ Metoda kontrolera bez `@Auth()`/`@Public()` — `code-quality-verifier` odrzuca taki PR.
- **N3** — ❌ `catch { return true }` w guardzie rate-limitu (fail-open).
- **N4** — ❌ `throw new BadRequestException(error.message)` i pochodne.
- **N5** — ❌ E-mail, numer telefonu, adres, treść wiadomości w polach logu.

## Egzekwowanie

Hook `check-patterns-read.js` blokuje zapis do `*.controller.ts`, dopóki ten wzorzec nie zostanie przeczytany. Obecność grounding'u sprawdza hook, zgodność reguła po regule — `code-quality-verifier` (VETO) i `security-e2e-verifier`.
