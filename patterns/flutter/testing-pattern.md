# Flutter Testing Pattern

## When to Use

- Every feature must have unit tests for use cases and repositories
- Every screen should have at least one widget test verifying render and interaction
- Golden tests for design-critical screens (onboarding, checkout, branded components)
- Integration tests for critical user flows (login, purchase, onboarding)

**Test distribution target**: Unit 60%, Widget 30%, Integration/Golden 10%.

---

## Implementation

### Project Test Structure

```
test/
  features/
    authentication/
      domain/
        usecases/
          login_test.dart
      data/
        repositories/
          auth_repository_impl_test.dart
        models/
          user_model_test.dart
      presentation/
        providers/
          auth_provider_test.dart
        screens/
          login_screen_test.dart
    orders/
      ...
  core/
    network/
      interceptors/
        retry_interceptor_test.dart
  helpers/
    test_helpers.dart           # Shared mocks, finders, pump helpers
    golden_test_helpers.dart
  goldens/                      # Golden image files (committed to git)
    login_screen_default.png
    login_screen_error.png
integration_test/
  app_test.dart
  login_flow_test.dart
```

### Mock Setup with Mocktail

```dart
// test/helpers/test_helpers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dartz/dartz.dart';

// --- Mock Classes ---
class MockAuthRepository extends Mock implements AuthRepository {}
class MockLoginUseCase extends Mock implements Login {}
class MockGetCurrentUser extends Mock implements GetCurrentUser {}
class MockTokenStorage extends Mock implements TokenStorage {}

// --- Fake Classes (for registerFallbackValue) ---
class FakeLoginParams extends Fake implements LoginParams {}
class FakeNoParams extends Fake implements NoParams {}

// --- Register all fakes once ---
void registerFallbacks() {
  registerFallbackValue(FakeLoginParams());
  registerFallbackValue(FakeNoParams());
}

// --- Test Data ---
final testUser = User(
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  createdAt: DateTime(2025, 1, 1),
);

final testUserModel = UserModel(
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  createdAt: DateTime(2025, 1, 1),
);

// --- Pump Helper ---
/// Wraps a widget in MaterialApp + ProviderScope with overrides.
Widget createTestWidget({
  required Widget child,
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(home: child),
  );
}
```

### Unit Test: Use Case

```dart
// test/features/authentication/domain/usecases/login_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dartz/dartz.dart';

import 'package:app/core/error/failures.dart';
import 'package:app/features/authentication/domain/usecases/login.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  late Login loginUseCase;
  late MockAuthRepository mockRepository;

  setUpAll(() => registerFallbacks());

  setUp(() {
    mockRepository = MockAuthRepository();
    loginUseCase = Login(mockRepository);
  });

  group('Login UseCase', () {
    const params = LoginParams(email: 'test@example.com', password: 'Pass123!');

    test('returns User when repository login succeeds', () async {
      // Arrange
      when(() => mockRepository.login(any(), any()))
          .thenAnswer((_) async => Right(testUser));

      // Act
      final result = await loginUseCase(params);

      // Assert
      expect(result, Right(testUser));
      verify(() => mockRepository.login('test@example.com', 'Pass123!')).called(1);
      verifyNoMoreInteractions(mockRepository);
    });

    test('returns ServerFailure when repository fails', () async {
      // Arrange
      const failure = ServerFailure('Server error', statusCode: 500);
      when(() => mockRepository.login(any(), any()))
          .thenAnswer((_) async => const Left(failure));

      // Act
      final result = await loginUseCase(params);

      // Assert
      expect(result, const Left(failure));
    });

    test('returns NetworkFailure when offline', () async {
      // Arrange
      when(() => mockRepository.login(any(), any()))
          .thenAnswer((_) async => const Left(NetworkFailure()));

      // Act
      final result = await loginUseCase(params);

      // Assert
      result.fold(
        (failure) => expect(failure, isA<NetworkFailure>()),
        (_) => fail('Expected Left'),
      );
    });
  });
}
```

### Unit Test: Repository Implementation

```dart
// test/features/authentication/data/repositories/auth_repository_impl_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dartz/dartz.dart';

import 'package:app/core/error/exceptions.dart';
import 'package:app/core/error/failures.dart';
import 'package:app/features/authentication/data/repositories/auth_repository_impl.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  late AuthRepositoryImpl repository;
  late MockAuthRemoteDataSource mockRemote;
  late MockAuthLocalDataSource mockLocal;

  setUp(() {
    mockRemote = MockAuthRemoteDataSource();
    mockLocal = MockAuthLocalDataSource();
    repository = AuthRepositoryImpl(
      remoteDataSource: mockRemote,
      localDataSource: mockLocal,
    );
  });

  group('login', () {
    test('returns User and caches on success', () async {
      // Arrange
      when(() => mockRemote.login(any(), any()))
          .thenAnswer((_) async => testUserModel);
      when(() => mockLocal.cacheUser(any()))
          .thenAnswer((_) async {});

      // Act
      final result = await repository.login('test@example.com', 'pass');

      // Assert
      expect(result, Right(testUserModel));
      verify(() => mockLocal.cacheUser(testUserModel)).called(1);
    });

    test('returns ServerFailure when remote throws ServerException', () async {
      // Arrange
      when(() => mockRemote.login(any(), any()))
          .thenThrow(const ServerException('Bad request', statusCode: 400));

      // Act
      final result = await repository.login('test@example.com', 'pass');

      // Assert
      expect(result.isLeft(), true);
      result.fold(
        (failure) {
          expect(failure, isA<ServerFailure>());
          expect(failure.message, 'Bad request');
        },
        (_) => fail('Expected Left'),
      );
    });

    test('returns NetworkFailure when NetworkException is thrown', () async {
      // Arrange
      when(() => mockRemote.login(any(), any()))
          .thenThrow(const NetworkException());

      // Act
      final result = await repository.login('test@example.com', 'pass');

      // Assert
      expect(result.isLeft(), true);
      result.fold(
        (failure) => expect(failure, isA<NetworkFailure>()),
        (_) => fail('Expected Left'),
      );
    });
  });

  group('getCurrentUser', () {
    test('falls back to cache when remote fails', () async {
      // Arrange
      when(() => mockRemote.getCurrentUser())
          .thenThrow(const ServerException('Unavailable'));
      when(() => mockLocal.getCachedUser())
          .thenAnswer((_) async => testUserModel);

      // Act
      final result = await repository.getCurrentUser();

      // Assert
      expect(result, Right(testUserModel));
    });

    test('returns CacheFailure when both remote and cache fail', () async {
      // Arrange
      when(() => mockRemote.getCurrentUser())
          .thenThrow(const ServerException('Down'));
      when(() => mockLocal.getCachedUser())
          .thenAnswer((_) async => null);

      // Act
      final result = await repository.getCurrentUser();

      // Assert
      result.fold(
        (failure) => expect(failure, isA<CacheFailure>()),
        (_) => fail('Expected Left'),
      );
    });
  });
}
```

### Widget Test with Riverpod Override

```dart
// test/features/authentication/presentation/screens/login_screen_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

import 'package:app/features/authentication/presentation/screens/login_screen.dart';
import 'package:app/features/authentication/presentation/providers/auth_provider.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  late MockLoginUseCase mockLogin;
  late MockGetCurrentUser mockGetCurrentUser;

  setUpAll(() => registerFallbacks());

  setUp(() {
    mockLogin = MockLoginUseCase();
    mockGetCurrentUser = MockGetCurrentUser();
  });

  group('LoginScreen', () {
    testWidgets('renders email and password fields', (tester) async {
      await tester.pumpWidget(
        createTestWidget(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(
                login: mockLogin,
                getCurrentUser: mockGetCurrentUser,
              ),
            ),
          ],
          child: const LoginScreen(),
        ),
      );

      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Login'), findsOneWidget);
    });

    testWidgets('shows loading indicator during login', (tester) async {
      // Arrange: make login never complete
      when(() => mockLogin(any()))
          .thenAnswer((_) => Future.delayed(const Duration(seconds: 10)));

      await tester.pumpWidget(
        createTestWidget(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(
                login: mockLogin,
                getCurrentUser: mockGetCurrentUser,
              ),
            ),
          ],
          child: const LoginScreen(),
        ),
      );

      // Act
      await tester.enterText(
        find.byKey(const Key('email_field')),
        'test@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'password123',
      );
      await tester.tap(find.text('Login'));
      await tester.pump(); // Trigger rebuild, don't settle

      // Assert
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows error message on login failure', (tester) async {
      // Arrange
      when(() => mockLogin(any())).thenAnswer(
        (_) async => const Left(AuthFailure.invalidCredentials()),
      );

      await tester.pumpWidget(
        createTestWidget(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(
                login: mockLogin,
                getCurrentUser: mockGetCurrentUser,
              ),
            ),
          ],
          child: const LoginScreen(),
        ),
      );

      // Act
      await tester.enterText(
        find.byKey(const Key('email_field')),
        'test@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'wrong',
      );
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle();

      // Assert
      expect(find.text('Invalid email or password'), findsOneWidget);
    });
  });
}
```

### Golden Test for Visual Regression

```dart
// test/features/authentication/presentation/screens/login_screen_golden_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/features/authentication/presentation/screens/login_screen.dart';
import 'package:app/features/authentication/presentation/providers/auth_provider.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  group('LoginScreen Golden Tests', () {
    testWidgets('default state matches golden', (tester) async {
      // Set a fixed screen size for consistent golden output.
      await tester.binding.setSurfaceSize(const Size(375, 812));

      await tester.pumpWidget(
        createTestWidget(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(
                login: MockLoginUseCase(),
                getCurrentUser: MockGetCurrentUser(),
              )..state = const AsyncValue.data(null),
            ),
          ],
          child: const LoginScreen(),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(LoginScreen),
        matchesGoldenFile('goldens/login_screen_default.png'),
      );
    });

    testWidgets('error state matches golden', (tester) async {
      await tester.binding.setSurfaceSize(const Size(375, 812));

      await tester.pumpWidget(
        createTestWidget(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => AuthNotifier(
                login: MockLoginUseCase(),
                getCurrentUser: MockGetCurrentUser(),
              )..state = AsyncValue.error(
                  const AuthFailure.invalidCredentials(),
                  StackTrace.current,
                ),
            ),
          ],
          child: const LoginScreen(),
        ),
      );
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(LoginScreen),
        matchesGoldenFile('goldens/login_screen_error.png'),
      );
    });
  });
}

// To update golden files after intentional UI changes:
//   flutter test --update-goldens test/features/.../login_screen_golden_test.dart
```

### Integration Test

```dart
// integration_test/login_flow_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Login Flow', () {
    testWidgets('user can login and see home screen', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Should start on login screen (unauthenticated)
      expect(find.text('Login'), findsOneWidget);

      // Enter credentials
      await tester.enterText(
        find.byKey(const Key('email_field')),
        'test@example.com',
      );
      await tester.enterText(
        find.byKey(const Key('password_field')),
        'TestPass123!',
      );

      // Tap login
      await tester.tap(find.text('Login'));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Should navigate to home screen
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Login'), findsNothing);
    });
  });
}
```

---

## Key Rules (Enforced by Hooks)

1. **Every use case has a corresponding unit test file** — `login.dart` -> `login_test.dart`.
2. **Arrange-Act-Assert** structure in every test. Comments marking each section.
3. **Use Mocktail** (not Mockito) — no code generation needed, cleaner syntax.
4. **`setUp` creates fresh mocks per test** — no shared mutable state between tests.
5. **`setUpAll` for `registerFallbackValue`** — called once per group.
6. **Widget tests use `ProviderScope(overrides: [...])`** — never real providers.
7. **Golden tests pin screen size** via `setSurfaceSize` — prevents flaky output from different test runners.

---

## Anti-Patterns

```dart
// BAD: Testing implementation details
test('calls repository.login exactly once', () async {
  // Over-specifying the implementation — test behavior, not call count
  verify(() => mockRepo.login(any(), any())).called(1);
  // Only verify calls when the contract matters (e.g., cache write)
});

// BAD: No assertion on failure path
test('login fails', () async {
  when(() => mockRepo.login(any(), any()))
      .thenAnswer((_) async => const Left(ServerFailure('error')));
  final result = await useCase(params);
  expect(result.isLeft(), true); // Too vague — assert on failure type
});

// BAD: Using real providers in widget tests
testWidgets('home screen', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(home: HomeScreen()), // Hits real API!
    ),
  );
});

// BAD: Golden test without fixed screen size
testWidgets('matches golden', (tester) async {
  await tester.pumpWidget(/* ... */);
  await expectLater(find.byType(MyWidget), matchesGoldenFile('my.png'));
  // Will produce different pixels on different test runners
});

// BAD: Shared mutable state across tests
final mockRepo = MockAuthRepository(); // Created once, state leaks
```

---

## Testing

Run commands:

```bash
# Unit + Widget tests
flutter test

# Single file
flutter test test/features/authentication/domain/usecases/login_test.dart

# Update golden files
flutter test --update-goldens

# Integration tests (requires emulator/device)
flutter test integration_test/

# Coverage report
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
```
