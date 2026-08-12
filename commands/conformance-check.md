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
1. Ustal `<src-dir>` (arg lub `src/`). Narzędzie ma STAŁĄ, znaną lokalizację w tym lokalnym
   setupie: `/opt/projects/claude-patterns/tools/conformance/` — NIE odkrywaj jej przez
   `ls`/`find`/`cd` (patrz "Ważne o komendach Bash" niżej), po prostu użyj tej ścieżki wprost.
2. `node_modules` (`typescript`) jest już zainstalowane raz, współdzielone przez wszystkie
   projekty — nic nie trzeba instalować per-projekt. Jeśli `check.mjs` zgłosi
   `MODULE_NOT_FOUND`, dopiero wtedy napraw JEDNĄ atomową komendą (nie w ramach zwykłego
   uruchomienia, osobny krok naprawczy):
   ```bash
   npm install --prefix /opt/projects/claude-patterns/tools/conformance
   ```
3. Uruchom DOKŁADNIE tę jedną, niełańcuchowaną komendę (pełna ścieżka, żadnego `cd`, `&&`, `||`):
   ```bash
   node /opt/projects/claude-patterns/tools/conformance/check.mjs --dir <src-dir>
   ```
   (flagą `--json` dla maszynowego wyjścia / CI.)
4. Zinterpretuj raport:
   - **HARD-RULE violations** — naruszenia jawnych reguł (agregat/VO/handler/repo nie ma oczekiwanego
     `extends`/dekoratora). To do naprawy.
   - **CONSISTENCY outliers** — odstępstwa od większości (emergentny rozjazd konwencji). Do przeglądu:
     albo wyrównać do większości, albo (jeśli celowe) udokumentować w ADR.
5. Wynik: lista `file:line` z „found vs expected/majority". Exit 1 gdy są hard-violations (przydatne w CI).

## Ważne o komendach Bash

NIE łącz komend przez `&&`/`||`/`;` (np. `ls X && echo found || find / ...`) — permission-model
projektów (np. `.claude/settings.json` allow-listy typu `Bash(ls:*)`, `Bash(node:*)`) dopasowuje
PREFIKS całej komendy. Dla łańcuchowanej komendy to dopasowanie zawodzi nawet gdy każdy segment
osobno jest dozwolony (celowe zabezpieczenie — inaczej `ls && rm -rf /` przeszłoby tylko dlatego,
że zaczyna się od `ls`), więc pojawia się prompt o zgodę, który w niektórych środowiskach (np. bez
interaktywnego operatora) kończy się odmową — powtarzalnie, nawet przy ponownej próbie tej samej
komendy. Zawsze wywołuj `check.mjs` jako pojedynczą, prostą komendę z pełną ścieżką (patrz krok 3).

## Konfiguracja
- Domyślne reguły: `tools/conformance/rules.json` (z `rules/nestjs-ddd` + decision cards).
- Override per-projekt: `.claude/conformance.json` (merge po `kind`) — gdy projekt ma własne base-classy.

## Kiedy używać
- Przed sprintem / w CI — wykryć drift konwencji w 6800-plikowym DDD.
- Komplement do hooków `check-ddd-patterns`/`check-domain-purity` (te per-edit; to — całe repo naraz).

## Publikacja wyniku na kanał broadcastu (ADR 0006, D10 — opcjonalne)

Jeśli projekt ma `.claude/config/broadcast.yml`: wynik tego audytu jest **deterministyczny**
(AST, jawnie bez RAG), więc kwalifikuje się jako `class: deterministic` — jedyna klasa,
która może tworzyć taski automatycznie (D5).

Publikuj **wyłącznie naruszenia HARD-RULE**. `MAJORITY-OUTLIER` to sygnał interpretacyjny
o charakterze „warto się przyjrzeć" i publikowanie go zalałoby kanał hałasem — a kanał,
którego agenty przestaną czytać, jest gorszy niż brak kanału. Bez manifestu pomiń ten krok.

```bash
node "$HOME/.claude/hooks/lib/broadcast/cli.js" emit \
  --topic <repo>/contracts --kind discovery --class deterministic \
  --severity important \
  --title "conformance: <N> naruszeń HARD-RULE" \
  --body "<reguła + file:line, maks. kilka najważniejszych>" \
  --paths <pliki z naruszeniami>
```
