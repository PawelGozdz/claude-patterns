# Mobile Security (Flutter) — Rule Card

**Tags**: "mobile:security"
<!-- Egzekwowalne streszczenie mobile-security-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, real-code przykłady): mobile-security-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `lib/core/storage/**`, `lib/core/security/**`,
`lib/core/api/interceptors/**`, `lib/core/router/**` oraz każdy plik `.dart` zapisujący
token/sekret lub konsumujący `returnTo`/deep-link query param

## MUST

- **MS1** — Cały dostęp do access/refresh tokenu idzie przez jeden serwis
  (`SecureStorageService` lub odpowiednik) — żaden inny plik nie woła
  `FlutterSecureStorage`/keychain-wrappera bezpośrednio dla tokenów.
- **MS2** — Android: `AndroidOptions(encryptedSharedPreferences: true)`. iOS:
  `IOSOptions` z jawnie wybraną `KeychainAccessibility` (nie domyślną
  `whenUnlocked` dla danych sesji, które nie mają wyciekać przez iCloud sync).
- **MS3** — Klucz szyfrowania danych lokalnych (Hive/SQLite) jest losowy,
  generowany raz i przechowywany przez tę samą bramę co tokeny (MS1) —
  nigdy hardkodowany ani wyprowadzany z czegoś przewidywalnego.
- **MS4** — SSL/SPKI pinning: `badCertificateCallback` odrzuca połączenie
  (`return false`) dla hostów spoza pinowanej allowlisty ORAZ gdy hash SPKI
  nie pasuje do żadnego skonfigurowanego pinu.
- **MS5** — Release build bez wstrzykniętych pinów (`--dart-define` puste)
  to błąd konfiguracji wdrożeniowej — `throw`/crash-reporter event
  **niezależny od `kDebugMode`** — nigdy cichy fallback do "requesty i tak idą".
- **MS6** — Każdy `debugPrint`/`print` ma nad sobą `if (kDebugMode) { ... }`
  (bezpośrednio lub przez funkcję wołaną wyłącznie w ścieżce debug).
- **MS7** — Logging interceptor sanityzuje ODDZIELNIE listę wrażliwych
  nagłówków (`authorization`, `cookie`, `x-api-key`...) i wrażliwych pól
  body (`password`, `token`, `otp`, `pin`, `secret`...) przed `debugPrint`.
- **MS8** — Refresh tokenu serializuje równoległe 401: jeden wspólny
  `Completer`/lock, nie N niezależnych `/auth/refresh` dla N requestów.
- **MS9** — Każde miejsce konsumujące `returnTo`/`redirect`/`next` przechodzi
  przez jedną funkcję walidującą (allowlist pierwszego segmentu ścieżki +
  odrzucenie `://` i wartości bez wiodącego `/`) — nigdy surowy string
  prosto do `context.go()`.

## MUST NOT

- **N1** — ❌ Zapis tokenu/sekretu do `shared_preferences` (lub innego
  nieszyfrowanego storage) z pominięciem bramy z MS1.
- **N2** — ❌ Sekret (token, hasło, klucz) w stanie warstwy prezentacji
  (Provider/Riverpod state, `ChangeNotifier`) tylko po to, by coś wyświetlić.
- **N3** — ❌ `debugPrint('...: $e')` / `debugPrint('...: $payload')` bez
  osłony `kDebugMode` i bez sanityzacji — błąd/payload może nieść body
  requestu z hasłem/tokenem (N7 w repository rule-card ma odpowiednik dla
  eventów; tu chodzi o network/error logi).
- **N4** — ❌ Pinning skonfigurowany tak, że misconfiguration w release
  (brak pinów) kończy się **milczącym przejściem requestów przez zaufanie
  systemowe** zamiast blokady/alarmu — fałszywe poczucie bezpieczeństwa jest
  gorsze niż jawny brak pinningu.
- **N5** — ❌ Walidacja `returnTo` przez blocklist wzorców (`!contains('javascript:')`)
  zamiast allowlisty znanych segmentów tras — blocklisty się omija.
- **N6** — ❌ Traktowanie mechanizmów z tego wzorca jako substytutu
  autoryzacji backendu — klient nigdy nie jest źródłem prawdy o uprawnieniach.

## Minimal correct skeleton

```dart
// core/security/ssl_pinning_service.dart
static void configureDioSSLPinning(Dio dio) {
  if (kIsWeb) return;
  if (SslPins.requirePinsInRelease) {
    throw StateError('Release build without SPKI pins — refusing to configure Dio.'); // MS5
  }
  final validator = SslPinValidator(SslPins.activePins);
  final adapter = dio.httpClientAdapter;
  if (adapter is! IOHttpClientAdapter) return;
  adapter.createHttpClient = () {
    final client = HttpClient();
    client.badCertificateCallback = (cert, host, port) {
      if (!SslPins.pinnedHosts.contains(host)) return false;      // MS4
      return validator.validateCertificate(cert);                  // MS4
    };
    return client;
  };
}

// core/services/*.dart
void logDiagnostic(Object payload) {
  if (kDebugMode) {                                                // MS6
    debugPrint('[Diag] $payload');
  }
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `debugPrint(...)` bez `if (kDebugMode)` w promieniu tej samej metody | **MS6 / N3** |
| `SharedPreferences`/`prefs.setString` z kluczem `token`/`access_token` | **N1** |
| `badCertificateCallback` zwracające `true` domyślnie / brak `return false` dla nieznanego hosta | **MS4** |
| `requirePinsInRelease` sprawdzane, ale tylko logowane pod `kDebugMode`, build kontynuuje | **MS5 / N4** |
| Logging interceptor bez `_sensitiveHeaders`/`_sensitiveFields` przed `debugPrint` | **MS7** |
| `TokenRefreshInterceptor` bez `Completer`/locka — N równoległych POST `/auth/refresh` | **MS8** |
| `context.go(returnTo)` / `context.push(returnTo)` bez przejścia przez funkcję walidującą | **MS9 / N5** |
| Token/sekret jako pole w klasie stanu widoku (`ProfileScreenState.token`) | **N2** |
| Komentarz/dokumentacja sugerująca, że root/pinning/RASP "zabezpiecza" bez backendowej autoryzacji | **N6** |

**Pełny wzorzec**: [`mobile-security-pattern.md`](./mobile-security-pattern.md)
