---
id: DEV-anz-layer-mismatch-site
status: promoted
resolution: >
  Naprawione w blocks/astro-content.yml: dirs warstwy site obejmują src/i18n/,
  src/content-system/, src/types/, src/scripts/ i src/screens/. Projekty z blokiem dostają
  zmianę po materialize-runtime (personal-blog zmaterializowany 2026-10-19).
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-blog
---

# DEV-anz-layer-mismatch-site

## Occurrences

- 2026-10-18 juz-ide-blog (BLOG-GUIDES-001) warstwa `site` — runtime.yml: warstwa site (dirs: components, layouts, pages, lib, utils, styles, content.config.ts, astro.config.ts) nie obejmuje src/content-system/ ani src/i18n/ (rejestr, taksonomia, teksty UI) — task BLOG-GUIDES-001 musiał obejść to jednostkami z jawnymi dirs
