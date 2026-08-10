# Offline-First Pattern

**Layer**: Infrastructure
**Status**: production

## What This Is

Wzorzec na budowanie ekranów i funkcji mobilnych, które działają sensownie bez
łączności: dane wczytane wcześniej zostają widoczne, akcje użytkownika nie
giną tylko dlatego, że telefon stracił zasięg, a po powrocie sieci wszystko,
co czekało w kolejce, wykonuje się samo. Cztery współpracujące mechanizmy:

1. **Cache z jawnym TTL** — dane z serwera trzymane lokalnie z terminem
   ważności, żeby ekran miał co pokazać natychmiast po otwarciu.
2. **Szyfrowanie danych lokalnych** — cache i kolejka leżą na dysku telefonu,
   więc muszą być zaszyfrowane tak samo poważnie jak dane na serwerze.
3. **Kolejka operacji offline** — zapis/aktualizacja wykonana bez sieci trafia
   do kolejki, a nie znika; kolejka synchronizuje się sama, gdy łączność wraca.
4. **Sygnalizacja świeżości w UI** — użytkownik musi wiedzieć, czy patrzy na
   dane aktualne, czy na to, co zostało z poprzedniej sesji.

Źródło przykładów: `juz_ide_mobile_app` (`lib/core/storage/`,
`lib/features/local_services/data/`) — realny, wdrożony kod, nie pseudokod.

## When to Use

**Use this pattern for:**
- ✅ Ekrany listujące dane, które mają sens pokazane „trochę nieświeże” (feed
  usług lokalnych, oferty, wiadomości) — użytkownik woli zobaczyć coś od razu
  niż spinner na pustym ekranie.
- ✅ Formularze i akcje bez potrzeby natychmiastowego potwierdzenia
  (aktualizacja profilu, zgłoszenie, wiadomość) — mogą poczekać w kolejce do
  odzyskania sieci.
- ✅ Aplikacje używane w miejscach o niepewnym zasięgu (transport publiczny,
  budynki, obszary wiejskie) — offline nie jest przypadkiem brzegowym, tylko
  codziennością części użytkowników.
- ✅ Dane wrażliwe trzymane lokalnie (profil, wiadomości, lokalizacja) —
  offline-first i szyfrowanie idą w parze, bo bez sieci dane i tak muszą
  leżeć na dysku urządzenia.

**Do NOT use for:**
- ❌ Operacje wymagające natychmiastowej, potwierdzonej spójności — płatności,
  rezerwacja ostatniej wolnej pozycji, cokolwiek gdzie dwóch użytkowników
  rywalizuje o ten sam zasób. Kolejka oznacza opóźnione wykonanie i możliwe
  odrzucenie po fakcie; użytkownik musi dostać jasny komunikat „nie udało
  się”, nie fałszywe poczucie, że transakcja już przeszła. Te operacje mają
  wymagać online i kończyć się jawnym błędem przy braku sieci.
- ❌ Dane tracące sens po kilku sekundach (pozycja GPS w nawigacji na żywo,
  ceny w handlu wysokiej częstotliwości) — TTL cache'a i tak by ich nie
  uratował, a fałszywe poczucie świeżości jest gorsze niż pusty ekran.
- ❌ Jednorazowe, mało istotne zdarzenia telemetryczne (analytics ping) — dla
  nich lepszy jest fire-and-forget z cichym pominięciem przy braku sieci, nie
  pełna kolejka z retry i priorytetami.

## Implementation

### 1. Cache z jawnym TTL

Cache lokalny trzyma dane razem z osobnym „meta" boxem znaczników czasu —
świeżość sprawdzana jest przy odczycie, nie przy zapisie. Dzięki temu jeden
mechanizm (`_isCacheValid`) obsługuje wszystkie klucze cache'a niezależnie od
tego, co reprezentują.

```dart
// lib/features/local_services/data/data_sources/local_services_local_data_source.dart
class LocalServicesLocalDataSource {
  static const String _cacheMetaBoxName = 'local_services_cache_meta';
  static const int _cacheDurationMinutes = 5; // Cache duration in minutes

  Box<String>? _jobRequestsBox;
  Box<String>? _cacheMetaBox;

  Future<void> cacheJobRequests(
    PaginatedResponseModel<JobRequestModel> response,
    String cacheKey,
  ) async {
    final box = _jobRequestsBox;
    if (box == null) return;
    await box.put(cacheKey, jsonEncode(/* ...serialize response... */ {}));
    await _updateCacheTimestamp(cacheKey);
  }

  /// Returns null when stale — caller re-fetches from network.
  PaginatedResponseModel<JobRequestModel>? getCachedJobRequests(String cacheKey) {
    final box = _jobRequestsBox;
    if (box == null || !_isCacheValid(cacheKey)) return null;

    final jsonString = box.get(cacheKey);
    if (jsonString == null) return null;

    try {
      return /* ...deserialize... */ null;
    } catch (e) {
      box.delete(cacheKey); // self-heal: drop corrupt entry, don't return garbage
      return null;
    }
  }

  Future<void> _updateCacheTimestamp(String key) async =>
      _cacheMetaBox?.put('timestamp_$key', DateTime.now().toIso8601String());

  bool _isCacheValid(String key) {
    final timestampString = _cacheMetaBox?.get('timestamp_$key');
    if (timestampString == null) return false;
    try {
      final age = DateTime.now().difference(DateTime.parse(timestampString)).inMinutes;
      return age < _cacheDurationMinutes;
    } catch (e) {
      return false;
    }
  }
}
```

Reguły do zapamiętania:

- **TTL jest jawną stałą, nie domysłem** (`_cacheDurationMinutes = 5`) —
  wartość dobrana do tego, jak szybko dane realnie się zmieniają, nie
  skopiowana z innego ekranu.
- **Odczyt uszkodzonego wpisu kasuje go** zamiast zwracać śmieci do warstwy
  prezentacji — `catch` w `getCachedJobRequests` woła `box.delete(key)` przed
  zwróceniem `null`.
- **Invalidacja jest jawna i celowana** (`invalidateJobRequestsCache()`,
  `invalidateOffersCache()`) — po mutacji (np. dodaniu nowej oferty) kasuje się
  konkretny cache, a nie cały box na wszelki wypadek.

### 2. Szyfrowanie danych lokalnych + migracja

Klucz AES-256 generowany jest raz, trzymany w `flutter_secure_storage` (nie w
Hive — klucz szyfrujący nie może leżeć obok danych, które szyfruje), i
cache'owany w pamięci procesu, żeby nie odpytywać keychainu przy każdym
otwarciu boxa.

```dart
// lib/core/storage/hive_encryption_helper.dart
class HiveEncryptionHelper {
  static const String _storageKey = 'hive_encryption_key';
  static List<int>? _cachedKey;

  static Future<List<int>> getEncryptionKey() async {
    if (_cachedKey != null) return _cachedKey!;
    final stored = await SecureStorageService.getData(_storageKey);
    if (stored != null && stored['key'] is String) {
      return _cachedKey = base64Decode(stored['key'] as String);
    }
    final newKey = Hive.generateSecureKey();
    await SecureStorageService.storeData(_storageKey, {'key': base64Encode(newKey)});
    return _cachedKey = newKey;
  }

  static Future<HiveAesCipher> getCipher() async => HiveAesCipher(await getEncryptionKey());

  /// Open a Hive box with encryption, migrating unencrypted data if needed.
  static Future<Box<T>> openEncryptedBox<T>(String boxName) async {
    final cipher = await getCipher();
    try {
      return await Hive.openBox<T>(boxName, encryptionCipher: cipher);
    } catch (e) {
      // Box may predate encryption. Migrate: read unencrypted → delete → reopen encrypted → restore.
      try {
        final unencrypted = await Hive.openBox<T>(boxName);
        final entries = Map<dynamic, T>.from(unencrypted.toMap());
        await unencrypted.deleteFromDisk();
        final encrypted = await Hive.openBox<T>(boxName, encryptionCipher: cipher);
        if (entries.isNotEmpty) await encrypted.putAll(entries);
        return encrypted;
      } catch (migrationError) {
        // Migration itself failed (corrupted data) — last-resort fallback:
        // drop the box and start fresh. Losing a cache entry is
        // recoverable; a boot loop is not.
        try {
          await Hive.deleteBoxFromDisk(boxName);
        } catch (_) {}
        return await Hive.openBox<T>(boxName, encryptionCipher: cipher);
      }
    }
  }
}
```

Wywołanie w warstwie danych jest wtedy jednolinijkowe
(`HiveEncryptionHelper.openEncryptedBox<String>(_jobRequestsBoxName)`) — cała
złożoność migracji zostaje ukryta w helperze. Trzy poziomy fallbacku nie są
przypadkowe: (1) otwórz zaszyfrowany box normalnie, (2) jeśli box istniał
sprzed włączenia szyfrowania — przeczytaj niezaszyfrowany, usuń, zapisz
ponownie zaszyfrowany, (3) jeśli i migracja się wywali (uszkodzone dane) —
usuń box i zacznij od zera. To jedyny akceptowalny scenariusz utraty danych:
cache/kolejkę można odbudować, zawieszoną aplikację przy starcie — nie.

### 3. Kolejka operacji offline

Operacja wykonana bez sieci trafia do kolejki z priorytetem, statusem i
licznikiem prób. Kolejka synchronizuje się przy zmianie stanu łączności
(listener) oraz periodycznie (timer), więc nie polega wyłącznie na jednym
zdarzeniu.

```dart
// lib/core/storage/queue_manager.dart
enum QueueItemType { serviceCreation, profileUpdate, contactForm, messageSubmission }
enum QueueStatus { pending, syncing, completed, failed }
enum QueuePriority { low, normal, high, critical }

class QueueManager extends Notifier<QueueState> {
  static const int _maxBatchSize = 5;
  static const Duration _syncInterval = Duration(seconds: 30);
  static const Duration _retryBaseDelay = Duration(seconds: 2);

  // ref.listen<ConnectivityState>(connectivityProvider, ...) triggers
  // _startQueueSync() the moment the device comes back online — see build().

  Future<String> addToQueue({
    required QueueItemType type,
    required Map<String, dynamic> data,
    QueuePriority priority = QueuePriority.normal,
    int maxAttempts = 3,
  }) async {
    final item = QueueItem(
      id: _uuid.v4(),
      type: type,
      status: QueueStatus.pending,
      priority: priority,
      data: data,
      createdAt: DateTime.now(),
      lastAttempt: DateTime.now(),
      maxAttempts: maxAttempts,
    );
    state = state.copyWith(items: [...state.items, item]);
    await _saveQueueToStorage();
    if (ref.read(connectivityProvider).status.isOnline) _startQueueSync();
    return item.id;
  }

  Future<void> _syncQueue() async {
    if (state.isSyncing) return;
    state = state.copyWith(isSyncing: true);

    final pendingItems = state.items.where((i) => i.status == QueueStatus.pending).toList()
      ..sort((a, b) {
        final byPriority = _priorityWeight(b.priority).compareTo(_priorityWeight(a.priority));
        return byPriority != 0 ? byPriority : a.createdAt.compareTo(b.createdAt);
      });

    for (final item in pendingItems.take(_maxBatchSize)) {
      await _processQueueItem(item);
    }
    await _saveQueueToStorage();
    state = state.copyWith(isSyncing: false);
    if (state.hasPendingItems) _scheduleRetry();
  }

  /// Exponential backoff scaled by failed-item count.
  void _scheduleRetry() {
    _retryTimer?.cancel();
    final failedItems = state.items.where((i) => i.status == QueueStatus.failed).length;
    final delayMultiplier = (failedItems + 1).clamp(1, 8);
    final delay = Duration(milliseconds: _retryBaseDelay.inMilliseconds * delayMultiplier);

    _retryTimer = Timer(delay, () {
      if (ref.read(connectivityProvider).status.isOnline) _startQueueSync();
    });
  }

  int _priorityWeight(QueuePriority priority) => switch (priority) {
        QueuePriority.critical => 4,
        QueuePriority.high => 3,
        QueuePriority.normal => 2,
        QueuePriority.low => 1,
      };
}
```

Cztery elementy tej kolejki są obowiązkowe, nie opcjonalne: **priorytet +
sortowanie przed batchem** (krytyczna operacja nie czeka w ogonie za
niskopriorytetowymi), **`_maxBatchSize`** (synchronizacja nie wysyła całej
zaległości naraz po odzyskaniu sieci), **backoff rosnący z liczbą
niepowodzeń** zamiast stałego interwału, i **listener łączności + timer
periodyczny razem** — samo nasłuchiwanie zmiany stanu sieci nie wystarcza
(można przegapić zdarzenie), timer co 30s jest siatką bezpieczeństwa.

### 4. Rozstrzyganie konfliktów i odrzucenie przez serwer

Kolejka musi rozróżniać **błąd przejściowy** (brak sieci, timeout — spróbuj
ponownie) od **odrzucenia trwałego** (walidacja 4xx, konflikt biznesowy —
retry tylko marnuje próby). `_processQueueItem` (metoda wołana z `_syncQueue`
w sekcji 3 dla każdego elementu batcha) łapie wyjątek z handlera i decyduje:

```dart
Future<void> _processQueueItem(QueueItem item) async {
  try {
    _updateItem(item.copyWith(status: QueueStatus.syncing, lastAttempt: DateTime.now()));
    switch (item.type) {
      case QueueItemType.profileUpdate:
        await _processProfileUpdate(item);
      // ...other cases...
    }
    _updateItem(item.copyWith(status: QueueStatus.completed));
  } catch (e) {
    final newAttemptCount = item.attemptCount + 1;
    final shouldRetry = newAttemptCount < item.maxAttempts;
    _updateItem(item.copyWith(
      status: shouldRetry ? QueueStatus.pending : QueueStatus.failed,
      attemptCount: newAttemptCount,
      error: e.toString(),
    ));
  }
}
```

Domyślnie każdy wyjątek liczy się tak samo — po trzech próbach operacja
ląduje w `failed` niezależnie od tego, czy chodziło o brak sieci, czy o
serwer odrzucający operację. To wystarcza dla prostych przypadków, ale gdy
handler API rozróżnia klasy błędów (osobny typ wyjątku dla 4xx niż dla
timeoutu), warto to wykorzystać: błąd walidacji od razu do `failed` (retry
nie pomoże), błąd sieciowy — przez normalną ścieżkę retry z backoffem.
`QueueItem.error` to miejsce, gdzie UI pokazuje „serwer odrzucił: <powód>”,
nie generyczne „coś poszło nie tak”.

### 5. Świeżość danych w UI

Warstwa prezentacji musi wiedzieć, czy pokazywane dane pochodzą z sieci, czy z
cache'a — inaczej użytkownik nie ma szans zauważyć, że patrzy na coś
sprzed pięciu minut. Praktyczny wzorzec: `getCachedX()` zwraca `null`, gdy
cache jest przeterminowany lub go nie ma — provider/repository wtedy
jednoznacznie wie, że musi pójść do sieci, i może oznaczyć rezultat jako
`fromCache: true/false` zamiast cicho podstawiać stare dane pod świeży
widok.

```dart
// Repository warstwy application — decyzja "cache czy sieć" jest jawna,
// nie ukryta wewnątrz data source.
Future<Result<List<JobRequest>, Failure>> getJobRequests() async {
  final cached = localDataSource.getCachedJobRequests(cacheKey);
  if (cached != null) return Result.ok(cached.toEntities(fromCache: true));

  final network = await remoteDataSource.fetchJobRequests();
  return network.fold(
    (failure) => Result.fail(failure),
    (response) {
      localDataSource.cacheJobRequests(response, cacheKey);
      return Result.ok(response.toEntities(fromCache: false));
    },
  );
}
```

Widget wtedy renderuje np. subtelny znacznik „zaktualizowano X min temu” albo
banner „offline — pokazujemy ostatnio zapisane dane” zamiast milczącego
podstawienia.

## Anti-Patterns

### Kolejka kompletna z zewnątrz, w środku stub

Najgroźniejszy anti-pattern w tym wzorcu — z perspektywy wywołującego kodu
wygląda na w pełni zaimplementowany. W realnym audycie `queue_manager.dart`
trzy z czterech handlerów kolejki wyglądają tak:

```dart
/// Process service creation queue item (NOT IMPLEMENTED - NO API)
Future<void> _processServiceCreation(QueueItem item) async {
  throw const StorageException('Service creation not yet available');
}

Future<void> _processContactForm(QueueItem item) async =>
    throw const StorageException('Contact form not yet available');

Future<void> _processMessageSubmission(QueueItem item) async =>
    throw const StorageException('Messaging not yet available');
```

Działa tylko `_processProfileUpdate` — jedyny handler z prawdziwym wywołaniem
repozytorium. Problem nie jest w tym, że te trzy operacje nie są jeszcze
zaimplementowane — problem jest **kiedy** to wychodzi na jaw. `addToQueue()`
przyjmuje `QueueItemType.serviceCreation` bezkrytycznie, zapisuje element do
Hive, zwraca `id`, UI pokazuje „zapisano, wyślemy gdy wróci sieć”. Operacja
próbuje się zsynchronizować w tle, rzuca wyjątek, wraca do `pending`, po
trzech próbach ląduje jako `failed` — cichy, opóźniony fail, który
użytkownik może nigdy nie zobaczyć, bo dawno zamknął aplikację.

**Reguła**: niezaimplementowany handler musi odrzucać operację **w momencie
kolejkowania** (`addToQueue`), nie w momencie przetwarzania
(`_processQueueItem`). Fail fast — zwróć błąd od razu, niech UI pokaże
„ta funkcja nie jest jeszcze dostępna” zamiast fałszywego potwierdzenia:

```dart
// ✅ CORRECT — addToQueue odrzuca nieobsługiwany typ natychmiast
static const _supportedTypes = {QueueItemType.profileUpdate};

Future<String> addToQueue({required QueueItemType type, /* ... */}) async {
  if (!_supportedTypes.contains(type)) throw UnsupportedQueueOperationException(type);
  // ...reszta bez zmian...
}
```

Dopóki nie ma się pewności, że każdy typ w enumie ma realny handler, samo
istnienie wpisu w `QueueItemType` jest obietnicą, którą kod musi dotrzymać —
albo nie powinno go tam być.

### Cache bez TTL

```dart
// ❌ WRONG — cache zapisany raz i czytany bez sprawdzania wieku
Future<void> cacheData(String key, String json) async {
  await box.put(key, json);
}

String? getCachedData(String key) => box.get(key); // brak sprawdzenia świeżości
```

Dane-zombie: raz zapisany wpis żyje w Hive bezterminowo, bo nic nigdy nie
sprawdza, czy jest jeszcze aktualny. Użytkownik widzi ofertę sprzed tygodni
jako aktywną. Każdy cache'owany klucz musi mieć timestamp i jawną politykę
„ile minut/godzin ten typ danych jest ważny”.

### Nieszyfrowany cache z danymi wrażliwymi

```dart
// ❌ WRONG — dane profilowe, wiadomości, historia lokalizacji w plain Hive
final box = await Hive.openBox<String>('user_messages');
```

Telefon może zostać zgubiony, skradziony, albo podłączony do komputera z
narzędziem do odczytu plików aplikacji. `Hive.openBox` bez
`encryptionCipher` zapisuje dane w czytelnym formacie na dysku. Jeśli dane
zawierają cokolwiek osobistego — zawsze przez
`HiveEncryptionHelper.openEncryptedBox`, nigdy bezpośrednio przez
`Hive.openBox`.

### Retry bez backoffu

```dart
// ❌ WRONG — natychmiastowy retry bez opóźnienia
Future<void> syncQueue() async {
  for (final item in pendingItems) {
    try {
      await sync(item);
    } catch (e) {
      syncQueue(); // rekurencyjny retry bez żadnego delaya
    }
  }
}
```

Gdy sieć wraca po dłuższej przerwie (np. 50 zaległych operacji po powrocie z
metra), backend dostaje 50 requestów naraz, a przy każdym niepowodzeniu —
kolejną falę natychmiast. To DDoS na własny backend wykonany przez własną
aplikację. Backoff musi rosnąć (wykładniczo, jak w `_scheduleRetry` powyżej)
i musi być tym dłuższy, im więcej operacji już zawiodło.

### Brak limitu rozmiaru kolejki

```dart
// ❌ WRONG — kolejka rośnie bez ograniczenia
Future<void> addToQueue(QueueItem item) async {
  items.add(item);
  await save();
}
```

Użytkownik offline przez dłuższy czas może wygenerować setki operacji. Bez
górnego limitu Hive box rośnie bez końca, synchronizacja po powrocie online
trwa coraz dłużej, a w skrajnym przypadku aplikacja zapisuje więcej danych
niż urządzenie ma miejsca. Ustaw maksymalny rozmiar kolejki na typ operacji i
zdecyduj świadomie, co się dzieje po przekroczeniu — odrzucenie najstarszych
`low priority`, twardy błąd dla użytkownika, albo wymuszenie natychmiastowej
synchronizacji zamiast dalszego kolejkowania.
