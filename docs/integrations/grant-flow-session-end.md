# Hook: grant-flow Session End Prompt (opcjonalny)

> **Typ**: `Stop` hook — uruchamia się gdy Claude Code kończy odpowiedź
> **Wymaganie**: `~/.grantflow` musi istnieć (hook jest cichy jeśli brak konfiguracji)
> **Blokowanie**: NIE — hook nie blokuje, tylko wyświetla przypomnienie

## Co robi

Po zakończeniu każdej odpowiedzi Claude Code, jeśli użytkownik ma skonfigurowany grant-flow (`~/.grantflow` istnieje), hook wypisuje na stderr krótkie przypomnienie o logowaniu czasu.

## Instalacja

Wklej do `.claude/settings.json` lub `~/.claude/settings.json` (globalnie):

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "bash -c 'if [[ -f ~/.grantflow ]]; then echo \"[grant-flow] Pamiętaj o logowaniu czasu → /log-time\" >&2; fi'"
        }]
      }
    ]
  }
}
```

## Wariant — tylko raz na koniec dnia (bardziej dyskretny)

Hook sprawdza czy już logowano dziś i wyświetla przypomnienie tylko jeśli nie:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "bash -c 'if [[ -f ~/.grantflow ]] && which grantflow-log-time &>/dev/null; then TODAY=$(date +%Y-%m-%d); COUNT=$(grantflow-log-time --today 2>/dev/null | grep -c \"h  \" || echo 0); if [[ \"$COUNT\" -eq 0 ]]; then echo \"[grant-flow] Brak wpisów z dzisiaj → /log-time\" >&2; fi; fi'"
        }]
      }
    ]
  }
}
```

## Uwagi

- Hook używa `>&2` (stderr) — jest widoczny w Claude Code jako komunikat hookowy
- `matcher: ""` = każda odpowiedź Claude Code; możesz zawęzić do konkretnych komend
- Nie instaluj tego hooka jeśli używasz `/checkpoint` lub `/log-time` regularnie ręcznie — będzie irytujące
- Rekomendowane użycie: globalnie w `~/.claude/settings.json` jeśli pracujesz w kilku projektach naraz
