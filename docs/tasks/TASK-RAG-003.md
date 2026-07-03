# TASK-RAG-003 — wersjonowanie patternów + per-project best_practices + multi-stack infra (Filar 3)

> **🔓 STATUS: READY (2026-07-02)** — wszystkie 3 twarde prerequisites ODBLOKOWANE:
> (1) TASK-OBS-001 done, (2) Rule Card fix SP3a/SP3b+N4 done (51ef956), (3) eval RAG-002
> przeszedł próg (hit@5=0.85). Projekt szczegółowy: ADR 0005. Nierozpoczęty.

**Źródło:** `docs/tasks/TASK-RAG-002.analysis.md` (status: approved, 2026-07-02) — Filar 3, decyzje D3/D4/D5, odpowiedzi Q5/Q6.
**Prerequisite (twarde):**
1. TASK-OBS-001 done (bez observability żaden dłuższy przebieg nie jest bezpieczny).
2. TASK-AGENT-CONFORMANCE-001: **Rule Card fix (split SP3 + reguła N4)** — warunek D5(a);
   na dzisiejszych kartach bramka best_practices wykluczy dobre pliki (6/8 fałszywych SP3)
   i wpuści złe (N4: `@BusinessRule` bez delegacji — 5/8 agregatów).
3. TASK-RAG-002 (zwężony): eval przeszedł próg — nie rozbudowujemy retrievalu, którego wartość
   nie została udowodniona.

## Zakres

### 0. RESEARCH (przed seedem — zgłoszone przez usera 2026-07-03): korpus konceptów @vytches/ddd
Obecne `library_reference_global` = tylko PRZYKŁADY użycia (129 chunków). Brak wiedzy o API
surface i semantyce modułów biblioteki — dowody: bug VB-003 (forFeature DI wiring — implementerzy
nie znają rejestracji handlerów local-vs-global bus), historyczny ANTI-SPOOF (stara sygnatura
z training data). Research ma rozstrzygnąć PRZED seedem:
- [ ] **Co seedować**: publiczne API (`.d.ts` + JSDoc) + docs/README + kurowane noty konceptowe
      z repo vytches-ddd — raczej NIE surowe internals (ryzyko: agent uczy się deep-importów,
      antywzorzec widziany w feature-handler-registrar.ts).
- [ ] **Model treści**: `kind: concept|api` w istniejącej kolekcji (schema ma kind/tags/level)
      vs osobna kolekcja; rozszerzenie `vytchesLevels` o koncepty mniej/bardziej zaawansowane.
- [ ] **Wersjonowanie chunków**: `lib_version` w payload + reseed przy release biblioteki
      (spięcie z pinem knowledge-pins.json, sekcja 1).
- [ ] **Golden-set biblioteczny**: zapytania o API/koncepty (np. rejestracja handlera w
      forFeature, sygnatura PolicyBuilder.must) — eval PRZED wpięciem, próg jak w RAG-002.
- [ ] **Routing**: kiedy implementer pyta RAG o bibliotekę vs czyta node_modules — reguła
      decyzyjna do sekcji decision-rule implementerów.
- [ ] **Auto-reseed globalnych kolekcji** przy zmianie `patterns/**` (dziś ręczny `seed:global`
      — ta sama klasa dyscypliny, która zawodzi; hook freshness obsługuje tylko kod projektów).

### 1. Wersjonowanie implementacji (Q5)
- [ ] Chunk dostaje `version` + `lib_version` + `status` (`current│deprecated│latest`).
- [ ] Pin per-projekt: **`.claude/config/knowledge-pins.json` W REPO PROJEKTU** — git-tracked,
      wersjonowany razem z kodem, który pinuje, przechodzi przez review.
- [ ] Retrieve zwraca **oba** warianty (current-in-project vs latest) z notką breaking-change →
      agent proponuje, człowiek decyduje.

### 2. best_practices_<project> — deterministyczna bramka (D5)
- [ ] Bramka wejścia: AST `/conformance-check` (zero HARD-RULE) + stabilność git (N dni bez
      rewertu; N = parametr) + proweniencja (commit sha + timestamp).
- [ ] **Inwalidacja:** chunk niesie hash wersji Rule Carda; zmiana karty → re-run bramki nad
      kolekcją (inaczej kolekcja dryfuje od aktualnych reguł).
- [ ] **Sygnał negatywny:** wykluczaj pliki dotknięte później commitami `fix:`/revert.
- [ ] **Zasilanie:** job post-commit/cron, NIE hook postwrite (okno stabilności i tak wymaga
      czasu; bramka AST na każdym Write byłaby kosztowna).

### 3. Multi-stack infra (D4)
- [ ] Schema stack-agnostyczna (pola `stack`/`framework`/`layer` już w `types.ts`) — bez zmian
      schematu przy dodaniu flutter/shared-lib.
- [ ] Seed + eval na start TYLKO nestjs-ddd; inne stacki później.

### 4. Storage (D3)
- Qdrant zostaje (semantyka). Redis ODRZUCONY (wąskie gardło to pętle agentów, nie latencja
  retrievalu). Postgres TYLKO gdy pin JSON zacznie wymagać zapytań relacyjnych — nie spekulacyjnie.

## Kryterium sukcesu (success_criteria filar 3)
Demo „current vs latest" na jednym realnym wzorcu: pin w repo projektu, retrieve zwraca oba
warianty z notką breaking-change.
