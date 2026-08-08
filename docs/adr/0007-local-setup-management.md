# ADR 0007 — Zarządzanie lokalnym setupem: manifest instalacji, wykrywanie dryfu, wersjonowanie kontraktu

**Status**: proposed (2026-08-02) — **NIE zaakceptowany, do przedyskutowania**
**Context source**: dyskusja przy ADR 0006 (broadcast) — pytanie „co jest lepsze long-run
dla utrzymania i aktualizowania lokalnego setupu"; task `CI-DEVEX-001` (`juz-ide-mobile-app`)
proponujący vendorowanie hooków Claude do repo.

> **Ten ADR niczego nie implementuje.** Zawiera decyzje do zatwierdzenia i sekcję
> OTWARTE PYTANIA wymagającą odpowiedzi człowieka.

---

## Kontekst

### Założenie ograniczające (ustalone 2026-08-02)

**Wszystko, czego dotyczy ten ADR, to tooling deweloperski.** Hooki Claude Code, skille,
agenci i wzorce działają wyłącznie w lokalnej sesji. **CI nie ma dostępu do `~/.claude/`
i nie ma mieć.** Konsekwencja: reprodukowalność w pipelinie oraz „recenzent PR-a musi
widzieć, co się wykonało" **nie są kryteriami** w żadnej z poniższych decyzji. To założenie
unieważnia większość typowych argumentów za vendorowaniem — trzeba je trzymać w świadomości
przy każdej rewizji tego dokumentu.

### Problem obserwowany

`scripts/setup-project.sh` (775 linii) był uruchamiany w kilkunastu repo w `/opt/projects`
w różnych momentach, w różnych wersjach skryptu i przy różnym stanie `claude-patterns`.
**Nigdzie nie jest zapisane, co i kiedy zainstalowano.** W efekcie:

1. **Pytanie „czy to repo jest aktualne" jest dziś nieodpowiadalne** inaczej niż przez
   ręczne porównanie symlinków — a symlink pokazuje *dokąd wskazuje*, nie *kiedy powstał*
   ani *jakiego wariantu setupu jest częścią*.
2. **Fixy nie mają jak dojechać.** Realne przypadki: `hook-subagent-transcript-trap`
   (hooki skanujące transcript blokowały subagentów) i `agent-frontmatter-first-line-trap`
   (komentarz nad frontmatterem czynił agenta niewidocznym). Oba to poprawki, o których
   każde repo powinno się dowiedzieć — nie było mechanizmu, żeby stwierdzić, które ich nie ma.
3. **Zmiana formatu jest cichą awarią.** Podbicie schematu `project.yml` czy `broadcast.yml`
   psuje repo, które go nie dostało — objaw pojawia się tygodnie później i wygląda na
   przypadkowy błąd.

### Stan zastany

- **Wzorzec wersjonowania istnieje, ale tylko dla cudzego kodu**: `UPSTREAM_VERSION`
  w `skills/marketing/`, `skills/finance/`, `skills/legal/` + skrypty `sync-*-skills.sh`
  z trybem `--diff` i (dla legal) `--verify-licenses`. Dla **własnego** setupu odpowiednika
  brak — paradoks, bo to on zmienia się najczęściej.
- `setup-project.sh` jest sterowany deklaratywnie przez `project.yml` (`yml_get`/`yml_list`)
  i wykonuje ponumerowane sekcje sekwencyjnie. **Nie ma trybu podglądu ani raportu** —
  każde uruchomienie od razu zmienia stan.
- Dystrybucja przez symlinki (ADR 0001) działa i jest fundamentem repo: edycja w jednym
  miejscu widoczna natychmiast we wszystkich projektach.
- `CI-DEVEX-001` (`juz-ide-mobile-app`) miesza dwie rzeczy: brak lokalnej bramki dla
  **człowieka bez Claude Code** (linia 33) z propozycją zvendorowania hooków Claude
  (linia 52). Pierwsze jest realnym problemem, drugie nie jest jego rozwiązaniem.

---

## Decyzje

### D0 — Implementacja zostaje centralnie; vendorowanie odrzucone

Hooki, skille, agenci i wzorce mieszkają w `claude-patterns` i docierają do projektów
symlinkiem (ADR 0001). **Nie kopiujemy ich do repo.**

Uzasadnienie przy założeniu „tylko development":

- vendorowanie mnoży koszt każdej poprawki przez liczbę repo — przy kilkunastu instalacjach
  jeden fix hooka staje się kilkunastoma zmianami zamiast jednym commitem;
- jedyne, co vendorowanie kupuje (widoczność w repo, reprodukowalność w CI), jest albo
  nieistotne, albo **wprost wykluczone przez założenie ograniczające**;
- dryf, którym się martwimy, i tak nie znika — vendorowanie zamienia dryf niewidoczny
  na widoczny, ale go nie usuwa.

**Problem nie leży w tym, gdzie pliki mieszkają, tylko w tym, że nie wiadomo, co jest
zainstalowane gdzie i czy jest aktualne.** Kolejne decyzje adresują to bezpośrednio.

### D1 — Manifest instalacji: `.claude/config/installed.yml`

Zapisywany przez `setup-project.sh`, jeden plik per instancja, **nieśledzony przez gita**
(wykluczenie w `.git/info/exclude`, jak `broadcast.yml` w ADR 0006 D3 — repo nie dostaje
żadnej zmiany śledzonej):

```yaml
claude_patterns_sha: 7e10034            # commit claude-patterns w momencie instalacji
claude_patterns_ref: main
installed_at: 2026-08-02T11:04:00Z      # ISO-8601 UTC
setup_script_version: 3                 # wersja setup-project.sh, NIE data
components:                             # co faktycznie zainstalowano
  - patterns
  - rules
  - skills
  - hooks
  - project-orchestration
contracts:                              # wersje kontraktów, patrz D3
  project_yml: 2
  broadcast_yml: 1
```

To jest **zapis faktu**, nie deklaracja intencji: co skrypt zrobił, nie co ktoś planuje.
Deklaracja intencji już istnieje i mieszka w `project.yml` — mieszanie tych ról w jednym
pliku byłoby powtórzeniem błędu „fat manifest", odrzuconego w ADR 0001.

**Kto go tworzy: `setup-project.sh`, jako część normalnego przebiegu** (decyzja 2026-08-02).
Manifest nie jest osobnym krokiem do zapamiętania przez człowieka — powstaje tam, gdzie
i tak zapada cała reszta instalacji, razem z sekcją broadcastu (ADR 0006, sekcja Setup).
Zasady:

- **pytanie w terminalu**, gdy plik nie istnieje: „utworzyć manifest instalacji?" — z `[T/n]`,
  bo brak manifestu oznacza brak możliwości wykrycia dryfu i to powinien być wybór świadomy;
- **bez pytania przy `--interactive`** — manifest jest tam pozycją w menu komponentów,
  domyślnie zaznaczoną;
- **bez pytania przy `--update`** i gdy manifest już istnieje — nadpisanie jest wtedy
  oczywistą konsekwencją tego, że skrypt właśnie zmienił stan;
- **idempotentnie i na końcu przebiegu**, nigdy na początku: manifest ma odzwierciedlać
  to, co faktycznie się zainstalowało, a nie to, co skrypt zamierzał zrobić przed
  ewentualnym błędem w połowie.

Odmowa utworzenia jest legalna — skrypt kończy normalnie, a `--check` w takim repo
raportuje „brak manifestu" (OQ3), nie błąd.

### D2 — `setup-project.sh --check`: raport dryfu, zero zmian

Nowy tryb read-only. Porównuje `installed.yml` ze stanem `claude-patterns` teraz i wypisuje:

- **za stare** — `claude_patterns_sha` sprzed commitów oznaczonych jako istotne dla setupu;
- **brakujące komponenty** — `project.yml` deklaruje kategorię skilli, której `components`
  nie zawiera (setup odpalony przed jej dodaniem);
- **martwe symlinki** — cel nie istnieje (przeniesiony lub usunięty w `claude-patterns`);
- **rozjazd kontraktu** — `contracts.*` niższe niż aktualnie wymagane (D3);
- **brak manifestu** — repo z setupem sprzed tego ADR (patrz OQ3).

`--update` przechodzi setup ponownie i przepisuje manifest. Rozdział trybów jest istotny:
**`--check` musi być bezpieczny do uruchamiania odruchowo**, inaczej nikt go nie uruchomi.

Naturalne miejsce wywołania: `/pulse` (raz dziennie, przy okazji standupu) — nie
`SessionStart`, bo to opłata przy każdym otwarciu terminala za informację, która zmienia
się raz na tygodnie.

### D3 — Wersjonujemy kontrakty, nie pliki

**Nie** wprowadzamy wersji per hook ani per skill — to byłby package manager, którego
ADR 0001 świadomie nie chce. Wersjonujemy **formaty, na których opiera się integracja**:
`project.yml`, `broadcast.yml`, format `installed.yml`, schemat wiadomości kanału.

Reguła: gdy `claude-patterns` podbija wersję kontraktu, `--check` raportuje wszystkie repo
poniżej. Kod czytający kontrakt **musi umieć odczytać wersję niższą albo odmówić jawnie** —
nigdy nie zakładać, że dostał aktualny format.

Liczba kontraktów ma pozostać jednocyfrowa. Jeśli urośnie, to znak, że integracja jest zbyt
rozgałęziona, a nie że potrzeba więcej wersjonowania.

### D4 — Bramka dla człowieka to git-hook, nie hook Claude Code

Rozstrzygnięcie `CI-DEVEX-001` bez trade-offu, przez rozdzielenie ról:

| co | gdzie | dla kogo | kiedy się wykonuje |
|---|---|---|---|
| **git-hook** (lefthook) | w repo, commitowany | człowiek bez Claude Code | `pre-commit`, lokalnie |
| **hook Claude Code** | `claude-patterns`, symlink | agent | w sesji, per zdarzenie harnessa |

Cel z `CI-DEVEX-001:33` („dev bez Claude Code nie ma żadnej bramki") realizuje **lefthook**.
Vendorowanie hooków Claude tego celu nie realizuje — dev bez Claude Code i tak ich nie
uruchomi. Punkt `:52` jest więc do zamknięcia jako „rozwiązane inaczej", nie do wykonania.

**Jedna implementacja, dwóch wywołujących**: logika checku (np. `check-riverpod-patterns`)
to zwykły skrypt node przyjmujący ścieżki i zwracający kod wyjścia. Lefthook woła go na
plikach ze stage'a, hook Claude Code na plikach z `tool_input`. Zero duplikacji logiki.

### D5 — Czego ten ADR świadomie NIE robi

- **nie buduje package managera** — bez rozwiązywania zależności, lockfile'i i publikacji;
- **nie wprowadza wersji semantycznych na komponenty** — `claude_patterns_sha` wystarcza,
  bo dystrybucja jest lokalna i jednokierunkowa;
- **nie automatyzuje aktualizacji** — `--check` informuje, człowiek decyduje. Automatyczny
  `--update` w tle zmieniałby zachowanie agentów w środku pracy, czyli dokładnie tę klasę
  niespodzianki, której unikamy w ADR 0006 (D11: nic nie przerywa domyślnie);
- **nie dotyka rzeczy vendorowanych** (`skills/{marketing,finance,legal}`) — mają własne
  `UPSTREAM_VERSION` i skrypty sync; ten ADR jest o **naszym** kodzie.

---

## OTWARTE PYTANIA

**OQ1 — Co dokładnie trafia do `components`.** Nazwy kategorii (`skills`) czy pełna lista
(`skills/finance/core`, ...)? Pełna jest dokładniejsza, ale rośnie i szybciej się rozjeżdża.
*Rekomendacja:* kategorie + liczba pozycji; szczegóły wylicza `--check` na żywo.

**OQ2 — Kiedy uruchamiać `--check`.** W `/pulse` (dziennie), ręcznie, czy jako osobna
komenda `/setup-status`? *Rekomendacja:* `/pulse` + tryb ręczny; nigdy `SessionStart`.

**OQ3 — Repo bez manifestu (dziś wszystkie).** Traktować jako „nieznany stan" i wymagać
`--update`, czy dopisać manifest z sha `unknown` przy pierwszym `--check`?
*Rekomendacja:* drugie — inaczej pierwszy raport to kilkanaście alarmów naraz i nikt go
nie przeczyta.

**OQ4 — Manifest nieśledzony czy commitowany.** D1 mówi nieśledzony (spójnie z ADR 0006).
Wariant commitowany dawałby „to repo oczekuje takiego setupu" jako deklarację zespołową —
ale przy pracy solo to dodatkowy plik w diffach bez odbiorcy. *Rekomendacja:* nieśledzony;
rewizja, gdy pojawi się druga osoba.

**OQ5 — Które commity `claude-patterns` są „istotne dla setupu".** `--check` musi odróżnić
zmianę wzorca (nie wymaga reinstalacji) od zmiany struktury symlinków (wymaga). Znacznik
w commit message, plik `SETUP-EPOCH`, czy heurystyka po ścieżkach? *Rekomendacja:* plik
`SETUP-EPOCH` z jedną liczbą, podbijany ręcznie — heurystyka po ścieżkach będzie kłamać
w obie strony.

---

## Ryzyka

| ryzyko | skutek | mitygacja |
|---|---|---|
| **Manifest kłamie** | ktoś poprawił symlink ręcznie, manifest tego nie wie → fałszywe „aktualne", gorsze niż brak informacji | `--check` weryfikuje **stan faktyczny** (cele symlinków); manifest służy tylko do datowania i historii |
| **`--check` hałasuje** | kilkanaście ostrzeżeń przy każdym `/pulse` → przestaje być czytany | OQ3 (miękki start), raport tylko o zmianach od ostatniego uruchomienia, cisza gdy wszystko zgodne |
| **Wersjonowanie kontraktu jako biurokracja** | podbijanie liczby staje się rytuałem bez treści | limit: jednocyfrowa liczba kontraktów (D3), przegląd przy każdym nowym |
| **Rozjazd `--update` z równoległą pracą** | reinstalacja symlinków w trakcie sesji agenta w innym oknie | `--update` tylko ręcznie, nigdy automatycznie (D5); ostrzeżenie przy wykryciu aktywnej sesji |

---

## Plan wdrożenia

| faza | zakres | co weryfikuje |
|---|---|---|
| **1** | Zapis manifestu w `setup-project.sh` (bez `--check`) | czy da się zapisać stan bez ruszania reszty skryptu — najtańszy krok, użyteczny natychmiast |
| **2** | `--check` z trzema regułami: martwe symlinki, brak manifestu, brakujące komponenty | czy raport jest czytelny i cichy, gdy wszystko OK |
| **3** | `SETUP-EPOCH` + reguła „za stare" (OQ5) | czy „istotne dla setupu" da się określić bez fałszywych alarmów |
| **4** | Wersje kontraktów (D3) + odczyt w kodzie czytającym `project.yml`/`broadcast.yml` | czy stary format faktycznie degraduje się jawnie |
| **5** | Wpięcie w `/pulse` (OQ2) | czy raport jest czytany, czy przewijany |

Faza 1 ma wartość samodzielną nawet gdyby reszta nie powstała: od tego momentu każda nowa
instalacja jest datowana i przypisana do commita.

---

## Konsekwencje

**Pozytywne**: „czy to repo jest aktualne" staje się odpowiadalne jedną komendą; fixy hooków
mają jak dojechać do wszystkich repo; zmiana formatu przestaje być cichą awarią;
`CI-DEVEX-001` zamyka się bez vendorowania, więc `juz-ide-mobile-app` zostaje w pilocie
broadcastu.

**Negatywne / koszty**: kolejny plik konfiguracyjny per repo; `setup-project.sh` rośnie
o tryb, który trzeba utrzymywać; `SETUP-EPOCH` wymaga dyscypliny ręcznego podbijania.

**Neutralne**: ADR 0001 (symlinki, brak formatu pluginu) pozostaje w mocy — ten ADR go nie
rewiduje, tylko dokłada brakującą warstwę obserwowalności instalacji.

---

## Powiązane

- `docs/adr/0001-extension-architecture.md` — symlinki zamiast pakietów, odrzucony „fat manifest"
- `docs/adr/0006-cross-instance-broadcast.md` — D3 (manifest nieśledzony przez `.git/info/exclude`), D11 (nic nie przerywa domyślnie)
- `CI-DEVEX-001` (`juz-ide-mobile-app`) — do zamknięcia w części dotyczącej vendorowania hooków (D4)
- `scripts/setup-project.sh` — miejsce implementacji D1/D2
- `scripts/sync-{marketing,finance,legal}-skills.sh` + `UPSTREAM_VERSION` — istniejący wzorzec dla kodu vendorowanego
- Pamięć: `hook-subagent-transcript-trap`, `agent-frontmatter-first-line-trap` — fixy uzasadniające potrzebę dystrybucji poprawek
