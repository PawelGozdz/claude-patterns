# Skills — Category Index

**Total**: 194 skills across 23 categories. This table is the index — there is no
per-category README to fall through to. Only the three vendored toolkits
(`finance/`, `marketing/`, `legal/`) carry their own `README.md`, because they
document upstream provenance and licensing; everywhere else the skill's own
`SKILL.md` is the documentation. Counts drift as skills come and go — verify with
`node ../scripts/count-assets.mjs`.

| Category | Skills | What it covers |
|----------|--------|-----------------|
| [finance/](finance/) | 91 | Vendored investment/compliance/advisory/trading skills (JoelLewis/finance_skills, MIT), plugin-aware |
| [marketing/](marketing/) | 42 | Vendored CRO/copy/SEO/paid/growth/RevOps skills (coreyhaines31/marketingskills, MIT) |
| [legal/](legal/) | 12 | Vendored contract/GDPR/NDA/compliance skills (license-fragmented — see `EXTERNAL.md`) |
| [orchestration/](orchestration/) | 8 | Project management (`/pulse`, `/task-health`, `/sprint`) |
| [security/](security/) | 4 | `/security-review`, `/security-check`, `/threat-model`, `/incident` |
| [decision-frameworks/](decision-frameworks/) | 3 | ADR authoring and related decision-record tooling |
| [ai-ml/](ai-ml/) | 3 | GPU inference patterns (batching, VRAM budget, serving runtime) |
| [flutter/](flutter/) | 3 | Flutter-specific skills (brand motion, design tokens, etc.) |
| [infrastructure/](infrastructure/) | 3 | PM2, deployment-adjacent tooling |
| [learning/](learning/) | 2 | `capture` (blog drafts), `claude-updates-watcher` |
| [quality/](quality/) | 3 | Code review, humanizer, simplify |
| [testing/](testing/) | 3 | TDD workflow, verification loop, e2e testing |
| [architecture/](architecture/) | 2 | Cross-cutting architecture skills |
| [database/](database/) | 2 | Database-adjacent skills |
| [integrations/](integrations/) | 2 | External tool/service integration skills |
| [meta/](meta/) | 2 | `add-pattern`, `skill-stocktake` — tooling for maintaining this repo itself |
| [optimization/](optimization/) | 2 | `strategic-compact`, `cost-aware-llm-pipeline` |
| [python/](python/) | 2 | Python-specific skills |
| [backend/](backend/) | 1 | Backend-general skill |
| [nextjs/](nextjs/) | 1 | Next.js-specific skill |
| [sveltekit/](sveltekit/) | 1 | SvelteKit-specific skill |
| [typescript-library/](typescript-library/) | 1 | TypeScript library authoring skill |
| [vcs/](vcs/) | 1 | Version-control-specific skill |

**Vendored toolkits** (finance/marketing/legal) have their own sync scripts
(`scripts/sync-{finance,marketing,legal}-skills.sh`) — see the root `CLAUDE.md`
"Adding / Updating … Skills" sections before hand-editing anything inside them.
