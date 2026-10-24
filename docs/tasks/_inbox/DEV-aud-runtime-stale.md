---
id: DEV-aud-runtime-stale
status: proposed
dismissed_reason: >
  Nieodtwarzalne 2026-10-19: po materialize-runtime (pcu, my-intelligence,
  personal-blog) audit-projects nie zgłasza już "runtime.yml nieaktualny" dla
  żadnego projektu z rekordu (juz-ide-api-1/-2/-4 czyste od 2026-10-17). Wejścia
  kompozycji zmieniły się po materializacji z 2026-10-17; verify-project-setup:
  setup kompletny.
trigger: setup_drift
sources:
  - audit
rule_ref: AUD-RUNTIME-STALE
first_seen: 2026-10-10
last_seen: 2026-10-22
occurrences: 22
projects:
  - juz-ide-api-4
  - juz-ide-api-2
  - juz-ide-api-1
  - my-intelligence
  - pcu
  - aegis-flow
  - ai-gateway
  - ai-os-bot
  - auth
  - feature-flags
  - framework-polityczny
  - grant-flow
  - iam
  - juz-ide-api-3
  - juz-ide-blog
  - juz-ide-mobile-app
  - marketing-hub
  - nest-kit
  - personal-blog
  - platform
  - vytches-ddd
category: config
reopened_at: 2026-10-22
reopened_from_status: dismissed
---

# DEV-aud-runtime-stale

## Occurrences

- 2026-10-22 vytches-ddd — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 platform — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 personal-blog — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 nest-kit — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 marketing-hub — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 juz-ide-mobile-app — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 juz-ide-blog — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 juz-ide-api-3 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 iam — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 grant-flow — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 framework-polityczny — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 feature-flags — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 auth — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 ai-os-bot — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 ai-gateway — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-22 aegis-flow — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-19 pcu — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-19 my-intelligence — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-19 juz-ide-api-1 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-16 juz-ide-api-1 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-14 juz-ide-api-2 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-10 juz-ide-api-4 — runtime.yml nieaktualny (brak inputs_hash — rozróżnienie po następnym setupie)
