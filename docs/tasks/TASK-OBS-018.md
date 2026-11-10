---
id: TASK-OBS-018
title: 'Telemetria: reguły naruszone przez weryfikatora i bramkę końcową oraz wynik sondy w zdarzeniu kroku (odcisk ustaleń, porównanie z lintem)'
type: feature
status: todo
priority: P2
story_points: 8
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [observability, telemetry, verifier, gate]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-014]
related: [TASK-OBS-017, TASK-ORC-GATE-COST-001, TASK-ORC-FINAL-GATE-CHUNKS-001]
source: 'prośba z juz-ide-api (TS-TOOLING-003, gałąź feature/TS-TOOLING-003-lint-ddd-pokrycie-regul-domena-application); analiza wykonalności: ask-project na kopii origin/develop 15c102e, 2026-11-10; rozszerzenie o bramkę końcową po analizie kosztów z telemetrii, 2026-11-10'
---

# TASK-OBS-018: które reguły weryfikator i bramka uznały za złamane + wynik sondy w zdarzeniu kroku

**Stan: gotowe do implementacji (2026-11-10).** Odniesienia do kodu sprawdzone w drzewie roboczym, decyzje D1–D5
podjęte (niżej). Otwarte zostaje tylko potwierdzenie etapu 2 przez właściciela juz-ide-api; nie blokuje etapu 1.

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
- Weryfikator warstwy: z zdarzeń `juz-ide-api*` od lipca 795 kroków i 53 NO-GO (6,7%); w całej flocie od 1.10: 973 kroki,
  46 NO-GO (4,7%).
- **Rozbieżność do wyjaśnienia:** pierwsza wersja zadania podawała 1595 kroków i 327 NO-GO (z journali). Zdarzenia dają
  inny rząd wielkości; podejrzenie: journale zawierają duplikaty po wznowieniach. Nieuzgodnione, patrz kryteria akceptacji.

## Zakres

1. **`VERDICT_SCHEMA`** (`scripts/workflow/orchestrate.template.mjs:1897`) jest wspólny dla weryfikatora warstwy i
   bramki końcowej (`final-gate` używa go w `:2535`), więc jedno pole obejmuje oba. Dodać opcjonalne
   `findings: [{ruleId, line?}]` i `rules_checked: number`. Wyrównać prompty: 5 weryfikatorów (`code-quality-verifier`,
   `refine-`, `nextjs-`, `python-`, `flutter-quality-verifier`), **`security-e2e-verifier`** i `buildFinalGatePrompt`
   (`:854`, dziś prosi o `plik:linia — reguła — poprawka`). Tekst `violations` zostaje dla `decideVerdict` (`:1004`).
   Lokalne kopie w projektach (np. `aig-code-verifier` w ai-gateway) aktualizuje projekt.
   `ruleId` = identyfikator z karty reguł albo wpisu katalogu pułapek; ustalenie spoza obu to literał `new` (D5).
2. **Kolektor** (`scripts/workflow-metrics-collect.mjs`): wynik agenta czytany jest w `:92` (`resultByAgent`), rekord
   kroku powstaje w `steps.push` (`:108-131`). Przepisać `findings` do rekordu jako `ruleHits`, tylko dla kroków z
   `agentType` i `role` ∈ {`verifier`, `gate`}. Uwaga: `role: gate` obejmuje też sondy `final-checks` bez agenta
   (318 kroków w danych) i te nie dostają `ruleHits`.
3. **Konwerter** (`scripts/lib/telemetry-legacy.mjs:155-157`): zapisać `step.ruleHits` po walidacji. Normalizacja i
   limity w jednym miejscu (pkt 5).
4. **Schemat zdarzeń** (`schemas/telemetry-event-v1.schema.json`, blok `step` od `:69`, `additionalProperties: false`;
   walidator `telemetry-events.mjs:148`, obsługuje `items`): dodać `ruleHits`, dozwolone tylko dla
   `step.role` ∈ {`verifier`, `gate`}. `v: 1` zostaje (zmiana addytywna, tryb jak `blamed` w ADR 0012).
   **Nazwa nie może być `step.findings`**: to liczba całkowita tylko dla `process: review-panel` (reguły `:34-42`).
5. **Helper `scripts/lib/telemetry-rules.mjs`** (nowy): `normalizeRuleId` i `ruleSignature`.
   - `normalizeRuleId`: małe litery, `_`→`-`, bez prefiksów `feedback-`/`project-`/`reference-` (nazwa pliku wpisu pamięci
     bramki daje identyfikator), wynik musi pasować do `SAFE_KEY` z `telemetry-export.mjs:23`
     (`^[a-z0-9][a-z0-9_.:-]{0,63}$`); niepasujący jest odrzucany, nie obcinany. Karty używają wielkich liter
     (`A1`, `N3`, `CLR7`), więc bez normalizacji eksport by je odrzucił.
   - `ruleSignature(ruleHits)`: posortowane unikalne `ruleId` złączone przecinkiem, SHA-1, pierwsze 12 znaków hex;
     pusta lista daje `null`. Ta sama lista w innej kolejności i z duplikatami daje ten sam odcisk.
   - Limity: najwyżej 50 wpisów, `line` całkowite ≥ 1.
6. **Wynik sondy** w zdarzeniu `role: probe` (pass/fail per check). `CHECKS_SCHEMA` (`:1807`) nie ma pola `verdict`,
   więc kolektor daje `ok` (`workflow-metrics-collect.mjs:92`). Etykieta `<warstwa>-checks-<n>` daje `group:unit`
   zgodne z `<warstwa>-verify`, więc parowanie po `group:unit + attempt` jest możliwe, brakuje tylko pola.
7. **Tryb cienia** dla własnego checku projektu. `checks:` przyjmuje dowolny skrypt `package.json`
   (`orchestrate.template.mjs:543-556`), ale każdy czerwony `lint*` jest blokujący (`probeIsRed`, `:497`, liczy
   `lint === 'fail'` i cofa warstwę do implementera), dlatego `lint:check` wyjęto z `layers.yml:50-57`. Potrzebny
   nowy wbudowany identyfikator (np. `lint:ddd`) z osobnym polem tylko do zapisu, jak `conformance`, ale bez wpływu na
   `probeIsRed`. Mapowanie po nazwie (`literalMapping`, `:684`) zlałoby `lint:ddd:ratchet` z `lint:check`.
8. **Rollup i eksport:** licznik `ruleId` per rola (`verifier`, `gate`) i agent, jako leniwy blok jak `verdicts`
   (`telemetry-rollup.mjs:171-176`), żeby dni bez danych zostały bajt w bajt takie same. Eksport buduje się z rollupów
   przez jawne whitelisty (`telemetry-export.mjs:62-72`, `projectRollup` `:126`), więc nowy licznik trzeba tam dopisać,
   a klucze przejdą przez `SAFE_KEY`. Raport tygodniowy to osobna decyzja.

## Decyzje (podjęte 2026-11-10)

- **D1. Ścieżki plików w zdarzeniu.** ADR 0012 §3: zdarzenie nie zawiera ścieżek ani treści.
  - *Etap 1:* tylko `ruleId` i `line`, bez `file`. Wystarcza dla odcisku, licznika trafności katalogu i wyłącznika pętli.
  - *Etap 2 (wariant c):* `file` (ścieżka względna, bez `..`) **tylko w lokalnych surowych zdarzeniach**
    (`telemetry/events/` jest w `.gitignore`), nigdy w rollupie i eksporcie. Wymaga aneksu do ADR 0012 i potwierdzenia
    właściciela juz-ide-api, że porównanie z lintem potrzebuje dopasowania miejsca. Nie blokuje etapu 1; do tego czasu
    projekt zbiera dane z `journal.jsonl` własnym skryptem.
  - *Weryfikacja wykonalności (2026-11-10):* paczka eksportu powstaje z rollupów przez whitelisty, surowe zdarzenia
    nie wchodzą do niej wcale. Wariant (c) jest więc możliwy bez przecieku, o ile rollup nie dostanie pola `file`
    (test w kryteriach).
- **D2. Nazwa pola:** `step.ruleHits`.
- **D3. Odcisk nie jest zapisywany w zdarzeniu.** Top-level `signature` ma semantykę id odchylenia `DEV-*`
  (`report-deviation.mjs:229`), więc przeciążanie go pomieszałoby konsumentów. Odcisk liczy `ruleSignature` w czasie odczytu.
- **D4. Zakres obejmuje weryfikatora warstwy i bramkę końcową.** W danych to bramka niesie koszt ($892) i 47% NO-GO.
- **D5. Ustalenie bez znanego `ruleId` dostaje literał `new`**, a nie wolny tekst (wolny tekst zaśmiecałby klucze i
  przeciekał treść). Opis zostaje w `violations`. Liczba `new` to miara luk katalogu pułapek.

## Kontekst dla świeżej sesji

- Pierwsze dane nie czekają na to zadanie: `~/.claude/projects/<slug>/<sesja>/subagents/workflows/<runId>/journal.jsonl`
  zawiera pełny wynik weryfikatora (`violations` jako wolny tekst z `ruleID @ plik:linia`). Projekt zgłaszający zbiera je
  stamtąd skryptem. To zadanie ma zastąpić to stałym, ustrukturyzowanym zapisem w telemetrii.
- Odniesienia do kodu sprawdzone 2026-11-10 (w tej wersji zadania poprawione: `probeIsRed` jest w `:497`, nie `:1830+`).
  Niezacommitowane zmiany w drzewie roboczym dotyczą `blocks/ddd/core.yml`, `blocks/{nestjs,node,ts-library}.yml`,
  `commands/analyze.md` (ANL-021) i dokumentacji, czyli nie plików z zakresu. Przed startem i tak sprawdzić
  `git status` dla `orchestrate.template.mjs`, kolektora, schematu i promptów weryfikatorów.
- Rematerializacja `runtime.yml` w instancjach nie jest potrzebna dla pkt 1–6 i 8 (zmiana w szablonie, kolektorze i
  schemacie, prompty agentów są symlinkowane); dla pkt 7 zależy od tego, czy zmieni się `checks:` w bloku.

## Kolejność implementacji

1. `telemetry-rules.mjs` z testami (normalizacja, odcisk).
2. Schemat, walidator i konwerter (`ruleHits` przechodzi `validateEvent`, stare zdarzenia bez migracji).
3. Kolektor.
4. `VERDICT_SCHEMA` i prompty (weryfikatorzy, `security-e2e-verifier`, `buildFinalGatePrompt`).
5. Rollup i eksport.
6. Wynik sondy.
7. Tryb cienia dla `lint:ddd`.
8. Etap 2 (`file`) po aneksie do ADR 0012.

Evale: `telemetry-events`, `telemetry-rollups`, `telemetry-export`, `orchestrate-script` (nazwy z EP-OBSERVABILITY-002;
przed startem potwierdzić w repo).

## Poza zakresem

Wyłącznik pętli, powtórna bramka na delcie, eksperyment z diffem w prompcie bramki i pilotaż katalogu pułapek:
[TASK-ORC-GATE-COST-001](TASK-ORC-GATE-COST-001.md). To zadanie dostarcza im dane (`ruleHits`, `ruleSignature`).

## Kryteria akceptacji

- [ ] Przebieg `/orchestrate` ze stub-weryfikatorem **i stub-bramką** zapisuje `step.end` z listą `{ruleId, line}`,
      która przechodzi `validateEvent`; stare zdarzenia nadal przechodzą bez migracji.
- [ ] `ruleHits` w kroku spoza `role` ∈ {`verifier`, `gate`} jest odrzucone, a `step.findings` panelu działa bez zmian
      (test regresji). Sonda `final-checks` (`role: gate` bez agenta) nie dostaje `ruleHits`.
- [ ] `normalizeRuleId`: `A1`→`a1`, `feedback_Foo_bar`→`foo-bar`; identyfikator niepasujący do `SAFE_KEY` jest
      odrzucany i nie trafia do rollupu ani eksportu.
- [ ] `ruleSignature`: ta sama lista w innej kolejności i z duplikatami daje ten sam odcisk; pusta lista daje `null`.
- [ ] `telemetry-export --check` i `buildBatch` nie zawierają ścieżek ani numerów linii z pola; liczniki `ruleId`
      przechodzą whitelistę eksportu (test).
- [ ] Weryfikator i bramka bez wypełnionego pola nie zmieniają zachowania `decideVerdict` ani werdyktu.
- [ ] Czerwony lint w trybie cienia nie cofa warstwy do implementera (test w `orchestrate-script`).
- [ ] Dla pary weryfikator + sonda tej samej warstwy i próby da się z surowych zdarzeń odtworzyć: które `ruleId`
      flagowano i czy sonda była czerwona.
- [ ] Liczba kroków i NO-GO weryfikatora przeliczona z journali z deduplikacją po `runId+agentId` i zapisana w sekcji
      Wynik wraz z wyjaśnieniem różnicy wobec 795/53 ze zdarzeń.
- [ ] Konwencja repo: `count-assets.mjs --check-docs`, walidatory CI, `CHANGELOG.md` i `METADATA.yml` zaktualizowane.
- [ ] Etap 2 (osobno): `file` tylko w surowych lokalnych zdarzeniach, test że rollup i eksport go nie niosą, aneks do
      ADR 0012.

## Wynik

(do uzupełnienia po wykonaniu)
