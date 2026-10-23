---
id: TASK-OBS-011
title: 'Blokady z hooków w metrykach'
type: feature
status: done
priority: P3
story_points: 3
created_date: 2026-10-17
updated_date: 2026-10-22
assignee: '@unassigned'
labels: [observability, telemetry]
epic: EP-OBSERVABILITY-001
depends_on: [TASK-OBS-004]
related: [TASK-OBS-009]
source: 'przegląd luk telemetrii 2026-10-17 (po TASK-OBS-004)'
---

# TASK-OBS-011: blokady z hooków w metrykach

## 🎯 Goal

Zobaczyć, ile razy i jakie reguły hooków (`block-root-grep`, `block-subagent-commit` i podobne) faktycznie
blokują pracę. To pokazuje, które reguły się opłacają, a które tylko drażnią. Dziś blokada znika bez śladu.

## Zakres

1. Nowy proces `hook` w schemacie (razem z OBS-010 albo po nim; wspólna zmiana listy zamkniętej, ADR 0012).
2. Hooki blokujące zapisują zdarzenie WYŁĄCZNIE przy zablokowaniu: `step.end` z `step.role` = id reguły,
   `outcome: halted`. Bez treści komendy i bez ścieżek. Przepuszczenia nie są zapisywane (wolumen > 1000/dzień).
3. Zapis best-effort, hook zawsze kończy się `exit 0` (zasada repo); wspólny helper w `hooks/lib/`.
4. Eval w `tests/flow-evals/telemetry-events/`: blokada → jedno zdarzenie, przepuszczenie → zero.

## Kryteria akceptacji

- [x] Zablokowanie przez hook zostawia jedno zdarzenie z id reguły; przepuszczenie nie zostawia nic.
- [x] W zdarzeniu nie ma treści komendy ani ścieżki (test).
- [x] Hook nie wydłuża się o więcej niż kilka ms (zapis dopisujący jedną linię).

## Analiza (2026-10-21)

**Wdrożenie czeka na koniec zamrożenia silnika.** Praca dotyka `hooks/`, a te do sygnału użytkownika zostają
nietknięte w głównym drzewie (TASK-ENGINE-GUARDRAILS-001, fala poprawek w api-1). Start na świeżej gałęzi z `develop`,
po scaleniu guardrails, bo te same pliki zmieniają się w worktree.

### Co blokuje dziś

| Hook | Rejestracja | Jak blokuje | Reguły | Stałe id w kodzie |
|---|---|---|---|---|
| `block-root-grep.js` | globalnie (`hooks.json`) | JSON `permissionDecision: deny`, exit 0 | 1 | brak — TO TRZEBA NADAĆ |
| `block-subagent-commit.js` | globalnie | stderr + exit 2 | 1 | brak (ORC-094 tylko w komentarzu) — TO TRZEBA NADAĆ |
| `pre-workflow-lint.js` | globalnie | exit 2 przy ERROR | WL1–WL18 (blokuje podzbiór ERROR) | `WLn` w `workflow-lint.js` |
| `check-delegation.js` | per stack | exit 2 | 1 (2 tryby) | `DELEGATION-CHECK` |
| `check-patterns-read.js` | per stack | exit 2 | 1 | niezweryfikowane |
| `check-subagent-pattern-reads.js` | per stack (SubagentStop) | exit 2 | 1 | `PATTERN-GROUNDING` |
| `check-approval-before-impl.js` | per stack | exit 2 | 1 | `APPROVAL-GATE` |
| `check-security-considerations.js` | per stack | exit 2 (3 ścieżki) | 3 | brak — TO TRZEBA NADAĆ |
| `productivity-watchdog.js` | per stack (tylko subagenci) | exit 2 | 3 (`kill-switch`, `halt-all`, `spinning`) | `kind` w lokalnym `deny()` |

Wspólnego helpera blokady nie ma: każdy hook sam pisze stderr i exit albo JSON. Hooki są w CommonJS, a telemetria
(`scripts/lib/telemetry-events.mjs`) to ESM. Hooki już dziś ładują ją przez `import(pathToFileURL(...))`
(`hooks/lib/telemetry-sessions.js`).

### Ustalenia i decyzje techniczne

- **Wspólna biblioteka zdarzeń zamiast drugiego zapisu JSONL.** Pomiar 2026-10-21: import `telemetry-events.mjs` z CJS
  trwa ok. 4 ms, zapis jednej linii (`dedup: false`) poniżej 1 ms. Ten koszt pojawia się tylko przy blokadzie,
  przepuszczenie niczego nie ładuje. Osobny „lekki” zapis w CJS dublowałby format i walidację schematu.
- **Zdarzenie:** `kind: step.end`, `process: hook`, `outcome: halted`, `step.role` = `<hook>:<reguła>`
  (np. `pre-workflow-lint:WL7`, `block-root-grep:root-grep`). Bez `cause`, bez treści komendy, ścieżek i `session_id`.
  Agregat liczy `step.end` także bez `run.start` (`telemetry-rollup.mjs`, gałąź `step.end`), więc dzienne liczniki
  per reguła wychodzą jako `process hook × role` bez zmian w rollupie.
- **`runId`** (pole wymagane): syntetyczny `hook-<RRRRMMDD>`, czyli jeden „przebieg” na dzień, bez identyfikatora sesji.
- **„exit 0” w zakresie (pkt 3) dotyczy telemetrii, a nie samej blokady.** Blokery celowo kończą się exit 2 albo JSON-em
  `deny` i helper nie może tego zmienić. Zasada: błąd zapisu nigdy nie zmienia decyzji hooka ani kodu wyjścia.
- **Pułapka kolejności.** Hooki wołają `process.exit(2)` synchronicznie. Helper `hooks/lib/hook-telemetry.js`
  (TO TRZEBA STWORZYĆ) trzeba awaitować PRZED wyjściem, bo inaczej proces zginie przed zapisem. Eval ma to łapać.
- **Hooki per stack to symlinki do claude-patterns.** Ścieżka biblioteki rozwiązuje się przez `realpath`, tak jak
  w `telemetry-sessions.js`, więc zdarzenia trafiają centralnie bez konfiguracji w projektach.
- **Eval:** nowy katalog `tests/flow-evals/hook-telemetry/` (TO TRZEBA STWORZYĆ), wpięty w `pre-commit-guards.mjs`.
  Zastępuje `telemetry-events/` z pkt 4, bo tamten testuje bibliotekę i CLI, a hooków nie uruchamia. Przypadki:
  blokada → 1 zdarzenie z id reguły; przepuszczenie → 0; brak komendy i ścieżki w zdarzeniu; zapis przed `exit 2`;
  niedostępny katalog telemetrii → decyzja hooka bez zmian.
- Dokumenty: schemat (`process: hook`), aneks ADR 0012, `TELEMETRY-HOWTO.md`, CHANGELOG.

### Decyzje (zatwierdzone 2026-10-22)

Analiza zatwierdzona przez użytkownika, który przyjął rekomendacje do wszystkich trzech pytań.

1. **Zakres: wszystkie 9 hooków.** Najczęściej przeszkadzają te projektowe (delegacja, zgoda przed implementacją),
   a koszt to jedna linia na hook. Kolejność wdrożenia: najpierw helper i 3 hooki globalne, potem 6 projektowych.
   Trzem hookom bez stałego id (`block-root-grep`, `block-subagent-commit`, `check-security-considerations`)
   nadajemy id w tym samym kroku.
2. **Tylko prawdziwe blokady.** Ostrzeżenia z trybu ostrzegawczego nie są zapisywane, bo ich wolumen zalałby liczniki.
   Gdyby liczby z blokad okazały się za małe do oceny, ostrzeżenia dostaną osobny task.
3. **Projekt, w którym blokada się zdarzyła.** Dzięki temu widać, gdzie reguła przeszkadza. Zbiorcze widoki
   pod repo wzorców robi agregat, a nie zapis.

Pozostaje jedyny warunek startu: koniec zamrożenia hooków (TASK-ENGINE-GUARDRAILS-001 scalony, sygnał użytkownika).
Wtedy implementacja idzie na świeżej gałęzi z `develop`.

## Wynik (2026-10-22)

- `hooks/lib/hook-telemetry.js` (`recordBlock`, `exitAfterBlock`) zapisuje blokadę przez `scripts/lib/telemetry-events.mjs`;
  9 hooków woła `exitAfterBlock` w miejscu blokady. Tryb ostrzegawczy i przepuszczenie nie zapisują nic.
- Id reguł: `root-grep`, `subagent-git`, `WLn` (po jednym zdarzeniu na różną regułę), `pattern-file` / `orchestrating-strict`,
  `patterns-read`, `pattern-grounding`, `approval-gate`, `task-pre-analysis` / `security-suggest` / `security-section-empty`,
  `kill-switch` / `halt-all` / `spinning`.
- Pułapka złapana przez eval: `exitAfterBlock` jest asynchroniczny, więc `deny()` w `productivity-watchdog` wracał do `main()`,
  który kończył się `exit 0` — kill-switch przestawał blokować. Naprawione `return deny(...)`; reguła opisana w nagłówku helpera.
- Eval `tests/flow-evals/hook-telemetry/` (16 przypadków, prawdziwe hooki w procesach), wpięty w `pre-commit-guards.mjs`.
  Obejmuje wszystkie 9 hooków, także `check-patterns-read` i `check-subagent-pattern-reads` na transkrypcie JSONL.
  Z `HOOK_TELEMETRY=off` blokadowe przypadki padają (9 z 16), więc eval łapie brak zapisu.
- Rollup bez zmian liczy blokady: dwie blokady `block-root-grep` w katalogu tymczasowym dały w `telemetry-rollup.mjs` `process hook` × rola `block-root-grep:root-grep` z `n=2`, `halted=2`; przepuszczenie nie zostawiło zdarzenia.
- Wdrożone przez gałąź `feature/TASK-OBS-011-hooks` (usunięta po scaleniu), scalone do `develop` jako `260d2cc` i do `feature/TASK-OBS-011` jako `4802687`. Hooki działają na żywo w projektach.
