# Riverpod State Management Pattern

## When to Use

- Any screen that manages mutable state beyond a single `setState` call
- Async data fetching (API calls, database reads)
- State shared across multiple widgets or screens
- Complex form state with validation
- When you need dependency injection without `BuildContext`

**Do NOT use** for ephemeral UI state that lives and dies with a single widget (e.g., a toggle button). Use `useState` from `flutter_hooks` or plain `StatefulWidget`.

---

## Implementation

### State Class with Freezed Union Types

```dart
// features/products/presentation/providers/product_list_state.dart
import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/entities/product.dart';

part 'product_list_state.freezed.dart';

@freezed
class ProductListState with _$ProductListState {
  /// Initial state before any action is taken.
  const factory ProductListState.initial() = _Initial;

  /// Data is loading (first load or refresh).
  const factory ProductListState.loading() = _Loading;

  /// Data loaded successfully.
  const factory ProductListState.loaded({
    required List<Product> products,
    @Default(1) int currentPage,
    @Default(false) bool hasReachedEnd,
  }) = _Loaded;

  /// An error occurred.
  const factory ProductListState.error({
    required String message,
    List<Product>? previousProducts, // Preserve stale data on error
  }) = _Error;
}
```

### StateNotifierProvider for Complex Mutations

```dart
// features/products/presentation/providers/product_list_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/usecases/get_products.dart';
import 'product_list_state.dart';

final productListProvider =
    StateNotifierProvider.autoDispose<ProductListNotifier, ProductListState>(
  (ref) => ProductListNotifier(
    getProducts: ref.watch(getProductsUseCaseProvider),
  ),
);

class ProductListNotifier extends StateNotifier<ProductListState> {
  final GetProducts _getProducts;

  ProductListNotifier({required GetProducts getProducts})
      : _getProducts = getProducts,
        super(const ProductListState.initial());

  Future<void> loadProducts() async {
    state = const ProductListState.loading();

    final result = await _getProducts(const GetProductsParams(page: 1));

    state = result.fold(
      (failure) => ProductListState.error(message: failure.message),
      (products) => ProductListState.loaded(
        products: products,
        currentPage: 1,
        hasReachedEnd: products.length < 20,
      ),
    );
  }

  Future<void> loadNextPage() async {
    // Only paginate from loaded state
    final currentState = state;
    if (currentState is! _Loaded || currentState.hasReachedEnd) return;

    final nextPage = currentState.currentPage + 1;
    final result = await _getProducts(GetProductsParams(page: nextPage));

    state = result.fold(
      (failure) => ProductListState.error(
        message: failure.message,
        previousProducts: currentState.products,
      ),
      (newProducts) => currentState.copyWith(
        products: [...currentState.products, ...newProducts],
        currentPage: nextPage,
        hasReachedEnd: newProducts.length < 20,
      ),
    );
  }

  Future<void> refresh() async {
    await loadProducts();
  }
}
```

### FutureProvider for Simple Async Reads

```dart
// features/products/presentation/providers/product_detail_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/product.dart';
import '../../domain/usecases/get_product_by_id.dart';

/// Use FutureProvider when the data is read-only and does not mutate locally.
final productDetailProvider =
    FutureProvider.autoDispose.family<Product, String>((ref, productId) async {
  final getProduct = ref.watch(getProductByIdUseCaseProvider);
  final result = await getProduct(GetProductByIdParams(id: productId));

  return result.fold(
    (failure) => throw failure, // AsyncValue catches this as AsyncError
    (product) => product,
  );
});
```

### Provider.family for Parameterized State

```dart
// features/cart/presentation/providers/cart_item_quantity_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Tracks quantity for a specific product in the cart.
/// family() creates a unique provider instance per productId.
final cartItemQuantityProvider =
    StateProvider.autoDispose.family<int, String>((ref, productId) {
  return 1; // Default quantity
});
```

### Widget Consumption with .when()

```dart
// features/products/presentation/screens/product_list_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/product_list_provider.dart';

class ProductListScreen extends ConsumerStatefulWidget {
  const ProductListScreen({super.key});

  @override
  ConsumerState<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends ConsumerState<ProductListScreen> {
  @override
  void initState() {
    super.initState();
    // Use ref.read for one-time actions outside build().
    Future.microtask(
      () => ref.read(productListProvider.notifier).loadProducts(),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Use ref.watch() in build() to rebuild on state change.
    final state = ref.watch(productListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Products')),
      body: state.when(
        initial: () => const SizedBox.shrink(),
        loading: () => const Center(child: CircularProgressIndicator()),
        loaded: (products, currentPage, hasReachedEnd) {
          return RefreshIndicator(
            onRefresh: () => ref.read(productListProvider.notifier).refresh(),
            child: ListView.builder(
              itemCount: products.length + (hasReachedEnd ? 0 : 1),
              itemBuilder: (context, index) {
                if (index == products.length) {
                  // Trigger pagination when reaching the bottom
                  ref.read(productListProvider.notifier).loadNextPage();
                  return const Center(child: CircularProgressIndicator());
                }
                return ProductListTile(product: products[index]);
              },
            ),
          );
        },
        error: (message, previousProducts) {
          if (previousProducts != null && previousProducts.isNotEmpty) {
            // Show stale data with error banner
            return Column(
              children: [
                MaterialBanner(
                  content: Text(message),
                  actions: [
                    TextButton(
                      onPressed: () =>
                          ref.read(productListProvider.notifier).refresh(),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: previousProducts.length,
                    itemBuilder: (context, index) =>
                        ProductListTile(product: previousProducts[index]),
                  ),
                ),
              ],
            );
          }
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(message),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () =>
                      ref.read(productListProvider.notifier).loadProducts(),
                  child: const Text('Retry'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

### FutureProvider Consumption with AsyncValue

```dart
// features/products/presentation/screens/product_detail_screen.dart
class ProductDetailScreen extends ConsumerWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProduct = ref.watch(productDetailProvider(productId));

    return Scaffold(
      appBar: AppBar(title: const Text('Product')),
      body: asyncProduct.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
        data: (product) => ProductDetailBody(product: product),
      ),
    );
  }
}
```

### Auto-Dispose Patterns

```dart
// Auto-dispose: provider is destroyed when no widget listens to it.
// Use for screens that come and go.
final screenProvider = StateNotifierProvider.autoDispose<Notifier, State>(/**/);

// Keep alive for a duration after last listener is removed.
final cachedProvider = FutureProvider.autoDispose<Data>((ref) async {
  // Prevent disposal for 30 seconds (keeps cache warm during navigation).
  final link = ref.keepAlive();
  final timer = Timer(const Duration(seconds: 30), link.close);
  ref.onDispose(timer.cancel);

  return fetchData();
});

// Never auto-dispose: global state that persists for app lifetime.
// Use for auth state, theme, locale.
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(/**/);
```

---

## Key Rules (Enforced by Hooks)

1. **`ref.watch()` only in `build()` methods** — never inside callbacks, initState, or async functions.
2. **`ref.read()` for one-time actions** — button presses, initState triggers, event handlers.
3. **`ref.listen()` for side effects** — navigation on state change, showing snackbars.
4. **Always use `.autoDispose`** unless the provider manages global app-lifetime state.
5. **State classes use Freezed union types** — no raw booleans (`isLoading`, `hasError`).
6. **Notifiers are pure logic** — no `BuildContext`, no widget references inside notifiers.

---

## Anti-Patterns

```dart
// BAD: ref.watch() inside a callback
onPressed: () {
  final state = ref.watch(provider); // Will not trigger rebuilds here
  // Use ref.read() instead
}

// BAD: Boolean flags instead of union state
class ProductState {
  final bool isLoading;
  final bool hasError;
  final String? errorMessage;
  final List<Product>? products;
  // Impossible states are representable: isLoading=true AND hasError=true
}

// BAD: Business logic inside the widget
Widget build(BuildContext context, WidgetRef ref) {
  final products = ref.watch(rawProductsProvider);
  final filtered = products.where((p) => p.price > 10).toList(); // Logic in UI
  // Move filtering to a provider or use case
}

// BAD: Passing BuildContext to a notifier
class BadNotifier extends StateNotifier<State> {
  final BuildContext context; // Notifiers must not depend on BuildContext
  BadNotifier(this.context) : super(Initial());
}

// BAD: Not using .autoDispose for screen-level providers
final detailProvider = StateNotifierProvider<DetailNotifier, DetailState>(
  // Memory leak: never disposed even after user leaves screen
);
```

---

## Testing

```dart
// Unit test a StateNotifier in isolation
test('loadProducts transitions through loading to loaded', () async {
  when(() => mockGetProducts(any()))
      .thenAnswer((_) async => Right(testProducts));

  final notifier = ProductListNotifier(getProducts: mockGetProducts);
  final states = <ProductListState>[];
  notifier.addListener(states.add);

  await notifier.loadProducts();

  expect(states, [
    const ProductListState.loading(),
    ProductListState.loaded(
      products: testProducts,
      currentPage: 1,
      hasReachedEnd: true,
    ),
  ]);
});

// Widget test with provider override
testWidgets('shows products when loaded', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        productListProvider.overrideWith(
          (ref) => ProductListNotifier(getProducts: mockGetProducts)
            ..state = ProductListState.loaded(
              products: [Product(id: '1', name: 'Widget A', price: 9.99)],
            ),
        ),
      ],
      child: const MaterialApp(home: ProductListScreen()),
    ),
  );

  expect(find.text('Widget A'), findsOneWidget);
});
```
