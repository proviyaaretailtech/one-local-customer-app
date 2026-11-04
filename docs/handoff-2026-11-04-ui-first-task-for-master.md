# Hand-off for the Master's Claude: customer app branch `ui/first-task` (2026-11-04)

From Veeraj's session on the One Local **customer app** (`proviyaaretailtech/one-local-customer-app`, folder `frontend/`).
Read this before changing anything in the Master that feeds the customer app.

## Status

- Branch `ui/first-task`, pushed, **not merged** (Lohitaksha merges into `feat/expo-router-api`). Base: `bc55f82`.
- Five commits: dummy sample data → UI revamp + smooth screen switching → new launch intro → `CLAUDE.md` + `docs/UI_REVAMP.md` → journal entry (`docs/JOURNAL.md`, 2026-11-04).
- Checked on web and the iOS simulator. Not tested on Android; e2e suite not run.

## What did NOT change (safe for the Master)

- **No server code, API route, contract or database change.** `frontend/server/**` (except sample data), `frontend/app/api/**`, `db/`, `supabase/`, `docs/MASTER_CONTRACT_V1.md` and the other contracts are untouched. `/api/admin/*` behaves exactly as before.
- No `app.json`, native config, package or environment change.
- The customer profile gained a field (`origin`, below), but the profile lives only on the device (AsyncStorage), so no server shape changed.

## How the Master's listing fields now show in the customer app

The app reads stores from `GET /stores` / `GET /catalog`; for live listings these come from `storeOf()` in `frontend/server/marketplace.ts`.

| Listing field (Master `/admin/one-latur`) | Where the redesigned app uses it |
| --- | --- |
| `department` | `'food'` → the store opens as a **restaurant menu page** (`src/components/restaurant-view.tsx`: hero photo, dish sections, menu popover). Any other department → the **shop page** (pop-art banner, category tiles, item grid). Food-department items also fill the Food tab's restaurant cards. A listing with no department becomes `'shops'` on the server. |
| `cover_image` | Becomes the store's first `media` image, which is the **banner** on the shop page (`storeBanner()` in `src/api.ts`: first image, else a video's thumbnail) and the hero on the restaurant page. No cover → the shop page shows a plain coloured block. |
| `logo` | The shop sign, shop-picker cards, Home shop cards, restaurant cards. |
| `name`, `tagline`, `delivery_time` | Shop/restaurant headers and cards (`delivery_time` shown as minutes). |
| `rating` (server default 4.5) | Home lists **every shop sorted by rating**; also shown on cards. |
| Item `image_url`, `discount_pct` | Product cards everywhere; a restaurant card's offer tag is the highest `discount_pct` among its items; its photo strip is its dishes' images. |
| Item category | The shop page's category tiles and the category page's sidebar group a store's items by `category_id`. |

Each shop gets a colour picked from its store id (`nameTints` in `src/theme.ts`); there is nothing to set for it.

## Things still wired to sample-data ids (live listings will not appear there yet)

These are good candidates for Master-side features. Today they only work with the sample catalogue:

1. **Categories tab** (`src/shop-categories.ts`, `CATEGORY_GROUPS`): 6 groups × 4 sub-categories, each mapped to a **sample category id** (`c1`–`c38`). A sub-category opens a shop picker (`/category/shops/[id]`) listing stores that have items in that category id. Live merchant categories (from `menu_categories`) have other ids, so live items do not show under these tiles. The code comment says: "Until the server serves this tree…". A canonical category tree served by the backend, with merchant categories mapped onto it (an admin job), would fix this.
2. **Home "In spotlight"** (`app/(tabs)/index.tsx`, `SPOTLIGHT`): 12 hard-coded sample product ids, labelled "Sponsored picks". A sponsored/spotlight flag set in the Master would replace this.
3. **Discover's featured reels** (shown full screen the first time Discover opens each day, per account): today "featured" simply means every reel that has a video.

## New optional fields the app understands

- `Product.origin?: 'local' | 'national'` (`src/api.ts`, `src/origin.ts`). Home has a Local/National switch saved in the device profile. A product **without** `origin` shows in both modes, so nothing disappears. **No server or Master sets `origin` yet.** If the Master adds it, it must be an optional, additive field in the API (contract rule: only add optional fields).
- `Store.department?: string`: the client type only; the server already sends it.

## Sample data (`frontend/server/data/catalog.json`)

- Added for UI work: **335 dummy products** (60 restaurant dishes), **10 dummy restaurants** (`dummy-tandoor-tales`, `dummy-biryani-bazaar`, `dummy-chai-stop`, `dummy-dosa-corner`, `dummy-wok-and-roll`, `dummy-cake-studio`, `dummy-shawarma-street`, `dummy-pizza-point`, `dummy-burger-barn`, `dummy-green-bowl`; all `department: 'food'`), and **9 categories**: `c33` Meat & Seafood, `c34` Masalas & Spices, `c35` Ice Cream & Frozen, `c38` Imported Picks (grocery); `c36` Stationery, `c37` Kids & Toys (shops); `c39` Thalis & Meals, `c40` Street Food, `c41` Desserts (food).
- Every added row has a `dummy-` id and `"dummy": true`. Only additions; nothing existing changed.
- This file is used only when the server runs **without a database** (no `.env`). **But** `frontend/scripts/seed-catalog.mjs` upserts this whole file into the `ol_*` tables as `is_demo = true` rows; the `dummy` flag is not a column, and the dummy restaurants would arrive with `department = 'food'`. The script is local-only unless `ALLOW_REMOTE=1`. **Do not seed a shared or production database from this branch** without removing the dummy rows first; they must come out before real listings go in.
- `frontend/server/data/media.json` is a local-only change on Veeraj's machine and is **not** in the branch.

## Storage

- The launch intro is now drawn in code (`src/components/intro-splash.tsx`). The old videos in the public `onecity-catalog` bucket, `app/intro/intro-720.mp4` and `app/intro/intro-1080.mp4`, are **no longer used**. Deleting them waits for the founder's OK.

## Customer-app routes added or changed (for any deep links from the Master)

- `/category/shops/[categoryId]`: new shop picker for a category.
- `/category/[categoryId]?store=<storeId>`: a category scoped to one shop (banner "You're shopping at…", sidebar = that shop's categories). Without `store` it behaves as before.
- `/store/[id]`: same route; renders the restaurant page when the store's department is `food`.
- Book It options and "Book an appointment" all answer "coming soon" for now.

## Rules that still apply (from `CLAUDE.md` in the customer-app repo)

- API responses are contracts with the Partner app, Rider app and Master: only add optional fields, never rename or remove (`docs/MASTER_CONTRACT_V1.md`).
- Nothing reaches production from a development machine: no `ALLOW_REMOTE=1`, no service-role key in `.env`, no migrations on production. Those need the founder's approval.

## Open questions (for the founder / team)

1. Should the backend serve the Categories tree (and map merchant categories onto it), so live shops appear on the Categories tab?
2. Should the Master get a "spotlight / sponsored" flag for Home, and a "featured" flag for Discover reels?
3. Who will set a product's `origin` (local / national), and from where?
4. Can the old intro videos in Storage be deleted?
