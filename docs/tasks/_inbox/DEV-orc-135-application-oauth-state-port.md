---
id: DEV-orc-135-application-oauth-state-port
status: proposed
trigger: halt
category: scope
sources:
  - orchestrate
rule_ref: ORC-135
first_seen: 2026-11-15
last_seen: 2026-11-15
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-135-application-oauth-state-port

## Occurrences

- 2026-11-15 juz-ide-api-2 (TS-TOOLING-AUTH-DOMAIN-PURITY-001) run `wf_680d811c-f50` warstwa `application:oauth-state-port` — Analiza nie wpisała src/contexts/auth/domain/services/__tests__/ do zakresu (dirs) żadnej jednostki. Stare specy przenoszonych klas (oauth-state*, secure-token, password-hashing, auth-rate-limiting) importowały usunięte pliki, a silnik odrzucał ich usunięcie jako poza zakresem warstwy (ORC-135). Skutek: 3 próby application:oauth-state-port zmarnowane tą samą przyczyną, ok. 1 mln tokenów; ten sam mechanizm dotknął application:secure-token-port i domain:hash-port. Obejście: --overrides scope.dirs. Brakuje w analizie kroku: dla każdej jednostki przenoszącej klasę dodaj katalog starego specu do zakresu.
