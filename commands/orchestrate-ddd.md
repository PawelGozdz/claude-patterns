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
Zbuduj/uruchom Workflow o strukturze (MVP = liniowy, seam'y Ralphinho jako no-op):
```
for unit of units:                          # MVP: units = [task]  (seam Ralphinho)
  for layer of [domain-application, infrastructure]:   # OUTER: sekwencja (zależności DDD)
    attempt = 0
    loop:
      # PRZED pisaniem: retrieve_code(intencja, collection) z MCP knowledge-retriever → istniejące
      # symbole (plik+symbol+linie). collection = z .claude/config/knowledge.json (Krok 2).
      # Eliminuje „to nie istnieje" + złe sygnatury (bug z ANTI-SPOOF).
      # Uzupełniająco (eval 2026-07-02: hit@5=0.85 ≥ próg 0.6): retrieve_patterns — globalne Rule
      # Cards/wzorce, gdy wstrzyknięte karty nie pokrywają pytania (karty pozostają WIĄŻĄCE);
      # retrieve_examples — kanoniczne przykłady @vytches/ddd (level, antywzorce).
      # Graceful: jeśli MCP/Qdrant niedostępny lub collection nieznany → implementer szuka klasycznie (grep).
      implement(layer, {decisions, patterns, rule_cards, existing_code: retrieve_code(layer_intent, collection)}, worktree)   # gate: check-delegation
      # BRAMKA „kod istnieje" (CONFORMANCE §2): git diff --stat puste → ESCALATE, NIE weryfikuj —
      # weryfikacja kodu, który nigdy nie powstał, to spalony przebieg.
      if git_diff_empty(layer_dirs): ESCALATE(layer, "implementer nie zmienił żadnych plików"); HALT
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
