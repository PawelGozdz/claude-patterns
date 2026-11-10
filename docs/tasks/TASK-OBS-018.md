---
id: TASK-OBS-018
title: 'Telemetria: reguły naruszone przez weryfikatora i bramkę końcową oraz wynik sondy w zdarzeniu kroku (odcisk ustaleń, porównanie z lintem)'
type: feature
status: done
priority: P2
story_points: 8
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [observability, telemetry, verifier, gate]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-014]
related: [TASK-OBS-017, TASK-OBS-019, TASK-ORC-GATE-COST-001, TASK-ORC-FINAL-GATE-CHUNKS-001]
source: 'prośba z juz-ide-api (TS-TOOLING-003, gałąź feature/TS-TOOLING-003-lint-ddd-pokrycie-regul-domena-application); analiza wykonalności: ask-project na kopii origin/develop 15c102e, 2026-11-10; rozszerzenie o bramkę końcową po analizie kosztów z telemetrii, 2026-11-10'
---

# TASK-OBS-018: które reguły weryfikator i bramka uznały za złamane + wynik sondy w zdarzeniu kroku

**Stan: wykonane (etap 1), 2026-11-10.** Etap 2 (ścieżka pliku w lokalnych zdarzeniach) i `ruleId` z wyjścia lintu
przeniesione do [TASK-OBS-019](TASK-OBS-019.md), bo wymagają informacji od juz-ide-api (patrz sekcja Wynik).

## 🎯 Goal

Dwa cele z jednego zapisu:

1. **Porównanie z lintem.** Projekt `juz-ide-api` chce porównać `code-quality-verifier` (LLM, VETO, bramki z kart
   `*_summary.md`) z własnym linterem `pnpm lint:ddd` i ustalić, w jakim stopniu lint może go zastąpić. Plan: 1–2 pełne
   dni przebiegów `/orchestrate`, potem lint w trybie cienia obok weryfikatora, potem porównanie zużycia tokenów,
   reguł i błędów.
2. **Odcisk ustaleń bramki i weryfikatora.** Dziś `step.end` niesie `outcome`, `attempt`, tokeny, wywołania i `cause`,
   ale nie niesie tego, **które reguły** uznano za złamane. Bez tego nie da się wykryć, że kolejne runy tego samego
   zadania odbijają się od tego samego ustalenia (wyłącznik pętli, `TASK-ORC-GATE-COST-001`), ani zmierzyć, czy katalog
   znanych pułapek trafia w to, co bramka znajduje.

## Dane wyjściowe (telemetria, 2026-10-01..11-10, 17 projektów)

- Bramka końcowa (`security-e2e-verifier`): 175 kroków, **$892** (21% z $4200 kosztu `orchestrate`+`analyze`). Pierwsza
  bramka w runie (n=130): NO-GO 47%, GO 44%, `died` 9%. We wszystkich 89 NO-GO `signature` jest puste, a `cause` to
  zawsze `verifier`, więc nie wiadomo, co bramka znalazła ani czy to powtórzenie.
- Weryfikator warstwy: surowy `workflow-steps.jsonl` (juz-ide-api-1..4, od lipca) ma 1607 kroków i 330 NO-GO; zdarzenia
  telemetrii od października zgadzają się z nim co do sztuki (patrz Wynik).

## Zakres (zrealizowany)

1. **`VERDICT_SCHEMA`** (`scripts/workflow/orchestrate.template.mjs`) jest wspólny dla weryfikatora warstwy i bramki
   końcowej, więc jedno pole obejmuje oba: opcjonalne `findings: [{ruleId, line?}]` i `rules_checked`. Instrukcję
   (`FINDINGS_FIELD`) dopisano do promptów `buildVerifierPrompt` i `buildFinalGatePrompt`; `decideVerdict` jej nie czyta.
   Wolny tekst zostaje w `violations`. `ruleId` = identyfikator z karty reguł albo wpisu katalogu pułapek; ustalenie spoza
   obu to literał `new` (D5).
2. **Kolektor** (`scripts/workflow-metrics-collect.mjs`) przepisuje `findings`/`rules_checked` z wyniku w journalu do
   rekordu kroku jako `ruleHits`/`rulesChecked` (po normalizacji) oraz wynik sondy jako `checks`.
3. **Konwerter** (`scripts/lib/telemetry-legacy.mjs`) zapisuje `step.ruleHits` i `step.rulesChecked` tylko dla ról
   `verifier` i `gate`, a `step.checks` tylko dla roli `probe`.
4. **Schemat zdarzeń** (`schemas/telemetry-event-v1.schema.json`): `step.ruleHits`, `step.rulesChecked`, `step.checks`,
   z regułami `allOf` ograniczającymi je do właściwych ról. `v: 1` zostaje (zmiana addytywna). Pole nie nazywa się
   `step.findings`, bo to liczba całkowita tylko dla `process: review-panel`.
5. **Helper `scripts/lib/telemetry-rules.mjs`**: `normalizeRuleId`, `normalizeRuleHits`, `normalizeRulesChecked`,
   `normalizeProbeChecks`, `ruleSignature`. Format `ruleId` = `SAFE_KEY` z eksportu; wartość niepasująca staje się `new`.
   Odcisk pomija `new` i nie jest zapisywany w zdarzeniu (D3).
6. **Wynik sondy**: `step.checks` (`typecheck`, `tests`, `lint`, `conformance`, `shadowLint`: `pass|fail|skipped`).
   Parowanie z werdyktem po tym samym `group` + jednostce + `attempt` (id kroków różnią się tylko rolą).
7. **Tryb cienia**: wpis `shadow:<skrypt>` w `checks:` uruchamia skrypt jak zwykły check, wynik trafia do `shadowLint`
   i telemetrii, a `probeIsRed` go nie liczy. Prefiks zostaje widoczny w wyjściu komendy (`SHADOW EXIT:<kod>`), bo nazwa
   skryptu (`lint:ddd`) zawiera „lint" i sonda zmapowałaby ją na blokujące pole `lint`. Raportuje wyłącznie kod wyjścia.
8. **Rollup i eksport**: leniwy blok `rules` per rola i agent (`reports`, `hits`), eksport przez białą listę z `SAFE_KEY`.

## Decyzje (podjęte 2026-11-10)

- **D1. Ścieżki plików.** Etap 1: tylko `ruleId` i `line`, bez `file`. Etap 2 (`file` tylko w lokalnych surowych
  zdarzeniach, nigdy w rollupie i eksporcie) wymaga aneksu do ADR 0012 i potwierdzenia właściciela juz-ide-api: `TASK-OBS-019`.
  Wykonalność sprawdzona: paczka eksportu powstaje z rollupów przez whitelisty, surowe zdarzenia do niej nie wchodzą.
- **D2. Nazwa pola:** `step.ruleHits`.
- **D3. Odcisk nie jest zapisywany w zdarzeniu.** Top-level `signature` ma semantykę id odchylenia `DEV-*`
  (`report-deviation.mjs`). Odcisk liczy `ruleSignature` w czasie odczytu i pomija `new`, żeby dwa różne nieznane
  ustalenia nie dawały tego samego odcisku.
- **D4. Zakres obejmuje weryfikatora warstwy i bramkę końcową.**
- **D5. Ustalenie bez znanego `ruleId` dostaje literał `new`.** Niepasujący format też staje się `new` (nie jest
  odrzucany), żeby liczba ustaleń była prawdziwa, a wolny tekst nigdy nie trafiał do zdarzenia.

## Kryteria akceptacji

- [x] Stub-weryfikator **i stub-bramka** zapisują `step.end` z listą `{ruleId, line}`, która przechodzi `validateEvent`;
      stare zdarzenia nadal przechodzą bez migracji (eval `telemetry-events`).
- [x] `ruleHits` poza rolami `verifier` i `gate` jest odrzucone, `step.findings` panelu działa bez zmian; krok `probe`
      i `implementer` nie dostają `ruleHits` (eval `telemetry-events`).
- [x] `normalizeRuleId`: `A1`→`a1`, `feedback_Foo_bar`→`foo-bar`; format niepasujący do `SAFE_KEY` zamienia się na
      `new`, a oryginalny tekst nie trafia do zdarzenia, rollupu ani eksportu.
- [x] `ruleSignature`: ta sama lista w innej kolejności i z duplikatami daje ten sam odcisk; `new` jest pomijane;
      pusta lista i same `new` dają `null`.
- [x] `buildBatch`/`projectRollup` nie niosą ścieżek ani numerów linii z pola, a klucze spoza `SAFE_KEY` odpadają do
      `dropped` (eval `telemetry-export`).
- [x] Weryfikator i bramka bez wypełnionego pola nie zmieniają zachowania; `findings` nie zmienia decyzji
      `decideVerdict` (eval `orchestrate-script`).
- [x] Czerwony `shadowLint` nie jest czerwienią sondy (`probeIsRed`), więc nie cofa warstwy do implementera (test
      jednostkowy w `orchestrate-script`; pełnej pętli end-to-end nie uruchamiano).
- [x] Dla pary weryfikator + sonda tej samej warstwy i próby da się z zdarzeń odtworzyć, które `ruleId` flagowano
      i czy sonda była czerwona (eval `telemetry-events`).
- [x] Liczba kroków i NO-GO weryfikatora przeliczona z surowego `workflow-steps.jsonl` z deduplikacją po
      `runId+agentId` i wyjaśniona różnica wobec zdarzeń (sekcja Wynik).
- [x] Konwencja repo: walidatory CI i `count-assets` w pre-commit, `CHANGELOG.md` ([Unreleased], wersji nie podbijam),
      aneks w ADR 0012, wpis ORC-156 w rule-history, wpis w `DECISIONS-LOG`.
- [ ] Etap 2 (`file` tylko w surowych lokalnych zdarzeniach) oraz `ruleId` z wyjścia lintu: **przeniesione do TASK-OBS-019**.

## Wynik

**Zrobione (etap 1).** Zdarzenie `step.end` niesie `ruleHits`/`rulesChecked` (verifier, gate) i `checks` (probe); prompt
werdyktu prosi o `findings`; `shadow:<skrypt>` działa jako kontrola w trybie cienia; rollup i eksport mają blok `rules`.
Evale: `telemetry-events` 23/23 (4 nowe), `telemetry-rollups` 20/20, `telemetry-export` 11/11, `orchestrate-script` 135/135
(3 nowe), `workflow-metrics` (sekcja E5), `orchestrate-prepare` 69/69.

**Odstępstwa od planu.**

- Instrukcja o `findings` leży w prompcie przebiegu (`FINDINGS_FIELD`), a nie w definicjach sześciu agentów: nie rośnie
  stały kontekst (`context-bill` bez zmian) i obejmuje też lokalne kopie weryfikatorów w projektach (np. `aig-code-verifier`).
- Niepasujący `ruleId` zamienia się na `new` zamiast być odrzucany (kryterium poprawione wyżej).
- Tryb cienia raportuje tylko kod wyjścia. Parsowanie wyjścia lintu odłożono, bo format wyjścia `lint:ddd` nie jest
  znany, a sonda parafrazuje cytaty (ORC-137), więc ekstrakcja `ruleId` przez agenta byłaby zawodna. Wbudowany id to
  `shadow:<skrypt>`, nie `lint:ddd`.
- Poprawka błędnego opisu z pierwszej wersji zadania: kroki `final-checks` mają rolę `probe`, nie `gate`; źródła 318 kroków
  `gate` bez agenta (z analizy kosztów) nie ustalono i nie ma ich w zakresie.

**Rozbieżność 1595/327 wobec 795/53: wyjaśniona.** To nie duplikaty (deduplikacja po `runId+agentId` niczego nie zmienia:
1607 kroków, 330 NO-GO). Zdarzenia po prostu nie zawierają historii sprzed połowy września:

| miesiąc | surowy plik (kroki / NO-GO) | zdarzenia (kroki / NO-GO) |
|---|---|---|
| 2026-07 | 147 / 50 | 0 / 0 |
| 2026-08 | 604 / 203 | 0 / 0 |
| 2026-09 | 162 / 40 | 99 / 16 |
| 2026-10 | 618 / 36 | 620 / 36 |
| 2026-11 | 76 / 1 | 76 / 1 |

Od października oba źródła zgadzają się. Odsetek NO-GO weryfikatora warstwy spadł z ok. 34% (lip–sie) przez 25% (wrz) i
5,8% (paź) do 1,3% (lis), więc dziś nie jest on głównym źródłem odrzuceń (to bramka końcowa, 47%).

**Co dalej.**

- [TASK-OBS-019](TASK-OBS-019.md): etap 2 i `ruleId` z lintu; czeka na dwie rzeczy od juz-ide-api (potrzeba dopasowania
  miejsca, format wyjścia lintu).
- [TASK-ORC-GATE-COST-001](TASK-ORC-GATE-COST-001.md) może ruszyć z E1 po zebraniu pierwszych przebiegów z `ruleHits`
  (prompt już o nie prosi; dane pojawią się po kolejnym przebiegu `/orchestrate` i uruchomieniu kolektora).
- Dla juz-ide-api: `runtime.yml` nie wymaga rematerializacji dla `ruleHits`. Tryb cienia włącza się wpisem
  `shadow:lint:ddd` w `checks:` (bloku lub projektu) i może zastąpić ich własny skrypt `lint-ddd-shadow.jsonl`.
