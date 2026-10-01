---
name: canvas-backup
description: "Backup canvasu Claude Design: pliki źródłowe (project/canvas.json + artboardy .dc.html) do design-archive/<data>/ i render PNG każdego artboardu w jego własnym rozmiarze ramki. Automatyzuje poziomy 2 i 3 z planu design-systemu (poziom 1 — eksport PDF — zostaje ręczny, pięciosekundowy). Wywołanie ręczne: /canvas-backup <url-canvasu>."
origin: juz-ide design system (wdrożenie, faza 5, część B)
allowed-tools: Read, Write, Bash, Glob, Artifact
effort: low
argument-hint: "<url-canvasu>"
disable-model-invocation: true
---

# Backup canvasu Claude Design

Argument `$ARGUMENTS` — link `claude.ai/artifact/…` do canvasu. Bez argumentu: sprawdź,
czy CLAUDE.md/CLAUDE-LOCAL.md aplikacji wskazuje canvas dla tego repo (np. pole
`design_canvas_*`); jeśli nie ma żadnego — zapytaj, nie zgaduj który canvas.

Claude Design **nie** podłącza się do repozytorium, nie renderuje aplikacji (React ani
Fluttera) i nie służy do testowania zmian w PR-ze — to backup ŹRÓDŁA designu (canvas), nie
test regresji UI. Nie myl tego z `visual-check` (który robi zrzuty żywej aplikacji).

## Trzy poziomy, ten skill robi 2 i 3

1. **Export PDF** — ręczny, z samego canvasu, pięć sekund, tylko obrazek. Poza zakresem
   tego skilla — zrób go sam w UI, jeśli potrzebujesz czegoś natychmiast.
2. **Pliki źródłowe** — `project/canvas.json` + artboardy `.dc.html`, do
   `design-archive/<data>/`. Otwieralne bez Claude'a, widoczne w diffie, wgrywalne
   z powrotem.
3. **Render PNG** — skrypt czyta `canvas.json` i renderuje każdy artboard w jego
   własnym rozmiarze ramki.

## Krok 1 — pliki źródłowe

```
Artifact(action: "list", scope: "files", url: <url z $ARGUMENTS>)
```

daje listę opublikowanych plików tego canvasu (`project/canvas.json` + artboardy).
Dla każdego:

```
Artifact(action: "read", url: <url>, path: <ścieżka pliku>, out_dir: "design-archive/<YYYY-MM-DD>")
```

`<YYYY-MM-DD>` to dzisiejsza data. Jeśli katalog na dziś już istnieje z tego samego
backupu — nadpisz, to backup punktowy, nie log przyrostowy.

## Krok 2 — render PNG

```bash
node skills/design-system/canvas-backup/scripts/render-artboards.mjs \
  --dir design-archive/<YYYY-MM-DD>/ [--app-dir <katalog z node_modules/@playwright/test>]
```

Skrypt (Playwright projektu, tak jak `visual-check`, niczego nie instaluje z sieci):
czyta `canvas.json`, dla każdego artboardu otwiera lokalnie jego `.dc.html` w headless
Chromium z viewportem = rozmiar ramki artboardu z indeksu, i zapisuje
`<nazwa-artboardu>.png` obok źródła.

**Schemat `canvas.json` nie jest jeszcze udokumentowany w tym repo.** Skrypt próbuje kilku
najbardziej prawdopodobnych kształtów (lista obiektów z `id`/`name` + `width`/`height` +
ścieżką pliku); jeśli żaden nie pasuje, loguje surowe klucze najwyższego poziomu zamiast
zgadywać dalej — dopasuj `extractArtboards()` w skrypcie albo zgłoś rozbieżność, żeby
poprawić go raz, dla wszystkich przyszłych backupów.

## Wynik

Pokaż użytkownikowi: ścieżkę `design-archive/<data>/`, liczbę zbackupowanych plików
źródłowych, liczbę wyrenderowanych PNG, i błędy skryptu (jeśli są) — nie milcz o
artboardach, których nie udało się zrenderować.
