# Security Invariants (Python) — Rule Card

**Tags**: "api:security", "api:authz"

<!-- Egzekwowalne streszczenie python/security-invariants-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, przykłady FastAPI/Pydantic, granice nie-HTTP): security-invariants-pattern.md
     Odpowiednik NestJS/Zod: cross-layer/security-invariants-pattern.md.
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: trasy FastAPI (jeśli projekt wystawia HTTP), workery, konsumenci kolejek, CLI, serwisy i repozytoria dotykające persystencji, procesów zewnętrznych albo logów

Pięć niezmienników obowiązujących KAŻDĄ implementację w Pythonie, niezależnie od zakresu funkcji.

## MUST

- **SI1** — Tożsamość pochodzi z uwierzytelnionego kontekstu (`Depends(get_current_principal)`, metadane wiadomości podpisane przez producenta), **nigdy z wejścia**: model Pydantic ciała żądania ani payload wiadomości nie niesie `user_id`/`actor` decydującego o uprawnieniach (IDOR).
- **SI2** — Każda trasa deklaruje politykę jawnie: zależność auth na routerze albo trasie, a trasa publiczna ma jawny znacznik z uzasadnieniem. Brak deklaracji to nie „domyślnie chronione".
- **SI3** — Limity, throttle, quota, allowlisty i inne bramki są **fail-closed**: gdy backend (Redis, plik konfiguracyjny, usługa licencji) jest niedostępny albo zwraca coś nieoczekiwanego, operacja jest odrzucana (HTTP 503 / wyjątek), nie przepuszczana.
- **SI4** — Żadne wyjście widoczne dla wywołującego (odpowiedź HTTP, wynik CLI, wynik zadania Celery, dane przekazywane do LLM) nie zawiera `str(exc)`, `exc.args` ani tracebacka — mapowanie wg `python/safe-error-propagation-pattern.md`.
- **SI5** — Wywołania loggera nie zawierają PII ani sekretów. Identyfikuj po ID; strukturalne pola, nie f-stringi z obiektami.

## MUST NOT

- **N1** — ❌ `user_id`/`actor` w modelu Pydantic wejścia albo w payloadzie wiadomości użyty do autoryzacji.
- **N2** — ❌ Trasa bez zależności auth i bez jawnego oznaczenia jako publiczna.
- **N3** — ❌ `except Exception: return True` (albo `pass`) w bramce limitu/allowlisty — fail-open.
- **N4** — ❌ `HTTPException(detail=str(exc))`, `return {"error": str(exc)}`, `print(traceback.format_exc())` na wyjściu dla użytkownika.
- **N5** — ❌ E-mail, telefon, token, nagłówek `Authorization`, cały obiekt requestu/odpowiedzi w polach logu.

## Egzekwowanie

Zgodność reguła po regule sprawdza `python-quality-verifier` (VETO) i bramka końcowa bezpieczeństwa z runtime.yml. Wzorzec jest w `patterns.always` bloku `python`, więc trafia do każdego taska projektu Pythonowego.
