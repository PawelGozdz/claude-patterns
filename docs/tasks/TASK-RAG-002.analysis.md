---
task: TASK-RAG-002 (restrukturyzacja) → split na RAG-002 (zwężony) + RAG-003 (nowy)
status: approved
approved: 2026-07-02 (użytkownik, po rewizji 2)
threat_model: null
created: 2026-07-02
updated: 2026-07-02 (rewizja 2 — watchdog per-kontrakt-etapu, zewnętrzny watcher, zależność Rule-Card→D5, eval-przed-wpięciem, eval modularny D7, success_criteria)
supersedes_scope_of: docs/tasks/TASK-RAG-002.md
related: [docs/tasks/TASK-AGENT-CONFORMANCE-001.md, docs/rag-design.md]

# Filar 0 (NOWY, najwyższy priorytet) — Performance & Observability
# Filar 1 — Regresja pętli (CONFORMANCE §3) PRZED dalszym RAG
# Filar 2 — RAG-002 zwężony: seed + eval + wpięcie (w TEJ kolejności)
# Filar 3 — RAG-003 nowy: wersjonowanie + per-project + multi-stack infra

open_questions:
  - id: Q1
    q: "Czy zgadzasz się na SPLIT: RAG-002 zwężony do (seed+wpięcie+eval), a wersjonowanie/per-project/multi-stack → nowy RAG-003? Czy wolisz jeden duży task?"
    answer: "TAK — split zatwierdzony."
  - id: Q2
    q: "Filar 0 (observability) PRZED RAG czy RÓWNOLEGLE? Rekomendacja: PRZED — bez wglądu na żywo każdy kolejny przebieg to ryzyko $120/zero-wartości."
    answer: "TAK — Filar 0 przed RAG."
  - id: Q3
    q: "Twardy budżet tokenów per Workflow-run: jaki cap?"
    answer: "NIE dla twardego capa — większy kontekst bywa uzasadniony. Metryka ma być RELATYWNA: wykrywać zużycie tokenów BEZ równoczesnego postępu (spinning). Watchdog produktywności, nie limit absolutny. DOPRECYZOWANIE (rewizja 2): 'postęp' definiowany per KONTRAKT ETAPU (implement→Write/Edit; verify→werdykt/StructuredOutput; analysis→artefakt+limit czasu), NIE globalnie 'tokeny bez Write/Edit' — inaczej watchdog HALT-owałby legalnie pracujące weryfikatory i panel analizy (agenci read-only). Patrz Filar 0 + D6."
  - id: Q4
    q: "Observability: wystarczy /workflows + task-notifications + log()-heartbeat co N kroków, czy chcesz osobny plik STATE (np. RUN-STATE.md aktualizowany na żywo) widoczny bez patrzenia w transkrypt?"
    answer: "HYBRYDA, z naciskiem na mechanizm POZA silnikiem: (1) ZEWNĘTRZNY WATCHER TRANSKRYPTÓW — proces tail-ujący ~/.claude/projects/**/subagents/workflows/**/agent-*.jsonl, liczy tokeny vs zdarzenia postępu i pisze RUN-STATE.md (faza, ostatni artefakt, tokeny-od-postępu, status per agent). Niezależny od silnika Workflow — przeżyje dokładnie ten typ awarii (ciche milknięcie weryfikatora), który hook in-process fizycznie nie złapie (CONFORMANCE §3); przy okazji zbiera dane diagnostyczne do niewyjaśnionej przyczyny. (2) HALT przez PreToolUse deny — hook nie zabije wiszącego agenta, ale MOŻE zablokować dalsze tool-calle po fladze 'spinning'. (3) /workflows + log() heartbeat jako warstwa podstawowa (zero dodatkowej pracy)."
  - id: Q5
    q: "Wersjonowanie (RAG-003): metadane wersji w pliku pin (knowledge-pins.json / SQLite) czy od razu Postgres? Rekomendacja: zacznij od JSON pin, Postgres tylko gdy przerośnie."
    answer: "JSON pin, ale W REPO PROJEKTU: .claude/config/knowledge-pins.json — git-tracked, wersjonowany razem z kodem który pinuje, przechodzi przez review jak każda zmiana. Postgres dopiero gdy pin zacznie wymagać zapytań relacyjnych (nie spekulacyjnie)."
  - id: Q6
    q: "best_practices_<project>: źródło = pliki które przeszły code-quality-verifier z zerem naruszeń. Ale verifier jest DZIŚ niewiarygodny (CONFORMANCE §2). Najpierw naprawić verifier, czy kurować best_practices ręcznie na start?"
    answer: "Long-run (D5): NIE opierać best_practices na niewiarygodnym LLM-verifierze ANI na ręcznej kuracji. Bramka wejścia = deterministyczny AST /conformance-check (zero HARD-RULE) + sygnał stabilności git (plik nietknięty/nierevertowany N dni = battle-tested) + proweniencja (commit sha + timestamp). UZUPEŁNIENIE (rewizja 2): bramka jest tylko tak dobra jak Rule Cards — WARUNEK WSTĘPNY: Rule Card fix z Filaru 1 (split SP3 + reguła N4) PRZED pierwszym seedem, inaczej bramka wykluczy dobre pliki (fałszywe SP3: 6/8) i wpuści złe (N4: dekorator bez delegacji, 5/8 agregatów). Plus inwalidacja (hash wersji Rule Carda w chunku) i sygnał negatywny (fix:/revert). Patrz D5."
  - id: Q7
    q: "Eval golden-set: kto tworzy i ile pozycji na MVP? Rekomendacja: 15-20 par (task→oczekiwany plik/wzorzec) ręcznie z realnych przebiegów juz-ide-api-1, rozbudowa z czasem."
    answer: "PÓŁAUTOMATYCZNIE z historii git juz-ide-api-1: zamknięte taski → pliki dotknięte w ich commitach = ground truth 'czego retrieval powinien był szukać'. Człowiek tylko PRZEGLĄDA 15-20 wygenerowanych par (review, nie wymyślanie od zera). Rozbudowa z czasem z realnych przebiegów."
  - id: Q8
    q: "Los zmian z DZIŚ w /analyze-ddd (backend-technology-expert + technical-architecture-lead): technical-architecture-lead MA tool Task → ryzyko zapętlenia z notatki bug-fix. Zostawić, zahartować (zakaz Task w promptcie), czy cofnąć synthesis do tech-lead?"
    answer: "WYŁĄCZONE na teraz — oba pliki (commands/analyze-ddd.md + presets/nestjs-ddd.yml) COFNIĘTE do stanu sprzed dziś (tech-analysis=ecc:architect, synthesis=tech-lead). Wracamy do wiringu dopiero po naprawie całego systemu — wtedy z synthesis-agentem BEZ toola Task (albo zahartowanym)."

decisions:
  - id: D1
    decision: "Ból (15min→4h, słaby kod) NIE jest problemem RAG — to regresja maszynerii egzekwowania (rule-card injection + SubagentStop reconciliation + rule-by-rule verifier + ciche padanie Workflow). RAG-002 jest jeszcze niewpięty w flow, więc fizycznie nie może być przyczyną spowolnienia."
    rationale: "Dowód: CONFORMANCE-001 §3 (4 przebiegi, 5.2M tokenów, 0 ukończeń); RAG-002 'Uwaga' + 'retrieve_patterns świadomie odłożone'."
    propose_adr: true
  - id: D2
    decision: "Priorytet: Filar 0 (observability) + Filar 1 (regresja) PRZED rozwojem RAG. Kolejność wg malejącego bólu, nie malejącego nakładu."
    rationale: "Bez budżetów/timeoutów/wglądu każdy przebieg to hazard. Najlepszy RAG nie pomoże, gdy pętla pada po 4h."
    propose_adr: false
  - id: D3
    decision: "Storage: Qdrant zostaje (semantyka). Redis ODRZUCONY na teraz (wąskie gardło to pętle agentów, nie latencja retrievalu). Postgres TYLKO dla wersjonowania (dane relacyjne) i dopiero gdy plik pin (git-tracked w repo projektu, patrz Q5) przestanie wystarczać."
    rationale: "docs/rag-design.md: local-first, zero hosted DB. Nie dokładać baz spekulacyjnie."
    propose_adr: true
  - id: D4
    decision: "Multi-stack: korpus/schema projektowane stack-agnostycznie (stack/framework/layer już w types.ts), ale seed+eval na start TYLKO nestjs-ddd. Flutter/shared-lib później, bez zmian schematu."
    rationale: "Zgoda użytkownika: infra pod wszystkie, focus nestjs-ddd teraz."
    propose_adr: false
  - id: D5
    decision: "best_practices_<project> zasilany DETERMINISTYCZNĄ bramką: AST /conformance-check (zero HARD-RULE) + stabilność git (N dni bez rewertu) + proweniencja (commit sha + timestamp). NIE zależy od LLM-verifiera ani ręcznej kuracji. WARUNKI (rewizja 2): (a) PREREQUISITE: Rule Card fix z Filaru 1 (split SP3 Business-Rule-Policy vs Calculation-Policy + reguła '@BusinessRule bez realnej delegacji = VETO') PRZED pierwszym seedem — na dzisiejszych kartach bramka daje 6/8 fałszywych SP3 i przepuszcza N4 (5/8 agregatów z inline-logiką trafiłoby do kolekcji jako 'wzorcowe'); (b) INWALIDACJA: chunk niesie hash wersji Rule Carda — zmiana karty → re-run bramki nad kolekcją (inaczej kolekcja dryfuje od aktualnych reguł); (c) SYGNAŁ NEGATYWNY: wykluczaj pliki dotknięte później commitami fix:/revert — 'stabilny N dni' nie łapie pliku naprawionego w dniu N+1; (d) MECHANIZM ZASILANIA: job post-commit/cron, NIE hook postwrite — okno stabilności i tak wymaga czasu, a bramka AST na każdym Write byłaby kosztowna."
    rationale: "Verifier (Sonnet, self-report) niewiarygodny (CONFORMANCE §2). /conformance-check jest offline/AST/deterministyczny — właściwe, powtarzalne, wersjonowalne źródło prawdy. Odpowiedź long-run na Q6. Warunki (a)-(d) domykają luki: jakość kart (CONFORMANCE §1), dryf kolekcji, ślepotę okna stabilności, koszt bramki."
    propose_adr: true
  - id: D6
    decision: "Observability: NIE twardy cap tokenów. Watchdog produktywności ŚWIADOMY KONTRAKTU ETAPU — 'postęp' definiowany per rola (implement→Write/Edit; verify→werdykt/StructuredOutput; analysis→artefakt końcowy + limit czasu etapu). HALT gdy tokeny rosną BEZ zdarzenia postępu ZDEFINIOWANEGO DLA TEGO ETAPU. Duże zużycie przy realnym postępie jest OK."
    rationale: "Odpowiedź użytkownika na Q3: metryka relatywna (koszt-vs-output), nie absolutna. Doprecyzowanie per-etap: globalna metryka 'tokeny bez Write/Edit' dawałaby fałszywe alarmy na weryfikatorach (tools: Read/Glob/Grep/Bash — legalnie zero Write) i panelu analizy — czyli dokładnie na etapach, które najczęściej milkną."
    propose_adr: true
  - id: D7
    decision: "EVAL MODULARNY — każdy komponent flow (hook, Rule Card/AST-checker, agent, retrieval, całość E2E) ma WŁASNY, odseparowany eval z deterministycznym scorerem gdzie się da; piramida ewaluacji L1/L2/L3 analogiczna do piramidy testów. Eval komponentu odpalany, gdy komponent się zmienia — poprawa jednego elementu bez ruszania (i bez re-ewaluacji) pozostałych. Warunek architektoniczny: każdy etap ma jawny kontrakt wejście→wyjście strukturalne (werdykt-schema z Filaru 1 jest prerequisite). Lokalizacja: tests/flow-evals/ w claude-patterns."
    rationale: "Prośba użytkownika (2026-07-02): możliwość evaluowania każdego etapu odrębnie. Klucz: deterministyczne scorery (fixtures dla hooków, labeled corpus dla AST-checkera, seeded-bugs dla weryfikatorów, /conformance-check jako sędzia dla implementerów) zamiast LLM-judge — tanie, powtarzalne, CI-owalne. Szczegóły w sekcji 'Eval modularny'."
    propose_adr: true

success_criteria:
  - filar: 0
    crit: "Każdy run widoczny na żywo w RUN-STATE.md; spinning wykryty ≤ ustalony próg tokenów od wystąpienia; ZERO przebiegów 'odkrytych po 3h'."
  - filar: 1
    crit: "Benchmark-task (TS-SEC-VERIFICATION-LEVELS-002 lub równoważny) kończy się DETERMINISTYCZNIE (werdykt LUB ESCALATE) w < 30 min, bez martwych retry (null z agent() → natychmiastowy ESCALATE, nie 9 ślepych wywołań)."
  - filar: 2
    crit: "Precision@5 ≥ próg (propozycja 0.6) na golden-secie ORAZ zużycie tokenów w kroku 0.6 mniejsze niż grep-fallback (delta mierzona w evalu). Wpięcie w flow DOPIERO po spełnieniu obu."
  - filar: 3
    crit: "Demo 'current vs latest' na jednym realnym wzorcu (pin w repo projektu, retrieve zwraca oba warianty z notką breaking-change)."

patterns:
  - docs/rag-design.md (§7 eval, §9 trade-offy)
  - mcp-server/knowledge-retriever/src/{schema,global-indexer,markdown-chunker,store-qdrant}.ts (kod Fazy C, gotowy, niezaseedowany)
  - docs/tasks/TASK-AGENT-CONFORMANCE-001.md §1 (luki Rule Cards — prerequisite D5), §2 (luki weryfikatora), §3 (mitygacje regresji)
---

# Analiza: restrukturyzacja prac RAG + nowy filar Performance/Observability

## Synteza

Cel nadrzędny (Twoimi słowami): **działający system, który przez MCP zwraca faktycznie
wartościowe informacje agentom generującym kod** — patterny, przykłady, decision-making —
dla autonomicznego budowania software'u, docelowo wielo-stackowo (nestjs-ddd teraz,
flutter/shared-lib później), z **per-project overrides** i **wersjonowaniem** implementacji.

Kluczowe ustalenie: **to, co Cię boli (4h zamiast 15min, słaby kod, $120 bez wartości),
i to, co chcesz zbudować (bogaty RAG), to dwa różne problemy.** Reworking RAG nie odda Ci
czasu. Dlatego analiza dzieli pracę na 4 filary w kolejności malejącego bólu.

Rewizja 2 (2026-07-02) dodaje: watchdog per-kontrakt-etapu (nie globalny), zewnętrzny
watcher transkryptów (mechanizm poza silnikiem), jawną zależność Rule-Card-fix → D5,
odwróconą kolejność w Filarze 2 (eval PRZED wpięciem), eval modularny (D7) i mierzalne
`success_criteria` per filar.

---

## Filar 0 — Performance & Observability (NOWY, najpilniejszy)

**Problem:** agenci działają 2-3h w tle bez wglądu; po godzinach okazuje się $120 spalone,
zero wartości. Nieakceptowalne jako codzienny tryb pracy.

**Zasada nadrzędna (Q3, doprecyzowana):** NIE twardy cap tokenów. Metryka RELATYWNA i
**świadoma kontraktu etapu** — „postęp" to nie zawsze Write/Edit:
- `implement` → Write/Edit,
- `verify` → zwrócony werdykt / StructuredOutput,
- `analysis` → artefakt na końcu + limit czasu etapu.

Globalne „tokeny bez Write/Edit" HALT-owałoby legalnie pracujące weryfikatory
(`tools: Read, Glob, Grep, Bash` — zero Write z definicji) i panel `/analyze-ddd` —
czyli dokładnie te etapy, które najczęściej milkną.

**Architektura (Q4):**
- **Zewnętrzny watcher transkryptów (rdzeń)** — proces tail-ujący
  `~/.claude/projects/**/subagents/workflows/**/agent-*.jsonl`; liczy tokeny vs zdarzenia
  postępu per agent i pisze **`RUN-STATE.md`** na żywo (bieżąca faza, ostatni artefakt,
  tokeny-od-postępu, status agentów). **Poza silnikiem Workflow** — bo udokumentowana
  awaria (CONFORMANCE §3: weryfikator milknie bez śladu hooka i bez błędu) jest na poziomie
  silnika i hook in-process jej nie złapie. Bonus: watcher zbiera dane diagnostyczne do
  wciąż niewyjaśnionej przyczyny milknięcia.
- **HALT przez PreToolUse deny** — hook nie zabije wiszącego agenta, ale MOŻE zablokować
  dalsze tool-calle po fladze „spinning" (realny, dostępny punkt egzekucji).
- **Heartbeat podstawowy** — `log()` co krok fazy + `/workflows` progress + task-notifications.
- **Kill-switch** + reguła „nie ponawiaj Workflow N-ty raz" (resume zamiast re-run).
- **Wykrywanie ciszy** — brak tool_use/tekstu przez X → watcher flaguje w RUN-STATE.md.

## Filar 1 — Regresja pętli (CONFORMANCE §3) przed dalszym RAG

Tanie mitygacje, wysoka dźwignia (szczegóły w TASK-AGENT-CONFORMANCE-001 §3, uzupełnione):
- **Bramka „kod istnieje" przed weryfikacją**: w skrypcie Workflow przed `verify()` —
  `git diff --stat` puste → **ESCALATE, nie weryfikuj**. Jedna linia; eliminuje całą klasę
  „weryfikacja kodu, który nigdy nie powstał" (CONFORMANCE §2).
- **Werdykt przez `schema`** w `agent()`: dziś martwy weryfikator zwraca `null` i pętla
  ponawia w ciemno (3 warstwy × 3 próby = 9 martwych wywołań). Ze `schema` orkiestrator
  odróżnia „agent umarł" (null → ESCALATE natychmiast) od „zły wynik" (retry ma sens).
  To także prerequisite D7 (kontrakty etapów).
- **Reguła całych plików**: weryfikator czyta CAŁE pliki albo deleguje — przeoczenie
  naruszenia izolacji kontekstu przez przeczytanie 120/443 linii (CONFORMANCE §2).
- `verify()` w `orchestrate-ddd` Workflow: `parallel()` → sekwencyjnie.
- `maxTurns` `code-quality-verifier` 15 → ~30.
- Gate delegacji dla weryfikatorów (dziś tylko implementery mają `check-delegation.js`).
- **Rule Card fix (SP3 split + „@BusinessRule bez delegacji = VETO")** — uwaga: to jest
  też PREREQUISITE bramki D5 (best_practices), więc blokuje część Filaru 3.
- Uczciwie: część ciszy Workflow to poziom silnika (poza repo) → Filar 0 jest siatką bezpieczeństwa.

## Filar 2 — RAG-002 ZWĘŻONY: udowodnić wartość (eval PRZED wpięciem)

Kod Fazy A/B/C napisany, ale niezaseedowany/niewpięty/niezmierzony. Kolejność ODWRÓCONA
względem rewizji 1 — bo `rag-design.md` §9 sam mówi: **zły retrieval jest gorszy niż
statyczne wstrzykiwanie**; wpinanie przed pomiarem ryzykuje pogorszenie świeżo naprawionego flow:
1. **Seed** `patterns_global` + `library_reference_global` (migrate.ts na żywym Qdrancie).
2. **Eval OFFLINE** (Q7): golden-set 15-20 par wygenerowany półautomatycznie z historii git
   `juz-ide-api-1` (zamknięte taski → pliki z ich commitów = ground truth; człowiek tylko
   przegląda) + precision/recall@K + MRR + **delta kosztu tokenów** (wstrzyknięte hity vs
   statyczna injekcja — bo pierwotny ból to tokeny, nie tylko trafność).
3. **Wpięcie** `retrieve_patterns` w `/analyze-ddd` (0.5/0.6) **DOPIERO po przekroczeniu
   progu** (success_criteria filar 2). Bez progu nie wpinamy.
- Zasada decyzyjna: nieznana dokładna nazwa symbolu → RAG; znana → grep.

## Eval modularny — piramida ewaluacji per komponent (D7)

Cel (prośba z 2026-07-02): **każdy etap flow evaluowany odrębnie**, żeby dało się poprawiać
jeden element bez ruszania pozostałych. Analogia do piramidy testów (L1/L2/L3 jak w
konwencji projektu):

**L1 — deterministyczne, tanie, uruchamiane zawsze (CI-owalne):**
- **Hooki**: fixture'y stdin→stdout — nagrane realne wejścia (JSON z transkryptów) →
  oczekiwana decyzja (block/pass). `tests/flow-evals/hooks/fixtures/*.json` + node test runner.
  Zmiana hooka → odpal tylko jego fixtures.
- **Rule Cards / AST-checker (`/conformance-check`)**: labeled corpus — **35 plików z audytu
  CONFORMANCE §1 to GOTOWY ground truth** (znane naruszenia + znane fałszywe trafienia SP3)
  → precision/recall per rule ID. Zmiana karty → od razu widać, czy poprawiła precyzję,
  czy zepsuła recall.
- **Retrieval**: golden-set + metryki (jak Filar 2) — offline, bez agentów.

**L2 — pojedynczy agent w izolacji, deterministyczny scorer, przy zmianie promptu agenta:**
- **Weryfikatory**: korpus **seeded-bugs** — pliki z celowo wstrzykniętymi znanymi
  naruszeniami (czy łapie?) + czyste pliki (false positive rate?). Scorer = porównanie
  z etykietami, zero LLM-judge.
- **Implementery**: mały bounded task → output oceniany **`/conformance-check`** (AST jako
  sędzia — deterministyczny, nie „Sonnet ocenia Sonneta").
- **Etapy panelu `/analyze-ddd`**: replay stage'a z nagranym wejściem (transkrypty już są)
  → sprawdzenie kontraktu wyjścia (struktura, obecność decyzji/pytań/werdyktu).

**L3 — end-to-end, drogie, rzadko (przed release'em zmian w flow):**
- Benchmark task (TS-SEC-VERIFICATION-LEVELS-002 lub równoważny) A/B: czas, tokeny,
  jakość wyniku (conformance-check na wygenerowanym kodzie).

**Warunek architektoniczny:** każdy etap ma jawny kontrakt wejście→wyjście strukturalne
(werdykt-`schema` z Filaru 1 to prerequisite — bez tego nie ma czego replay'ować ani scorować).
**Zasada wyzwalania:** eval komponentu odpalany, gdy TEN komponent się zmienia — nie całość
za każdym razem. ECC `agent-evaluator` (5-osiowa rubryka) dopuszczalny jako scorer
jakościowy-uzupełniający, ale preferować deterministyczne.

## Filar 3 — RAG-003 NOWY: wersjonowanie + per-project + multi-stack infra

- **Wersjonowanie (Q5):** chunk dostaje `version` + `lib_version` + `status`
  (current│deprecated│latest); pin **w repo projektu** (`.claude/config/knowledge-pins.json`,
  git-tracked, review'owalny); retrieve zwraca **oba** warianty (current-in-project vs latest)
  z notką breaking-change → agent proponuje, człowiek decyduje.
- **best_practices_<project> (Q6/D5):** deterministyczna bramka AST + stabilność git +
  proweniencja, z warunkami (a)-(d) z D5 — w tym twardy PREREQUISITE: Rule Card fix
  (Filar 1) przed pierwszym seedem. Zasilanie: job post-commit/cron, nie hook postwrite.
- **Multi-stack (D4):** schema stack-agnostyczna już teraz; seed/eval tylko nestjs-ddd.
- **Storage (D3):** JSON pin w repo najpierw; Postgres tylko gdy przerośnie; Redis odrzucony.

---

## Otwarte pytania
Q1–Q8 — patrz frontmatter (odpowiedzi WYŁĄCZNIE tam).

## Decyzje (proponowane)
D1–D7 — patrz frontmatter. D1, D3, D5, D6, D7 → kandydaci na ADR.

## Status odpowiedzi
**Wszystkie pytania Q1–Q8 odpowiedziane, status: approved (2026-07-02).**
Split wykonany: `TASK-OBS-001.md` (Filar 0), mitygacje Filaru 1 dopisane do
`TASK-AGENT-CONFORMANCE-001.md` §3, zakres zwężony w `TASK-RAG-002.md`,
nowy `TASK-RAG-003.md` (Filar 3). Kolejność wykonania:
OBS-001 → CONFORMANCE-001 → RAG-002 → RAG-003.
