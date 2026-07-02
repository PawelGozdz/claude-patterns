# ADR 0005 — RAG-003: storage (Qdrant-only, pin w repo) + deterministyczna bramka best_practices

**Status**: accepted (2026-07-02, implementacja w TASK-RAG-003) · **Źródło**: `docs/tasks/TASK-RAG-002.analysis.md` (D3, D5, Q5/Q6)

## Kontekst
RAG-003 dodaje: wersjonowanie implementacji (current-in-project vs latest, breaking-change aware),
per-projektowe `best_practices_<project>` i infrastrukturę multi-stack. Pytania: czy dokładać
bazy (Postgres/Redis)? Skąd brać „wzorcowy" kod, skoro LLM-verifier jest niewiarygodny
(CONFORMANCE §2: przeoczenia przy częściowym czytaniu, weryfikacja nieistniejącego kodu)?

## Decyzja

### D-A — Storage: Qdrant zostaje sam; Redis odrzucony; Postgres odroczony
Wąskim gardłem są pętle agentów, nie latencja retrievalu — cache/Redis nic nie naprawia.
Metadane wersjonowania zaczynają jako **pin JSON W REPO PROJEKTU**:
`.claude/config/knowledge-pins.json` — git-tracked, wersjonowany razem z kodem, który pinuje,
przechodzi przez review jak każda zmiana. Postgres dopiero, gdy pin zacznie wymagać zapytań
relacyjnych (nie spekulacyjnie). Zgodne z local-first z `docs/rag-design.md`.

### D-B — Wersjonowanie w chunkach
Chunk dostaje `version` + `lib_version` + `status` (`current│deprecated│latest`). Retrieve zwraca
**oba** warianty (current-in-project vs latest) z notką breaking-change — agent proponuje,
człowiek decyduje.

### D-C — best_practices_<project>: bramka DETERMINISTYCZNA, nie LLM i nie ręczna kuracja
Wejście do kolekcji wyłącznie przez:
1. **AST `/conformance-check`** — zero naruszeń HARD-RULE (offline, powtarzalny),
2. **stabilność git** — plik nietknięty/nierevertowany N dni (battle-tested),
3. **proweniencja** — commit sha + timestamp w payload.

Warunki domykające:
- **(a) PREREQUISITE:** Rule Card fix (SP3a/SP3b + N4) PRZED pierwszym seedem — na starych kartach
  bramka wykluczałaby dobre pliki (6/8 fałszywych SP3) i wpuszczała złe (N4: dekorator
  `@BusinessRule` bez delegacji — 5/8 agregatów). **Wykonany 2026-07-02 (commit 51ef956).**
- **(b) INWALIDACJA:** chunk niesie hash wersji Rule Carda; zmiana karty → re-run bramki nad kolekcją.
- **(c) SYGNAŁ NEGATYWNY:** wykluczaj pliki dotknięte później commitami `fix:`/revert.
- **(d) ZASILANIE:** job post-commit/cron, NIE hook postwrite (okno stabilności wymaga czasu;
  AST na każdym Write byłby kosztowny).

## Odrzucone
- **Redis** — cache nie adresuje realnego wąskiego gardła; kolejna baza do utrzymania.
- **Postgres od startu** — spekulacyjne; pin JSON pokrywa potrzeby MVP i jest review'owalny.
- **best_practices z werdyktów `code-quality-verifier`** — pojedynczy self-reportujący Sonnet
  z udokumentowanymi przeoczeniami jako źródło „wzorcowości" = zatruta kolekcja.
- **Ręczna kuracja** — nie skaluje się i nie jest powtarzalna/wersjonowalna.

## Konsekwencje
- (+) Wzorcowość = właściwość sprawdzalna i odtwarzalna (AST + git), niezależna od nastroju modelu.
- (+) Pin w repo = wersjonowanie decyzji o wersjach razem z kodem.
- (−) Bramka jest tylko tak dobra jak Rule Cards — każda nowa karta wymaga przeglądu pod kątem
  fałszywych trafień (patrz audyt SP3).
- (−) Okno stabilności N dni opóźnia wejście świeżych, dobrych implementacji do kolekcji (celowo).
