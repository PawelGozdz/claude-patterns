---
name: orchestrate-ddd
description: |
  Faza IMPLEMENTACJI dla zadania DDD (gate-right). Pętla po warstwach
  (domena→aplikacja→infra), każda: implement→verify→fix aż VETO verifier da GO,
  na końcu bramka security-e2e. Jedzie autonomicznie w tle (Workflow tool), kończy
  w stanie "staged, not committed" — review i merge robi człowiek.

  ODMAWIA startu, dopóki {TASK-ID}.analysis.md nie ma status: approved
  i wszystkie open_questions nie mają odpowiedzi. (Najpierw: /analyze-ddd <TASK>.)

  Usage: /orchestrate-ddd <TASK-ID>
  Alias: /od <TASK-ID>

  Examples:
    /orchestrate-ddd TS-AUTH-003
    /od BookmarksContext
tools: Task, Read, Write, Edit, Bash
---

# /orchestrate-ddd — Implementation Loop (STOP2)

Prawa strona twardej bramki (ADR 0002). Uruchamia się **tylko po** zatwierdzonej analizie.
Silnik: **Workflow tool** (deterministyczny control-flow), NIE /goal. Warunek stopu pętli =
maszynowy verdykt GO/NO-GO od naszych VETO verifierów — nie „model uznał, że gotowe".

## Krok 1 — BRAMKA (precondition, twardy gate)
Wczytaj `project-orchestration/analysis/{TASK-ID}.analysis.md`. **ODMÓW startu** (wypisz instrukcję
i ZAKOŃCZ) gdy:
- artefakt nie istnieje → „Najpierw uruchom /analyze-ddd {TASK-ID}", albo
- `status != approved`, albo
- jakiekolwiek `open_questions[].answer == null`.

Backstop: hook `check-approval-before-impl.js` blokuje edycje implementacyjne przy nieapprobowanej analizie.

## Krok 2 — Wczytaj plan z ZATWIERDZONEGO artefaktu (nie z presetu)
Z artefaktu czytaj: `decisions[]` (wstrzykiwane do KAŻDEGO promptu implementera), `patterns[]`
(grounding), opcjonalnie `units[]` (Ralphinho — w MVP brak = jeden unit). Preset
`presets/{stack}.yml::phase_implementation` daje strukturę warstw i bramek.

Wczytaj też `collection` z `.claude/config/knowledge.json` (zapisane przez `setup-project.sh`) —
`knowledge-retriever` to **jeden współdzielony HTTP daemon** (wszystkie projekty), więc bez jawnego
`collection` przy każdym `retrieve_code` trafisz w `code_default` zamiast w kod tego projektu.
Brak pliku → graceful (implementer spada na grep, jak przy niedostępnym MCP).

## Krok 3 — Uruchom Workflow implementacji (w tle)

**LINT PRZED STARTEM (obowiązkowy):** zapisz skrypt Workflow do pliku (np.
`project-orchestration/.workflow/{TASK-ID}.workflow.js` — gitignored — albo scratchpad) i uruchom
`node "$HOME/.claude/hooks/workflow-lint.js" <plik>`. Lint MUSI dać exit 0 (reguły WL1-WL8 —
pełna lista i incydent za każdą regułą w nagłówku `hooks/workflow-lint.js`; skrótowo: schema tylko
na verify/final-gate, verify nigdy w parallel(), bramka git-diff obecna, git diff bez pełnego tekstu,
tsc/typecheck jako osobny krok PRZED verify — nie proza w prompt-cie implementera, ciężki blok
kontekstu kodu nie trafia do warstw czysto docs/config). Dopiero
wtedy `Workflow({scriptPath: <plik>})`. To zamienia poniższe reguły-prozę w twardą bramkę.

Zbuduj/uruchom Workflow o strukturze (MVP = liniowy, seam'y Ralphinho jako no-op):
```
for unit of units:                          # MVP: units = [task]  (seam Ralphinho)
  for layer of [domain, application, infrastructure]:  # OUTER: sekwencja (zależności DDD); split 3-warstwowy
    # (2026-07-02) domain-application ROZDZIELONE: mniejszy zakres = mieści się w budżecie tur,
    # fail dotyka jednej warstwy. Do warstwy N wstrzyknij LISTĘ ZMIENIONYCH PLIKÓW warstwy N-1
    # (`git status --porcelain -- <layer_dirs>`, NIGDY pełny tekst diffa) + decisions[] —
    # implementer SAM czyta świeże pliki Z REPO (Read), nie z pamięci agenta ani z wklejonego diffa.
    # UWAGA: użyj `git status --porcelain`, NIE `git diff --name-only` — ten drugi widzi tylko
    # pliki ŚLEDZONE i pomija nowo utworzone (untracked, `??`) pliki warstwy N-1, więc warstwa N
    # nie dowiedziałaby się o nowych plikach, które ma importować (patrz incydent niżej).
    # (incydent 2026-07-04, pierwszy live end-to-end przebieg juz-ide-api-1: pełny git diff
    # warstwy Domain urósł do ~3191 linii i został wklejony w całości do promptu implementera
    # Application → zjadł budżet tury na czytanie zamiast pisania, 2× pusty wynik z rzędu mimo
    # różnych agentId; gate zadziałał poprawnie — ESCALATE po 2 próbach wznowienia, zero
    # spinning — ale root cause to przeciążony prompt. Zob. WL6 w workflow-lint.js.)
    # Pełny `git diff --staged` zostaje WYŁĄCZNIE w raporcie STOP2 dla człowieka (Krok 4) —
    # nigdy jako input promptu kolejnej warstwy.
    attempt = 0
    loop:
      # PRZED pisaniem: retrieve_code(intencja, collection) z MCP knowledge-retriever → istniejące
      # symbole (plik+symbol+linie). collection = z .claude/config/knowledge.json (Krok 2).
      # Eliminuje „to nie istnieje" + złe sygnatury (bug z ANTI-SPOOF).
      # Uzupełniająco (eval 2026-07-02: hit@5=0.85 ≥ próg 0.6): retrieve_patterns — globalne Rule
      # Cards/wzorce, gdy wstrzyknięte karty nie pokrywają pytania (karty pozostają WIĄŻĄCE);
      # retrieve_examples — kanoniczne przykłady @vytches/ddd (level, antywzorce).
      # Graceful: jeśli MCP/Qdrant niedostępny lub collection nieznany → implementer szuka klasycznie (grep).
      # ANTY-EKSPLORACJA (obowiązkowe dla KAŻDEJ warstwy poza pierwszą — incydent 2026-07-08,
      # juz-ide-api-2: warstwa infra-docs-final dostała ten sam ciężki blok EXISTING_INFRA+
      # DECISIONS+PATTERNS co warstwy piszące kod + zdanie "poprzednie warstwy już zaimplementowane —
      # Read świeży kod jeśli potrzebujesz faktów". Implementer odczytał to jako zachętę do
      # re-audytu: 30× Read + 21× Bash, ZERO Write/Edit, maxTurns cliff, mimo że zadanie to była
      # edycja 3 plików Markdown. Ten sam wzorzec incydentu już raz wystąpił 2026-07-07 —
      # udokumentowany tylko jako komentarz w JEDNYM skrypcie, więc nie przeniósł się do kolejnego
      # zadania. Dlatego żyje tu, w kanonicznym szablonie, nie w pojedynczym wygenerowanym skrypcie.)
      # Prompt implementera warstwy N>1 MUSI zawierać jawne zdanie: "Warstwy 1..N-1 już
      # zweryfikowane (GO) — NIE re-czytaj, NIE grepuj, NIE weryfikuj kodu SPOZA własnego zakresu
      # tej warstwy; ZAUFAJ że działa." Jeśli warstwa dotyka WYŁĄCZNIE dokumentacji/configu (nie
      # `src/`) — użyj terse-wariantu (minimalny kontekst, bez pełnego EXISTING_INFRA/DECISIONS/
      # PATTERNS) — backstop: WL8 w workflow-lint.js łapie to mechanicznie przed startem.
      implement(layer, {decisions, patterns, rule_cards, existing_code: retrieve_code(layer_intent, collection)}, worktree)   # gate: check-delegation
      # BRAMKA „kod istnieje" (CONFORMANCE §2): git status --porcelain puste → ESCALATE, NIE
      # weryfikuj — weryfikacja kodu, który nigdy nie powstał, to spalony przebieg.
      # UWAGA (incydent juz-ide-api-1, 2026-07-07): `git_diff_empty` MUSI sprawdzać
      # `git status --porcelain -- <layer_dirs>` (obejmuje untracked `??`), NIE samo
      # `git diff --stat` — ten ostatni widzi tylko pliki ŚLEDZONE. Implementer, który stworzył
      # WYŁĄCZNIE nowe pliki (bez `git add`), dawał pusty `git diff --stat` mimo że kod fizycznie
      # powstał → false-positive ESCALATE po pierwszej próbie zamiast przejścia do verify().
      if git_diff_empty(layer_dirs): ESCALATE(layer, "implementer nie zmienił żadnych plików"); HALT
      # KONTYNUACJA (klif maxTurns — odzyskiwalny, nie śmiertelny): implementer skończył BEZ
      # tekstu finalnego, a diff NIEPUSTY → JEDNO wywołanie kontynuacyjne ("dokończ wg
      # DONE/REMAINING manifestu lub git diff") PRZED verify — nie wysyłaj połowicznego kodu
      # do weryfikacji (nie pal próby fix-loopa na przewidywalnych brakach).
      if impl == null && !git_diff_empty(layer_dirs): implement_continuation(layer)  # max 1×
      # BRAMKA TYPECHECK (deterministyczna, PRZED drogim verify — incydent VB-003/D-5):
      # zielony vitest ≠ type-safe (vitest/esbuild = transpile-only!). Jeśli projekt ma target
      # type-check (tsc --noEmit) → odpal; błędy → potraktuj jako violations i dispatchnij fix
      # BEZ palenia próby weryfikatora (usunięcie pól z typów złamało 5 plików testowych na 34
      # błędy TS, a vitest był zielony — weryfikator odkrył to dopiero w 2. rundzie).
      # `run_typecheck_if_available()` MUSI być OSOBNYM, dedykowanym wywołaniem `agent()`
      # (label zawierający "typecheck", np. tani Haiku/Sonnet agent, którego JEDYNYM zadaniem jest
      # odpalić `tsc --noEmit` przez Bash i zwrócić {errors:[...]}) — Workflow script sam nie ma
      # dostępu do Bash/fs, więc to nie może być zwykła funkcja w skrypcie. NIGDY punkt listy
      # kryteriów WEWNĄTRZ prompta implement() (incydent 2026-07-08, juz-ide-api-2:
      # "tsc --noEmit bez nowych błędów" było punktem 4 listy w prompt-cie implementera —
      # nigdy nie uruchomione, 4 nowe błędy TS + martwa deklaracja przeszły przez
      # code-quality-verifier aż do security-e2e-verifier na finalnej bramce). Backstop
      # mechaniczny: WL7 w workflow-lint.js wykrywa dokładnie ten anti-pattern przed startem.
      tc = run_typecheck_if_available()   # np. pnpm nx run <pkg>:type-check / tsc --noEmit
      if tc.errors: fix(layer, tc.errors_as_violations); re-run typecheck  # tanie, deterministyczne
      v = verify(layer)        # @code-quality-verifier → {verdict, violations:[rule_ids]}
      if v == null: ESCALATE(layer, "verifier padł (null z agent())"); HALT   # NIE retry w ciemno
      if v.verdict == GO: break
      if ++attempt >= 3: ESCALATE(layer, v.violations); HALT
      fix(layer, v.violations) # re-dispatch implementera z konkretnymi rule-ID
  merge_stage(unit)            # MVP: no-op (jeden worktree)        (seam Ralphinho)
final = security_e2e_verify(all)   # @security-e2e-verifier → {verdict}
if final.verdict != GO: ESCALATE; HALT
```
Guardrails: `max_attempts=3` per warstwa (stall-guard; loop-operator ECC jako backstop),
push tylko branche `claude/*`, limity budżetu/tur z presetu.

**Reguły verify() (mitygacje CONFORMANCE §3 — obowiązkowe w skrypcie Workflow):**
- **`schema` TYLKO na verify() i final gate — NIGDY na implement()**. Sukces implementacji mierzy
  deterministyczna bramka git-diff (wyżej), nie self-report; wymuszanie StructuredOutput na
  implementerze dodaje punkt awarii bez wartości (incydent 2026-07-02: wf padł w 2 min na
  implement({schema}) — agent nie miał narzędzia).
- **Agent wołany ze `schema` MUSI mieć `StructuredOutput` na jawnej liście `tools:`** swojego
  frontmatteru — whitelist bez niego = subagent fizycznie nie może odpowiedzieć schematem
  i `agent()` pada mimo nudge (ta sama pułapka co brak retrieve_code w tools — Faza A RAG-002).
  Nasze verifiery i implementery mają to już dodane.
- **Sekwencyjnie, NIGDY `parallel()`** na wywołaniach weryfikatora (także przy dzieleniu zakresu
  na wycinki mechanism/wire-up/docs) — równoczesne obciążenie to podejrzany wyzwalacz cichego
  milknięcia (9/9 padniętych wywołań szło przez `parallel()`).
- **Werdykt przez `opts.schema`** w `agent()` (StructuredOutput): `{verdict: GO|NO-GO,
  violations: [{ruleId, file, line}]}`. Dzięki temu `null` = „agent umarł" → natychmiastowy
  ESCALATE (patrz pseudokod), a nie 3 warstwy × 3 ślepe retry.
- Werdykt liczy się też jako zdarzenie POSTĘPU dla watchdoga produktywności (kontrakt etapu
  verify — TASK-OBS-001/D6).

## Krok 4 — STOP2 (staged, not committed)
Po wszystkich GO:
- `git add` zmienionych plików (NIE commit, NIE merge).
- Wydrukuj raport: warstwy + verdykty, naprawione rule-ID, lista plików, wynik security-e2e.
- Baner: „✅ GOTOWE do review. Przejrzyj `git diff --staged`, potem commit/merge ręcznie."
- HALT. Commit/merge = osobna akcja człowieka ([[commit-review-workflow-preference]]).

Na porażce (max-attempts lub security NO-GO): eskaluj z konkretami (co blokuje, które rule-ID),
zostaw staged co przeszło, HALT — bez spinning.

## Obserwowalność (logi na żywo — NIE czarna skrzynka)

Workflow MUSI być gadatliwy, żeby `/workflows` pokazywał czytelny postęp:
- `phase('Research' | 'Domain' | 'Application' | 'Infra' | 'Final gate')` — grupuj kroki w fazy.
- `log(...)` na KAŻDYM przejściu: start warstwy, każda próba (`attempt N/3`), werdykt verifiera
  (`GO` / `NO-GO + violations`), eskalacja, staging. Przykład:
  `log('[domain] attempt 1 → verify: NO-GO (3 violations: AGG-001, VO-002...) → fixing')`.
- Każdy `agent()` ma czytelny `label` (np. `verify:domain`, `impl:infra`) → widoczny w drzewie.

Jak monitorować w trakcie:
```
/workflows                          # żywe drzewo: fazy, agenci, status, równoległość
/ecc:loop-status --watch            # wykrywanie zawieszeń: stale Bash >30min, overdue wakeup, parse errors
node scripts/workflow-watcher.js --project <repo>   # (claude-patterns) ZEWNĘTRZNY watcher → RUN-STATE.md
```
Jeśli `loop-status` zgłosi `attention` → otwórz transkrypt lub przerwij. Per-agent koszt:
`~/.claude/logs/agent-usage.jsonl` (hook subagent-stop-cost-log). Twarde limity (max_attempts=3,
budżet) chronią przed nieskończoną pętlą — przy przekroczeniu Workflow eskaluje i HALT, nie wisi.

**Watchdog produktywności (TASK-OBS-001, D6):** dla długich przebiegów odpal równolegle
`workflow-watcher.js` — pisze `project-orchestration/RUN-STATE.md` na żywo (burn tokenów,
tokeny-od-postępu wg kontraktu etapu, cisza per agent) i flaguje spinning do
`.claude/run-state/halt.json`; hook `productivity-watchdog.js` (opt-in per projekt) DENY-uje
kolejne tool-calle oflagowanych subagentów. Kill-switch: `touch .claude/run-state/KILL`.

**Reguła no-rerun (twarda):** NIGDY nie ponawiaj padniętego Workflow od zera N-ty raz
(anty-wzorzec: 4 przebiegi × ~5.2M tokenów, zero ukończeń — CONFORMANCE §3). Zamiast tego:
przeczytaj RUN-STATE.md / `journal.jsonl`, usuń przyczynę, wznow przez
`Workflow({scriptPath, resumeFromRunId})` — ukończone kroki wrócą z cache. Po DWÓCH nieudanych
próbach wznowienia → STOP i eskalacja do człowieka (ręczna weryfikacja foreground).

## Uwaga o starym /orchestrate
`/orchestrate` (jeden przebieg, bez bramki research) zostaje jako fallback dla lekkich/nie-DDD
zadań. `/orchestrate-ddd` = pełny flow z twardą bramką analizy i pętlą aż GO.
