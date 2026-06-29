# RAG Design — knowledge-retriever MCP server

> Status: DESIGN (do implementacji). Cel: zastąpić statyczne wstrzykiwanie wzorców semantycznym
> retrievalem; killer use-case = retrieval KODU w `/analyze-ddd`. Local-first, GDPR-safe, zero hosted DB.
> Ref: `docs/DECISIONS-LOG.md`, `docs/orchestrate-ddd-design.md`.

## 1. Problem (co naprawiamy)
Dziś retrieval jest regułowy: `/analyze-ddd` wstrzykuje *wszystkie* patterny domenowe + `pattern-routing`
mapuje plik→wzorzec po ścieżce. Skutki: bloat kontekstu (część z 33k always-on), brak recall
(path-routing gubi pasujące wzorce; agent grepuje 6800 plików na ślepo → halucynacje „to nie istnieje").

## 2. Architektura (embedded, in-process — NIE hosted DB)
```
KORPUS → CHUNK → EMBED (lokalnie) → STORE (sqlite-vec, plik) → RETRIEVE (hybrid) → RERANK → INJECT
```
- **Magazyn:** `sqlite-vec` (rozszerzenie SQLite) — jeden plik, czytany in-process przez MCP server. Brak serwera DB. (Alt: LanceDB embedded.)
- **Embeddingi:** lokalne (fastembed/ONNX, model **multilingual** — mamy polskie docs + kod). Kod/PII nie opuszcza maszyny (GDPR).
- **Indeks per-projekt:** `<projekt>/.knowledge/index.db` (gitignored). Patterny/rules claude-patterns → osobny współdzielony indeks.
- **Hybrid:** wektor (semantyka) + BM25 (dokładne identyfikatory: `findByAddress`, `ResidenceTrustAggregate`) → merge.
- **Rerank:** cross-encoder lub LLM-rerank top-20 → top-K (precyzja = mniej tokenów).

## 3. Korpus i chunking
| Źródło | Chunk |
|---|---|
| patterns/*.md + _summary | per sekcja H2/H3 |
| rules/* | per reguła |
| kod (aggregates/handlers/VO/services) | per symbol (AST: klasa/funkcja); fallback: plik z overlap |
| BUSINESS_RULES.yaml | per wpis reguły |
| ADRs + threat-models | per sekcja |

## 4. MCP server `knowledge-retriever` (TypeScript) — narzędzia
```ts
retrieve_patterns(task: string, k=5)
  → { chunks: [{ pattern, section, text, score }] }
retrieve_code(query: string, scope?: string, k=8)
  → { chunks: [{ file, symbol, lines, text, score }] }
retrieve_decisions(task: string, k=5)
  → { chunks: [{ source, type: 'adr'|'threat-model'|'business-rule', text, score }] }
knowledge_reindex(scope?: 'patterns'|'code'|'all')
  → { indexed: number, durationMs: number }
```
Rejestracja: `.mcp.json` (project-scope) → Claude Code wystawia narzędzia agentom (consumer).
Server = provider. Cały w TS.

## 5. Wpięcie w nasze flow
- **`/analyze-ddd` (0.5 + Codebase Facts):** zamiast statycznego wstrzykiwania i ślepego grepu →
  `retrieve_code(task)` (podobne istniejące implementacje) + `retrieve_patterns(task)`. **Killer use-case.**
- **`/orchestrate-ddd` (implementer):** `retrieve_patterns` + `retrieve_code` (wzorcowe istniejące implementacje)
  → mniej błędów typu „stara sygnatura" (bug z ANTI-SPOOF).
- **`pattern-routing` zostaje** jako hard-rule fallback (gwarantowany wzorzec per typ pliku); RAG = semantyczny recall na wierzchu.

## 6. Świeżość indeksu
- **Inkrementalnie:** hook PostToolUse (Write/Edit) → re-embed zmienionego pliku (delta).
- **Pełny re-index:** `knowledge_reindex` (przy setup-project lub on-demand).

## 7. Eval (obowiązkowy — bez tego nie wiadomo czy pomaga)
- Golden set: `task → oczekiwane pliki/wzorce`. Metryki: **precision/recall@K, MRR**.
- End-to-end A/B: statyczne wstrzykiwanie vs RAG — czy grounding poprawił wynik `/analyze-ddd`.

## 8. Fazy
1. **MVP:** flat embeddings + brute-force cosine na patternach (72 pliki — bez DB). Sanity.
2. **Killer:** `retrieve_code` na kodzie (sqlite-vec) — juz-ide-api-1. Zmierz trafność Codebase Facts.
3. **Hybrid + rerank:** BM25 + reranking (precyzja na identyfikatorach).
4. **Integracja + świeżość:** wpięcie w oba flow + inkrementalny indeks (hook).
5. **Eval harness:** golden set + metryki + A/B.

## 9. Trade-offy (uczciwie)
- Patterny (72) to mały korpus — RAG poprawia precyzję/koszt, ale nie jest krytyczny. **Kod (6800 plików) = gdzie RAG świeci.** Tam kieruj wysiłek.
- Koszt: indeks + świeżość + embeddingi = nowa infra (minimalizowana przez local sqlite-vec).
- Zły retrieval gorszy niż statyczny → eval obowiązkowy.

## 10. Domyka luki z oferty pracy
MCP **provider w TS** ✅ · Advanced RAG (chunking/hybrid/rerank/eval) ✅ · TS-agentic ✅ ·
cost/quality (redukcja kontekstu przy mierzonej jakości) ✅ · prywatność (local embeddings, GDPR) ✅.
