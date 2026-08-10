# Offline-First — Rule Card
<!-- Egzekwowalne streszczenie offline-first-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, kod): offline-first-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `**/storage/*.dart`, `**/data/data_sources/*_local_data_source.dart`,
kolejki operacji offline (`*queue_manager*.dart`, `*queue*.dart` obsługujące retry/sync)

## MUST

- **OF1** — Każdy klucz cache'owany lokalnie ma towarzyszący timestamp i jawną stałą TTL
  (np. `_cacheDurationMinutes`). Odczyt sprawdza wiek wpisu przed zwróceniem danych.
- **OF2** — Odczyt uszkodzonego/niedeserializowalnego wpisu cache kasuje go (`box.delete(key)`)
  zamiast zwracać śmieci albo rzucać wyjątek do warstwy prezentacji.
- **OF3** — Box Hive z danymi wrażliwymi (profil, wiadomości, lokalizacja, dane kontaktowe) otwierany
  WYŁĄCZNIE przez helper szyfrujący (`HiveEncryptionHelper.openEncryptedBox` lub odpowiednik) —
  nigdy bezpośrednio przez `Hive.openBox` bez `encryptionCipher`.
- **OF4** — Klucz szyfrujący trzymany w bezpiecznym storage systemowym (`flutter_secure_storage`
  lub odpowiednik), NIE w tym samym Hive boxie co dane, które szyfruje.
- **OF5** — Migracja niezaszyfrowanego boxa do zaszyfrowanego ma co najmniej dwa poziomy fallbacku:
  (a) odczytaj stare dane → usuń → zapisz zaszyfrowane, (b) jeśli (a) się nie uda — usuń box i
  otwórz pusty zaszyfrowany. Utrata cache jest akceptowalna, zawieszenie startu aplikacji — nie.
- **OF6** — Każdy wariant enuma typu operacji w kolejce (`QueueItemType` lub odpowiednik) ma
  odpowiadający, w pełni działający handler w metodzie przetwarzającej kolejkę.
- **OF7** — Kolejka sortuje pending items po priorytecie przed przetworzeniem batcha; przetwarzanie
  idzie w ograniczonych porcjach (`_maxBatchSize` lub odpowiednik), nie całą zaległością naraz.
- **OF8** — Retry po niepowodzeniu synchronizacji używa rosnącego opóźnienia (backoff), nie stałego
  interwału ani natychmiastowego retry.
- **OF9** — Kolejka ma jawny limit rozmiaru na typ operacji (albo udokumentowaną decyzję, że limit
  jest celowo nieograniczony — z uzasadnieniem w kodzie).
- **OF10** — Metoda odczytująca dane z cache/data source zwraca informację, czy dane pochodzą z
  cache czy z sieci (`fromCache: bool`, osobny typ, albo `null` przy braku cache) — warstwa
  prezentacji NIE dostaje danych bez możliwości odróżnienia świeżych od zapamiętanych.

## MUST NOT

- **N1** — ❌ Handler operacji w kolejce, który zawsze rzuca (`throw ... 'not yet available'`),
  podczas gdy metoda dodająca do kolejki (`addToQueue`) przyjmuje ten typ operacji bez odrzucenia.
  Niezaimplementowana operacja MUSI być odrzucona w momencie kolejkowania, nie w momencie
  przetwarzania — inaczej użytkownik dostaje fałszywe potwierdzenie „zapisano”.
- **N2** — ❌ Cache bez TTL — wpis zapisany raz i czytany bezterminowo bez sprawdzania wieku.
- **N3** — ❌ `Hive.openBox` (bez `encryptionCipher`) dla danych zawierających cokolwiek osobistego.
- **N4** — ❌ Rekurencyjny albo natychmiastowy retry synchronizacji bez opóźnienia rosnącego z
  liczbą niepowodzeń — realny DDoS na własny backend po odzyskaniu łączności.
- **N5** — ❌ Kolejka rosnąca bez górnego limitu — brak decyzji, co się dzieje po jego przekroczeniu.
- **N6** — ❌ Operacje wymagające natychmiastowej potwierdzonej spójności (płatności, rezerwacja
  ostatniej sztuki) przepuszczone przez kolejkę offline zamiast wymagać online i kończyć się
  jawnym błędem przy braku sieci.

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `box.get(key)` bez sprawdzenia timestampu / TTL | OF1 / N2 |
| `catch` w odczycie cache zwraca dane zamiast `box.delete(key)` | OF2 |
| `Hive.openBox<T>(name)` dla boxa z danymi profilu/wiadomości/lokalizacji | OF3 / N3 |
| Klucz szyfrujący zapisany w tym samym boxie Hive co dane | OF4 |
| `openEncryptedBox` bez fallbacku migracji / bez fallbacku „usuń i zacznij od nowa” | OF5 |
| Handler w `switch (item.type)` rzucający `'not yet available'` / `'not implemented'` | OF6 / N1 |
| `addToQueue` przyjmuje typ bez sprawdzenia, czy ma działający handler | N1 |
| Synchronizacja bez sortowania po priorytecie / bez `_maxBatchSize` | OF7 |
| Retry z `Duration` stałą niezależną od liczby niepowodzeń, albo bez `Duration` w ogóle | OF8 / N4 |
| Brak stałej/konfiguracji limitującej rozmiar kolejki | OF9 / N5 |
| Metoda cache zwraca dane bez pola/flagi `fromCache` lub odpowiednika | OF10 |
| Płatność/rezerwacja last-unit przepuszczona przez `addToQueue()` | N6 |

**Pełny wzorzec**: [`offline-first-pattern.md`](./offline-first-pattern.md)
