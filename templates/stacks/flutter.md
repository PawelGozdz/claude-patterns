## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | flutter-implementer, state-manager | Sonnet |
| Verification | code-quality-verifier (Sonnet), ui-verifier (Haiku) | Mixed |
| Utility | codebase-explorer, widget-scaffolder, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Clean Architecture Layer Rules

```
domain  ←  application  ←  presentation
   ↑                           ↑
   └──── data (implements) ────┘
```

| Layer | Allowed Dependencies | Contains |
|-------|---------------------|----------|
| **domain** | Pure Dart only (no Flutter, no packages) | Entities, value objects, repository interfaces, failures |
| **application** | Domain only | Use cases, state notifiers |
| **presentation** | Application + domain | Widgets, pages, Riverpod providers |
| **data** | Domain (implements interfaces) | Repository impls, DTOs, data sources, API clients |

**Enforced by**: `check-clean-arch.js` hook — forbidden imports in domain/application layers.

---

## State Management: Riverpod

### Provider Types

```dart
// StateNotifierProvider — complex state with mutations
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});

// FutureProvider — async data fetching
final userProvider = FutureProvider<User>((ref) async {
  return ref.watch(userRepositoryProvider).getCurrentUser();
});

// Provider — computed/derived values
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authProvider).maybeMap(
    authenticated: (_) => true,
    orElse: () => false,
  );
});
```

### ref.watch vs ref.read

```dart
// build() → ALWAYS ref.watch() for reactivity
@override
Widget build(BuildContext context, WidgetRef ref) {
  final state = ref.watch(authProvider);  // rebuilds on change
  // ...
}

// Callbacks → ref.read() for one-shot actions
ElevatedButton(
  onPressed: () => ref.read(authProvider.notifier).logout(),
)
```

**Enforced by**: `check-riverpod-patterns.js` hook — flags `ref.read()` inside `build()`.

---

## Freezed Model Conventions

```dart
// Domain entity
@freezed
class User with _$User {
  const factory User({
    required String id,
    required String name,
    required Email email,
    DateTime? lastLogin,
  }) = _User;
}

// State with union types (sealed class pattern)
@freezed
class AuthState with _$AuthState {
  const factory AuthState.initial() = _Initial;
  const factory AuthState.loading() = _Loading;
  const factory AuthState.authenticated(User user) = _Authenticated;
  const factory AuthState.unauthenticated() = _Unauthenticated;
  const factory AuthState.error(Failure failure) = _Error;
}

// DTO with JSON serialization
@freezed
class UserDto with _$UserDto {
  const factory UserDto({
    required String id,
    required String name,
    required String email,
  }) = _UserDto;

  factory UserDto.fromJson(Map<String, dynamic> json) =>
      _$UserDtoFromJson(json);
}
```

**Generated files** (`.g.dart`, `.freezed.dart`) are always skipped by hooks.

---

## GoRouter Type-Safe Routing

```dart
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isAuth = ref.read(isAuthenticatedProvider);
      final isAuthRoute = state.matchedLocation.startsWith('/auth');

      if (!isAuth && !isAuthRoute) return '/auth/login';
      if (isAuth && isAuthRoute) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/', redirect: (_, __) => '/home'),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomePage(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(path: '/profile', builder: (_, __) => const ProfilePage()),
          GoRoute(path: '/settings', builder: (_, __) => const SettingsPage()),
        ],
      ),
    ],
  );
});
```

---

## Either<Failure, T> Error Handling

```dart
// Domain failure types
@freezed
class Failure with _$Failure {
  const factory Failure.server(String message) = ServerFailure;
  const factory Failure.network() = NetworkFailure;
  const factory Failure.auth(String message) = AuthFailure;
  const factory Failure.cache() = CacheFailure;
}

// Repository returns Either
abstract class AuthRepository {
  Future<Either<Failure, User>> login(String email, String password);
}

// Fold in presentation
result.fold(
  (failure) => failure.when(
    server: (msg) => showError(msg),
    network: () => showError('No connection'),
    auth: (msg) => showError(msg),
    cache: () => showError('Cache error'),
  ),
  (user) => goRouter.go('/home'),
);
```

---

## Feature-First Directory Structure

```
lib/
  features/
    auth/
      domain/
        entities/          # User, AuthToken
        repositories/      # AuthRepository (abstract)
        failures/          # AuthFailure
      application/
        notifiers/         # AuthNotifier extends StateNotifier
        use_cases/         # LoginUseCase, LogoutUseCase
      presentation/
        pages/             # LoginPage, RegisterPage
        widgets/           # LoginForm, AuthGuard
        providers/         # authProvider, loginUseCaseProvider
      data/
        repositories/      # AuthRepositoryImpl
        datasources/       # AuthRemoteDataSource, AuthLocalDataSource
        models/            # UserDto, AuthTokenDto
    shared/                # Cross-feature (allowed by import hooks)
      domain/
      presentation/
      data/
  core/
    config/                # App configuration
    router/                # GoRouter setup
    theme/                 # ThemeData, colors, typography
    errors/                # Base Failure class
    network/               # Dio client, interceptors
    storage/               # Secure storage wrapper
```

**Enforced by**: `check-flutter-imports.js` hook — flags cross-feature imports.

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~40% | Use cases, notifiers, repositories, value objects |
| **Widget** | ~40% | Pages, forms, provider interactions, error states |
| **Integration** | ~20% | Full flows (auth, navigation), API integration |

```dart
// Widget test with Riverpod overrides
testWidgets('shows error on login failure', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith(() => MockAuthNotifier()),
      ],
      child: const MaterialApp(home: LoginPage()),
    ),
  );
  await tester.tap(find.byKey(const Key('login_button')));
  await tester.pumpAndSettle();
  expect(find.text('Invalid credentials'), findsOneWidget);
});
```

Use **mocktail** over mockito for mock generation. Use **golden tests** for visual regression.
