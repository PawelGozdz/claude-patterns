# TASK-RAG-002 — knowledge-retriever: adopcja + dywersyfikacja + wielo-kolekcyjny model treści

**Branch:** TBD · **Poprzednik:** `docs/tasks/TASK-RAG-001.md` (MVP: `retrieve_code` + `knowledge_reindex`, DONE) · **Kontekst:** wynik sesji 2026-07-01 (feedback z realnego użycia w `juz-ide-api-1`, patrz `docs/DECISIONS-LOG.md`)

## Cel
`retrieve_code` (MVP z TASK-RAG-001) ma zero adopcji w realnych przebiegach `/orchestrate-ddd` —
i osobno, obecny model "jedna kolekcja kodu per projekt" nie pokrywa potrzeby na wzorce/reguły/
przykłady/antywzorce/referencje biblioteczne z RAG. Ten task naprawia oba, w kolejności rosnącego nakładu.

## Diagnoza (ustalona w sesji, nie zgadywanie)

1. **Przyczyna zerowej adopcji (potwierdzona w kodzie)**: `domain-application-implementer.md` i
   `infrastructure-testing-implementer.md` (`agents/stacks/nestjs-ddd/implementers/`) mają w
   `tools:` frontmatterze `Read, Write, Edit, MultiEdit, Glob, Grep, LS, Task` — **`mcp__knowledge-retriever__retrieve_code`
   nie jest na liście**. Subagent fizycznie nie ma dostępu do narzędzia, niezależnie od instrukcji
   w promptcie "spróbuj X, jak niedostępne to grep". Potwierdzone przez audyt 11 transkryptów z
   dwóch przebiegów Workflow w `juz-ide-api-1`: string `retrieve_code` pojawia się wyłącznie jako
   tekst promptu, nigdy jako `tool_use`.
2. **Co już działa, nie trzeba budować od nowa** (sprawdzone czytając `src/*.ts`):
   - `Hit.text` już zwraca pełny tekst chunku (kod metody/klasy), nie tylko `file:line` —
     "gotowy snippet" z feedbacku już istnieje.
   - `k` domyślnie = 8, więc multi-hit już jest.
3. **Realne luki**:
   - Brak dywersyfikacji top-K — Qdrant zwraca top-8 wektorowo najbliższych, co przy bardzo
     podobnym kodzie (np. booking/quick-jobs/local-shares) może dać N wariantów jednego pliku
     zamiast próbki z różnych kontekstów. To dokładnie błąd złapany ręcznie w sesji: różne handlery
     miały niespójne kopie tego samego wzorca, bo agent widział tylko jeden przykład naraz.
   - Brak świeżości — indeksowanie to pełny rebuild na żądanie (`knowledge_reindex`/reseed), zero
     inkrementalnego reindexu. Sesja z wieloma równoległymi agentami edytującymi ~20 plików
     pokazywałaby stan sprzed zmian innego agenta.
   - `retrieve_patterns`, o którym mówią `commands/analyze-ddd.md`/`orchestrate-ddd.md`, **nie istnieje
     jako tool w MCP** (`src/index.ts` eksponuje tylko `retrieve_code` + `knowledge_reindex`) — luka
     dokumentacja-vs-rzeczywistość.
   - Instrukcja "spróbuj X, jak niedostępne to grep" brzmi jak zachęta do defaultowania na grep —
     brak jawnej reguły decyzyjnej kiedy RAG ma faktyczną przewagę (nieznana dokładna nazwa symbolu)
     vs kiedy nie (prompt już podaje dokładną nazwę do skopiowania — grep szybszy i pewniejszy).

## Faza A — Naprawa adopcji (małe, wysoka dźwignia)
- [x] Dodać `mcp__knowledge-retriever__retrieve_code` do `tools:` w `domain-application-implementer.md`
      i `infrastructure-testing-implementer.md`.
- [x] Przeformułować instrukcję z "spróbuj X, fallback grep" na jawną regułę: nieznana dokładna
      nazwa symbolu/pliku → `retrieve_code`; znana dokładna nazwa do skopiowania → prosto do
      Read/Grep (nie tracić roundtripu bez przewagi). (obie instrukcje nie miały wcześniej ŻADNEJ
      wzmianki o `retrieve_code` — dodano nową sekcję przy PHASE 1, nie było czego przeformułować.)

## Faza B — Mechanika retrievalu
- [x] Diversity-aware top-K w `store-qdrant.ts::search` — natywny Qdrant `searchPointGroups`
      (`group_by:'source'`, `group_size: maxPerSource=2` domyślnie), spłaszczone + posortowane +
      przycięte do `k`. Domyślnie włączone (`diversify=true`), opcjonalny `filter`.
- [x] Freshness: `POST /reindex-file {file, collection}` (REST, nie MCP tool) w `index.ts` →
      `indexer.ts::reindexFile` (`deleteBySource` + chunk + embed + `add()`, zapisuje `indexedAt`
      w payloadzie). Hook `hooks/knowledge-freshness-postwrite.js` (opt-in per projekt, NIE w
      globalnym `hooks.json` — patrz `hooks/README.md`).

## Faza C — Wielo-kolekcyjny model treści (większy nakład, po potwierdzeniu adopcji z Fazy A)

| Kolekcja | Zasięg | Treść | Dlaczego osobno |
|---|---|---|---|
| `code_<project>` | per-projekt | realny, bieżący kod (jak dziś) | zmienia się często, może zawierać dryf/bugi |
| `best_practices_<project>` | per-projekt | kurowany podzbiór realnego kodu oznaczony jako wzorcowy (np. pliki, które przeszły `code-quality-verifier` z zerem naruszeń) | realny kod projektu, ale tylko sprawdzony |
| `patterns_global` | globalna (claude-patterns) | Rule Cards + pełne `*-pattern.md`, chunkowane per reguła/sekcja | identyczne dla każdego projektu — nie duplikować n razy |
| `library_reference_global` | globalna | `@vytches/ddd` (+ kombinacje z innymi bibliotekami, np. Zod) — przykłady proste/średnie/złożone + **antywzorce jako osobne, oznaczone chunki** | domyka lukę `retrieve_patterns` i daje "drzewo decyzyjne + przykłady + antywzorce" |

Schemat chunku — rozszerzyć `types.ts` (`Chunk`/`Hit`) o: `kind` (`code│rule_card│example│anti_pattern`),
`tags` (`library`, `framework`, `layer`), dla przykładów `level` (`simple│medium│complex`), `indexed_at`.

Tool surface: rekomendacja — 2-3 nazwane toole zamiast jednego fan-outu: `retrieve_code` (per projekt,
jak dziś), `retrieve_patterns` (global, domyka istniejącą lukę dokumentacyjną), opcjonalnie
`retrieve_examples` (`level`, `anti_patterns: bool`) — zamiast jednego uniwersalnego multi-collection
tool, bo to odpowiada temu, jak agent faktycznie formułuje zapytanie.

**Status (sesja `compiled-mixing-pie.md`, 2026-07-01): kod napisany, DONE.**
- [x] `types.ts` — `Chunk`/`Hit` + `kind`/`tags`/`level`/`indexedAt`.
- [x] `schema.ts` (nowy) — rejestr kolekcji + `PAYLOAD_INDEX_FIELDS`.
- [x] `migrate.ts` (nowy) — idempotentna migracja (create-if-missing + payload indexes; `--force` = drop+recreate).
- [x] `store-qdrant.ts` — UUID v5 id scheme (fix bugu ID sekwencyjnego), `deleteBySource`,
      `ensurePayloadIndexes`, diversity-aware `search()`.
- [x] `markdown-chunker.ts` (nowy) — H2/H3 split, `anti_pattern` detekcja (EN/PL), tagi ze ścieżki.
- [x] `global-indexer.ts` (nowy) — `buildPatternsIndex()` (patterns/**+rules/** → `patterns_global`),
      `buildExamplesIndex()` (`@vytches/ddd` examples → `library_reference_global`, poziomy z nowego
      `global.config.json`).
- [x] `indexer.ts::reindexFile` — freshness, per-plik.
- [x] `index.ts` — toole `retrieve_patterns`/`retrieve_examples` + REST `POST /reindex-file`.
- [ ] **NIE wykonane w tej sesji** (zamierzone, zgodnie z planem): `npm install` (dodać `uuid`),
      `npm run build`, `migrate.ts` na żywym Qdrancie, seed (`buildPatternsIndex`/`buildExamplesIndex`),
      smoke-test realnych trafień. Osobny krok — patrz plan `compiled-mixing-pie.md`.
- [ ] **Świadomie odłożone** (poza zakresem): seed `best_practices_<project>` (brak danych
      źródłowych w tym repo — kolekcja tylko zarejestrowana w `schema.ts`); wpięcie
      `retrieve_patterns`/`retrieve_examples` w treść `commands/analyze-ddd.md`/`orchestrate-ddd.md`
      (tool już wywoływalny, wpięcie w prompt flow to osobna zmiana po weryfikacji jakości danych).

## Restrukturyzacja zakresu (2026-07-02 — `TASK-RAG-002.analysis.md` status: approved)

Zakres tego taska ZWĘŻONY do „udowodnić wartość" — kolejność **eval PRZED wpięciem**
(rag-design §9: zły retrieval gorszy niż statyczny):
- [ ] **Seed**: `npm install` (uuid) + build + `migrate.ts` na żywym Qdrancie +
      `buildPatternsIndex`/`buildExamplesIndex` + smoke-test realnych trafień.
- [ ] **Eval OFFLINE**: golden-set 15-20 par wygenerowany półautomatycznie z historii git
      `juz-ide-api-1` (zamknięte taski → pliki z ich commitów = ground truth; człowiek tylko
      przegląda) + precision/recall@K + MRR + **delta kosztu tokenów** vs statyczna injekcja.
      Próg wpięcia: precision@5 ≥ 0.6 (parametr).
- [ ] **Wpięcie** `retrieve_patterns` w `/analyze-ddd` (0.5/0.6) **DOPIERO po przekroczeniu progu**.
- [ ] Harness `tests/flow-evals/` (D7, eval modularny) — tu startuje część L1-retrieval.

Wersjonowanie / per-project `best_practices` / multi-stack → **`TASK-RAG-003.md`**.
Kolejność ogólna: `TASK-OBS-001` → `TASK-AGENT-CONFORMANCE-001` → ten task → `TASK-RAG-003`.

## Uwaga
Osobny, nienaprawiony w tej sesji problem: `/orchestrate-ddd` Workflow (implementacja +
weryfikacja przez `code-quality-verifier`/`security-e2e-verifier`) potrafi padać godzinami i
zjadać miliony tokenów bez ukończenia (obserwowane w `juz-ide-api-1`, task
TS-SEC-VERIFICATION-LEVELS-002 — 4 przebiegi, ~5.2M tokenów, zero ukończonych weryfikacji).
Częściowo wyjaśnione (SubagentStop hook `check-subagent-pattern-reads.js` wymusza kosztowną
"reconciliation pass" na implementerach), częściowo NIE (weryfikatory milkną w środku wywołania
Bash bez śladu hooka/błędu — prawdopodobnie poziom silnika Workflow, poza zasięgiem repo).
Rozmyślnie odłożone — osobny task, osobna sesja.
