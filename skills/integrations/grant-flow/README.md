# grant-flow Skills — Logowanie czasu i zarządzanie projektami

Dwa skills dostępne w każdym projekcie Claude Code po skonfigurowaniu integracji.

## Quick reference

| Komenda | Kiedy używać |
|---------|-------------|
| `/log-time` | Koniec sesji — szybkie zalogowanie godzin |
| `/grantflow setup` | Jednorazowo — konfiguracja credentials |
| `/grantflow map <repo> <uuid>` | Jednorazowo per projekt — mapowanie |
| `/grantflow today` | Sprawdź co już zalogowałeś dziś |
| `/grantflow week` | Przegląd tygodnia |
| `/grantflow status` | Diagnostyka połączenia i konfiguracji |

## Wymagane narzędzie CLI

Skills wywołują `grantflow-log-time` (bash script w PATH).

```bash
# Sprawdź czy zainstalowane
which grantflow-log-time && echo "OK" || echo "BRAK"

# Instalacja (jeśli BRAK)
cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time
```

Szczegóły: `tools/integrations/grant-flow/README.md`

## Pierwsze uruchomienie w projekcie

```bash
# 1. Skonfiguruj (raz globalnie)
/grantflow setup
# Podaj URL grant-flow, np. http://localhost:3009 dla lokalnego Docker

# 2. Zmapuj repo (raz per projekt)
/grantflow map grant-flow 0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f

# 3. Używaj na końcu każdej sesji
/log-time
```
