---
name: flutter-signature-animations
description: Rich, choreographed Flutter animations for juz-ide — screen-welcome/what's-new reveals (ScreenInfo ℹ︎ icon, CoachMark tutorials), main-view screen transitions, map camera motion, staggered tile/list reveals — with an explicit performance budget so "beautiful" never means janky. Companion to flutter-brand-motion (tokens/anti-dark-pattern rules) — read that one first for the constraints this one builds on.
origin: juz-ide-mobile-app (screen_info.dart "Future hook: animatedTutorial", coach_mark.dart)
paths:
  - "**/screen_info.dart"
  - "**/coach_mark*.dart"
  - "**/app_shell_top_bar.dart"
  - "**/*_page_route*.dart"
  - "**/neighborhood_map.dart"
  - "**/*_grid*.dart"
  - "**/*_tile*.dart"
---

# Flutter Signature Animations

This skill is about **creating** choreographed motion — onboarding/welcome reveals,
screen-to-screen transitions, map motion, staggered tiles. For tokens, the soft-direction
style rules, and the anti-dark-pattern checklist all of this must obey, see
[[flutter-brand-motion]] first — this skill assumes those constraints, doesn't repeat them.

## 1. Per-screen "welcome / what's new" (the ℹ︎ icon)

Already scaffolded — don't build a parallel mechanism:

- `lib/core/navigation/screen_info.dart` — registry of `ScreenInfo(title, icon, description,
  howTo: [...])` per route, read by `AppShellTopBar`'s ℹ︎ icon. The file's own comment marks
  the extension point: **"Future hook: each ScreenInfo will gain an `animatedTutorial` field
  (e.g. a Lottie asset or a series of overlay coachmarks)."** Implement the welcome/tutorial
  animation by filling that hook, not by inventing a new per-screen system.
- `lib/core/ui/components/coach_mark.dart` — `CoachMark.show(context, targetKey, message,
  pulse: true, autoDismissDuration: Duration(seconds: 5))` already does spotlight-highlight +
  pulse + directional arrow + haptic + dismiss. It's flagged in BRAND.md as **not yet migrated**
  to the soft-direction style (still "Neo-brutalist design" per its own doc comment) — when you
  touch it, migrate the shell to `getSoftShadow()`/`getSoftBorder()` (see flutter-brand-motion
  §2) as part of the change, don't just add features on top of the old shell.

**Choreography for a screen-welcome sequence** (first visit to a tab, or "what's new" trigger):
1. Content underneath loads/settles first — never animate a tutorial overlay on top of a
   loading skeleton, the two motions compete and read as jank even at 60fps.
2. One entrance per element, staggered by ~60-100ms, not simultaneous — title fades+slides in,
   then `howTo` steps reveal one at a time (list, not all-at-once), matching how a human would
   narrate it.
3. Respect first-time-only: persist a "seen" flag (mirrors `_markTipSeen()` pattern already in
   `CoachMark`'s doc example) — a welcome animation that replays every visit stops being
   delightful and starts being an obstacle. This is also a brand-principles.md concern: a
   forced replay you can't skip reads as attention-manipulation, not delight.
4. Always skippable in one tap — never block interaction until an animation finishes.

## 2. Screen transitions (main tab-to-tab / push navigation)

- Prefer Flutter's built-in shared-element `Hero` widget for the one element that should
  visually "carry" between two screens (a tile's thumbnail → detail hero image is the natural
  candidate here, matching the "hero moment" rule already established for detail screens).
  Don't Hero-wrap more than one element per transition — competing Heroes are the single most
  common cause of janky/broken shared-element transitions in Flutter.
- For custom push/pop motion beyond the platform default, use `PageRouteBuilder` with a
  `transitionsBuilder` driven by `LocalHeroDesignTokens.animationMedium` +
  `LocalHeroDesignTokens.animationCurve` — keep it consistent with the rest of the app's motion
  language rather than a bespoke curve per route.
- Bottom-nav tab switches: prefer a **fade+slight-slide crossfade** (cheap: opacity + a few px
  of translation) over a full page transition — tab switches happen far more often than pushes,
  so their per-switch cost matters more; keep them in the `animationFast` tier.

## 3. Map animations (`neighborhood_map.dart`)

- Camera moves (pan/zoom to a selected pin, cluster expand) should use the map SDK's own
  animated-camera API (e.g. `animateCamera`/equivalent), not a manual `Timer`-driven redraw —
  the SDK's animation runs on its own render path and won't compete with Flutter's frame budget
  the way a manual tween would.
- Marker/pin **appearance** (new results loading in) — stagger a soft scale-in
  (`animationFast`, `Curves.easeOut`), capped at a handful of simultaneously-animating markers;
  beyond ~15-20 visible markers, batch the rest in without individual animation or the frame
  cost stacks linearly with pin count.
- Never animate the base map tiles/terrain itself — motion budget goes to markers/camera only,
  the map surface should feel stable under the animated elements.

## 4. Staggered list/grid tile reveals

No stagger-animation package is currently a dependency — before adding one (e.g.
`flutter_staggered_animations`), check the actual need: a single shared `AnimationController`
+ per-item `Interval` inside a `Tween` is usually enough and avoids an extra dependency plus
avoids the biggest performance trap below.

```dart
// One controller for the whole list, per-item Interval — NOT one controller per tile:
final controller = AnimationController(
  duration: LocalHeroDesignTokens.animationSlow,
  vsync: this,
);

Animation<double> itemAnimation(int index, int itemCount) {
  final start = (index / itemCount) * 0.5; // stagger window, not full duration per item
  return CurvedAnimation(
    parent: controller,
    curve: Interval(start, start + 0.5, curve: LocalHeroDesignTokens.animationCurve),
  );
}
```

- **Never** allocate one `AnimationController` per visible list/grid item — each controller
  subscribes its own `Ticker`; a 30-tile grid with 30 controllers is 30 vsync callbacks/frame
  for something a single controller + `Interval` handles in one.
- Only animate the **first paint** of a list (initial load / pull-to-refresh), never
  re-trigger the stagger on every rebuild — gate it behind a "already animated" flag per list
  instance, otherwise scrolling back to a cached list replays the whole reveal and reads as a
  bug, not a feature.
- Wrap the animated list region in a `RepaintBoundary` so the staggered tiles don't force a
  repaint of the app shell (topbar, bottom nav) on every animation tick.

## 5. Performance budget — the actual constraint, not a suggestion

The user-facing brief for this skill is explicit: beautiful, but never at the cost of
performance. Concrete rules, not vibes:

- **Frame budget**: 16ms/frame (60fps) is the ceiling on the *lowest* target device class this
  app supports, not on a dev's high-end phone/simulator. If you can't verify on real mid-tier
  Android hardware, at minimum check the DevTools performance overlay (`flutter run
  --profile`) before calling an animation done.
- **Animate compositor-only properties** (`Opacity`, `Transform`, color tweens) wherever
  possible — these don't trigger layout/paint. Avoid animating properties that change layout
  (padding, size, constraints) inside a hot loop like a list scroll or a per-frame rebuild.
- **One controller per independent motion**, not one per widget instance in a repeated list
  (§4). Ticker count scales with controller count, not with visual complexity.
- **`RepaintBoundary`** around any subtree that animates independently of its siblings (a
  pulsing badge, a coach mark, a staggered grid) — without it, Flutter may repaint far more of
  the tree than the animation actually changed.
- **Respect `MediaQuery.of(context).disableAnimations`** — when true, skip the *entire*
  choreography (jump to end state), don't just shorten durations. This is both an
  accessibility requirement (flutter-brand-motion §6) and a performance one (low-end/low-power
  devices are exactly the users most likely to have this set).
- **Budget simultaneity, not just individual animations**: a screen with a coach mark pulsing,
  a staggered grid revealing, and a map camera animating all at once is three animations
  competing for the same frame budget. Sequence them (map settles → grid reveals → coach mark
  appears) rather than layering all three on entry.
- **Golden/widget tests still apply** (flutter-brand-motion §7's 6-gate framework) — for a
  choreographed animation, add an explicit acceptance check that a representative mid-animation
  frame renders without dropped-frame warnings in `flutter test`, not just start/end states.

## 6. When NOT to animate

Per BRAND.md's own thesis — motion serves acquisition/delight, not every interaction needs it.
Skip animation (or keep it to the cheapest `animationFast` tier) for: high-frequency actions
(scrolling, typing, list filtering), anything in a loop a power-user repeats dozens of times a
session, and any state change where the animation's duration would measurably slow down task
completion for someone who already knows the app.
