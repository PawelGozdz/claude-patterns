---
id: TASK-ORC-LINT-DELEGATION-001
title: 'Delegowanie mechanicznych reguł z weryfikatorów do lintu projektu: kontrola ratchet w checks:, lista reguł delegowanych z project.yml, ID reguł z kartą w wyniku'
type: feature
status: in-progress
priority: P2
story_points: 8
created_date: 2026-11-19
updated_date: 2026-11-19
assignee: '@unassigned'
labels: [orchestrate, verifier, gate, lint, cost, telemetry]
depends_on: [TASK-OBS-018, TASK-OBS-019]
related: [TASK-ORC-GATE-COST-001, TASK-ORCH-LINT-BASELINE-001, TASK-ORC-CONTEXT-CURATION-001]
source: 'brief od @founder (juz-ide-api), 2026-11-19: „delegowanie kontroli z weryfikatora (LLM) do lint:ddd (kodu)”; dane z join-shadow-verifier.mjs od 2026-11-11 (agregaty, bez danych z ~/.claude/metrics)'
---

# TASK-ORC-LINT-DELEGATION-001: reguły sprawdzalne kodem przechodzą z weryfikatora do lintu projektu

**Stan: E1, E2a i E3 zaimplementowane i zastagowane w worktree `_claude-patterns-lint-delegation` (2026-11-20), czeka na przegląd i commit.
Bramka końcowa (E2b) zostaje z pełnym zakresem do pomiaru; po scaleniu: `audit-projects` → `materialize-runtime` → `verify-project-setup`.** Analiza: [`analysis/TASK-ORC-LINT-DELEGATION-001.analysis.md`](analysis/TASK-ORC-LINT-DELEGATION-001.analysis.md)
(`status: approved`, Q1–Q6 rozstrzygnięte 2026-11-19).

## 🎯 Goal

Weryfikator warstwy i bramka końcowa sprawdzają dziś każdą regułę z kart, także te, które projekt umie już sprawdzić
linterem. Chcemy, żeby reguły sprawdzalne mechanicznie sprawdzał kod (lint z ratchetem), a weryfikator dostawał krótszą
listę do oceny. Mechanizm jest w claude-patterns, decyzję, które reguły oddać, podejmuje projekt. Projekt, który nic nie
zadeklaruje, działa dokładnie tak jak dziś: ten sam `runtime.yml`, te same prompty.

## Dane wyjściowe (z briefu juz-ide-api, agregaty od 2026-11-11)

| Krok | Liczba | NO_GO | Tokeny śr. | Tokeny razem |
|---|---|---|---|---|
| bramka końcowa | 45 | 13 (28,9%) | ok. 220 tys. | ok. 9,9 mln |
| weryfikator warstwy | 270 | 21 (7,8%) | ok. 105 tys. | ok. 28,4 mln |

- Weryfikator warstwy to ok. 74% tokenów obu weryfikatorów i w 92% kroków kończy się GO.
- 12 z 19 NO_GO z `ruleIds` ma ID wieloznaczne (`N1`–`N6`, `A5` występują w 19–48 kartach). Bez karty w ID nie da się
  zmierzyć pokrycia ani delegować reguły. Sprawdzone w repo: `N1` itd. są numeracją lokalną każdej karty `*_summary.md`.

## Co już jest w claude-patterns (sprawdzone 2026-11-19)

- `conformance` (ORC-118/ORC-140): gołe id w `checks:` warstwy i `final_gate` (`blocks/ddd/layers.yml`), komendę składa
  `orchestrate.template.mjs` (`conformanceCommand`: zakres warstwy, `--baseline-ref <baseSha>`, `--skip` dla cudzej pracy),
  osobne pole sondy, dosłowny raport do implementera (`conformanceFixText`). To narzędzie claude-patterns
  (`tools/conformance`), nie skrypt projektu.
- `shadow:<skrypt>` (TASK-OBS-018): skrypt projektu w trybie cienia, pole `shadowLint`, nie blokuje (`probeIsRed`).
- `findings: [{ruleId, line, file}]` w `VERDICT_SCHEMA` i `FINDINGS_FIELD` (OBS-018/019): wspólne dla weryfikatora warstwy
  i bramki, `decideVerdict` ich nie czyta. `normalizeRuleId` przepuszcza tylko `SAFE_KEY` (`[a-z0-9][a-z0-9_.:-]{0,63}`).
- `block_params` + blok z mechanizmem (wzór: `blocks/file-check.yml`): projekt podaje treść, blok daje mechanizm.
- Brak: kontroli lintu projektu w trybie blokującym z zakresem zmiany, pola z listą reguł delegowanych, ID z kartą.

## Zakres (etapy, każdy osobno włączany i odwracalny)

- **E1. Kontrola `lint-ratchet` w `checks:`** (krok 1 briefu). Wbudowane id rozwijane przez template jak `conformance`:
  skrypt ratchet projektu na plikach zmiany warstwy, bez cudzej pracy (`dirtyAtStart`). Osobne pole sondy `projectLint`,
  dosłowny raport do implementera. Brak skryptu = `skipped`. Włączane blokiem z `block_params`, nie zmianą `ddd/layers`.
- **E2. Lista reguł delegowanych** (krok 2 briefu). Parametr bloku → `runtime.yml` → prepare → prompt obu weryfikatorów.
  Delegacja działa w kroku tylko wtedy, gdy `projectLint` faktycznie się wykonał (`pass`/`fail`); przy `skipped` weryfikator
  dostaje pełny zakres. Próba kontrolna (holdout) bez delegacji do pomiaru. Telemetria: tryb delegacji w zdarzeniu kroku.
- **E3. ID reguł z kartą** (krok 3 briefu). Prompt prosi o `<karta>#<ID>`; normalizacja do `<karta>:<id>` (bo `#` nie
  przechodzi `SAFE_KEY`, dziś zamieniłby się w `new`). Stary format (`N1`) nadal czytany i liczony osobno.

Kolejność wdrożenia i rozstrzygnięcia: analiza, sekcja „Synteza”.

## Kryteria akceptacji

- [~] Projekt bez bloku delegacji: `runtime.yml` identyczny z wersją sprzed zmiany poza hashami (sprawdzone na okrojonej
      konfiguracji juz-ide-api), prompty bez zmian (test `orchestrate-script`). OTWARTE: hashe `source_hash`/`inputs_hash` zmienią
      się u wszystkich projektów (zmienił się generator); rematerializacja po scaleniu.
- [x] Z `lint-ratchet` w `checks:`: wynik trafia do raportu sondy jak `conformance` (`pass|fail|skipped`), czerwony cofa
      warstwę do implementera z dosłownym raportem, brak skryptu = `skipped` z powodem, nie cichy sukces.
- [x] Komenda kontroli dostaje wyłącznie pliki zmiany warstwy (bez `dirtyAtStart`); zakres liczy `tools/lint-ratchet/run.mjs`.
- [x] Z listą reguł delegowanych: prompt WERYFIKATORA WARSTWY zawiera listę i instrukcję „nie powtarzaj, oceniasz resztę”;
      karty nadal są w prompcie; reguła spoza wczytanych kart = ostrzeżenie prepare i wypada z listy. Bramka końcowa: E2b, po pomiarze.
- [x] `projectLint: skipped` albo brak pola w sondzie: prompt bez delegacji (test).
- [x] Holdout: deterministyczny wybór kroków bez delegacji (hash zadania + SHA startu + warstwy; w skrypcie nie ma `runId`),
      odsetek z parametru, domyślnie 20% (Q3), górny limit 50%.
- [x] Wynik weryfikatora: `findings[].ruleId` w formie `<karta>#<ID>`; `normalizeRuleId` zamienia na `<karta>:<id>`;
      stary format nadal przechodzi; rollup liczy udział ID z kartą (`qualified`).
- [x] Telemetria: `step.delegation` (`on|holdout|fallback`; `off` = brak pola), `delegatedRules` i `lintMisses` w zdarzeniach
      `verifier`; `step.checks.projectLint` w `probe`. Zmiana addytywna, `v: 1`, aneks do ADR 0012, eksport przez whitelisty.
      Dla `gate`: razem z E2b.
- [~] Konwencja repo: walidatory CI, `count-assets`, `CHANGELOG.md` [Unreleased], wpis ORC-174 w rule-history, `DECISIONS-LOG`,
      README bloków: zrobione. OTWARTE: po scaleniu `audit-projects` → `materialize-runtime` → `verify-project-setup`.

## Poza zakresem

Reguły lintera i ich próg `error`/`warn` w juz-ide-api, tabela pokrycia `LINT_COVERAGE`, BDR/ADR zmieniający próg ADR-0144,
kandydaci na nowe reguły (DE3, CV5, SEP*, A5, AC3), CI `lint:ddd`. Dane z `~/.claude/metrics` nie trafiają do tego repo.
