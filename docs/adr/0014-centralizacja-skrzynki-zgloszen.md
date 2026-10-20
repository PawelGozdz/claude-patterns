# ADR 0014 — Centralizacja odbioru zgłoszeń odchyleń (skrzynka `_inbox`)

**Status**: proposed (2026-10-18). **Odłożone, nie wdrażamy** — zapis kierunku na wypadek,
gdy repozytorium będzie używane poza jedną maszyną.
**Rozszerza**: [ADR 0011](0011-raportowanie-dryfu-i-telemetria-floty.md) (kanał zgłoszeń),
[ADR 0012](0012-metryki-przebiegow-zdarzenia-v1.md) (schemat zdarzeń).
**Context source**: rozmowa z użytkownikiem 2026-10-18 — co, gdyby claude-patterns
zcentralizować, a użytkownicy pobierali repo lokalnie i uruchamiali setup projektów jak dziś;
pytanie, czy sam etap zgłoszeń przenieść do usługi (np. przez ai-gateway, MCP lub API).

---

## Kontekst

Dziś `scripts/report-deviation.mjs` zapisuje plik `DEV-*.md` wprost do
`docs/tasks/_inbox/` repozytorium claude-patterns: jeden plik na sygnaturę
(`rule_ref` albo slug trigger+reason), z licznikiem `occurrences` i listą `projects[]`.
To działa, bo projekt i claude-patterns leżą na jednej maszynie. Triage opiera się na gicie:
nietrackowany plik (`??`) to zgłoszenie nieprzejrzane, staged to rozstrzygnięte
(`promoted`/`dismissed`), a `index.json` jest generowany z plików.

Gdy repo pobiera wielu użytkowników, ten zapis lokalny przestaje trafiać do maintainera.
Zgłasza nie tylko agent `/orchestrate`: także `/analyze`, audyt floty z crona i setup
(`--source audit|setup`), więc kanał nie może zależeć od sesji MCP.

## Decyzja (kierunek, nie wdrożenie)

Centralizujemy **transport**, nie **triage**. Skrzynka w repo i jej obieg (`??` → staged,
`resolution`/`dismissed_reason`, auto-reopen) zostają bez zmian.

1. **Wysyłanie.** `report-deviation.mjs` buduje *zdarzenie*, nie rekord: projekt, trigger,
   `rule_ref`, powód, task, run, `layer`, wersja claude-patterns i kontraktu (`installed.yml`)
   oraz klucz idempotencji (hash projekt + run + sygnatura + powód). Wysyłka jest
   best-effort i niczego nie blokuje, jak dziś. Przy niepowodzeniu zdarzenie trafia do
   lokalnego outboxa (np. `.claude/outbox/*.jsonl`) i jest ponawiane przy następnym uruchomieniu.
2. **Odbiór.** Kolektor przyjmuje zdarzenia przez HTTP POST (token per projekt), zapisuje je
   append-only i deduplikuje po kluczu idempotencji. Nie trzyma stanu rekordów.
3. **Pobieranie.** Nowy `scripts/inbox-sync.mjs` pobiera nowe zdarzenia i przepuszcza je przez
   **tę samą logikę scalania** co dziś (sygnatura → plik, `occurrences`, `projects[]`,
   reopen). Efekt: zwykłe pliki `DEV-*.md` jako `??`, a praca maintainera się nie zmienia.

### Warianty transportu

| Wariant | Ocena |
|---|---|
| **HTTP API (kolektor)** | Podstawa. Działa z agenta, crona, hooka i CI. |
| **MCP (`report_deviation`)** | Cienka nakładka na to samo API, dla agentów. Nie jako jedyna droga: audyt i setup nie mają sesji MCP. |
| **ai-gateway** | Sensowny, jeśli chcemy reużyć tożsamość i audyt z iam. Wada: narzędzia deweloperskie zależą od usługi produkcyjnej; kolektor ma działać także, gdy gateway leży. |
| **GitHub Issues** | Najtańszy start bez infrastruktury: jedno issue na sygnaturę, komentarz na wystąpienie, deduplikacja po etykiecie, `inbox-sync` czyta przez `gh`. |

## Ryzyka i wymagania

- **Niezaufane wejście.** Dziś treść zgłoszeń pochodzi z naszych agentów. Od zewnętrznych
  użytkowników jest daną niezaufaną, a czyta ją agent triage: traktować wyłącznie jako dane
  (nigdy instrukcje), twardy limit rozmiaru, brak aktywnych formatów.
- **Wyciek danych.** Pole „powód” zawiera ścieżki, nazwy klientów i fragmenty kodu. Redakcja po
  stronie wysyłającego, przed zapisem do outboxa; przy wielu organizacjach separacja per tenant.
- **Przestarzałe zgłoszenia.** Wersja claude-patterns w zdarzeniu pozwala odrzucić zgłoszenie
  reguły naprawionej w nowszej wersji (dziś widać to w ponownych otwarciach rekordów).
- **Sprzężenie zwrotne.** Kolektor może publikować `index.json` ze statusami, by projekt
  sprawdził przed zgłoszeniem, czy problem jest „znany, naprawiony w wersji X”.
- **Brak locka** przy współbieżnym zapisie zostaje akceptowalny: scalanie dzieje się lokalnie,
  w jednym procesie `inbox-sync`.

## Ścieżka wdrożenia (gdy zdecydujemy)

1. Outbox + `inbox-sync` na wspólnym katalogu lub gałęzi git, bez serwera.
2. Kolektor HTTP (albo Issues przez `gh`) + token per projekt + redakcja.
3. Nakładka MCP dla agentów; ewentualnie integracja z ai-gateway.
4. Publikacja statusów zwrotnie do projektów (sprawdzenie „znane” przed zgłoszeniem).

## Konsekwencje

- Zero zmian dziś. Przy wdrożeniu `report-deviation.mjs` zyskuje tryb wysyłki, a skrypt
  scalania wydziela się z zapisu pliku (współdzielony przez `inbox-sync`).
- Triage, statusy i `index.json` pozostają w repo, więc obecny proces przeglądu nie wymaga zmiany.
