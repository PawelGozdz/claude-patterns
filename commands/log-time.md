---
name: log-time
description: |
  Zaloguj godziny pracy do grant-flow. Używaj na końcu każdej sesji.
  
  Claude analizuje bieżącą sesję, proponuje opis i liczbę godzin,
  pyta o potwierdzenie, i wywołuje grantflow-log-time CLI.
  
  Wymagania: ~/.grantflow skonfigurowane (URL, email, hasło).
  CLI: grantflow-log-time musi być w PATH.
  Setup: /grantflow setup
tools: Bash, Read
model: haiku
temperature: 0.2
---

# /log-time — Loguj czas do grant-flow

## Workflow

### Krok 0 — sprawdź dostępność

```bash
test -f ~/.grantflow && echo "configured" || echo "missing"
```

Jeśli brak `~/.grantflow`: "Brak konfiguracji grant-flow. Uruchom: `/grantflow setup`" → STOP.

```bash
source ~/.grantflow 2>/dev/null
curl -sf "${GRANTFLOW_URL:-http://localhost:3009}/api/health" && echo "OK" || echo "OFFLINE"
```

Jeśli OFFLINE: "grant-flow nie odpowiada. Uruchom: `cd /opt/projects/grant-flow && docker compose up -d`" → STOP.

```bash
which grantflow-log-time && echo "CLI OK" || echo "CLI MISSING"
```

Jeśli CLI MISSING:
```
grantflow-log-time nie jest w PATH.
Zainstaluj:
  cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
  chmod +x ~/.local/bin/grantflow-log-time
```
→ STOP.

### Krok 1 — wykryj projekt

```bash
basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null || echo "unknown"
```

Sprawdź mapowanie:
```bash
python3 -c "
import json, os
f = os.path.expanduser('~/.grantflow-projects')
if os.path.exists(f):
    d = json.load(open(f))
    import subprocess
    repo = subprocess.run(['git','rev-parse','--show-toplevel'], capture_output=True, text=True).stdout.strip()
    name = os.path.basename(repo)
    print(d.get(name, ''))
" 2>/dev/null || echo ""
```

Jeśli brak mapowania: "Repo nie jest zmapowane. Uruchom: `/grantflow map <repo-name> <project-uuid>`" → STOP.

### Krok 2 — zbierz kontekst

Na podstawie bieżącej rozmowy wywnioskuj:
- **Co robiłeś**: konkretne elementy (pliki, funkcje, zadania) — max 100 znaków
- **Ile godzin**: zapytaj jeśli nie wiadomo

### Krok 3 — potwierdź z użytkownikiem

```
Loguję czas w grant-flow:
  Projekt: <nazwa> (<uuid>)
  Godziny: X.Xh
  Data:    <dziś>
  Opis:    "<opis>"

Potwierdzasz? (tak / edytuj opis / inna liczba godzin / nie)
```

### Krok 4 — zaloguj

```bash
grantflow-log-time \
  --project <uuid> \
  --hours <h> \
  --date $(date +%Y-%m-%d) \
  --description "<opis>"
```

Opcjonalnie, jeśli pracowałeś nad konkretnym zadaniem z backlogu:
```bash
grantflow-log-time \
  --project <uuid> \
  --hours <h> \
  --date $(date +%Y-%m-%d) \
  --description "<opis>" \
  --task TS-XXX-001
```

### Krok 5 — zakończ

Wyświetl wynik (CLI pokazuje "✓ Zalogowano Xh — ..."). Nie dodawaj nic więcej.
