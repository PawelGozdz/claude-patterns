# Security checklists

Per-feature checklists augmented onto task files based on `canonical-labels.yml`
mapping. Read by:

- `hooks/check-security-considerations.js` — suggests checklists at task creation, blocks at status: in-progress when security-relevant + pre-analysis empty
- `skills/orchestration/orchestrate` Step 0a — security pre-flight check
- `skills/orchestration/{sprint,pulse}` — aggregate security gaps across sprint

## Files

| File | Trigger (canonical-labels.yml group) | Purpose |
|------|--------------------------------------|---------|
| `universal.md` | always | 5 NestJS-DDD invariants + B2G-readiness items (audit, sovereignty, DPIA awareness, PL regulatory) |
| `auth.md` | `auth` (auth, login, session, jwt, oauth, mfa, ...) | Authentication flow, session security, brute-force protection |
| `pii.md` | `pii` (pii, gdpr, geo, payment, email, pesel, nip, ...) | PII processing, RODO compliance, data minimization, retention |
| `cross-context.md` | `cross_context` (integration, multi-context, acl, ...) | Bounded context boundaries, ACL Registry, hybrid events, sagas |
| `public-api.md` | `public_api` (api, endpoint, public, b2c) | Anti-abuse, rate limit, input validation, anti-fingerprinting |
| `accessibility.md` | `accessibility` (ui, frontend, a11y, wcag) | WCAG 2.1 AA, keyboard navigation, Polish-language UI |
| `b2g.md` | `b2g` (b2g, government, civic, urzad, ksc) | Strictest — Polish regulatory, audit, data sovereignty, eIDAS |

## How items are picked

```
canonical-labels.yml security_groups:
  <group>:
    aliases: [...]
    checklist: security-checklists/<file>.md

Algorithm (hook):
  1. Read task labels + lowercased title
  2. For each group: match if any alias is in labels OR substring of title
  3. Collect matched groups → load corresponding checklist files
  4. Always include universal.md
  5. Insert items into task's "## 📋 Implementation Checklist" section
```

## Adding a new group

1. Edit `canonical-labels.yml` — add new entry under `security_groups:`:
   ```yaml
   <group_name>:
     aliases: [<alias1>, <alias2>, ...]
     checklist: security-checklists/<group_name>.md
     description: "..."
   ```
2. Create `security-checklists/<group_name>.md` following style of existing files:
   - Header explaining when applied
   - Sections grouped logically (e.g., "Anti-abuse", "Input validation")
   - Items as `- [ ] **Bold rule** — explanation` (max 1 line)
   - "B2G additions" subsection if applicable (universal-readiness)
3. Update this README's table

## B2G readiness philosophy

Even when not building B2G features today, items inherit B2G-aware best
practices:

- **`universal.md`** has audit trail, data sovereignty, DPIA awareness — these are good practice generally and prevent retrofit cost when going B2G
- **`auth.md`, `pii.md`** have B2G-specific subsections that activate only when `b2g` label is present, but the universal items are always strong enough
- **`accessibility.md`** is recommended for any user-facing surface, mandatory for B2G

This is intentional: build right from day 1, fewer items in B2G migration when it happens.

## Project-specific augments

Projects may have their own checklist file at:
```
<project>/.claude/knowledge/patterns/security/lh-checklist.md
```

This is loaded after universal+groups, gives project-specific items
(BUSINESS_RULES.yaml conventions, project-specific ADR references, etc.).

Format same as files here — pure markdown checklist with sections.
