# ADR 0004 — Eval modularny: piramida L1/L2/L3 z deterministycznymi scorerami + bramka eval-przed-wpięciem

**Status**: accepted (2026-07-02) · **Źródło**: `docs/tasks/TASK-RAG-002.analysis.md` (D7) + prośba użytkownika o możliwość poprawiania każdego etapu flow bez ruszania pozostałych · **Implementacja**: `tests/flow-evals/` (commity 8d5c700, 51ef956)

## Kontekst
Flow (hooki → panel analizy → implementery → weryfikatory → retrieval) był oceniany wyłącznie
end-to-end: każda zmiana komponentu wymagała drogiego pełnego przebiegu, a regresje pojedynczych
elementów były niewykrywalne w izolacji. Dodatkowo `rag-design.md` §9: **zły retrieval jest gorszy
niż statyczne wstrzykiwanie** — wpięcie RAG bez pomiaru to hazard.

## Decyzja

### Piramida ewaluacji analogiczna do piramidy testów (L1 ~50% / L2 ~30% / L3 ~20%)
- **L1 — deterministyczne, tanie, CI-owalne, przy każdej zmianie komponentu:**
  - hooki: fixtures stdin→stdout (payload → oczekiwana decyzja pass/deny) — `tests/flow-evals/hooks/run.js`;
  - Rule Cards / AST-checker: labeled corpus (35 plików z audytu CONFORMANCE §1 = gotowy ground
    truth) → precision/recall per rule ID;
  - retrieval: golden-set → hit@1/hit@K/MRR — `tests/flow-evals/retrieval/run.js`.
- **L2 — pojedynczy agent w izolacji, deterministyczny scorer, przy zmianie promptu agenta:**
  weryfikatory na korpusie seeded-bugs (wstrzyknięte znane naruszenia → czułość; czyste pliki →
  false positive rate); implementery: bounded task, output oceniany przez AST `/conformance-check`
  (deterministyczny sędzia, nie „Sonnet ocenia Sonneta"); etapy panelu: replay z nagranym wejściem
  → kontrakt wyjścia.
- **L3 — end-to-end benchmark (drogi, rzadki):** realny task przez `/orchestrate-ddd` z pomiarem
  czasu/tokenów/jakości (conformance-check na wyniku).

### Bramka eval-przed-wpięciem
Nowy komponent retrievalu wchodzi do flow DOPIERO po przekroczeniu progu na golden-secie
(hit@5 ≥ 0.6; runner zwraca exit 0/1 → bramka jest maszynowa). Zastosowane: retrieve_patterns
wpięty po wyniku hit@1=0.55 · hit@5=0.85 · MRR=0.66 (n=20).

### Warunek architektoniczny
Każdy etap ma jawny kontrakt wejście→wyjście strukturalne (werdykty przez `schema`/StructuredOutput)
— bez tego nie ma czego replay'ować ani scorować. To wiąże ten ADR z mitygacjami CONFORMANCE §3.

## Odrzucone
- **LLM-judge jako podstawowy scorer** — niedeterministyczny, drogi, nie nadaje się na bramkę CI;
  dopuszczalny tylko jako uzupełnienie (np. ECC `agent-evaluator`).
- **Wyłącznie eval end-to-end** — nie lokalizuje regresji; koszt uniemożliwia częste uruchamianie.
- **Wpięcie RAG przed pomiarem** (pierwotna kolejność w RAG-002) — sprzeczne z §9 rag-design.

## Konsekwencje
- (+) Poprawa jednego komponentu = uruchomienie tylko jego evala; regresje widoczne natychmiast.
- (+) Golden-set rośnie z realnych przebiegów (miss → nowy wpis).
- (−) Korpusy L2 (seeded-bugs) jeszcze nie istnieją — do zbudowania przy pracach nad
  wiarygodnością weryfikatora; do tego czasu L2 jest luką piramidy.
