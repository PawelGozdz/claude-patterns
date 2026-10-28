# Historia promptów: komendy i skille

Ten plik trzyma daty i anegdoty, które usunięto z treści komend i skilli. Prompt mówi, CO robić;
tutaj jest DLACZEGO i KIEDY. Czyta go człowiek, model go nie ładuje. Przeniesiono sens, nie
dosłowne zdania.

| Plik | Przeniesiony fragment | Data / źródło |
|------|-----------------------|---------------|
| `commands/analyze.md` (telemetria, krok 3.a) | Przed ADR 0015 D5 PAUSE kończył przebieg jako `halted`: 61 z 62 przebiegów było liczone jako przerwane, więc zaplanowane zatrzymanie wyglądało jak awaria. Stąd osobny wynik `ok` dla PAUSE. | stan na 2026-10-24, ADR 0015 D5 |
| `commands/analyze.md` (krok 4) | Do tej daty skrzynkę `docs/tasks/_inbox/` karmił wyłącznie `/orchestrate`. Błędy kompozycji, które w analizie degradowały po cichu, tam nie trafiały. Przykład: blokujący stage pomijany, bo inny stage zapisał już jego plik `output:` (projekt aegis-flow, wykryte dopiero ręcznie). | 2026-10-10 |
| `commands/grantflow.md` (`setup`) | Logowanie email+hasło zniknęło z grant-flow razem z zadaniem TS-SSO-023. | 2026-08-24, TS-SSO-023 |
| `commands/incident.md` (zapisy) | `Write` był zabroniony do tej daty. Skill nie mógł wykonać własnego ostatniego kroku (zapis postmortemu), więc dodano `Write` i `Edit` z zamkniętą listą dwóch plików. | 2026-08-14 |
| `commands/threat-model.md` (zapisy) | `Edit` i `Bash` były zabronione, a kroki 7a' i 7b skilla to edycje istniejących plików. `Write` był przy tym otwarty, więc zakaz niczego nie chronił, a tylko zmuszał do nadpisania rejestru albo pominięcia kroku. Zmiana: dozwolono `Edit` i `Bash` (to tylko odczyt). | 2026-08-14 |
| `skills/design-system/flutter-theme/SKILL.md` | Golden test `JuzIdeTheme` powstał w fazie 5 części A wdrożenia; generator `generate-dart.ts` sprawdzono ręcznie pod kątem zakresu eksportu (kolor, typografia, odstępy, statusy, bez animacji i cieni). | 2026-09-26 i 2026-09-27, `wdrozenie/POSTEP.md` |
| `skills/design-system/ui-patterns/SKILL.md` | Wzorce ekranów zatwierdził użytkownik w bramce decyzyjnej fazy 2. Wzorzec „Powłoka aplikacji” zatwierdzono osobno. Lista „Znane odstępstwa” to stan po audycie `/design-audit` na `marketing-hub` i `grant-flow`; ekran `UsersAndRolesScreen` naprawiono tego samego dnia. | 2026-09-26 (wzorce), 2026-10-02 (powłoka), 2026-10-03 (audyt i naprawa) |
| `skills/flutter/flutter-brand-motion/SKILL.md` | Decyzja „miękki kierunek” (soft direction) w BRAND.md zastąpiła kierunek brutalistyczny. Notka o statusie tokenów ruchu: pakiet `juz_ide_tokens` jeszcze ich nie eksportował (sprawdzone w `generate-dart.ts`). | 2026-07-06 (decyzja), 2026-09-27 (status tokenów) |
| `skills/meta/add-pattern/SKILL.md` | Uzasadnienie istnienia skilla: karta reguł geo-spatial z 13 regułami nie miała żadnego nagłówka `## `, `markdown-chunker` nie zrobił z niej chunka, a reseed mimo to raportował sukces. W tym czasie implementerzy w juz-ide-api-2 wykonali 126 grepów, szukając wiedzy z tej karty. | 2026-08-14 |
| `skills/orchestration/pulse/SKILL.md` | Zakaz uruchamiania agentów w tle z własną etykietą: etykieta to alias wyświetlany, nie prawdziwy ID zadania, więc odczyt wyniku po etykiecie kończył się błędem „No task found with ID”. | zaobserwowane 2026-07-04 |
| `commands/review-panel.md` (zapisy) | `Write` i `Edit` były zabronione do 2026-08-14, co blokowało fazę 4 (zastosowanie zatwierdzonych poprawek) i fazę 5 (zapis snapshotu), więc tryb przyrostowy nigdy nie mógł się włączyć. Strażnikiem jest zatwierdzenie w fazie 3, nie brak narzędzia. |

## Zostawione w treści (nie archeologia)

- `commands/orchestrate.md`, wiersz ORC-098 w rejestrze reguł: daty w kolumnie „problem” to część
  wiersza rejestru czytanego maszynowo; pełne uzasadnienie jest w
  [`docs/decisions/orchestrate-rule-history.md`](../orchestrate-rule-history.md#orc-098).
