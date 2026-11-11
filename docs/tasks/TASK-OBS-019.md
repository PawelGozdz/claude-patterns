---
id: TASK-OBS-019
title: 'Telemetria: ścieżka pliku w lokalnych zdarzeniach (etap 2) i ruleId z wyjścia lintu w trybie cienia'
type: feature
status: done
priority: P3
story_points: 3
created_date: 2026-11-10
updated_date: 2026-11-11
assignee: '@unassigned'
labels: [observability, telemetry, verifier, lint]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-018]
related: [TASK-OBS-018, TASK-ORC-GATE-COST-001]
source: 'wydzielone z TASK-OBS-018 przy zamknięciu etapu 1 (2026-11-10): zakres wymaga informacji od juz-ide-api, których nie ma w repo'
---

# TASK-OBS-019: dopasowanie miejsca i ruleId z lintu

**Stan (2026-11-11): zakres A zrobiony, zakres B wypadł.** Obie rzeczy od juz-ide-api są wyjaśnione (sekcja „Wynik"); treść poniżej
zostaje jako historia decyzji.

## 🎯 Goal

Porównanie lintu z weryfikatorem (cel TS-TOOLING-003) na poziomie *miejsca*, a nie tylko reguły: czy lint złapał to samo
`ruleId` w tym samym `plik:linia`, co weryfikator. Etap 1 (TASK-OBS-018) daje porównanie na poziomie warstwy i próby:
sonda czerwona vs NO-GO, `ruleHits` weryfikatora bez ścieżek, `shadowLint` tylko jako pass/fail.

## Czego brakuje do startu

1. **Potwierdzenie właściciela juz-ide-api**, że porównanie rzeczywiście potrzebuje `plik:linia`, a nie samego `ruleId` per
   warstwa i próba (to rozstrzyga, czy etap 2 w ogóle jest potrzebny).
2. **Format wyjścia lintu** (`pnpm lint:ddd`): najlepiej reporter strukturalny (np. eslint `-f json`) albo opis formatu
   linii. Bez tego nie da się deterministycznie wyciągnąć `ruleId` i miejsca.

## Zakres

### A. Ścieżka pliku w lokalnych surowych zdarzeniach (wariant c z TASK-OBS-018, D1)

- Schemat: `step.ruleHits[].file` (ścieżka względna, bez `..`, długość ograniczona), dozwolone tylko w surowych zdarzeniach;
  `projectRollup` i `buildBatch` nigdy go nie niosą (test, że `findLeaks` i eksport nie widzą `file`).
- Aneks do ADR 0012 (dziś §3: zdarzenie nie zawiera ścieżek plików). `telemetry/events/` jest w `.gitignore`.
- Kolektor i konwerter przepisują `file` z `findings[].file`; `FINDINGS_FIELD` prosi o `{ruleId, line, file}`.

### B. `ruleId` z wyjścia lintu w trybie cienia

- **Nie** przez agenta sondy: sonda parafrazuje cytaty (ORC-137), więc ekstrakcja `ruleId` byłaby zawodna.
- Deterministyczny parser uruchamiany przez sondę (np. `tools/lint-shadow/parse.mjs` dla formatu z pkt 2), wynik jako
  `shadowLintHits: [{ruleId, line}]` obok `shadowLint` w `step.checks`.
- Zasady jak w TASK-OBS-018: `ruleId` przez `normalizeRuleId`, wolny tekst nie wchodzi do zdarzenia.

## Kryteria akceptacji

- [x] Potwierdzenie z juz-ide-api (pkt 1) i format wyjścia lintu (pkt 2) zapisane w tym zadaniu (sekcja „Wynik").
- [x] Aneks do ADR 0012 dla `file` (tylko surowe lokalne zdarzenia).
- [x] Test: rollup nie zawiera `file` (`rule-hit-file-never-reaches-the-rollup`), eksport go nie przepuszcza (`rule-hits-leave-only-as-counters-with-safe-keys`
      z podrzuconym `file` i `findLeaks`), a schemat odrzuca `file` z `..`, ścieżki bezwzględne, `\`, znaki sterujące, pusty i za długi.
- [ ] ~~Parser lintu z testami na realnym wyjściu projektu; wynik w `step.checks.shadowLintHits`.~~ Odpada: juz-ide-api ma własny dziennik cienia.
- [ ] ~~Zestawienie `ruleId × plik:linia` z `shadowLintHits` tej samej warstwy i próby.~~ Robi je właściciel lintu (TS-TOOLING-006, zamrożone do
      końca okna wstrzymania, BDR-134); po stronie claude-patterns jest już `file` w zdarzeniach.
- [x] Konwencja repo: walidatory CI, `CHANGELOG.md`, rule-history (ORC-159).

## Wynik

**Odpowiedzi właściciela juz-ide-api** (orkiestrator-2, api-develop, 2026-11-11, w odpowiedzi na pytanie z claude-patterns):
1. **Potrzebny `plik:linia`.** Ich plan (TS-TOOLING-006, pkt 3) łączy dziennik cienia z weryfikatorem po instancji, czasie i `taskRef`;
   ręczna klasyfikacja trafień jako prawdziwe lub fałszywe wymaga `file:line`. Samo `ruleId` per warstwa wystarcza tylko do pokrycia reguł.
2. **Mapowania `ruleId` lintu na `ruleId` weryfikatora nie ma.** Reguły `juz/*` odwołują się do kart komentarzami w
   `tools/lint-ddd/rules/*.mjs`; tabelę trzeba zbudować (TS-TOOLING-006, pkt 3–4). Kryterium „ten sam plik, linia ±3" to propozycja
   z ich strony, nie decyzja właściciela; progi ustala właściciel.
3. **Format wyjścia lintu:** dziennik cienia `~/.claude/metrics/lint-ddd-shadow.jsonl` (`tools/lint-ddd/lint-shadow-log.mjs`), wiersz
   `{v, ts, branch, head, cwd, interactive, files, durationMs, errors, warnings, byRule, findings[{file, ruleId, line, severity}]}`,
   do 200 ustaleń na wiersz, ścieżki i numery linii bez treści kodu, lokalny. Pisze go w tle `lint:ddd:file` (hook `file-check`);
   pełny `lint:ddd` trwa ok. 60 s wobec 0,4 s na plik. Do próby w Workflow bliżej jest `lint:ddd:file` na zmienionych plikach.
4. **Zastrzeżenia:** TS-TOOLING-006 jest zamrożony do końca okna wstrzymania (BDR-134, brak klasy a–d); nie potwierdzono, że `file-check`
   odpala się po zapisach implementerów `/orchestrate` (sprawdzony tylko dla subagenta general-purpose), więc trafienia w krokach GO
   mogą być zaniżone (implementer widzi wynik lintu przed weryfikatorem).

**Zrobione (zakres A).** Prompt weryfikatora warstwy i bramki końcowej prosi o `{ruleId, line, file}` (`FINDINGS_FIELD`);
`normalizeRuleFile` + `normalizeRuleHits` w `scripts/lib/telemetry-rules.mjs` (względna ścieżka z `/`, bez `..`, `\`, znaków sterujących,
do 200 znaków; niepasująca jest pomijana, ustalenie zostaje; `./` obcięte, spacje na brzegach przycięte); `step.ruleHits[].file` w
schemacie v1; aneks do ADR 0012; ORC-159. Kolektor i konwerter legacy dziedziczą `file` przez `normalizeRuleHits`, bez zmian w ich kodzie.
`decideVerdict` i `ruleSignature` go nie czytają.

**Testy.** `telemetry-events` (24): `file` poprawny przechodzi, a bezwzględny, `..` na początku/środku/końcu, `\`, pusty, znak sterujący,
ponad 200 znaków, nie-napis i pole spoza schematu są odrzucane; konwerter normalizuje osiem kształtów `file`. `telemetry-rollups` (21):
rollup z `file` i bez jest identyczny, bez śladu ścieżki. `telemetry-export` (11): `file` podrzucony do `rules` nie wychodzi,
`findLeaks` czysty. `orchestrate-script` (135): oba prompty proszą o `file`. `prompt-structure` (120) i `context-bill` bez zmian.

**Odstępstwa od zakresu.** Zakres B (parser lintu w sondzie, `shadowLintHits`) wypadł: dziennik cienia juz-ide-api już daje `file`,
`ruleId`, `line`, a parser w sondzie powielałby go i byłby zawodny (sonda parafrazuje cytaty, ORC-137). Zestawienie `ruleId × plik:linia`
i mapowanie reguł po stronie juz-ide-api. Nie ma tu narzędzia do łączenia dziennika ze zdarzeniami: ich plan robi to po swojej stronie.

**Pomiar.** `file` pojawi się dopiero w nowych przebiegach (prompt jest świeży). Miarą jest udział `ruleHits` z `file` w NO-GO weryfikatora
i bramki w `telemetry/events/*.jsonl`; dziś 0, bo żaden przebieg nie ruszył na nowym prompcie.
