---
id: DEV-orc-144-final-gate
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): D15 pkt 1 (backfill disclosed_point przez
  address_disclosed_points ⋈ user_residences) niewykonalny w SQL, bo tabele nie mają wspólnego
  klucza. Bramka końcowa wykryła to zgodnie z zadaniem; decyzję poprawia człowiek. ORC-144
  skierował poprawki do warstw. 2026-11-02. Ponownie 2026-11-03 (grant-flow
  TS-PROJ-WRITEOWN-002): specyfikacje L2 w application/commands/*/__tests__/ nie miały
  właściciela w żadnej warstwie, testing zawężone do czterech katalogów; runda naprawcza
  pominęła trzy z pięciu ustaleń jako poza zakresem (ORC-042/135). Błąd planu analizy
  (ANL-038/053), ta sama klasa co
  DEV-agent_note-domain-test-zgodnosci-typow-accessscope-projectwr.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-144
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 2
projects:
  - juz-ide-api-3
  - grant-flow
reopened_at: 2026-11-02
reopened_from_status: dismissed
---

# DEV-orc-144-final-gate

## Occurrences

- 2026-11-02 grant-flow (TS-PROJ-WRITEOWN-002) run `wf_f789d4ba-3b0` warstwa `final-gate` — Bramka końcowa: specyfikacje L2 w application/commands/*/__tests__/ (set/clear-parent, assign/remove-member) nie miały właściciela w żadnej warstwie (testing zawężone do 4 katalogów, application nie ma praw do nowych testów L2); runda naprawcza pominęła 3 z 5 ustaleń jako poza zakresem. Analiza powinna wpisać te katalogi do layers_scope.testing.
- 2026-11-02 juz-ide-api-3 (TS-GEO-HOME-POINT-CONTRACT-001) run `wf_96d04dc9-ee0` warstwa `final-gate` — D15 pkt 1 (backfill disclosed_point w 357 przez address_disclosed_points ⋈ user_residences) niewykonalny w SQL: address_disclosed_points kluczowane address_key_hash, którego user_residences nie ma
