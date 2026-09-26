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

## Znane odstępstwa w istniejącym kodzie

Stan z 2026-09-26, do poprawy w fazie 3 wdrożenia (pierwsza aplikacja). Nie kopiuj ich jako wzoru:

- `marketing-hub/apps/web/src/app/StartPage.page.tsx` — `<Spin>` przy ładowaniu (ma być szkielet).
- `marketing-hub/apps/web/src/app/BootstrapError.tsx` — `Result status="error"` bez akcji ponowienia.
- `StartPage` — fallback `CanAccess` to goły tekst po angielsku (ma być komunikat 403 po polsku).
- `App.tsx` — `notificationProvider` na `notification` antd; przy formularzach pilnuj mapowania 422 na pola.
