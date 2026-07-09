# TASK-AGENTS-AUDIT-001 — Audyt aktualności istniejących agentów i skilli

**Status: TODO** · **Źródło:** sesja 2026-07-07 (przy okazji budowy panelu code-review —
`reviewer-*`, `review-panel`, `pr-ops`, `api-contract-sync`)

## Problem

Podczas tej sesji, przy aktualizacji `agents/README.md`, `commands/README.md` i
`patterns/README.md`, znaleziono kilka liczników/tabel niespójnych ze stanem faktycznym
(np. `patterns/README.md` deklarował "Cross-Layer Patterns (4 patterns)" przy 5 realnie
zaindeksowanych plikach + 1 kolejny w ogóle brakujący z indeksu —
`cross-layer/security-invariants-pattern.md` istniał w katalogu, ale nie był wypisany).
To sugeruje, że mogą istnieć inne miejsca w repo, gdzie dokumentacja (README, liczniki,
tabele) rozjechała się z rzeczywistą zawartością katalogów, a same agenty/skille mogą
odwoływać się do nieistniejących już plików/narzędzi.

**Nie zrobiono tego w tej sesji celowo** — zakres byłby zbyt szeroki obok właściwego zadania
(panel code-review + PR-ops + api-contract-sync).

## Faza 1 — inwentaryzacja (punkt wyjścia)

- [ ] Dla każdego katalogu z licznikiem w nazwie sekcji README (`agents/README.md`,
      `commands/README.md`, `patterns/README.md`, root `README.md`) — policzyć realne pliki
      (`find`/`ls`) i porównać z deklarowaną liczbą; poprawić rozjazdy.
- [ ] Grep za wewnętrznymi odnośnikami (`agents/`, `skills/`, `patterns/` linkujące do
      innych plików w tym repo) i sprawdzić, czy cel istnieje — złapać martwe linki.
- [ ] Dla agentów/skilli z `tools:`/`allowed-tools:` wymieniającymi konkretne narzędzia MCP
      (np. `mcp__zen__*`, `mcp__context7__*`) — sprawdzić, czy te MCP są nadal
      skonfigurowane/istnieją w bieżącym setupie, czy to relikt.
- [ ] Sprawdzić `presets/*.yml` (`nestjs-ddd.yml`, `flutter-clean-arch.yml`) pod kątem
      odwołań do agentów/wzorców, które mogły zostać przemianowane lub usunięte.

## Faza 2 — decyzje (po inwentaryzacji)

- [ ] Dla każdego martwego odnośnika/nieaktualnego licznika: napraw (jeśli trywialne) albo
      opisz jako osobny wpis do naprawienia.
- [ ] Rozważyć automatyzację (skrypt licząc pliki per-katalog i porównujący z README) jako
      przy okazji tej naprawy, żeby to się nie rozjechało ponownie.

## Zasada

Liczniki/tabele w README to dokumentacja, nie źródło prawdy — bez automatycznej weryfikacji
będą dryfować przy każdej zmianie zawartości katalogu. Ten task jest punktem wejścia do
uporządkowania tego długu, nie pełną specyfikacją rozwiązania.
