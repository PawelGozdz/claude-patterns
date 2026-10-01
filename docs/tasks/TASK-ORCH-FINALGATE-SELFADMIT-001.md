---
id: TASK-ORCH-FINALGATE-SELFADMIT-001
title: 'final_gate nie filtruje self-admitted-out-of-scope jak decideVerdict() — szczere ujawnienie niepełnego pokrycia plików niezmienionych/testowych wymusza NO_GO bez retry'
type: bugfix
status: done
priority: P1
story_points: 2
created_date: 2026-09-28
updated_date: 2026-09-29
assignee: '@unassigned'
labels: [kaizen, orchestration, workflow, verifier]
depends_on: []
related: [ORC-069, ORC-071, ORC-070]
source: >
  docs/tasks/_inbox/DEV-orc-069-presentation.md (juz-ide-mobile-app, DESIGN-SYSTEM-009,
  warstwa presentation, 2026-09-28) — final_gate (jednorazowy, bez retry) dostał GO z
  niepustym unverified_scope od flutter-security-verifier: uzasadnienie werdyktu było w
  całości czyste (żadna powierzchnia bezpieczeństwa tego gate'a nietknięta), ale agent
  uczciwie przyznał, że nie przeczytał w całości 7 niezmienionych plików importowanych przez
  zmienione ekrany (sprawdził je tylko grepem) i 8 plików testowych (świadomie pominął jako
  niewysyłane w binarce release). ORC-069/ORC-071 filtrują self-admitted-out-of-scope TYLKO w
  decideVerdict() (pętla warstwy) — final gate (linia ok. 977-985 orchestrate.template.mjs)
  nie ma tego filtra, więc KAŻDE szczere ujawnienie niepełnego pokrycia niezmienionych/
  testowych plików wymusza NO_GO bez możliwości naprawy. Zamknięte ręcznie przez człowieka
  po niezależnej weryfikacji tych 7 plików (czyste).
---

# TASK-ORCH-FINALGATE-SELFADMIT-001 — final gate karze szczerość tak samo jak realną lukę

## 🎯 Goal

`decideVerdict()` (pętla warstwy, ORC-069/ORC-071) rozróżnia dwa rodzaje `unverified_scope`:
realną lukę weryfikacji od self-admitted-out-of-scope (agent jawnie mówi "to poza zakresem
tej bramki, celowo nie sprawdzałem" — np. pliki niezmienione względem `baseSha`, albo pliki
niewysyłane w artefakcie produkcyjnym). `final_gate` (linia ok. 977-985
`scripts/workflow/orchestrate.template.mjs`) tego rozróżnienia nie robi — każdy niepusty
`unverified_scope`, niezależnie od przyczyny, wymusza `NO_GO`. Final gate jest jednorazowy
(bez retry, ORC-069 — świadoma decyzja: bramka końcowa ma być surowa), więc skutek jest
gorszy niż na zwykłej warstwie: nie ma szansy na poprawę, tylko ręczna interwencja człowieka.

Efekt: weryfikator, który szczerze przyznaje "nie przeczytałem w całości plików X i Y, bo są
poza zakresem tej bramki (niezmienione / nie trafiają do binarki)" jest karany identycznie jak
weryfikator, który realnie czegoś nie sprawdził z lenistwa albo braku budżetu. To odwraca
zachętę — agent, który wie, że szczerość i tak kończy się `NO_GO`, ma słabszy powód, żeby ją
zgłaszać zamiast przemilczeć.

Zaobserwowane 2026-09-28 (juz-ide-mobile-app, DESIGN-SYSTEM-009): `flutter-security-verifier`
dał czysty werdykt na wszystkich dotkniętych powierzchniach, ale uczciwie zgłosił niepełne
pokrycie 7 plików niezmienionych (sprawdzonych tylko grepem) i 8 plików testowych (celowo
pominiętych — nie trafiają do release). Final gate wymusił `NO_GO`; zamknięte ręcznie przez
człowieka po niezależnej weryfikacji tych 7 plików.

## Potwierdzone w kodzie (2026-09-29, priorytet podniesiony P2→P1)

Przeczytane wprost `scripts/workflow/orchestrate.template.mjs:962-990`: final gate NIE WOŁA
`decideVerdict()` w ogóle. Ma własny, osobny, dużo prostszy blok (linie 980-985):
`finalUnverified = report.finalGate.unverified_scope.filter(Boolean)` — jedyny filtr to
odrzucenie pustych/falsy wpisów. Żaden z trzech mechanizmów `decideVerdict()` (ORC-070:
`ownUnverified`/`layerTouches` — filtr pozycji należących do INNEJ warstwy; ORC-071:
`SELF_ADMITS_OUT_OF_SCOPE` — filtr samo-przyznania w prozie; ORC-074: `reverify` zamiast
`fix`) nie działa na final gate. Final gate biegnie dziś dokładnie w tej najbardziej
naiwnej, pierwotnej wersji reguły z 2026-09-26 (ORC-069), sprzed WSZYSTKICH trzech rund
twardnienia, które okazały się konieczne na poziomie warstw.

To wyjaśnia, dlaczego `DEV-orc-069` w `_inbox` odnowiło się 6+ razy w 3 dni w 5 różnych
projektach (ai-os-bot, grant-flow, juz-ide-api, feature-flags, marketing-hub) — WSZYSTKIE
zaobserwowane wystąpienia trafiają w final gate (`trigger: no_go`, linia 986-988), zero w
sam retry-loop warstw (tam ORC-070/071/074 już redukują ten sam typ szumu). Duża część tej
częstotliwości to prawdopodobnie dokładnie ten sam fałszywy alarm, który 070/071 już
wyeliminowały gdzie indziej — po prostu nigdy nieportowany tutaj.

## Poprawka (do wyboru przy implementacji)

- (a) **Rekomendowane**: final gate woła `decideVerdict()` (albo wydzieloną z niej wspólną
  funkcję filtrującą) zamiast własnego, osobnego bloku — jedna implementacja obu filtrów
  (ORC-070 + ORC-071) zamiast dwóch rozjeżdżających się kopii tej samej reguły.
- (b) Minimalny wariant: skopiować oba filtry (`ownUnverified`, `SELF_ADMITS_OUT_OF_SCOPE`)
  do bloku final gate bez pełnej refaktoryzacji na wspólną funkcję — szybsze, ale wraca
  ryzyko rozjazdu przy następnej zmianie reguły (dokładnie to, co się już stało: 3 rundy
  poprawek trafiły w decideVerdict, zero w final gate).
- (c) Dodatkowo (analogicznie do ORC-070 na poziomie warstw): plik niezmieniony względem
  `baseSha` odfiltrowywany automatycznie z `unverified_scope` na final gate.

## ✅ Kryterium ukończenia

Eval z werdyktem final gate zawierającym WYŁĄCZNIE self-admitted-out-of-scope wpisy (plik
niezmieniony względem `baseSha`, plik niewysyłany do artefaktu) — wynik `GO`, nie `NO_GO`.
Werdykt z realną, nie-self-admitted luką nadal daje `NO_GO` bez retry (zachowanie ORC-069 dla
prawdziwych luk pozostaje bez zmian). Test dwukierunkowy w
`tests/flow-evals/orchestrate-script/run.js`.

## Wynik (2026-09-29)

Zaimplementowane jako ORC-076 (docs/decisions/orchestrate-rule-history.md#orc-076), wariant (a):
`SELF_ADMITS_OUT_OF_SCOPE` i nowa funkcja `filterSelfAdmittedOutOfScope()` przeniesione na
poziom modułu w `orchestrate.template.mjs` (jedno źródło zamiast dwóch kopii tej samej reguły);
blok final gate filtruje `unverified_scope` tym samym filtrem przed sprawdzeniem czystości `GO`.
Filtr ORC-070 (cudza warstwa) świadomie NIE przeniesiony — final gate ocenia całość zmiany, więc
"cudza warstwa" nie ma tam tego samego znaczenia, a zaobserwowany przypadek był czystym
self-admission. Nowy eval `final-gate-unverified-scope-self-admission`; pełny suite
`tests/flow-evals/orchestrate-script/run.js`: 32/32 (30 istniejących bez regresji + 2 nowe,
razem z ORC-078). `canonical-script-passes-workflow-lint` zielony.

## Dodatek (2026-09-29, ORC-079)

Pierwszy realny przebieg z ORC-076 na żywo (ai-os-bot BOT-005a-tests, `DEV-orc-069.md` reopen
#5) pokazał lukę: pozycja „sam plik analizy" w `unverified_scope` nie zawierała żadnej frazy z
`SELF_ADMITS_OUT_OF_SCOPE`, więc filtr jej nie złapał. Dodane `filterOwnTaskArtifacts()` —
filtr strukturalny po ścieżce (`a.task.analysisFile`/`taskFile`), nie po kolejnym wariancie
frazy. Nowy eval `final-gate-filters-own-task-artifacts-by-path`; suite: 33/33. Pozostałe dwie
pozycje z tego samego zgłoszenia („D4 po commicie", „pełny vitest") świadomie NIE zaadresowane
— to opis kroków procesu, nie ścieżki plików; blankietowe filtrowanie ryzykowałoby ukrycie
realnej luki. Patrz ORC-079 (docs/decisions/orchestrate-rule-history.md#orc-079).

## Dodatek 2 (2026-09-29, ORC-080)

Drugi przebieg tego samego taska (ai-os-bot BOT-005a-tests, `DEV-orc-069.md` reopen #6): task
miał `decisions: [D7]` jawnie adjudykujące pozycję, a final gate i tak zgłosił ją jako
unverified_scope. ORC-072 renderuje decisions w prompcie, ale to instrukcja, nie mechanizm —
LLM nie zastosował jej konsekwentnie. Dodane `filterAdjudicatedByDecision()`: odrzuca pozycję,
której treść wymienia `id` decyzji (`\bD7\b`), niezależnie od tego, czy weryfikator ją
"zrozumiał". Nowy eval `final-gate-filters-items-adjudicated-by-decision-id`; suite: 34/34.
Osobny problem z tego samego reopenu (marketing-hub TS-MH-009: "karty/README/render-with-refine"
w unverified_scope, bez frazy/ścieżki/id do dopasowania) świadomie NIE zaadresowany — brak
konkretnych ścieżek, każda heurystyka byłaby zgadywaniem. Patrz ORC-080
(docs/decisions/orchestrate-rule-history.md#orc-080).
