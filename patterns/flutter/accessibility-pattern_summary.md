# Accessibility (Flutter) — Rule Card

**Tags**: "mobile:ui:accessibility"
<!-- Egzekwowalne streszczenie accessibility-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, real-code przykłady): accessibility-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: `.dart` w `lib/**/presentation/**` z widgetem

**Scope**: project-specific (juz-ide-mobile-app) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "juz-ide-mobile-app"` to include it. Promote to universal once a second project adopts
this shape.

interaktywnym (`onTap`/`onPressed`/`GestureDetector`/`InkWell`) lub renderujący tekst;
`lib/core/design/tokens/**`; `lib/core/motion/**`

## MUST

- **A1** — Obszar dotykowy elementu interaktywnego ≥ 44×44dp; mniejszy element wizualny → obszar dotyku powiększony paddingiem, nie samą ikoną.
- **A2** — Tekst główny ≥ 16px, elementy interaktywne ≥ 14px, przez token rozmiaru czcionki.
- **A3** — Para (kolor tekstu, kolor tła) z tokenu z gwarantowanym kontrastem ≥ 4.5:1 (zwykły) / ≥ 3:1 (duży tekst) — nie `Color(0xFF...)` ręcznie.
- **A4** — Custom interaktywny widget bez wbudowanej semantyki ma `Semantics(label:, button: true)`. Natywne Material widgety — bez dodatkowego `Semantics`, chyba że nadpisujesz etykietę.
- **A5** — Gdy zewnętrzny `Semantics` niesie skomponowaną etykietę, wewnętrzne dzieci owinięte w `ExcludeSemantics` — zapobiega podwójnemu odczytowi.
- **A6** — Layout tekstu bez sztywnej `height`/`maxLines` tam, gdzie ucięcie przy skalowaniu 200% (`MediaQuery.textScaler`) jest niedopuszczalne.
- **A7** — Animacje sprawdzają `MediaQuery.of(context).disableAnimations` i przy `true` renderują stan końcowy natychmiast.
- **A8** — Status krytyczny (błąd/sukces/ostrzeżenie) niesiony kolorem MA też drugi, niezależny nośnik (ikona/kształt/tekst).
- **A9** — Formularz wieloetapowy ma jawny łańcuch fokusu (`FocusNode`) odpowiadający kolejności wizualnej.

## MUST NOT

- **N1** — ❌ `GestureDetector`/`InkWell` na elemencie < 44×44dp bez powiększenia obszaru dotyku.
- **N2** — ❌ `Semantics(label:)` identyczny z widocznym `Text` dziecka — podwójny odczyt.
- **N3** — ❌ Tekst w kontenerze o stałej `height` bez `Wrap`/`Flexible` — ucina się przy 200%.
- **N4** — ❌ Kolor jako jedyny nośnik informacji o statusie.
- **N5** — ❌ Dekoracyjna ikona bez `ExcludeSemantics`, obok tekstu niosącego tę samą informację.
- **N6** — ❌ Animacja skracana zamiast pomijana przy `disableAnimations == true`.
- **N7** — ❌ Hardkodowany hex koloru zamiast tokenu z gwarantowanym kontrastem.

## Minimal correct skeleton

```dart
GestureDetector(
  onTap: _onDelete,
  child: Semantics(                                                  // A4
    button: true, label: l10n.deleteButtonLabel,
    child: Padding(
      padding: const EdgeInsets.all(10),                             // A1: 24+2*10=44
      child: Icon(Icons.delete, size: 24),
    ),
  ),
)

Semantics(                                                            // A5
  label: l10n.stepSemanticLabel(stepNumber, stepText),
  child: ExcludeSemantics(child: Row(children: [StepIcon(stepNumber), Text(stepText)])),
)

final reducedMotion = MediaQuery.of(context).disableAnimations;       // A7
return reducedMotion ? _EndState() : AnimatedContainer(duration: motionSpec.duration, child: _EndState());

Row(children: [                                                       // A8
  Icon(isOverdue ? Icons.error : Icons.check_circle, color: isOverdue ? tokens.error : tokens.success),
  Text(isOverdue ? l10n.statusOverdue : l10n.statusPaid),
])
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `GestureDetector`/`InkWell` na `Icon(size: <44)` bez powiększającego `padding`/`Container` | **A1 / N1** |
| `TextStyle(fontSize: <16\|<14)` literałem zamiast tokenu | A2 |
| `Color(0xFF...)` jako kolor tekstu bez tokenu | **A3 / N7** |
| Custom `GestureDetector` bez `Semantics(button: true, label:)` | **A4** |
| `Semantics(label: 'X')` opakowujący `Text('X')` | **A5 / N2** |
| `Container(height: <stała>, child: Text(...))` bez `Wrap`/`Flexible` | **A6 / N3** |
| `AnimatedContainer` bez sprawdzenia `disableAnimations` | **A7 / N6** |
| Status renderowany wyłącznie jako `color: red/green` | **A8 / N4** |
| Dekoracyjne ikony bez `ExcludeSemantics` obok tekstu z tą samą wartością | **A5 / N5** |
| Formularz wieloetapowy bez `FocusNode`/`onFieldSubmitted` | A9 |

**Pełny wzorzec**: [`accessibility-pattern.md`](./accessibility-pattern.md)
