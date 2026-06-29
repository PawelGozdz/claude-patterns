---
name: analyze-ddd
description: |
  Faza RESEARCH/ANALIZY dla zadania DDD (gate-left). Odpala panel advisory
  (threat-model + architekt + ddd-expert + impl-analiza + pattern-fit + synteza
  tech-lead), pisze artefakt {TASK-ID}.analysis.md z OTWARTYMI PYTANIAMI i ZATRZYMUJE.
  NIGDY nie implementuje. NIGDY nie przechodzi do /orchestrate-ddd.

  Człowiek dyskutuje, odpowiada na pytania (edytuje artefakt), flipuje status: approved,
  i dopiero wtedy ręcznie odpala /orchestrate-ddd <TASK>.

  Usage: /analyze-ddd <TASK-ID>
  Alias: /ad <TASK-ID>

  Examples:
    /analyze-ddd TS-AUTH-003
    /ad BookmarksContext (nowa funkcja)
tools: Task, Read, Write
disallowedTools: Edit, MultiEdit, Bash, Grep, Glob, NotebookEdit
---

# /analyze-ddd — Research & Technical Analysis (STOP1)

**ZERO IMPLEMENTACJI.** Jedyny zapis jaki ta komenda robi to artefakt analizy
(`project-orchestration/tasks/{TASK-ID}.analysis.md`). Bez Edit, bez Bash, bez implementerów —
strukturalnie nie może dotknąć kodu produkcyjnego. To jest lewa strona twardej bramki (ADR 0002).

## Po co
Odwzorowuje ręczny flow: `/threat-model` → panel agentów → synteza → otwarte pytania → STOP.
Automatyzuje panel, ale **zatrzymuje się na dyskusję człowieka** — bo w DDD analiza zwykle
ujawnia rzeczy do przedyskutowania, zanim warto pisać kod.

## Kroki

### 0. Setup
- Wczytaj `.claude/config/project.yml` → `stack_profile` (oczekiwane: nestjs-ddd) i preset
  `presets/{stack_profile}.yml` → `phase_research`.
- Ustal `{TASK-ID}` z argumentu. Znajdź plik zadania (`project-orchestration/tasks/{TASK-ID}.md`)
  jeśli istnieje — to spec wejściowy.

### 0a. Security pre-flight
- Sprawdź etykiety zadania (auth, pii, cross_context, public_api — patrz `templates/canonical-labels.yml`).
- Jeśli istnieje `docs/security/threat-models/TM-{TASK-ID}.md` → **użyj go** (link w artefakcie), NIE uruchamiaj ponownie.
- Jeśli pasują etykiety i NIE ma TM → uruchom stage `threat-model`, który zapisuje pełny TM do
  **`docs/security/threat-models/TM-{TASK-ID}.md`** (STRIDE/DREAD/LINDDUN — NIE wkomponowuj security w .analysis.md;
  artefakt analizy tylko LINKUJE do TM).

### 0.5. Pattern discovery (grounding)
- Wczytaj `.claude/knowledge/patterns/README.md` + `_stack-defaults/{stack}.yml`.
- Zbierz listę kanonicznych wzorców (`patterns[]`) istotnych dla zadania → do `patterns[]` w artefakcie.
- **WCZYTAJ treść Rule Cards** (`*_summary.md`) dla tych wzorców i WSTRZYKNIJ ją do promptów panelu —
  nie tylko ścieżki. Agenci ECC (`ecc:architect` itd.) NIE znają naszych konwencji proaktywnie;
  bez wstrzykniętej treści wzorca ich rekomendacje będą generyczne. To ten sam grounding, który
  check-patterns-read / check-subagent-pattern-reads egzekwują w fazie implementacji.

### 1. Panel advisory (Task → agenci, kolejność z presetu)
Dla każdego stage z `phase_research.panel` odpal agenta przez `Task`, wstrzykując: spec zadania,
**treść Rule Cards** (z 0.5 — nie tylko ścieżki), kontekst poprzednich stage'ów. Domyślny panel (nestjs-ddd):
1. `threat-model` (warunkowo, gdy brak TM) — deleguj przez `Task` do subagenta security, który
   wykonuje pełną metodologię (STRIDE/DREAD/LINDDUN wg `skills/security/threat-model` +
   `docs/security/THREAT_MODEL_TEMPLATE.md`) i **ZAPISUJE `docs/security/threat-models/TM-{TASK}.md`**.
   Synteza (stage 6) wciąga z TM krótkie podsumowanie + ustawia `threat_model:` link (NIE kopiuje STRIDE).
2. tech-analysis — `ecc:architect` (lub `@backend-technology-expert`)
3. ddd-modeling — `@ddd-application-expert`
4. impl-analysis — `@infrastructure-testing-implementer` (advisory: jak to zaimplementować)
5. pattern-fit — `@code-quality-verifier` (advisory: które wzorce stosujemy, gdzie ryzyko)
6. synthesis — `@tech-lead` (zbiera wszystko, wskazuje co robić, wypisuje OTWARTE PYTANIA)

### 2. Zapis artefaktu (jedyny Write)
Zapisz **`project-orchestration/analysis/{TASK-ID}.analysis.md`** (NIE w tasks/ — tam tylko taski)
wg `templates/task-analysis-template.md`:
- frontmatter: `task`, `status: awaiting-human`, `threat_model:` (link do `docs/security/threat-models/TM-{TASK-ID}.md`
  lub null), `open_questions[]` (każde `answer: null`), `decisions[]` (propozycje z rationale),
  `patterns[]` (lista z 0.5), opcjonalnie `units:` (Ralphinho).
- body: synteza tech-lead, sekcje „Otwarte pytania" i „Decyzje (proponowane)".
  W body **NIE powtarzaj `answer: null`** jako podpowiedzi (myli — wygląda na niezatwierdzone);
  odpowiedzi żyją WYŁĄCZNIE we frontmatter. W body co najwyżej odsyłaj: „_(odpowiedź w frontmatter)_".
- Security (STRIDE/DREAD/LINDDUN) NIE tutaj — żyje w `docs/security/threat-models/TM-{TASK-ID}.md`; tu tylko link + krótkie „Ryzyka".

### 3. STOP1
Wydrukuj baner:
```
⚠️  ANALIZA GOTOWA — STOP. Przeczytaj project-orchestration/analysis/{TASK-ID}.analysis.md
    1. Odpowiedz na OTWARTE PYTANIA (wypełnij answer:)
    2. Zweryfikuj/popraw DECYZJE
    3. Ustaw status: approved
    4. Dopiero wtedy: /orchestrate-ddd {TASK-ID}
```
**KONIEC.** Nie wołaj /orchestrate-ddd. Nie implementuj. Czekaj na człowieka.
