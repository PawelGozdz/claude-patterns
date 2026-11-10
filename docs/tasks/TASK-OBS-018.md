---
id: TASK-OBS-018
title: 'Telemetria: reguły naruszone przez weryfikatora i wynik sondy w zdarzeniu kroku (porównanie z lintem)'
type: feature
status: todo
priority: P2
story_points: 5
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [observability, telemetry, verifier]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-014]
related: [TASK-OBS-017]
source: 'prośba z juz-ide-api (TS-TOOLING-003, gałąź feature/TS-TOOLING-003-lint-ddd-pokrycie-regul-domena-application); analiza wykonalności: ask-project na kopii origin/develop 15c102e, 2026-11-10'
---

# TASK-OBS-018: które reguły z kart weryfikator uznał za złamane + wynik sondy w zdarzeniu kroku

## 🎯 Goal

Projekt `juz-ide-api` chce porównać `code-quality-verifier` (LLM, VETO, bramki z kart `*_summary.md`) z własnym
linterem `pnpm lint:ddd` i ustalić, w jakim stopniu lint może go zastąpić. Plan: 1–2 pełne dni przebiegów
`/orchestrate` z istniejącym weryfikatorem, potem lint w trybie cienia obok weryfikatora, potem porównanie zużycia
tokenów, reguł i błędów.

Dziś zdarzenie `step.end` weryfikatora niesie `outcome` go/no_go, `attempt`, tokeny, wywołania narzędzi, czas i
`cause`, ale nie niesie tego, **które reguły z kart uznał za złamane**. W `juz-ide-api*` jest 1595 kroków
weryfikatora (lipiec–listopad 2026), z tego 327 NO_GO, i nie da się policzyć, ile z nich złapałby lint. Drugi brak:
wynik sondy (`checks`) jest w zdarzeniu nieodróżnialny od zielonego (`outcome: ok`), więc nie ma czego zestawić z
werdyktem weryfikatora tego samego kroku.

## Zakres

1. `VERDICT_SCHEMA` (`scripts/workflow/orchestrate.template.mjs:1897`): opcjonalne `findings: [{ruleId, file?, line?}]`
   i `rules_checked: number`. Wyrównać prompty 5 weryfikatorów (`code-quality-verifier`, `refine-`, `nextjs-`,
   `python-`, `flutter-quality-verifier`), żeby wypełniały pola z karty reguł; tekst `violations` zostaje dla
   `decideVerdict` (`:1004`). Lokalne kopie w projektach (np. `aig-code-verifier` w ai-gateway) aktualizuje projekt.
2. Kolektor (`scripts/workflow-metrics-collect.mjs:120-128`): przepisać oba pola do rekordu kroku, tylko dla
   `role === verifier`. Wynik weryfikatora jest już w `journal.jsonl` (`:62-65`), kolektor czyta z niego dziś tylko
   `result.verdict`.
3. Konwerter (`scripts/lib/telemetry-legacy.mjs:152`): zapisać pole w `step` i zwalidować (długość i format `ruleId`,
   maksymalna liczba wpisów, ścieżka względna bez `..`).
4. Schemat zdarzeń (`schemas/telemetry-event-v1.schema.json`, blok `step` od `:70`, `additionalProperties: false`;
   walidator `telemetry-events.mjs:148`): dodać pole. `v: 1` zostaje (zmiana addytywna, tryb jak `blamed` w ADR 0012).
   **Nazwa nie może być `step.findings`**: to liczba całkowita tylko dla `process: review-panel` (`:93`, reguła `:42`).
   Rekomendacja: `step.ruleHits`.
5. Wynik sondy w zdarzeniu `role: probe` (pass/fail per check). Dziś `CHECKS_SCHEMA` (`:1807`) nie ma pola
   `verdict`, więc kolektor daje `ok` (`workflow-metrics-collect.mjs:92`). Etykieta `<warstwa>-checks-<n>` daje
   `group:unit` zgodne z `<warstwa>-verify`, więc parowanie po `group:unit + attempt` jest możliwe, brakuje tylko pola.
6. **Tryb cienia** dla własnego checku projektu. `checks:` przyjmuje dowolny skrypt `package.json`
   (`orchestrate.template.mjs:543-556`), ale każdy czerwony `lint*` jest blokujący (`probeIsRed` `:1830+` liczy
   `lint === 'fail'` i cofa warstwę do implementera), dlatego `lint:check` wyjęto z `layers.yml:50-57`. Potrzebny
   nowy wbudowany identyfikator (np. `lint:ddd`) z osobnym polem tylko do zapisu, jak `conformance`, ale bez wpływu na
   `probeIsRed`. Mapowanie po nazwie (`literalMapping`, ok. `:690`) zlałoby `lint:ddd:ratchet` z `lint:check`.
7. Rollup: opcjonalny licznik `ruleId` per agent (`telemetry-rollup.mjs:171-176`, leniwy blok jak `verdicts`, żeby dni
   bez danych zostały bajt w bajt takie same). Raport tygodniowy to osobna decyzja.

## Decyzje do podjęcia (przed implementacją)

**1. Ścieżki plików w zdarzeniu.** ADR 0012 §3 i opis schematu: zdarzenie nie zawiera ścieżek plików ani treści.
Stan faktyczny: w 55 582 surowych zdarzeniach nie ma żadnej wartości przypominającej ścieżkę pliku. Surowe zdarzenia
(`telemetry/events/`) są w `.gitignore`, rollupy (1641 plików) są w gicie, paczkę eksportu `buildBatch` buduje się z
rollupów (przez `projectRollup`) z kontrolą `findLeaks`. Do porównania z lintem potrzebne jest `ruleId × plik:linia`
(czy lint złapał to samo miejsce). Warianty:

- (a) tylko `ruleId` i `line`, bez ścieżki;
- (b) zamiast ścieżki id warstwy/jednostki (`ruleId × warstwa`);
- (c) ścieżka względna, ale **tylko w lokalnych surowych zdarzeniach**, nigdy w rollupie i eksporcie; wymaga aneksu do
  ADR 0012 i potwierdzenia, że `projectRollup`/`buildBatch` jej nie przenoszą (niezweryfikowane, pierwszy punkt zadania).

Rekomendacja projektu zgłaszającego: (c). Wariant (a)/(b) daje słabsze porównanie (bez dopasowania miejsca).

**2. Nazwa pola:** `step.ruleHits` (rekomendacja) albo uogólnienie typu `step.findings` (liczba w panelu, lista u
weryfikatora).

## Kontekst dla świeżej sesji

- Pierwsze dane nie czekają na to zadanie: `~/.claude/projects/<slug>/<sesja>/subagents/workflows/<runId>/journal.jsonl`
  zawiera pełny wynik weryfikatora (`violations` jako wolny tekst z `ruleID @ plik:linia`). Projekt zgłaszający zbiera je
  stamtąd skryptem. To zadanie ma zastąpić to stałym, ustrukturyzowanym zapisem w telemetrii.
- Główne drzewo `claude-patterns` miało przy analizie niezacommitowane zmiany w `blocks/` i `agents/`. Analiza dotyczy
  `origin/develop` 15c102e. Przed startem sprawdzić, czy `VERDICT_SCHEMA`, prompty weryfikatorów, `layers.yml` i
  `checks:` nie zmieniły się w tych zmianach.
- Numery linii dla `probeIsRed` i `literalMapping` są przybliżone, pozostałe sprawdzone w pliku.
- Rematerializacja `runtime.yml` w instancjach nie jest potrzebna dla pól 1–5 (zmiana w szablonie, kolektorze i
  schemacie, prompty agentów są symlinkowane); dla punktu 6 zależy od tego, czy zmieni się `checks:` w bloku.

## Kryteria akceptacji

- [ ] Przebieg `/orchestrate` ze stub-weryfikatorem zapisuje `step.end` z listą `{ruleId, line}` (i `file` zgodnie z
      decyzją 1), który przechodzi `validateEvent`; stare zdarzenia nadal przechodzą bez migracji.
- [ ] Zdarzenie spoza `role: verifier` z nowym polem jest odrzucone, a `step.findings` panelu działa bez zmian (test
      regresji).
- [ ] `telemetry-export --check` i `buildBatch` nie zawierają ścieżek ani numerów linii z pola (test).
- [ ] Weryfikator bez wypełnionego pola nie zmienia zachowania `decideVerdict` ani werdyktu.
- [ ] Czerwony lint w trybie cienia nie cofa warstwy do implementera (test w `orchestrate-script`).
- [ ] Dla pary weryfikator + sonda tej samej warstwy i próby da się z surowych zdarzeń odtworzyć: które `ruleId`
      flagowano i czy sonda była czerwona.
- [ ] Konwencja repo: `count-assets.mjs --check-docs`, walidatory CI, `CHANGELOG.md` i `METADATA.yml` zaktualizowane;
      aneks do ADR 0012 przy wyborze wariantu (c).

## Wynik

(do uzupełnienia po wykonaniu)
