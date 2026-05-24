---
name: grantflow
description: "Zarządzanie grant-flow: setup, projekty, historia wpisów, mapowanie repozytoriów. Do szybkiego logowania użyj /log-time."
allowed-tools: Bash, Read, Write
effort: low
---

# /grantflow — Zarządzanie grant-flow

## Sub-komendy

| Wywołanie | Opis |
|-----------|------|
| `/grantflow setup` | Konfiguracja credentials + mapowanie projektu |
| `/grantflow projects` | Lista aktywnych projektów |
| `/grantflow map <repo> <uuid>` | Dodaj/aktualizuj mapowanie repo → projekt |
| `/grantflow today` | Wpisy z dzisiaj (suma godzin) |
| `/grantflow week` | Wpisy z bieżącego tygodnia |
| `/grantflow status` | Diagnostyka: API, token, mapowania |

## Implementacja per sub-komenda

### setup

```bash
grantflow-log-time --setup
```

Interaktywny wizard: URL → email → hasło → test login → lista projektów → opcjonalne mapowanie bieżącego repo.

Setup zapisuje `~/.grantflow`:
```bash
GRANTFLOW_URL=http://localhost:3009
GRANTFLOW_EMAIL=user@example.com
GRANTFLOW_PASSWORD=secret
```

### projects

```bash
grantflow-log-time --list-projects
```

### map <repo> <uuid>

Waliduj UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), potem:

```bash
grantflow-log-time --map <repo> <uuid>
```

Jeśli nie podano argumentów — zapytaj użytkownika interaktywnie o nazwę repo i UUID.

### today

```bash
grantflow-log-time --today
```

### week

```bash
grantflow-log-time --week
```

### status

```bash
grantflow-log-time --status
```

## Obsługa błędów

- `~/.grantflow` brak → "Brak konfiguracji. Uruchom: /grantflow setup"
- API nie odpowiada → "grant-flow offline. Uruchom: cd /opt/projects/grant-flow && docker compose up -d"
- Nieznany sub-command → wypisz dostępne komendy i przykłady
- `grantflow-log-time` nie w PATH → "Zainstaluj: cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time && chmod +x ~/.local/bin/grantflow-log-time"
