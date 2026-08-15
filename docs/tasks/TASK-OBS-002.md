# TASK-OBS-002 — Metryki workflow per-krok: koszty, konformancja z runtime.yml, ewaluatory regresji (Filar 0, kontynuacja OBS-001)

**Status: DONE — zaimplementowane 2026-08-15, zmergowane do develop (19eb027)** · **Źródło:** sesja 2026-08-15
(rozmowa o monitorowaniu zużycia tokenów per operacja; wszystkie fakty o danych zweryfikowane
na żywo w tej sesji) · **Poprzednik:** TASK-OBS-001 (watchdog, DONE) · **Powiązane:**
TASK-EVAL-001 (automatyzacja evali — ten task DOKŁADA nowy korpus evali w tej samej konwencji,
nie zmienia sposobu ich uruchamiania).

## Cel (czego chce user — parafraza z sesji)

Globalnie zapisywać, ile każda operacja/krok workflow zużyła tokenów i $, ile było kroków,
czy skończyły się sukcesem czy failem i co się stało z danymi przy failu — żeby dało się
**śledzić regresje i usprawnienia** (np. czy diff-sonda z §2a′ p. 6a faktycznie eliminuje
spalone próby) oraz **porównywać przebieg z planem z runtime.yml**. Do tego **ewaluatory**:
automatyczne bramki, które łapią regresję kosztową/jakościową bez ręcznego czytania raportów.
Dashboard TUI na żywo = ŚWIADOMIE POZA tym taskiem (osobny task, gdy zbierze się kilka dni
danych).

## Motywacja — dwa świeże incydenty, które ten system by wykrył

1. **TS-TOKEN-TOPUP-001/A2 (api-1, 2026-08-14):** implementer 2× umarł bez StructuredOutput,
   choć kod był kompletny na dysku — 2 próby × ~10 min × ~120k tokenów output spalone na
   powtórce gotowej pracy. W metrykach per-krok: dwa rekordy `A2-impl-*` z outcome
   `silent-death` i kosztem — regresja widoczna od razu, a po wdrożeniu diff-sondy mierzalny
   spadek.
2. **~91% rachunku przebiegu to cache read/write, nie output** (pomiar transkryptów,
   memory `workflow-cost-is-context-not-work`). Koszt liczony tylko z output-tokenów byłby
   fikcją — dlatego collector MUSI sumować 4 liczniki z transkryptów subagentów (patrz Fakty).

## ZWERYFIKOWANE FAKTY o istniejących danych (2026-08-15 — NIE re-derywuj, ścieżki i pola sprawdzone na żywo)

1. **`~/.claude/metrics/costs.jsonl`** — istnieje (hook cost-trackera ECC, od 2026-06-28,
   ~7,7k linii). Granulacja: **sesja**, nie krok. Pola:
   `{timestamp, session_id, transcript_path, model, input_tokens, output_tokens,
   cache_write_tokens, cache_read_tokens, estimated_cost_usd}`. Raport: `ecc:cost-report`.
   NIE duplikować — to komplementarny, sesyjny poziom.
2. **Rekordy przebiegów Workflow:** `~/.claude/projects/<slug-projektu>/<session-id>/workflows/wf_*.json`.
   Pola (zweryfikowane na `wf_379c0a41-ff2`): `runId, timestamp, taskId, script, scriptPath,
   args, result, agentCount, logs, durationMs, summary, workflowName, status, startTime,
   phases, defaultModel, workflowProgress, totalTokens, totalToolCalls`.
   `workflowProgress` ma wpis per agent: `{type:'workflow_agent', index, label, phaseIndex,
   phaseTitle, agentId, agentType, model, tokens, toolCalls, durationMs}` —
   **UWAGA: BEZ pola outcome** (patrz Decyzja D3). `result` niesie `escalatedAt` + powody.
3. **`journal.jsonl`** w katalogu transkryptów przebiegu — jedna linia `{"type":"result",...}`
   per agent, który ODDAŁ wynik. Krok obecny w `workflowProgress`, a nieobecny w journalu =
   silent-death/exception.
4. **Transkrypty subagentów:** `~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl`
   (+ `agent-<id>.meta.json` z `{agentType, description, toolUseId, spawnDepth}`).
   Usage per wiadomość (zweryfikowane): `{"usage":{"input_tokens", "cache_creation_input_tokens",
   "cache_read_input_tokens", "output_tokens", ...}}` — **jedyne źródło wiernego kosztu $**.
5. **Przykład realnych danych per-krok** (z `wf_379c0a41-ff2`, do fixture'a):
   `A2-impl-1: infrastructure-implementer, claude-sonnet-5, 129 373 tok, 58 toolCalls, 597 s`;
   `A2-impl-2: 109 794 tok, 63, 561 s`. Oba silent-death (brak w journalu), `result.escalatedAt: 'A2'`.
6. **$ rozliczeniowe:** `/cost-report` (Admin API, `ANTHROPIC_ADMIN_API_KEY`) — źródło prawdy
   do miesięcznej kalibracji szacunków. Ceny modeli do `prices.json` brać z referencji
   `claude-api` (skill), NIGDY z pamięci modelu.
7. **`runtime.yml`** per projekt (`.claude/config/runtime.yml`) — plan warstw, sloty agentów,
   verifiery, final gate, `knowledge.collection`. To jest „plan", z którym porównujemy przebieg.

## Zakres

### 1. Collector — `scripts/workflow-metrics-collect.mjs` (deterministyczny, zero LLM)
- [x] Skanuje `~/.claude/projects/*/*/workflows/wf_*.json` + journal + transkrypty subagentów;
      emituje **jedną linię per krok** do globalnego `~/.claude/metrics/workflow-steps.jsonl`.
- [x] Rekord kroku: `{ts, project, sessionId, runId, taskId, workflowName, phase, label,
      agentType, model, outputTokens, inputTokens, cacheReadTokens, cacheWriteTokens,
      toolCalls, durationMs, outcome, reason, resumedFrom, costUsd, runtimeYmlHash}`.
- [x] **Idempotencja:** klucz `runId+agentId` — powtórne uruchomienie nie duplikuje linii
      (append-only + dedup przy odczycie ALBO przepisanie pliku; wybrać prostsze, opisać w README).
- [x] Rozbicie cache/input z transkryptu agenta (suma po wiadomościach); gdy transkrypt
      niedostępny — rekord z samym `outputTokens` z `workflowProgress` + flaga `partial: true`.
- [x] Rekord per-PRZEBIEG (druga linia typu `run`): totalTokens, totalToolCalls, durationMs,
      status, escalatedAt, agentCount, costUsd-suma.

### 2. Cennik — `~/.claude/metrics/prices.json`
- [x] Stawki per model × 4 rodzaje tokenów (input / output / cache write / cache read),
      z referencji `claude-api`. Plik z datą pobrania.
- [x] Raport pokazuje OBIE kolumny: `costUsd` (szacunek) i — gdy dostępny klucz —
      rozjazd % względem `/cost-report` za ten sam okres (kalibracja, nie zastąpienie).

### 3. Raport — `scripts/workflow-metrics-report.mjs`
- [x] `--by label|task|model|agentType|day|project` + `--since <data>`.
- [x] **Tryb regresji:** ten sam `label` (lub taskId+label) w kolejnych runach — delta tokenów,
      $, czasu, zmiana outcome. To jest główny use-case („czy diff-sonda pomogła").
- [x] Top-N najdroższych kroków + success-rate per agentType/model.
- [x] Wyjście: tabela do terminala + opcjonalnie `--json` (pod przyszły dashboard).

### 4. Konformancja z runtime.yml — `scripts/workflow-conformance.mjs` (lub moduł raportu)
- [x] Collector przy zbieraniu zapisuje **hash + kopię** `runtime.yml` projektu
      (`~/.claude/metrics/runtime-snapshots/<hash>.yml`) — porównujemy z planem
      obowiązującym W MOMENCIE przebiegu, nie z dzisiejszym.
- [x] Sprawdzenia (deterministyczne): każda warstwa z planu miała cykl implement→verify→GO?
      agenci spoza slotów? final gate właściwym agentem? kolejność warstw? gdzie przebieg
      stanął (escalatedAt) i po ilu próbach?
- [x] Wynik: `conformance: OK | DEVIATIONS(n)` + lista odchyleń per przebieg.
      (Runtime'owy odpowiednik statycznego `/conformance-check`.)

### 5. Hook — automatyczne zbieranie
- [x] `hooks/workflow-metrics-postrun.js`: PostToolUse na Workflow, fire-and-forget
      (wzorzec `knowledge-freshness-postwrite.js`), zawsze exit 0, stderr na diagnostykę.
- [x] Wpis w `hooks/hooks.json` + `hooks/README.md`.
- [x] **Pułapki znane z tego repo:** hook NIE może skanować transkryptu w PreToolUse dla
      subagentów (memory `hook-subagent-transcript-trap`); tu jesteśmy w PostToolUse głównej
      pętli, ale sprawdź `agent_id` defensywnie.

### 6. EWALUATORY — `tests/flow-evals/workflow-metrics/` (konwencja jak `retrieval/`, `watcher/`, `workflow-lint/`)
- [x] **E1 collector-golden:** zarchiwizowany `wf_379c0a41-ff2.json` + journal + 1-2 transkrypty
      jako fixtures → collector produkuje DOKŁADNIE oczekiwane rekordy (w tym outcome
      `silent-death` dla A2-impl-1/2, koszt z 4 liczników). To jest regresyjna kotwica formatu.
- [x] **E2 budget-regression:** na spreparowanym `workflow-steps.jsonl` (2 runy tego samego
      taska) raport w trybie regresji wykrywa wzrost >50% kosztu tego samego labela i
      spadek success-rate; NIE alarmuje przy szumie <20%.
- [x] **E3 conformance:** fixture plan+przebieg zgodny → OK; przebieg z pominiętym verify
      warstwy i agentem spoza slotu → DEVIATIONS z poprawną listą.
- [x] Uruchamianie: `node tests/flow-evals/workflow-metrics/run.js` — ręcznie, jak reszta L1
      (automatyzację ogarnia TASK-EVAL-001, nie ten task).

### Anty-zakres (świadomie POZA)
- Dashboard TUI na żywo → osobny task (TASK-OBS-003?), gdy będzie kilka dni danych.
- OTEL/Grafana/Prometheus — nie teraz; płaskie JSONL wystarczą i pasują do filozofii repo.
- Przechowywanie per-wiadomość — transkrypty pozostają źródłem; collector trzyma SUMY per krok.
- Modyfikacja formatu `costs.jsonl` (ECC, vendored zachowanie) — tylko czytamy.

## Decyzje już podjęte (nie re-decyduj w świeżym kontekście)
- **D1:** płaskie JSONL w `~/.claude/metrics/`, nie baza — zgodnie z filozofią TEAM-STATE.md
  (zero zależności, git-owalne, czytelne dla ludzi i agentów).
- **D2:** wszystko deterministyczne, zero LLM w collectorze/raporcie/konformancji/evalach.
- **D3:** outcome rekonstruowany regułami: wpis w journalu → wynik z treści (GO/NO_GO);
  brak wpisu przy obecności w workflowProgress → `silent-death`; `result.escalatedAt` →
  gdzie stanął przebieg; agent z cache resume → `cached`.
- **D4:** koszty = szacunek lokalny (prices.json) + kalibracja Admin API; obie kolumny w raporcie.
- **D5:** snapshot runtime.yml per przebieg (hash) — konformancja względem planu z momentu startu.

## Kryteria akceptacji
- [x] Po `node scripts/workflow-metrics-collect.mjs` rekordy z co najmniej 3 realnych
      przebiegów (api-1/2/4 z 2026-08-14/15 są na dysku) lądują w `workflow-steps.jsonl`,
      a powtórne uruchomienie nie duplikuje.
- [x] Raport `--by label` pokazuje A2-impl-1/A2-impl-2 z outcome silent-death i kosztem $.
- [x] Konformancja dla min. 1 realnego przebiegu daje sensowny wynik z listą odchyleń.
- [x] Hook działa (test na małym przebiegu Workflow) i NIGDY nie blokuje (exit 0 przy każdej awarii).
- [x] Evale E1-E3 zielone; E1 na prawdziwych, zarchiwizowanych fixture'ach.
- [x] `hooks/README.md` + krótki opis formatu rekordu i użycia (sekcja w `scripts/` lub README).

## Wskazówki wykonania (workflow tej sesji)
- Po implementacji odpal **agenta-reviewera** (ecc:typescript-reviewer / code-reviewer) po
  własnym diffie i napraw znaleziska PRZED oddaniem — user chce minimalizować ręczny review,
  ale bez utraty jakości (memory `commit-review-workflow-preference`, ewolucja 2026-08-15).
- Zakończ w stanie **staged-not-committed**; commituje user.
- Przy pisaniu parserów NIE zgaduj pól — wszystkie ścieżki i nazwy pól są w sekcji FAKTY,
  a przykładowe pliki leżą na dysku (`wf_379c0a41-ff2` w sesji `6284f48f…` projektu
  `-opt-projects-juz-ide-api-1`).
