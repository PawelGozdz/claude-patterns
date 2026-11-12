---
id: DEV-orc-116-final-gate
status: proposed
resolution: >
  ORC-120 (2026-10-22): finalProbeSkippedFields traktuje build jak typecheck
  (sonda mapuje go na to pole), więc skipped przy checks.finalGate=build trafia
  do report.warnings; prompt sondy każe wołać Bash z timeout 600000, a
  przekroczenie czasu to fail z opisem w tail, nigdy skipped. Przyczyna samego
  skipped to hipoteza (brak dziennika wf_fa3ceca1-1b7): build juz-ide-blog trwa
  minuty. Pierwszy typecheck:fail (wf_cac36de4-1c6) to astro build czytający
  public/_headers jako JS — do naprawy w projekcie, nie w silniku. Gdy skipped
  wróci mimo timeoutu, otworzyć ponownie i sprawdzić dziennik przebiegu.
trigger: no_go
category: verifier
sources:
  - orchestrate
rule_ref: ORC-116
first_seen: 2026-10-21
last_seen: 2026-11-11
occurrences: 2
projects:
  - juz-ide-blog
  - my-intelligence
reopened_at: 2026-11-11
reopened_from_status: promoted
---

# DEV-orc-116-final-gate

## Occurrences

- 2026-11-11 my-intelligence (TS-072) run `wf_59a7e6b4-a3d` warstwa `final-gate` — Sonda bramki końcowej zwróciła tests/typecheck/conformance jako skipped, choć jej tail pokazywał EXIT:0 dla sześciu komend (pytest -k vuln, migrate --dry-run, flake8, py_compile); NO_GO machine z samego unverified_scope. Obejście: --overrides checks.finalGate zawężone do pytest + flake8, nowy przebieg.
- 2026-10-21 juz-ide-blog (BLOG-HOWTO-001) run `wf_fa3ceca1-1b7` warstwa `final-gate` — Bramka koncowa NO_GO cause=machine wylacznie z unverified_scope (zero wlasnych naruszen); sonda checks.finalGate=build zwrocila skipped, a reczny npm run build konczy sie EXIT:0. Wczesniejsza bramka (wf_cac36de4-1c6) dala typecheck:fail mimo ze astro check=0 bledow, a realna przyczyna to astro build (glob public/* parsowal public/_headers jako JS)
