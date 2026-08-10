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
tools: Task, Read, Write, Skill
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
- **BRAMKA PILOTA ADR 0008 — sprawdź PRZED wszystkim innym:** jeśli istnieje
  `.claude/config/runtime.yml`, projekt jest na kompozycji bloków (TASK-BLOCKS-001).
  Wypisz: „⛔ Projekt w pilocie ADR 0008 — użyj /analyze {TASK-ID} (research → approval),
  potem /orchestrate-blocks {TASK-ID}." i **ZAKOŃCZ — nie wykonuj żadnego dalszego kroku.**
  W projektach bez runtime.yml ta bramka niczego nie zmienia.
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
  **Trzymaj się `always_include` + trafionych `trigger_includes`** z `_stack-defaults/{stack}.yml`
  (zwykle 3-8 wzorców) — to NIE jest zaproszenie do wczytania całego `patterns/README.md` jako listy.
  Jeśli zadanie faktycznie dotyka więcej warstw niż zwykle, to w porządku — ale uzasadnij to w
  artefakcie, nie ładuj "na wszelki wypadek".
- **WCZYTAJ treść Rule Cards** (`*_summary.md`) **TYLKO dla wzorców z powyższej, zawężonej listy** i
  WSTRZYKNIJ ją do promptów panelu — nie wszystkie 16 kart, nie tylko ścieżki. Agenci ECC
  (`ecc:architect` itd.) NIE znają naszych konwencji proaktywnie; bez wstrzykniętej treści wzorca ich
  rekomendacje będą generyczne. To ten sam grounding, który check-patterns-read /
  check-subagent-pattern-reads egzekwują w fazie implementacji. Panel-agenci (np. `ddd-application-expert`)
  mają we własnym Knowledge Base instrukcję polegania na TEJ wstrzykniętej treści zamiast
  samodzielnego Globowania całych katalogów `patterns/domain/` czy `patterns/application/` — nie
  podważaj tego, wstrzykując im "na wszelki wypadek" więcej niż zawężoną listę.

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
2. **Konsultuj PRECEDENS projektu:** `docs/adr/` + `BUSINESS_RULES.yaml`. **NIE zgaduj nazwy pliku ADR i NIE
   traktuj `docs/adr/README.md` jako pełnego/aktualnego indeksu** — bywa kuratorowany i niekompletny
   (obserwacja 2026-07-07, juz-ide-api-1: katalog miał ~100 plików ADR, README wymieniało ~20; main command
   celowo nie ma Glob/Bash w `tools:`, więc bez tego kroku jedyną opcją było zgadywanie slugów z tematu →
   seria `File does not exist`, kilkadziesiąt spalonych tool-calli zanim trafiono albo poddano się).
   Zamiast czytać na ślepo: **deleguj odkrycie realnej ścieżki do Explore-agenta** (ma Glob/Grep — main
   command specjalnie nie), np. `Task(subagent_type='Explore', prompt: 'Znajdź w docs/adr/ pliki dotyczące
   <temat/numer>. Jeśli tematu nie ma w docs/adr/README.md, wylistuj katalog (Glob) i dopasuj po treści —
   NIE zgaduj nazwy pliku. Zwróć: dokładną ścieżkę, status, 2-3 zdania streszczenia decyzji.')`. Read całego
   pliku rób dopiero na zwróconej, potwierdzonej ścieżce — i tylko jeśli streszczenie nie wystarcza.
   Jeśli decyzja już zapadła → **zastosuj i cytuj ADR**, NIE re-decyduj. Jeśli nie → rekomenduj wg kryteriów
   karty + **zaproponuj nowy ADR**.
3. Wstrzyknij wybrane karty + znalezione ADR-y do stage'a **ddd-modeling**.
Każda decyzja → wpis w `decisions[]` artefaktu z: wybór, **uzasadnienie wg karty**, cytat ADR lub `propose_adr: true`.

### 1. Panel advisory — agenci LIŚCIE (bez narzędzia Task!)
**KRYTYCZNE (bug-fix):** wołaj agentów panelu jako **LIŚCIE — BEZ narzędzia Task**. Nie pozwól im
delegować dalej — nieograniczona sub-delegacja z każdego z 7 stage'ów to realne ryzyko zapętlenia
niezależnie od tego, do kogo próbują delegować. **Korekta (2026-07-07): `Explore` TO realny, istniejący
subagent — poprzednia wersja tego zdania błędnie sugerowała, że nie istnieje.** Kilku agentów panelu
(np. `infrastructure-implementer`, `code-quality-verifier`) ma we własnym prompt-cie doktrynę
"zawsze deleguj wyszukiwanie do Explore" — w TYM kontekście (jako liść panelu) fizycznie tego nie
zrobią, bo Task im odebrany, i to jest ZAMIERZONE: research/wyszukiwanie ma zrobić GŁÓWNA komenda
`/analyze-ddd` (kroki 0.5-0.7, ona ma Task) PRZED wywołaniem panelu, nie sam panel-agent w locie.
Każdy stage = JEDNO wywołanie agenta. Wstrzykuj: spec zadania + **treść Rule Cards** (z 0.5) + kontekst
poprzednich stage'ów.

**Budżet kontekstu międzystage'owego (KRYTYCZNE — obserwacja 2026-07-07):** "kontekst poprzednich
stage'ów" wstrzykiwany do każdego kolejnego z 7 stage'ów **MUSI być zwięzłym streszczeniem
(ustalenia + otwarte pytania, kilka-kilkanaście linii), NIGDY pełnym surowym outputem poprzedniego
agenta**. Bez tego ograniczenia rośnie to kwadratowo (stage 7 dostaje sumę 1-6) — dokładnie ten sam
anti-pattern, który w `/orchestrate-ddd` spalił przebieg pełnym `git diff` wklejonym do promptu kolejnej
warstwy (incydent 2026-07-04, naprawiony regułą WL6 w `workflow-lint.js`); tu nie ma jeszcze
analogicznego twardego gate'a, więc pilnuj tego ręcznie przy każdym wywołaniu. Realny przebieg
2026-07-07 (juz-ide-api-1) spalił ~700k tokenów na 4 Explore-agentach jeszcze PRZED panelem — część
tego to zgadywanie ścieżek (naprawione w 0.7), część to zbyt szerokie, nieograniczone zapytania
Explore. **Zasada dla kroków 0.5-0.7 i dla każdego `Task(subagent_type='Explore', ...)` wołanego przez
tę komendę:** jedno wąskie pytanie na wywołanie (jeden temat/plik/wzorzec, nie "zbadaj cały kontekst
X"), z jawnym limitem w prompt-cie (np. "maks. 15 tool-calli, zwróć fakty + ścieżki, NIE pełne pliki").
Jeśli research faktycznie wymaga wielu wątków, uruchom kilka WĄSKICH Explore zamiast jednego szerokiego.

**Budżet PRODUKCJI outputu per-stage (incydent 2026-07-20, juz-ide-api-3):** `code-quality-verifier`
padł bez ŻADNEGO outputu po 106k tokenów w jednym ze stage'ów panelu — wyczerpał budżet tur na
eksplorację (ten sam mechanizm co WL10 w `hooks/workflow-lint.js` dla `/orchestrate-ddd`, tylko że
panel `/analyze-ddd` nie idzie przez `Workflow`+lint, więc nie ma tam mechanicznego backstopu).
KAŻDE wywołanie agenta-liścia panelu (nie tylko Explore) MUSI dostać w prompt-cie: jawny, numeryczny
limit narzędzi (np. "masz budżet ~15 wywołań narzędzi") + "gdy się zbliża, NATYCHMIAST wypisz swój
raport/ustalenia w obecnej formie — częściowy output jest lepszy niż brak outputu". Fallback syntezy
niżej (środowisko przerywa agenta) łagodzi SKUTEK; ten wymóg ma zapobiec PRZYCZYNIE.

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
- **nestjs-ddd:** threat-model(warunkowo) → architekt + `@backend-technology-expert` (równolegle,
  ten drugi BEZ toola Task — bezpieczny liść panelu) → `@ddd-application-expert` →
  `@infrastructure-implementer` → `@code-quality-verifier` → `@tech-lead` (synteza)
- **typescript-library:** threat-model(warunkowo) → architekt → `@library-quality-verifier` (lub `@library-api-guardian`) → `@tech-lead`
- **flutter / nextjs / python / inne:** analogicznie stack-specific verifier → `@tech-lead`
- **fallback (brak stack-agentów):** architekt (generyczny) → ogólny reviewer → `@tech-lead`

`threat-model` (gdy security-relevant i brak TM): wykonuje STRIDE/DREAD/LINDDUN (metodologia z
`skills/security/threat-model` + `docs/security/THREAT_MODEL_TEMPLATE.md` jeśli obecny) i **ZAPISUJE
`docs/security/threat-models/TM-{TASK}.md`**. Synteza wciąga podsumowanie + ustawia `threat_model:` link (NIE kopiuje STRIDE).

`synthesis` (ostatni, `@tech-lead`): zbiera wszystko, wskazuje co robić, wypisuje **OTWARTE PYTANIA**.

**Weryfikacja nazwanych symboli PRZED zapisem** (incydent TS-SEC-ONBEHALF-001, juz-ide-api-3):
checklisty pisane z analizy/taska bywają ASPIRACYJNE — opisują docelowy design, nie stan repo.
Zaobserwowany przypadek: checklist odwoływał się do `buildContentAuthorizationContext` jak do
istniejącej funkcji — nie istniała nigdzie w repo; implementer warstwy dostał to jako fakt i
szukał jej w kółko (Glob/Grep bez końca, zero napisanego kodu, maxTurns cliff). Synteza (lub
osobny tani Explore-agent PRZED syntezą) MUSI zgrepować repo dla każdej nazwanej funkcji/klasy/
wzorca wymienionego w checkliście/decisions — jeśli nie istnieje, artefakt **jawnie oznacza**
„TO TRZEBA STWORZYĆ" obok tej nazwy (nie zostawia jej brzmiącej jak istniejący fakt). To samo
dotyczy ścieżek plików referencjonowanych jako „już istnieje, edytuj" — zweryfikuj `Read`/`Glob`
przed wpisaniem do artefaktu, nie ufaj pamięci/założeniom panelu.

### 1.5. Przepuść prozę przez humanizer (przed zapisem)
Sekcje czytane przez CZŁOWIEKA (`Synteza`, `Otwarte pytania`, `Decyzje (proponowane)`, `Ryzyka / uwagi`
w body — patrz krok 2) przepuść przez `Skill(humanizer)` PRZED zapisem: usuwa AI-tells (em dash, "moreover",
signposting, watę hedgingową), NIE dotyka frontmatteru (`open_questions[].q/answer`, `decisions[]`,
`patterns[]` — to bramka maszynowa dla `/orchestrate-ddd`, zostaje jak jest). Nie zmienia faktów ani decyzji
— tylko jak są sformułowane. Człowiek ma to realnie przeczytać i podjąć decyzję, nie przebrnąć przez
wygenerowaną prozę.

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
