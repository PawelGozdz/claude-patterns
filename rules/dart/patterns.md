---
paths:
  - "**/*.dart"
---
# Flutter Clean Architecture Patterns

## Layer Dependency Rules

```
domain  ←  application  ←  presentation
   ↑                           ↑
   └──── data (implements) ────┘
```

- **Domain**: Entities, value objects, repository interfaces, failures. Zero dependencies on Flutter/packages.
- **Application**: Use cases, state notifiers. Depends only on domain.
- **Presentation**: Widgets, pages, providers. Depends on application + domain.
- **Data**: Repository implementations, DTOs, data sources. Implements domain interfaces.

```dart
// domain/repositories/auth_repository.dart — INTERFACE only
abstract class AuthRepository {
  Future<Either<Failure, User>> login(String email, String password);
  Future<Either<Failure, Unit>> logout();
}

// data/repositories/auth_repository_impl.dart — IMPLEMENTATION
class AuthRepositoryImpl implements AuthRepository {
  final Dio _dio;
  // ...
}
```

## Riverpod Providers

```dart
// PREFER: ref.watch() in build() for reactivity
@override
Widget build(BuildContext context, WidgetRef ref) {
  final authState = ref.watch(authNotifierProvider);
  // ...
}

// USE: ref.read() only in callbacks and event handlers
onPressed: () {
  ref.read(authNotifierProvider.notifier).logout();
},

// StateNotifierProvider for complex state
final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});

// FutureProvider for async data
final userProvider = FutureProvider<User>((ref) async {
  final repo = ref.watch(userRepositoryProvider);
  return repo.getCurrentUser();
});
```

## Freezed Models

```dart
// Domain entity with Freezed
@freezed
class User with _$User {
  const factory User({
    required String id,
    required String name,
    required Email email,
    DateTime? lastLogin,
  }) = _User;
}

// State with union types
@freezed
class AuthState with _$AuthState {
  const factory AuthState.initial() = _Initial;
  const factory AuthState.loading() = _Loading;
  const factory AuthState.authenticated(User user) = _Authenticated;
  const factory AuthState.unauthenticated() = _Unauthenticated;
  const factory AuthState.error(Failure failure) = _Error;
}
```

## GoRouter Type-Safe Routing

```dart
// Define routes
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isAuth = ref.read(authNotifierProvider).isAuthenticated;
      if (!isAuth && !state.matchedLocation.startsWith('/auth')) {
        return '/auth/login';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomePage(),
      ),
    ],
  );
});
```

## Either Error Handling

```dart
// Use case returns Either<Failure, T>
class LoginUseCase {
  final AuthRepository _repository;
  const LoginUseCase(this._repository);

  Future<Either<Failure, User>> call(String email, String password) {
    return _repository.login(email, password);
  }
}

// Handle in presentation
final result = await ref.read(loginUseCaseProvider).call(email, password);
result.fold(
  (failure) => showErrorSnackBar(failure.message),
  (user) => ref.read(routerProvider).go('/home'),
);
```

## Feature-First Directory Structure

```
lib/
  features/
    auth/
      domain/
        entities/
        repositories/    # Abstract interfaces
        failures/
      application/
        notifiers/       # StateNotifiers
        use_cases/
      presentation/
        pages/
        widgets/
        providers/       # Riverpod providers
      data/
        repositories/    # Implementations
        datasources/
        models/          # DTOs, Freezed models
    shared/              # Cross-feature shared code
      domain/
      presentation/
      data/
  core/
    config/
    router/
    theme/
    errors/
```
