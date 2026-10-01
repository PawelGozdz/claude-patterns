---
id: DEV-no_go-bramka-koncowa-no-go-po-naprawie-warstwy-web-maxa
status: dismissed
dismissed_reason: >
  Nie dotyczy silnika claude-patterns — bramka końcowa zadziałała poprawnie i znalazła
  realne, konkretne braki w implementacji TS-MH-011 (format:check na 9 plikach, brak L3
  smoke dla auth-kit wymaganego w Scope, brak testów L2 dla 3 konkretnych wymagań MUST,
  1 pre-istniejący defekt poza zakresem). Weryfikator final-gate sam zaproponował 5-punktowy
  plan naprawczy — to zadanie do wykonania w kolejnej rundzie warstwy web/testing w
  marketing-hub (jego własny backlog/TEAM-STATE), nie zmiana reguł/silnika tego repo.
trigger: no_go
rule_ref: null
first_seen: 2026-09-28
last_seen: 2026-09-28
occurrences: 1
projects:
  - marketing-hub
---

# DEV-no_go-bramka-koncowa-no-go-po-naprawie-warstwy-web-maxa

## Occurrences

- 2026-09-28 marketing-hub (TS-MH-011) run `wf_1cc32410-e51` — Bramka końcowa NO_GO po naprawie warstwy web (maxAttempts bump 3->5): 4 blokujące (format:check na 9 plikach, brak L3 Playwright smoke dla auth-kit wymaganego w Scope zadania, brak testów L2 dla TM-TS-MH-011 MUST-002 (UserMenu CanAccess) i dla D4 filtrowania ról, brak testu L2 dla RedirectToSignIn retry/SessionExpired) + 3 WARN (brak potwierdzenia przy revoke, brak safeParse w mutacjach, brak paginacji w UsersAndRolesScreen) + 1 pre-istniejący defekt poza zakresem (wyścig BootstrapFounder w TS-MH-010, test authorization-repositories.integration.spec.ts:149 czerwony 3/3 razy) + uwaga commit-condition (27 plików untracked musi wejść razem w jeden commit). Weryfikator final-gate sam zaproponował plan naprawczy (5 punktów). Wymaga nowej rundy warstwy web/testing, nie tylko podniesienia budżetu prób.
