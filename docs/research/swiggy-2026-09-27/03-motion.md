# Motion study — Swiggy + District vs One Local

Scope: scroll-linked chrome, micro-interactions, carousels, popovers, rotating placeholder, loading skeletons, haptics.
Stack: Expo 57, React Native 0.86, react-native-reanimated 4.5.1 + react-native-worklets 0.10.1, expo-haptics, react-native-web 0.21.
All paths below are relative to `frontend/`. No repo file was edited.

## 0. Headline findings

1. **Our scroll chrome runs on the JavaScript thread.** `src/motion.tsx:31` sets an old-style `Animated.Value` from `onScroll` with `y.setValue(...)`, and `src/components/app-shell.tsx:72,81-84` interpolate that value. Because the value is pushed from JS every frame, the native driver cannot help: the header, scrim and compact pill will stutter whenever the JS thread is busy (image decode, React Query updates, cart re-renders). `app-shell.tsx:55` also adds a JS listener that calls `setState` on every scroll frame. `app/category/[id].tsx:48` does the same with `useNativeDriver: false`. This is the single most important fix, and it unlocks every scroll behaviour Swiggy and District have.
2. **The header only scrolls away; it never comes back on scroll-up.** `app-shell.tsx:72` maps scroll 1:1 to `translateY` (clamped), so the big header returns only at the top. Swiggy and District both reveal chrome on the first upward flick.
3. **The tab bar never hides.** `src/components/bottom-navigation.tsx:23` is a static `View`. Swiggy hides it while scrolling and shows a small "Search" pill; District shrinks it to icons.
4. **Reanimated 4 is installed but barely used.** Only the intro, the order tracker and two celebration components use it (`intro-splash.tsx` is the good reference: all UI thread, reduced-motion path at lines 42-45). Everything else uses the legacy `Animated` API, and `src/motion-tokens.ts:24-29` only defines legacy `friction/tension` springs. `src/animations/entrance.ts` is not imported anywhere and has no reduced-motion handling — treat it as dead code.
5. **The micro-interactions exist but snap.** ADD swaps instantly to a stepper (`product-card.tsx:24`, `subcategory-product.tsx:36`) while the whole card bounces on every quantity change (`product-card.tsx:18`), which is the wrong thing to move. Hearts toggle with no feedback (`product-card.tsx:22`, `subcategory-product.tsx:34`). The free-delivery progress bar jumps (`floating-cart.tsx:31`).

Reduced motion is already respected everywhere via `useMotionAllowed()` (`src/motion.tsx:6-17`, which also pauses motion when the app is in the background). Keep using it; it starts `false`, so first paint is always still, which is correct.

---

## 1. Inventory

| # | Motion | Swiggy / District | Ours (file:line) | Verdict |
|---|---|---|---|---|
| 1 | Header collapse on scroll | Swiggy: navy header collapses, search + chips go sticky. District: header hides on scroll down, returns on scroll up | `app-shell.tsx:72` translateY = -scroll (clamped); JS-driven via `motion.tsx:31` | **Improve** — move to UI thread, add reveal-on-scroll-up |
| 2 | Compact search pill | Swiggy: sticky search bar on white | `app-shell.tsx:82-92` fades/scales in; pointer events toggled by a per-frame JS listener at `:55` | **Keep look, improve plumbing** (UI thread, state flips only on threshold) |
| 3 | Top scrim behind status bar | Both have a solid sticky backdrop | `app-shell.tsx:81` | Keep (move to shared value) |
| 4 | Bottom tab bar hide on scroll | Swiggy hides it + floating "Search" pill. District capsule shrinks to icons | `bottom-navigation.tsx:23` static | **Add** |
| 5 | Floating cart follows tab bar | Swiggy cart bar sits on the bottom edge when tabs hide | `floating-cart.tsx:30` fixed `bottom` from `app-shell.tsx:94` (`insets + 84`) | **Add** — must move down with the tab bar or a gap opens |
| 6 | Sticky chip / filter row | Swiggy: "What's on your mind" row then Filter / Sort chips stick. District: sticky filter chips | None on department pages; category page has a sidebar only | **Add** |
| 7 | ADD → stepper morph | Swiggy: ADD pill morphs to − 1 + in place, number rolls | Instant swap `product-card.tsx:24`, `subcategory-product.tsx:36`; whole-card bounce `product-card.tsx:18` | **Improve** (morph the button, drop the card bounce) |
| 8 | Heart / save | Swiggy: pop with fill | `product-card.tsx:22`, `subcategory-product.tsx:34` — colour swap only, no haptic | **Add** |
| 9 | Fly-to-cart + cart bump | Not in Swiggy notes (they only update the bar) | `floating-cart.tsx:17-23,29` (arc flight, bump) | **Keep** (port to Reanimated later) |
| 10 | Cart bar entrance | Swiggy slides up | `floating-cart.tsx:17,30` spring from 110 px | Keep |
| 11 | Savings counter / free-delivery progress | Swiggy: saved-amount strip in cart | Static text + width jump `floating-cart.tsx:31` | **Improve** (count-up + scaleX bar) |
| 12 | "✓ Applied" coupon state | Swiggy: green tick states | State change + success haptic `app/(tabs)/cart.tsx:62-70`, no visual transition | **Improve** (tick draw-in + label crossfade) |
| 13 | Offer strip pager "1/5" auto-advance | Swiggy restaurant page | `home-promos.tsx:24-30` manual snap, dots, no auto-advance, no counter | **Add** auto-advance + counter/progress |
| 14 | Campaign headline alternation | Swiggy "WEEKEND BINGE" ↔ "70% OFF" | None | Add later (reuse #15 roller) |
| 15 | Rotating search placeholder | Swiggy vertical roll; District too | Static text `app-shell.tsx:78` and `:89` | **Add** |
| 16 | Popover with dim (ITEMS menu) | Swiggy: scales in from anchor, background dims | No menu popover; bottom sheets via `Modal` in `subcategory-options.tsx`, `checkout-payment.tsx` | **Add** a reusable anchored popover |
| 17 | Loading skeletons | Swiggy shimmer placeholders | Spinner / Lottie in `catalog-sections.tsx:46` (`LoadState`), used by `department-screen.tsx:15`, `discover.tsx:22` | **Add** |
| 18 | Press feedback | Both: subtle scale | `tap.tsx:17-26` scale 0.96 + lime ring + selection haptic | **Keep** (good, web-safe) |
| 19 | Full-screen service switcher (tap active tab) | District | Centre One button pulse `one-button.tsx:14-16` | Out of scope for top 8; spec in §3 |
| 20 | Autoplay muted trailer cards | District | Reels screen only (`app/(tabs)/reels.tsx`) | Later (needs video budget) |
| 21 | Coach marks | District | None | Later; spec in §3 |
| 22 | Intro splash | — | `intro-splash.tsx` all UI thread, reduced-motion path | **Keep** — the house reference |
| 23 | Mascot celebration | — | `cart-celebration.tsx:18-28` once per session | Keep |
| 24 | Haptics | Swiggy: light tick on add, success on apply | Selection on every `Tap` (`tap.tsx:20`); success/warning in cart (`cart.tsx:66,70,91`); none on stepper or heart (plain `Pressable`) | **Improve** with a haptics map (§2 end) |

---

## 2. Top 8 motions to build

### Shared groundwork (do first, ~half a day)

- **Reanimated spring tokens** next to the legacy ones in `src/motion-tokens.ts`:
  - `press`  : damping 22, stiffness 420, mass 1 (no wobble)
  - `snappy` : damping 24, stiffness 260, mass 1 (chrome, pills, sheets)
  - `pop`    : damping 12, stiffness 320, mass 0.8 (heart, tick, one overshoot)
  - `gentle` : damping 28, stiffness 160, mass 1 (large surfaces)
  - All with `reduceMotion: ReduceMotion.System` so Reanimated jumps to the end state when the OS setting is on.
- **`useMotionShared()`**: mirror `useMotionAllowed()` into a shared value (`motionOn.value = allowed ? 1 : 0`) so worklets can read it without a React render.
- **Scroll core on the UI thread**: `CityMotionProvider` holds `scrollY`, `chrome` (0 = shown, 1 = hidden) and `lastY` as shared values; `CityScroll` becomes `Animated.ScrollView` with `useAnimatedScrollHandler`. Keep the per-screen offset restore from `motion.tsx:30` (write `scrollY.value = offset` on focus).
- Reanimated 4 note: use `scheduleOnRN` from `react-native-worklets` (the replacement for `runOnJS`) whenever a worklet has to flip React state, and only on threshold crossings, never per frame.

### 1. Direction-aware chrome (header + tab bar + floating cart, one driver)

- **Trigger:** scroll on any `CityScroll` page.
- **Behaviour:** scroll down more than 8 px past the header → chrome hides; any upward scroll of more than 6 px, reaching the top, or reaching the end → chrome shows. On finger lift mid-way, snap to the nearer state.
- **Properties:** header `translateY` (0 → −headerHeight + compact height), tab bar `translateY` (0 → barHeight + bottom inset + 8), floating cart `translateY` follows the tab bar exactly (so no gap), compact pill stays pinned.
- **Timing:** while dragging, `chrome` tracks the finger (diff-clamp, no easing). On release / direction flip: `withTiming(target, { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) })`.
- **Thread:** UI thread only. No React state per frame.
- **Reduced motion:** chrome never hides (tab bar and cart stay put); the header still scrolls away 1:1 as today, with the compact pill appearing via an opacity crossfade of 120 ms (no translate/scale).
- **Accessibility:** if a screen reader is on (`AccessibilityInfo.isScreenReaderEnabled`), never hide the tab bar.

```tsx
const onScroll = useAnimatedScrollHandler({
  onScroll: (e) => {
    const y = Math.max(0, e.contentOffset.y);
    const dy = y - lastY.value; lastY.value = y; scrollY.value = y;
    if (!motionOn.value || y < headerHeight.value) { chrome.value = 0; return; }
    const atEnd = y + e.layoutMeasurement.height >= e.contentSize.height - 24;
    chrome.value = atEnd ? 0 : clamp(chrome.value + dy / HIDE_DISTANCE, 0, 1); // diff-clamp
  },
  onEndDrag: () => { chrome.value = withTiming(chrome.value > 0.5 ? 1 : 0, CHROME_T); },
  onMomentumEnd: () => { chrome.value = withTiming(chrome.value > 0.5 ? 1 : 0, CHROME_T); },
});
const tabBarStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: chrome.value * (barH + insets.bottom + 8) }],
}));
// FloatingCart uses the same expression so it slides down with the bar.
useAnimatedReaction(() => scrollY.value > compactFrom.value, (now, prev) => {
  if (now !== prev) scheduleOnRN(setCompact, now); // replaces the per-frame listener at app-shell.tsx:55
});
```

District variant to consider later: instead of hiding the bar, shrink it to icons (labels `opacity` 1 → 0 and bar height 62 → 48, same `chrome` value). Pick one; Swiggy's hide is simpler and gives more screen.

### 2. Sticky chip / filter row under the compact pill

- **Trigger:** the chip row's top edge reaches the bottom of the compact pill.
- **Property:** `translateY = max(0, scrollY − (chipTop − pinnedTop))` on the chip row; a 1 px hairline + shadow fades in (opacity 0 → 1 over the first 12 px of being stuck). When chrome (§1) is shown/hidden the pinned top moves with it.
- **Timing:** scroll-linked, no duration. Shadow fade is interpolated, not timed.
- **Thread:** UI thread. Measure `chipTop` once with `onLayout` into a shared value.
- **Why not `stickyHeaderIndices`:** our header is an absolute overlay with a padded content inset (`motion.tsx:31`), so native sticky headers would stick at y = 0 underneath the compact pill.
- **Reduced motion:** identical (it is position, not animation). Only the shadow appears instantly.

```tsx
const stickStyle = useAnimatedStyle(() => {
  const pinnedTop = insets.top + 6 + 52 + 8; // bottom edge of the compact pill (it stays pinned)
  const stuck = Math.max(0, scrollY.value + pinnedTop - chipTop.value);
  return { transform: [{ translateY: stuck }], zIndex: 22 };
});
const shadowStyle = useAnimatedStyle(() => ({
  opacity: interpolate(scrollY.value + pinnedTop - chipTop.value, [0, 12], [0, 1], Extrapolation.CLAMP),
}));
```

### 3. ADD → stepper morph with rolling quantity

- **Trigger:** ADD tap (0 → 1), +/− taps, and 1 → 0.
- **Layout rule:** ADD pill and stepper share one fixed-size container (e.g. 84 × 34), so nothing around them reflows.
- **0 → 1:** "ADD" label `opacity` 1 → 0 and `scale` 1 → 0.8 over 120 ms (`easing.exit`); then − and + icons slide in from the centre (`translateX` ∓10 → 0) and fade in, spring `snappy`; background colour tints from `palette.fade` to a stronger fill over 160 ms. Pill itself does one `scale` 1 → 1.06 → 1 with spring `pop`.
- **+ / −:** digit rolls: outgoing number `translateY` 0 → −12 (on +) or +12 (on −) and fades out; incoming comes from the opposite side, 180 ms, `easing.standard`.
- **1 → 0:** reverse of 0 → 1, 140 ms.
- **Remove** the whole-card bounce at `product-card.tsx:18` (it fires on every quantity change and moves the image, which reads as jitter in a grid).
- **Thread:** UI thread (shared values / layout animations). The cart update itself stays on JS.
- **Haptics:** `impactAsync(Light)` on ADD, `selectionAsync()` on +/−, nothing on the last removal.
- **Reduced motion:** instant swap, digits change without roll, haptics kept.
- **Apply to both** `product-card.tsx:24` and `subcategory-product.tsx:36`; extract one `<AddStepper />`.

```tsx
const Roll = FadeIn.duration(180); // Reanimated layout animation
function Qty({ n, dir }: { n: number; dir: 1 | -1 }) {
  const enter = motion ? new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 12 * dir }] }, 100: { opacity: 1, transform: [{ translateY: 0 }] } }).duration(180) : undefined;
  const exit  = motion ? new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }] }, 100: { opacity: 0, transform: [{ translateY: -12 * dir }] } }).duration(180) : undefined;
  return <Animated.Text key={n} entering={enter} exiting={exit} style={s.qty}>{n}</Animated.Text>;
}
const pill = useSharedValue(qty ? 1 : 0);
useEffect(() => { pill.value = motion ? withSpring(qty ? 1 : 0, SPRING.snappy) : (qty ? 1 : 0); }, [qty > 0]);
const addLabel = useAnimatedStyle(() => ({ opacity: 1 - pill.value, transform: [{ scale: 1 - 0.2 * pill.value }] }));
const minus    = useAnimatedStyle(() => ({ opacity: pill.value, transform: [{ translateX: -10 * (1 - pill.value) }] }));
const plus     = useAnimatedStyle(() => ({ opacity: pill.value, transform: [{ translateX:  10 * (1 - pill.value) }] }));
```

Web note: `tap.tsx:4-5` records that animated Pressables drop styles on react-native-web. Put the animated styles on an inner `Animated.View`, keep the `Pressable` plain.

### 4. Loading skeletons with one shared shimmer

- **Trigger:** any catalog query without data (replaces the spinner in `catalog-sections.tsx:46` for loading; keep the error state).
- **Shape:** skeletons match the real layout (department strip circles, promo card, product card 140 wide) so nothing jumps when data lands.
- **Property:** a soft highlight band `translateX` from −width to +width across each block (a `LinearGradient` inside an `overflow: hidden` block).
- **Timing:** 1200 ms per sweep, `Easing.inOut(Easing.ease)`, 300 ms rest, `withRepeat(-1)`. Content arrival: skeleton `opacity` 1 → 0 over 160 ms while content fades in 0 → 1 (no stagger beyond 5 items, 40 ms each).
- **Thread:** UI thread. **One** shared value for the whole screen, provided via context, so 20 skeleton blocks do not start 20 animation loops.
- **Reduced motion:** static grey blocks at 0.6 opacity, no sweep; content appears instantly.
- Stop the loop when the screen blurs (`useIsFocused`) and when the app is backgrounded (already handled by `useMotionAllowed`).

```tsx
const t = useSharedValue(0);
useEffect(() => {
  if (!motion) { cancelAnimation(t); t.value = 0; return; }
  t.value = withRepeat(withSequence(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), withDelay(300, withTiming(1, { duration: 0 })), withTiming(0, { duration: 0 })), -1);
  return () => cancelAnimation(t);
}, [motion]);
const band = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(t.value, [0, 1], [-w, w]) }] }));
```

### 5. Rotating search placeholder

- **Trigger:** the search bar is visible, the screen is focused and the app is active. Pause while the compact pill is showing (or rotate the compact pill instead — never both).
- **Content:** 4–6 phrases per department ("Search for 'paneer'", "Search for 'biryani'", "Search for 'shampoo'"…). Keep the fixed prefix "Search for" still and roll only the quoted word, as Swiggy does.
- **Property:** all phrases stacked in a clipped column of line-height `h`; the column's `translateY` steps −h per phrase. A duplicate of the first phrase at the end lets the loop reset invisibly.
- **Timing:** hold 2600 ms, roll 320 ms with `Easing.bezier(0.2, 0, 0, 1)`.
- **Thread:** UI thread (one `withRepeat(withSequence(...))`), no React state per step.
- **Reduced motion:** show one static phrase (the first), no roll.
- **Accessibility:** the button's `accessibilityLabel` stays "Search products"; mark the roller `importantForAccessibility="no-hide-descendants"` so screen readers do not read every phrase.
- Targets: `app-shell.tsx:78` (big header) and `:89` (compact pill).

```tsx
const step = useSharedValue(0);
useEffect(() => {
  if (!motion || !active) { cancelAnimation(step); step.value = 0; return; }
  const one = (i: number) => withDelay(2600, withTiming(i, { duration: 320, easing: easing.standard }));
  step.value = withRepeat(withSequence(...phrases.map((_, i) => one(i + 1)), withTiming(0, { duration: 0 })), -1);
  return () => cancelAnimation(step);
}, [motion, active, phrases.length]);
const col = useAnimatedStyle(() => ({ transform: [{ translateY: -step.value * LINE_H }] }));
```

### 6. Offer strip / promo pager with auto-advance and "1/5"

- **Trigger:** pager on screen, focused, no finger down, motion allowed.
- **Behaviour:** advance every 4000 ms; after the last card, glide back to the first (or use a cloned first card for an endless loop). Any touch pauses auto-advance for 6000 ms after release. Show a small "1/5" counter pill (Swiggy) and turn the active dot into a 20 px bar that fills over the 4 s (gives the user a sense of time).
- **Properties:** scroll offset (`scrollTo` via `useAnimatedRef` + `scrollTo` worklet), active-dot `width` 6 → 20 and fill `scaleX` 0 → 1.
- **Timing:** page glide 450 ms `Easing.bezier(0.2, 0, 0, 1)`; dot width spring `snappy`; fill is linear over the 4000 ms dwell.
- **Thread:** UI thread for the fill and dot; the timer can live on the UI thread with `withDelay` on the fill (on completion, `scrollTo` the next page).
- **Reduced motion:** no auto-advance at all (moving content that starts on its own needs a pause control under WCAG 2.2.2); manual swipe and dots still work; counter still updates.
- **Pause** when the pager scrolls out of view (use the page's `scrollY` from §1 against the pager's measured top) and when a screen reader is on.
- Target: `home-promos.tsx:24-30` today; the same component for store/restaurant offer strips (`app/store/[id].tsx:113`).

```tsx
const fill = useSharedValue(0);
const next = () => { 'worklet'; const i = (page.value + 1) % count; scrollTo(ref, i * pageW, 0, true); page.value = i; start(); };
const start = () => { 'worklet'; fill.value = 0; fill.value = withTiming(1, { duration: 4000, easing: Easing.linear }, (done) => { if (done && !held.value && visible.value) next(); }); };
// onBeginDrag: held.value = 1; cancelAnimation(fill);  onMomentumEnd: held.value = 0; page.value = round(x / pageW); after 6 s: start()
const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }], transformOrigin: 'left' }));
```

### 7. Cart savings counter, free-delivery bar and "✓ Applied"

- **Savings / total counter:** when "Saving ₹X" or the total changes, count from the old value to the new value over 450 ms, `Easing.out(Easing.cubic)`. Use an animated `TextInput` (`editable={false}`, `animatedProps` `text`) so it runs on the UI thread and does not re-render the cart. On an increase in savings, a brief tint pulse on the strip (background opacity 0 → 0.18 → 0 over 600 ms). Target `floating-cart.tsx:31` and the bill rows in `app/(tabs)/cart.tsx`.
- **Free-delivery bar:** replace the `width` percentage jump at `floating-cart.tsx:31` with `transform: scaleX` (`transformOrigin: 'left'`), spring `gentle`. When it crosses 100 %: bar flashes lime, icon swaps from bicycle to tick with spring `pop` scale 0.6 → 1, and `notificationAsync(Success)` fires once.
- **"✓ Applied":** button label crossfades "Apply" → "Applied" (120 ms each way); the tick scales 0 → 1 with spring `pop` and a 40 ms delay after the label; the coupon row border tints green over 200 ms. The success/warning haptics already exist (`cart.tsx:66,70`); keep them.
- **Thread:** UI thread for all three.
- **Reduced motion:** numbers change instantly, bar jumps to its value, tick appears without scale. Haptics kept.

```tsx
const AnimatedText = Animated.createAnimatedComponent(TextInput);
const v = useSharedValue(saving);
useEffect(() => { v.value = motion ? withTiming(saving, { duration: 450, easing: Easing.out(Easing.cubic) }) : saving; }, [saving]);
const props = useAnimatedProps(() => ({ text: `Saving ₹${Math.round(v.value)}`, defaultValue: '' } as any));
<AnimatedText editable={false} animatedProps={props} style={s.savingsText} accessibilityLabel={`Saving ₹${saving}`} />
```

### 8. Anchored popover with dim (ITEMS menu, Sort, "more" menus)

- **Trigger:** tap on a menu button (Swiggy's floating ITEMS / category jump menu; our category page and store menus need the same).
- **Open:** backdrop `opacity` 0 → 0.4 over 180 ms (`easing.enter`); panel `scale` 0.86 → 1 and `opacity` 0 → 1 with `transformOrigin` set to the anchor corner (e.g. bottom-right for a floating button), spring damping 22, stiffness 320, mass 0.9. Menu rows stagger in 20 ms each, max 6.
- **Close:** panel `scale` 1 → 0.94 and `opacity` → 0 in 140 ms (`easing.exit`), backdrop out in 160 ms; unmount on completion. Tapping a row closes and scrolls the list to that section (`scrollTo` 400 ms).
- **Thread:** UI thread; render in a portal-style absolute layer inside `AppShell`, not a native `Modal` (faster to open, and we control the origin).
- **Haptics:** `selectionAsync()` on open.
- **Reduced motion:** fade only, 120 ms, no scale.
- **Accessibility:** focus moves into the menu (`accessibilityViewIsModal` on iOS), back/escape closes, backdrop is a button labelled "Close menu".

```tsx
const open = useSharedValue(0);
useEffect(() => { open.value = visible ? (motion ? withSpring(1, { damping: 22, stiffness: 320, mass: 0.9 }) : withTiming(1, { duration: 120 }))
                                       : withTiming(0, { duration: 140, easing: easing.exit }, (f) => { if (f) scheduleOnRN(onClosed); }); }, [visible]);
const dim = useAnimatedStyle(() => ({ opacity: open.value * 0.4 }));
const panel = useAnimatedStyle(() => ({ opacity: Math.min(1, open.value * 1.4),
  transform: [{ scale: motion ? interpolate(open.value, [0, 1], [0.86, 1]) : 1 }], transformOrigin: 'bottom right' }));
```

### Smaller specs (after the top 8)

- **Heart / save:** on save, icon `scale` 1 → 1.28 → 1 (spring `pop`), fill colour crossfade 120 ms, `impactAsync(Light)`; on unsave, scale 1 → 0.9 → 1 and no haptic. Optimistic toggle before the network call. Reduced motion: colour only. Targets `product-card.tsx:22`, `subcategory-product.tsx:34`.
- **Tab change:** active dot slides between tabs (`translateX`, spring `snappy`) instead of mounting per tab (`bottom-navigation.tsx:25`); add `selectionAsync()` (tabs are plain `Pressable`s today, so no haptic).
- **Service switcher (District):** tapping the already-active tab opens a full-screen department grid: backdrop 0 → 1 over 220 ms, tiles rise 16 px and fade in with 30 ms stagger. Reduced motion: fade 150 ms.
- **Coach marks (District):** one-time spotlight around the One button / compact search: cutout scales from 1.2 → 1 over 300 ms, then a gentle 1.0 ↔ 1.04 pulse (1200 ms loop, stops after 3 cycles). Reduced motion: static ring.
- **Headline alternation:** reuse the placeholder roller (§5) with a 3500 ms hold.
- **Port** `floating-cart.tsx`, `cart-celebration.tsx`, `department-strip.tsx`, `one-button.tsx` to Reanimated when touched; their timings are fine.
- **Delete or rewrite** `src/animations/entrance.ts` (unused; `BounceIn` on chips and 80 ms-per-item `SlideInRight` would feel slow and busy in a long grid).

### Haptics map (one helper, e.g. `haptic.add()`, all skipped on web)

| Moment | Call |
|---|---|
| Any `Tap` press | `selectionAsync` (as today, `tap.tsx:20`) |
| ADD (0 → 1) | `impactAsync(Light)` |
| Stepper +/− | `selectionAsync` |
| Heart save | `impactAsync(Light)` |
| Tab switch, popover open, pager manual swipe settle | `selectionAsync` |
| Coupon applied, free delivery unlocked, order placed | `notificationAsync(Success)` |
| Coupon rejected, out of stock on add | `notificationAsync(Warning)` |
| Never | on scroll, on auto-advance, on skeleton → content |

Haptics are not motion, so they stay on under Reduce Motion; add an in-app "Vibration" toggle later if users ask.

---

## 3. Performance notes

**Must stay on the UI thread (worklets / shared values):**
- Everything driven by scroll: header offset, compact pill, scrim, tab bar and floating cart hide/show, sticky chips, pager visibility. Use one `useAnimatedScrollHandler` per scroll view and derive the rest with `useDerivedValue`. Never `setState` in `onScroll`; cross to React only on threshold changes via `useAnimatedReaction` + `scheduleOnRN`.
- Looping animations: shimmer, placeholder roll, pager fill. One shared clock per screen, cancelled on blur and background.
- Counters: animated `TextInput` props, not React state per frame.

**Can stay on JS:** one-shot, non-scroll-coupled mounts (mascot, order success Lottie), navigation.

**Lists and virtualisation:**
- Department and home pages are one long `ScrollView` (`motion.tsx:31`) that renders every rail and every product card up front. Fine for today's catalogue size, but a grocery aisle with 200+ items will mount 200 cards with their own animations. Move long product grids to `FlatList` (or FlashList if added) with `Animated.FlatList` + the same scroll handler; set `windowSize` ~7, `initialNumToRender` 8, `maxToRenderPerBatch` 8, `removeClippedSubviews` on Android, and `getItemLayout` where cards have fixed height.
- `app/category/[id].tsx:48` uses a plain `ScrollView` with `useNativeDriver: false`; switch to `Animated.FlatList` + `useAnimatedScrollHandler`.
- Entrance staggers: cap at the first 5–6 items (as `subcategory-product.tsx:25` already does) and never replay on recycle — key the animation on first mount, not on `index`.
- Horizontal rails (`home-promos.tsx`, `store-rail.tsx`) are short; `ScrollView` is fine there.
- Keep per-card work light: the `CornerGlow` SVG in every `ProductCard` (`product-card.tsx:20`) plus a heart, stepper and image is the heaviest thing in a scrolling grid; profile on a low-end Android before adding more per-card animation.

**Other:**
- Animate only `transform` and `opacity` (and `scaleX` instead of `width`, as in §7). Avoid animating `height`, `boxShadow` or gradients per frame; crossfade a pre-rendered shadow layer instead.
- `useMotionAllowed()` creates two listeners per component; with a card grid that is hundreds of listeners. Lift it into one provider (it already sits next to `CityMotionProvider`) and expose both a boolean and a shared value.
- Web: Reanimated runs on the JS thread there anyway; keep `tap.tsx`'s CSS-transition approach for press feedback and test the sticky chips and hide-on-scroll in the browser build too.
- Test with Reduce Motion on (iOS Settings → Accessibility → Motion; Android "Remove animations") and with a screen reader on, for every item above.
