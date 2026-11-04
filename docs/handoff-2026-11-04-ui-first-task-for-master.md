# Hand-off for the Master's Claude: customer app branch `ui/first-task` (2026-11-04)

From Veeraj's session on the One Local **customer app** (`proviyaaretailtech/one-local-customer-app`, folder `frontend/`).
Read this before changing anything in the Master that feeds the customer app. It has two jobs:

1. **Configuring the customer app through the Master**: what the Master can set, where, with which fields, and what
   the customer sees (next section).
2. **What this branch changed** for the Master. It covers two passes on the same branch: the first pass (redesigned
   pages, smooth screen switching, launch intro) and the finishing pass (profile and location pages, sample photos,
   hero banners, coming-soon gaps, code clean-up). Both have an entry in `docs/JOURNAL.md`.

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
  time it loads that data; banners are kept on the phone for up to 5 minutes.

### What the Master can set, and how the app shows it

| To change | Where | Fields | What the customer sees |
| --- | --- | --- | --- |
| **A shop or restaurant** (create, edit) | `POST /api/admin/listings`, `PATCH /api/admin/listings/:id` | `organization_id`, `location_id`, `name`, `department` (`food` / `grocery` / `shops` / `pharmacy` / `beauty`), `city_id`, `tagline`, `logo`, `cover_image`, `address`, `lat`, `lng`, `delivery_radius_km` (0.5–50), `delivery_time` | `food` opens as a restaurant menu page and fills the Food tab; anything else opens as a shop page. Field by field: "How the Master's listing fields show" below. |
| **Put a shop live, pause it** | `POST /api/admin/listings/:id/status` | `status`: `live` / `paused` / `pending`; `reason` required to pause | Only `live` listings appear. Going live needs at least one available item (`409 no_available_items`). |
| **Check before going live** | `GET /api/admin/listings/:id/preview` | — | Exactly the store, categories and items the app will show. |
| **Shop logo and cover photo** | `POST /api/admin/media/upload-url`, then `PUT` the file to `upload_url` | `folder: 'stores'`, `filename`, `content_type` (JPEG, PNG or WebP, ≤ 5 MB) | Save the returned `public_url` as `logo` or `cover_image`. The cover is the shop page's banner (cover crop, centred) and the restaurant page's hero; no cover shows a plain coloured block. |
| **Items, prices, item photos, menu categories** | The merchant's Item Master in the POS (`/org/menu-items`): `menu_items`, `menu_item_variants`, `menu_categories` | name, price, `image_url`, category, `is_available` | One product card per available item (or per variant, "Biriyani · Half"); price = the POS price; no photo → the store logo. A ₹0 item is treated as a placeholder and hidden. |
| **Hide one item on One Local only** | "Live on One Local" switch: `item_channel_status`, `channel = 'one_local'` | `is_available`, `off_until` | Hidden while switched off (until `off_until`, if set). |
| **Hero banners** (Home, top carousel) | No admin API yet: rows in `ol_banners` | `id`, `title`, `subtitle`, `image`, `city_id`, `sort_order` (`bg` is still read but the redesigned hero ignores it) | Shown after the five service tiles, in `sort_order`. The picture fills the whole hero (cover crop, centred); the app writes `subtitle` on a lime sticker (one line) over `title` (up to two lines) near the bottom. Use a landscape picture at least 1280 px wide, subject in the middle, no text of its own in the lower third. `image` is an `https` link or `/api/media/<key>`. |
| **Pop-ups and campaigns** | `GET` / `POST /api/admin/popups`; `GET` / `PUT /api/admin/popups/:id`; `POST /api/admin/popups/:id/status`; `GET /api/admin/popups/:id/results` | `city_id`, `format` (`letter`, `popup_center`, `popup_sheet`, `strip`), `content.en` (`title` ≤ 80, `body` ≤ 280, `cta_label` ≤ 30, `cta_route` an app path), optional `hi` / `mr`, `media` (4:5 or square), `trigger`, `screens`, `targeting`, `frequency`, `starts_at`, `ends_at`; status actions `submit`, `return`, `approve`, `end` (a second admin approves) | `screens` are the first part of the app's path: `home`, `food`, `grocery`, `categories`, `discover`, `book-it`, `store`, `product`, `search`, `account`. **While the coming-soon build is on, only `letter` pop-ups show**, and a `cta_route` to an ordering, booking or payment page ends at the coming-soon card. |
| **Customers** (find, block) | `GET /api/admin/shoppers?q=`, `POST /api/admin/shoppers/:id/block` | `blocked`, `reason` (3–300 characters) | A blocked customer cannot sign in or refresh a session (an open session lasts up to an hour). Merchant staff and admins cannot be blocked. |
| **"Bring One Local to my town" requests** | `GET /api/admin/demand` | — | Read only: places customers asked for with the "Bring One Local to …" button outside Latur. None arrive while the coming-soon build is on (it holds every write back). |
| **Orders held for review** | `GET /api/admin/order-holds`, `POST /api/admin/order-holds/:id` | — | Orders the risk checks held before a restaurant sees them. None arrive while the coming-soon build is on. |
| **Categories, coupons, events, reels, Discover chips, themed stores, brands** | No admin API yet: rows in `ol_categories`, `ol_coupons` (`active`), `ol_events`, `ol_reels`, `ol_discover_chips`, `ol_themed_stores`, `ol_brands` | as in each table; `city_id` empty = Latur | Coupons, event bookings and anything that orders are blocked while the coming-soon build is on. The Categories tab's tree is fixed in the app (see "Things still wired to sample-data ids"). |

### What the Master cannot change yet (needs code, a server setting or a new build)

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
- **Home "In spotlight", Discover's featured reels, the Categories tree** are fixed in the app today (see below).

## Status

- Branch `ui/first-task`, **not merged** (Lohitaksha merges into `feat/expo-router-api`). Base: `bc55f82`.
- Checked on web and in the iOS simulator. **Not tested on Android** (no emulator on this Mac); the e2e suite was not run.
- Type check passes apart from the known error in `scripts/delivery-otp-checks.ts`. `npm run i18n:check` reports no
  errors. `npm run lint` shows 37 findings, all in code committed before the finishing pass; most are React's "set
  state in an effect" rule (see follow-ups).

## Do first: the three hero banners only exist on Veeraj's Mac

The Home hero carousel reads `GET /banners` (the `ol_banners` rows for the customer's city; the sample catalogue when
the server has no database). The sample catalogue's banners point at three new images:

| id | `title` / `subtitle` | `image` | Picture |
| --- | --- | --- | --- |
| `b1` | Shree Shyam Bhoj / Coming soon on OneLocal | `/api/media/banner-shree-shyam-bhoj` | 1280×720 WebP, landscape |
| `b2` | Rooftop All Day Kitchen / Wood-fired pizza | `/api/media/banner-rooftop` | 914×1180 JPEG, cropped to the poster's top part |
| `b3` | Diwali Dhamaka Lucky Draw / Purushottam Super Market | `/api/media/banner-purushottam-diwali` | 1536×1024 WebP, landscape |

The files are in `backend/.media_build/onelatur/uploads/catalog/`, which is git-ignored, and the committed
`frontend/server/data/media.json` is empty. So on any other machine, and on the live server, these three images do
not load. To show them:

- **Live (Master):** upload the three files to Storage (`onecity-catalog`) and add `ol_banners` rows for Latur with
  their public URLs, the titles above and a `sort_order`.
- **Sample catalogue:** add the three keys to `media.json` pointing at those public URLs.

Uploading to Storage and writing live rows needs the founder's OK. How the app draws a banner: the picture fills the
whole hero behind the page (`contentFit="cover"`, centred), and the app writes `subtitle` on a lime sticker over
`title` near the bottom. So the picture should carry no text of its own in its lower third, and its subject should sit
in the middle.

## What did NOT change (safe for the Master)

- **No server logic, API route, contract or database change.** `frontend/server/**` (except sample data),
  `frontend/app/api/**`, `db/`, `supabase/`, `docs/MASTER_CONTRACT_V1.md` and the other contracts are untouched.
  `/api/admin/*` behaves exactly as before.
- No `app.json`, `app.config.ts`, native config, package or environment change.
- The customer profile gained a field (`origin`, below), but the profile lives only on the device (AsyncStorage), so no
  server shape changed.

## What changed that the server or Master can see

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
| `department` | `'food'` → the store opens as a **restaurant menu page** (`src/components/restaurant-view.tsx`: hero photo, dish sections, menu popover). Any other department → the **shop page** (pop-art banner, category tiles, item grid). Food-department items also fill the Food tab's restaurant cards. A listing with no department becomes `'shops'` on the server. |
| `cover_image` | Becomes the store's first `media` image, which is the **banner** on the shop page (`storeBanner()` in `src/api.ts`: first image, else a video's thumbnail) and the hero on the restaurant page. No cover → the shop page shows a plain coloured block. |
| `logo` | The shop sign, shop-picker cards, Home shop cards, restaurant cards. |
| `name`, `tagline`, `delivery_time` | Shop/restaurant headers and cards (`delivery_time` shown as minutes). |
| `rating` (server default 4.5) | Home lists **every shop sorted by rating** (on phones, a few at a time as the customer scrolls); also shown on cards. |
| Item `image_url`, `discount_pct` | Product cards everywhere; a restaurant card's offer tag is the highest `discount_pct` among its items; its photo strip is its dishes' images. |
| Item category | The shop page's category tiles and the category page's sidebar group a store's items by `category_id`. |

Each shop gets a colour picked from its store id (`nameTints` in `src/theme.ts`); there is nothing to set for it.

## Things still wired to sample-data ids (live listings will not appear there yet)

These are good candidates for Master-side features. Today they only work with the sample catalogue:

1. **Categories tab** (`src/shop-categories.ts`, `CATEGORY_GROUPS`): 6 groups × 4 sub-categories, each mapped to a
   **sample category id** (`c1`–`c38`). A sub-category opens a shop picker (`/category/shops/[id]`) listing stores
   that have items in that category id. Live merchant categories (from `menu_categories`) have other ids, so live
   items do not show under these tiles. A canonical category tree served by the backend, with merchant categories
   mapped onto it (an admin job), would fix this.
2. **Home "In spotlight"** (`app/(tabs)/index.tsx`, `SPOTLIGHT`): 12 hard-coded sample product ids, labelled
   "Sponsored picks". A sponsored/spotlight flag set in the Master would replace this.
3. **Discover's featured reels** (shown full screen the first time Discover opens each day, per account): today
   "featured" simply means every reel that has a video.

## New optional fields the app understands

- `Product.origin?: 'local' | 'national'` (`src/api.ts`, `src/origin.ts`). Home has a Local/National switch saved in
  the device profile. A product **without** `origin` shows in both modes, so nothing disappears. **No server or Master
  sets `origin` yet.** If the Master adds it, it must be an optional, additive field in the API.
- `Store.department?: string`: the client type only; the server already sends it.

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

- `/category/shops/[categoryId]`: shop picker for a category.
- `/category/[categoryId]?store=<storeId>`: a category scoped to one shop. Without `store` it behaves as before.
- `/store/[id]`: same route; renders the restaurant page when the store's department is `food`.
- `/location` and `/india`: same routes, redesigned. `/address-map` and `/address-form` show the coming-soon page in
  this build.
- On web, `/` now opens on Home (it opened on Book It).
- Book It options, the cart, orders, payments and the wallet all show "coming soon" for now.
- Test id renamed: `orders-back-btn` → `orders-back`. No spec in `frontend/e2e/` used it.

## Android: needs approval or a new build before it is complete

- **Google Maps key for Android.** `app.config.ts` has only the web key (`googleMapsBrowserKey`); the Android map
  (`src/components/map-view.tsx`, Google provider) has none. The map screens are behind the coming-soon gate now, but
  they need the key (and a new build) before ordering opens.
- **Notification icon.** The `expo-notifications` plugin sets only a colour, so Android draws the app icon as a plain
  square in the status bar. It needs a white-on-transparent icon (a native change, new build).
- Done in code, not yet seen on a device: Android system haptics, keyboard padding for the edge-to-edge layout, no
  underline on text fields, videos drawn on a texture so they clip with their cards, slow blur settings removed,
  Hindi-safe line heights on small labels.

## Follow-ups for the team (found, not done)

- **Privacy "Clear this phone"** (`src/privacy.ts`) leaves some device data behind: recent searches
  (`onecity.recent-searches.v1`), the last payment (`onecity.pay.last.v1`, `onecity.pay.inflight.v1`), the widget's
  `onecity.latestOrder`, and the signed-in session in SecureStore. A failed sign-out during account deletion is
  swallowed. Worth fixing before launch (DPDP).
- **Android behaviour to check on a device:** UPI `intent://` links inside the payment WebView may fail silently; the
  product sheet's pull-to-close does not work; drop shadows need Android 12+ (`filter`) or 9+ (`boxShadow`); the
  hardware back button does not close non-modal overlays.
- **Unused packages:** `date-fns`, `dayjs`, `@gorhom/bottom-sheet`, `react-native-dotenv` are installed but not
  imported. Removing them changes `package-lock.json`, so it waits for the team's OK. `frontend/logo.bgless.png` and
  `frontend/applogo.bgless.png` are not referenced either.
- **Code shape:** `app/(tabs)/cart.tsx` is about 640 lines with three payment flows, and there are two payment-method
  models; phone-number checks and `initials()` exist in several copies; some storage keys are repeated as literals.
- **Performance left:** saving one product re-renders every card that shows a heart (`useSavedProducts`); the category
  page header animates its height on the JS thread; each product card runs its own delivery-time observer.
- **Dev server memory:** with the iOS app and web both connected, `npx expo start` runs out of memory (even with
  `NODE_OPTIONS=--max-old-space-size=8192`) after a dozen or so full web page loads, and has to be restarted. The
  cause was not found.
- **Lint:** 23 findings of React's "set state in an effect" rule and a few others remain in already-committed code;
  each needs its own behaviour check, so they were left. Three unused imports in `app/api/` were left because server
  routes are out of scope for UI work.

## Rules that still apply (from `CLAUDE.md` in the customer-app repo)

- API responses are contracts with the Partner app, Rider app and Master: only add optional fields, never rename or
  remove (`docs/MASTER_CONTRACT_V1.md`).
- Nothing reaches production from a development machine: no `ALLOW_REMOTE=1`, no service-role key in `.env`, no
  migrations on production. Those need the founder's approval.

## Open questions (for the founder / team)

1. Upload the three banner images to Storage and add their `ol_banners` rows?
2. Sign off the privacy notice change (the phone's map service as a recipient)?
3. Who provides the Android Google Maps key and the notification icon, and when is the next build?
4. Should the backend serve the Categories tree (and map merchant categories onto it), so live shops appear on the
   Categories tab?
5. Should the Master get a "spotlight / sponsored" flag for Home, and a "featured" flag for Discover reels?
6. Who will set a product's `origin` (local / national), and from where?
7. Can the old intro videos in Storage, and the four unused packages, be deleted?
8. Should the admin API grow endpoints for banners, categories, coupons and feature switches, so the Master edits them
   with the same checks and audit as listings instead of writing the tables directly?
