# Master ↔ One Local — contract v1 (27 Sep 2026)

How the Master portal (Proviyaa OS web app, `loki1514/Repo-1-`, `apps/web`) and One Local (this repo)
work together from a clean slate. Built from the founder's documents (NotebookLM, 27 Sep): **one
source of truth** — the marketplace shows the *same item rows* the POS uses ("Item Master"); each item
carries a channel switch; a super admin approves a vendor before it goes live; no app-to-app sync.
Decisions D6, D13, D14 in `PLATFORM_FOUNDATIONS.md` still hold.

## Who edits what

| What | Where it is edited | Table(s) | How One Local sees it |
| --- | --- | --- | --- |
| Organization (the business), its people and roles | Master `/admin/organizations`, `/admin/users` (exists) | `organizations`, `org_users`, `roles`, `org_invites` | via its listing |
| Outlets / branches | Master `/org/locations` (exists) | `locations` | listing points at one |
| Categories, items, prices, item photos | Merchant `/org/menu-items` (exists, uploads to the public `item-images` bucket) | `menu_categories`, `menu_items` (`image_url`), `menu_item_variants` | read directly — the same rows |
| "Live on One Local" per item | Merchant `/org/menu-items` (NEW toggle) | `item_channel_status` row with `channel = 'one_local'` | hidden while `is_available = false` and (`off_until` is null or in the future) |
| The marketplace listing (store page on One Local) — department, city, map point, delivery radius, logo, cover, approval | Master `/admin/one-latur` (NEW) → One Local admin API below | `ol_stores` (+ `ol_merchant_channels`) | shown only when `status = 'live'`, `organization_id` set, `deleted_at` null |
| Shoppers (One Local customers) — find, block | Master `/admin/one-latur/shoppers` (NEW) → admin API | Supabase Auth users | a blocked user cannot sign in |
| "Bring One Local to my town" demand | Master `/admin/one-latur/demand` (NEW) → admin API | `ol_support_requests` (`reference like 'launch:%'`) | — |

Item availability on One Local = `menu_items.is_available` AND not switched off for `one_local`
AND the listing is `live`. A new item is on by default (a row only exists once someone switches it off),
the same way the Swiggy/Zomato switches already work in this table.

## Database change (additive) — `0028_ol_marketplace_listings.sql`

Proposed to the OS ledger (Repo-1-). Not applied anywhere until the founder approves.

- `ol_stores`: `status text not null default 'live' check in ('draft','pending','live','paused')` (default
  keeps today's rows visible), `location_id uuid → locations(id) on delete set null`, `cover_image text`,
  `lat`, `lng double precision`, `delivery_radius_km numeric(5,2)`, `approved_by uuid → auth.users`,
  `approved_at timestamptz`; unique (organization_id, location_id) for live, non-deleted rows;
  index (city_id, status). Master-created rows always set `is_demo = false` explicitly.
- `ol_merchant_channels` keeps the pickup address and point (it already has `address`, `lat`, `lng`, `store_id`).

## One Local admin API — `/api/admin/*`

Every call: `Authorization: Bearer <Supabase access token>` of a signed-in user who has a row in
`platform_admins` (same Supabase project, so the Master's own session token works). Writes need
role `master_admin`, `onboarding_admin` or `operations`; reads allow any platform admin. `401` without a
token, `403` without the role. JSON errors keep the `{ "detail": "…" }` shape. Every write is logged
(who, what, when — no personal data in logs).

| Method + path | Body / query | Returns |
| --- | --- | --- |
| `GET /api/admin/me` | — | `{ user_id, email, full_name, role, can_write }` |
| `GET /api/admin/organizations` | `?q=` | `[{ id, name, slug, locations:[{id,name,city,address}], items, categories, listing: {id,status}\|null }]` |
| `GET /api/admin/listings` | `?status=&city=` | `[Listing]` |
| `POST /api/admin/listings` | `{ organization_id, location_id?, name, department: 'food'\|'grocery'\|'shops'\|'pharmacy'\|'beauty', city_id, tagline?, logo?, cover_image?, address, lat, lng, delivery_radius_km?, delivery_time? }` | `Listing` with `status: 'pending'`; also upserts `ol_merchant_channels` (address, lat, lng, store_id) |
| `PATCH /api/admin/listings/:id` | any editable field above | `Listing` |
| `POST /api/admin/listings/:id/status` | `{ status: 'live'\|'paused'\|'pending', reason? }` | `Listing` (going `live` sets `approved_by/at`; refused unless the organization has ≥ 1 available item) |
| `GET /api/admin/listings/:id/preview` | — | exactly what the app will show: store, categories, items live on One Local |
| `POST /api/admin/media/upload-url` | `{ folder: 'stores', filename, content_type }` | `{ upload_url, public_url }` — signed upload into the public `onecity-catalog` bucket (images ≤ 5 MB, jpeg/png/webp) |
| `GET /api/admin/shoppers` | `?q=` (email or phone) | `[{ id, email, phone, created_at, last_sign_in_at, orders, blocked }]` |
| `POST /api/admin/shoppers/:id/block` | `{ blocked: boolean, reason }` | `{ id, blocked }` (Supabase Auth ban; never deletes) |
| `GET /api/admin/demand` | — | `[{ place, requests, last_at }]` from launch requests |

`Listing` = `{ id, organization_id, organization_name, location_id, name, department, city_id, status,
tagline, logo, cover_image, address, lat, lng, delivery_radius_km, delivery_time, items_live, approved_at,
created_at, updated_at }`.

The Master calls these with `ONE_LOCAL_API_URL` (e.g. `http://localhost:8081` in development) and the
signed-in user's access token. CORS: the admin API allows the Master's origin(s) from
`MASTER_APP_URL` (already in One Local's `.env`).

## v1.1 (27 Sep 2026) — additions agreed while building both sides

Built in One Local (`frontend/server/admin.ts`, routes in `frontend/app/api/admin/`). Everything in v1
still holds; these are additions and exact rules.

1. **`GET /api/admin/listings/:id`** → one `Listing`.
2. **`Listing.location_name`**: the outlet's name, or `null`.
3. **Errors are `{ "detail": "…", "code": "…" }`**. `detail` is a sentence to show; `code` is stable:
   `not_signed_in`, `session_expired`, `not_platform_admin`, `read_only_role`, `origin_not_allowed`,
   `rate_limited` (with `Retry-After`), `invalid_request`, `reason_required`, `not_found`,
   `listing_exists`, `outlet_already_live`, `no_available_items`, `cannot_block_admin`,
   `cannot_block_staff`, `too_large`, `upload_used`, `migration_required`, `database_not_connected`,
   `upstream_error`, `server_error` (and, without a database, `dev_token_required`).
4. **Numbers are JSON numbers** (`lat`, `lng`, `delivery_radius_km`, `items_live`, `items`, `orders`,
   prices), never strings, although Postgres `numeric` arrives as a string.
5. **Pausing needs a reason**: `POST /listings/:id/status` with `status: 'paused'` and no non-empty
   `reason` → `400 reason_required`. Reasons are not stored or logged (the log records only that one
   was given).
6. **Paging**: `GET /listings` and `GET /shoppers` take `?page=` (1 = first, 50 per page, newest first)
   and send `X-Total-Count`. `GET /shoppers` without `q` is the 50 most recent accounts.
7. **Preview** is `{ store: Listing, categories: [{ id, name, items: [{ id, name, price, image,
   available_on_one_local, variants: [{ id, name, price }] }] }], items_live }`: every item of the
   organization's Item Master by menu category (`id` = `menu_categories.id`, or `uncategorized`), `price`
   = the default variant's price, else the item's own. Empty categories are left out.
8. **Media upload**: `POST /media/upload-url` (`size` in bytes may be sent; over 5 MB → `413`) returns
   `{ upload_url, public_url, path, method: 'PUT', headers: { 'Content-Type': <type>, 'x-upsert':
   'false' }, max_bytes, expires_in: 7200 }`. The client **PUTs the file body to `upload_url` with
   `Content-Type` set to the file's type and `x-upsert: false`**; the link is valid for **2 hours** and
   for one file. Then save `public_url` as `logo` or `cover_image`.
9. **CORS**: not needed by the Master (it calls server-side, without an `Origin` header). Browsers on a
   `MASTER_APP_URL` origin (and `http://localhost:*` outside production) are allowed; any other
   website gets `403 origin_not_allowed`.

## Exact rules in One Local's build (where v1 was silent or had to change)

- **Migration 0028 also adds `ol_stores.updated_at`** (+ the standard `set_updated_at` trigger): the
  `Listing` returns `updated_at` and `ol_stores` had no such column. The "one live listing per
  organization and outlet" index treats a listing without an outlet as its own outlet
  (`coalesce(location_id, <zero uuid>)`), so an organization cannot have two live outlet-less listings.
- **Before 0028 is applied** the listing endpoints answer `503 migration_required`; `me`,
  `organizations`, `shoppers`, block, `demand` and media work, and the app reads every existing store
  as live, as today.
- **Listing ids** are `org-<organization slug>` or `org-<slug>-<outlet code, else outlet name>`, with
  `-2`, `-3`… if taken. `POST /listings` answers `201`; `delivery_time` defaults to `30 min`.
- **One listing per organization and outlet**: a second one (any status) → `409 listing_exists`; going
  live while another listing of the same outlet is live → `409 outlet_already_live`.
- **Checks on listing fields**: department is one of the five; `city_id` must be a One Local city
  (`ol_service_areas`); `lat`/`lng` must be a point in India (catches swapped values); radius 0.5–50 km;
  images are `https` links (or `/api/media/<key>`); unknown fields and `status` are refused.
- **Pickup address**: kept in `ol_merchant_channels` (one row per organization). A new listing takes the
  row over (`accepting` stays `false` for a new row); an edit changes it only while it belongs to that
  listing. `Listing.address` falls back to the outlet's address.
- **"Available" item** = available in the POS, not switched off for `one_local`, and with a price above
  ₹0 (a ₹0 row is a POS placeholder). `items_live` counts these.
- **Blocking** also refuses **merchant staff** (an active `org_users` row, `409 cannot_block_staff`),
  not only platform admins: the same login opens the POS, so a ban would lock them out of work.
  Blocking needs a reason (3–300 characters). A ban stops new sign-ins and session refreshes; a
  session already open lasts until its access token expires (up to an hour).
- **`GET /organizations`** also returns `items_live` and `listings: [{ id, status, location_id }]` (an
  organization with several outlets can have several listings; `listing` is the live one, else the newest).

## How the app shows a live listing (no app change)

`frontend/server/marketplace.ts` maps each live listing and its organization's Item Master into the
shapes the app already renders, and `catalog.ts` puts them in front of the remaining demo rows (30 s cache,
cleared at once by admin writes on the same server):

- **store** = the listing (cover image first in the store gallery); **brand** = the organization, with
  the id of its first listing, so the brand page's "Store profile" opens that store;
- **products** = one per available item, or one per variant ("Chicken Biriyani · Half"), `price = mrp` =
  the POS price, image = the item photo (else the store logo), id `<listing id>_<menu item id>[_<variant id>]`;
- **categories** = the menu categories, merged by name within a department (`im-<department>-<name>`).

One line in the app changed: the home screen's "Meet your neighbourhood" rail also lists `org-…` stores.

## Development without a database

`npx expo start` with no Supabase settings runs the whole admin API in memory (two sample organizations,
"Mysore Dining Hall" with items and "Latur Fresh Mart" with none, and sample shoppers). Sign-in is replaced
by development tokens: `Authorization: Bearer dev-admin:<platform role>` (e.g. `dev-admin:master_admin`,
`dev-admin:sales_executive`) or `dev-user` (signed in, not an admin). Uploads go to this server
(`PUT /api/admin/media/dev/<name>`). Never available in production. Checks: `npx tsx scripts/admin-checks.ts`.
