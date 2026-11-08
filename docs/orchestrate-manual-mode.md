# /orchestrate — tryb ręczny (gdy Workflow jest niedostępny)

Reguły: ORC-152 (termin werdyktu bramki), ORC-153 (ten tryb). Uzasadnienie i objawy:
[`docs/decisions/orchestrate-rule-history.md`](decisions/orchestrate-rule-history.md#orc-153).

## Kiedy

Krok 3 komendy (`Workflow({ scriptPath })`) kończy się dialogiem „Run a dynamic workflow?" z jedyną opcją „No",
a człowiek nie ma włączonego trybu workflow (skrypt ma ~300 KB, zatwierdzenie jest niedostępne). Dialog odrzucony,
Workflow niedostępny albo człowiek każe iść ręcznie = ten tryb. To awaria środowiska, nie powód do pytania o zgodę
ani do zmiany kompozycji. Kroki 1 i 2 (znacznik, `orchestrate-prepare.mjs`) wykonujesz normalnie; bramki wejścia
(exit 2/3/4) nadal obowiązują.

## Jak

Przez narzędzie `Agent`, **sekwencyjnie, warstwa po warstwie**, w kolejności z `prepare` (`layers[]`, jednostki
jako pod-warstwy `<warstwa>:<id>`). Dane bierzesz z JSON-a kroku 2 (bez `--emit-script` wystarczy `--json`):

1. **Implementer warstwy** (agent ze slotu `implement` warstwy): prompt = zakres (`dirs`/`scope`), karty reguł
   (`patterns[]`, karta `*_summary.md`), decyzje z analizy, zakaz commitów i cofania. Agent jako liść: bez `Task`,
   bez parametru `name`.
2. **Checks warstwy** uruchamiasz SAM, jedno polecenie na check, z logiem do pliku (`typecheck`, `lint`, testy
   wyłącznie jako `pnpm test:{e2e|integration} <pliki>`; ORC-149). Wynik czytasz z kodu wyjścia, nie z opisu agenta.
3. **Weryfikator warstwy** (slot `verifiers.layer`): dostaje listę zmienionych plików (`git diff --name-only <baseSha>`)
   i wyniki z pkt 2 jako fakty. GO tylko przy zerze naruszeń; do 3 prób (`verifiers.maxAttempts`), potem
   `ESCALATE_AND_HALT`, bez zgadywania.
4. Po GO dopisz warstwę do `layers_done` (jeden `Edit` na końcu, także przy zatrzymaniu).

## Obowiązkowo (to, co wcześniej robił skrypt)

- **Bramka końcowa** (slot `verifiers.finalGate`) na CAŁOŚCI zmiany, jedno wywołanie, prompt jak w
  `buildFinalGatePrompt`: lista plików ze zmiany, fakty z checks, karty, decyzje. **Werdykt najpóźniej po 70%
  limitu wywołań, potem tylko wynik**; niesprawdzone pliki do `unverified_scope`. Limit = `15 + (pliki − 10)`, nie więcej
  niż 50, chyba że `budgets.final-gate` mówi inaczej. Czytaj tylko pliki z listy zmian i ich testy: bez Glob/Grep po
  całym repo, bez generowania threat-modelu, bez wołania skilli.
- **Wynik częściowy albo brak werdyktu = `NO_GO` z `cause: machine`, nigdy `GO`.** Agent, który skończył na limicie tur
  („stopped at its N-turn limit"), nie dał werdyktu. Jedno ponowienie z krótszym zakresem (pliki najwyższego ryzyka:
  migracje, auth, kontrakty), potem `NO_GO` i raport; pliki zostają staged z adnotacją „WYMAGA PRZEGLĄDU" tylko gdy
  zero własnych naruszeń i checks zielone (ORC-084/087).
- **`final_gate.checks` odpalasz sam, deterministycznie** (`checks.finalGate` z `prepare`), na całości zmiany, przed
  bramką, i podajesz jej wyniki jako fakty. Nie ufasz relacji agenta; czerwone checks = `NO_GO` `code`.
- **Hash drzewa** (ORC-139): po werdykcie GO uruchom `node <claude-patterns>/scripts/orchestrate-tree-hash.mjs
  --project . --check <hash z chwili oceny>`; hash policz tuż przed bramką (`orchestrate-tree-hash.mjs` bez `--check`).
  Exit ≠ 0 = GO nieaktualne, nie staguj. Kontrolę reguł ciała (ORC-140, `tools/conformance/check.mjs --changed --ratchet
  --baseline-ref <baseSha>`) uruchom przed `git add`.
- **Zakaz commitów i pushy.** Koniec to „staged, not committed", HALT budujesz z `git status --short`.
- **Odstępstwa:** `node <claude-patterns>/scripts/report-deviation.mjs --project {nazwa} --trigger agent_note
  --category infra --rule ORC-153 --reason "Workflow niedostępny, tryb ręczny" --task {TASK-ID}` (raz na przebieg),
  plus zwykłe zgłoszenia z kroku 5 komendy dla zatrzymań `machine`.

## Testy: zawsze we własnym zakresie, tylko z listą plików (decyzja właściciela, ORC-149/155)

Dotyczy trybu ręcznego i workflow. Każdy orchestrator odpala testy sam, przez agenta `@test-implementer`
(albo jako check warstwy), i **wyłącznie z jawnym filtrem plików**: skrypty `test:integration` i `test:e2e`
(aliasy projektu, np. `test:l2`/`test:l3`) z listą plików specyfikacji zmienionych lub dodanych przez to zadanie
(`git diff --name-only <baseSha>` plus `git ls-files --others --exclude-standard`) jako argumentami pozycyjnymi.
Bez `--`, bez katalogów, bez globów, flagi dopiero po plikach. Skrypt `test` (jednostkowe) z listą plików działa tylko
w projekcie z `allowUnit: true` w `.claude/test-guard.json`; w pozostałych hook `block-unscoped-tests` go odrzuca,
a testy jednostkowe warstwy są pomijane z jawnym komunikatem w raporcie. **Pełnych zestawów nie odpala nikt poza
człowiekiem**: ani orchestrator, ani agent, ani sonda. Brak listy plików = raport „brak listy plików" i stop,
nie cały pakiet.

**Blokada środowiska (ORC-155).** Błąd uruchomienia testcontainers przed pierwszym testem (`failed to bind host port ...
address already in use`, brak dostępu do Dockera) to awaria maszyny, nie kodu. Jedna powtórka, potem jeden komunikat
`ENV_BLOCKED` z linią błędu i wskazówką diagnostyczną (`ss -tan | wc -l`, który PID trzyma połączenia). Warstwa
kończy jako `GO_WITH_GAPS` z luką „L2/L3 niezweryfikowane: środowisko", nigdy jako GO bez tej luki i nigdy pętlą prób.
Zdarzyło się w ośmiu instancjach juz-ide-api naraz, gdy proces VS Code Server trzymał ~28 tys. połączeń i zjadł zakres
portów efemerycznych 32768-60999.

## Raport: co tracisz względem trybu workflow

Raport (`.claude/run-state/{TASK-ID}.report.md`) zaczyna się od linii „Tryb ręczny: tak" i listy utraconych gwarancji:

| Utracone | Skutek |
|---|---|
| sondy drzewa i checks w Workflow (ORC-098) | fakty zbiera koordynator ręcznie; ślepej sondy nikt nie wykryje automatycznie |
| `report.treeHash.sealed` (ORC-139) | pieczęć hasha tylko jeśli policzysz ją ręcznie (wyżej); brak = ostrzeżenie w HALT |
| budżety ORC-091/092 i `scaledBudget` | limity tur są instrukcją w prompcie, nie twardym limitem silnika |
| cache i `resumeFromRunId`, telemetria kroków | wznowienie = ręczne, od `layers_done` |
| filtry luk (ORC-071/079/080/084) | `unverified_scope` czytasz samodzielnie |

Człowiek widzi w HALT, że przebieg nie miał pełnych bram; decyzję o stagingu podejmuje świadomie.

## Bramka końcowa przy dużym diffie: chunkowanie (zalecenie)

Powyżej ok. 40 plików jedno wywołanie bramki kończy się limitem tur albo luką w `unverified_scope`
(62 pliki, limit 50 wywołań, ~56 użyte: [`DEV-agent_note-final-gate-o-62-plikach-przekroczy-twardy-limit-5`](tasks/_inbox/DEV-agent_note-final-gate-o-62-plikach-przekroczy-twardy-limit-5.md)).
Zalecenie, bez wdrożonej logiki w silniku: **sekwencyjne pod-przebiegi z jawną listą plików**, każdy z pełnym budżetem
i z terminem werdyktu po 70%; podział po warstwach (`layers[].dirs`), nie po alfabecie. Werdykt końcowy to najgorszy z
pod-przebiegów (jedno `NO_GO` = `NO_GO`); `unverified_scope` sumuje się. Nie podnoś `maxTurns` zamiast dzielenia:
limit z frontmattera agenta i tak wygrywa z budżetem skryptu (ORC-092). W trybie ręcznym zastosuj to od razu przy
>40 plikach; w trybie workflow silnik tego nie robi — przy dużym diffie podziel zadanie (ORC-142) albo przyjmij `GO_WITH_GAPS` z luką w raporcie.
