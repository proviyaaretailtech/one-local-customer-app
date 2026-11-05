# Hand-off for the Master's Claude: customer app branch `ui/first-task` (2026-11-04, updated 2026-11-05)

From Veeraj's session on the One Local **customer app** (`proviyaaretailtech/one-local-customer-app`, folder `frontend/`).
Read this before changing anything in the Master that feeds the customer app. It has two jobs:

1. **Configuring the customer app through the Master**: what the Master can set, where, with which fields, and what
   the customer sees (next section).
2. **What this branch changed** for the Master. The branch has two passes from 2026-11-04 (redesigned pages, smooth
   screen switching, launch intro; then profile and location pages, sample photos, coming-soon gaps, clean-up) and the
   2026-11-05 work: Android testing and a demo APK, a new Home hero with four poster banners built into the app, the old
   department pages removed, the reel page redesigned, the Categories shop-picker titles fixed, and a dead-code sweep.
   Each has an entry in `docs/JOURNAL.md`.

**Changed on 2026-11-05, in short, for the Master:**

- Home's banners no longer come from `ol_banners` / `GET /banners`. They are four posters built into the app; see
  "Home banners are built into the app".
- `/grocery`, `/shops`, `/care`, `/pharmacy` and `/beauty` no longer exist. Pop-ups that target those screens never
  show, and a `cta_route` or deep link to them opens the "page not found" screen.
- The live catalogue lacks six categories the Categories tab points at (`c33`–`c38`), so those tiles list no shops.
- Live data problems seen in the demo APK: see "Live data to fix (Master or POS)".

## Configuring the customer app through the Master

### Access

- The Master calls the customer app's server at `ONE_LOCAL_API_URL` + `/api/admin/*` (in development
  `http://localhost:8081`), with `Authorization: Bearer <the signed-in admin's Supabase access token>` (same Supabase
  project).
- Who may call: a user with an active `platform_admins` row whose role is the platform **super admin**
  (`is_platform_super`), for reads and writes alike (`server/admin.ts`; this is stricter than the roles in contract
  v1). Others get `403`.
- Errors are `{ "detail": "…", "code": "…" }`; show `detail`, branch on `code`. Every write is audited. Full contract:
  `docs/MASTER_CONTRACT_V1.md`.
- Without a database (no `.env`), the admin API runs in memory with development tokens
  (`Bearer dev-admin:master_admin`, needs `ADMIN_DEV_TOKENS=1`); checks: `npx tsx scripts/admin-checks.ts`.
- **Timing:** the server caches the catalogue for 30 seconds. An admin-API write clears that cache at once on the
  server that took it; a row edited straight in a table shows within 30 seconds. A phone picks the change up the next
  time it loads that data.

### What the Master can set, and how the app shows it

| To change | Where | Fields | What the customer sees |
| --- | --- | --- | --- |
| **A shop or restaurant** (create, edit) | `POST /api/admin/listings`, `PATCH /api/admin/listings/:id` | `organization_id`, `location_id`, `name`, `department` (`food` / `grocery` / `shops` / `pharmacy` / `beauty`), `city_id`, `tagline`, `logo`, `cover_image`, `address`, `lat`, `lng`, `delivery_radius_km` (0.5–50), `delivery_time` | `food` opens as a restaurant menu page and fills the Food tab; anything else opens as a shop page. Field by field: "How the Master's listing fields show" below. |
| **Put a shop live, pause it** | `POST /api/admin/listings/:id/status` | `status`: `live` / `paused` / `pending`; `reason` required to pause | Only `live` listings appear. Going live needs at least one available item (`409 no_available_items`). |
| **Check before going live** | `GET /api/admin/listings/:id/preview` | — | Exactly the store, categories and items the app will show. |
| **Shop logo and cover photo** | `POST /api/admin/media/upload-url`, then `PUT` the file to `upload_url` | `folder: 'stores'`, `filename`, `content_type` (JPEG, PNG or WebP, ≤ 5 MB) | Save the returned `public_url` as `logo` or `cover_image`. The cover is the shop page's banner (cover crop, centred) and the restaurant page's hero; no cover shows a plain coloured block. A shop with no logo shows an empty white tile on its cards. |
| **Items, prices, item photos, menu categories** | The merchant's Item Master in the POS (`/org/menu-items`): `menu_items`, `menu_item_variants`, `menu_categories` | name, price, `image_url`, category, `is_available` | One product card per available item (or per variant, "Biriyani · Half"); price = the POS price; no photo → the store logo. A ₹0 item is treated as a placeholder and hidden. An `image_url` whose file is missing from Storage shows a grey placeholder. |
| **Hide one item on One Local only** | "Live on One Local" switch: `item_channel_status`, `channel = 'one_local'` | `is_available`, `off_until` | Hidden while switched off (until `off_until`, if set). |
| **Home banners** | **Not from the Master any more.** `ol_banners` rows and `GET /banners` still exist on the server, but the app does not read them. | — | Four posters built into the app; see "Home banners are built into the app". |
| **Pop-ups and campaigns** | `GET` / `POST /api/admin/popups`; `GET` / `PUT /api/admin/popups/:id`; `POST /api/admin/popups/:id/status`; `GET /api/admin/popups/:id/results` | `city_id`, `format` (`letter`, `popup_center`, `popup_sheet`, `strip`), `content.en` (`title` ≤ 80, `body` ≤ 280, `cta_label` ≤ 30, `cta_route` an app path), optional `hi` / `mr`, `media` (4:5 or square), `trigger`, `screens`, `targeting`, `frequency`, `starts_at`, `ends_at`; status actions `submit`, `return`, `approve`, `end` (a second admin approves) | `screens` are the first part of the app's path (`src/popups/rules.ts`, `screenOf`): `home`, `categories`, `discover`, `food`, `book-it`, `reels`, `store`, `product`, `category`, `brand`, `collection`, `search`, `account`. **`grocery`, `shops`, `care`, `pharmacy` and `beauty` are no longer screens**: a pop-up aimed at them never shows, and a `cta_route` to them opens "page not found". **While the coming-soon build is on, only `letter` pop-ups show**, and a `cta_route` to an ordering, booking or payment page ends at the coming-soon card. |
| **Customers** (find, block) | `GET /api/admin/shoppers?q=`, `POST /api/admin/shoppers/:id/block` | `blocked`, `reason` (3–300 characters) | A blocked customer cannot sign in or refresh a session (an open session lasts up to an hour). Merchant staff and admins cannot be blocked. |
| **"Bring One Local to my town" requests** | `GET /api/admin/demand` | — | Read only: places customers asked for with the "Bring One Local to …" button outside Latur. None arrive while the coming-soon build is on (it holds every write back). |
| **Orders held for review** | `GET /api/admin/order-holds`, `POST /api/admin/order-holds/:id` | — | Orders the risk checks held before a restaurant sees them. None arrive while the coming-soon build is on. |
| **Categories, coupons, events, reels, Discover chips, themed stores, brands** | No admin API yet: rows in `ol_categories`, `ol_coupons` (`active`), `ol_events`, `ol_reels`, `ol_discover_chips`, `ol_themed_stores`, `ol_brands` | as in each table; `city_id` empty = Latur | Coupons, event bookings and anything that orders are blocked while the coming-soon build is on. The Categories tab's tiles are fixed in the app and point at category ids (see "Things still wired to sample-data ids"). A reel shows its brand's `ol_brands.logo` beside the creator name, so a reel linked to the wrong brand shows the wrong logo. |

### What the Master cannot change yet (needs code, a server setting or a new build)

- **Home banners** are built into the app (below). Changing them needs an app update.
- **Coming-soon mode** is fixed when the app is built (`EXPO_PUBLIC_COMING_SOON`, `src/coming-soon-mode.ts`).
  Turning it off needs a new build or an over-the-air update, with the founder's approval.
- **Feature switches** (`GET /api/features`: `ai_search`, `assistant`, `maps`, `online_payments`, `wallet`, `coins`,
  `google_sign_in`) come from the server's environment (`FEATURE_<NAME>=on|off`, `server/features.ts`). The plan in
  `server/features.ts` is to move them to an `ol_feature_flags` table the Master can edit per city; the app would keep
  calling the same endpoint.
- **Opening a new city:** the location page reads live cities from `ol_service_areas` (`city_id`, `name`, `lat`,
  `lng`, `radius_km`, `active`), but the catalogue endpoints still accept only `latur` (`ACTIVE_CITIES` in
  `server/catalog.ts`). A second city needs that server change too.
- **"Update the app" and maintenance screens:** the app already shows them when the server answers `426`, or `503`
  with `code: 'maintenance'` (`src/network/app-blocked-state.ts`), but no server setting sends them yet.
- **Home "In spotlight", Discover's featured reels, the Categories tiles** are fixed in the app today (see below).

## Home banners are built into the app (changed 2026-11-05)

Home's first screen is now a still festive backdrop under the brand header, with a row of tall cards sliding over it
(`src/components/home-hero.tsx`). The first card holds the five services; four poster banners follow:

| Card | File (`frontend/assets/images/home/`) | Size |
| --- | --- | --- |
| Purushottam Super Market, Diwali lucky draw | `banner-purushottam.jpg` | 820×1087 (3:4) |
| Shree Shyam Bhoj | `banner-shree-shyam-bhoj.jpg` | 768×1376 (9:16) |
| Rooftop All Day Kitchen, wood-fired pizza | `banner-rooftop.jpg` | 820×1457 (9:16) |
| Baskin Robbins | `banner-baskin-robbins.jpg` | 415×739 (9:16) |

- They are committed with the app (about 1.2 MB together), so they show offline and on every machine. The three old
  banner images that existed only on Veeraj's Mac are scrapped, and so is the earlier "upload them and add `ol_banners`
  rows" step.
- Nothing is drawn on a poster: it carries its own words. A screen reader reads a label for each (`home.banners.*`).
- **How a card shows a poster:** the card is about 68% of the screen wide and 1.5 times as tall (2:3, portrait). The
  poster fills it (`cover`), trimmed where its shape differs: a 9:16 poster loses about 4% at the top and 12% at the
  bottom, and a 3:4 one loses a little off each side. **Design new posters at 2:3 (for example 800×1200)**, with the
  logo near the top and nothing important within the bottom eighth.
- The services card's buttons now open the new tabs: Food → the Food tab; Groceries, Shops and Pharma & Beauty → the
  Categories tab; Booking & Services → the Book It tab.
- **To put banners back under the Master's control** (an open question below): upload the posters to Storage, keep
  them as `ol_banners` rows (or an admin banner endpoint), and change the app to read `GET /banners` again, drawing no
  text on the picture. The server route and the table are untouched, so this is an app change plus data. Uploading and
  writing live rows needs the founder's OK. The sample catalogue's three `banners` rows (`b1`–`b3`) still point at the
  scrapped images; nothing reads them.

## Live data to fix (Master or POS)

Seen in the demo APK against the live server (`https://one-local-server.vercel.app`) on 2026-11-05. These are data, not
app bugs:

- **Categories `c33`–`c38` are missing from the live catalogue:** Meat & Seafood (`c33`), Masalas & Spices (`c34`), Ice
  Cream & Frozen (`c35`), Stationery (`c36`), Kids & Toys (`c37`), Imported Picks (`c38`). They exist only in the
  sample file. Their Categories tiles now show the right title (fixed in the app) but list no shops. Add them to
  `ol_categories` and put products in them, or settle the canonical category tree (open question).
- **Niks Cafe:** no logo, and its item photos for Americano, Cappuccino and others return "Object not found" from the
  `item-images` bucket. Its Home row, the Food tab's kinds and its restaurant card show grey placeholders. Re-upload the
  photos through the POS and set a logo.
- **Brand logos:** some brands (Amul, NIVEA) have no `ol_brands.logo`, so Discover shows a blank circle.
- **The McDonald's reel shows the Niks Cafe logo:** the reel's brand link or the brand's logo points at the wrong
  image (`ol_reels` / `ol_brands`).
- **Food kinds (`im-food-*` categories)** have empty or broken images.
- **Photos and videos from Supabase may not load on some Indian networks.** On Veeraj's Wi-Fi, its DNS
  (`103.14.232.100`) did not resolve `*.supabase.co`, though Google's DNS did, so product photos and reel videos failed
  in the APK. Some Indian ISPs have been reported blocking `supabase.co`. Serving Storage through our own domain (or a
  CDN in front of it) would avoid this; that is a founder/infra decision.

## Status

- Branch `ui/first-task`, **not merged** (Lohitaksha merges into `feat/expo-router-api`). Base: `bc55f82`.
- Checked on web and in the iOS simulator. On 2026-11-05 the app was walked screen by screen on an Android 15 emulator
  against the live server, and three Android display faults were fixed. The changes made after that walk (the Home
  posters, the removed pages, the reel page, the shop-picker titles) are checked on web and iOS only; they need a new
  APK to be seen on Android. Not run on a real phone. The e2e suite was not run (Playwright's browsers are not
  installed on this Mac); the specs that opened the removed pages were moved to `/category/c1` and `/search`.
- Type check passes apart from the known error in `scripts/delivery-otp-checks.ts`. `npm run i18n:check` reports no
  errors and the 114 string tests pass. `npm run lint` shows 37 findings, all in code committed before this work.

## What did NOT change (safe for the Master)

- **No server logic, API route, contract or database change.** `frontend/server/**` (except sample data),
  `frontend/app/api/**`, `db/`, `supabase/`, `docs/MASTER_CONTRACT_V1.md` and the other contracts are untouched.
  `/api/admin/*` and `GET /banners` behave exactly as before.
- No `app.json`, `app.config.ts`, native config, package or environment change. The four poster images are new app
  assets (JavaScript bundle only, no native change), so an over-the-air update can carry them.
- The customer profile gained a field (`origin`, below), but the profile lives only on the device (AsyncStorage), so no
  server shape changed.

## What changed that the server or Master can see

- **Pages removed (2026-11-05):** `/grocery`, `/shops`, `/care`, `/pharmacy` and `/beauty` (the old department pages;
  nothing linked to them except Home's service buttons, which now open the new tabs). See the pop-up row above.
- **Home no longer calls `GET /banners`.** Request logs will show it gone from app traffic.
- **Privacy notice, version `2026-11-04.1`** (`frontend/constants/privacy.ts`, which `server/privacy.ts` imports).
  "Use current location" now asks the phone's own map service (Apple Maps on iPhone, Google on Android) to name the
  area, so the notice lists that service as a recipient (`SHARED_WITH_IDS` gains `deviceMaps`). Effects: new consent
  rows carry `notice_version = '2026-11-04.1'`, and the data-export file's `shared_with` list has one more entry.
  Both are additive. `docs/DPDP.md` says the same. **The wording needs the founder's (or a lawyer's) sign-off.**
- **Sample catalogue photos** (`frontend/server/data/catalog.json`): 289 sample products whose photo showed something
  else now link a matching Wikimedia Commons photo; credits and licences in `docs/CATALOG_PHOTOS.md`. Only the sample
  file changed. The seeding warning under "Sample data" applies to these links too.
- **Coming-soon build:** every write goes through `apiPost`, which is blocked except `/privacy/*`; carts, saves and
  follows stop on the device. Nothing new reaches the server while `COMING_SOON_ALL` is on.

## How the Master's listing fields show in the customer app

The app reads stores from `GET /stores` / `GET /catalog`; for live listings these come from `storeOf()` in
`frontend/server/marketplace.ts`.

| Listing field (Master `/admin/one-latur`) | Where the redesigned app uses it |
| --- | --- |
| `department` | `'food'` → the store opens as a **restaurant menu page** (`src/components/restaurant-view.tsx`: hero photo, dish sections, menu popover). Any other department → the **shop page** (pop-art banner, category tiles, item grid). Food-department items also fill the Food tab's restaurant cards. A listing with no department becomes `'shops'` on the server. There are no separate Groceries, Shops or Pharmacy & Beauty pages any more; those stores appear on Home, in the Categories tab's shop pickers and in search. |
| `cover_image` | Becomes the store's first `media` image, which is the **banner** on the shop page (`storeBanner()` in `src/api.ts`: first image, else a video's thumbnail) and the hero on the restaurant page. No cover → the shop page shows a plain coloured block. |
| `logo` | The shop sign, shop-picker cards, Home shop cards, restaurant cards. |
| `name`, `tagline`, `delivery_time` | Shop/restaurant headers and cards (`delivery_time` shown as minutes). |
| `rating` (server default 4.5) | Home lists **every shop sorted by rating** (on phones, a few at a time as the customer scrolls); also shown on cards. |
| Item `image_url`, `discount_pct` | Product cards everywhere; a restaurant card's offer tag is the highest `discount_pct` among its items; its photo strip is its dishes' images. |
| Item category | The shop page's category tiles and the category page's sidebar group a store's items by `category_id`. |

Each shop gets a colour picked from its store id (`nameTints` in `src/theme.ts`); there is nothing to set for it.

## Things still wired to sample-data ids (live listings will not appear there yet)

These are good candidates for Master-side features. Today they only work with the sample catalogue:

1. **Categories tab** (`src/shop-categories.ts`, `CATEGORY_GROUPS`): 6 groups × 4 tiles, each mapped to a **sample
   category id** (`c1`–`c38`; two tiles can share one, Fresh Vegetables and Fresh Fruits are both `c1`). A tile opens
   a shop picker, `/category/shops/<categoryId>?tile=<tileId>`, listing stores with items in that category id. Since
   2026-11-05 the picker's title and icon come from the tile, in the app's language, so a category the server lacks no
   longer shows its raw id. Live merchant categories (from `menu_categories`) have other ids, so live items do not show
   under these tiles. A canonical category tree served by the backend, with merchant categories mapped onto it (an
   admin job), would fix this.
2. **Home "In spotlight"** (`app/(tabs)/index.tsx`, `SPOTLIGHT`): 12 hard-coded sample product ids, labelled
   "Sponsored picks". A sponsored/spotlight flag set in the Master would replace this.
3. **Discover's featured reels** (shown full screen the first time Discover opens each day, per account): today
   "featured" simply means every reel that has a video.

## New optional fields the app understands

- `Product.origin?: 'local' | 'national'` (`src/api.ts`, `src/origin.ts`). Home has a Local/National switch saved in
  the device profile. A product **without** `origin` shows in both modes, so nothing disappears. **No server or Master
  sets `origin` yet.** If the Master adds it, it must be an optional, additive field in the API.
- `Store.department?: string`: the client type only; the server already sends it.
- The app's `Banner` type is gone with Home's banner query; the server's `GET /banners` response is unchanged.

## Sample data (`frontend/server/data/catalog.json`)

- Added for UI work: **335 dummy products** (60 restaurant dishes), **10 dummy restaurants** (`dummy-tandoor-tales`,
  `dummy-biryani-bazaar`, `dummy-chai-stop`, `dummy-dosa-corner`, `dummy-wok-and-roll`, `dummy-cake-studio`,
  `dummy-shawarma-street`, `dummy-pizza-point`, `dummy-burger-barn`, `dummy-green-bowl`; all `department: 'food'`),
  and **9 categories**: `c33` Meat & Seafood, `c34` Masalas & Spices, `c35` Ice Cream & Frozen, `c38` Imported Picks
  (grocery); `c36` Stationery, `c37` Kids & Toys (shops); `c39` Thalis & Meals, `c40` Street Food, `c41` Desserts
  (food). Every added row has a `dummy-` id and `"dummy": true`.
- This file is used only when the server runs **without a database** (no `.env`). **But**
  `frontend/scripts/seed-catalog.mjs` upserts this whole file into the `ol_*` tables as `is_demo = true` rows; the
  `dummy` flag is not a column, and the dummy restaurants would arrive with `department = 'food'`. The script is
  local-only unless `ALLOW_REMOTE=1`. **Do not seed a shared or production database from this branch** without
  removing the dummy rows first; they must come out before real listings go in.
- `frontend/server/data/media.json` is a local-only change on Veeraj's machine and is **not** in the branch.

## Storage

- The launch intro is now drawn in code (`src/components/intro-splash.tsx`). The old videos in the public
  `onecity-catalog` bucket, `app/intro/intro-720.mp4` and `app/intro/intro-1080.mp4`, are **no longer used**. Deleting
  them waits for the founder's OK.

## Customer-app routes and test ids (for deep links from the Master and for tests)

- **Removed (2026-11-05):** `/grocery`, `/shops`, `/care`, `/pharmacy`, `/beauty`. They open "page not found". Use
  `/categories` (or a `/category/shops/<categoryId>?tile=<tileId>` link) instead.
- `/category/shops/[categoryId]`: shop picker for a category; `?tile=<tileId>` (an id from `CATEGORY_GROUPS`, such as
  `fruits` or `meat-seafood`) gives it that tile's name and icon.
- `/category/[categoryId]?store=<storeId>`: a category scoped to one shop. Without `store` it behaves as before.
- `/store/[id]`: same route; renders the restaurant page when the store's department is `food`.
- `/reels?id=<reelId>`: same route, redesigned: full screen, running on under the dock. Its "Shop Now" button and
  "swipe up" hint are gone (test ids `reel-shop-now-*`, `reel-next-*`); tapping the product card opens the product.
- `/booking/[id]`: still there, but nothing in the app opens it while Book It shows "coming soon". It is kept for Book
  It's launch; until then Profile → Bookings can only be empty.
- `/location` and `/india`: same routes, redesigned. `/address-map` and `/address-form` show the coming-soon page in
  this build.
- On web, `/` now opens on Home (it opened on Book It).
- Book It options, the cart, orders, payments and the wallet all show "coming soon" for now. The wallet's "Explore"
  button opens `/categories` (it opened `/grocery`).
- Test ids: `orders-back-btn` → `orders-back`; Home's banner ids are now `home-banner-purushottam`,
  `home-banner-shree-shyam-bhoj`, `home-banner-rooftop`, `home-banner-baskin-robbins`; `department-strip` is the services
  card; the reel page's white bar (`page-back-button`, `page-search-button`) is gone.

## Android

- **Demo APK, built on Veeraj's Mac (2026-11-05):** Veeraj's Expo login has no access to the team's EAS project, so it
  was built locally (`expo prebuild` + Gradle; `android/` is gitignored), signed with the debug key, 64-bit phones
  only, pointed at the live server, coming-soon mode on, no Supabase keys (sign-in unconfigured). A phone with an
  EAS-signed OneLocal must uninstall it first. Before building again, delete
  `frontend/android/app/build/generated/assets/createReleaseUpdatesResources`: Gradle otherwise keeps an old list of
  bundled images, and new images (the posters) come up blank.
- **Google Maps key for Android.** `app.config.ts` has only the web key (`googleMapsBrowserKey`); the Android map
  (`src/components/map-view.tsx`, Google provider) has none. The map screens are behind the coming-soon gate now, but
  they need the key (and a new build) before ordering opens.
- **Notification icon.** The `expo-notifications` plugin sets only a colour, so Android draws the app icon as a plain
  square in the status bar. It needs a white-on-transparent icon (a native change, new build).
- "Use current location" could not be checked on the emulator (its GPS gave no position).

## Follow-ups for the team (found, not done)

- **Privacy "Clear this phone"** (`src/privacy.ts`) leaves some device data behind: recent searches
  (`onecity.recent-searches.v1`), the last payment (`onecity.pay.last.v1`, `onecity.pay.inflight.v1`), the widget's
  `onecity.latestOrder`, and the signed-in session in SecureStore. A failed sign-out during account deletion is
  swallowed. Worth fixing before launch (DPDP).
- **Android behaviour to check on a device:** UPI `intent://` links inside the payment WebView may fail silently; the
  product sheet's pull-to-close does not work; drop shadows need Android 12+ (`filter`) or 9+ (`boxShadow`); the
  hardware back button does not close non-modal overlays.
- **Unused packages:** `date-fns`, `dayjs`, `@gorhom/bottom-sheet` and `react-native-dotenv` are installed but not
  imported; `expo-symbols` too (removing it is a native change). Removing them changes `package-lock.json`, so it waits
  for the team's OK. (The two loose logo files are deleted.)
- **Unused names in server code**, left for the server's owners: `json` in `app/api/checkouts/index+api.ts` and
  `app/api/payments/order+api.ts`, `can` in `app/api/partner/me+api.ts`, `constantTimeEqual` in `server/dispatch.ts`,
  `notFound` in `server/rider-onboarding.ts`, `customerKey` in `server/store.ts`, `HttpError` in
  `scripts/cashfree-checks.ts`, and `spawn`, `spawnSync`, `master`, `makeUser`, `roleId` in
  `scripts/single-order-thread.ts`.
- **Status bar on a cold start:** after a fresh start straight into Home, the iOS clock was once dark on the dark
  backdrop until a tab switch.
- **`scripts/android-smoke.sh`** no longer finds buttons: Android's UI dump cannot read the app while the first
  screen's animation runs.
- **Code shape:** `app/(tabs)/cart.tsx` is about 640 lines with three payment flows, and there are two payment-method
  models; phone-number checks and `initials()` exist in several copies; some storage keys are repeated as literals.
- **Performance left:** saving one product re-renders every card that shows a heart (`useSavedProducts`); the category
  page header animates its height on the JS thread; each product card runs its own delivery-time observer.
- **Dev server memory:** with the iOS app and web both connected, `npx expo start` runs out of memory (even with
  `NODE_OPTIONS=--max-old-space-size=8192`) after a dozen or so full web page loads, and has to be restarted. The
  cause was not found.
- **Lint:** 23 findings of React's "set state in an effect" rule and a few others remain in already-committed code;
  each needs its own behaviour check, so they were left.

## Rules that still apply (from `CLAUDE.md` in the customer-app repo)

- API responses are contracts with the Partner app, Rider app and Master: only add optional fields, never rename or
  remove (`docs/MASTER_CONTRACT_V1.md`).
- Nothing reaches production from a development machine: no `ALLOW_REMOTE=1`, no service-role key in `.env`, no
  migrations on production. Those need the founder's approval.

## Open questions (for the founder / team)

1. Should Home's banners go back under the Master's control (posters uploaded, `ol_banners` rows or an admin banner
   endpoint, and the app reading them again)? Until then, changing them needs an app update.
2. Add categories `c33`–`c38` to the live catalogue, or settle the canonical category tree first?
3. Who fixes the live data above (Niks Cafe photos and logo, brand logos, the McDonald's reel's logo, the food kinds'
   images)?
4. Serve Storage through our own domain or a CDN, so photos and videos load on networks that block `supabase.co`?
5. Sign off the privacy notice change (the phone's map service as a recipient)?
6. Who provides the Android Google Maps key and the notification icon, and when is the next team build (EAS access for
   Veeraj, or builds from the team's machine)?
7. Should the backend serve the Categories tree (and map merchant categories onto it), so live shops appear on the
   Categories tab?
8. Should the Master get a "spotlight / sponsored" flag for Home, and a "featured" flag for Discover reels?
9. Who will set a product's `origin` (local / national), and from where?
10. Can the old intro videos in Storage, and the unused packages, be deleted?
11. Should the admin API grow endpoints for banners, categories, coupons and feature switches, so the Master edits them
    with the same checks and audit as listings instead of writing the tables directly?
