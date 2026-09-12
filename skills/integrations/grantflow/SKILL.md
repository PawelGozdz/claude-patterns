---
name: grantflow
description: "Zarządzanie grant-flow: setup, projekty, historia wpisów, mapowanie repozytoriów, podłączenie serwera MCP (mcp-setup). Do szybkiego logowania użyj /log-time."
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
| `/grantflow mcp-setup` | Pokaż jak podłączyć serwer MCP grant-flow (odczyt: projekty, wpisy czasu, wydatki, raporty) do własnego `.mcp.json` |

## Implementacja per sub-komenda

### setup

```bash
grantflow-log-time --setup
```

Interaktywny wizard: URL grant-flow (przez bramę) → URL panelu iam → **login PAT przez
przeglądarkę** (loopback-redirect, jak `gh auth login` — otwiera przeglądarkę, token wraca
do terminala automatycznie) → lista projektów (jeśli rola ma `read.project.*`) → opcjonalne
mapowanie bieżącego repo.

Setup zapisuje `~/.grantflow` (bez sekretów — sam PAT żyje w cache `pat-login-cli`,
`~/.cache/iam-pat-cli/`):
```bash
GRANTFLOW_URL=https://grant-flow.app.dev.juz-ide.pl
IAM_ADMIN_BASE_URL=https://admin.app.dev.juz-ide.pl
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

### mcp-setup

Inne od reszty sub-komend: nic tu się nie "odpala" jako komenda CLI. Serwer MCP grant-flow to
osobny, read-only sposób dostępu (projekty, wpisy czasu, wydatki, raporty) — po dodaniu do
`.mcp.json` jego narzędzia (`list-my-projects`, `get-project`, `list-time-entries` itd.) są
po prostu dostępne w rozmowie, bez wywoływania żadnej komendy. To NIE zastępuje `/log-time` —
zapis czasu nadal idzie tamtędy (MCP jest wyłącznie do odczytu, celowo — patrz
`grant-flow/docs/security/threat-models/TM-TS-MCP-001.md`).

1. Zapytaj użytkownika o ścieżkę lokalnego checkoutu `grant-flow`, jeśli jej nie znasz — nie
   zgaduj (`/opt/projects/grant-flow` to typowa lokalizacja w tym środowisku, ale nie zakładaj).
2. Sprawdź, czy zależności są zainstalowane: `test -d <grant-flow>/tools/mcp-server/node_modules`.
   Jeśli nie — poinformuj, że trzeba raz uruchomić `pnpm install` w `<grant-flow>/tools/mcp-server`,
   i zapytaj, czy zrobić to teraz.
3. Wypisz gotowy fragment do wklejenia do WŁASNEGO `.mcp.json` użytkownika (ścieżka bezwzględna,
   z jego odpowiedzią z kroku 1):
   ```json
   {
     "mcpServers": {
       "grant-flow": {
         "command": "npx",
         "args": ["tsx", "<grant-flow>/tools/mcp-server/src/index.ts"],
         "env": {
           "IAM_ADMIN_BASE_URL": "https://admin.app.dev.juz-ide.pl"
         }
       }
     }
   }
   ```
4. Poinformuj: po zapisaniu `.mcp.json` trzeba zrestartować Claude Code (albo przeładować
   serwery MCP), a pierwsze wywołanie narzędzia otworzy przeglądarkę do logowania PAT (ten sam
   mechanizm co `/grantflow setup`) — chyba że cache (`~/.cache/iam-pat-cli/`) już ma ważny token.
5. Zaproponuj weryfikację: po restarcie wywołaj narzędzie `get-my-authorization` — nie wymaga
   żadnych parametrów, więc jeśli ono działa, cała reszta też zadziała (ten sam klient, ta sama
   autoryzacja). Pełna lista narzędzi i troubleshooting:
   `<grant-flow>/tools/mcp-server/README.md`.

## Obsługa błędów

- `~/.grantflow` brak → "Brak konfiguracji. Uruchom: /grantflow setup"
- API nie odpowiada (przez bramę) → "grant-flow lub brama iam offline. Sprawdź oba stosy: iam/platform i grant-flow (docker compose up -d w obu)"
- HTTP 403 na `--list-projects` → to NIE błąd konfiguracji — rola użytkownika nie ma `read.project.own`/`read.project.all`. Logowanie czasu (`create.time-entry.own`) nadal działa do znanego UUID; wyjaśnij to użytkownikowi, nie sugeruj ponownego `--setup`.
- Nieznany sub-command → wypisz dostępne komendy i przykłady
- `grantflow-log-time` nie w PATH → "Zainstaluj (patrz tools/integrations/grant-flow/README.md — wymaga skopiowania CAŁEGO katalogu, nie tylko skryptu):
  ```
  mkdir -p ~/.local/share/grantflow-cli
  cp -r /opt/projects/claude-patterns/tools/integrations/grant-flow/pat-login-cli ~/.local/share/grantflow-cli/pat-login-cli
  cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
  chmod +x ~/.local/bin/grantflow-log-time
  ```"
- `npx`/Node.js brak → login PAT przez przeglądarkę tego wymaga (`pat-login-cli` jest modułem TS uruchamianym przez `npx tsx`). Bez Node.js logowanie się nie uda — nie ma dziś czystego bash fallbacku.
