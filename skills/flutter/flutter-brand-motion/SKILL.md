---
name: flutter-brand-motion
description: Brand-grounded Flutter animation/motion patterns for juz-ide — token-based durations/curves, "miękki kierunek" soft motion (no hard offset/shadow-collapse), elder-friendly timing multiplier, anti-dark-pattern rules for loading/urgency/attention-grabbing motion. Activates on animation-related Dart files.
origin: juz-ide-mobile-app + juz-ide-api-1/docs/brand/brand-principles.md
paths:
  - "**/*animat*.dart"
  - "**/*transition*.dart"
  - "lib/core/design/**/*.dart"
  - "**/*_animation.dart"
---

# Flutter Brand Motion

Animation patterns grounded in two source-of-truth brand documents — read them before
designing anything non-trivial, this skill only distills the motion-relevant subset:

- `/opt/projects/juz-ide-mobile-app/BRAND.md` — visual language, tone, "miękki kierunek" (soft
  direction) decision (2026-07-06)
- `/opt/projects/juz-ide-api-1/docs/brand/brand-principles.md` — persuasion constitution
  ("jak traktujemy w produkcie = jak mówimy w marketingu"), applies to motion too

## Brand thesis → what it means for motion

> "Aplikacja będzie przekonywać wizualnym pięknem, ale zatrzymywać funkcjonalnościami."

Animation is an acquisition/delight tool, never a retention crutch and never a manipulation
tool. If a motion effect exists only to create urgency, obscure a choice, or rush a decision,
it violates brand-principles.md §2 regardless of how polished it looks.

## 1. Use the existing motion tokens — never hardcode durations/curves

Source: `lib/core/design/tokens/local_hero_design_tokens.dart` (`LocalHeroDesignTokens`).

```dart
static const Duration animationFast   = Duration(milliseconds: 150);
static const Duration animationMedium = Duration(milliseconds: 250);
static const Duration animationSlow   = Duration(milliseconds: 350);
static const Curve animationCurve  = Curves.easeInOut;
static const Curve animationBounce = Curves.bounceOut;

// Elder-friendly mode — 1.25× multiplier, MUST be used when the elder-friendly
// context is active (see elderly_friendly_button.dart / accessibility settings):
static const Duration elderAnimationFast   = Duration(milliseconds: 188);
static const Duration elderAnimationMedium = Duration(milliseconds: 313);
static const Duration elderAnimationSlow   = Duration(milliseconds: 438);
```

Rule: pick the token that matches the interaction weight (fast = micro-feedback like a tap
color shift, medium = card/sheet transitions, slow = hero/page-level reveals) — don't invent
a new numeric duration unless the token set genuinely doesn't cover the case, and if so, add
it to `LocalHeroDesignTokens`, don't inline a magic number.

## 2. "Miękki kierunek" (soft direction, 2026-07-06) — the current default

**Deprecated** (do not copy, even though it still exists in un-migrated legacy files):
hard `boxShadow: offset(3,3) blurRadius:0` + thick border, and press feedback implemented as
translate + "shadow collapse" (`getBrutalistShadow()`).

**Current default**: `getSoftShadow()` / `getSoftBorder()` — rounded corners, thin/no border
at low alpha, optional very subtle blurred shadow (`blurRadius` 6–10, alpha 0.08–0.12). Press
feedback = **color shift** (`cream → latte`), not offset/translate — there is no hard shadow
left to "collapse" in the soft style, so don't reintroduce a translate animation to compensate.

```dart
// Press feedback — color tween, not transform:
AnimatedContainer(
  duration: LocalHeroDesignTokens.animationFast,
  curve: LocalHeroDesignTokens.animationCurve,
  color: isPressed ? LocalHeroDesignTokens.v1Latte : LocalHeroDesignTokens.v1Cream,
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(8),
    border: LocalHeroDesignTokens.getSoftBorder(),
    boxShadow: LocalHeroDesignTokens.getSoftShadow(),
  ),
  child: child,
)
```

Known **not-yet-migrated** components still using the old hard press-shadow-collapse style —
don't use them as a reference pattern, they're pending migration, not the target style:
`brutalist_toast.dart`, `success_animation.dart`, `coach_mark.dart`,
`hero_refresh_indicator.dart`, `app_feedback_sheet.dart`, `elderly_friendly_button.dart`,
`app_shell_top_bar.dart`.

## 3. Gradients in animation — same narrow exception as static UI

Zero gradients anywhere in motion design **except**: a two-tone gradient of the *same*
category accent color, `135deg`, used only as the "no photo" fallback background under an
icon/illustration. Do not animate a gradient sweep/shimmer across buttons, headers, or CTAs —
that exception is scoped to one static fallback case, not a motion effect.

## 4. Loading, hero moments, watermarks — established patterns

- **Loading**: shimmer (`LoadingState()`), not spinners-as-default, for content placeholders.
  Never fake progress (a progress bar that isn't tied to real completion is a dark pattern —
  brand-principles.md "Liczby-atrapy").
- **Hero moment**: detail screens anchor on photo/illustration/category-band — a fade/scale-in
  on first paint is fine (use `animationMedium`/`animationSlow`), but the hero must resolve
  to real content, never linger as a bare placeholder to manufacture anticipation.
- **Watermark**: background city illustration at 5% opacity — if animated in, fade only
  (`animationSlow`), never a distracting parallax/motion loop that competes with content.

## 5. Anti-dark-pattern checklist for any new motion effect

From `brand-principles.md` §2 and §6 — applies to motion exactly like it applies to copy:

- [ ] Does this animation create **false urgency** (pulsing countdown, shaking CTA) without a
      real, factual basis (real limit/counter)? → forbidden regardless of polish.
- [ ] Does it **rush a decision** — designed to get a tap in under ~2s before the user reads
      the choice? → forbidden ("manipulacyjne wyłączanie namysłu").
- [ ] Does it imply a **fake result/guarantee** via visual certainty (e.g. a checkmark-morph
      before the async operation actually confirmed success)? → forbidden.
- [ ] Would a journalist writing about the app's trust system call this motion manipulative?
      If yes, don't ship it as-is (test dziennikarza).
- [ ] Loss-framing motion (e.g. an animated "you're missing out" banner) is allowed **only**
      in external ads, never in onboarding/push/in-app surfaces.

## 6. Accessibility — non-negotiable, not a trade-off against "beautiful"

- Respect `MediaQuery.of(context).disableAnimations` — provide a reduced/no-motion path for
  every non-essential animation (decorative fades, watermark reveals, hover/press flourishes).
  Functional feedback (e.g. "saved" confirmation) must still be perceivable without motion —
  pair it with a text/icon state change, not motion alone.
- Elder-friendly mode uses the `elderAnimation*` tokens (1.25× duration) — wire it through
  wherever the elder-accessibility flag is read, don't hardcode a separate elder duration.
- WCAG AA contrast must hold at every frame of a color-tween animation, not just start/end
  state — check the mid-transition color against its background, not only the two endpoints.

## 7. New animated component → still goes through the 6 gates

Per BRAND.md "Component Creation Framework": domain rule (pure UI, zero infra imports), token
compliance (durations/curves/colors from `LocalHeroDesignTokens`, zero hardcoded values),
WCAG AA, widget test, golden test (covers a representative animation frame, not just static),
component story (markdown, 4+ visual examples). An animated component is not exempt from any
of these because "it's just motion."
