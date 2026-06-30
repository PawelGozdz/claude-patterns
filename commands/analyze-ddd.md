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

### 0. Setup (samowystarczalny — działa w KAŻDYM projekcie, nie tylko nestjs-ddd)
- Wczytaj `.claude/config/project.yml` → `stack_profile`. **NIE zakładaj nestjs-ddd.**
- Preset jest **OPCJONALNY**: jeśli istnieje `.claude/config/preset.yml` (in-project, materializowany
  przez setup-project.sh) → użyj jego `phase_research`. **Jeśli BRAK → użyj wbudowanych domyślnych
  z tej komendy** (panel w kroku 1, dobrany wg `stack_profile`).
- **NIE odwołuj się do `presets/…` ani `templates/…`** — to ścieżki w repo claude-patterns, NIE
  rozwiązują się z cwd projektu. Struktura artefaktu jest zdefiniowana INLINE (krok 2) — nie zależy od pliku template.
- Ustal `{TASK-ID}` z argumentu. Plik `project-orchestration/tasks/{TASK-ID}.md` jeśli istnieje = spec.

### 0a. Security pre-flight (jeśli dotyczy)
- Oceń etykiety/treść zadania (auth, pii, cross_context, public_api). Jeśli istnieje
  `.claude/config/canonical-labels.yml` — użyj go; jeśli nie — oceń z treści zadania (graceful, nie blokuj).
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

### 0.6. RAG retrieval (jeśli MCP `knowledge-retriever` dostępny — graceful)
Zamiast grepować/czytać kod na ślepo (główny pożeracz tokenów), **retrievuj trafny kontekst semantycznie**:
- `retrieve_code(<intencja taska>)` → **Codebase Facts**: istniejące symbole (plik+symbol+linie) podobne do
  tego, co task ma zrobić. Eliminuje halucynacje „to nie istnieje" + złe sygnatury (bug z ANTI-SPOOF).
- `retrieve_patterns(<task>)` → trafne sekcje wzorców/reguł do groundingu (uzupełnia 0.5 — zwraca tylko istotne, nie wszystko).
- **Fallback (MCP niedostępny):** klasyczny grep/glob + statyczna lista z 0.5. Działanie się nie zmienia, tylko droższe.

Wyniki `retrieve_code` wstrzyknij do stage'a impl-analysis; `retrieve_patterns` do groundingu panelu.

### 1. Panel advisory — agenci LIŚCIE (bez narzędzia Task!)
**KRYTYCZNE (bug-fix):** wołaj agentów panelu jako **LIŚCIE — BEZ narzędzia Task**. Nie pozwól im
delegować dalej — inaczej zapętlają się, próbując wołać nieistniejące agenty (np. `Explore`). Każdy
stage = JEDNO wywołanie agenta. Wstrzykuj: spec zadania + **treść Rule Cards** (z 0.5) + kontekst poprzednich stage'ów.

**Dobór agentów wg `stack_profile`** — jeśli stack-specific agent nie istnieje w projekcie, użyj generycznego
(nie hardcoduj agentów, których może nie być):
- **nestjs-ddd:** threat-model(warunkowo) → architekt → `@ddd-application-expert` →
  `@infrastructure-testing-implementer` → `@code-quality-verifier` → `@tech-lead` (synteza)
- **typescript-library:** threat-model(warunkowo) → architekt → `@library-quality-verifier` (lub `@library-api-guardian`) → `@tech-lead`
- **flutter / nextjs / python / inne:** analogicznie stack-specific verifier → `@tech-lead`
- **fallback (brak stack-agentów):** architekt (generyczny) → ogólny reviewer → `@tech-lead`

`threat-model` (gdy security-relevant i brak TM): wykonuje STRIDE/DREAD/LINDDUN (metodologia z
`skills/security/threat-model` + `docs/security/THREAT_MODEL_TEMPLATE.md` jeśli obecny) i **ZAPISUJE
`docs/security/threat-models/TM-{TASK}.md`**. Synteza wciąga podsumowanie + ustawia `threat_model:` link (NIE kopiuje STRIDE).

`synthesis` (ostatni, `@tech-lead`): zbiera wszystko, wskazuje co robić, wypisuje **OTWARTE PYTANIA**.

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
