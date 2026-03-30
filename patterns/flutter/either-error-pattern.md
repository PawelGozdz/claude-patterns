# Either Error Handling Pattern

## When to Use

- Every repository method that can fail (network, cache, validation)
- Every use case return type
- Any boundary between layers where errors must be translated
- When you need to propagate errors without throwing exceptions across architectural layers

**Do NOT use** for programmer errors (null dereference, index out of bounds). Those should crash — they signal bugs, not runtime failures.

---

## Implementation

### Failure Hierarchy

```dart
// core/error/failures.dart
abstract class Failure {
  final String message;
  final String? code;

  const Failure(this.message, {this.code});

  @override
  String toString() => 'Failure($code): $message';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Failure &&
          runtimeType == other.runtimeType &&
          message == other.message &&
          code == other.code;

  @override
  int get hashCode => message.hashCode ^ code.hashCode;
}

class ServerFailure extends Failure {
  final int? statusCode;

  const ServerFailure(super.message, {super.code, this.statusCode});
}

class NetworkFailure extends Failure {
  const NetworkFailure([String message = 'No internet connection'])
      : super(message, code: 'NETWORK_ERROR');
}

class AuthFailure extends Failure {
  const AuthFailure(super.message, {super.code});

  const AuthFailure.invalidCredentials()
      : this('Invalid email or password', code: 'INVALID_CREDENTIALS');

  const AuthFailure.tokenExpired()
      : this('Session expired, please login again', code: 'TOKEN_EXPIRED');

  const AuthFailure.unauthorized()
      : this('You are not authorized', code: 'UNAUTHORIZED');
}

class CacheFailure extends Failure {
  const CacheFailure([String message = 'Cache operation failed'])
      : super(message, code: 'CACHE_ERROR');
}

class ValidationFailure extends Failure {
  final Map<String, List<String>> fieldErrors;

  const ValidationFailure({
    String message = 'Validation failed',
    this.fieldErrors = const {},
  }) : super(message, code: 'VALIDATION_ERROR');
}
```

### Exception Classes (Data Layer Raw Errors)

```dart
// core/error/exceptions.dart

/// Thrown by data sources. Converted to Failure in repository.
class ServerException implements Exception {
  final String message;
  final int? statusCode;

  const ServerException(this.message, {this.statusCode});
}

class NetworkException implements Exception {
  const NetworkException();
}

class CacheException implements Exception {
  final String message;
  const CacheException([this.message = 'Cache operation failed']);
}

class UnauthorizedException implements Exception {
  final String message;
  const UnauthorizedException([this.message = 'Unauthorized']);
}
```

### UseCase Base Class

```dart
// core/usecases/usecase.dart
import 'package:dartz/dartz.dart';
import '../error/failures.dart';

abstract class UseCase<Type, Params> {
  Future<Either<Failure, Type>> call(Params params);
}

/// For use cases that return a Stream instead of a Future.
abstract class StreamUseCase<Type, Params> {
  Stream<Either<Failure, Type>> call(Params params);
}

class NoParams {
  const NoParams();
}
```

### Concrete Use Case

```dart
// features/orders/domain/usecases/place_order.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/usecases/usecase.dart';
import '../entities/order.dart';
import '../repositories/order_repository.dart';

class PlaceOrder implements UseCase<Order, PlaceOrderParams> {
  final OrderRepository repository;

  const PlaceOrder(this.repository);

  @override
  Future<Either<Failure, Order>> call(PlaceOrderParams params) async {
    // Domain validation before hitting the repository
    if (params.items.isEmpty) {
      return const Left(
        ValidationFailure(message: 'Order must contain at least one item'),
      );
    }

    return repository.placeOrder(
      items: params.items,
      shippingAddressId: params.shippingAddressId,
    );
  }
}

class PlaceOrderParams {
  final List<OrderItemParam> items;
  final String shippingAddressId;

  const PlaceOrderParams({
    required this.items,
    required this.shippingAddressId,
  });
}
```

### Repository: Exception to Either Conversion

```dart
// features/orders/data/repositories/order_repository_impl.dart
import 'package:dartz/dartz.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/order.dart';
import '../../domain/repositories/order_repository.dart';
import '../datasources/order_remote_datasource.dart';

class OrderRepositoryImpl implements OrderRepository {
  final OrderRemoteDataSource remoteDataSource;

  const OrderRepositoryImpl({required this.remoteDataSource});

  @override
  Future<Either<Failure, Order>> placeOrder({
    required List<OrderItemParam> items,
    required String shippingAddressId,
  }) async {
    try {
      final order = await remoteDataSource.placeOrder(
        items: items,
        shippingAddressId: shippingAddressId,
      );
      return Right(order);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message, statusCode: e.statusCode));
    } on UnauthorizedException {
      return Left(const AuthFailure.unauthorized());
    } on NetworkException {
      return Left(const NetworkFailure());
    } catch (e) {
      return Left(ServerFailure('Unexpected error: ${e.toString()}'));
    }
  }

  @override
  Future<Either<Failure, List<Order>>> getOrders() async {
    try {
      final orders = await remoteDataSource.getOrders();
      return Right(orders);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message, statusCode: e.statusCode));
    } on NetworkException {
      return Left(const NetworkFailure());
    }
  }
}
```

### Presentation: fold() Pattern in Provider

```dart
// features/orders/presentation/providers/place_order_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/entities/order.dart';
import '../../domain/usecases/place_order.dart';

part 'place_order_state.freezed.dart';

@freezed
class PlaceOrderState with _$PlaceOrderState {
  const factory PlaceOrderState.initial() = _Initial;
  const factory PlaceOrderState.loading() = _Loading;
  const factory PlaceOrderState.success(Order order) = _Success;
  const factory PlaceOrderState.error(String message, {String? code}) = _Error;
}

final placeOrderProvider =
    StateNotifierProvider.autoDispose<PlaceOrderNotifier, PlaceOrderState>(
  (ref) => PlaceOrderNotifier(placeOrder: ref.watch(placeOrderUseCaseProvider)),
);

class PlaceOrderNotifier extends StateNotifier<PlaceOrderState> {
  final PlaceOrder _placeOrder;

  PlaceOrderNotifier({required PlaceOrder placeOrder})
      : _placeOrder = placeOrder,
        super(const PlaceOrderState.initial());

  Future<void> submit(PlaceOrderParams params) async {
    state = const PlaceOrderState.loading();

    final result = await _placeOrder(params);

    // fold: Left → error state, Right → success state
    state = result.fold(
      (failure) => PlaceOrderState.error(
        failure.message,
        code: failure.code,
      ),
      (order) => PlaceOrderState.success(order),
    );
  }
}
```

### Widget: Reacting to Either Results

```dart
// features/orders/presentation/screens/checkout_screen.dart
class CheckoutScreen extends ConsumerWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen for side effects (navigation, snackbar) — not in build tree.
    ref.listen<PlaceOrderState>(placeOrderProvider, (previous, next) {
      next.when(
        initial: () {},
        loading: () {},
        success: (order) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Order ${order.id} placed!')),
          );
          context.go('/orders/${order.id}');
        },
        error: (message, code) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
          );
        },
      );
    });

    final state = ref.watch(placeOrderProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: state.when(
        initial: () => const CheckoutForm(),
        loading: () => const Center(child: CircularProgressIndicator()),
        success: (_) => const SizedBox.shrink(), // Navigated away
        error: (_, __) => const CheckoutForm(), // Show form again with error
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(16),
        child: ElevatedButton(
          onPressed: state is _Loading
              ? null
              : () => ref.read(placeOrderProvider.notifier).submit(
                    PlaceOrderParams(
                      items: ref.read(cartProvider),
                      shippingAddressId: ref.read(selectedAddressProvider),
                    ),
                  ),
          child: state is _Loading
              ? const CircularProgressIndicator()
              : const Text('Place Order'),
        ),
      ),
    );
  }
}
```

### Chaining Either Operations

```dart
// When one use case depends on the result of another
Future<Either<Failure, Receipt>> processPayment(PaymentParams params) async {
  // Step 1: Validate card
  final validationResult = await validateCard(params.cardId);

  // Step 2: Chain — only proceed if validation succeeded
  return validationResult.fold(
    (failure) => Left(failure), // Short-circuit on failure
    (card) async {
      // Step 3: Charge card
      final chargeResult = await chargeCard(ChargeParams(
        cardId: card.id,
        amount: params.amount,
      ));

      return chargeResult.fold(
        (failure) => Left(failure),
        (charge) => Right(Receipt(chargeId: charge.id, amount: params.amount)),
      );
    },
  );
}
```

---

## Key Rules (Enforced by Hooks)

1. **Repositories NEVER throw** — every public method returns `Either<Failure, T>`.
2. **Data sources throw exceptions** — repositories catch and wrap them.
3. **Use cases return Either** — presentation layer handles `fold()`.
4. **Failures carry user-facing messages** — no raw stack traces in the UI.
5. **Each failure type maps to a specific recovery action** (retry, re-login, show validation).
6. **Never catch `Exception` without also catching specific types first** — catch narrow before broad.

---

## Anti-Patterns

```dart
// BAD: Returning null to indicate failure
Future<User?> login(String email, String password) async {
  try {
    return await remote.login(email, password);
  } catch (_) {
    return null; // Caller has no idea what went wrong
  }
}

// BAD: Throwing from a repository
Future<User> login(String email, String password) async {
  final response = await dio.post('/login'); // Exception leaks out
  return UserModel.fromJson(response.data);
}

// BAD: Catching Either result and re-throwing
final result = await useCase(params);
result.fold(
  (failure) => throw failure, // Defeats the purpose of Either
  (data) => emit(data),
);

// BAD: Generic failure with no context
return Left(ServerFailure('Something went wrong'));
// Provide actionable info: status code, field errors, retry hint
```

---

## Testing

```dart
// Test that repository converts exceptions to failures
test('returns ServerFailure when remote throws ServerException', () async {
  when(() => mockRemote.placeOrder(items: any(named: 'items')))
      .thenThrow(const ServerException('Internal error', statusCode: 500));

  final result = await repo.placeOrder(items: testItems, shippingAddressId: '1');

  expect(result, isA<Left>());
  result.fold(
    (failure) {
      expect(failure, isA<ServerFailure>());
      expect((failure as ServerFailure).statusCode, 500);
    },
    (_) => fail('Expected Left'),
  );
});

// Test use case domain validation
test('returns ValidationFailure when items list is empty', () async {
  final result = await placeOrder(
    const PlaceOrderParams(items: [], shippingAddressId: '1'),
  );

  expect(result, isA<Left>());
  result.fold(
    (failure) => expect(failure, isA<ValidationFailure>()),
    (_) => fail('Expected Left'),
  );
  verifyNever(() => mockRepo.placeOrder(items: any(named: 'items')));
});

// Test notifier state transitions on failure
test('transitions to error state on failure', () async {
  when(() => mockPlaceOrder(any()))
      .thenAnswer((_) async => Left(const NetworkFailure()));

  final notifier = PlaceOrderNotifier(placeOrder: mockPlaceOrder);
  final states = <PlaceOrderState>[];
  notifier.addListener(states.add);

  await notifier.submit(testParams);

  expect(states, [
    const PlaceOrderState.loading(),
    const PlaceOrderState.error('No internet connection', code: 'NETWORK_ERROR'),
  ]);
});
```
