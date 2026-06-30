---
name: conformance-check
description: |
  Audyt SPÓJNOŚCI wzorców w kodzie (deterministyczny, AST — NIE RAG/embeddingi).
  Wykrywa: (1) HARD-RULE — np. agregat nie extends AggregateRoot (wg rules/nestjs-ddd
  + decision cards); (2) MAJORITY-OUTLIER — np. 23/24 agregaty extends X, 1 nie.
  Raport file:line. Działa offline, bez Qdrant/CT 301.

  Usage: /conformance-check [<src-dir>]   (domyślnie src/)
  Alias: /conf [<src-dir>]

  Examples:
    /conformance-check src/contexts
    /conf
tools: Bash, Read
---

# /conformance-check — audyt spójności wzorców (AST)

Odpowiada na: „czy gdzieś używamy `extends AggregateRoot`, a w innym miejscu nie?". To audyt
konformności, NIE semantyczny retrieval — deterministyczna analiza AST (TS compiler).

## Kroki
1. Ustal `<src-dir>` (arg lub `src/`). Ustal ścieżkę do narzędzia w claude-patterns:
   `<CLAUDE_PATTERNS>/tools/conformance/` (np. przez `.claude/knowledge` symlink lub znaną lokalizację repo).
2. Jednorazowo: `npm install` w `tools/conformance/` (potrzebny `typescript`).
3. Uruchom:
   ```bash
   node <CLAUDE_PATTERNS>/tools/conformance/check.mjs --dir <src-dir>
   ```
   (flagą `--json` dla maszynowego wyjścia / CI.)
4. Zinterpretuj raport:
   - **HARD-RULE violations** — naruszenia jawnych reguł (agregat/VO/handler/repo nie ma oczekiwanego
     `extends`/dekoratora). To do naprawy.
   - **CONSISTENCY outliers** — odstępstwa od większości (emergentny rozjazd konwencji). Do przeglądu:
     albo wyrównać do większości, albo (jeśli celowe) udokumentować w ADR.
5. Wynik: lista `file:line` z „found vs expected/majority". Exit 1 gdy są hard-violations (przydatne w CI).

## Konfiguracja
- Domyślne reguły: `tools/conformance/rules.json` (z `rules/nestjs-ddd` + decision cards).
- Override per-projekt: `.claude/conformance.json` (merge po `kind`) — gdy projekt ma własne base-classy.

## Kiedy używać
- Przed sprintem / w CI — wykryć drift konwencji w 6800-plikowym DDD.
- Zasila `@code-quality-verifier` (VETO: nie wprowadzaj rozjazdu) i `/analyze-ddd` (poznaj realne konwencje).
- Komplement do hooków `check-ddd-patterns`/`check-domain-purity` (te per-edit; to — całe repo naraz).
