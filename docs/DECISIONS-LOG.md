# Decisions Log — claude-patterns

> Chronologiczny, append-only log **dlaczego** robimy zmiany tak a nie inaczej.
> Dopisuj wpis przy KAŻDEJ istotnej poprawce. Lekki — ADR-y (`docs/adr/`) zostają dla
> dużych decyzji architektonicznych; ten log łapie bieżące „czemu" + dowody + odrzucone opcje.
>
> **Format wpisu:**
> ```
> ## YYYY-MM-DD — Tytuł
> **Zmiana:** co zrobiliśmy
> **Dlaczego:** powód + dowód (liczby/obserwacje)
> **Odrzucone:** alternatywy i czemu nie
> **Status:** done | experimental | reverted | pending
> ```

---

## 2026-07-02 — Restrukturyzacja RAG w 4 filary: observability → regresja → eval+wpięcie → wersjonowanie

**Zmiana:** pełna analiza przez /analyze-ddd (`docs/tasks/TASK-RAG-002.analysis.md`, approved) →
split na 4 taski i wykonanie Filarów 0–2 w jednej sesji:
- **Filar 0 (TASK-OBS-001, commit 8d5c700):** zewnętrzny watcher transkryptów
  (`scripts/workflow-watcher.js` → RUN-STATE.md na żywo) + watchdog produktywności per-kontrakt-etapu
  (`hooks/productivity-watchdog.js`, PreToolUse deny + kill-switch) + reguła no-rerun
  (`resumeFromRunId`). → **ADR 0003**.
- **Filar 1 (TASK-AGENT-CONFORMANCE-001, commit 51ef956):** bramka „kod istnieje" (pusty git diff
  → ESCALATE), verify() sekwencyjnie, werdykty przez `schema` (null → natychmiastowy ESCALATE),
  maxTurns weryfikatora 15→30, usunięte martwe `mcp__zen__*`, reguła całych plików; Rule Card
  spec-policy: **SP3 → SP3a/SP3b** (Business Rule vs Calculation Policy) + **N4** (`@BusinessRule`
  bez realnej delegacji = VETO; dekorator PROJEKTOWY juz-ide-api-1, nie @vytches/ddd).
- **Filar 2 (TASK-RAG-002 zwężony, commit 51ef956):** reseed globalnych kolekcji → **eval OFFLINE
  PRZED wpięciem** na golden-secie 20 zapytań: hit@1=0.55 · **hit@5=0.85** · MRR=0.66 → próg 0.6
  przekroczony → wpięcie `retrieve_patterns`/`retrieve_examples` do `tools:` obu implementerów.
  Harness: `tests/flow-evals/` (hooki 10/10 + retrieval). → **ADR 0004**.
- **Filar 3 (TASK-RAG-003, projekt):** wersjonowanie (pin `.claude/config/knowledge-pins.json`
  W REPO projektu), best_practices przez deterministyczną bramkę AST+git+proweniencja. → **ADR 0005**.

**Dlaczego:** regresja 15min→4h i $120-bez-wartości NIE była problemem RAG (niewpięty) — to
maszyneria egzekwowania + ciche padanie Workflow (TS-SEC-VERIFICATION-LEVELS-002: 4 przebiegi,
~5.2M tokenów, 0 ukończeń). Kolejność wg malejącego bólu. Dowód działania watchdoga: smoke-test
na transkryptach tej awarii pokazał weryfikatory 60k–279k burn bez jednego zdarzenia postępu.

**Odrzucone:** twardy cap tokenów (duży kontekst bywa legalny — metryka relatywna per kontrakt
etapu); Redis (wąskie gardło to pętle, nie latencja); Postgres od startu (pin JSON wystarcza);
LLM-judge jako scorer evalów (deterministyczne fixtures/AST); wpięcie RAG przed pomiarem (§9
rag-design); wiring technical-architecture-lead do panelu (ma tool Task → ryzyko zapętlenia;
COFNIĘTY do czasu naprawy — Q8).

**Status:** Filary 0–2 done; **niezweryfikowane na żywo end-to-end** — pierwszy przebieg
walidacyjny `/orchestrate-ddd` w juz-ide-api-1 (z watcherem + hookiem) jest twardym punktem
kontrolnym przed ogłoszeniem regresji naprawioną. Filar 3 pending.
**Ref:** ADR 0003/0004/0005 · `docs/tasks/TASK-{OBS-001,AGENT-CONFORMANCE-001,RAG-002,RAG-003}.md` · commity 9ef460c → 7a19b23 → 8d5c700 → 51ef956.

---

## 2026-06-30 — RAG: code-only + dedykowany Qdrant + swappable embedder (drop pattern-embedding)

**Zmiana:** knowledge-retriever zawężony do **code retrieval** (find existing impl). Pattern-embedding
USUNIĘTY. Store = **dedykowany** Qdrant (docker-compose, :6401, izolowany od prod). Embedder **pluggable**
(env: ct301 e5-large / openai-compat). `reseed.sh` = lekki (docker up→build→reindex z configu); swap modelu
= zmień env + rerun (recreate z nowym dim). Wpięte w /analyze-ddd (0.6) i /orchestrate-ddd (implement).

**Dlaczego:** embedding ⟺ vector store ⟺ code retrieval — stoją albo padają razem. Embedding *wzorców*
(72 pliki) = koszt bez wartości (decision cards + README wskazują wzorzec bez semantyki). Embedding *kodu*
(6800 plików) = realna wartość (dowód: bug ANTI-SPOOF — zła sygnatura, „to nie istnieje" — kosztował dzień).
Współdzielony prod-Qdrant „do czego innego" → izolacja (kolizja kolekcji, sprzężenie niezawodności).

**Odrzucone:** embedding wzorców do FlatStore (koszt bez zysku); współdzielony prod-Qdrant (kolizja/sprzężenie);
lokalny transformers.js/sqlite-vec (gorszy model + bałagan w node_modules).

**Status:** done + zwalidowane e2e na `mentions` (dedykowany Qdrant :6401, CT 301 embed, retrieve 0.84-0.88).
Patterns/decisions → markdown (decision cards). Faza 3 (hybrid+rerank+evals) = pending.

---

## 2026-06-29 — Right-size default: aparat multi-agentowy za ciężki dla małych tasków

**Zmiana:** domyślny flow dla małych/znanych tasków = **bezpośrednia implementacja + JEDNA
kompletna weryfikacja (find-all-once)**, BEZ pętli/panelu/re-spawnu. Multi-agent (`/orchestrate-ddd`,
panel) tylko dla dużych/nieznanych/równoległych. To czyni „loops-performance-lesson" **defaultem**, nie wyjątkiem.

**Dlaczego:** cały dzień + mnóstwo tokenów na 1 mały task (TS-SEC-ANTI-SPOOF-002). Z logów marnotrawstwo:
(1) **re-weryfikacja tego samego** (te same 2 agenty, te same 3 blokery, 2×), (2) **odkrywanie blokerów
falami** (verify→fix→verify→nowy bloker), (3) **ciężki kontekst per-agent** (ECC 33k always-on + czytanie
6800 plików od zera, brak RAG), (4) **lęk weryfikacyjny → ręczne re-spawny** („na pewno? upewnijcie się").

**Fix (kolejność dźwigni):** right-size default · find-all-once verify (jedna, znajdź WSZYSTKO) ·
RAG (cięcie re-readingu — największy lever na tokeny) · `ECC_HOOK_PROFILE=minimal` dla subagentów ·
ufać jednej weryfikacji (po to jest VETO gate).

**Odrzucone:** „dorzucić więcej agentów/weryfikacji" — to powiększa problem. Kierunek = **upraszczać**.
**Status:** decyzja done; egzekwowanie w komendach (find-all-once verifier, right-size routing) = pending.

---

## 2026-06-29 — Advanced RAG jako knowledge-retriever MCP (embedded, local-first)

**Zmiana:** zaprojektowany Advanced RAG jako **MCP server w TS** (`knowledge-retriever`) z magazynem
**embedded** (sqlite-vec, plik lokalny), lokalnymi embeddingami, hybrid search + rerank. Zastępuje
statyczne wstrzykiwanie wzorców semantycznym retrievalem; killer use-case = retrieval KODU w `/analyze-ddd`.
Pełny projekt: `docs/rag-design.md`.

**Dlaczego:** dziś retrieval regułowy → bloat kontekstu (33k always-on) + brak recall (agent grepuje
6800 plików na ślepo → halucynacje „to nie istnieje", jak w ANTI-SPOOF gdzie 70% już było w kodzie).
RAG na kodzie daje trafne Codebase Facts i wzorcowe istniejące implementacje (mniej błędów typu „stara sygnatura").

**Odrzucone:**
- **Hosted vector DB** (Qdrant/Pinecone/Weaviate) — over-engineering, infra do utrzymania, dane wychodzą. Wybrane: embedded sqlite-vec (zero serwera, GDPR-safe).
- Embeddingi przez API — kod/PII opuszczałby maszynę. Wybrane: lokalne (fastembed/ONNX, multilingual).
- RAG na patternach jako priorytet — mały korpus (72), niekrytyczny. Priorytet: **kod** (duży korpus).

**Status:** pending (design gotowy; MVP = flat cosine na patternach → potem code retrieval na sqlite-vec).
**Bonus:** domyka luki z oferty — MCP provider w TS + Advanced RAG + cost/quality + prywatność.

---

## 2026-06-29 — Loops (/orchestrate-ddd) wolne na małych taskach → rezerwujemy dla dużych

**Zmiana:** `/orchestrate-ddd` (autonomiczna pętla impl) zostaje **eksperymentalny / do dużych
zadań**. Do codziennej pracy: `/analyze-ddd` (research) + **ręczna/single-pass implementacja**
(`/orchestrate` albo bezpośrednio). Pętla NIE jest domyślną drogą dla małych zmian.

**Dlaczego:** pierwszy realny przebieg (juz-ide-api-1, TS-SEC-ANTI-SPOOF-002):
**40 min, 5 plików, eskalacja po 3 próbach** — handler.ts nie zbiegł.
- Pozytyw: **gate zadziałał** — wykrył 7 realnych bugów (privilege-escalation userId ADR-0021,
  zła sygnatura findByAddress ×3 callsite) i NIE wypchnął zepsutego kodu (staged partial + raport z liniami).
- Negatyw: za wolno i brak zbieżności na trudnym pliku. Przyczyny:
  (1) granularność per-warstwa → handler padał, więc cała warstwa re-implementowana 3× (waste na tym co przeszło);
  (2) ciężkie subagenty × 3 rundy (ECC 33k always-on + patterns + analysis per agent) + check-delegation wymusza subagentów;
  (3) fixer nie wchłonął decyzji z analysis.md (dalej stara sygnatura mimo flagi).

**Odrzucone:**
- „Loops do wszystkiego" — narzut pętli > zysk dla małych znanych zmian (zgodne z loop-engineering: pętle świecą przy dużych/równoległych/walk-away).
- Wznawianie pełnego Workflow na eskalacji — ryzyko kolejnych 10+ min bez zbieżności. Lepiej: znane violations+linie → jeden celowany fix.

**Status:** done (decyzja); tuning pętli = pending.
**Tuning do zrobienia (gdy wrócimy do pętli):** per-file (nie per-layer) granularność ·
targeted-fix-on-escalation (verifier violations → jeden pass) · niższe max_attempts (2) · lżejszy kontekst subagentów.
**Ref:** memory `loops-performance-lesson`, `docs/orchestrate-ddd-design.md`.

---

## 2026-06 — Wcześniejsze decyzje (pointery, pełny kontekst w dedykowanych plikach)

- **ECC jako baza + DDD-overlay (nie hard-fork)** — `docs/REFACTOR-ANALYSIS.md` §5. Dlaczego: ECC utrzymywany przez full-timera (222k★), namespaced overlay model pozwala nadążać za upstream; fork = śmierć przez staranie.
- **Dwie komendy /analyze-ddd + /orchestrate-ddd (twarda bramka research→impl)** — `docs/adr/0002`. Dlaczego: granica między komendami fizycznie nieprzekraczalna przez autonomię; Workflow > /goal (deterministyczny stop); artefakt = kontrakt handoff.
- **Artefakt analizy w `project-orchestration/analysis/` (nie tasks/)** — bo tasks/ tylko na taski; threat-model osobno w `docs/security/threat-models/`, połączone linkiem `threat_model:`.
- **threat-model: + Attack Trees + CVSS + MITRE ATT&CK (full tier)** — komplementarne metody (enumeration/scoring/TTP); OCTAVE/Trike/VAST odrzucone (zakres org / redundancja / już-to-robimy); Kill Chain → `/incident`.
- **Template SSoT w claude-patterns, sync (nie symlink w docs/)** — `docs/` to przenośna treść; opt-out `LOCAL-CUSTOMIZED`.
- **Migracja additywna, cięcie generyków (1G) na końcu** — symlinki propagują natychmiast; nie tnij przed live-walidacją.
