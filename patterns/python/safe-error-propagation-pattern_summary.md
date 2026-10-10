# Safe Error Propagation (Python) — Rule Card

**Tags**: "api:security", "api:api-surface:errors"

<!-- Egzekwowalne streszczenie python/safe-error-propagation-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (przykłady SQLAlchemy/asyncpg/redis, subprocess, Celery): safe-error-propagation-pattern.md
     Odpowiednik NestJS/Kysely: cross-layer/safe-error-propagation-pattern.md.
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: repozytoria i adaptery, wyjątki domenowe, serwisy, handlery wyjątków FastAPI, wyniki CLI/workerów/procesów zewnętrznych

Surowy błąd infrastruktury (SQL, nazwy tabel, connection stringi, stderr narzędzia) nigdy nie wychodzi poza proces — zostaje w logu serwera.

## MUST

- **SEP1** — Repozytorium/adapter rzuca wyjątek z **generycznym** komunikatem; surowy błąd tylko jako `__cause__` (`raise RepoError("query failed") from exc`).
- **SEP2** — Wyjątki domenowe mają stały `code` i statyczny komunikat; konstruktor **nie przyjmuje** parametru `details` ze szczegółami infrastruktury.
- **SEP3** — Serwis najpierw loguje surowy błąd po stronie serwera (z kontekstem: ID operacji), potem rzuca generyczny błąd domenowy.
- **SEP4** — W bloku `except` `str(exc)` nie trafia do wartości zwracanej ani do nowo rzucanego wyjątku — także dla stderr/stdout procesów zewnętrznych.
- **SEP5** — Handlery wyjątków FastAPI (`@app.exception_handler`) budują odpowiedź ze **statycznych** komunikatów mapowanych po `code`, nigdy z `str(exc)`/`exc.args`.
- **SEP6** — Mapper po `code` ma `case _:` z **własnym** generycznym komunikatem — nie dziedziczy treści sąsiedniego przypadku.
- **SEP7** — Projekt z handlerami wyjątków ma mechaniczny guardian test: odkrywa pliki skanem (`Path.rglob`), nie ręczną listą; wykrywa leak przez `ast`, nie regex na pojedynczy kształt; ma kontrolę anty-wakuacyjną (minimalna liczba plików + nazwany plik-referencja), żeby zepsuty skan nie dał „0 testów = zielono".

## MUST NOT

- **N1** — ❌ `raise DomainError(f"... {exc}")` / `DomainError(str(exc))`.
- **N2** — ❌ `HTTPException(status_code=500, detail=str(exc))`.
- **N3** — ❌ Zwracanie `result.stderr` narzędzia zewnętrznego do wywołującego albo do LLM bez przejścia przez redakcję.
- **N4** — ❌ `except Exception as exc: return {"error": repr(exc)}` w zadaniu Celery/workerze.

## Powiązane

`python/security-invariants-pattern.md` (SI4 to ta sama reguła od strony wyjścia) · `python/fastapi-patterns.md` · `cross-layer/safe-error-propagation-pattern.md` (wersja NestJS)
