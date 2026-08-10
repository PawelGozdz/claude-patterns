---
name: orchestrate-blocks
description: |
  Generyczna faza IMPLEMENTACJI sterowana kompozycją bloków (ADR 0008): pętla
  po warstwach z runtime.yml (implement→verify→fix aż GO), bramka końcowa ze
  slotu, kończy w stanie "staged, not committed". Bramka wejścia: brak
  .claude/config/runtime.yml = odmowa. Gdy analyze.exit=PAUSE (blok ddd/core),
  ODMAWIA startu bez {TASK-ID}.analysis.md ze status: approved.

  Nazwa pilotażowa — w F6 (TASK-BLOCKS-001) treść zastępuje /orchestrate.
  Do końca pilota /orchestrate-ddd działa równolegle na presets/.

  Usage: /orchestrate-blocks <TASK-ID>
tools: Task, Read, Write, Bash, Workflow
disallowedTools: Edit, MultiEdit, NotebookEdit
---

# /orchestrate-blocks — implementacja sterowana runtime.yml

**ZERO WŁASNEJ IMPLEMENTACJI.** Silnik deleguje do agentów ze slotów; sam nie
pisze kodu produkcyjnego. Wszystko stackowe przychodzi z `runtime.yml`.

## 0. Bramki wejścia (twarde, w tej kolejności)

1. `Read(".claude/config/runtime.yml")`. Brak → STOP: „Projekt nie ma
   skomponowanego setupu bloków (ADR 0008) — dodaj `stack_blocks:` + setup,
   albo użyj /orchestrate-ddd." `schema_version` ≠ 1 → STOP (setup ponownie).
2. Jeśli `analyze.exit: PAUSE` w runtime.yml (projekt z blokiem ddd/core):
   wymagaj `project-orchestration/analysis/{TASK-ID}.analysis.md` z
   `status: approved` i **żadnego** `open_questions[].answer == null`.
   Niespełnione → STOP: „Najpierw /analyze {TASK-ID} + odpowiedzi + approved."
   Bez PAUSE: artefakt opcjonalny (jeśli istnieje → użyj `decisions[]`/`patterns[]`).
3. Hook `check-approval-before-impl` (jeśli zainstalowany przez blok) egzekwuje
   punkt 2 także fizycznie — nie polegaj wyłącznie na nim, sprawdź sam.

## 1. Plan wykonania z runtime.yml

- **Warstwy**: `orchestrate.layers` w kolejności (dla nestjs+ddd: domain →
  application → infrastructure → testing, agenci przypisani per warstwa).
- **Brak sekcji `orchestrate:`** (projekt bez bloku procesowego) → JEDNA
  generyczna warstwa: implement (agent generyczny stacku, np.
  `general-purpose`) → verify (reviewer stacku z ECC, np.
  `ecc:typescript-reviewer`).
- **Wzorce**: `patterns.always` + trafione `patterns.triggers` (jak /analyze
  0.5) + `patterns[]` z artefaktu analizy. Rule Cards wstrzykuj do promptów
  implementerów i verifierów.

## 2. Silnik: Workflow tool (deterministyczny)

Uruchom przez `Workflow` (nie /goal). Pętla per warstwa
(`orchestrate.inner_loop`):

```
implement → verify → (violations? fix → verify)*  aż verdict==GO
max_attempts z runtime.yml (default 3); wyczerpane → ESCALATE_AND_HALT
```

Zasady promptów (hardening przeniesiony z /orchestrate-ddd — incydenty
2026-07-04, 2026-07-20):

- Kontekst między warstwami = **streszczenie decyzji + LISTA ścieżek plików**,
  NIGDY pełny `git diff` (WL6 w `hooks/workflow-lint.js`).
- KAŻDY agent dostaje budżet z runtime.yml `budgets` (default: implement
  `max_turns: 40`, verify `max_tool_calls: 15`) wstrzyknięty miękko do prompta
  („gdy się kończy — wypisz stan częściowy") ORAZ twardo przez
  `maxTurns`/`effort` wywołania (WL10).
- Implementerzy dostają: spec + `decisions[]` z artefaktu + Rule Cards +
  Codebase Facts (RAG, jeśli dostępny). Verify zwraca `{verdict, violations[]}`.

## 3. Bramka końcowa i wyjście

- `orchestrate.final_gate` z runtime.yml (dla ddd: `security-e2e-verifier`);
  `on_fail: ESCALATE_AND_HALT` — wypisz werdykt i zatrzymaj się, nie obchodź.
- `exit: STAGE_NOT_COMMIT` → `git add` zmienionych plików, raport (warstwy,
  werdykty, pliki, koszty), **HALT — commit robi człowiek**.
- Raport MUSI wskazać: które sloty/agenci działali (z `# source:` bloku),
  ile prób zjadła każda warstwa, czy budżety zadziałały miękko.
