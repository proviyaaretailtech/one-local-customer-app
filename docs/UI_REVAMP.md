# Customer app UI revamp: components and plan

Started 2026-11-03. The revamp rebuilds the customer app's screens on one small set of shared components, so every screen
looks and behaves the same way and the backend can drive what they show. This file is the plan and the rules; the
working rules in `CLAUDE.md` still apply to every change.

## Where we start (audit of `app/` and `src/`, 2026-11-03)

Almost every screen draws its own buttons, cards, headers and sheets. Press feel is shared: every `Pressable` gets a
haptic and press-scale from `src/native/react-native.tsx`. Money formatting is shared through `useFormat().money`. The
look is not shared:

| Pattern | Hand-built copies | Shared today |
| --- | --- | --- |
| Filled buttons | ~58 styles in 40 files: 9 heights (40–58), 14 radii, 11 colours | `ActionButton` (account screens only) |
| Icon buttons (round, back/close) | ~35: sizes 32–46 | none |
| Cards / surfaces | ~102 styles: radius 16–32, padding 10–25, 30 hand-written shadows | none (`GlassCard` is unused and broken) |
| Back + title headers | ~22: title 13–29 pt, mixed back icons and fallbacks | `AccountLayout`, `ImmersiveHeader`, `SubcategoryHeader` |
| Bottom sheets | ~10: one confirm sheet copied 3 times, grabber 4 times | none |
| List rows (icon, label, chevron/value) | ~15 types | none |
| Chips, pills, badges | ~89: "SOON" tag hand-built 7 times beside `SoonBadge` | `SoonBadge` (3 users) |
| Empty / loading / error states | ~15 empty, 43 `ActivityIndicator`s, ~20 error boxes | `LoadState`, `Message` |
| Price + MRP + discount | 7 layouts; discount % computed 3 different ways | `fmt.money` |
| Inputs and search bars | 30 inputs, 11 search bars, 2 local `Field`s | `accountStyles.input` |
| Quantity steppers | 5 implementations, 2 haptic styles | none |
| Images with a fallback | initials helper copied 6 times; cart images have none | monogram in `BrandRail` |

Tokens exist but are mostly bypassed. There are 775 literal font sizes (37 distinct), 420 literal radii versus 70 uses
of `radius.*`, and 179 hex plus 123 rgba literals. Six files each define their own `INK = '#050605'`. `src/theme.ts` has
colours, `spacing` and `radius`, but no type scale, shadow or ink token.

Data access is mixed. Domain types live in `src/api.ts`, and shared components already take them as props
(`ProductCard`, the rails in `catalog-sections.tsx`). Screens fetch three ways: react-query hooks (`useCatalog`),
inline `useQuery`, and `useEffect` + `api()`. `/orders` and `/stores` are each fetched from several screens with no
shared hook.

Dead code to delete before building on top of it: `premium-cart-celebration.tsx`, `order-tracking.tsx` and
`higgsfield-character.tsx` (nothing imports them), plus `glass-button.tsx` and `glass-card.tsx` (used only by those).
The `@gorhom/bottom-sheet` dependency is installed but never imported.

## The layers

Each layer may use the ones above it, never the ones below.

1. **Tokens** in `src/theme.ts` (`colors`, `spacing`, `radius`, plus the additions below) and `src/motion-tokens.ts`.
   Components never contain a raw colour, font size, radius or shadow.
2. **Primitives** in `src/ui/`. These only know how to look and behave: no fetching, no routing, no `useCart`, no
   domain types. All text comes in through props, already translated by the caller. The only exceptions are generic
   accessibility labels such as "Back" and "Close".
3. **Domain components** in `src/components/`. Each one draws one thing from the API (`ProductCard`, `StoreCard`,
   `OrderCard`, `CartLine`, `AddressCard`). It takes that thing's type from `src/api.ts` as a prop, plus callbacks. It
   may read shared client state (`useCart`, `useSavedProducts`) but never fetches.
4. **Sections**: a title plus a rail or grid of domain components (`ProductRail`, `BrandRail`, `CategoryRail`, …).
   Their names and props follow the server-driven section types planned in `docs/PLATFORM_FOUNDATIONS.md` §3 Lane 1
   (`product_rail`, `brand_rail`, `category_grid`, `banner`, `spotlight`, `departments`, `store_worlds`,
   `collection_grid`). When `/api/screens/home` exists, rendering the home screen becomes a map from section type to
   component, with no redesign.
5. **Screens** in `app/`. These fetch data through one react-query hook per endpoint in `src/` (the `useCatalog`
   pattern), show loading, error and empty states with the shared state components, and lay out sections. Navigation
   lives here, passed down as callbacks.

## Primitives to build

Each is built in the change that first uses it, never ahead of it, and replaces every hand-built copy on the screens
being revamped. The file names and APIs below are the target. Exact sizes and colours come from the new design.

| File | Exports | Replaces |
| --- | --- | --- |
| `src/ui/text.tsx` (exists) | `Text` gains `variant` (type scale) and `tone` | literal font sizes |
| `src/ui/button.tsx` | `Button` (`variant`: primary, secondary, ghost, danger; `size`; `loading`; `icon`), `IconButton` | ~58 CTAs, ~35 round icon buttons, `ActionButton` |
| `src/ui/card.tsx` | `Card` (`padding`, `elevation`, optional `onPress`) | ~102 card styles, `GlassCard` |
| `src/ui/screen-header.tsx` | `ScreenHeader` (`title`, `fallback` route for back, `actions`) | ~22 headers, the header inside `AccountLayout` |
| `src/ui/sheet.tsx` | `Sheet` (bottom, grabber, title, close; Reanimated, Reduce Motion aware), `ConfirmSheet` | ~10 sheets, 3 copied confirm sheets |
| `src/ui/list-row.tsx` | `ListRow` (`icon`, `title`, `subtitle`, `trailing`: chevron, value, switch, badge) | ~15 row types |
| `src/ui/chip.tsx` | `Chip` (selectable), `Badge` (`tone`: soon, discount, count, status) | ~89 chips and tags, `SoonBadge` |
| `src/ui/section-header.tsx` | `SectionHeader` (`title`, `subtitle`, `eyebrow`, `onSeeAll`) | `SectionTitle`, ~8 hand-built headings, 5 group titles |
| `src/ui/states.tsx` | `Loader`, `Skeleton`, `EmptyState`, `ErrorState` (with retry) | `LoadState`, `Message`, ~15 empty states, 43 spinners |
| `src/ui/field.tsx` | `Field` (`label`, `prefix`, `error`), `SearchField` (input, or a button that opens search) | 30 inputs, 11 search bars |
| `src/ui/stepper.tsx` | `QtyStepper` (`value`, `onAdd`, `onRemove`, `size`) | 5 steppers |
| `src/ui/price.tsx` | `Price` (`price`, `mrp`, `discountPct`, `size`) | 7 price layouts |
| `src/ui/thumb.tsx` | `Thumb` (expo-image with a monogram or icon fallback), `initials()` | 6 initials helpers, bare cart images |
| `src/ui/segmented.tsx` | `Segmented` | 6 tab controls |

`Tap` stays where it is. The primitives build on the wrapped `Pressable`, which already brings the haptic and press motion.

### Tokens to add in `src/theme.ts`, with the design

- `colors.ink`: one near-black, replacing the six local `INK` constants and `#0B1F16` / `#0D120E` / `#141414`.
- `type`: a fixed scale, for example `display`, `title`, `heading`, `body`, `label`, `caption`, each with size,
  line height, weight and letter-spacing. Today's most used sizes are 13, 12, 11, 14, 10 and 15. Hindi keeps
  `safeLineHeight`.
- `shadow`: two or three levels, replacing 30 hand-written `boxShadow`s.
- `radius` and `spacing`: keep the names and settle the values once against the design. Today's cards use 16–24, not
  `radius.md` (22).

Dark mode stays out of scope (it is scaffolded but unused, and 101 files import the static `colors`) unless the design
asks for it.

## Component rules

- **Smallest API that serves the screens that exist.** Looks are chosen with `variant`, `size` and `tone` string
  unions that have defaults, never with boolean switches like `primary` or `big`. A new variant is added when a second
  screen needs it.
- **`style` is for outside layout only** (margin, flex, width, alignSelf). A screen that needs a different look gets
  a variant, not a style override.
- **Every component passes through `testID` and `accessibilityLabel`.** Revamped screens keep every existing `testID`,
  since `frontend/e2e/` depends on them. Touch targets are at least 44 pt.
- **One file per component family, named exports.** The file name is the kebab-case component name, and the file
  starts with a short header comment saying what it is for, as the existing files do.
- **Motion** uses `motion-tokens.ts` and respects `useMotionAllowed()`. Haptics: `haptic.add` / `haptic.remove` for
  quantity, nothing extra for ordinary presses.
- **One icon set.** Ionicons is in 85 files and Lucide in 4; pick one with the design and move the other's users over
  as their screens are revamped.
- **The old copy goes in the same change.** A revamped screen leaves no unused styles, helpers or components behind.

## Data rules (so components plug into the backend)

- Domain components take the API's own types from `src/api.ts` and do not reshape them. If the UI needs a value the
  server already sends, use it; for example, discount comes from `discount_pct`, with one shared fallback only when it
  is missing.
- Every endpoint gets one react-query hook in `src/`, shared by every screen that needs it. Start with `useOrders`
  and `useStores`, which today are fetched separately in several places.
- Loading, error and empty are handled by the screen with `src/ui/states.tsx`, never by a silent `.catch(() => {})`.
- The revamp does not change API responses. If a design needs data the server does not send, it becomes an
  optional-field request to the backend owners, following the contract rules in `CLAUDE.md`.
- Payments (`payment-*`, `checkout-payment`, `razorpay-*`, `cashfree`) and order tracking keep their logic untouched;
  only their presentation moves onto the primitives.

## Order of work

Each phase is its own branch and its own reviewable change, screen by screen. There is no big-bang rewrite, and the
app works after every phase.

The revamp started with the top of Home (header, search, Local / National switch, the five services), designed piece
by piece; it went first because it sets the look the other screens reuse. The phases below follow it.

Waiting on the backend: the Local / National switch filters browsing by an optional `origin: 'local' | 'national'`
on each product (`src/api.ts`, `src/origin.ts`). Until the API sends it, unmarked products show in both modes.

| Phase | Builds | Screens |
| --- | --- | --- |
| 0. Ground | Delete the dead code above. Add the tokens. Pick the icon set. | none visible |
| 1. Account | `Button`, `IconButton`, `ScreenHeader`, `ListRow`, `Sheet`/`ConfirmSheet`, `Card`, states, `Field` | Account tab and its pages: Privacy, Privacy notice, About, Language, Addresses, Profile, Help, Refer, Payments, Wallet |
| 2. Browse | `Price`, `QtyStepper`, `Thumb`, `Chip`/`Badge`, `SectionHeader`, `SearchField`; `ProductCard`, `StoreCard` | Home, Categories, Category, Collection, Brand, Store, Search, departments |
| 3. Buy | `Segmented`; `CartLine` | Product page, Cart, Compare, Wishlist |
| 4. Pay | uses the above | payment sheet and methods (merge the two parallel builders), payment result |
| 5. After the order | `OrderCard` | Orders, Order detail, tracking, feedback, cancel |
| 6. First run | uses the above | Welcome, Language, Location, Address map/form, Sign-in |
| 7. The rest | uses the above | Discover/Reels, Assistant, popups, coming-soon screens |

Phase 1 comes first because it has the most copied pieces (headers, rows, confirm sheets) and no money or order logic,
so the primitives are proven where a mistake costs little.

## Done, for each phase

Everything in `CLAUDE.md` § "Before calling a change done", plus:

- `npm run e2e` passes against the dev server on port 8081, and no `testID` was removed.
- On the revamped screens, no new hex, rgba, font size, radius or shadow literal appears outside `src/theme.ts`.
- The hand-built copies the phase replaced are gone, including their styles.
- iOS simulator and web screenshots of each revamped screen, with Reduce Motion on and off, and in Hindi (longer
  words, taller line heights).
- An entry at the top of `docs/JOURNAL.md`.
