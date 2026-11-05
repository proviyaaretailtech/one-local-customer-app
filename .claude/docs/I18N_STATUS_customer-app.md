# i18n status — customer app (One Local / OneCity)

Hand-written notes sit above the generated block and are kept when it is regenerated. Do not edit between the markers: run `npm run i18n:check` in `One Local Mobile App /OL-ui/frontend`.

<!-- generated:start (npm run i18n:check, 2026-10-14) -->
## Generated status (2026-10-14)

| | |
|---|---|
| Catalogue keys (en / hi) | 1804 / 1804 |
| Catalogue errors (parity, empty, placeholders, missing keys) | 0 |
| Catalogue warnings | 8 |
| Files scanned | 178 |
| Files using the catalogue and fully clean | 104 |
| Files still holding hard-coded text (definite) | 1 |
| Hard-coded strings: definite / possible | 1 / 3 |
| Layout warnings (tight line height / fixed height) | 4 |

### Catalogue warnings

- hi equals en (not translated?): account.coinsTitle
- hi equals en (not translated?): product.mrpPrice
- hi equals en (not translated?): cart.tab.saver
- hi equals en (not translated?): saver.title
- hi equals en (not translated?): privacyNotice.s3.supabaseWho
- hi equals en (not translated?): privacyNotice.s3.razorpayWho
- hi equals en (not translated?): payui.upi.sub
- hi equals en (not translated?): payui.upi.idPlaceholder


### Converted (uses the catalogue, no definite hard-coded text left)

- `app/(tabs)/account.tsx`
- `app/(tabs)/book-it.tsx`
- `app/(tabs)/cart.tsx`
- `app/(tabs)/categories.tsx`
- `app/(tabs)/discover.tsx`
- `app/(tabs)/index.tsx`
- `app/+not-found.tsx`
- `app/_layout.tsx`
- `app/about.tsx`
- `app/address-form.tsx`
- `app/address-map.tsx`
- `app/addresses.tsx`
- `app/assistant.tsx`
- `app/booking/[id].tsx`
- `app/brand/[id].tsx`
- `app/category/[id].tsx`
- `app/collection/[id].tsx`
- `app/compare.tsx`
- `app/enquiries.tsx`
- `app/help.tsx`
- `app/india.tsx`
- `app/language.tsx`
- `app/location.tsx`
- `app/notifications.tsx`
- `app/order/[id].tsx`
- `app/orders.tsx`
- `app/payments.tsx`
- `app/privacy-notice.tsx`
- `app/privacy.tsx`
- `app/product/[id].tsx`
- `app/profile-edit.tsx`
- `app/refer.tsx`
- `app/search.tsx`
- `app/sign-in.tsx`
- `app/smart-search.tsx`
- `app/store/[id].tsx`
- `app/wallet.tsx`
- `app/wishlist.tsx`
- `src/app-updates.tsx`
- `src/assistant.ts`
- `src/auth.tsx`
- `src/components/account-layout.tsx`
- `src/components/app-shell.tsx`
- `src/components/assistant-basket.tsx`
- `src/components/assistant-message.tsx`
- `src/components/assistant-shopping-tools.tsx`
- `src/components/bottom-navigation.tsx`
- `src/components/brand-spotlight.tsx`
- `src/components/cancel-order-card.tsx`
- `src/components/cart-celebration.tsx`
- `src/components/cart-character.tsx`
- `src/components/catalog-sections.tsx`
- `src/components/checkout-payment.tsx`
- `src/components/collection-scene.tsx`
- `src/components/coming-soon-brand.tsx`
- `src/components/coming-soon.tsx`
- `src/components/department-screen.tsx`
- `src/components/department-strip.tsx`
- `src/components/error-boundary.tsx`
- `src/components/explore-town.tsx`
- `src/components/floating-cart.tsx`
- `src/components/food-spotlight.tsx`
- `src/components/higgsfield-character.tsx`
- `src/components/home-hero.tsx`
- `src/components/home-promos.tsx`
- `src/components/immersive-header.tsx`
- `src/components/intro-splash.tsx`
- `src/components/map-view.web.tsx`
- `src/components/one-button.tsx`
- `src/components/one-saver.tsx`
- `src/components/order-tracking.tsx`
- `src/components/payment-hosted.tsx`
- `src/components/payment-hosted.web.tsx`
- `src/components/payment-methods.tsx`
- `src/components/payment-options.tsx`
- `src/components/payment-progress.tsx`
- `src/components/premium-cart-celebration.tsx`
- `src/components/product-card.tsx`
- `src/components/razorpay-checkout.tsx`
- `src/components/reel-card.tsx`
- `src/components/refund-status.tsx`
- `src/components/replace-cart-sheet.tsx`
- `src/components/store-rail.tsx`
- `src/components/subcategory-header.tsx`
- `src/components/subcategory-options.tsx`
- `src/components/subcategory-product.tsx`
- `src/components/tracking-map.tsx`
- `src/components/tracking-map.web.tsx`
- `src/components/tracking-parts.tsx`
- `src/components/tracking-schematic.tsx`
- `src/components/vendor-note.tsx`
- `src/components/voice-search-control.tsx`
- `src/customer.tsx`
- `src/departments.ts`
- `src/layout.tsx`
- `src/native/ios-extras.ts`
- `src/network/network-status.tsx`
- `src/places.ts`
- `src/popups/coming-soon-receipt.tsx`
- `src/popups/popup-host.tsx`
- `src/privacy.ts`
- `src/unit-price.ts`
- `src/use-discovery.ts`
- `src/utils/tracking-copy.ts`

### Remaining, per file (definite / possible)

| File | Definite | Possible |
|---|---:|---:|
| `src/components/payment-sheet.tsx` | 1 | 0 |
| `src/native/ios-extras.ts` | 0 | 1 |
| `src/popups/api.ts` | 0 | 1 |
| `src/push.ts` | 0 | 1 |

Files with no user-visible text found (nothing to convert): 71.

### Remaining strings, in full

**`src/components/payment-sheet.tsx`**

- payment-sheet.tsx:92 JSX expression: 'OneLocal Wallet'

**`src/native/ios-extras.ts`**

- ios-extras.ts:53 (possible) { title: … }: `OneLocal · ${t(`notifications.${st.id}.title`)}`

**`src/popups/api.ts`**

- api.ts:11 (possible) new Error: `popups ${r.status}`

**`src/push.ts`**

- push.ts:86 (possible) { name: … }: 'Order updates'

### Layout warnings for Hindi

- src/components/floating-cart.tsx:53 fixed height 40 on "cta": use minHeight so longer Hindi text can grow
- src/components/home-hero.tsx:172 lineHeight 42 for fontSize 40 (1.05) may clip Devanagari — use ≥ 54
- src/components/home-hero.tsx:187 lineHeight 16 for fontSize 13.5 (1.19) may clip Devanagari — use ≥ 19
- src/components/home-hero.tsx:188 lineHeight 13 for fontSize 11 (1.18) may clip Devanagari — use ≥ 15

### Catalogue keys not referenced by a literal t() call (informational; dynamic keys are not traced)

- common.add
- common.filter
- common.back
- common.next
- common.done
- common.submit
- common.confirm
- common.continue
- common.yes
- common.no
- common.ok
- common.required
- common.none
- common.free
- common.offline
- common.dismiss
- errors.generic
- auth.eyebrow.checkout
- auth.eyebrow.signin
- auth.eyebrow.signup
- auth.consent.marketingHint
- auth.createAccount
- auth.google.hint
- auth.notice.confirmEmail
- auth.error.googleUnfinishedRetry
- auth.error.googleOff
- auth.error.googleStart
- auth.error.appleOff
- auth.error.appleStart
- auth.error.appleUnfinishedRetry
- account.coinsTeaser_one
- account.coinsTeaser_other
- store.loading
- category.saveFailed
- category.linkCopied
- category.shareFailed
- booking.errorSlot
- booking.errorName
- booking.errorPhone
- booking.errorSave
- india.kindCity
- india.kindTown
- india.kindLocality
- india.kindVillage
- location.kind.city
- location.kind.town
- location.kind.locality
- location.kind.village
- address.kind.home
- address.kind.work
- address.kind.other
- address.list.receiverName
- address.list.mobile
- address.list.flat
- address.list.areaCity
- address.list.pin
- search.dept.food
- search.dept.grocery
- search.dept.shops
- search.dept.care
- assistant.loadFailed
- assistant.starter.festiveTitle
- assistant.starter.festivePrompt
- assistant.starter.fitnessTitle
- assistant.starter.fitnessPrompt
- assistant.starter.pantryTitle
- assistant.starter.pantryPrompt
- assistant.starter.vegTitle
- assistant.starter.vegPrompt
- assistant.starter.swapsTitle
- assistant.starter.swapsPrompt
- departments.food.name
- departments.grocery.name
- departments.shops.name
- departments.care.name
- departments.bookIt.name
- departments.filters.burgers
- departments.filters.pizza
- departments.filters.coffee
- departments.filters.chicken
- departments.filters.fruitsVeggies
- departments.filters.dairyEggs
- departments.filters.snacks
- departments.filters.bakery
- departments.filters.fashion
- departments.filters.electronics
- departments.filters.homeware
- departments.filters.wellness
- departments.filters.hygiene
- departments.filters.skincare
- departments.filters.makeup
- departments.filters.haircare
- home.hero.eyebrow
- home.hero.title
- home.hero.photoLabel
- shell.cartBar.inBag_one
- shell.cartBar.inBag_other
- shell.cartBar.fees
- cart.kindTab.food
- cart.kindTab.shopping
- cart.tab.cart
- cart.tab.saver
- cart.store.yourRestaurant
- cart.store.fallback
- cart.store.metaFree
- cart.store.metaFee
- cart.store.metaTimeFree
- cart.store.metaTimeFee
- cart.bill.deliveryNoteWaived
- cart.bill.deliveryNote
- cart.bill.error
- cart.vendor.veggiesName
- cart.vendor.veggiesMessage
- cart.vendor.veggiesPacked
- cart.vendor.dairyName
- cart.vendor.dairyMessage
- cart.vendor.dairyPacked
- cart.vendor.foodName
- cart.vendor.foodMessage
- cart.vendor.foodPacked
- … 94 more

<!-- generated:end -->
