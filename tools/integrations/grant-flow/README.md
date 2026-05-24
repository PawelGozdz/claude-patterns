# grant-flow Tools — Instalacja i Quick Start

## Instalacja

```bash
# ~/.local/bin jest w PATH na większości maszyn dev — zalecane
cp grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time

# Weryfikacja
which grantflow-log-time
grantflow-log-time --status
```

Wymagania: `bash`, `curl`, `python3` (lub `jq`) — zero innych zależności.

## Quick Start

```bash
# 1. Jednorazowo — skonfiguruj credentials
grantflow-log-time --setup
# Podaj URL (np. http://localhost:3009), email, hasło

# 2. Jednorazowo per projekt — zmapuj repo na projekt
grantflow-log-time --map grant-flow 0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f

# 3. Koniec sesji — zaloguj czas
grantflow-log-time --project <uuid> --hours 2.5 --description "Implementacja CQRS handlerów"
# lub przez Claude Code: /log-time
```

## Pliki konfiguracyjne

| Plik | Zawartość | Chmod |
|------|-----------|-------|
| `~/.grantflow` | URL, email, hasło | 600 |
| `~/.grantflow-token` | Access token (cache, TTL ~50min) | 600 |
| `~/.grantflow-refresh` | Refresh token | 600 |
| `~/.grantflow-projects` | JSON: repo_name → project_uuid | 600 |

**Nigdy nie commituj tych plików.**

### Format ~/.grantflow

```bash
GRANTFLOW_URL=http://localhost:3009
GRANTFLOW_EMAIL=admin@grantflow.local
GRANTFLOW_PASSWORD=twoje-haslo
```

> **Uwaga port**: lokalny Docker domyślnie mapuje port 3009 hosta → 3000 kontenera.
> Używaj portu hosta w `GRANTFLOW_URL`. Sprawdź: `docker ps | grep grant-flow`

## Wszystkie komendy

```bash
grantflow-log-time --setup                      # konfiguracja credentials
grantflow-log-time --status                     # diagnostyka
grantflow-log-time --list-projects              # lista projektów
grantflow-log-time --list-projects --json       # lista projektów (JSON)
grantflow-log-time --map <repo> <uuid>          # mapuj repo na projekt
grantflow-log-time --today                      # wpisy z dzisiaj
grantflow-log-time --week                       # suma bieżącego tygodnia

# Logowanie czasu
grantflow-log-time --project <uuid> --hours 2.5 --description "..."
grantflow-log-time --project <uuid> --hours 2.5 --date 2026-05-18 --description "..."

# Logowanie z referencją do zadania/commita/PR (external_reference)
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --task TS-RATE-001
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --commit
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --pr feature/billing-rates
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --task TS-001 --commit
```

## Multi-repo setup (wiele projektów na jednej maszynie)

`~/.grantflow` (credentials) jest **globalny** — konfigurujesz raz dla całej maszyny.
`~/.grantflow-projects` (mapowanie repo → uuid) jest **globalne** — obsługuje wszystkie repo.

### Krok 1 — jednorazowo: instalacja i credentials

```bash
cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time
grantflow-log-time --setup   # podaj URL, email, hasło — zapisuje do ~/.grantflow
```

### Krok 2 — per repo: stwórz projekt w grant-flow i zmapuj

Dla każdego repozytorium, które chcesz śledzić:

1. Stwórz projekt w grant-flow (przez API lub UI) — zanotuj UUID.
2. Zmapuj lokalnie:

```bash
grantflow-log-time --map grant-flow    0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f
grantflow-log-time --map juz-ide-api-1 <uuid>
grantflow-log-time --map vytches-ddd   <uuid>
```

Mapowanie zapisuje się do `~/.grantflow-projects` jako JSON.

### Krok 3 — codziennie: loguj czas przez Claude Code

W dowolnym repo wpisz `/log-time` — Claude wykryje repo, znajdzie UUID i zaloguje czas do właściwego projektu.

---

## Zmapowane projekty (ta maszyna)

| Repo | Projekt w grant-flow | UUID |
|------|---------------------|------|
| `grant-flow` | `fork()` | `0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f` |

Uzupełnij tabelę po dodaniu kolejnych projektów.
