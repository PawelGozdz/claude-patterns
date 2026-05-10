# Accessibility checklist — augment when task includes UI surface

> Appended to task when canonical-labels matches `accessibility` group
> (ui, frontend, a11y, wcag, public-ui, civic-ui). Inherits universal items.
>
> **Why universal not just B2G:** WCAG 2.1 AA compliance is genuinely good
> practice for any user-facing surface, plus mandatory for any future
> B2G workload. Building it in from day 1 prevents costly retrofit.

## WCAG 2.1 Level AA — minimum baseline

### Perceivable

- [ ] **Text alternatives** — all images, icons, emojis have `alt` text
  (decorative: `alt=""`)
- [ ] **Color contrast** — text/background ≥ 4.5:1 (large text 3:1).
  Run automated check (axe-core, Lighthouse)
- [ ] **No information by color alone** — error states have text
  label or icon, not just red border
- [ ] **Resizable text** — zoom to 200% does not break layout or
  hide content

### Operable

- [ ] **Keyboard accessible** — every interactive element reachable
  + operable with Tab/Enter/Space; no keyboard trap
- [ ] **Focus visible** — visible focus indicator (not removed via
  `outline: none` without replacement)
- [ ] **Skip-to-content link** — first focusable element on page
  routes past nav
- [ ] **Time limits adjustable** — sessions, modals with auto-close
  warn user + offer extension

### Understandable

- [ ] **Form labels associated** — `<label for>` or `aria-label`,
  not placeholder-only
- [ ] **Error messages clear** — describe error + how to fix it
  (not just "Invalid input")
- [ ] **Consistent navigation** — repeated components in same
  position/order across pages

### Robust

- [ ] **Valid HTML** — no nested interactive elements, no missing
  required attributes; passes basic validator
- [ ] **ARIA used correctly** — `role`, `aria-*` only when native
  HTML insufficient; not redundant or contradictory
- [ ] **Screen reader test** — manual test with NVDA / VoiceOver
  for primary flow

## Polish-language UI (B2G readiness)

- [ ] **Polish primary language** — `lang="pl"` on `<html>`; no
  English fallback for user-facing copy
- [ ] **Polish form labels** — "Hasło" not "Password"; "Imię" not
  "First name"
- [ ] **Polish error messages** — see auth.md (no English leakage)
- [ ] **Polish date/number formatting** — DD.MM.YYYY, comma decimal
  separator, ISO 4217 codes if currency varies

## B2G-specific (when labels include `b2g`)

- [ ] **WCAG 2.1 AA fully verified** — third-party audit or thorough
  internal sign-off; document in security pre-analysis
- [ ] **Tooltip behavior** — keyboard-accessible tooltips (Esc to
  close, no hover-only)
- [ ] **Reduced-motion respect** — `prefers-reduced-motion` media
  query disables animations
