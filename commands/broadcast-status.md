---
name: broadcast-status
description: |
  Raport kanału broadcastu — ostatnie wpisy, wpisy bez podjętego obowiązku,
  topiki bez subskrybentów, wiek kursorów, rozjazd manifestów, pominięte linie.
  Bez agenta, bez kosztu (wzorzec /pm-status).
tools: Bash, Read
model: haiku
---

# /broadcast-status — stan kanału

**Koszt**: ~$0 | **Kiedy**: przed oceną go/no-go pilota, gdy coś „nie doszło",
gdy podejrzewasz, że instancje rozjechały się konfiguracją.

## Workflow

### 1. Uruchom raport

```bash
node "$HOME/.claude/hooks/lib/broadcast/cli.js" status
```

Jeśli komenda zgłasza brak manifestu — broadcast nie jest włączony w tym projekcie
i to jest poprawny stan domyślny. Nie włączaj go z własnej inicjatywy.

### 2. Przekaż wynik i wskaż, co wymaga reakcji

Interpretacja sekcji:

| sekcja | co znaczy | reakcja |
|---|---|---|
| **pominiętych linii > 0** | uszkodzone wpisy w segmencie | jeśli rośnie — ktoś pisze do kanału z pominięciem CLI |
| **wpisy z owner, bez claimu** | obowiązek przypisany, nikt go nie podjął | zgłoś człowiekowi; nie podejmuj sam, jeśli owner ≠ twoje repo |
| **topiki bez subskrybentów** | emisja w próżnię | albo ktoś ma dopisać subskrypcję, albo topic jest zbędny |
| **wiek kursora** | instancja dawno nie czytała | zwykle po prostu nie pracuje — nie alarmuj automatycznie |
| **rozjazd manifestów** | instancje jednego repo deklarują różne `emits`/`subscribes` | cicha luka w pokryciu — wyrównaj manifesty |

### 3. Diagnostyka konfiguracji (gdy coś nie działa)

```bash
node "$HOME/.claude/hooks/lib/broadcast/cli.js" doctor
```

## Ocena pilota (faza 6.1, po 2 tygodniach)

Kryterium go/no-go z `TASK-BROADCAST-001`:

- **≥1 wpis, który realnie zapobiegł pracy na nieaktualnym założeniu**, oraz
- **≥30% wpisów ocenionych przez człowieka jako trafne**.

Poniżej progu porzucamy całość — kosztem jednego katalogu i dwóch komend.
Do zebrania danych użyj `status --json` i przejrzyj wpisy z człowiekiem;
**nie oceniaj trafności samodzielnie** — to jest właśnie ta hipoteza, którą testujemy.

## Powiązane

- `/broadcast` — nadawanie, czytanie, ACK, claim
- `project-orchestration/RUN-STATE.md` — stan lokalnych runów workflow (osobny mechanizm;
  link jest jednokierunkowy: stąd tam, nigdy odwrotnie)
