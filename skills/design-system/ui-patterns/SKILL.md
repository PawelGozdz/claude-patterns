---
name: ui-patterns
description: "Wzorce ekranów juz-ide i reguły ich użycia: lista, formularz, widok szczegółów, obowiązkowe stany brzegowe (pusty, ładowanie, błąd, brak uprawnień) i zakazy. Użyj przy budowie lub zmianie dowolnego ekranu UI."
origin: juz-ide design system (wdrożenie, faza 2) — wzorce zatwierdzone przez użytkownika 2026-09-26
allowed-tools: Read, Glob, Grep
effort: low
paths: "**/*.{tsx,ts,jsx,astro,svelte,eta,dart}"
---

# Wzorce ekranów

To jest warstwa 4 systemu designu: reguły użycia, których nie da się zakodować w tokenach.
Wzorce zatwierdził użytkownik 2026-09-26 (bramka decyzyjna fazy 2). Zmiana wzorca wymaga
jego zgody, a nie tylko dobrego powodu w bieżącym zadaniu.

Źródło wizualne dla toolingu: canvas „juz-ide — tooling”, **Wariant A „Karty na kremie”**
(tablica `Main.dc.html`, kopia w `design-system/design-archive/juzide-tooling/`).
Przykłady kodu dotyczą Refine (`@refinedev/core`) + Ant Design. `marketing-hub` **nie ma**
pakietu Refine dla antd, więc ekran składa się z komponentów antd (`Table`, `Form`,
`Descriptions`, `Tabs`, `Skeleton`, `Result`, `Empty`) i hooków core (`useTable`, `useForm`,
`useShow`), a nie z gotowych `<List>`/`<Show>`. Wartości wizualne — skill `design-tokens`.

## Lista

- **Nagłówek strony:** tytuł (krój szeryfowy, `display`) po lewej; po prawej akcje, na
  końcu **akcja główna** (`type="primary"`, np. „+ Dodaj”), przed nią drugorzędne jako
  przyciski obrysowe (np. „Eksportuj CSV”).
- **Filtry ZAWSZE nad tabelą, nigdy w szufladzie bocznej.** W jednym rzędzie: wyszukiwarka
  („Szukaj po …”), **chipy szybkich filtrów** statusu (jeden aktywny, np. Wszystkie / Aktywne /
  Do weryfikacji / Zablokowane), a rozszerzone filtry w rozwijanym menu „Filtry ⌄”.
- **Tabela:** nagłówki kolumn jako etykiety (`label`: 11 px, wersaliki); **sortowanie przez
  kliknięcie nagłówka kolumny**, nie osobną kontrolką; status jako **pill z kropką** w kolorze
  roli (`status-*`/`ink-*`), nie goły tekst; akcja wiersza w ostatniej kolumnie („Otwórz”).
- **Paginacja na dole, zawsze z łączną liczbą rekordów:** „Pokazano 1–6 z 187”.
- **Pusty wynik filtrowania ≠ pusty zasób.** Pusty filtr: „Brak wyników dla tych filtrów” +
  „Wyczyść filtry”. Pusty zasób: stan pusty (niżej) z akcją główną.

**Klocki w paczce `react-ui` (≥ 0.6.0) — użyj ich zamiast budować od zera:** `PageHeader` (tytuł +
akcje), `ListFilters` (wyszukiwarka + chipy + slot na filtry rozszerzone, bez własnego stanu),
`ListState` (ładowanie, 403, błąd z ponowieniem, pusty wynik filtrów z „Wyczyść filtry”, pusty zasób z
akcją; aplikacja mapuje swój błąd na `ListError`), `StatusPill`, `listPagination`/`paginationTotal`.
Wzór: `grant-flow` `features/projects/ProjectsList.page.tsx`. Filtry muszą leżeć POZA `ListState`, żeby
pusty wynik nie zabierał kontrolek. Filtrowanie po stronie klienta tylko gdy API zwraca cały zbiór;
przy stronicowaniu po stronie serwera filtr bez parametru w API objąłby jedną stronę — nie dodawaj go.

```tsx
const { tableQuery, setFilters, setSorters } = useTable({ resource: 'accounts' });
// Table: sortowanie w columns[].sorter + onChange → setSorters; total z tableQuery.data?.total
// pagination={{ showTotal: (total, [from, to]) => `Pokazano ${from}–${to} z ${total}` }}
```

## Formularz

- **Jedna kolumna do 8 pól**, dwie kolumny powyżej 8.
- **Etykiety nad polami** (`<Form layout="vertical">`), nie obok.
- **Błąd walidacji inline pod polem, nigdy w toaście.** Dotyczy też błędów z serwera:
  odpowiedź 422 z błędami pól ma trafić do pól formularza. Refine: `dataProvider` rzuca
  `HttpError` z `errors: { pole: ['komunikat'] }`, a `useForm` ustawia je na polach.
  Powiadomienie (toast) wolno pokazać tylko przy błędzie, który nie dotyczy żadnego pola
  (np. 500), i wtedy z opisem, co się stało.
- **Akcje na dole formularza, główna po prawej** („Zapisz” skrajnie po prawej, „Anuluj”
  obok niej).
- **Niezapisane zmiany: ostrzeżenie przy wyjściu** (`warnWhenUnsavedChanges: true` w `useForm`
  lub w opcjach `<Refine>`).

## Widok szczegółów

- **Nagłówek:** nazwa rekordu + status (pill) + akcje (główna najbardziej po prawej).
- **Metadane jako lista definicji** (`<Descriptions>`), nie tabela.
- **Powiązane rekordy w zakładkach** (`<Tabs>`), nie jedna długa strona.

## Powłoka aplikacji

Dotyczy aplikacji toolingowych (`AppLayout`: sidebar, nagłówek, obszar treści). Kolory i wymiary
menu pochodzą z tokenów motywu antd (`components.Layout`, `components.Menu`, paczka tokenów
≥ 0.3.0) — układ i to, czego tokeny antd nie obejmują, wynika z tego wzorca. Zatwierdzone
2026-10-02 (źródło: Wariant A „Karty na kremie”).

- **Układ wypełnia wysokość okna:** korzeń `Layout` ma `minHeight: 100vh`, sidebar sięga do
  dołu okna także przy krótkiej treści.
- **Sidebar:** 216 px, tło `bg.tint`, **bez kreski** od strony treści (granicę robi różnica
  tła `bg.tint` / `bg.base`). Na górze nazwa produktu fontem marki (logo nie istnieje), niżej menu.
- **Menu — trzy stany:** zwykła `text.body`; hover tło `bg.tintStrong`; aktywna tło `bg.base`,
  `text.strong`, **ramka 1 px i waga 600**. Wysokość pozycji 34 px, promień `radius.md`, odstęp
  między pozycjami 2 px. Ramka, waga i odstęp są poza tokenami antd — idą do klasy powłoki
  w `global.css` aplikacji, nie do `style={{…}}`.
- **Obszar treści:** tło `bg.base`, padding **28 px góra/dół, 32 px lewo/prawo** (mobile: 16 px).
  Poza tokenami antd — to zasada wzorca. Treść nigdy nie przylega do sidebaru.
- **Nagłówek powłoki ≠ nagłówek strony.** Nagłówek powłoki to cienki pasek: przycisk menu
  (mobile), przełącznik motywu, użytkownik. **Nie ma w nim tytułu strony ani akcji ekranu** —
  te zostają w nagłówku strony (patrz Lista, Widok szczegółów).
- **Mobile (poniżej breakpointu `md`):** sidebar to szuflada otwierana przyciskiem w nagłówku
  powłoki, zamykana po wybraniu pozycji. **Bez `zeroTrigger` antd** — zasłania pierwszą
  komórkę tabeli.
- **Tryb ciemny:** ta sama mapa ról na paletę Espresso. ⚠ Wyprowadzony z tokenów, **nie
  wybrany w canvasie** (Wariant A nie ma motywu ciemnego) — nie traktuj go jako zatwierdzonego
  wyglądu; nagłówek i hover też są wyprowadzone.

```tsx
const { token } = theme.useToken(); // kolory TYLKO z motywu, nigdy literały
<Layout style={{ minHeight: '100vh' }}>
  <Layout.Sider width={216} /* tło z tokenów Layout.siderBg */>…<Menu mode="inline" /></Layout.Sider>
  <Layout><Layout.Header />{/* bez tytułu strony */}<Layout.Content className="app-content" /></Layout>
</Layout>
```

## Stany brzegowe — obowiązkowe na każdym ekranie

Ekran bez tych czterech stanów nie jest skończony, nawet jeśli „szczęśliwa ścieżka” działa.

| Stan | Jak wygląda | Antd |
|---|---|---|
| **Pusty** | **ikona** (marka nie ma jeszcze ilustracji) + jedno zdanie wyjaśnienia + akcja główna | `<Empty image={…ikona…} description="…">` + `<Button type="primary">` |
| **Ładowanie** | **szkielet o kształcie treści**, nie spinner | `<Skeleton active />`, `<Skeleton.Input>`, wiersze-szkielety w tabeli |
| **Błąd** | komunikat + przyczyna (po ludzku) + **akcja ponowienia** | `<Result status="error" title subTitle extra={<Button onClick={refetch}>Spróbuj ponownie</Button>}>` |
| **Brak uprawnień** | osobny komunikat „nie masz dostępu do …”, **nie 404** i nie pusty ekran | `<CanAccess fallback={<Result status="403" …/>}>` |

Teksty stanów po polsku, w tonie marki (ciepło, konkretnie, bez żargonu technicznego).

## Zakazy

- ❌ Toast do błędów walidacji (także serwerowych, patrz Formularz).
- ❌ Modal dla czegokolwiek, co ma **więcej niż 5 pól** — to osobna strona.
- ❌ Spinner tam, gdzie da się pokazać szkielet (lista, karta, szczegóły, formularz edycji).
- ❌ Własny komponent tam, gdzie wystarczy wariant istniejącego (prop, `type`, token komponentu).
- ❌ Filtry w szufladzie bocznej; sortowanie osobną kontrolką; paginacja bez liczby rekordów.
- ❌ W `AppLayout`: domyślny granat antd (`#001529`), literały kolorów, `style={{ background }}`
  na `Layout.Header`/`Sider`, `zeroTrigger`, tytuł strony w nagłówku powłoki.

## Znane odstępstwa w istniejącym kodzie

Stan z 2026-10-03 (audyt `/design-audit` na `marketing-hub` i `grant-flow`), do poprawy przy
najbliższym dotknięciu ekranu. Nie kopiuj ich jako wzoru. Powłoka, 404 i ekran błędu startu są
już w obu aplikacjach z paczki `react-ui` (`AppShell`, `NotFoundPage`, `BootstrapError`).

- `marketing-hub` `auth-kit/screens/UsersAndRolesScreen.tsx` — naprawione 2026-10-03 (błąd zapisu w
  modalu, błąd listy z ponowieniem, stan pusty, prawdziwa paginacja, „Pokazano X–Y z N”, komponenty
  `react-ui`, chipy ról filtrują po stronie serwera przez `role=`). Wyszukiwarki nie ma celowo: API
  nie ma wyszukiwania po e-mailu (decyzja D11, bez enumeracji osób).
- `marketing-hub` `auth-kit/screens/MyAccountScreen.tsx` — `Result status="error"` bez ponowienia,
  `Empty` bez ikony i akcji, widok szczegółów bez nagłówka/pilla/`Tabs`.
- `marketing-hub` `features/dashboard/dashboard.page.tsx` — `Empty` bez akcji (udokumentowane odstępstwo),
  zduplikowany ekran 403 względem `auth-kit/components/ForbiddenScreen.tsx`.
- `grant-flow` `features/home/home.page.tsx` — stan błędu to goły tekst (bez ponowienia), brak stanu
  pustego i 403.
- `App.tsx` — `notificationProvider` na `notification` antd; przy formularzach pilnuj mapowania 422 na pola.
