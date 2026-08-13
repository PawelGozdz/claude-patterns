---
# Artefakt analizy — kontrakt handoff research → implementacja (ADR 0002).
# Pisany przez /analyze, edytowany przez CZŁOWIEKA, czytany przez /orchestrate.
# Lokalizacja: project-orchestration/analysis/{TASK-ID}.analysis.md  (NIE tasks/ — tam tylko taski)
task: TS-XXX-000
status: awaiting-human          # draft | awaiting-human | approved  ← BRAMKA MASZYNOWA
# /orchestrate ODMÓWI startu dopóki status != approved LUB jakiekolwiek answer == null.

threat_model: null              # link do docs/security/threat-models/TM-{TASK-ID}.md (lub null jeśli nie-security)
# Security (STRIDE/DREAD/LINDDUN) NIE tutaj — żyje w threat-models/. Tu tylko link + krótkie "Ryzyka".

open_questions:                 # człowiek wypełnia answer; null = blokuje implementację
  # `ask` czyta CZŁOWIEK, `q` czytają agenci i audyt. Oba obowiązkowe.
  # Rejestr `ask` bierze się z runtime.yml `human_voice` (domyślnie: polski, biznesowy,
  # max 2 zdania, bez nazw klas, ścieżek i numerów ADR). Bez tego rozdziału pytanie
  # opisuje problem językiem, którym go znaleziono — i człowiek musi poprosić
  # o tłumaczenie, zanim odpowie „tak/nie".
  - id: Q1
    ask: >-
      Czy potwierdzenie rejestracji ma dotrzeć do użytkownika natychmiast, czy może
      przyjść z opóźnieniem? Natychmiast znaczy drożej i bardziej awaryjnie.
    q: "np. rejestracja confirmation email — sync czy async?"
    answer: null
  - id: Q2
    ask: "..."
    q: "..."
    answer: null

decisions:                      # propozycje z analizy; człowiek weryfikuje/poprawia
  # `means` = co ta decyzja zmienia dla produktu albo użytkownika, tym samym rejestrem
  # co `ask`. `rationale` zostaje techniczne — to ono uzasadnia wybór przed agentem.
  - id: D1
    topic: "np. komunikacja cross-context"
    choice: "ACL Registry (getGlobalRequired)"
    means: "Dwa obszary systemu przestają zależeć od siebie wprost, więc awaria jednego nie zatrzymuje drugiego."
    rationale: "..."

patterns:                       # grounding (z Pattern Discovery) — to samo w research i impl
  - domain/aggregate-pattern.md
  - application/command-handler-pattern.md

units: []                       # Ralphinho seam — pusty = jeden unit (cały task). MVP: zostaw [].
---

# Analiza: {TASK-ID}

## Synteza (tech-lead)
<co robić, w jakiej kolejności, kluczowe ryzyka — wypełnia panel /analyze>

## Otwarte pytania (DO DYSKUSJI — odpowiedz w frontmatter `answer:`)
- **Q1**: ...
- **Q2**: ...

## Decyzje (proponowane — zweryfikuj)
- **D1**: ...

## Ryzyka / uwagi
- ...

---
> Po wypełnieniu odpowiedzi i zatwierdzeniu decyzji: ustaw `status: approved`,
> potem uruchom `/orchestrate {TASK-ID}`.
