# 06 — RLS and SECURITY (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT** = not applied to production per `docs/JOURNAL.md`.

## 0. Security model in one paragraph

Every One Local table has **Row Level Security enabled with zero policies**, and `anon` / `authenticated` have **no grants**. Only the Postgres role `service_role` can read or write. The apps never connect to the database; they call the Expo API routes, which connect with the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`, `frontend/server/db.ts`) — and the service role **bypasses RLS entirely**. So **all authorization (organization, user, location scoping) lives in application code**, not in the database. Policies are absent by design: "One Local's server (service role) can read or write these tables" (header of `0021`).

## 1. Per-table RLS (tables defined by this repo)

All of the following: **RLS ENABLED = yes; SELECT / INSERT / UPDATE / DELETE policies = none (no policy of any kind is created by any migration); anon = no access; authenticated = no access; service_role = `SELECT, INSERT, UPDATE, DELETE`** (granted explicitly in 0021 / 0022 / 0024 / 0025 / 0026 / 0029). Exceptions are noted.

| Table | Migration | Notes |
|---|---|---|
| `ol_service_areas, ol_categories, ol_brands, ol_stores, ol_products, ol_banners, ol_discover_chips, ol_coupons, ol_events, ol_reels, ol_themed_stores, ol_media_assets` | 0021 | Public catalogue data, but **not** readable by `anon`; the customer app reads it through `GET /api/catalog` etc. |
| `ol_orders, ol_booking_enquiries, ol_support_requests` | 0021 | Contain personal data; same lock |
| `ol_merchant_channels, ol_partner_devices` | 0022 | |
| `ol_order_items, ol_refunds` | 0024 | |
| `ol_payment_events` | 0025 | |
| `ol_checkouts` | 0026 DRAFT | |
| `ol_consents` | 0027 DRAFT | grant is `select, insert, delete` only (no `update`) — "delete only passes the purge guard" trigger |
| `ol_privacy_requests` | 0027 DRAFT | `select, insert, update, delete` |
| `ol_consent_current` (view) | 0027 DRAFT | `security_invoker = true`; `revoke all` from anon/authenticated; `grant select` to service_role |
| `riders, rider_store_links, rider_availability, push_tokens, org_dispatch_settings, delivery_jobs, delivery_assignments, delivery_events` | 0029 DRAFT | `delivery_events_id_seq`: `usage, select` to service_role |
| `delivery_orders_needing_rider` (view) | 0029 DRAFT | `revoke all` from anon/authenticated; `grant select` to service_role. Created without `security_invoker` (view owner semantics) — runs with the privileges of the view owner; access is controlled only by the revoke |

Functions: every `ol_*` and `dispatch_*` function: `revoke all … from public, anon, authenticated; grant execute … to service_role`. They are `SECURITY INVOKER` (not definer), so they run as the caller (service role).

Storage: bucket `onecity-catalog` is `public = true` (anyone can read objects by URL). Storage policies for writes: **none defined in this repo** (UNKNOWN what Supabase's `storage.objects` policies are in production); writes in the app happen only through service-role–generated signed upload URLs.

## 2. OS / POS tables (owned elsewhere) — what is verifiable

| Table | RLS | Policies |
|---|---|---|
| `organizations, roles, org_users, org_counters, menu_categories, menu_items, item_channel_status, channel_integrations, orders, order_items, order_events, kot_tickets, payments, schema_migrations` | `db/local/0000_os_replica.sql` enables RLS and grants all to service_role **on the local replica only** | **UNKNOWN in this repo.** The replica has no `CREATE POLICY`. `docs/CENTRAL_DB_MAP.md` (production snapshot 2026-09-22) reports policy **counts** only: organizations 5, org_users 5, menu_items 5, orders 5, order_items 5, kot_tickets 5, order_events 4, payments 4, item_channel_status 4, channel_integrations 4, platform_admins 1, `locations` 1, `menu_item_variants` 4; 140 policies total; RLS on for all except `schema_migrations`. Conditions are not recorded |
| `platform_admins`, `locations`, `menu_item_variants` | not in the replica | UNKNOWN |

Journal warnings relevant to POS tables (not verifiable here): "The Master's web POS can change a kitchen ticket without checking which restaurant it belongs to" and "The Windows POS has a draft table open to anyone" (`docs/JOURNAL.md`, 2026-09-28) — both outside this repo.

The first-draft `ol_*` tables in the 2026-09-22 snapshot had 1 policy each (`ol_banners` etc.); 0021 drops and recreates them without policies.

## 3. Application-level authorization (what actually scopes data)

| Layer | Code | Rule |
|---|---|---|
| Customer identity | `auth.ts caller()` | `owner = sha256("user:"+userId)` if a valid Supabase JWT (`GET {SUPABASE_URL}/auth/v1/user`, result cached 60 s; failures 10 s) else `sha256(x-customer-key)`. `matches` = [user hash, device hash]. All order reads filter `customer_hash IN matches` |
| Customer write | `store.ts requireCustomer` | requires `owner` (device key **or** login). The server does **not** require sign-in for checkout; the app does |
| Customer privacy routes | `privacy.ts person()` | login required (`401` otherwise); limit per account tag |
| Partner (restaurant) | `partner.ts requirePartnerAuth` | JWT → `org_users` row with `status='active'` (earliest membership if several); org id from `organizations`; roles → actions map `CAN` (`accept/reject/outlet/items/ready/out/delivered`). All Partner queries filter `organization_id = staff.organizationId`; `act()` re-reads `orders.organization_id` before calling the RPC. **The RPC `ol_partner_act` itself does not check organization** (it is service-role only; the check is in `restaurant.ts`) |
| Rider | `rider.ts requireRider` | JWT → `riders` row with `status='approved'`; `suspended`/other statuses refused. Rider reads `delivery_jobs` filtered by `rider_id = me`; offer answer function checks `p_rider` owns the assignment |
| Platform admin | `admin.ts requireAdmin` | JWT → `platform_admins` row (cached 30 s); write roles `master_admin, onboarding_admin, operations`; 60 writes / 240 reads per minute per admin; origin allow-list (`MASTER_APP_URL`, localhost outside production); dev tokens `dev-admin:<role>` only without a database and never in production |
| Dispatch service | `dispatch.ts serviceRequest` | bearer `DISPATCH_SERVICE_TOKEN` (constant-time compare via HMAC) + `x-timestamp` within ±5 min + `x-signature` = HMAC-SHA256(`DISPATCH_SIGNING_SECRET`, `timestamp.rawBody`) + `x-request-id` + `Idempotency-Key` on writes; optional `DISPATCH_ALLOWED_ORGS` (`*` = also stores without a merchant). A user's JWT is not accepted |
| Razorpay | `payments.ts` | webhook HMAC with `RAZORPAY_WEBHOOK_SECRET`; verify HMAC with `RAZORPAY_KEY_SECRET`; amounts recomputed server-side; the checkout page requires the owner's headers |
| Rider privacy | `dispatch.ts riderJob` | address, phone and exact drop point revealed only by status (area ~1 km rounded before pickup; customer phone only while job live; delivery address after `picked_up`) |
| Partner privacy | `restaurant.ts shape` | customer first name only; phone and full address only while status in `accepted, packed, out` |

## 4. Secrets and environment (names only; no values read)

Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `DISPATCH_SERVICE_TOKEN`, `DISPATCH_SIGNING_SECRET`, `DISPATCH_OTP_SECRET`, `DISPATCH_ALLOWED_ORGS`, `GOOGLE_MAPS_API_KEY`, `MASTER_APP_URL`, `PRIVACY_HARD_DELETE`, `NEARBY_SOURCE`, `FEATURE_<NAME>`, `ANTHROPIC_API_KEY/OPENAI_API_KEY/EMERGENT_LLM_KEY` (flag only). Client-shipped (`app.config.ts extra`): `backendUrl`, `supabaseUrl`, `supabaseAnonKey` (publishable), `googleMapsBrowserKey`. `scripts/db.py` reads `SUPABASE_ACCESS_TOKEN` (Management API, read-only commands). `.env` is git-ignored; `frontend/.env.local` / `partner/.env.local` point development at the local Supabase.

## 5. Security observations (verified facts, not fixes)

1. **Service role everywhere.** One key can read/write every table; a bug in an application-level filter is a data leak with no database backstop.
2. **Checkout without login is accepted by the server** (device key only). Orders so created have `user_id NULL`; delivery job creation then has no customer name/phone (`createJobForOrder` reads them only when `o.user_id`).
3. **Banned/blocked users:** `blockShopper` sets a Supabase Auth ban. The server accepts an access token that Supabase already validated for up to 60 s (cache in `auth.ts`); refresh stops. (INFERRED duration of exposure.)
4. **Rate limits are per process** (`http.ts limit`), not shared; `limit()` buckets reset on restart.
5. **Admin dev tokens** (`dev-admin:*`) exist in code; guarded by `dbConfigured()` false and `NODE_ENV !== 'production'`.
6. `ol_partner_act` trusts its caller for organization scoping (service role only); the same for `ol_process_refund` (no actor/role check in SQL; also no caller).
7. `ol_orders.delivery_address` (name/phone not included; text + lat/lng) is returned to the owner and to riders after pickup; erasure nulls it.
8. **Public bucket** `onecity-catalog` (catalogue and store images only).
9. `ol_consents.user_id`, `ol_privacy_requests.user_id` have **no FK** by design, so evidence survives deleting the login.
10. The partner `PATCH /api/partner/outlet` reads `await request.json()` directly (not the size-limited `readBody`), unlike the other routes.
11. `.emergent/cron/webhook_crond.sh` reads `WEBHOOK_CRON_SECRET` from `/app/backend/.env` (deployment-pod mechanism; separate from the app's own secrets).
