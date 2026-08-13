# Pattern: Mobile Security (Flutter)

**Tags**: "mobile:security"

**Layer**: Infrastructure
**Status**: production

## What This Is

Pięć filarów bezpieczeństwa infrastruktury mobilnej we Flutterze, które muszą
działać razem, bo każdy z osobna jest tylko połową rozwiązania: (1) jedna
brama do sekretów (nikt nie czyta tokenu z innego miejsca niż przez nią),
(2) szyfrowanie danych trzymanych lokalnie (Hive/SQLite) kluczem, który sam
leży w bezpiecznym magazynie, (3) pinning certyfikatu z jawnym trybem
awarii zamiast cichego fallbacku do zaufania systemowego, (4) logowanie
sieciowe, które nie wycieka nagłówków ani pól z sekretami, i (5) walidacja
wejścia pochodzącego z deep linków, zanim trafi do nawigacji.

Każdy filar jest tu pokazany na realnym kodzie z `juz-ide-mobile-app` — nie
jako pseudokod, tylko jako to, co faktycznie leży w repo (skrócone dla
czytelności, ale bez wymyślania).

## When to Use

**Use this pattern for:**
- ✅ Aplikacja mobilna trzyma token dostępu/odświeżania, dane sesji lub inne
  sekrety na urządzeniu
- ✅ Aplikacja komunikuje się z własnym backendem po HTTPS i chcesz
  utrudnić atak MITM (np. na publicznym Wi-Fi, przez proxy debugujące typu
  Charles/mitmproxy w rękach atakującego, nie developera)
- ✅ Aplikacja loguje żądania/odpowiedzi HTTP do konsoli w trybie debug i
  potrzebujesz gwarancji, że logi nie trafią do release builda ani nie
  zawierają haseł/tokenów
- ✅ Aplikacja obsługuje deep linki lub magic linki, które sterują
  nawigacją (`returnTo`, `redirect`, `next` w query params)
- ✅ Dane lokalne (cache, draft formularzy, dane offline) zawierają PII lub
  dane biznesowe i urządzenie może zostać zgubione/skradzione

**Do NOT use for:**
- ❌ Zastępowania autoryzacji po stronie backendu — klient mobilny **nigdy**
  nie jest źródłem prawdy o uprawnieniach; wszystko poniżej to obrona w
  głąb na urządzeniu użytkownika, nie substytut `@Roles()`/guardów na
  serwerze. Backend musi weryfikować każde żądanie tak, jakby żaden z tych
  mechanizmów po stronie klienta nie istniał.
- ❌ Ochrony przed zdeterminowanym atakującym z fizycznym dostępem do
  zrootowanego/jailbreakowanego urządzenia i czasem — root/jailbreak
  detection i anti-debug (patrz `platform-channel-pattern.md`) podnoszą
  próg wejścia, nie eliminują ryzyka; nie komunikuj tego użytkownikom ani
  compliance jako "urządzenie jest bezpieczne"
- ❌ Przechowywania sekretów, które nigdy nie powinny opuścić serwera
  (klucze API stron trzecich, sekrety podpisujące) — te nie powinny w ogóle
  trafiać do binarki klienta, secure storage ich nie "zabezpiecza", tylko
  ukrywa nieco lepiej niż plaintext

## Implementation

### 1. Jedna brama do sekretów

Cały dostęp do tokenów idzie przez jeden serwis. Żaden inny plik w
projekcie nie powinien wołać `FlutterSecureStorage` bezpośrednio dla
tokenów uwierzytelniających.

```dart
// core/storage/secure_storage_service.dart
class SecureStorageService {
  static late KeyValueStorage _storage;

  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';

  /// Android: encryptedSharedPreferences owija zapis w Android Keystore.
  static AndroidOptions get androidOptions => const AndroidOptions(
        encryptedSharedPreferences: true,
        sharedPreferencesName: 'juz_ide_secure_prefs',
        preferencesKeyPrefix: 'juz_ide_',
      );

  /// iOS: first_unlock_this_device — dostępne od pierwszego odblokowania
  /// po restarcie, ale NIE synchronizowane do iCloud Keychain ani innych
  /// urządzeń tego samego Apple ID (w przeciwieństwie do domyślnego
  /// `whenUnlocked`, który bywa zbyt permisywny dla tokenów sesji).
  static IOSOptions get iosOptions => const IOSOptions(
        accountName: 'JuzIdeApp',
        accessibility: KeychainAccessibility.first_unlock_this_device,
      );

  static Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessTokenKey, value: accessToken);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  static Future<String?> getAccessToken() async =>
      await _storage.read(key: _accessTokenKey);

  static Future<void> clearTokens() async {
    await _storage.delete(key: _accessTokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }
}
```

Dwie decyzje platformowe warte skopiowania: `encryptedSharedPreferences: true`
na Androidzie (a nie domyślny, nieszyfrowany `SharedPreferences` pod spodem
`flutter_secure_storage` na starszych API) i `first_unlock_this_device` na
iOS (a nie `whenUnlocked`, który dopuszcza replikację przez iCloud
Keychain — token sesji z jednego urządzenia nie powinien materializować
się na drugim po przywróceniu z backupu).

### 2. Szyfrowanie danych lokalnych

Klucz AES-256 dla Hive nie jest zaszyty w kodzie ani wyprowadzany
deterministycznie z czegoś przewidywalnego — jest losowy i sam leży w
`SecureStorageService`, czyli za tą samą bramą co tokeny.

```dart
// core/storage/hive_encryption_helper.dart
class HiveEncryptionHelper {
  static const String _storageKey = 'hive_encryption_key';
  static List<int>? _cachedKey;

  static Future<List<int>> getEncryptionKey() async {
    if (_cachedKey != null) return _cachedKey!;

    final stored = await SecureStorageService.getData(_storageKey);
    if (stored != null && stored['key'] is String) {
      _cachedKey = base64Decode(stored['key'] as String);
      return _cachedKey!;
    }

    // Klucz generowany raz, przy pierwszym uruchomieniu.
    final newKey = Hive.generateSecureKey();
    await SecureStorageService.storeData(
      _storageKey,
      {'key': base64Encode(newKey)},
    );
    _cachedKey = newKey;
    return _cachedKey!;
  }

  static Future<Box<T>> openEncryptedBox<T>(String boxName) async {
    final cipher = await HiveAesCipher(await getEncryptionKey());
    try {
      return await Hive.openBox<T>(boxName, encryptionCipher: cipher);
    } catch (e) {
      // Box mógł zostać założony przed włączeniem szyfrowania —
      // migracja: odczytaj plaintext → usuń → otwórz zaszyfrowany → wstaw.
      final unencrypted = await Hive.openBox<T>(boxName);
      final entries = Map<dynamic, T>.from(unencrypted.toMap());
      await unencrypted.deleteFromDisk();
      final encrypted = await Hive.openBox<T>(boxName, encryptionCipher: cipher);
      if (entries.isNotEmpty) await encrypted.putAll(entries);
      return encrypted;
    }
  }
}
```

Ścieżka migracji ma znaczenie praktyczne: bez niej włączenie szyfrowania
w kolejnym release'ie kończy się wyjątkiem przy otwarciu starego,
niezaszyfrowanego boxa na urządzeniach z istniejącą instalacją.

### 3. Pinning certyfikatu z bezpiecznym trybem awaryjnym

SPKI pinning zamiast pinningu całego certyfikatu — pinujemy hash klucza
publicznego, nie sam certyfikat, więc rotacja certyfikatu z tym samym CSR
nie wymaga aktualizacji aplikacji. Parser ASN.1/DER jest ręczny, bo
`dart:io` nie eksponuje SPKI bezpośrednio.

```dart
// core/security/spki_extractor.dart
class SpkiExtractor {
  /// Zwraca `null` przy błędzie parsowania. Wywołujący MUSI traktować
  /// `null` jako niedopasowanie pinu — nigdy jako "certyfikat OK".
  static String? sha256Base64(Uint8List derBytes) {
    try {
      final spki = _extractSpkiBytes(derBytes);
      if (spki == null) return null;
      return base64.encode(sha256.convert(spki).bytes);
    } catch (_) {
      return null;
    }
  }
  // ... chodzenie po ASN1Sequence do subjectPublicKeyInfo (indeks 5 lub 6
  // w zależności od obecności opcjonalnego pola version) — patrz plik
  // źródłowy dla pełnej implementacji.
}
```

```dart
// core/security/ssl_pin_validator.dart — czysta funkcja, testowalna bez dart:io TLS
class SslPinValidator {
  SslPinValidator(this._allowedSpkiBase64);
  final List<String> _allowedSpkiBase64;

  bool validateDer(List<int> derBytes) {
    if (_allowedSpkiBase64.isEmpty) return false;
    final hash = SpkiExtractor.sha256Base64(Uint8List.fromList(derBytes));
    if (hash == null) return false;
    return _allowedSpkiBase64.contains(hash);
  }

  bool validateCertificate(X509Certificate cert) => validateDer(cert.der);
}
```

```dart
// core/security/ssl_pinning_service.dart
class SSLPinningService {
  static void configureDioSSLPinning(Dio dio) {
    if (kIsWeb) return;

    final validator = SslPinValidator(SslPins.activePins);
    final adapter = dio.httpClientAdapter;
    if (adapter is! IOHttpClientAdapter) return;

    adapter.createHttpClient = () {
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) {
        // Zaufanie systemowe zawiodło. Pinning stosujemy TYLKO dla
        // własnych hostów — dla stron trzecich (CDN, analytics)
        // odrzucamy tak jak zrobiłaby to platforma.
        if (!SslPins.pinnedHosts.contains(host)) return false;
        return validator.validateCertificate(cert);
      };
      return client;
    };
  }
}
```

Piny wstrzykuje się przez `--dart-define=API_SPKI_PRIMARY=... --dart-define=API_SPKI_BACKUP=...`
w CI, nie hardkoduje w repo. Konfiguracja trzyma dwa piny (`primary` +
`backup`) właśnie po to, żeby rotacja awaryjna nie wymagała wymuszonego
update'u aplikacji — backup jest wypalony w binarce z wyprzedzeniem,
zanim będzie potrzebny.

### 4. Logowanie sieciowe, które nie wycieka

`LoggingInterceptor` sanityzuje zarówno nagłówki, jak i pola w body —
osobne listy dla jednych i drugich, bo nazwy się różnią (`Authorization`
w nagłówku, `password`/`token`/`otp` w JSON-ie).

```dart
// core/api/interceptors/logging_interceptor.dart
class LoggingInterceptor extends Interceptor {
  final Set<String> _sensitiveHeaders = {
    'authorization', 'x-api-key', 'cookie',
    'x-auth-token', 'x-refresh-token', 'access-token', 'refresh-token',
  };

  final Set<String> _sensitiveFields = {
    'password', 'accessToken', 'refreshToken', 'token',
    'secret', 'key', 'hash', 'pin', 'otp',
  };

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode) {
      final sanitizedHeaders = _sanitizeHeaders(options.headers);
      final sanitizedData = _sanitizeData(options.data);
      debugPrint('🚀 REQUEST ${options.method} ${options.path}');
      debugPrint('   Headers: $sanitizedHeaders');
      if (sanitizedData != null) debugPrint('   Body: $sanitizedData');
    }
    handler.next(options);
  }

  Map<String, dynamic> _sanitizeHeaders(Map<String, dynamic> headers) =>
      headers.map((key, value) => _sensitiveHeaders.contains(key.toLowerCase())
          ? MapEntry(key, '***REDACTED***')
          : MapEntry(key, value));

  dynamic _sanitizeData(dynamic data) {
    if (data is Map<String, dynamic>) {
      return data.map((key, value) {
        if (_sensitiveFields.contains(key.toLowerCase())) {
          return MapEntry(key, '***REDACTED***');
        }
        if (value is Map<String, dynamic>) return MapEntry(key, _sanitizeData(value));
        return MapEntry(key, value);
      });
    }
    return data;
  }
}
```

Dwie rzeczy działają tu razem i obie są konieczne: sanityzacja pól (żeby
`debugPrint` nigdy nie wypisał hasła) **oraz** osłona `kDebugMode` (żeby
sanityzowany, ale wciąż szczegółowy log w ogóle nie istniał w release
buildzie). Zobacz `## Anti-Patterns` — sama sanityzacja bez osłony
`kDebugMode` gdzie indziej w tym samym repo pokazuje, co się dzieje, gdy
zapomni się o drugiej połowie.

Refresh tokenu jest odporny na race condition — równoległe 401 z kilku
requestów nie odpalają kilku równoległych `/auth/refresh`, tylko czekają
na jeden wspólny `Completer`:

```dart
// core/api/interceptors/token_refresh_interceptor.dart (szkielet)
class TokenRefreshInterceptor extends Interceptor {
  static final Map<String, Completer<String?>> _refreshCompleters = {};

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) return handler.next(err);

    const refreshKey = 'token_refresh';
    if (_refreshCompleters.containsKey(refreshKey)) {
      // Odświeżanie już trwa — czekamy na jego wynik zamiast startować drugie.
      final newToken = await _refreshCompleters[refreshKey]!.future
          .timeout(_refreshTimeout, onTimeout: () => null);
      if (newToken == null) return handler.next(err);
      return handler.resolve(await _retryWithNewToken(err.requestOptions, newToken));
    }

    await _handleTokenRefresh(err, handler); // zakłada completer, robi POST /auth/refresh
  }
}
```

### 5. Walidacja wejścia z deep linków

`returnTo` w query params wraca do aplikacji przy re-entry z ekranu, do
którego dowolny deep link mógł doprowadzić — czyli może pochodzić z linku
spreparowanego przez atakującego, nie tylko z własnej nawigacji aplikacji.
Walidacja to allowlist pierwszego segmentu ścieżki, nie blocklist wzorców.

```dart
// core/router/return_to_allowlist.dart
const _knownRouteSegments = <String>{
  '', 'splash', 'auth', 'account', 'home', 'profile', 'settings',
  'map', 'user-profile', 'events', 'organizations', /* ... */
};

/// Fallback na [fallback] gdy returnTo jest puste, jest zewnętrznym URL-em
/// (`://`), zaczyna się od schematu innego niż `/`, albo pierwszy segment
/// nie pasuje do żadnej znanej trasy aplikacji.
String resolveReturnTo(String? returnTo, {String fallback = RouteNames.home}) {
  if (returnTo == null || returnTo.isEmpty) return fallback;
  if (!returnTo.startsWith('/') || returnTo.contains('://')) return fallback;

  final path = returnTo.split('?').first;
  final segments = path.split('/');
  final firstSegment = segments.length > 1 ? segments[1] : '';

  if (!_knownRouteSegments.contains(firstSegment)) return fallback;
  return returnTo;
}
```

To blokuje zarówno `javascript:alert(1)` (nie zaczyna się od `/`), jak i
`https://evil.example` (zawiera `://`), jak i losowy string niepasujący
do żadnej znanej trasy — trzy niezależne warunki, każdy musi przejść.
Każde miejsce, które konsumuje `returnTo` do `context.go()`/`context.push()`,
musi przejść przez `resolveReturnTo` — nigdy przez surowy string z
`state.uri.queryParameters`.

## Anti-Patterns

### `debugPrint` bez osłony `kDebugMode`

Kluczowa pułapka we Flutterze: **`debugPrint` nie jest no-opem w release
buildzie**, w przeciwieństwie do `assert` (który jest tree-shaken przy
`--release`). `debugPrint` **zawsze wykonuje się i zawsze pisze do
konsoli systemowej** — z throttlingiem, ale bez wycięcia. Konsola
release'owej apki na urządzeniu użytkownika jest osiągalna narzędziami
typu `adb logcat` bez roota.

W `juz-ide-mobile-app` jest **843 wystąpień `debugPrint`** w `lib/`, z
czego audyt wykazał **17 plików bez żadnej osłony `kDebugMode`** — w tym
`core/services/notification_service.dart`,
`shared/media_upload/data/repositories/media_upload_repository_impl.dart`
oraz, najbardziej dotkliwie,
`features/service_provider/.../service_provider_remote_data_source.dart`,
który loguje **surowy payload PATCH** wprost do konsoli release'owej:

```dart
// WRONG — z service_provider_remote_data_source.dart, bez osłony
Future<void> updateDisplayIdentity({
  required String displayIdentity,
  String? businessName,
}) async {
  final payload = <String, dynamic>{
    'displayIdentity': displayIdentity,
    if (businessName != null && businessName.isNotEmpty)
      'businessName': businessName,
  };
  debugPrint('[SP display-identity] PATCH payload → $payload'); // wykonuje się w release
  await _dio.patch<void>('$_basePath/profile/display-identity', data: payload);
}
```

```dart
// CORRECT — ta sama diagnostyka, ale znika w release
Future<void> updateDisplayIdentity({
  required String displayIdentity,
  String? businessName,
}) async {
  final payload = <String, dynamic>{
    'displayIdentity': displayIdentity,
    if (businessName != null && businessName.isNotEmpty)
      'businessName': businessName,
  };
  if (kDebugMode) {
    debugPrint('[SP display-identity] PATCH payload → $payload');
  }
  await _dio.patch<void>('$_basePath/profile/display-identity', data: payload);
}
```

Reguła nie brzmi "usuń `debugPrint`" — diagnostyka w developmencie jest
przydatna. Reguła brzmi: każdy `debugPrint` ma nad sobą osłonę
`if (kDebugMode) { ... }` (bezpośrednio albo przez funkcję wołaną tylko
w ścieżce debug). Weryfikowalne statycznie — grep po `debugPrint(` bez
`kDebugMode` w tej samej metodzie to tani lint do CI.

### Pinning, który tylko ostrzega zamiast blokować

`SSLPinningService.configureDioSSLPinning` ma zabudowany warunek na
brak pinów w release buildzie:

```dart
// z ssl_pinning_service.dart
if (SslPins.requirePinsInRelease) {
  _logSecurityEvent('SSL_PINNING_MISCONFIGURED', {
    'message': 'Release build started without API_SPKI_PRIMARY/API_SPKI_BACKUP',
  });
}
```

Problem: `_logSecurityEvent` pisze przez `debugPrint` pod `kDebugMode`.
W release buildzie bez wstrzykniętych pinów (CI zapomniał
`--dart-define`) ten log **nie istnieje nigdzie** — a `SslPins.activePins`
jest pustą listą. `badCertificateCallback` w ogóle nie jest wywoływane dla
normalnego, ważnego certyfikatu z zaufanego CA — połączenie przechodzi
przez zwykłe zaufanie systemowe, bez żadnego pinningu i bez żadnego
widocznego śladu w release logach.

Efekt: build wygląda identycznie jak build z poprawnie skonfigurowanym
pinningiem — kompiluje się, łączy się, działa. To jest **gorsze niż brak
pinningu w ogóle**, bo brak pinningu jest przynajmniej znanym, świadomym
stanem — a cichy fallback do "wygląda jak zabezpieczone" tworzy fałszywe
poczucie bezpieczeństwa u każdego, kto czyta
`SSLPinningService.configureDioSSLPinning(dio)` w setupie i zakłada, że
pinning działa.

```dart
// WRONG (obecne zachowanie) — misconfiguration widoczna tylko w debug logu
if (SslPins.requirePinsInRelease) {
  _logSecurityEvent('SSL_PINNING_MISCONFIGURED', {...}); // ginie w release
}
// build kontynuuje normalnie, requesty idą przez zaufanie systemowe
```

```dart
// CORRECT — release bez pinów odmawia startu (fail loud, nie fail open)
static void configureDioSSLPinning(Dio dio) {
  if (kIsWeb) return;

  if (SslPins.requirePinsInRelease) {
    // Misconfiguration w release to bug wdrożeniowy, nie warunek runtime.
    // Rzuć, żeby smoke test / crash reporting złapał to PRZED publikacją,
    // zamiast wypuszczać build z pinningiem, który nic nie sprawdza.
    throw StateError(
      'Release build started without API_SPKI_PRIMARY/API_SPKI_BACKUP — '
      'refusing to configure Dio without enforceable pinning.',
    );
  }
  // ... reszta konfiguracji
}
```

Alternatywa mniej drastyczna niż `throw` (jeśli twardy crash na starcie
jest zbyt ryzykowny operacyjnie): forwardować `SSL_PINNING_MISCONFIGURED`
do crash reportera (Sentry/Crashlytics) **niezależnie od `kDebugMode`** —
byle nie tylko do `debugPrint`, który w release i tak nikt nie czyta.

### Token omijający `SecureStorageService`

```dart
// WRONG — zapis tokenu wprost do shared_preferences, z pominięciem bramy
final prefs = await SharedPreferences.getInstance();
await prefs.setString('access_token', token); // plaintext na dysku
```

```dart
// CORRECT — jedyna droga do zapisu tokenu
await SecureStorageService.saveTokens(
  accessToken: token,
  refreshToken: refreshToken,
);
```

`shared_preferences` na Androidzie to zwykły, nieszyfrowany XML pod
`/data/data/<package>/shared_prefs/` — czytelny na zrootowanym urządzeniu
bez żadnego wysiłku kryptograficznego. Jedno miejsce w kodzie, które
zapisuje token poza `SecureStorageService`, niweczy cały wysiłek włożony
w `encryptedSharedPreferences`/Keychain — bezpieczeństwo magazynu ocenia
się po najsłabszym punkcie zapisu, nie po większości.

### Sekret w warstwie prezentacji albo w logu błędu

```dart
// WRONG — token trafia do stanu widoku tylko po to, żeby coś wyświetlić
class ProfileScreenState {
  final String debugToken; // po co UI zna surowy token?
}

// WRONG — catch, który wypisuje cały obiekt błędu, a błąd niesie request body
} catch (e) {
  debugPrint('Request failed: $e'); // `e` może zawierać nagłówki/body z hasłem
}
```

```dart
// CORRECT — UI dostaje tylko to, co potrzebuje pokazać (status, nie sekret)
class ProfileScreenState {
  final bool isAuthenticated;
}

// CORRECT — loguj strukturalnie i tylko bezpieczne pola błędu
} catch (e) {
  if (kDebugMode) {
    debugPrint('Request failed: ${e.runtimeType} ${e is DioException ? e.response?.statusCode : ''}');
  }
}
```

Sekret, który raz trafił do stanu widoku (Provider/Riverpod state,
`ChangeNotifier`), zostaje w pamięci dłużej niż potrzeba i bywa
przypadkowo serializowany przez narzędzia deweloperskie (Riverpod
Inspector, Flutter DevTools). Sekret w komunikacie wyjątku, który
przechodzi przez ogólny error handler, kończy w crash reporterze razem z
całym payloadem żądania — czyli w systemie trzeciej strony, poza kontrolą
aplikacji.
