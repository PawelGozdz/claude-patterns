---
name: design-audit
description: "Audyt spójności design-systemu w podłączonych repozytoriach juz-ide: dispatch agentów pattern-auditor (wzorce ekranów, duplikacja komponentów, brakujące stany) i token-drift (literały, zdeprecjonowane tokeny, rozjazd wersji @projekt/tokens / juz_ide_tokens) per repo, raport zbiorczy wg wagi. Decyduje, kiedy przygotować PR z mechaniczną migracją, a kiedy tylko zgłosić. Wywołanie ręczne: /design-audit [repo…]."
origin: juz-ide design system (wdrożenie, faza 5, część B)
allowed-tools: Read, Glob, Grep, Bash, Agent
effort: medium
argument-hint: "[repo…]"
disable-model-invocation: true
---

# Audyt design-systemu

## 1. Zakres — `$ARGUMENTS`

Podano nazwy/ścieżki repo → audytuj dokładnie te. Nic nie podano → znajdź repozytoria z
aktywnym blokiem `design-system`: sprawdź katalogi sąsiadujące z bieżącym repo pod kątem
`.claude/config/runtime.yml` zawierającego `design-system` w kompozycji bloków. **Nie
zakładaj stałej listy nazw** — to, które projekty przyjęły blok, zmienia się w czasie i
ten skill nie ma nad tym kontroli. Wykrycie niejednoznaczne (zero trafień albo więcej niż
kilka) → zapytaj użytkownika, które repozytoria audytować, zamiast zgadywać.

## 2. Dispatch — równolegle, per repo

Dla każdego repo w zakresie, w jednym batchu (nie sekwencyjnie):

```
@pattern-auditor(repo=<ścieżka>)
@token-drift(repo=<ścieżka>)
```

Oba agenty są read-only i bez VETO — ten skill sam decyduje, co zrobić ze znaleziskami,
agenty tylko raportują.

## 3. Synteza

Grupuj znaleziska po repo, wewnątrz repo wg wagi — te same trzy poziomy co `ui-reviewer`:

```
BLOKUJĄCE   — łamanie twardego zakazu (literał, brak stanu obowiązkowego)
ISTOTNE     — zdeprecjonowany token z jasną migracją, duplikacja komponentu
DROBNE      — drift stylistyczny, jeszcze nie krytyczny
```

Dodaj sekcję zbiorczą "rozjazd między repozytoriami" — np. różne wersje pakietu tokenów
(web i Flutter, patrz skill `token-drift` opisany w agentach) w dwóch repo jednocześnie,
widoczne tylko przy zestawieniu wyników `token-drift` z wielu repo naraz.

## 4. Kiedy PR, kiedy tylko raport

**Przygotuj PR** (branch + commit, **nigdy automatyczny merge**) tylko dla znalezisk
w pełni mechanicznych i jednoznacznych:
- użycie tokenu, który ma `@deprecated`/`@Deprecated` ze wskazanym DOKŁADNIE jednym
  zamiennikiem (symbol + plik, nie tylko opis) — podmień 1:1;
- literał, którego wartość dokładnie odpowiada istniejącemu tokenowi (nie w przybliżeniu —
  dokładnie) — zamień na token.

**Tylko raport, bez PR** dla wszystkiego, co wymaga osądu: duplikacja komponentu (który
wariant jest właściwy?), brakujący stan brzegowy (jaka treść pustego stanu?), rozjazd
wersji między repo (czyja wersja jest właściwym miejscem docelowym?), dowolna kolizja
architektoniczna (np. DS-007 w `juz-ide-mobile-app` — flaguj, nie rozstrzygaj). PR na
niejednoznacznym znalezisku to więcej szkody niż braku PR: recenzent traci czas na
odrzucenie złej migracji zamiast ocenić dobrą.

## 5. Wynik

Wywołanie ręczne (`/design-audit`): pokaż raport użytkownikowi, zapytaj o zgodę przed
przygotowaniem którejkolwiek gałęzi PR z sekcji 4.

Zadanie cykliczne (Cowork): przygotuj PR-y kwalifikujące się z sekcji 4, dołącz pełny
raport do opisu PR-a (albo jako osobny artefakt, jeśli PR-a nie ma — np. repo bez
znalezisk kwalifikujących do PR-a); tam, gdzie audytowane repo ma własny system PM
(`project-orchestration/`), zapisz tam skrót zamiast tylko w treści PR-a.

```
Werdykt: OK | ZNALEZISKA
Repo: <nazwa>

BLOKUJĄCE
- [<repo>:<plik>:<linia>] <co> → <reguła> → <oczekiwane>
ISTOTNE
- …
DROBNE
- …

Rozjazd między repozytoriami:
- …

PR-y przygotowane (mechaniczne, do przeglądu): <lista albo brak>
```
