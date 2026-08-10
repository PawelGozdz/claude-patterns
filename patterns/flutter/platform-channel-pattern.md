# Pattern: Platform Channel Contract

**Layer**: Infrastructure
**Status**: production

## What This Is

`MethodChannel` to most między kodem Dart a kodem natywnym (Kotlin/Swift) —
ale to most, który **nie ma żadnej gwarancji kompilatora, że druga strona
istnieje**. Deklaracja `const _channel = MethodChannel('com.app/foo')` po
stronie Dart kompiluje się, uruchamia i wygląda identycznie niezależnie od
tego, czy ktokolwiek zarejestrował `setMethodCallHandler` po stronie
natywnej. Jeśli nikt tego nie zrobił, każde `invokeMethod` rzuca
`MissingPluginException` w runtime — nie w czasie kompilacji, nie przy
starcie aplikacji, tylko dokładnie w momencie wywołania.

Ten wzorzec kodyfikuje kontrakt, który to wykrywa i uniemożliwia mu
przejść niezauważonym: (1) każdy kanał ma zarejestrowaną parę Dart↔natywna
po OBU stronach, (2) `MissingPluginException` jest łapany osobno od błędów
logiki biznesowej i traktowany jako **błąd konfiguracji**, nie jako wynik,
(3) fallback dla sprawdzenia bezpieczeństwa jest fail-closed albo zwraca
jawnie „nieznane" — nigdy cicho „bezpiecznie", (4) istnieje test/health-check
weryfikujący, że kanał faktycznie odpowiada, nie tylko że się kompiluje.

### Case study: sześć martwych kanałów w `juz-ide-mobile-app`

Audyt tego repo znalazł dokładnie ten błąd, żywy i w produkcji. Dart
deklaruje sześć kanałów:

| Kanał | Plik Dart | Cel |
|---|---|---|
| `com.localhero.security/anti_debug` | `anti_debugging_service.dart` | wykrywanie debuggera |
| `com.localhero.security/rasp` | `rasp_service.dart` | runtime app self-protection |
| `com.juzide.security/app_integrity` | `app_integrity_service.dart` | weryfikacja podpisu apki |
| `com.localhero.security/device_security` | `device_security_service.dart` | root/jailbreak detection |
| `com.localhero.security/unified` | `security_platform_service.dart` | zunifikowane API bezpieczeństwa |
| `local_hero/memory` | `memory_pressure_provider.dart` | info o pamięci urządzenia |

Strona natywna:

```kotlin
// android/app/src/main/kotlin/pl/juzide/mobile/MainActivity.kt — CAŁY plik
package pl.juzide.mobile

import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity() {
}
```

```swift
// ios/Runner/AppDelegate.swift — CAŁY plik poza boilerplate'em
import UIKit
import Flutter

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

`grep -rn "setMethodCallHandler" android/ ios/` zwraca **zero wyników** w
całym repo. Sześć kanałów zadeklarowanych po stronie Dart, zero
zarejestrowanych po stronie natywnej. Efekt: root detection, jailbreak
detection, anti-debug i weryfikacja podpisu aplikacji **zawsze zwracają
"czysto"** — nie dlatego, że urządzenie jest bezpieczne, tylko dlatego, że
warstwa, która miała to sprawdzić, nigdy nie odpowiada.

## When to Use

**Use this pattern for:**
- ✅ Potrzebujesz natywnej możliwości, dla której nie istnieje dojrzały
  plugin na pub.dev (custom SDK producenta, integracja z proprietarnym
  API systemu, mechanizm bezpieczeństwa specyficzny dla platformy)
- ✅ Sprawdzenie musi faktycznie wykonać się po stronie natywnej (root
  detection, weryfikacja podpisu APK/IPA, dostęp do niskopoziomowego API
  systemowego) — nie da się tego uczciwie zasymulować w czystym Dart
- ✅ Wynik kanału wpływa na decyzję bezpieczeństwa (blokada funkcji,
  wymuszenie re-auth, telemetria zagrożenia)
- ✅ Kanał już istnieje w projekcie i trzeba zweryfikować/naprawić kontrakt
  po obu stronach (dokładnie sytuacja z case study wyżej)

**Do NOT use for:**
- ❌ Istnieje dojrzały, utrzymywany plugin na pub.dev pokrywający tę samą
  funkcjonalność (`local_auth` dla biometrii, `device_info_plus` dla ID
  urządzenia, `package_info_plus` dla wersji apki) — własny kanał to
  dodatkowy kod do utrzymania bez żadnej przewagi
- ❌ Rzecz da się zrobić czystym Dartem (parsowanie, walidacja, logika
  biznesowa) — platform channel to koszt (serializacja, dwie
  implementacje, dwa miejsca na bugi), nie ozdoba
- ❌ Prototyp/spike, gdzie wynik i tak nie trafi do produkcji — narzut
  utrzymania kontraktu po obu stronach nie zwraca się dla kodu jednorazowego

## Implementation

### 1. Kanał ma parę Dart↔natywna zarejestrowaną po obu stronach

Deklaracja po stronie Dart to tylko połowa kontraktu. Druga połowa —
rejestracja handlera w `MainActivity.kt` i `AppDelegate.swift` — jest
równie obowiązkowa i równie łatwa do pominięcia, bo Dart nie da żadnego
ostrzeżenia kompilacyjnego, gdy jej brakuje.

```dart
// WRONG (obecny stan) — kanał zadeklarowany, ale nikt po drugiej stronie
// nie odbiera; kompiluje się, uruchamia, "działa" aż do pierwszego invokeMethod
class DeviceSecurityService {
  static const _channel = MethodChannel('com.localhero.security/device_security');

  static Future<void> _checkAndroidRoot() async {
    // ... 20 ścieżek plikowych sprawdzanych po stronie Dart (rozsądne),
    // ale docelowo i tak woła natywne sprawdzenia niżej w tym samym pliku
  }
}
```

```kotlin
// CORRECT — MainActivity rejestruje handler dla KAŻDEGO kanału z Dart
package pl.juzide.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val securityChannel = "com.localhero.security/device_security"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, securityChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isDeviceRooted" -> result.success(RootChecker.isRooted(this))
                    "isDebuggerAttached" -> result.success(Debug.isDebuggerConnected())
                    else -> result.notImplemented() // metoda nieznana ≠ kanał martwy
                }
            }
    }
}
```

```swift
// CORRECT — AppDelegate rejestruje ten sam kanał na iOS
import UIKit
import Flutter

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    let controller = window?.rootViewController as! FlutterViewController
    let securityChannel = FlutterMethodChannel(
      name: "com.localhero.security/device_security",
      binaryMessenger: controller.binaryMessenger)

    securityChannel.setMethodCallHandler { call, result in
      switch call.method {
      case "isDeviceRooted":
        result(JailbreakChecker.isJailbroken())
      case "isDebuggerAttached":
        result(DebuggerChecker.isAttached())
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

Reguła praktyczna: jeśli dodajesz `MethodChannel(...)` po stronie Dart w
tym samym PR-ze, w którym nie zmieniasz ani `MainActivity.kt`, ani
`AppDelegate.swift` (ani ich odpowiedników `MainFlutterWindow.swift` na
macOS) — to jest czerwona flaga do zatrzymania się i sprawdzenia, czy
kanał już wcześniej istniał po stronie natywnej.

### 2. `MissingPluginException` łapane osobno od błędów logiki

To jest serce błędu w tym repo. Każda metoda `_checkXxx()` w
`AntiDebuggingService`/`RASPService`/`SecurityPlatformService` ma ten sam
kształt:

```dart
// WRONG — z anti_debugging_service.dart, powtórzone ~15 razy w tym pliku
static Future<void> _checkDebuggerAttachment() async {
  try {
    final bool nativeDebugger =
        await _channel.invokeMethod('isDebuggerAttached') ?? false;
    if (nativeDebugger) {
      _addDebugThreat(DebugThreat.debuggerAttached, 'Native debugger attached');
    }
    // ...
  } catch (e) {
    if (kDebugMode) {
      debugPrint('Debugger check failed: $e'); // w release: nic. Żadnego śladu.
    }
    // brak throw, brak rethrow, brak sygnału do wywołującego — metoda po
    // prostu kończy się tak, jakby debugger nie był podłączony
  }
}
```

`invokeMethod` bez zarejestrowanego handlera rzuca `MissingPluginException`.
Ten `catch (e)` łapie ją identycznie jak złapałby prawdziwy błąd logiki
(np. natywny kod, który faktycznie rzucił wyjątek podczas sprawdzania). W
obu przypadkach skutek jest ten sam: metoda cicho kończy, `nativeDebugger`
nigdy nie zostaje ustawione na `true`, `_addDebugThreat` nigdy nie zostaje
wywołane. **Kanał martwy i kanał żywy-ale-zwracający-false są nierozróżnialne**
z perspektywy wywołującego kodu.

```dart
// CORRECT — MissingPluginException to osobna gałąź, nie "błąd jak każdy inny"
static Future<CheckResult<bool>> _checkDebuggerAttachment() async {
  try {
    final attached = await _channel.invokeMethod<bool>('isDebuggerAttached');
    return CheckResult.ok(attached ?? false);
  } on MissingPluginException catch (e) {
    // Kanał nie ma handlera po stronie natywnej — to błąd KONFIGURACJI,
    // nie wynik sprawdzenia. Musi być widoczny i w debug, i w release.
    _reportChannelMisconfiguration('anti_debug', 'isDebuggerAttached', e);
    return CheckResult.unavailable();
  } on PlatformException catch (e) {
    // Handler istnieje, ale natywna implementacja rzuciła błąd domenowy —
    // to faktyczny błąd sprawdzenia, nie brak kanału.
    return CheckResult.error(e.message ?? 'platform error');
  }
}
```

Rozróżnienie ma znaczenie operacyjne: `MissingPluginException` powinien
trafić do crash reportera przy starcie aplikacji (regresja w buildzie —
ktoś usunął rejestrację natywną albo dodał nowy kanał bez drugiej strony),
podczas gdy `PlatformException` z natywnej implementacji to normalny,
oczekiwany błąd domenowy do obsłużenia lokalnie.

### 3. Fail-closed albo jawne „nieznane" — nigdy ciche „bezpiecznie"

Wzorzec `?? false` powtórzony w `SecurityPlatformService` (i pochodnych)
zamienia **brak odpowiedzi** w **odpowiedź negatywną** — dla sprawdzenia
bezpieczeństwa to najgorszy możliwy wybór domyślny, bo "nie wiem" i
"bezpiecznie" stają się tym samym bitem.

```dart
// WRONG — z security_platform_service.dart
static Future<bool> isDebuggerAttached() async {
  try {
    final result = await _channel.invokeMethod('isDebuggerAttached');
    return result as bool? ?? false; // brak odpowiedzi === "nie ma debuggera"
  } catch (e) {
    return false; // wyjątek (w tym MissingPluginException) === "nie ma debuggera"
  }
}
```

```dart
// CORRECT — trójwartościowy wynik zamiast bool; wywołujący decyduje,
// jak traktować "unavailable" (fail-closed dla krytycznych ścieżek)
enum SecurityCheckStatus { secure, insecure, unavailable }

static Future<SecurityCheckStatus> debuggerStatus() async {
  try {
    final attached = await _channel.invokeMethod<bool>('isDebuggerAttached');
    if (attached == null) return SecurityCheckStatus.unavailable;
    return attached ? SecurityCheckStatus.insecure : SecurityCheckStatus.secure;
  } on MissingPluginException {
    return SecurityCheckStatus.unavailable; // kanał martwy ≠ "bezpiecznie"
  } on PlatformException {
    return SecurityCheckStatus.unavailable;
  }
}

// Wywołujący decyduje o polityce per-ścieżka:
Future<void> gateHighRiskAction() async {
  final status = await SecurityPlatformService.debuggerStatus();
  if (status != SecurityCheckStatus.secure) {
    // fail-closed: "unavailable" traktowane tak samo jak "insecure"
    // dla operacji wysokiego ryzyka (np. wypłata, zmiana hasła)
    throw SecurityGateException('Security check unavailable or failed: $status');
  }
}
```

Który wybór dla `unavailable` (fail-closed vs. degradacja z telemetrią)
zależy od ryzyka operacji — ale wybór musi być **świadomy i widoczny w
kodzie wywołującym**, nie ukryty w domyślnej wartości `?? false` trzy
warstwy niżej.

### 4. Test/health-check weryfikujący, że kanał faktycznie odpowiada

Test jednostkowy na logikę Dart (mockujący `MethodChannel` przez
`TestDefaultBinaryMessengerBinding`) nie wykrywa tego buga — sprawdza
logikę przy założeniu, że handler istnieje. Potrzebny jest osobny,
zgrubny health-check, uruchamiany na starcie aplikacji (debug i release),
który potwierdza żywy kontrakt:

```dart
// core/security/channel_health_check.dart
class ChannelHealthCheck {
  static final _channels = <String, MethodChannel>{
    'anti_debug': const MethodChannel('com.localhero.security/anti_debug'),
    'rasp': const MethodChannel('com.localhero.security/rasp'),
    'app_integrity': const MethodChannel('com.juzide.security/app_integrity'),
    'device_security': const MethodChannel('com.localhero.security/device_security'),
  };

  /// Woła metodę `ping` (musi być zaimplementowana natywnie na każdym
  /// kanale wyłącznie do tego celu) i zwraca kanały, które nie odpowiadają.
  /// Wołane raz przy starcie aplikacji, wynik trafia do crash reportera —
  /// martwy kanał bezpieczeństwa to bug wdrożeniowy, nie cicha degradacja.
  static Future<List<String>> findDeadChannels() async {
    final dead = <String>[];
    for (final entry in _channels.entries) {
      try {
        await entry.value.invokeMethod('ping').timeout(const Duration(seconds: 2));
      } on MissingPluginException {
        dead.add(entry.key);
      } on TimeoutException {
        dead.add(entry.key);
      } catch (_) {
        // inny błąd = kanał ODPOWIADA (handler istnieje), więc nie jest martwy
      }
    }
    return dead;
  }
}
```

Metoda `ping` po natywnej stronie to kilka linii (`result.success(true)`),
ale jej brak jest dokładnie tym, co pozwoliło sześciu kanałom w
`juz-ide-mobile-app` być martwymi przez cały cykl developmentu bez
jednego czerwonego testu.

## Anti-Patterns

### Kanał zadeklarowany bez natywnego handlera (ten dokładny bug)

```dart
// WRONG — cały wzorzec z tego repo w skrócie
class AnyPlatformSecurityService {
  static const _channel = MethodChannel('com.app/whatever');

  static Future<bool> check() async {
    try {
      return await _channel.invokeMethod('check') ?? false;
    } catch (e) {
      return false; // MissingPluginException ląduje tutaj i znika
    }
  }
}
```

Objaw w audycie: `grep -rn "MethodChannel(" lib/` zwraca N kanałów,
`grep -rn "setMethodCallHandler" android/ ios/` zwraca zero. Każdy kanał
z listy po lewej bez odpowiednika po prawej jest martwy — sprawdź to
grepem PRZED code review, nie po incydencie.

### `try/catch` z fallbackiem `?? false` na sprawdzeniu bezpieczeństwa

Opisane w sekcji 3 wyżej — powtórzone tu jako samodzielny anti-pattern, bo
to najczęstszy sposób, w jaki martwy kanał zamienia się w fałszywe
poczucie bezpieczeństwa: `isDeviceRooted() ?? false`,
`isDebuggerAttached() ?? false`, `isJailbroken() ?? false` — każdy z nich
zwraca "nie" zarówno gdy urządzenie faktycznie jest czyste, jak i gdy
kanał nigdy nie odpowiedział.

### Brak rozróżnienia „metoda nieznana" od „kanał martwy"

Po stronie natywnej `result.notImplemented()` (Android) i
`FlutterMethodNotImplemented` (iOS) sygnalizują "ten konkretny `call.method`
nie jest obsługiwany" — to inny stan niż "kanał w ogóle nie ma handlera"
(co po stronie Dart i tak objawia się jako `MissingPluginException`, tyle
że dla WSZYSTKICH metod na tym kanale, nie dla jednej). Pisanie `when`/`switch`
bez gałęzi `else -> result.notImplemented()` po stronie natywnej ukrywa
literówki w nazwie metody za tym samym objawem co brak całego kanału —
utrudnia diagnozę, bo trzeba osobno sprawdzić "czy kanał w ogóle istnieje"
i "czy ta metoda na nim istnieje".

### Health-check pominięty, bo „przecież są testy jednostkowe"

Testy jednostkowe logiki Dart z zamockowanym `MethodChannel` (przez
`TestDefaultBinaryMessengerBinding.instance.channelBuffers.setMockMethodCallHandler`)
weryfikują poprawność kodu Dart **przy założeniu, że handler natywny
istnieje** — nie weryfikują, że faktycznie istnieje w prawdziwym buildzie
na Androidzie/iOS. To dwa różne pytania. Zielony CI z mockami i sześć
martwych kanałów w produkcji to nie sprzeczność — to dokładnie stan, w
jakim był ten projekt.
