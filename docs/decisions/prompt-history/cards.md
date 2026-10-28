# Historia kart reguł (patterns/**/*_summary.md)

Dokument dla ludzi. Karty reguł są wstrzykiwane agentom przy implementacji i weryfikacji, więc
każdy bajt kosztuje w kontekście. Z kart usunięto genezę, daty i opisy incydentów (ratchet
„archeologii", `scripts/ci/validate-prompt-structure.mjs`). Reguły, ich ID i kolejność się nie
zmieniły. Poniżej: skąd która karta lub reguła się wzięła.

Format: karta → przeniesiony fragment → data / źródło.

## application/

- **audit-handler-pattern** → kryteria Tier 1/2/3 uogólnione z ADR-0027 projektu juz-ide-api-1, żeby
  decyzja nie wymagała czytania ADR-a, którego inne projekty mogą nie mieć → 2026-07-05.
- **command-handler-pattern, CH11** → przykład z incydentu: w `create-local-share/handler.ts`
  (BR-LS-TAG-001) brakowało `setTag()` w gałęzi residence-default i nikt tego nie zauważył przez
  39 commitów → źródło: juz-ide-api-1.
- **command-handler-queue-port-pattern** → geneza karty: TS-SEC-D0-BETA-HARDENING-001 w
  juz-ide-api-1. Dwa handlery komend (register-with-phone, login-with-phone) dostały `@InjectQueue`
  wprost, bo żadna karta tego nie zakazywała, a analiza uzasadniała to fałszywym zdaniem „handler
  nie pisze do bazy" → 2026-10-21.
- **try-confirm-cancel-pattern, TCC9** → incydent: TS-ARCH-HANDLER-CONTRACT-001, Faza 5, fala A.
  Dwa niezależnie napisane wywołania (`boost-event`, `boost-group`) miały po jednym
  `mapTokenReservationError()` zwracającym jedną klasę błędu dla obu wartości `kind`. Weryfikator
  jednostkowy `code-quality-verifier` uznał TCC4 za spełnione („wywołujący ma własny mapper"),
  nie sprawdził, czy mapper rozróżnia przypadki. Wyłapała to dopiero końcowa bramka przekrojowa
  → data nie zapisana w karcie.

## architecture/

- **bullmq-queue-pattern, BQ10** → adnotacja „(confirmed incident pattern)": połykanie błędu przez
  `return` w procesorze potwierdzone jako realna przyczyna cichej utraty zadań → bez daty.
- **integration-event-pattern** → (1) karta dopisana 2026-09-09 (TASK-KAIZEN-002, follow-up): brak
  karty zmuszał `orchestrate-prepare.mjs` do wstrzykiwania pełnego pliku (38 KB) do promptu
  implementera przy każdej turze. (2) IE6: incydent z 2026-06-04 (TS-INTEGRATION-EVENT-WIRING-AUDIT-001),
  brakująca część trzyczęściowej zmiany dawała martwy kod albo cichą utratę eventu. (3) W
  komentarzu nagłówka usunięto z listy zawartości pełnego wzorca słowo „incydenty".
- **nestjs-module-import-pitfalls** → nagłówek wskazywał 5 udokumentowanych incydentów
  (TS-MENTIONS-001, TS-DISCORD-001). Pole `**Status**` zostało jako `Production`.
- **transactional-outbox-pattern** → geneza karty: reguły istniały tylko w pełnym wzorcu, poza
  ścieżką wstrzykiwania, więc implementerzy wołali `fanOut` wprost z handlerów eventów domenowych
  → 2026-07-03.

## cross-layer/

- **domain-errors-pattern** → geneza karty: cross-layer nie miał żadnych kart reguł, a RULE 7
  pełnego wzorca (aktualizacja mappera) była łamana w ok. 90% przypadków, co dawało produkcyjne
  błędy 500 → 2026-07-03.
- **safe-error-propagation-pattern, SEP6** → dowód dla reguły: usterka naprawiona 2026-05-23
  wróciła i przez 4 miesiące nikt jej nie wykrył.
- **security-invariants-pattern, SI2** → uzasadnienie „w incydentach produkcyjnych" dotyczyło
  przypadków, gdy domyślna polityka została po cichu przestawiona na „allow". W karcie zostało
  „bywa przestawiona".

## flutter/

- **design-token-pattern** → data przy uwadze o dwóch równoległych zestawach tokenów w
  `juz-ide-mobile-app` (nowy `JuzIdeTheme`/`JuzIdeTokens` i stary `LocalHeroDesignTokens`) →
  2026-09-27. Treść uwagi została, bez daty.

## infrastructure/

- **controller-schema-pattern, CS12** → stan zakresu „tylko `juz-ide-api-*` ma mechanizm
  `Idempotency-Key`" był podany na dzień 2026-09-14. W karcie jest teraz „obecnie".
- **repository-pattern, RP12/N7** → geneza (2026-07-05): pierwszy żywy przebieg `/orchestrate-ddd`
  w juz-ide-api-1 (TS-SEC-ANTI-SPOOF-003) wygenerował `DeviceNoncePurgeCron`, który wstrzykiwał
  `DATABASE_TOKEN` (`Kysely<Database>`) i robił inline `deleteFrom('device_nonces')` zamiast użyć
  `IDeviceNonceRepository`. Przegląd człowieka to złapał. Port nie miał jeszcze metody
  `purgeExpired()`, więc implementer poszedł na skróty. Sprawdzono, że wszystkie 18 pozostałych
  cronów i schedulerów w repo idą przez repozytorium, port albo command-bus. To był jedyny wyjątek.

## refine-spa/

- **refine-providers-pattern, web-security-invariants-pattern, web-structure-pattern,
  web-testing-pattern** → karty promowane z marketing-hub (TS-MH-002) 2026-09-27. W komentarzu
  nagłówka została informacja o zakresie (project-specific), bez daty.
