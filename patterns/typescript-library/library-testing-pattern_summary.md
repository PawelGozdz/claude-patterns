# Library Testing — Rule Card

**Tags**: "lib:tests"
<!-- Egzekwowalne streszczenie library-testing-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): library-testing-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Testing · **Applies to**: `packages/*/src/**/*.spec.ts`, testy kontraktowe publicznego API, testy spakowanego artefaktu, konfiguracja runnera

## MUST

- **LT1** — Testy kontraktowe importują wyłącznie z publicznego wejścia pakietu (barrel export po nazwie, np. `@scope/pkg`) — nigdy ze ścieżki wewnętrznej/relatywnej.
- **LT2** — Każdy zadeklarowany eksport publiczny ma test walidacji eksportów (istnienie + poprawny typ w runtime); usunięcie eksportu wywala test.
- **LT3** — Asercje typów (`expect-type`/`tsd`) istnieją dla publicznych typów i sprawdzają się w compile-time, nie przez rzutowanie `as any` w runtime.
- **LT4** — Generyczne/czyste funkcje narzędziowe (value objects, operacje matematyczne) mają pokrycie property-based (fast-check), nie tylko testy przykładowe.
- **LT5** — Fixture'y kompatybilności wstecznej (zserializowane dane ze starszych wersji) są przechwycone raz i nigdy nie modyfikowane.
- **LT6** — Testy bundla weryfikują, że skompilowany `dist/` rozwiązuje się zarówno jako CJS (`require`), jak i ESM (`import`), oraz że `.d.ts` istnieje.
- **LT7** — Istnieje test spakowanego artefaktu (`test:package`/`test:smoke`/`test:consumer`): `npm pack` → instalacja tarballa w tymczasowym scratch-projekcie → import PO NAZWIE PAKIETU → sprawdzenie, że rozwiązują się ESM, CJS i typy z tego, co faktycznie trafi do rejestru — nie z `dist/` na dysku.
- **LT8** — W monorepo, gdzie pakiety zależą od siebie nawzajem, gotowość do publikacji całego zestawu jest testowana przez lokalny rejestr (np. Verdaccio: publikacja + instalacja wszystkich pakietów), nie przez `npm pack` pojedynczego pakietu z osobna.

## MUST NOT

- **N1** — ❌ Import z `../src/internal/...` lub innej ścieżki relatywnej w teście zamiast z nazwy pakietu — test przechodzi, ale konsument nie ma takiego dostępu (łamie LT1).
- **N2** — ❌ Testowanie typów przez rzutowanie `as any` zamiast `expectTypeOf`/`tsd` — omija system typów, fałszywe poczucie bezpieczeństwa (łamie LT3).
- **N3** — ❌ Testy kontraktowe pokrywają tylko happy path — brak asercji na typ/treść rzucanego błędu; obsługa błędów jest częścią kontraktu.
- **N4** — ❌ Mockowanie wewnętrznych elementów własnego pakietu w jego testach — test staje się tautologiczny; mockuje się tylko zależności zewnętrzne.
- **N5** — ❌ Generator property-based bez ograniczonego zakresu — testy timeout'ują lub trafiają w przypadki niezwiązane z logiką biznesową.
- **N6** — ❌ Traktowanie testu na `dist/` (LT6) jako dowodu gotowości do publikacji — bez testu spakowanego artefaktu (LT7) `files`/`.npmignore` może wyciąć plik, którego test na `dist/` nie zauważy, a `exports` może działać po ścieżce, a nie po nazwie pakietu.

## Piramida testów biblioteki

| Poziom | Co testuje | Na czym operuje |
|---|---|---|
| Kontraktowe (LT1) | Zachowanie publicznego API tak, jak używa go konsument | źródło, import po alias/nazwie pakietu |
| Walidacja eksportów (LT2) | Kompletność i typ każdego eksportu; brak wycieku internals | źródło |
| Typów (LT3) | Kontrakt typów w compile-time | źródło, `.d.ts` wywnioskowane |
| Property-based (LT4) | Niezmienniki funkcji generycznych/czystych | źródło |
| Kompatybilności (LT5) | Deserializacja danych ze starszych wersji nadal działa | źródło, zamrożone fixtures |
| Bundla (LT6) | Skompilowany `dist/` rozwiązuje się jako CJS i ESM, `.d.ts` obecny | `dist/` |
| Spakowanego artefaktu (LT7/LT8) | Realny konsument importujący po nazwie pakietu dostaje działający ESM+CJS+typy z tego, co realnie trafi do rejestru | tarball `npm pack` (lub lokalny rejestr Verdaccio dla zestawu pakietów monorepo) w scratch-projekcie |

## Minimal correct skeleton

```ts
// packages/payments/src/__tests__/contract/create-payment.contract.spec.ts
import { describe, it, expect } from 'vitest';

// LT1: import z nazwy pakietu, nie ze ścieżki wewnętrznej
import { createPaymentIntent, amountInCents, currencyCode } from '@scope/payments';

describe('createPaymentIntent contract', () => {
  it('returns a pending intent for a valid amount', async () => {
    const intent = await createPaymentIntent({
      amount: amountInCents(1999),
      currency: currencyCode('USD'),
    });

    expect(intent).toMatchObject({ amount: 1999, currency: 'USD', status: 'pending' });
  });
});
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| Test importuje z `../src/internal/...` lub innej ścieżki relatywnej zamiast z publicznego wejścia pakietu | **LT1 / N1** |
| Nowy eksport dodany do barrela bez wpisu w tabeli `expectedExports` testu walidacji eksportów | **LT2** |
| Zmiana typu publicznego sprawdzana wyłącznie przez `as any`, brak `expectTypeOf`/`tsd` | **LT3 / N2** |
| Value object / czysta funkcja ma tylko testy przykładowe, brak `fc.assert`/`fc.property` | **LT4** |
| Plik fixture kompatybilności zmodyfikowany w kolejnym commicie (zamiast dodania nowego) | **LT5** |
| Testy bundla (`dist/...`) istnieją, ale brak skryptu/testu `test:package`/`test:smoke`/`test:consumer` | **LT7 / N6** |
| Pakiet w monorepo z zależnościami do sibling-workspace testowany tylko przez `npm pack` bez lokalnego rejestru | **LT8** |
| Test kontraktowy nie ma ani jednej asercji na rzucany błąd/typ błędu | **N3** |
| Mock importowany z tego samego pakietu, który jest testowany | **N4** |
| Generator `fc.integer()`/`fc.string()` bez `min`/`max` lub innego ograniczenia | **N5** |

**Pełny wzorzec**: [`library-testing-pattern.md`](./library-testing-pattern.md)
