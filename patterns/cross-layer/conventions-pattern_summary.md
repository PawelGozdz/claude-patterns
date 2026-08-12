# DDD Conventions & Naming — Rule Card

<!-- Egzekwowalne streszczenie conventions-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (tabele, struktura folderów, styl kodu): conventions-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: nazwy plików, układ folderów kontekstu, eksporty barrel, organizacja testów

## MUST

- **CV1** — Pliki warstwy domeny mają rdzeń nazwy i sufiks typu: `*.aggregate.ts`, `*.entity.ts`, `*.vo.ts`, `*.event.ts`, `*.specification.ts`, `*.policy.ts`, `*.domain-service.ts`.
- **CV2** — Warstwa aplikacji i infrastruktury: `*.service.ts` (serwis aplikacyjny), `*.repository.ts` (interfejs), `*-kysely.repository.ts` (implementacja), `*.dto.ts`, `*.controller.ts`, `*.mapper.ts`.
- **CV3** — CQRS: gdy plik leży w folderze niosącym nazwę operacji (`commands/register-user/`, `queries/get-user-by-id/`, `event-handlers/job-completed/`), nazwa pliku to `command.ts` / `query.ts` / `handler.ts` / `integration-handler.ts` — **bez prefiksu powtarzającego folder**.
- **CV4** — Gdy wiele plików tego samego typu dzieli jeden folder (np. `application/event-handlers/` z pięcioma handlerami), rdzeń nazwy zostaje: `user-registered.handler.ts`.
- **CV5** — Testy handlera leżą w `__tests__/` obok niego: `register-user/__tests__/handler.spec.ts`.

## MUST NOT

- **N1** — ❌ `commands/register-user/register-user.command.ts` — nazwa powielona z folderem daje importy z potrójnym powtórzeniem (regresja, commit `5b157ecd`).
- **N2** — ❌ Plik importujący z `./index` eksportowany z tego samego `./index` — cykl barrel (ADR-0032).
- **N3** — ❌ Model/encja nazwana bez sufiksu typu — sufiks jest nośnikiem warstwy, nie ozdobą.

## Powiązane

`architecture/bounded-context-pattern.md` (struktura kontekstu) · `testing/testing-pyramid-pattern.md` (układ testów)
