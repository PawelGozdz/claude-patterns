---
# Artefakt analizy — kontrakt handoff research → implementacja (ADR 0002).
# Pisany przez /analyze-ddd, edytowany przez CZŁOWIEKA, czytany przez /orchestrate-ddd.
# Lokalizacja: project-orchestration/analysis/{TASK-ID}.analysis.md  (NIE tasks/ — tam tylko taski)
task: TS-XXX-000
status: awaiting-human          # draft | awaiting-human | approved  ← BRAMKA MASZYNOWA
# /orchestrate-ddd ODMÓWI startu dopóki status != approved LUB jakiekolwiek answer == null.

threat_model: null              # link do docs/security/threat-models/TM-{TASK-ID}.md (lub null jeśli nie-security)
# Security (STRIDE/DREAD/LINDDUN) NIE tutaj — żyje w threat-models/. Tu tylko link + krótkie "Ryzyka".

open_questions:                 # człowiek wypełnia answer; null = blokuje implementację
  - id: Q1
    q: "np. rejestracja confirmation email — sync czy async?"
    answer: null
  - id: Q2
    q: "..."
    answer: null

decisions:                      # propozycje z analizy; człowiek weryfikuje/poprawia
  - id: D1
    topic: "np. komunikacja cross-context"
    choice: "ACL Registry (getGlobalRequired)"
    rationale: "..."

patterns:                       # grounding (z Pattern Discovery) — to samo w research i impl
  - domain/aggregate-pattern.md
  - application/command-handler-pattern.md

units: []                       # Ralphinho seam — pusty = jeden unit (cały task). MVP: zostaw [].
---

# Analiza: {TASK-ID}

## Synteza (tech-lead)
<co robić, w jakiej kolejności, kluczowe ryzyka — wypełnia panel /analyze-ddd>

## Otwarte pytania (DO DYSKUSJI — odpowiedz w frontmatter `answer:`)
- **Q1**: ...
- **Q2**: ...

## Decyzje (proponowane — zweryfikuj)
- **D1**: ...

## Ryzyka / uwagi
- ...

---
> Po wypełnieniu odpowiedzi i zatwierdzeniu decyzji: ustaw `status: approved`,
> potem uruchom `/orchestrate-ddd {TASK-ID}`.
