---
id: DEV-orc-069
status: proposed
dismissed_reason: >
  Zbadane 2026-09-27, ponownie po reopen (occurrences: 2) — oba wystąpienia
  (grant-flow TS-RATE-003, ai-os-bot BOT-004) to ten sam wzorzec: bramka końcowa
  poprawnie wymusza NO_GO, bo weryfikacja faktycznie NIE OBJĘŁA pełnego
  typecheck/lint repo (grant-flow: tylko L3/migracja/agregat przeglądnięte
  częściowo; ai-os-bot: tylko 2 pliki testowe odpalone bezpośrednio) — to nie
  trywialna, wyjaśniona pozycja, tylko realnie niepełna weryfikacja. Working as
  intended (bramka końcowa ma być surowa i bez retry, ORC-069). Reopen nie
  wniósł nowej przyczyny — drugi projekt trafił na ten sam mechanizm, nie na
  błąd silnika. Jeśli chce się to zaadresować, to decyzja o budżecie/checks tej
  bramki per projekt (ai-os-bot, grant-flow), nie zmiana silnika.

  Reopen #2, 2026-09-27 (occurrences: 4, +juz-ide-api) — dwa kolejne
  wystąpienia, ten sam mechanizm: juz-ide-api (TS-OBS-BETA-MIN-001) — final_gate
  GO z unverified_scope realnie niekompletnym (L3/E2E zablokowane na tej
  maszynie, brak realnej instancji GlitchTip, limit embedu Discorda
  nieprzetestowany, podstawa transferu RODO to decyzja prawnika, nie inżyniera);
  ai-os-bot (BOT-021) — 2 realne unverified_scope, potwierdzone dopiero POST-HOC
  przez orchestratora (diff testu, zawartość katalogu), co explicite NIE
  zamienia automatycznie NO_GO w GO — decyzja zostaje przy człowieku, zgodnie z
  projektem bramki. 3 projekty, 4 wystąpienia w jeden dzień — świadomie
  utrzymane jako working as intended (decyzja użytkownika 2026-09-27/28, po
  jawnym przedstawieniu skali): surowość bramki jest tu funkcją, nie usterką,
  mimo rosnącego kosztu ręcznych przeglądów per projekt.

  Reopen #3, 2026-09-28 (occurrences: 5, +feature-flags) — finalGate NO_GO mimo
  wszystkich deterministycznych checków zielonych; ten sam mechanizm ogólny
  (unverified_scope niepusty → NO_GO bez retry). Zawiera dodatkowo
  NIEPOTWIERDZONE podejrzenie (słowa zgłaszającego: "podejrzenie że") osobnego,
  węższego problemu: filtr ORC-070 (już-zweryfikowane/self-admitted) mógł nie
  złapać pliku snapshot_validator.dart, bo tekst weryfikatora podał samą nazwę
  pliku, nie pełną ścieżkę — diagnoza w toku po stronie feature-flags
  (halt-diagnostician), za wcześnie na promocję do TASK-ORCH bez potwierdzonej
  przyczyny źródłowej. Do obserwacji: jeśli się potwierdzi i powtórzy, osobne
  zgłoszenie o dopasowaniu ORC-070 po nazwie pliku vs pełnej ścieżce. Poza tym
  bez zmian — dismiss.

  Reopen #4, 2026-09-28 (occurrences: 6, ai-os-bot BOT-005a) — nowy wariant tego
  samego mechanizmu: po odfiltrowaniu self-admitted (ORC-071) zostaje 1 pozycja
  (dispatchGrantFlowTool/dispatchGithubPrTool bez literalnego param
  caller:string wymaganego przez kartę architecture-verifier — właściwość
  bezpieczeństwa zachowana innym mechanizmem, policzona raz w intentRouter.ts).
  Sama bramka końcowa oceniła to jako "not a safety VETO, architecture-shape
  deviation", a ORC-069 i tak wymusił NO_GO — surowość bramki nie robi wyjątku
  nawet dla własnej oceny "to nie problem bezpieczeństwa". Working as intended,
  bez nowej przyczyny — dismiss.

  Reopen #5, 2026-09-29 (occurrences: 8, +marketing-hub) — dwa wystąpienia, dwie
  różne przyczyny, obie zaadresowane albo zdiagnozowane: (1) ai-os-bot
  BOT-005a-tests — pozycja "sam plik analizy" w unverified_scope bez frazy
  self-admission, więc świeżo wdrożone ORC-076 jej nie złapało — NAPRAWIONE jako
  ORC-079 (filtr strukturalny po ścieżce a.task.analysisFile/taskFile, nie po
  prozie). Pozostałe dwie pozycje tego wystąpienia ("D4 po commicie", "pełny
  vitest") świadomie NIE zaadresowane — opis kroków procesu, nie ścieżki plików,
  ryzyko ukrycia realnej luki przy blankietowym filtrze. (2) marketing-hub
  TS-MH-009 — INNY problem: pole verdict weryfikatora było "NO_GO", a
  uzasadnienie prozą mówiło "GO z warunkami" — sprzeczność w samym wyjściu LLM,
  nie coś, co filtr unverified_scope w ogóle dotyka (działa tylko gdy
  verdict==='GO'). Niewystarczająco zdiagnozowane do dalszej akcji — do
  obserwacji, jeśli się powtórzy.

  Reopen #6, 2026-09-29 (occurrences: 9) — ai-os-bot BOT-005a-tests, DRUGI
  przebieg tego samego taska: task miał decisions:[D7] jawnie adjudykujące
  pozycję, final gate i tak zgłosił ją jako unverified_scope (plus nową) —
  NAPRAWIONE jako ORC-080 (filtr mechaniczny po id decyzji, bo instrukcja
  promptu ORC-072 nie jest wiążąca dla LLM, ta sama lekcja co ORC-071).
  Pozostałe dwa wystąpienia tego reopenu (marketing-hub TS-MH-009 x2:
  verdict/rationale sprzeczne; Node 24 vs 22 crash V8 poza zakresem) to ten sam,
  już zanotowany, niewystarczająco zdiagnozowany problem — bez zmian.
trigger: no_go
rule_ref: ORC-069
first_seen: 2026-09-27
last_seen: 2026-10-03
occurrences: 15
projects:
  - ai-os-bot
  - grant-flow
  - juz-ide-api
  - feature-flags
  - marketing-hub
  - ai-gateway
reopened_at: 2026-09-30
reopened_from_status: dismissed
---

# DEV-orc-069

## Occurrences

- 2026-10-03 ai-os-bot (BOT-024) run `wf_087ea3d8-8ba` — Bramka końcowa BOT-024: NO_GO wymuszone wyłącznie przez unverified_scope (zero własnych naruszeń; 755 testów zielonych). Runda naprawcza minor_findings (ORC-091) nie uruchomiła się, a niewdrożone zatwierdzone D10/D15 przeszły jako minor/deviation_note. Dodatkowo agenci commitowali mimo zakazu (zgłoszone osobno jako ORC-087).
- 2026-10-03 ai-gateway (TS-AIG-066) run `wf_b24babc4-282` — Bramka końcowa: zero własnych naruszeń, NO_GO wymuszone wyłącznie przez unverified_scope (Caddy poza repo, IDN/punycode); stageForReview puste mimo tego, więc staging z drzewa.
- 2026-10-03 ai-gateway (TS-AIG-070) run `wf_865f6bd2-00a` — Bramka końcowa NO_GO (cause=machine) wyłącznie przez unverified_scope: 4 pozycje poza zasięgiem weryfikacji (ręczny test tsx --env-file, kontrola .env serwera, sekret Caddy↔grant-flow, 2 ostrzeżenia lint) — zero własnych naruszeń; wymuszone stageForReview (ORC-084). Pozycje 2-3 to z natury ręczne warunki wdrożenia i nigdy nie będą weryfikowalne przez bramkę.
- 2026-10-03 ai-os-bot (BOT-007) run `wf_7adb99d3-d9b` — Bramka końcowa: uzasadnienie mówi GO dla 007a (brak naruszeń, 562 testy zielone), ale NO_GO wymuszone wyłącznie przez niepuste unverified_scope: elementy poza repo (ai-gateway/iam), prawdziwy Discord, test:integration poza final_gate.checks i pliki .claude/** brudne przed przebiegiem. Silnik zaliczył .claude/**, KANBAN i BOT-024 (dirtyAtStart) do stageForReview i je zastage'ował; ręcznie zdjęte z indeksu.
- 2026-10-01 ai-os-bot (BOT-023) run `wf_dd0479bb-47b` — Bramka końcowa NO_GO (cause=machine) wymuszona samym unverified_scope: brak Postgresa dla ragRetriever.integration.test.ts, nieczytane migracja 005/ftsQuery/plStopwords/contextPacker/rag-eval; po stronie człowieka dopiero te testy przeszły (17/18, 1 błąd testu SHOW lc_ctype).
- 2026-09-30 grant-flow (TS-SIM-002A) run `wf_45bf4694-8fd` — Bramka koncowa TS-SIM-002A: NO_GO wymuszony przez unverified_scope (brak L3, nieprzejrzane 2 jednoliniowe zmiany encji, createLogContext), przy zerze znalezisk DREAD>=9; werdykt de facto GO z warunkami. Limit 15 wywolan na bramce dla diffu 112 plikow.
- 2026-09-29 ai-os-bot (BOT-005a-tests) run `wf_375943cb-7cb` — Drugi przebieg: bramka końcowa NO_GO z ORC-069 (GO + niepusty unverified_scope, jednorazowa bramka bez retry) mimo zielonych bramek (tsc, eslint, vitest grant-flow 71/71). Mimo D7 (jawna adjudykacja pozycji spoza zakresu) bramka zgłosiła nowy punkt, tym razem w zakresie (treść testów dat vs D6) i powtórzyła pozycje D7 jako unverified. Główna sesja zweryfikowała odczytem zgodność testów dat z D6.
- 2026-09-29 ai-os-bot (BOT-005a-tests) run `wf_0ac1f3a4-d9e` — Bramka końcowa NO_GO wymuszone przez ORC-069 (GO z niepustym unverified_scope, jednorazowa bramka bez retry) mimo zielonych bramek deterministycznych (tsc, eslint 0 errors, vitest grant-flow 58/58). unverified_scope dotyczył kroków poza zakresem warstwy (D4 po commicie, plik analizy, pełny vitest) — ORC-072/ORC-076 nie pozwoliły ich zaadiudykować, bo bramka nie ma jak uznać ich za poza zakresem.
- 2026-09-29 marketing-hub (TS-MH-009) run `wf_f33366a8-121` — final gate: verdict NO_GO przy rationale GO z warunkami; przyczyna formalna unverified_scope (SSO/platforma, Node 24 vs 22 crash V8 w root pnpm test poza zakresem)
- 2026-09-28 ai-os-bot (BOT-005a) run `wf_d291ac54-977` — Bramka końcowa BOT-005a: NO_GO — 1 realny unverified_scope po odfiltrowaniu (ORC-071: drugi punkt jawnie samo-przyznaje 'out of scope for this pass', odfiltrowany). Pozostały: dispatchGrantFlowTool/dispatchGithubPrTool nie przyjmują literalnego parametru caller:string, mimo że D5/karta architecture-verifier tego wymaga — właściwość bezpieczeństwa (tożsamość tylko z context.userId, nigdy z block.input) jest zachowana innym mechanizmem (liczona raz w intentRouter.ts, użyta w gate'ie can() przed dispatchem). Bramka końcowa sama oceniła to jako 'not a safety VETO, architecture-shape deviation'. Orchestrator (ja) już wcześniej udokumentował ten sam wniosek w task file (Status weryfikacji, BOT-005a). Deterministyczne bramki czyste: tsc/eslint/vitest (47 plików/355 testów, w tym 15 nowych dla D8a) zielone.
- 2026-09-28 feature-flags (TASK-0010) run `wf_1c573b6c-0d9` — finalGate NO_GO mimo wszystkich deterministycznych checkow zielonych (pnpm test/lint/typecheck 16/16, flutter test/analyze w sdk-dart i sdk-dart-riverpod 0 issues) - wymuszone przez ORC-069 bo weryfikator zwrocil GO z niepustym unverified_scope (2 pozycje: audyt D7 snapshot_validator.dart linia-po-linii, i diff historycznych iteracji VETO w komentarzach kodu). Pierwsza pozycja dotyczy pliku z dirs jednostki implementation:sdk-dart-core, ktora byla checkpointowana jako GO z POPRZEDNIEGO przebiegu (layers_done) - podejrzenie ze filtr ORC-070 nie zlapal jej bo tekst nie zawieral pelnej sciezki, tylko nazwe pliku. Wyslano do halt-diagnostician po diagnoze przed decyzja czlowieka.
- 2026-09-27 juz-ide-api (TS-OBS-BETA-MIN-001) run `wf_5ed97671-83e` — final_gate security-e2e-verifier zwrócił verdict GO z niepustym unverified_scope (L3/E2E nie uruchomione — blokada heavy-test globalna na maszynę; brak realnej instancji GlitchTip do walidacji kształtu payloadu; limit rozmiaru embedu Discorda nieprzetestowany; podstawa transferu do Discorda z rozdziału V RODO to decyzja prawnika). ORC-069 wymusza NO_GO na jednorazowej bramce końcowej bez retry.
- 2026-09-27 ai-os-bot (BOT-021) run `wf_02662736-56a` — Bramka końcowa (safety-reviewer) BOT-021: NO_GO — 2 realne unverified_scope bez retry (final gate jednorazowa): (1) src/core/observability/secretRedactor.test.ts przejrzany tylko grepem+uruchomieniem testu, nie linia po linii; (2) src/mcp-servers/wiki-mutate/ potwierdzony jako 'intentionally empty' tylko przez komentarz w kodzie, nie niezależnie sprawdzony na dysku. Orchestrator zweryfikował oba post-hoc (diff testu: 1 nowy test regresyjny na redakcję JWT Wiki, spójny z istniejącym wzorcem; wiki-mutate/: katalog zawiera wyłącznie .gitkeep od initial-commit, bez zmian w tym diffie) — ale to nie zamienia automatycznie NO_GO w GO, decyzja należy do człowieka.
- 2026-09-27 grant-flow (TS-RATE-003-rate-card-per-role) run `wf_7cad6d79-82d` — Bramka końcowa: security-e2e-verifier zwrócił GO z warunkami (żadnego warunku VETO), ale z niepustym unverified_scope (L3 nieodpalone, migracja 049 index/down() nieprzeczytane wprost, agregat/encja/VO/temporal przeglądnięte tylko grepem+zielonymi L1, BUSINESS_RULES.yaml TP5 nieprzejrzane, .claude/agent-memory i decisions-index.json pominięte jako niezwiązane) — template wymusił NO_GO zgodnie z ORC-069 (brak retry na jednorazowej bramce). Realny stan: typecheck GREEN, L1 4205/4206 (1 pre-existing flake niezwiązany z diffem), L2 468/474 (6 faili = udokumentowana baseline develop, niezwiązane), wszystkie nowe specy RateCard zielone (049-rate-cards-constraints 22/22, kysely-rate-card-query 16/16, rate-card-acl.adapter 6/6). Dodatkowo violations[0] (BLOCKING before commit) zgłosił niespójny git index — 34 plików untracked importowanych przez już staged organization.module.ts, migracja 049 staged ale index.ts rejestrujący ją nie — naprawione przez koordynatora po bramce (git add wszystkich plików zadania, jawnie, bez .claude/agent-memory/* i decisions-index.json). Pozostałe 3 WARN (błędy walidacji VO mapowane na 500 zamiast propagowane, brak logowania cause przy catch, brak threat modelu) jawnie odroczone przez samego weryfikatora do 'przed dodaniem kontrolera' — poza zakresem AC tego zadania (bez kontrolera HTTP).
- 2026-09-27 ai-os-bot (BOT-004) run `wf_0dae8bd9-091` — Final gate (safety-reviewer) zwrocil NO_GO — GO z niepustym unverified_scope (pelny typecheck/lint po repo nie odpalony, tylko 2 pliki testowe uruchomione bezposrednio) — ORC-069 wymusil NO_GO na jednorazowej bramce koncowej.
