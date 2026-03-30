# GoRouter Navigation Pattern

## When to Use

- Any Flutter app with more than 2-3 screens
- When you need authentication-based route guards (redirect unauthenticated users)
- When you need deep linking (push notifications, shared URLs)
- When you have a bottom navigation bar with nested navigation stacks
- When route paths must be declarative and testable

**Do NOT use** for single-screen apps or simple `Navigator.push` flows with no auth guards.

---

## Implementation

### Router Provider with Auth Redirect

```dart
// core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/authentication/presentation/providers/auth_provider.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/register_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/search/presentation/screens/search_screen.dart';
import 'scaffold_with_nav_bar.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final routerNotifier = ref.watch(routerNotifierProvider);

  return GoRouter(
    debugLogDiagnostics: true,
    refreshListenable: routerNotifier,
    initialLocation: '/home',
    redirect: (context, state) => routerNotifier.redirect(state),
    routes: [
      // Public routes (no auth required)
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterScreen(),
      ),

      // Authenticated routes with bottom navigation
      ShellRoute(
        builder: (context, state, child) => ScaffoldWithNavBar(child: child),
        routes: [
          GoRoute(
            path: '/home',
            name: 'home',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomeScreen(),
            ),
            routes: [
              // Nested route: /home/orders/:id
              GoRoute(
                path: 'orders/:orderId',
                name: 'orderDetail',
                builder: (context, state) {
                  final orderId = state.pathParameters['orderId']!;
                  return OrderDetailScreen(orderId: orderId);
                },
              ),
            ],
          ),
          GoRoute(
            path: '/search',
            name: 'search',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SearchScreen(),
            ),
          ),
          GoRoute(
            path: '/profile',
            name: 'profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ProfileScreen(),
            ),
          ),
        ],
      ),
    ],

    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Page not found: ${state.uri}')),
    ),
  );
});
```

### RouterNotifier (Auth State Listener)

```dart
// core/router/router_notifier.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/authentication/presentation/providers/auth_provider.dart';

final routerNotifierProvider = Provider<RouterNotifier>((ref) {
  return RouterNotifier(ref);
});

class RouterNotifier extends ChangeNotifier {
  final Ref _ref;
  bool _isAuthenticated = false;

  RouterNotifier(this._ref) {
    // Listen to auth state changes and notify GoRouter to re-evaluate redirects.
    _ref.listen<AsyncValue<User?>>(authStateProvider, (previous, next) {
      final wasAuthenticated = _isAuthenticated;
      _isAuthenticated = next.valueOrNull != null;

      if (wasAuthenticated != _isAuthenticated) {
        notifyListeners(); // Triggers GoRouter.redirect()
      }
    });
  }

  /// Central redirect logic. Returns null to allow navigation, or a path to redirect.
  String? redirect(GoRouterState state) {
    final isLoggingIn = state.matchedLocation == '/login';
    final isRegistering = state.matchedLocation == '/register';
    final isPublicRoute = isLoggingIn || isRegistering;

    if (!_isAuthenticated) {
      // Not authenticated: allow public routes, redirect everything else to login.
      if (isPublicRoute) return null;
      return '/login';
    }

    // Authenticated: redirect away from login/register to home.
    if (isPublicRoute) return '/home';

    // Authenticated and on a protected route: allow.
    return null;
  }
}
```

### ScaffoldWithNavBar (Shell for Bottom Navigation)

```dart
// core/router/scaffold_with_nav_bar.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ScaffoldWithNavBar extends StatelessWidget {
  final Widget child;

  const ScaffoldWithNavBar({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _calculateSelectedIndex(context),
        onDestinationSelected: (index) => _onItemTapped(index, context),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.search_outlined),
            selectedIcon: Icon(Icons.search),
            label: 'Search',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/home')) return 0;
    if (location.startsWith('/search')) return 1;
    if (location.startsWith('/profile')) return 2;
    return 0;
  }

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.go('/home');
      case 1:
        context.go('/search');
      case 2:
        context.go('/profile');
    }
  }
}
```

### Deep Link Handling

```dart
// Route parameters and query parameters for deep links
// Deep link: myapp://orders/abc123?tab=tracking
GoRoute(
  path: 'orders/:orderId',
  name: 'orderDetail',
  builder: (context, state) {
    final orderId = state.pathParameters['orderId']!;
    final tab = state.uri.queryParameters['tab'] ?? 'summary';
    return OrderDetailScreen(orderId: orderId, initialTab: tab);
  },
),
```

### Passing Complex Data via Extra

```dart
// Passing an object during navigation (not in URL)
context.push(
  '/home/orders/${order.id}',
  extra: order, // Pass the full object to avoid re-fetching
);

// Receiving in the route builder
GoRoute(
  path: 'orders/:orderId',
  builder: (context, state) {
    // Try extra first, fall back to fetching by ID
    final order = state.extra as Order?;
    final orderId = state.pathParameters['orderId']!;
    return OrderDetailScreen(orderId: orderId, preloadedOrder: order);
  },
),
```

### Navigation Helpers

```dart
// Typed navigation extension for compile-time safety
extension AppNavigation on BuildContext {
  void goHome() => go('/home');
  void goLogin() => go('/login');
  void goOrderDetail(String orderId) => go('/home/orders/$orderId');
  void goProfile() => go('/profile');

  /// Push a route on top of the current stack (back button returns here).
  void pushOrderDetail(String orderId, {Order? order}) {
    push('/home/orders/$orderId', extra: order);
  }
}

// Usage in widget
ElevatedButton(
  onPressed: () => context.pushOrderDetail(order.id, order: order),
  child: const Text('View Order'),
),
```

### App Entry Point Wiring

```dart
// main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';

void main() {
  runApp(const ProviderScope(child: App()));
}

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      routerConfig: router,
      title: 'My App',
      theme: ThemeData(useMaterial3: true),
    );
  }
}
```

---

## Key Rules (Enforced by Hooks)

1. **All routes defined in one router file** — no scattered `Navigator.push` calls.
2. **Use `context.go()` for tab switching** (replaces stack). Use `context.push()` for detail screens (adds to stack).
3. **Never use `Navigator` directly** — always `context.go()`, `context.push()`, `context.pop()` from GoRouter.
4. **Route guards live in `RouterNotifier.redirect()`** — not in individual screens.
5. **ShellRoute wraps all tabs** — each tab preserves its own navigation stack.
6. **`NoTransitionPage` for tab content** — prevents slide animation when switching tabs.

---

## Anti-Patterns

```dart
// BAD: Auth check inside a screen
class HomeScreen extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider);
    if (user.valueOrNull == null) {
      return const LoginScreen(); // Should use router redirect
    }
    return const HomeContent();
  }
}

// BAD: Navigator.push in a GoRouter app
onPressed: () {
  Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => OrderDetailScreen(id: '123')),
  ); // Breaks deep linking, bypasses redirect guards
}

// BAD: Hardcoded paths scattered across widgets
context.go('/home/orders/123'); // Duplicated string, no compile-time check
// Use named routes or extension methods instead

// BAD: Passing all data via extra without URL fallback
GoRoute(
  path: 'orders/:orderId',
  builder: (context, state) {
    final order = state.extra as Order; // Crashes on deep link (extra is null)
    return OrderDetailScreen(order: order);
  },
),
// Always handle the case where extra is null (deep link scenario)
```

---

## Testing

```dart
// Test redirect logic in isolation
test('redirects unauthenticated user to login', () {
  final notifier = RouterNotifier(mockRef);
  // Simulate unauthenticated state
  notifier._isAuthenticated = false;

  final state = GoRouterState(/* matchedLocation: '/home' */);
  expect(notifier.redirect(state), '/login');
});

test('allows authenticated user to access protected route', () {
  final notifier = RouterNotifier(mockRef);
  notifier._isAuthenticated = true;

  final state = GoRouterState(/* matchedLocation: '/home' */);
  expect(notifier.redirect(state), isNull);
});

test('redirects authenticated user away from login', () {
  final notifier = RouterNotifier(mockRef);
  notifier._isAuthenticated = true;

  final state = GoRouterState(/* matchedLocation: '/login' */);
  expect(notifier.redirect(state), '/home');
});

// Widget test: verify navigation bar shows correct tab
testWidgets('bottom nav highlights correct tab', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) => /* authenticated mock */),
      ],
      child: MaterialApp.router(
        routerConfig: testRouter, // GoRouter with test routes
      ),
    ),
  );

  expect(find.byIcon(Icons.home), findsOneWidget);

  // Navigate to search tab
  await tester.tap(find.text('Search'));
  await tester.pumpAndSettle();

  expect(find.byType(SearchScreen), findsOneWidget);
});

// Deep link test
test('deep link parses order ID correctly', () {
  final router = GoRouter(routes: appRoutes);
  router.go('/home/orders/abc-123?tab=tracking');

  // Verify the correct screen receives the correct parameters
  expect(router.location, '/home/orders/abc-123?tab=tracking');
});
```
