---
paths:
  - "**/*.dart"
---
# Flutter Security

## Secure Storage

```dart
// ALWAYS: Use flutter_secure_storage for sensitive data
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = const FlutterSecureStorage();
await storage.write(key: 'auth_token', value: token);
final token = await storage.read(key: 'auth_token');

// NEVER: Store tokens in SharedPreferences or Hive unencrypted
// SharedPreferences stores in plaintext XML/plist
```

## No Hardcoded Keys

```dart
// NEVER: Hardcode API keys, secrets, or credentials
const apiKey = 'sk-abc123...';  // BAD

// PREFER: Environment variables via --dart-define
const apiKey = String.fromEnvironment('API_KEY');

// OR: .env file with flutter_dotenv (excluded from git)
final apiKey = dotenv.env['API_KEY'];
```

## Certificate Pinning

```dart
// Pin certificates for API communication
final dio = Dio();
(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  final client = HttpClient();
  client.badCertificateCallback = (cert, host, port) {
    // Validate against known certificate fingerprint
    return cert.sha256 == expectedFingerprint;
  };
  return client;
};
```

## Input Validation

```dart
// Validate all user input before sending to API
// Use form validators
TextFormField(
  validator: (value) {
    if (value == null || value.isEmpty) return 'Required';
    if (!EmailValidator.validate(value)) return 'Invalid email';
    return null;
  },
);
```

## Obfuscation

```bash
# Always build release with obfuscation
flutter build apk --obfuscate --split-debug-info=build/debug-info/
flutter build ios --obfuscate --split-debug-info=build/debug-info/
```

## Network Security

- Use HTTPS only — never HTTP for production
- Set `android:usesCleartextTraffic="false"` in AndroidManifest
- Configure App Transport Security in iOS Info.plist
- Implement token refresh with secure interceptors

## Deep Link Validation

```dart
// Validate deep link parameters before navigation
GoRoute(
  path: '/user/:id',
  redirect: (context, state) {
    final id = state.pathParameters['id'];
    if (id == null || !RegExp(r'^[a-zA-Z0-9-]+$').hasMatch(id)) {
      return '/home'; // Reject malformed IDs
    }
    return null;
  },
);
```
