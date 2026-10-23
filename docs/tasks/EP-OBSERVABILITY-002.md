---
id: EP-OBSERVABILITY-002
title: '[EPIC] Pomiar wartości zamiast samooceny — wynik ludzki, narzędzia, domknięta pętla reguł'
type: epic
status: todo
priority: P1
created_date: 2026-10-22
updated_date: 2026-10-22
labels: [observability, telemetry, reporting]
external_ref: 'docs/adr/0015-pomiar-wartosci-zamiast-samooceny.md'
member_tasks: [TASK-OBS-012, TASK-OBS-013, TASK-OBS-014, TASK-OBS-015, TASK-OBS-016, TASK-OBS-017]
depends_on: [EP-OBSERVABILITY-001]
---

# EP-OBSERVABILITY-002 — Pomiar wartości zamiast samooceny

## Po co

[EP-OBSERVABILITY-001](EP-OBSERVABILITY-001.md) zbudował hydraulikę: zdarzenia v1, skrzynkę, rollupy,
eksport, świeżość. Przegląd z 2026-10-22 ([ADR 0015](../adr/0015-pomiar-wartosci-zamiast-samooceny.md))
pokazał, że liczby odpowiadają na „ile i za ile", a nie na pytania użytkownika: czy rezultat został
dowieziony, które skille, agenci, komendy i hooki działają, czy nic nie zostało pominięte i czy reguły,
które dopisujemy po incydentach, faktycznie coś poprawiają.

Ten epik dokłada mianownik spoza systemu (decyzja człowieka), rozszerza pomiar na narzędzia i domyka
pętlę reguła → metryka → status w skrzynce.

## Dlaczego sześć tasków, a nie jeden

Podział idzie po zestawie plików i bramce, nie po pomyśle:

| Grupa plików | Eval | Blokada | Taski |
|---|---|---|---|
| `scripts/lib/telemetry-rollup.mjs`, eksport | `telemetry-rollups`, `telemetry-export` | brak | OBS-012 |
| schemat v1, `report-deviation`, `commands/analyze.md` | `telemetry-events`, `validate-commands` | brak | OBS-013 |
| nowy `telemetry-report.mjs` | nowy eval | po OBS-012 | OBS-014 |
| `hooks/` (commit), audyt floty | `hooks`, `audit-projects` | **zamrożenie hooków** | OBS-015 |
| `hooks/` (narzędzia), frontmatter komend | `hooks`, `validate-commands` | **zamrożenie hooków** | OBS-016 |
| rule-history, skrzynka, raport tygodniowy | `reporting-hygiene` | po OBS-014 | OBS-017 |

Jeden task stałby w całości na zamrożeniu hooków (TASK-ENGINE-GUARDRAILS-001), a cztery z sześciu
części nie dotykają `hooks/` i mogą iść od razu.

## Stan (2026-10-22)

| Obszar | Stan | Task |
|---|---|---|
| Fałszywe GO/NO_GO i blok `tasks` w rollupie | ⏳ **pierwszy** | TASK-OBS-012 |
| Taksonomia `cause`, obowiązkowa kategoria `agent_note`, PAUSE ≠ halted | ⏳ | TASK-OBS-013 |
| `telemetry-report.mjs` nad rollupami, delta per silnik | ⏳ po OBS-012 | TASK-OBS-014 |
| `outcome.human`: hook commit + revert w audycie | ⏳ po odmrożeniu hooków | TASK-OBS-015 |
| `process: tool`: emiter Skill/Agent + plan w każdej komendzie | ⏳ po odmrożeniu hooków | TASK-OBS-016 |
| `claim` w regułach i skrzynce, raport tygodniowy, status `resolved` | ⏳ po OBS-014 | TASK-OBS-017 |
| Blokady hooków w metrykach | ⏳ zostaje w EP-001 | TASK-OBS-011 |

## Kolejność

TASK-OBS-012 → TASK-OBS-013 → TASK-OBS-014 → TASK-OBS-017, równolegle po odmrożeniu hooków:
TASK-OBS-011 → TASK-OBS-015 → TASK-OBS-016. Uzasadnienie: OBS-012 i OBS-014 dają odpowiedzi z danych, które
już leżą na dysku (24 tys. zdarzeń), bez czekania na nowe emitery; OBS-015 jest najcenniejszy, ale wymaga
hooka i kilku tygodni zbierania, zanim cokolwiek pokaże.

## Jak zacząć (świeża sesja)

1. Przeczytaj ADR 0015 (decyzje D1–D6) i ten epik; ADR 0012 to format zdarzeń, ADR 0011 skrzynka.
2. Gałąź `feature/TASK-OBS-NNN` z `develop`, praca w głównym katalogu (jak w EP-001). Katalog jest żywy
   dla całej floty: nie zostawiaj w drzewie niedziałającego skryptu ani hooka.
3. Gotowe klocki: `scripts/lib/telemetry-events.mjs`, `scripts/lib/telemetry-rollup.mjs` (czysta funkcja
   zdarzenia → agregat), `scripts/lib/telemetry-export.mjs` (`buildBatch`, `findLeaks`),
   `hooks/lib/telemetry-sessions.js` (stan przebiegów), `scripts/lib/inbox.mjs` (nagłówki skrzynki).
4. Weryfikacja na danych: `telemetry/events/*.jsonl` czyta się krótkim skryptem node, nie modelem.
5. Każdy nowy eval do `scripts/pre-commit-guards.mjs`; każda nowa wartość listy zamkniętej to aneks w ADR 0012.
6. Commit tylko na prośbę użytkownika.

## Zasady wspólne

- Nowe zdarzenia niosą liczniki i wartości z list zamkniętych. Bez diffów, ścieżek, treści promptów,
  argumentów skilli.
- Blok `tasks` w rollupie jest lokalny; eksport wysyła z niego tylko rozkłady (`findLeaks` rozszerzony).
- Zapis metryki nigdy nie zmienia decyzji hooka ani kodu wyjścia mierzonej pracy.

## Poza epikiem (nazwane, nie zaplanowane)

- Użycie wzorców (które trafiają do promptu, czy agent je czyta): emiter w `knowledge-retriever`, osobna
  decyzja tamtego repo.
- Korpus seeded-bugs dla weryfikatorów (luka L2, ADR 0004): źródłem mogą być realne `violations` z
  VERDICT_SCHEMA; spike promptfoo z 2026-08 działa, ale nie jest wpięty.
- Odbiorca danych i widok web: TASK-OBS-009 bez zmian, przy drugiej maszynie. Do tego czasu wystarczy
  raport z OBS-014.
