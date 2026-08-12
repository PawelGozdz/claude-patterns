# Backward Compatibility — Rule Card
<!-- Egzekwowalne streszczenie backward-compatibility-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, decision tree): backward-compatibility-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Architecture · **Applies to**: publiczne eksporty pakietów (`packages/*/src/index.ts` i wszystko re-eksportowane stamtąd), pliki `.changeset/*.md`, raporty `**/*.api.md` (api-extractor), `CHANGELOG.md`

## MUST

- **BC1** — Każda zmiana w publicznym API przechodzi przez decision tree semver: łamie istniejący kod konsumenta → MAJOR; dodaje funkcjonalność bez łamania → MINOR; naprawia bez zmiany kontraktu → PATCH.
- **BC2** — Nowy parametr w istniejącej eksportowanej funkcji jest opcjonalny, z sensownym defaultem, dodany na końcu listy — pozycja i typ istniejących parametrów się nie zmienia.
- **BC3** — Rozszerzenie istniejącego eksportowanego interfejsu/typu dodaje WYŁĄCZNIE opcjonalne properties — żadnego usuwania, żadnego zwężania, żadnego required z optional.
- **BC4** — Usunięcie lub rename publicznego eksportu idzie przez trójfazową deprecację: faza 1 (minor) — `@deprecated` JSDoc + runtime `console.warn`; faza 2 (kolejny minor) — głośniejsze ostrzeżenie; faza 3 (major) — dopiero wtedy usunięcie.
- **BC5** — Union type może być tylko poszerzany (nowe warianty) w minor/patch; zwężenie (usunięcie wariantu) wymaga major.
- **BC6** — Release major z breaking change dostarcza funkcję migracyjną (converter ze starego kształtu na nowy) w tym samym PR/wydaniu, nie jako "zrobimy potem".
- **BC7** — Breaking rename/zmiana sygnatury dotykająca 10+ call-sites w znanych konsumentach dostarcza codemod (np. jscodeshift) razem z wydaniem major.
- **BC8** — Każdy `@deprecated` wpis w JSDoc zawiera wskazanie zamiennika i wersję planowanego usunięcia ("Since vX.Y.Z... Will be removed in vN.0.0").

## MUST NOT

- **N1** — ❌ Usunięcie eksportowanej funkcji/typu w minor lub patch — łamie każdego konsumenta na `npm update` bez ostrzeżenia (łamie BC1/BC4).
- **N2** — ❌ Dodanie required property do istniejącego eksportowanego interfejsu bez bumpa major — istniejący kod tworzący obiekty tego typu przestaje się kompilować (łamie BC3).
- **N3** — ❌ Zwężenie return type lub union type poza wydaniem major (usunięcie wariantu, enum zamiast string literal union, bardziej restrykcyjny generic) — konsumenci type-checkujący przeciw staremu kształtowi się wywalają (łamie BC5).
- **N4** — ❌ `@deprecated` w JSDoc bez towarzyszącego `console.warn` w runtime — konsumenci bez sprawdzania typów w IDE nigdy się nie dowiedzą (łamie BC4/BC8).
- **N5** — ❌ Ogłoszenie breaking change wyłącznie w CHANGELOG, bez ostrzeżeń deprecation w kodzie przed usunięciem — nikt proaktywnie nie czyta changelogów (łamie BC4).

## Klasyfikacja zmian (major / minor / patch)

| Typ zmiany | Bump | Reguła |
|---|---|---|
| Usunięcie/rename publicznego eksportu (po zakończeniu deprecacji) | MAJOR | BC4 |
| Required property dodana do istniejącego interfejsu | MAJOR | N2 |
| Zwężenie union type / return type / generic constraint | MAJOR | BC5 / N3 |
| Zmiana pozycji lub typu istniejącego parametru | MAJOR | BC2 |
| Nowy opcjonalny parametr z defaultem (dodany na końcu) | MINOR | BC2 |
| Nowa opcjonalna property w istniejącym interfejsie | MINOR | BC3 |
| Poszerzenie union type (nowy wariant) | MINOR | BC5 |
| Nowy eksport (funkcja, typ, klasa) niezależny od istniejących | MINOR | BC1 |
| Oznaczenie czegoś jako `@deprecated` (bez usuwania) | MINOR | BC4 |
| Poprawka buga bez zmiany kontraktu wejścia/wyjścia | PATCH | BC1 |
| Optymalizacja wydajności bez zmiany zachowania obserwowalnego | PATCH | BC1 |

## Minimal correct skeleton

```ts
/**
 * @deprecated Since v2.3.0. Use `createUser()` instead.
 * Will be removed in v3.0.0.
 */
let warned = false;

export async function registerUser(
  email: string,
  displayName: string
): Promise<UserProfile> {
  if (!warned) {
    console.warn(
      '[user-service] registerUser() is deprecated since v2.3.0. ' +
      'Use createUser() instead. Removal planned for v3.0.0.'
    );
    warned = true;
  }
  return createUser({ email, displayName, role: 'member' });
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| Publiczny eksport zniknął z `index.ts` bez wcześniejszego `@deprecated` w poprzednim wydaniu, a `.changeset/*.md` deklaruje `minor`/`patch` | **N1 / BC4** |
| Nowa `property: T` (bez `?`) dodana do eksportowanego `interface`/`type` istniejącego w poprzedniej wersji, changeset ≠ `major` | **N2** |
| Union type traci wariant (`'a' \| 'b' \| 'c'` → `'a' \| 'b'`) lub zwężony generic, changeset ≠ `major` | **N3 / BC5** |
| `@deprecated` w JSDoc, brak `console.warn(...)` w ciele funkcji | **N4** |
| Nowy wymagany parametr wstawiony w środku istniejącej listy parametrów (nie na końcu, nie opcjonalny) | **BC2** |
| `CHANGELOG.md`/`.changeset` opisuje usunięcie API, ale brak wcześniejszego wpisu deprecation w historii wydań | **N5** |
| Breaking rename obejmujący wiele plików w znanych repo-konsumentach, brak `tools/codemods/*` w tym samym wydaniu major | **BC7** |
| `.api.md` (api-extractor) pokazuje usuniętą/zwężoną sygnaturę publiczną bez odpowiadającego bumpa `major` w `.changeset/*.md` | **BC1** |

**Pełny wzorzec**: [`backward-compatibility-pattern.md`](./backward-compatibility-pattern.md)
