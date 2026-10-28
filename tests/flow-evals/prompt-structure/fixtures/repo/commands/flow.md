---
name: flow
description: Demo command used by the prompt-structure eval
---

# /flow — demo

## Przebieg

```
1. start   → bramka
2. praca   → node scripts/run.mjs
3. koniec  → STATUS_DONE
```

## Zasady

Nigdy nie dopisuj `done_layers` ręcznie. Obejście bramki jest zabronione.

Wynik zwraca pole `verdict` oraz marker ESCALATE_HALT.

Odnośniki, które NIE są archeologią: [issue](https://example.com/issues/#1234), kod `#5678`, reguła ORC-123,
zadanie TASK-DEMO-001, kolor #001529, incident response, production incident, komenda /incident.

```
# w bloku kodu wolno wszystko: PR #12, issue #34, incident 2026-01-02, incydent, post-mortem z maja
```

## Changelog

- 2026-01-02 — wpis historii z datą (sekcja Changelog jest zwolniona z lintu dat)

### Podsekcja changelogu

- 2026-02-03 — zagnieżdżony nagłówek niższego poziomu też jest zwolniony

## Po changelogu

Zwykła sekcja bez dat i numerów.
