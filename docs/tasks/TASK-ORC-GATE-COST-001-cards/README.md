# Szkice kart B z pamięci bramki końcowej (TASK-ORC-GATE-COST-001, E4)

To **szkice do przejęcia przez juz-ide-api**, nie pliki działające w claude-patterns. Powód: dowody pochodzą z jednego projektu, więc
wg reguły repo wzorzec jest `project-specific`, a jego miejsce to `.claude/knowledge/patterns-local/` w juz-ide-api (wersjonowane z
repo, wspólne dla instancji). Do promocji do `patterns/` potrzebny jest drugi niezależny adopter.

## Pilotaż (gotowy)
- `migration-release-safety-pattern_summary.md`: karta reguł MG1–MG7, N1–N3 (448 słów, 3308 znaków, ok. 945 tokenów, szacunek znaki/3,5).
- `migration-release-safety-pattern.md`: pełny wzorzec (kiedy używać, incydenty), czytany tylko na żądanie.

## Jak to wpiąć (po stronie juz-ide-api)
Wzór produkcyjny: iam (`/opt/projects/iam/.claude/config/runtime.yml`, linie 18–19).
1. Skopiuj oba pliki do `.claude/knowledge/patterns-local/` (bez zmiany nazw: resolver szuka karty jako `<temat>-pattern_summary.md` obok wzorca).
2. Wpisz wzorzec w blok projektu (project.yml), np. `patterns.triggers` ze słowami `migration, backfill, expand, contract, drop column`
   i ścieżką `.claude/knowledge/patterns-local/migration-release-safety-pattern.md` (ścieżka od `.` jest liczona od korzenia projektu).
3. `materialize-runtime` i `verify-project-setup` (sprawdza, że wpis nie wisi).
4. Sprawdź, że `patterns-local/` nie jest w `.gitignore` (pułapka z innych projektów flotowych).

## Co dalej
Pozostałe grupy B (klasyfikacja w `TASK-ORC-GATE-COST-001.md`, sekcja „E4, krok 1") robić według tego wzoru, po jednej grupie, i
mierzyć rozmiar PRZED dopisaniem: limit ok. 3 tys. tokenów na start implementera obejmuje wszystkie karty warstwy razem.
