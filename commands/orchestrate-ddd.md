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

## Krok 3 — Uruchom Workflow implementacji (w tle)
Zbuduj/uruchom Workflow o strukturze (MVP = liniowy, seam'y Ralphinho jako no-op):
```
for unit of units:                          # MVP: units = [task]  (seam Ralphinho)
  for layer of [domain-application, infrastructure]:   # OUTER: sekwencja (zależności DDD)
    attempt = 0
    loop:
      implement(layer, {decisions, patterns, rule_cards}, worktree)   # Agent implementer; gate: check-delegation
      v = verify(layer)        # @code-quality-verifier → {verdict, violations:[rule_ids]}
      if v.verdict == GO: break
      if ++attempt >= 3: ESCALATE(layer, v.violations); HALT
      fix(layer, v.violations) # re-dispatch implementera z konkretnymi rule-ID
  merge_stage(unit)            # MVP: no-op (jeden worktree)        (seam Ralphinho)
final = security_e2e_verify(all)   # @security-e2e-verifier → {verdict}
if final.verdict != GO: ESCALATE; HALT
```
Guardrails: `max_attempts=3` per warstwa (stall-guard; loop-operator ECC jako backstop),
push tylko branche `claude/*`, limity budżetu/tur z presetu.

## Krok 4 — STOP2 (staged, not committed)
Po wszystkich GO:
- `git add` zmienionych plików (NIE commit, NIE merge).
- Wydrukuj raport: warstwy + verdykty, naprawione rule-ID, lista plików, wynik security-e2e.
- Baner: „✅ GOTOWE do review. Przejrzyj `git diff --staged`, potem commit/merge ręcznie."
- HALT. Commit/merge = osobna akcja człowieka ([[commit-review-workflow-preference]]).

Na porażce (max-attempts lub security NO-GO): eskaluj z konkretami (co blokuje, które rule-ID),
zostaw staged co przeszło, HALT — bez spinning.

## Uwaga o starym /orchestrate
`/orchestrate` (jeden przebieg, bez bramki research) zostaje jako fallback dla lekkich/nie-DDD
zadań. `/orchestrate-ddd` = pełny flow z twardą bramką analizy i pętlą aż GO.
