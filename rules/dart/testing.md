---
paths:
  - "**/*_test.dart"
  - "**/test/**/*.dart"
  - "**/integration_test/**/*.dart"
---
# Flutter Testing

## Test Pyramid

- **Unit Tests (~40%)**: Business logic, use cases, notifiers, repositories
- **Widget Tests (~40%)**: UI components, user interactions, provider integration
- **Integration Tests (~20%)**: E2E flows, navigation, real API integration

## Unit Tests

```dart
// Test use cases and notifiers
void main() {
  late MockAuthRepository mockRepo;
  late LoginUseCase loginUseCase;

  setUp(() {
    mockRepo = MockAuthRepository();
    loginUseCase = LoginUseCase(mockRepo);
  });

  test('should return User on successful login', () async {
    when(() => mockRepo.login(any(), any()))
        .thenAnswer((_) async => Right(tUser));

    final result = await loginUseCase('test@email.com', 'password');

    expect(result, Right(tUser));
    verify(() => mockRepo.login('test@email.com', 'password')).called(1);
  });

  test('should return Failure on invalid credentials', () async {
    when(() => mockRepo.login(any(), any()))
        .thenAnswer((_) async => Left(AuthFailure.invalidCredentials()));

    final result = await loginUseCase('test@email.com', 'wrong');

    expect(result.isLeft(), true);
  });
}
```

## Widget Tests

```dart
void main() {
  testWidgets('LoginPage shows error on invalid credentials', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authNotifierProvider.overrideWith(
            () => MockAuthNotifier(),
          ),
        ],
        child: const MaterialApp(home: LoginPage()),
      ),
    );

    // Enter credentials
    await tester.enterText(find.byKey(const Key('email_field')), 'bad@email');
    await tester.enterText(find.byKey(const Key('password_field')), 'wrong');
    await tester.tap(find.byKey(const Key('login_button')));
    await tester.pumpAndSettle();

    // Verify error displayed
    expect(find.text('Invalid credentials'), findsOneWidget);
  });
}
```

## Mocktail (Preferred over Mockito)

```dart
import 'package:mocktail/mocktail.dart';

// Create mock
class MockAuthRepository extends Mock implements AuthRepository {}

// Register fallback values for custom types
setUpAll(() {
  registerFallbackValue(const User(id: '', name: '', email: Email('')));
});
```

## Golden Tests

```dart
testWidgets('ProfileCard matches golden', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ProfileCard(user: testUser),
      ),
    ),
  );

  await expectLater(
    find.byType(ProfileCard),
    matchesGoldenFile('goldens/profile_card.png'),
  );
});
```

## Pump Conventions

```dart
// pump() — triggers a single frame (use for animations)
await tester.pump();

// pumpAndSettle() — pumps until no more frames scheduled (use after navigation, async)
await tester.pumpAndSettle();

// pump(duration) — advance by specific duration
await tester.pump(const Duration(seconds: 1));

// AVOID: pumpAndSettle with infinite animations (loading spinners)
// USE: pump() with specific duration instead
```

## Test File Naming

```
test/
  features/
    auth/
      domain/
        use_cases/
          login_use_case_test.dart
      presentation/
        pages/
          login_page_test.dart
        widgets/
          login_form_test.dart
  goldens/
    profile_card.png
integration_test/
  auth_flow_test.dart
```
