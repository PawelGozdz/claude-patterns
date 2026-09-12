---
name: grantflow
description: |
  Zarządzanie grant-flow: setup credentials, lista projektów, mapowanie repozytoriów,
  historia wpisów (dziś, tydzień), diagnostyka.
  
  Użycie: /grantflow <sub-command>
  Sub-commands: setup | projects | map <repo> <uuid> | today | week | status

  Do szybkiego logowania czasu użyj: /log-time
tools: Bash, Read, Write
model: haiku
temperature: 0.2
---

# /grantflow — Zarządzanie grant-flow

## Obsługiwane sub-komendy

Gdy użytkownik pisze `/grantflow <sub>`, wykonaj odpowiednią akcję:

### `setup`

Interaktywna konfiguracja — tworzy `~/.grantflow` i loguje przez PAT:

```bash
grantflow-log-time --setup
```

Jeśli `grantflow-log-time` nie jest w PATH, najpierw zainstaluj **CAŁY katalog**, nie sam
skrypt — potrzebny towarzyszący `pat-login-cli/`:
```bash
mkdir -p ~/.local/share/grantflow-cli
cp -r /opt/projects/claude-patterns/tools/integrations/grant-flow/pat-login-cli ~/.local/share/grantflow-cli/pat-login-cli
cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time
```

Setup wizard zapyta o:
- URL grant-flow (przez bramę `iam`, np. `https://grant-flow.app.dev.juz-ide.pl`)
- URL panelu `iam` (do wydania PAT, np. `https://admin.app.dev.juz-ide.pl`)
- Otwiera przeglądarkę do loopback-redirect logowania (RFC 8252, jak `gh auth login`) —
  **nie hasło**: od TS-SSO-023 (2026-08-24) grant-flow nie ma już logowania email+hasło.
  Testuje login, pokazuje projekty, opcjonalnie mapuje bieżące repo

### `projects`

```bash
grantflow-log-time --list-projects
```

### `map <repo-name> <project-uuid>`

Jeśli argumenty podane:
```bash
grantflow-log-time --map <repo-name> <project-uuid>
```

Jeśli brak argumentów — zapytaj interaktywnie:
1. Pokaż listę projektów: `grantflow-log-time --list-projects`
2. Wykryj repo: `basename $(git rev-parse --show-toplevel)`
3. Poproś o UUID: "Wklej UUID projektu dla '<repo>':"
4. Wywołaj `grantflow-log-time --map <repo> <uuid>`

### `today`

```bash
grantflow-log-time --today
```

### `week`

```bash
grantflow-log-time --week
```

### `status`

```bash
grantflow-log-time --status
```

Pokazuje: URL, email, status API, ważność tokena, zmapowane projekty.

### Brak sub-komendy lub nieznana

Wyświetl help:
```
Dostępne komendy:
  /grantflow setup              — skonfiguruj credentials
  /grantflow projects           — lista projektów
  /grantflow map <repo> <uuid>  — zmapuj repo na projekt
  /grantflow today              — wpisy z dzisiaj
  /grantflow week               — suma bieżącego tygodnia
  /grantflow status             — diagnostyka

Szybkie logowanie czasu: /log-time
```

## Obsługa błędów globalnych

- Brak `~/.grantflow` → "Brak konfiguracji. Uruchom: `/grantflow setup`"
- grant-flow offline → "Uruchom: `cd /opt/projects/grant-flow && docker compose up -d`"
- Brak `grantflow-log-time` w PATH → "Zainstaluj CAŁY katalog (skrypt + `pat-login-cli/`) — patrz `tools/integrations/grant-flow/README.md`, sekcja Instalacja"
