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
