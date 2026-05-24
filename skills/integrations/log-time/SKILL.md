---
name: log-time
description: "Zaloguj godziny pracy do grant-flow. Używaj na końcu każdej sesji lub gdy chcesz zapisać czas do projektu."
allowed-tools: Bash, Read
effort: low
---

# /log-time — Logowanie czasu do grant-flow

Skill wywołuje `grantflow-log-time` CLI, które zarządza auth, projektem i wpisem.

## Kroki

### Krok 0 — sprawdź czy grant-flow działa

```bash
curl -sf http://localhost:3000/api/health
```

Jeśli błąd: wyświetl "grant-flow nie odpowiada. Uruchom: cd /opt/projects/grant-flow && docker compose up -d" i STOP.

Jeśli brak `~/.grantflow`: wyświetl "Brak konfiguracji. Uruchom najpierw: /grantflow setup" i STOP.

### Krok 1 — zbierz kontekst sesji

Wywnioskuj z bieżącej rozmowy:

- **Co robiłeś**: zbierz bullet points — funkcje, pliki, bugi, decyzje architektoniczne
- **Ile godzin**: jeśli nie wiadomo — zapytaj użytkownika wprost
- **Który projekt**: wykryj automatycznie

```bash
basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null || echo "unknown"
```

Zaproponuj opis na podstawie sesji (max 100 znaków, faktyczny, bez buzzwordów).

### Krok 2 — ustal projectId

```bash
# Sprawdź mapowanie
REPO=$(basename $(git rev-parse --show-toplevel 2>/dev/null))
python3 -c "import json; d=json.load(open('$HOME/.grantflow-projects')); print(d.get('$REPO', ''))" 2>/dev/null
```

- Jeśli UUID znaleziony → użyj go
- Jeśli nie ma → uruchom `grantflow-log-time --list-projects` i poproś użytkownika o wybór
- Opcjonalnie zaproponuj zapisanie mapowania: `grantflow-log-time --map $REPO <uuid>`

### Krok 3 — potwierdź z użytkownikiem

Pokaż podsumowanie:
```
Loguję:
  Projekt: <nazwa> (<uuid>)
  Godziny: X.Xh
  Data: YYYY-MM-DD
  Opis: "..."
Potwierdzasz? (tak/nie)
```

Poczekaj na odpowiedź. Nigdy nie loguj bez potwierdzenia.

### Krok 4 — wyślij wpis

```bash
grantflow-log-time \
  --project <uuid> \
  --hours <h> \
  --date $(date +%Y-%m-%d) \
  --description "<opis>"
```

### Krok 5 — potwierdź

Wyświetl wynik z CLI (zawiera "✓ Zalogowano Xh — ...").

## Przykłady opisów (dobre vs złe)

```
✅ "BC #4 Time Tracking — CQRS handlers, L2 tests, repository"
✅ "auth context refactor — JWT refresh flow, cookie migration"
✅ "Discord adapter skeleton — message handler + aggregator"

❌ "praca nad projektem"
❌ "implementacja feature'ów"
❌ "coding session"
```
