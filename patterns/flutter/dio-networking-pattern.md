# Dio Networking Pattern

## When to Use

- Any Flutter app that communicates with a REST API
- When you need token-based authentication with automatic refresh
- When requests need retry logic, caching, or structured logging
- When you want a single, injectable HTTP client across the app

**Do NOT use** for GraphQL (use `graphql_flutter` or `ferry` instead) or for simple one-off HTTP calls in a prototype.

---

## Implementation

### Dio Provider Setup

```dart
// core/network/dio_provider.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/token_refresh_interceptor.dart';
import 'interceptors/retry_interceptor.dart';
import 'interceptors/cache_interceptor.dart';
import 'interceptors/logging_interceptor.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'https://api.example.com/v1',
      ),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  // ORDER MATTERS: interceptors execute in order for requests,
  // reverse order for responses.
  //
  // Request flow:  Auth → Cache → Logging → [Network]
  // Response flow:  Logging → Cache → Retry → TokenRefresh → Auth
  //
  // 1. Auth adds Bearer token (must be first for requests)
  // 2. Cache checks for cached response before hitting network
  // 3. Logging logs outgoing request and incoming response
  // 4. Retry handles transient failures (5xx, timeout)
  // 5. TokenRefresh handles 401 by refreshing token and retrying

  final tokenStorage = ref.watch(tokenStorageProvider);

  dio.interceptors.addAll([
    AuthInterceptor(tokenStorage: tokenStorage),
    TokenRefreshInterceptor(dio: dio, tokenStorage: tokenStorage),
    RetryInterceptor(dio: dio),
    CacheInterceptor(),
    LoggingInterceptor(),
  ]);

  return dio;
});
```

### AuthInterceptor (Bearer Token Injection)

```dart
// core/network/interceptors/auth_interceptor.dart
import 'package:dio/dio.dart';
import '../../storage/token_storage.dart';

class AuthInterceptor extends Interceptor {
  final TokenStorage _tokenStorage;

  /// Paths that do not require authentication.
  static const _publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
  ];

  AuthInterceptor({required TokenStorage tokenStorage})
      : _tokenStorage = tokenStorage;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final isPublic = _publicPaths.any((path) => options.path.startsWith(path));

    if (!isPublic) {
      final accessToken = await _tokenStorage.getAccessToken();
      if (accessToken != null) {
        options.headers['Authorization'] = 'Bearer $accessToken';
      }
    }

    handler.next(options);
  }
}
```

### TokenRefreshInterceptor (401 Refresh and Retry)

```dart
// core/network/interceptors/token_refresh_interceptor.dart
import 'dart:async';
import 'package:dio/dio.dart';
import '../../storage/token_storage.dart';

class TokenRefreshInterceptor extends Interceptor {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  /// Prevents multiple concurrent refresh attempts.
  Completer<String?>? _refreshCompleter;

  TokenRefreshInterceptor({
    required Dio dio,
    required TokenStorage tokenStorage,
  })  : _dio = dio,
        _tokenStorage = tokenStorage;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    // Do not retry the refresh endpoint itself.
    if (err.requestOptions.path == '/auth/refresh') {
      await _tokenStorage.clearTokens();
      return handler.next(err);
    }

    try {
      final newToken = await _refreshToken();

      if (newToken == null) {
        await _tokenStorage.clearTokens();
        return handler.next(err);
      }

      // Retry the original request with the new token.
      final options = err.requestOptions;
      options.headers['Authorization'] = 'Bearer $newToken';

      final response = await _dio.fetch(options);
      return handler.resolve(response);
    } catch (e) {
      await _tokenStorage.clearTokens();
      return handler.next(err);
    }
  }

  Future<String?> _refreshToken() async {
    // If a refresh is already in progress, wait for it.
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    _refreshCompleter = Completer<String?>();

    try {
      final refreshToken = await _tokenStorage.getRefreshToken();
      if (refreshToken == null) {
        _refreshCompleter!.complete(null);
        return null;
      }

      final response = await _dio.post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
        options: Options(
          headers: {'Authorization': ''}, // Override to avoid loop
        ),
      );

      final newAccessToken = response.data['access_token'] as String;
      final newRefreshToken = response.data['refresh_token'] as String;

      await _tokenStorage.saveTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      );

      _refreshCompleter!.complete(newAccessToken);
      return newAccessToken;
    } catch (e) {
      _refreshCompleter!.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }
}
```

### RetryInterceptor (Exponential Backoff)

```dart
// core/network/interceptors/retry_interceptor.dart
import 'dart:async';
import 'dart:math';
import 'package:dio/dio.dart';

class RetryInterceptor extends Interceptor {
  final Dio _dio;
  final int maxRetries;
  final Duration baseDelay;

  /// Status codes that warrant a retry.
  static const _retryableStatuses = {500, 502, 503, 504};

  RetryInterceptor({
    required Dio dio,
    this.maxRetries = 3,
    this.baseDelay = const Duration(milliseconds: 500),
  }) : _dio = dio;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final isRetryable = _shouldRetry(err);
    final attempt = _getAttempt(err.requestOptions);

    if (!isRetryable || attempt >= maxRetries) {
      return handler.next(err);
    }

    // Exponential backoff with jitter
    final delay = baseDelay * pow(2, attempt).toInt();
    final jitter = Duration(milliseconds: Random().nextInt(500));
    await Future.delayed(delay + jitter);

    // Clone request with incremented attempt counter
    final options = err.requestOptions;
    options.extra['retry_attempt'] = attempt + 1;

    try {
      final response = await _dio.fetch(options);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  bool _shouldRetry(DioException err) {
    // Retry on timeout
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      return true;
    }

    // Retry on retryable server errors
    final statusCode = err.response?.statusCode;
    if (statusCode != null && _retryableStatuses.contains(statusCode)) {
      return true;
    }

    // Do not retry client errors (4xx), network errors that aren't timeouts
    return false;
  }

  int _getAttempt(RequestOptions options) {
    return (options.extra['retry_attempt'] as int?) ?? 0;
  }
}
```

### CacheInterceptor

```dart
// core/network/interceptors/cache_interceptor.dart
import 'dart:convert';
import 'package:dio/dio.dart';

class CacheInterceptor extends Interceptor {
  final Map<String, _CacheEntry> _cache = {};
  final Duration cacheDuration;

  CacheInterceptor({this.cacheDuration = const Duration(minutes: 5)});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    // Only cache GET requests.
    if (options.method != 'GET') {
      return handler.next(options);
    }

    // Allow per-request cache bypass.
    if (options.extra['no_cache'] == true) {
      return handler.next(options);
    }

    final key = _cacheKey(options);
    final entry = _cache[key];

    if (entry != null && !entry.isExpired) {
      return handler.resolve(
        Response(
          requestOptions: options,
          data: entry.data,
          statusCode: 200,
          headers: Headers.fromMap({'x-cache': ['HIT']}),
        ),
      );
    }

    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (response.requestOptions.method == 'GET' &&
        response.statusCode == 200) {
      final key = _cacheKey(response.requestOptions);
      _cache[key] = _CacheEntry(
        data: response.data,
        expiry: DateTime.now().add(cacheDuration),
      );
    }
    handler.next(response);
  }

  /// Evict all cached entries or a specific URL pattern.
  void invalidate([String? pathPrefix]) {
    if (pathPrefix == null) {
      _cache.clear();
    } else {
      _cache.removeWhere((key, _) => key.startsWith(pathPrefix));
    }
  }

  String _cacheKey(RequestOptions options) {
    final params = json.encode(options.queryParameters);
    return '${options.path}?$params';
  }
}

class _CacheEntry {
  final dynamic data;
  final DateTime expiry;

  _CacheEntry({required this.data, required this.expiry});

  bool get isExpired => DateTime.now().isAfter(expiry);
}
```

### LoggingInterceptor

```dart
// core/network/interceptors/logging_interceptor.dart
import 'dart:developer' as developer;
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode) {
      developer.log(
        '→ ${options.method} ${options.baseUrl}${options.path}',
        name: 'HTTP',
      );
      if (options.queryParameters.isNotEmpty) {
        developer.log('  Query: ${options.queryParameters}', name: 'HTTP');
      }
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (kDebugMode) {
      developer.log(
        '← ${response.statusCode} ${response.requestOptions.path} '
        '(${response.requestOptions.extra['retry_attempt'] ?? 0} retries)',
        name: 'HTTP',
      );
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) {
      developer.log(
        '✗ ${err.response?.statusCode ?? 'TIMEOUT'} '
        '${err.requestOptions.path}: ${err.message}',
        name: 'HTTP',
        level: 1000,
      );
    }
    handler.next(err);
  }
}
```

### Token Storage

```dart
// core/storage/token_storage.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => TokenStorageImpl(storage: const FlutterSecureStorage()),
);

abstract class TokenStorage {
  Future<String?> getAccessToken();
  Future<String?> getRefreshToken();
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  });
  Future<void> clearTokens();
}

class TokenStorageImpl implements TokenStorage {
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';

  final FlutterSecureStorage _storage;

  const TokenStorageImpl({required FlutterSecureStorage storage})
      : _storage = storage;

  @override
  Future<String?> getAccessToken() =>
      _storage.read(key: _accessTokenKey);

  @override
  Future<String?> getRefreshToken() =>
      _storage.read(key: _refreshTokenKey);

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ]);
  }

  @override
  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }
}
```

---

## Key Rules (Enforced by Hooks)

1. **Interceptor order matters**: Auth first (request), TokenRefresh handles 401 (response), Retry handles 5xx (response).
2. **Never instantiate Dio directly in features** — always inject via `dioProvider`.
3. **Token refresh must be serialized** — multiple concurrent 401s share a single refresh call via the Completer pattern.
4. **Retry only server errors and timeouts** — never retry 4xx client errors (except 401 handled by refresh).
5. **Cache only GET requests** — mutations (POST/PUT/DELETE) must always hit the server.
6. **LoggingInterceptor guards on `kDebugMode`** — zero logging overhead in release builds.

---

## Anti-Patterns

```dart
// BAD: Creating Dio per request
Future<User> getUser() async {
  final dio = Dio(); // New instance = no interceptors, no auth
  final response = await dio.get('/users/me');
  return UserModel.fromJson(response.data);
}

// BAD: Manual token injection in every data source
Future<List<Order>> getOrders(String token) async {
  final response = await dio.get(
    '/orders',
    options: Options(headers: {'Authorization': 'Bearer $token'}),
  ); // AuthInterceptor should handle this
}

// BAD: Unbounded retries
class BadRetryInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    while (true) { // Infinite retry = DDoS your own API
      try { return handler.resolve(await dio.fetch(err.requestOptions)); }
      catch (_) { continue; }
    }
  }
}

// BAD: Refresh token endpoint hitting itself for auth
// The refresh endpoint must be excluded from AuthInterceptor
// and TokenRefreshInterceptor must not retry /auth/refresh on 401

// BAD: Logging sensitive data
developer.log('Request body: ${options.data}'); // May log passwords, tokens
```

---

## Testing

```dart
// Mock Dio with a test interceptor
Dio createMockDio(List<MockResponse> responses) {
  final dio = Dio(BaseOptions(baseUrl: 'https://test.api.com'));
  dio.httpClientAdapter = MockHttpClientAdapter(responses);
  return dio;
}

// Test retry interceptor
test('retries on 503 with exponential backoff', () async {
  final dio = Dio()
    ..httpClientAdapter = MockHttpClientAdapter([
      MockResponse(statusCode: 503), // First attempt fails
      MockResponse(statusCode: 503), // Second attempt fails
      MockResponse(statusCode: 200, data: {'ok': true}), // Third succeeds
    ]);
  dio.interceptors.add(RetryInterceptor(
    dio: dio,
    maxRetries: 3,
    baseDelay: const Duration(milliseconds: 10),
  ));

  final response = await dio.get('/test');

  expect(response.statusCode, 200);
  expect(response.data['ok'], true);
});

// Test token refresh serialization
test('multiple 401s trigger single refresh', () async {
  var refreshCount = 0;
  final mockAdapter = MockHttpClientAdapter(onRequest: (options) {
    if (options.path == '/auth/refresh') {
      refreshCount++;
      return MockResponse(data: {'access_token': 'new', 'refresh_token': 'new'});
    }
    if (options.headers['Authorization'] == 'Bearer old') {
      return MockResponse(statusCode: 401);
    }
    return MockResponse(statusCode: 200, data: {'ok': true});
  });

  // Fire 3 requests simultaneously with an expired token
  await Future.wait([
    dio.get('/a'),
    dio.get('/b'),
    dio.get('/c'),
  ]);

  expect(refreshCount, 1); // Only one refresh call, not three
});
```
