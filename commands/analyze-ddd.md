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

**ZERO IMPLEMENTACJI.** Jedyny zapis, jaki komenda robi **swoim własnym `Write`**, to artefakt analizy
(`project-orchestration/analysis/{TASK-ID}.analysis.md` — patrz krok 2; NIE w `tasks/`) — plus, warunkowo, threat-model (krok 0a) zapisany
przez stage `threat-model`. Bez Edit, bez Bash, bez implementerów — strukturalnie nie może dotknąć
kodu produkcyjnego. To jest lewa strona twardej bramki (ADR 0002).

**Osobny kanał: pamięć agentów panelu.** Agenci-liście wołani w kroku 1 (np. `ddd-application-expert`,
`code-quality-verifier`) mają we własnym frontmatterze `memory: project` — to jest mechanizm frameworku
(persystencja "czego się agent nauczył" do `.claude/agent-memory/{agent}/`), **niezależny od `disallowedTools`
tej komendy i od `Write` tych agentów samych** (część z nich ma nawet `disallowedTools: Write` — memory pisze
framework, nie sam agent narzędziem). Efekt: pojedyncze uruchomienie `/analyze-ddd` może zostawić kilka
dodatkowych plików w `.claude/agent-memory/**` poza artefaktem analizy i TM — to zamierzone (agent uczy się
między zadaniami), nie bug ani rozrost tej komendy.

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
- **TRZECIA ŚCIEŻKA — TM istnieje, ale NIE pokrywa zakresu taska** (task każe go rozszerzyć albo
  analiza ujawnia nowe wektory): uruchom stage `threat-model` w trybie **ADDENDUM** — dopisuje
  datowaną sekcję `## Addendum {TASK-ID} (YYYY-MM-DD)` do ISTNIEJĄCEGO pliku TM (nie nowy plik).
  Jeśli addendum nie powstaje w tym przebiegu, artefakt MUSI zawierać **BLOKUJĄCE open_question**
  („TM addendum: <lista wektorów>", `answer: null`) — bramka `/orchestrate-ddd` (`no answer==null`)
  fizycznie zatrzyma implementację, dopóki człowiek nie potwierdzi addendum. Sama rekomendacja
  w body NIE wystarcza (pierwszy realny przebieg 2026-07-02: 3 nowe wektory RSVP tylko
  zarekomendowane prozą — nic nie wymuszało addendum przed implementacją).

### 0.5. Pattern discovery (grounding)
- Wczytaj `.claude/knowledge/patterns/README.md` + `_stack-defaults/{stack}.yml`.
- Zbierz listę kanonicznych wzorców (`patterns[]`) istotnych dla zadania → do `patterns[]` w artefakcie.
- **WCZYTAJ treść Rule Cards** (`*_summary.md`) dla tych wzorców i WSTRZYKNIJ ją do promptów panelu —
  nie tylko ścieżki. Agenci ECC (`ecc:architect` itd.) NIE znają naszych konwencji proaktywnie;
  bez wstrzykniętej treści wzorca ich rekomendacje będą generyczne. To ten sam grounding, który
  check-patterns-read / check-subagent-pattern-reads egzekwują w fazie implementacji.

### 0.6. RAG retrieval (jeśli MCP `knowledge-retriever` dostępny — graceful)
`knowledge-retriever` to **jeden współdzielony HTTP daemon** (wszystkie projekty, `docker-compose`
w claude-patterns) — Qdrant *za* nim, nie obok. Bo jest dzielony, **musisz jawnie podać `collection`**
w każdym wywołaniu `retrieve_code` — bez tego trafisz w pusty `code_default` innego projektu.

1. Wczytaj `collection` z `.claude/config/knowledge.json` (pole `collection`, np. `code_juz_ide_api_1`;
   zapisane przez `setup-project.sh`). Brak pliku → **graceful fallback** (krok 3).
2. Zamiast grepować/czytać kod na ślepo (główny pożeracz tokenów), **retrievuj trafny kontekst semantycznie**:
   - `retrieve_code(<intencja taska>, collection=<z knowledge.json>)` → **Codebase Facts**: istniejące symbole
     (plik+symbol+linie) podobne do tego, co task ma zrobić. Eliminuje halucynacje „to nie istnieje" + złe
     sygnatury (bug z ANTI-SPOOF).
   - `retrieve_patterns(<task>)` → trafne sekcje wzorców/reguł do groundingu (uzupełnia 0.5).
3. **Fallback (MCP niedostępny / `knowledge.json` brak / kolekcja pusta):** klasyczny grep/glob + statyczna
   lista z 0.5. Działanie się nie zmienia, tylko droższe.

Wyniki `retrieve_code` wstrzyknij do stage'a impl-analysis; `retrieve_patterns` do groundingu panelu.

**DOWÓD UŻYCIA (obowiązkowy — anty-drift adopcji):** artefakt (krok 2) MUSI mieć pole frontmatter
`rag:` — albo lista wykonanych zapytań z liczbą trafień (`- {tool: retrieve_code, query: "...", hits: N}`),
albo jawne `rag: skipped (powód)` (np. MCP niedostępny, kolekcja pusta). Pierwszy realny przebieg
po wpięciu (2026-07-02) pominął krok 0.6 W CAŁOŚCI mimo dostępnego MCP i configu — instrukcja
bez śladu wykonania w artefakcie nie jest egzekwowalna (ta sama lekcja co Faza A w TASK-RAG-002).

### 0.7. Decision cards — WYBÓR wzorca z wymagań (rdzeń ddd-modeling)
Dla decyzji projektowych (agregat vs encja, VO vs encja, ACL vs events, policy vs specification,
domain-service vs metoda, granica agregatu) NIE polegaj na osądzie agenta — użyj kart decyzyjnych:
1. Wczytaj trafne karty z `.claude/knowledge/decisions/` (symlink; fallback: `decisions/README.md` indeks).
   Dobór wg tego, czego dotyka task (np. „cross-context" → acl-vs-domain-events; „nowy obiekt z tożsamością" → aggregate-vs-entity).
2. **Konsultuj PRECEDENS projektu:** `docs/adr/` + `BUSINESS_RULES.yaml`. Jeśli decyzja już zapadła →
   **zastosuj i cytuj ADR**, NIE re-decyduj. Jeśli nie → rekomenduj wg kryteriów karty + **zaproponuj nowy ADR**.
3. Wstrzyknij wybrane karty + znalezione ADR-y do stage'a **ddd-modeling**.
Każda decyzja → wpis w `decisions[]` artefaktu z: wybór, **uzasadnienie wg karty**, cytat ADR lub `propose_adr: true`.

### 1. Panel advisory — agenci LIŚCIE (bez narzędzia Task!)
**KRYTYCZNE (bug-fix):** wołaj agentów panelu jako **LIŚCIE — BEZ narzędzia Task**. Nie pozwól im
delegować dalej — inaczej zapętlają się, próbując wołać nieistniejące agenty (np. `Explore`). Każdy
stage = JEDNO wywołanie agenta. Wstrzykuj: spec zadania + **treść Rule Cards** (z 0.5) + kontekst poprzednich stage'ów.

**Hardening (obserwacje z realnych przebiegów 2026-07-02):**
- Wołaj agentów panelu **BEZ parametru `name`** — tryb mailbox potrafi nie dowieźć treści wyniku;
  bezimienny background + task-notification działa niezawodnie.
- **Fallback syntezy:** jeśli środowisko przerywa leaf-agentów (watchdog/limity), syntezę MOŻE
  wykonać główny agent bezpośrednio — ma pełen kontekst wszystkich stage'ów; dodatkowy leaf niesie
  wtedy tylko ryzyko kolejnego przerwania bez nowej wartości. Odnotuj to w artefakcie (uwaga proceduralna).
- Przerwane stage'e: niezweryfikowane fakty ZAWSZE jako `open_questions` (nigdy jako ustalenia) —
  pytania czysto mechaniczne (grep-owalne) można potem dograć tanim Explore zamiast re-runu panelu.

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
