---
id: DEV-orc-069-final-gate
status: promoted
resolution: >
  Reopen (marketing-hub TS-MH-009, 2026-09-29) — nowy wariant: unverified_scope
  wymieniał "karty/README/render-with-refine" (dokumentacja pokryta zielonymi
  checks), bez frazy self-admission (ORC-076), ścieżki własnego pliku
  analizy/task (ORC-079) czy id decyzji (ORC-080) — żaden z trzech mechanicznych
  filtrów final gate go nie łapie. Świadomie NIE zbudowano czwartego filtra na
  tę okazję — bez konkretnych ścieżek plików ("karty"/ "render-with-refine" to
  niejasne odniesienia, nie ścieżki) każda heurystyka byłaby zgadywaniem. Do
  zebrania więcej dowodów (konkretne ścieżki, powtarzalność), jeśli się powtórzy
  — patrz też ORC-080 (docs/decisions/orchestrate-rule-history.md#orc-080).
  Naprawione (droga naprzód) 2026-09-27 jako ORC-072
  (docs/decisions/orchestrate-rule-history.md#orc-072): occurrence #2
  (README.md/.gitignore nowego pakietu, sam artefakt analizy) to DOKŁADNIE
  przypadek, dla którego zbudowano kanał decisions — te 2 zdarzenia wydarzyły
  się PRZED fixem, więc nie zostały nim naprawione retroaktywnie, ale kolejny
  resume tego taska z dopisaną decyzją (np. "D-x: README/.gitignore/analysis.md
  tego pakietu są dokumentacyjne, poza zakresem final-gate") przejdzie czysto.
  Fixture'y JSON zweryfikowane niezależnie przez inną warstwę
  (static-corpus-fixtures) to pokrewny, ale NIE identyczny przypadek —
  ORC-070/072 tego mechanicznie nie łapią (to nie dirs innej warstwy ani
  samo-przyznanie w unverified_scope), więc też wymaga decyzji: albo wpis w
  decisions[], albo osobna reguła "zweryfikowane w innej warstwie tego
  przebiegu" - do rozważenia, jeśli się powtórzy. Occurrence #1 (pnpm-lock.yaml
  nie sprawdzony ręcznie, brak deps:circular/madge) to INNY, wciąż realny
  problem — brakujące tooling w feature-flags, nie coś do zamaskowania decyzją.
  Zostaje do naprawienia w tamtym projekcie.
  Aktualizacja 2026-10-04: wariant NO_GO bramki końcowej z samego unverified_scope przy zerze
  naruszeń i zielonych checks pokrywa ORC-098 (sonda silnika + GO z lukami). Wystąpienie z
  juz-ide-api-1 (brak L2 w final_gate.checks) pozostaje sprawą configu projektu.
trigger: no_go
rule_ref: ORC-069
first_seen: 2026-09-27
last_seen: 2026-10-02
occurrences: 6
projects:
  - feature-flags
  - marketing-hub
  - juz-ide-api-1
  - ai-os-bot
  - ai-gateway
reopened_at: 2026-09-30
reopened_from_status: dismissed
---

# DEV-orc-069-final-gate

## Occurrences

- 2026-10-02 ai-gateway (TS-AIG-042) run `wf_0894943d-43a` warstwa `final-gate` — Bramka końcowa NO_GO (cause machine) wymuszona samym unverified_scope; weryfikator nie czytał 4 plików usage/ ani TM/analizy. Wcześniej warstwa testing:usage-tests stanęła, bo scope.dirs=src/usage/ obejmował kod innej warstwy (layerTouches po podciągu) — obejście przez --overrides scope.
- 2026-10-02 ai-os-bot (BOT-023) run `wf_d2fa907c-705` warstwa `final_gate` — Bramka końcowa NO_GO (cause: machine) wymuszone wyłącznie przez unverified_scope przy zielonym typecheck/lint/439 testach; warstwa testing GO_WITH_GAPS
- 2026-09-30 juz-ide-api-1 (TS-REP-DISCLOSURE-POLICY-001) run `wf_6e32b591-791` warstwa `final_gate` — Bramka końcowa: typecheck 0 błędów, 12347 testów zielonych, security bez VETO, ale GO z niepustym unverified_scope (test L2 integration nieuruchomiony przez heavy-test lock; treść dokumentów sprawdzona tylko obecnością) => wymuszone NO_GO wg ORC-069. Bramka nie ma L2 w checks.
- 2026-09-29 marketing-hub (TS-MH-009) run `wf_5b6ca007-502` warstwa `final-gate` — Bramka końcowa: rationale GO, ale niepusty unverified_scope (karty/README/render-with-refine) wymuszony NO_GO bez retry; luki to dokumentacja pokryta zielonymi checks
- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `final-gate` — Drugie wystąpienie NO_GO bramki końcowej TASK-0010, tym razem po wyczyszczeniu wcześniejszej anomalii i czystym GO wszystkich 5 warstw/jednostek + zielonych deterministycznych checkach (turbo test/lint 16/16, flutter test/analyze na obu pakietach Dart). Werdykt bramki: 'No cross-layer regression detected', a mimo to GO wymuszone na NO_GO przez 3 pozycje unverified_scope: (1) treść fixture'ów JSON nie przejrzana bajt-po-bajcie poza potwierdzeniem, że przechodzą przez pełny, zielony test suite (142/142) i walidację schematu — warstwa static-corpus-fixtures już to zweryfikowała niezależnie; (2) README.md i .gitignore nowego pakietu — pliki niefunkcjonalne; (3) sam artefakt analizy zadania (dokument planistyczny, nie wysyłany kod). Żaden z 3 punktów nie jest realnym ryzykiem jakości kodu.
- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `final-gate` — Bramka końcowa TASK-0010 (agent library-quality-verifier) zwróciła GO z niepustym unverified_scope po tym, jak wszystkie 5 warstw/jednostek implementacyjnych dostało czyste GO. Bramka jednorazowa (bez retry) -> wymuszone NO_GO per ORC-069. Trzy nieuzweryfikowane pozycje: (1) pliki brudne PRZED startem przebiegu (packages/contracts/src/generated/*.ts, standalone-validators.js) - to ta sama anomalia zgłoszona już w DEV-orc-069-implementation-sdk-dart-core (przypadkowe uszkodzenie generated/standalone-validators.js z pierwszej rundy tego przebiegu, ~11615 usuniętych linii) - bramka słusznie nie obwinia za nią tego taska (były już dirtyAtStart), ale też nie potwierdza że są bezpieczne; (2) pnpm-lock.yaml nie sprawdzony ręcznie; (3) brak skryptu deps:circular w repo (madge/nx graph nie uruchomiony), więc acykliczność sdk-dart-riverpod->sdk-dart potwierdzona tylko czytaniem pubspec.yaml, nie realnym grafem.
