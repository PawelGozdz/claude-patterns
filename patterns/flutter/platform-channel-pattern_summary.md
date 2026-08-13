# Platform Channel Contract — Rule Card

**Tags**: "mobile:platform:channel"
<!-- Egzekwowalne streszczenie platform-channel-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (case study, real-code przykłady, uzasadnienie): platform-channel-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: każdy `MethodChannel('...')` w `lib/**`
oraz odpowiadający mu kod w `android/**/*.kt`, `ios/**/*.swift`, `macos/**/*.swift`

**Geneza (audyt 2026-08, juz-ide-mobile-app):** 6 kanałów zadeklarowanych po
stronie Dart (`anti_debug`, `rasp`, `app_integrity`, `device_security`,
`unified`, `local_hero/memory`), **zero** `setMethodCallHandler` po stronie
natywnej (`MainActivity.kt` — gołe 7 linii `FlutterActivity`; `AppDelegate.swift`
— tylko `GeneratedPluginRegistrant`). Efekt: root/jailbreak detection,
anti-debug i weryfikacja podpisu apki zawsze zwracały „czysto" — nie bo
urządzenie było bezpieczne, tylko bo `try { invokeMethod(...) } catch (e) { return false; }`
cicho łykał `MissingPluginException`.

## MUST

- **PC1** — Każdy `MethodChannel('x')` zadeklarowany w `lib/**` ma
  odpowiadający `setMethodCallHandler` w `MainActivity.kt` (Android) I
  `AppDelegate.swift`/`MainFlutterWindow.swift` (iOS/macOS) dla każdej
  platformy, na której kod Dart faktycznie go woła.
- **PC2** — `invokeMethod` łapie `on MissingPluginException catch (e)`
  **osobną gałęzią** od `on PlatformException catch (e)` — brak handlera
  (błąd konfiguracji) nie może być nierozróżnialny od błędu logiki natywnej.
- **PC3** — `MissingPluginException` złapany na kanale bezpieczeństwa/integralności
  jest raportowany (crash reporter / `Sentry.captureException`/log
  strukturalny) **niezależnie od `kDebugMode`** — nie tylko `debugPrint` pod
  `kDebugMode`, bo to znika w release, gdzie regresja faktycznie się dzieje.
- **PC4** — Wynik sprawdzenia bezpieczeństwa na platform channel jest
  trójwartościowy (`secure`/`insecure`/`unavailable` lub odpowiednik) —
  `unavailable` nie jest cicho mapowane na `false`/„bezpiecznie".
- **PC5** — Ścieżki wysokiego ryzyka (płatność, zmiana hasła, ujawnienie
  PII) traktują `unavailable` jako **fail-closed** — blokują operację albo
  wymuszają dodatkowy krok, nie kontynuują tak jak przy `secure`.
- **PC6** — Istnieje health-check (`ping`/`healthCheck` na każdym kanale +
  test/runtime-check przy starcie), który wykrywa martwy kanał w
  prawdziwym buildzie — nie tylko unit test z zamockowanym `MethodChannel`.
- **PC7** — Natywny handler ma jawną gałąź `else -> result.notImplemented()`
  (Kotlin) / `default: result(FlutterMethodNotImplemented)` (Swift) —
  nieznana metoda na żywym kanale nie jest cicho ignorowana.

## MUST NOT

- **N1** — ❌ `await _channel.invokeMethod(...) ?? false` jako jedyna
  obsługa — zamienia „brak odpowiedzi" w „odpowiedź negatywna" (PC4).
- **N2** — ❌ `catch (e) { return false; }` / `catch (e) { return null; }`
  obejmujące zarówno `MissingPluginException`, jak i błędy logiki, bez
  rozróżnienia (PC2).
- **N3** — ❌ Nowy `MethodChannel(...)` dodany w PR-ze, który nie dotyka
  `MainActivity.kt` ani `AppDelegate.swift` — czerwona flaga do
  zatrzymania review, nie automatyczny VETO (może kanał już istniał), ale
  wymaga potwierdzenia.
- **N4** — ❌ Własny `MethodChannel` dla funkcjonalności pokrytej dojrzałym
  pluginem pub.dev (`local_auth`, `device_info_plus`, `package_info_plus`).
- **N5** — ❌ Test „na kanał" ograniczony do zamockowanego
  `TestDefaultBinaryMessengerBinding` bez żadnego runtime/health-check
  na prawdziwym buildzie (PC6).

## Minimal correct skeleton

```dart
// lib/core/security/device_security_service.dart
enum SecurityCheckStatus { secure, insecure, unavailable }

static Future<SecurityCheckStatus> debuggerStatus() async {
  try {
    final attached = await _channel.invokeMethod<bool>('isDebuggerAttached');
    if (attached == null) return SecurityCheckStatus.unavailable;
    return attached ? SecurityCheckStatus.insecure : SecurityCheckStatus.secure;
  } on MissingPluginException catch (e) {           // PC2
    _reportChannelMisconfiguration('device_security', e); // PC3
    return SecurityCheckStatus.unavailable;           // PC4 — nie "secure"
  } on PlatformException {
    return SecurityCheckStatus.unavailable;
  }
}
```

```kotlin
// android/app/src/main/kotlin/.../MainActivity.kt
override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.app/device_security")
        .setMethodCallHandler { call, result ->                // PC1
            when (call.method) {
                "isDebuggerAttached" -> result.success(Debug.isDebuggerConnected())
                "ping" -> result.success(true)                   // PC6
                else -> result.notImplemented()                  // PC7
            }
        }
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `const _channel = MethodChannel(...)` w `lib/` bez `grep setMethodCallHandler` trafienia w `android/`+`ios/` dla tej nazwy | **PC1 / N3** |
| `invokeMethod(...) ?? false` bez `on MissingPluginException` osobno | **PC2 / N1** |
| `catch (e) { return false; }` łączący config-error z logic-error | **PC2 / N2** |
| `debugPrint` jedyny ślad `MissingPluginException` na kanale bezpieczeństwa | **PC3** |
| Funkcja zwraca `bool`, nie trójwartościowy status, dla security-check | **PC4** |
| Brak metody `ping`/health-check na kanale bezpieczeństwa | **PC6** |
| Natywny `when`/`switch` bez `else`/`default` | **PC7** |
| Nowy `MethodChannel` zamiast istniejącego pluginu pub.dev | **N4** |

**Pełny wzorzec**: [`platform-channel-pattern.md`](./platform-channel-pattern.md)
