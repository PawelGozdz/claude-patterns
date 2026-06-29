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
