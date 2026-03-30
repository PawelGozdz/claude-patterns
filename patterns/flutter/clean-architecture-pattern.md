# Flutter Clean Architecture Pattern

## When to Use

- Any Flutter feature that involves business logic, data fetching, or state management
- When you need testable, maintainable feature modules with clear dependency boundaries
- When multiple developers work on distinct features in parallel
- When domain logic must remain portable (reusable across platforms or apps)

**Do NOT use** for trivial screens with zero business logic (e.g., static about pages). A flat widget file suffices there.

---

## Implementation

### Feature-First Directory Structure

```
lib/
  core/                          # Shared across ALL features
    error/
      failures.dart              # Base Failure class + common subtypes
      exceptions.dart            # Raw exceptions before mapping
    usecases/
      usecase.dart               # Abstract UseCase<Type, Params>
    network/
      network_info.dart          # Connectivity checker interface
    providers/
      dio_provider.dart          # Shared Dio instance
  shared/                        # Shared widgets, utils, extensions
    widgets/
      loading_indicator.dart
      error_display.dart
    extensions/
      context_extensions.dart
  features/
    authentication/
      domain/
        entities/
          user.dart
        repositories/
          auth_repository.dart   # Abstract interface
        usecases/
          login.dart
          logout.dart
          get_current_user.dart
      data/
        models/
          user_model.dart        # Extends/implements User entity
        repositories/
          auth_repository_impl.dart
        datasources/
          auth_remote_datasource.dart
          auth_local_datasource.dart
      presentation/
        providers/
          auth_provider.dart
          login_form_provider.dart
        screens/
          login_screen.dart
          register_screen.dart
        widgets/
          login_form.dart
          social_login_buttons.dart
```

### Layer 1: Domain (Pure Dart — Zero Dependencies)

```dart
// features/authentication/domain/entities/user.dart
class User {
  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final DateTime createdAt;

  const User({
    required this.id,
    required this.email,
    required this.displayName,
    this.avatarUrl,
    required this.createdAt,
  });
}
```

```dart
// features/authentication/domain/repositories/auth_repository.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../entities/user.dart';

/// Pure interface — NO implementation details, NO framework imports.
abstract class AuthRepository {
  Future<Either<Failure, User>> login(String email, String password);
  Future<Either<Failure, User>> register(String email, String password, String name);
  Future<Either<Failure, Unit>> logout();
  Future<Either<Failure, User>> getCurrentUser();
  Stream<User?> watchAuthState();
}
```

```dart
// core/usecases/usecase.dart
import 'package:dartz/dartz.dart';
import '../error/failures.dart';

/// Every use case implements this contract.
/// [Type] is the return type. [Params] is the input.
abstract class UseCase<Type, Params> {
  Future<Either<Failure, Type>> call(Params params);
}

/// For use cases that take no parameters.
class NoParams {
  const NoParams();
}
```

```dart
// features/authentication/domain/usecases/login.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/user.dart';
import '../repositories/auth_repository.dart';

class Login implements UseCase<User, LoginParams> {
  final AuthRepository repository;

  const Login(this.repository);

  @override
  Future<Either<Failure, User>> call(LoginParams params) {
    return repository.login(params.email, params.password);
  }
}

class LoginParams {
  final String email;
  final String password;

  const LoginParams({required this.email, required this.password});
}
```

### Layer 2: Data (Implements Domain Interfaces)

```dart
// features/authentication/data/models/user_model.dart
import '../../domain/entities/user.dart';

class UserModel extends User {
  const UserModel({
    required super.id,
    required super.email,
    required super.displayName,
    super.avatarUrl,
    required super.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['display_name'] as String,
      avatarUrl: json['avatar_url'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'display_name': displayName,
      'avatar_url': avatarUrl,
      'created_at': createdAt.toIso8601String(),
    };
  }
}
```

```dart
// features/authentication/data/datasources/auth_remote_datasource.dart
import 'package:dio/dio.dart';
import '../models/user_model.dart';

abstract class AuthRemoteDataSource {
  Future<UserModel> login(String email, String password);
  Future<UserModel> register(String email, String password, String name);
  Future<void> logout();
  Future<UserModel> getCurrentUser();
}

class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  final Dio dio;

  const AuthRemoteDataSourceImpl({required this.dio});

  @override
  Future<UserModel> login(String email, String password) async {
    final response = await dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    return UserModel.fromJson(response.data['user'] as Map<String, dynamic>);
  }

  @override
  Future<UserModel> register(String email, String password, String name) async {
    final response = await dio.post('/auth/register', data: {
      'email': email,
      'password': password,
      'name': name,
    });
    return UserModel.fromJson(response.data['user'] as Map<String, dynamic>);
  }

  @override
  Future<void> logout() async {
    await dio.post('/auth/logout');
  }

  @override
  Future<UserModel> getCurrentUser() async {
    final response = await dio.get('/auth/me');
    return UserModel.fromJson(response.data['user'] as Map<String, dynamic>);
  }
}
```

```dart
// features/authentication/data/repositories/auth_repository_impl.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/error/exceptions.dart';
import '../../domain/entities/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_datasource.dart';
import '../datasources/auth_local_datasource.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource remoteDataSource;
  final AuthLocalDataSource localDataSource;

  const AuthRepositoryImpl({
    required this.remoteDataSource,
    required this.localDataSource,
  });

  @override
  Future<Either<Failure, User>> login(String email, String password) async {
    try {
      final user = await remoteDataSource.login(email, password);
      await localDataSource.cacheUser(user);
      return Right(user);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    } on NetworkException {
      return Left(const NetworkFailure('No internet connection'));
    }
  }

  @override
  Future<Either<Failure, User>> getCurrentUser() async {
    try {
      final user = await remoteDataSource.getCurrentUser();
      await localDataSource.cacheUser(user);
      return Right(user);
    } on ServerException {
      // Fallback to cache when server fails
      final cached = await localDataSource.getCachedUser();
      if (cached != null) return Right(cached);
      return Left(const CacheFailure('No cached user found'));
    }
  }

  // ... other methods follow same try/catch → Left/Right pattern
}
```

### Layer 3: Presentation (Riverpod Providers + Widgets)

```dart
// features/authentication/presentation/providers/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/usecases/login.dart';
import '../../domain/usecases/get_current_user.dart';
import '../../domain/entities/user.dart';

final authStateProvider = StateNotifierProvider<AuthNotifier, AsyncValue<User?>>(
  (ref) => AuthNotifier(
    login: ref.watch(loginUseCaseProvider),
    getCurrentUser: ref.watch(getCurrentUserUseCaseProvider),
  ),
);

class AuthNotifier extends StateNotifier<AsyncValue<User?>> {
  final Login _login;
  final GetCurrentUser _getCurrentUser;

  AuthNotifier({
    required Login login,
    required GetCurrentUser getCurrentUser,
  })  : _login = login,
        _getCurrentUser = getCurrentUser,
        super(const AsyncValue.data(null));

  Future<void> loginUser(String email, String password) async {
    state = const AsyncValue.loading();
    final result = await _login(LoginParams(email: email, password: password));
    state = result.fold(
      (failure) => AsyncValue.error(failure, StackTrace.current),
      (user) => AsyncValue.data(user),
    );
  }
}
```

### When to Use shared/ vs Feature-Specific

| Location | Use When |
|---|---|
| `features/x/presentation/widgets/` | Widget used ONLY by feature X |
| `shared/widgets/` | Widget used by 2+ features |
| `features/x/domain/entities/` | Entity owned by feature X |
| `core/error/` | Error types used across all features |
| `core/usecases/` | Base class, not concrete use cases |

**Rule**: Start feature-specific. Move to `shared/` only when a second feature needs it.

---

## Key Rules (Enforced by Hooks)

1. **Domain layer has ZERO package imports** (no Flutter, no Dio, no Riverpod). Only `dart:core` and `dartz`.
2. **Data layer imports domain, NEVER presentation**. Data implements domain interfaces.
3. **Presentation layer NEVER imports data layer directly** — only through providers.
4. **Every use case returns `Future<Either<Failure, T>>`** — no raw exceptions escape domain.
5. **One use case = one public method** (`call()`). No god-class services.
6. **Models extend or implement entities** — never the reverse.

---

## Anti-Patterns

```dart
// BAD: Domain entity importing Flutter
import 'package:flutter/material.dart'; // Domain must be pure Dart
class User {
  final Color themeColor; // UI concern in domain
}

// BAD: Widget directly calling repository
class LoginScreen extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = AuthRepositoryImpl(/* ... */); // Direct instantiation
    repo.login(email, password); // Skipping use case + provider
  }
}

// BAD: God use case with multiple responsibilities
class AuthUseCase {
  Future<User> login() { /* ... */ }
  Future<void> logout() { /* ... */ }
  Future<User> register() { /* ... */ }
  Future<void> resetPassword() { /* ... */ }
  // Split into Login, Logout, Register, ResetPassword use cases
}

// BAD: Returning raw exceptions from repository
Future<User> login() async {
  final response = await dio.post('/login'); // Exception escapes
  return UserModel.fromJson(response.data);
}
```

---

## Testing

Each layer is tested independently:

```dart
// Domain: unit test use case (no mocks for external dependencies)
test('login returns User on success', () async {
  when(() => mockRepo.login(any(), any()))
      .thenAnswer((_) async => Right(testUser));

  final result = await loginUseCase(LoginParams(email: 'a@b.com', password: 'pass'));

  expect(result, Right(testUser));
  verify(() => mockRepo.login('a@b.com', 'pass')).called(1);
});

// Data: unit test repository impl (mock data sources)
test('login caches user on success', () async {
  when(() => mockRemote.login(any(), any()))
      .thenAnswer((_) async => testUserModel);
  when(() => mockLocal.cacheUser(any())).thenAnswer((_) async {});

  await repo.login('a@b.com', 'pass');

  verify(() => mockLocal.cacheUser(testUserModel)).called(1);
});

// Presentation: widget test with provider override
testWidgets('shows error on login failure', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith(
          (ref) => AuthNotifier(/* mocked use cases */),
        ),
      ],
      child: const MaterialApp(home: LoginScreen()),
    ),
  );
  // trigger login, verify error state
});
```
