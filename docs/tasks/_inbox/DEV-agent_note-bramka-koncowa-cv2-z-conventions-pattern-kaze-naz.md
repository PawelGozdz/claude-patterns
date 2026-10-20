---
id: DEV-agent_note-bramka-koncowa-cv2-z-conventions-pattern-kaze-naz
status: dismissed
dismissed_reason: >
  Decyzja projektu, nie błąd wzorca ani silnika: karta conventions opisuje domyślną nazwę implementacji repozytorium (`*-kysely.repository.ts`), a kontekst metrics w juz-ide-api-1 ma utrwaloną, lokalną konwencję `*.kysely-repository.ts`. Spójność w obrębie kontekstu wygrywa nad kartą; nowe konteksty stosują kartę. Jeśli ma to być reguła, dopisać ją do lokalnych rules/ projektu. Przy powtórzeniu rekord otworzy się sam.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-bramka-koncowa-cv2-z-conventions-pattern-kaze-naz

## Occurrences

- 2026-10-18 juz-ide-api-1 (TS-SEC-BLOCK-CACHE-001) run `wf_87219140-ded` warstwa `final-gate` — Bramka końcowa: CV2 z conventions-pattern każe nazywać implementację *-kysely.repository.ts, a kontekst ma lokalną konwencję *.kysely-repository.ts; karta nie rozstrzyga, która wygrywa.
