# Reguły Dart / Flutter

Indeks reguł kodowania dla stacku `flutter` + `clean-arch` (ADR 0008).
Odpowiednik `rules/nestjs-ddd/README.md` po stronie mobilnej.

**Jak to czytać**: implementerzy i weryfikatory mają **przeczytać plik reguły
odpowiedni dla edytowanego obszaru PRZED zmianą kodu** — nie wciągać wszystkich
reguł do promptu naraz. Inline'owanie całego katalogu marnuje kontekst przy
każdym uruchomieniu agenta i przy każdym spawnie subagenta.

| plik | zakres | egzekwowane przez |
|---|---|---|
| [`coding-style.md`](coding-style.md) | konwencje Dart, nazewnictwo, organizacja plików | review, `ecc:flutter-reviewer` |
| [`patterns.md`](patterns.md) | zależności między warstwami Clean Architecture | `check-clean-arch.js`, `check-flutter-imports.js` |
| [`design-system.md`](design-system.md) | DS-007: zero hardkodowanych `TextStyle`, tokeny zamiast literałów | `check-typography-tokens.js`, `check-design-tokens.js` |
| [`l10n.md`](l10n.md) | wszystkie teksty UI przez ARB, zakaz literałów | `check-l10n-hardcoded.js` |
| [`security.md`](security.md) | przechowywanie sekretów, higiena logów | `check-debugprint-guard.js`, `@flutter-security-verifier` |
| [`testing.md`](testing.md) | piramida testów, testy widgetowe i golden | `@flutter-quality-verifier` |
| [`hooks.md`](hooks.md) | opis samych hooków wymuszających powyższe | — (dokumentacja) |

## Powiązane wzorce

Reguła mówi **co wolno**, wzorzec pokazuje **jak to zrobić**. Pełne wzorce
z przykładami realnego kodu leżą w [`patterns/flutter/`](../../patterns/flutter/):

- architektura → `clean-architecture-pattern.md`, `either-error-pattern.md`
- stan → `riverpod-state-pattern.md`, `freezed-immutability-pattern.md`
- wygląd → `design-token-pattern.md`, `component-creation-pattern.md`
- bezpieczeństwo → `mobile-security-pattern.md`, `platform-channel-pattern.md`
- dane offline → `offline-first-pattern.md`
- dostępność i języki → `accessibility-pattern.md`, `localization-pattern.md`

Każdy z nich ma zwięzłą kartę reguł `*_summary.md` przeznaczoną do wstrzykiwania
agentom — czytaj kartę, gdy potrzebujesz samych reguł, a pełny wzorzec, gdy
potrzebujesz przykładu.

## Konfiguracja hooków

Progi i zakresy są sterowane plikiem `flutter-hooks.json` w katalogu projektu
(szablon: [`templates/flutter-hooks.json`](../../templates/flutter-hooks.json)).
Brak tego pliku = hooki milkną, więc w projekcie nie-Flutterowym nic nie hałasuje.
