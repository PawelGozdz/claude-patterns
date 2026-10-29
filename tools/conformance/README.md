# tools/conformance

Deterministyczny audyt spójności wzorców (AST TypeScript, bez embeddingów i bez Qdranta). Komenda: `/conformance-check`.

## Reguły ciała pliku i ratchet
Oprócz kształtu klasy (`extends`, dekorator) narzędzie sprawdza reguły o CIELE pliku (`bodyRules` w `rules.json`):
`CH-NO-THROW` (zakaz `throw` w całym pliku handlera komendy/zapytania, także w metodach prywatnych) i
`CH-NO-BULLMQ` (zakaz importu `bullmq`/`@nestjs/bullmq` i `@InjectQueue` w handlerze). Zakres to WYŁĄCZNIE
`application/commands|queries/**/handler.ts`; event handlery i procesory BullMQ są poza zakresem (rethrow dla retry jest legalny).

```bash
node <claude-patterns>/tools/conformance/check.mjs --dir src/contexts                 # audyt: cały dług, bez ratchetu
node <claude-patterns>/tools/conformance/check.mjs --changed --ratchet                # tylko to, co zmieniono względem HEAD
node <claude-patterns>/tools/conformance/check.mjs --changed --ratchet --baseline-ref origin/develop
node <claude-patterns>/tools/conformance/check.mjs --changed --ratchet --baseline-ref <sha-startu> --only src/contexts/auth/ --skip <plik-brudny-przed-startem>
```
- **Ratchet:** baseline liczony z COMMITA (domyślnie `HEAD`, nie z drzewa roboczego): klucz = plik + reguła + metoda + hash tekstu
  linii (nie numer linii). Porównanie wielozbiorem, więc 4 nowe `throw` w pliku z 8 starymi to 4 naruszenia, nie 0. Przesunięcie
  linii i dodatkowe spacje nie tworzą nowych naruszeń; przeformatowanie samej linii `throw` liczy się jak jej dotknięcie.
  Nowy plik ma pusty baseline, więc reguły są dla niego twarde. Rename zachowuje baseline pliku (także zwykłe `mv` i zapis nowego pliku
  z usunięciem starego: diff liczony z tymczasowego indeksu, próg podobieństwa gita 50%), ale liczony po STAREJ ścieżce: plik spoza
  zakresu reguł, przeniesiony do `handler.ts`, nie wnosi swoich `throw` jako długu.
- **Wyjątek:** komentarz `// THROW-EXCEPTION: <powód>` / `// QUEUE-EXCEPTION: <powód>` w tej linii lub w bloku komentarzy tuż nad nią,
  albo wpis `exceptions: [{ rule, file, member?, reason }]` w `.claude/conformance.json`. Marker/wpis BEZ powodu nie jest wyjątkiem
  (wpis bez `reason` to błąd konfiguracji, exit 2). Wpis bez trafienia jest zgłaszany jako martwy.
- **Wyjątek dodany w przebiegu blokuje (`exception-new`):** liczy się tylko wyjątek obecny w baseline (komentarz w źródle z `ref` albo wpis
  w `.claude/conformance.json` z `ref`). Wyjątek dopisany po baseline, także do starego `throw`, czeka na zgodę człowieka; zgodą jest commit
  przed przebiegiem. Każda różnica `.claude/conformance.json` względem baseline to osobne ustalenie `CONFIG-CHANGED`.
- **Zakres sondy:** `--only <katalog|plik>` (powtarzalne; katalog pasuje do prefiksu ścieżki albo do segmentu, np. `application/`) i
  `--skip <plik>` (np. pliki brudne przed startem) zawężają reguły ciała pliku. Silnik składa je w kodzie, nie przez model.
  Ścieżki są od korzenia repo; `--dir` jest liczony od bieżącego katalogu. `--only`, który nie dopasował żadnego zmienionego pliku, daje
  ostrzeżenie na stderr i `scope.emptyScope` w JSON (literówka nie może wyglądać jak zielona kontrola).
- **Baseline przypięty:** w przebiegu podawaj `--baseline-ref <SHA startu>`; domyślny `HEAD` przesuwa się po commicie w trakcie przebiegu.
- **Tryb `--dir` (audyt):** reguły ciała pliku też wpływają na kod wyjścia (1), bo nie ma baseline, który odróżniłby dług.
- **Wyłączenie reguły w projekcie:** `bodyRules: [{ "id": "CH-NO-THROW", "disabled": true }]`; zmiana bazowego commita: `baselineRef`.
- **Kody wyjścia:** 0 czysto · 1 naruszenia · 2 błąd użycia/konfiguracji · 3 baseline niedostępny (brak gita / nieznany ref).
- **W `/orchestrate`** to wbudowana kontrola `conformance` w `checks:` warstwy (prepare rozwija ją do komendy powyżej).
- **Ograniczenia:** statyczna analiza jednego pliku; nie wykryje błędu semantycznego u konsumentów ani `throw` ukrytego w wywołanej usłudze.
  Brudne drzewo ze starymi naruszeniami niezacommitowanymi liczy je jako nowe — zacommituj albo ustaw `baselineRef`.

