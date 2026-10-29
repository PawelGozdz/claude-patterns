# Ostrzeżenie hooka z exit 0 nie dociera do modelu

Data: 2026-10-29 · Zadanie: TASK-AGENT-MANUAL-SPAWN-RULES-001, pkt 4

## Pytanie

Hook `PostToolUse`, który kończy się kodem 0 i pisze ostrzeżenie, kierowałby model do poprawki, gdyby model je widział.
Audyt juz-ide-api-1 podejrzewał, że nie widzi. `check-domain-purity` ostrzegał tylko tak (`console.error`, exit 0).

## Eksperyment

Headless `claude -p --model haiku` z trzema hookami `PostToolUse` na narzędziu `Read`, każdy z innym unikalnym znacznikiem:

| Kanał | Znacznik | Model go zobaczył? |
|-------|----------|--------------------|
| stderr, exit 0 | `MARKER-STDERR-7Q2K` | nie |
| stdout (zwykły tekst), exit 0 | `MARKER-STDOUT-3B8P` | nie |
| `hookSpecificOutput.additionalContext`, exit 0 | `MARKER-CTX-9X4M` | tak |

Dwa przebiegi, drugi z odwróconą kolejnością hooków. Wynik ten sam. Model miał wypisać każdy ciąg `MARKER-`,
jaki widzi w rozmowie. Dokumentacja Claude Code mówi to samo: stderr hooka z exit 0 nie trafia do Claude'a,
`additionalContext` z `PostToolUse` jest dodawany do kontekstu obok wyniku narzędzia.

Ograniczenia: dwa przebiegi na jednym modelu (Haiku). Nie sprawdzono, czy zachowanie różni się dla subagenta.

## Decyzja

1. Ostrzeżenia `check-domain-purity` idą przez `additionalContext`. Dotychczasowe ostrzeżenia były niewidoczne dla modelu,
   więc przyczyną braku poprawek była droga dostarczenia, a nie brak blokady.
2. `check-domain-purity` nadal nie blokuje. Blokada (exit 2) przy długu sprzed zadania wywołałaby pętle: pomiar
   z 2026-10-29 pokazuje 33 `throw` w 15 plikach juz-ide-api-1 i 11 w 2 plikach marketing-hub. Do rozważenia jako ratchet
   względem HEAD (jak `conformance`), nie jako bezwarunkowy blok.
3. Reguła dla nowych hooków doradczych: komunikat dla modelu idzie przez `additionalContext`. Stderr jest dla człowieka.
   Test hooka sprawdza kanał, który model faktycznie widzi (`expect_context` w `tests/flow-evals/hooks`), a nie stderr.

## Nieweryfikowane

- Czy `Agent` wywołany wewnątrz skryptu Workflow uruchamia `PostToolUse` głównej sesji. Dokumentacja milczy.
  Skutek w najgorszym razie: zbędne przypomnienie `remind-verifier-after-manual-implementer` dla implementera silnika.
