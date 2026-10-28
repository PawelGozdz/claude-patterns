---
id: TASK-ENGINE-GUARDRAILS-001
title: 'Silnik przepuścił wzorce-naruszenia w juz-ide-api-1 TS-SEC-D0-BETA-HARDENING-001 — bramki mechaniczne zamiast samego weryfikatora-LLM'
type: implementation
status: todo
priority: P1
story_points: 8
created_date: 2026-10-21
updated_date: 2026-10-28
assignee: '@claude'
labels: [orchestration, conformance, verifier, analyze, hooks]
depends_on: []
related: [TASK-ORCH-VERIFY-BUDGET-001, TASK-GSTACK-ADOPT-001]
source: >
  Audyt juz-ide-api-1, gałąź feature/TS-SEC-D0-BETA-HARDENING-001 (sesje b2b4aaca…, 51bd69f9…, 5af44018…,
  2026-10-18…20). Analiza przyczyn przeprowadzona w sesji 2026-10-21; nic w api-1 nie zostało zmienione.
  Odświeżone 2026-10-28 na develop e9864d9: poprzednia implementacja leży w archiwum, a zakres i numery reguł zostały przeliczone.
---

# TASK-ENGINE-GUARDRAILS-001

## Cel

Przebieg TS-SEC-D0 zostawił w api-1 218 zmienionych plików, w których `throw` w ChangePasswordHandler (4 nowe przy 8 starych)
i `@InjectQueue` w dwóch handlerach komend przeszły przez weryfikatora-LLM, bo nic mechanicznego tych reguł nie sprawdzało.
Zadanie dodaje bramki, które łapią te wzorce bez udziału modelu, i zamyka drogi, którymi przeszły: analizę, która zatwierdziła
decyzję łamiącą kartę, `minor_findings` wykonywane bez weryfikacji, pakiet PR-ów w jednym przebiegu i ręcznego `test-implementera`.

## Stan wyjściowy (2026-10-28)

- **Gałąź i baza.** Świeża `feature/TASK-ENGINE-GUARDRAILS-001` z `develop` e9864d9, worktree `/opt/projects/_claude-patterns-guardrails`. Praca idzie tu, nie w głównym drzewie,
  bo symlinki propagują hooki, `tools/conformance/check.mjs`, `commands/` i `scripts/workflow/` na żywo do projektów.
- **Poprzednia implementacja** (37 plików, baza `24fb756` z 2026-10-21) jest zachowana w gałęzi `archive/TASK-ENGINE-GUARDRAILS-001-v1` (`6c2216f`).
  To materiał wejściowy do analizy, nie gotowa zmiana: develop jest o 78 commitów dalej i dotykał tych samych plików.
  Obejrzeć: `git show archive/TASK-ENGINE-GUARDRAILS-001-v1 --stat`, plik: `git show archive/TASK-ENGINE-GUARDRAILS-001-v1:<ścieżka>`.
- **Krok 1 jest już w develop.** Karta `command-handler-queue-port` (QP1–QP6) i reguły `application-handlers` weszły w `57f8f64` (2026-10-21).
- **Numery reguł z archiwum są zajęte.** Wszystkie ORC-118..121 i ANL-042..044 opisują dziś inne reguły. Ostatnie zajęte: ORC-139 i ANL-048.
  Nowe numery tego zadania: ORC-140..143 i ANL-049..051 (sprawdzić tuż przed commitem, druga sesja też dopisuje reguły).

| Stary numer (archiwum) | Nowy numer | Treść |
|---|---|---|
| ORC-118 | ORC-140 | reguły ciała pliku + ratchet w `tools/conformance`, sonda `conformance` w `checks:` warstwy i bramki końcowej |
| ORC-119 | ORC-141 | filtr `minor_findings`, akapit „karta ponad komentarzem" |
| ORC-120 | ORC-142 | `orchestrate-prepare`: próg pakietu zadań |
| ORC-121 | ORC-143 | hook zakresu zapisu `test-implementera` |
| ANL-042/043/044 | ANL-049/050/051 | `/analyze`: przesłanki w kodzie, decyzje kontra karty, wynik częściowy |

## Zakres (po stronie claude-patterns)

| # | Zmiana | Reguła | Stan |
|---|--------|--------|------|
| 1 | Karta `command-handler-queue-port` (QP1–QP6), reguły `application-handlers` | — | **zrobione, w develop** |
| 2 | Reguły ciała pliku + ratchet w `tools/conformance` | ORC-140 | w archiwum; nakłada się czysto |
| 3 | Sonda `conformance` w `checks:` warstwy i bramki końcowej | ORC-140 | w archiwum; dotyka `orchestrate.template.mjs` i `orchestrate-prepare.mjs` (konflikty) |
| 4 | Filtr `minor_findings`, akapit „karta ponad komentarzem" | ORC-141 | w archiwum; `commands/orchestrate.md` (konflikt) |
| 5 | `/analyze`: przesłanki w kodzie, decyzje kontra karty, wynik częściowy | ANL-049/050/051 | w archiwum; `commands/analyze.md` nakłada się czysto, szablon artefaktu koliduje |
| 6 | `orchestrate-prepare`: próg pakietu zadań | ORC-142 | w archiwum; `orchestrate-prepare.mjs` (konflikt) |
| 7 | Hook zakresu zapisu `test-implementera` | ORC-143 | w archiwum; nakłada się czysto |
| 8 | Dlaczego karty nie zadziałały dla ręcznie spawnowanych implementerów | — | zbadane, patrz niżej |
| 9 | Wpisy ORC/ANL, CHANGELOG | — | do zrobienia od nowa (nowe numery, nowy format) |

Próba nałożenia diffu z archiwum na `develop` e9864d9: **20 z 37 plików nakłada się czysto**, **13 koliduje**, a 4 są w develop już w tej samej postaci (krok 1: karta `command-handler-queue-port`, `patterns/application/METADATA.yml`, `bullmq-queue-pattern.md`, `cross-context-communication.md`).
- Czysto: `blocks/ddd/{core,cqrs,layers}.yml`, `commands/analyze.md`, `commands/conformance-check.md`, `hooks/README.md`, `hooks/check-test-implementer-scope.js`,
  `patterns/application/command-handler-pattern_summary.md`, `rules/nestjs-ddd/application-handlers.md`, `schemas/block.schema.json`, `scripts/pre-commit-guards.mjs`,
  `templates/settings/nestjs-ddd.json`, `tools/conformance/{baseline,body-rules,check}.mjs`, `tools/conformance/rules.json`, testy `conformance`, `materialize-runtime` (fixture) i `test-implementer-scope`.
- Konflikty: `commands/orchestrate.md`, `scripts/orchestrate-prepare.mjs`, `scripts/workflow/orchestrate.template.mjs`, `templates/task-analysis-template.md`,
  `tests/flow-evals/orchestrate-{prepare,script}/run.js`, `docs/decisions/orchestrate-rule-history.md`, `CHANGELOG.md`, `CLAUDE.md`, `METADATA.yml`, `README.md`, `patterns/README.md`.
  Silnik w tych plikach zmienił się od 21.10 (hash drzewa ORC-139, ostrzeżenie o `.env*` ORC-138, klasy decyzji ANL-047/048, wiersze ORC-122..137).

**Rekomendowane podejście do analizy:** części „czyste" (2, 7, bloki, schemat) przenieść prawie mechanicznie; części w konfliktach (3, 4, 5, 6) zaprojektować na nowo na aktualnym silniku,
patrząc na archiwum jako na specyfikację zachowania, a nie na diff. Zdecydować, czy sonda `conformance` wchodzi do tej samej warstwy sond co hash drzewa (ORC-139), żeby nie mnożyć wywołań Haiku.

## Nowe ograniczenia od 2026-10-28 (bramki, których w archiwum nie było)

Pre-commit ma dziś 49 bramek; nowy tekst w promptach i komendach musi przez nie przejść:
- **Archeologia = 0** (`validate-prompt-structure`): w agentach, komendach, skillach i kartach reguł nie wolno wstawiać dat ISO ani narracji o incydentach — historia reguł idzie do `docs/decisions/orchestrate-rule-history.md`, tabela w komendzie ma tylko CO i CO egzekwuje.
- **Wymagane kroki i piny** (`tests/flow-evals/prompt-structure/{required-steps,pins}.json`): zmiana kroków w `orchestrate.md`/`analyze.md` wymaga aktualizacji tych plików w tym samym commicie.
- **Kontekst stały** (`context-bill --check`): wzrost ponad sufit wymaga `node scripts/context-bill.mjs --capture` w tym samym commicie; opisy agentów trzymać krótkie.
- **Claim wymagany** przy nowej regule ORC/ANL (pre-commit ostrzega): metryka z listy `firstPass | falseGo | gateNoGo | retryCost | died | DEV-…`, `engine=` na commicie reguły.
- **Kernel dowodowy** jest wstrzykiwany do 15 agentów VETO (`templates/fragments/evidence-kernel.md`, `scripts/sync-fragments.mjs`); nie edytować bloków między markerami ręcznie.
- **Numery reguł** sprawdzić tuż przed commitem i przenumerować, jeśli druga sesja zajęła kolejne.

## Punkt 8 — ustalenia (transkrypty, stan 2026-10-21)

Sprawdzone osobiście:
- Zapisy przez Bash (`python3 … open(p,'w').write(s)`) omijają hooki zapisu: PreToolUse/PostToolUse mają matchery bez Bash, a `check-subagent-pattern-reads` skanuje tylko Write/Edit/MultiEdit. Tak `ae74` (test-implementer) zapisał `sms-otp-delivery.processor.ts` (pierwszy zapis 2026-10-20 14:10 UTC), `verify-phone-login/handler.ts` i dwa pliki `BUSINESS_RULES.yaml`.
- Karty trafiają do promptów wyłącznie przez `orchestrate-prepare` (`patterns.always`, `triggers`, `layer_contributions` z runtime.yml). Karta kolejki nie była wpięta w żaden kanał (dopiero ORC-118 dodaje `layer_contributions` dla `*:app`).

Wg agenta badawczego (transkrypty i konfiguracja api-1; nie sprawdzałem osobno każdej linii):
- Karty NIE były wklejone do promptów ręcznie spawnowanych agentów; dostali polecenie „przeczytaj reguły".
- `check-subagent-pattern-reads` sprawdza tylko, że wzorzec został PRZECZYTANY, nie że kod jest zgodny. Zablokował `ae74` i `a229` za brak odczytu karty; `ae74` przeczytał kartę po edycji i uznał ją za niedotyczącą.
- Nie ma hooka SubagentStart wstrzykującego karty.
- PostToolUse `check-domain-purity` zna `^\s*throw\s+new` w `/domain/` i `/application/`, ale tylko ostrzega, a w api-1 ma matcher `Edit`.

Hipoteza (niezweryfikowana): ostrzeżenia z exit 0 nie dochodzą do modelu.

Propozycje poza tym zadaniem (wymagają decyzji): hook SubagentStart wstrzykujący karty z routingu dla agentów `*-implementer`; rozszerzenie `check-subagent-pattern-reads` o zapisy przez Bash; wymóg uruchomienia `code-quality-verifier` po ręcznym implementerze.

## Do zrobienia po scaleniu

Scalenie dopiero po sygnale właściciela, że fala poprawek w api-1 się skończyła. Wtedy:
- `./scripts/reseed-patterns.sh` w głównym drzewie (zmieniają się karty), potem `audit-projects` → `materialize-runtime` → `verify-project-setup` w juz-ide-api-1, marketing-hub, grant-flow (projekty z własną listą `layers` dopisują `conformance` do `checks:` ręcznie).
- Zmierzyć bazę `CH-NO-THROW` i `CH-NO-BULLMQ` w marketing-hub i grant-flow (w katalogu `application/commands/`; dotąd policzono tylko `application/` w całości) i zdecydować o wyjątkach w `.claude/conformance.json`.
- Skorygować progi ORC-142 po pierwszych przebiegach (to ocena, nie pomiar).
- Rozważyć budżet weryfikatora (TASK-ORCH-VERIFY-BUDGET-001): mediana 3 wywołań z 15 w api-1.
- Podmienić `engine=` w Claimach na pierwszy hash z rollupów, który zawiera commit reguły.

## Prompt startowy do analizy

W claude-patterns nie ma `.claude/config/runtime.yml`, więc `/analyze` odmówi startu; analizę robi się ręcznie według szablonu artefaktu (wzór: `docs/tasks/analysis/TASK-RAG-002.analysis.md`).

```
Pracujemy nad TASK-ENGINE-GUARDRAILS-001 w worktree /opt/projects/_claude-patterns-guardrails (gałąź feature/TASK-ENGINE-GUARDRAILS-001, świeża z develop e9864d9).
Najpierw przeczytaj: docs/tasks/TASK-ENGINE-GUARDRAILS-001.md (cały), pamięć projektu "engine-guardrails-worktree-pending", CLAUDE.md i docs/CONTRIBUTING.md.
Poprzednia implementacja jest w gałęzi archive/TASK-ENGINE-GUARDRAILS-001-v1 (37 plików, baza z 21.10) — traktuj ją jako specyfikację zachowania, NIE jako diff do scalenia:
20 plików nakłada się czysto na develop, 13 koliduje (silnik: orchestrate.md, orchestrate-prepare.mjs, orchestrate.template.mjs, analyze/szablon, testy). Numery ORC-118..121 i ANL-042..044 są zajęte;
nowe: ORC-140..143, ANL-049..051 (sprawdź przed commitem).

KROK 1 — ANALIZA, bez implementacji. Nie edytuj kodu produkcyjnego. Napisz docs/tasks/analysis/TASK-ENGINE-GUARDRAILS-001.analysis.md według templates/task-analysis-template.md
(status: pending, open_questions[] z `ask` krótkim językiem biznesowym, decisions[] z klasą MECHANICAL/TASTE/USER_CHALLENGE i door_type, ANL-047/048). Uwzględnij:
(a) które z kroków 2–7 przenieść prawie mechanicznie, a które zaprojektować od nowa na aktualnym silniku (hash drzewa ORC-139, ostrzeżenie .env* ORC-138, klasy decyzji ANL-047/048);
(b) czy sonda `conformance` ma wejść do tej samej sondy co hash drzewa, żeby nie mnożyć wywołań Haiku;
(c) wpływ nowych bramek pre-commit (archeologia = 0, wymagane kroki i piny, ratchet kontekstu, Claim przy nowej regule);
(d) ryzyko dla projektów na żywo (api-1, marketing-hub, grant-flow): hooki i tools/conformance/check.mjs propagują się symlinkami, więc NIC nie trafia do głównego drzewa przed moim sygnałem.
Odpal panel advisory (architekt, security, reviewer-skeptic) tylko na pytania z realną niepewnością. Zatrzymaj się po zapisaniu artefaktu i zadaj mi pytania z open_questions[].

KROK 2 — dopiero po mojej zgodzie (status: approved): implementacja w tym worktree w logicznych commitach, każdy z pełnym zestawem bramek (w worktree `rag-freshness` ma stan skopiowany z głównego drzewa).
Po każdej części odpal niezależnego reviewera (ecc:code-reviewer, a dla silnika ecc:silent-failure-hunter) i napraw znaleziska z testem regresyjnym. Nie scalaj do develop bez mojego sygnału; po scaleniu reseed RAG,
audit-projects → materialize-runtime → verify-project-setup. Nie commituj niczego w repozytoriach projektów.
```
