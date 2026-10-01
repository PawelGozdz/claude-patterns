---
id: DEV-orc-062-testing-knowledge
status: promoted
resolution: >
  Naprawione 2026-09-27 jako ORC-073 (docs/decisions/orchestrate-rule-history.md#orc-073):
  buildProbePrompt() grepuje teraz log sondy po WŁASNYM zakresie warstwy (dirs) PRZED "ostatnimi
  40 liniami" — dokładnie ten przypadek (3 błędy import/order w nowym pliku warstwy, zgubione
  za ostrzeżeniami z shared/ na końcu logu). Podejrzenie zgłaszającego (ekstrakcja w
  orchestrate.template.mjs, nie implementer) potwierdzone i naprawione u źródła.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-testing-knowledge

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_12d5cfb6-f31` warstwa `testing:knowledge` — Drugi BLOCKED_BY_PRIOR z rzędu na tym samym zadaniu (poprzedni: testing:campaign, wf_de5bfcd4-010; teraz: testing:knowledge, wf_12d5cfb6-f31), oba z tym samym wzorcem: implementer dostał/zobaczył log sondy pokazujący TYLKO ostrzeżenia w plikach shared/ (poza jego zakresem) i na tej podstawie ogłosił no-op, mimo że realny błąd (exit 1) leżał W JEGO WŁASNYM zakresie w innym pliku. Zweryfikowane ręcznie (pnpm run lint:check poza silnikiem): 3 błędy import/order w apps/api/src/contexts/knowledge/infrastructure/repositories/research-entry-repositories.integration.spec.ts:5-7 (plik nowo dodany w tej samej warstwie, staged). Plik ten JEST w pełnym wyjściu eslint (potwierdzone: sortuje się przed sekcją shared/), ale nie pojawił się w tekście, który implementer zacytował jako 'red probe'. Podejrzenie: konstrukcja promptu POPRAWKA (orchestrate.template.mjs) albo ekstrakcja violations do fix-loop gubi/obcina wpisy przed przekazaniem implementerowi — wart audytu, bo to już DRUGI przypadek na tym samym zadaniu z identycznym objawem.
