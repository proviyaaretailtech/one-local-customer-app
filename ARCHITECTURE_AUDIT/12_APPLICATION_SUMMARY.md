# 12 — APPLICATION SUMMARY (One Local / OL-ui)

Forensic extraction of THIS application only. Detail and evidence are in files 01–11. Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT** = migration not applied to production per `docs/JOURNAL.md`.

**APPLICATION:**
`OL-ui` repository, git branch `feat/expo-router-api` (audit date 2026-10-02). Contains three deployable pieces: (1) the customer app + its API server (`frontend/`, Expo Router; app display name "OneCity", also branded "One Latur" / "One Local"), (2) "VINII Partner", the restaurant order-accepting app (`partner/`), (3) database migrations and tooling (`db/`, `scripts/db.py`, `supabase/`). A legacy Python `backend/` (media + seed scripts) remains; `docs/` holds contracts and the development journal.

**PURPOSE:**
A hyperlocal commerce marketplace for the city of Latur (Maharashtra): customers order food from restaurants and shop groceries, shops, pharmacy and beauty items from local stores, pay by cash on delivery or online (Razorpay), and a rider pool is pinged to deliver. Restaurants run on the VINII POS (shared database) and accept One Local orders in the Partner app. Outside Latur the app offers a "discover" mode (nearby places, no ordering) and collects "launch here" demand.

**TECH STACK:**
Expo SDK 57 / React Native 0.86 / React 19, Expo Router (file routes + `app/api/**/+api.ts` server routes), TypeScript, TanStack Query, `@supabase/supabase-js` 2.116, AsyncStorage, `react-native-webview` (Razorpay Checkout), `expo-notifications`, iOS Live Activity/widget (Swift), `react-native-maps` / `@vis.gl/react-google-maps`, Playwright e2e. Partner app: Expo/React Native. Server logic: `frontend/server/*.ts`. Database: Supabase Postgres 17 (SQL migrations, PL/pgSQL RPCs). Legacy: Python/FastAPI scripts in `backend/`.

**DATABASE:**
Supabase project `ywylhzcxuoeilygzdonx` ("VinniPos", Mumbai) shared with the OS/Master and the POS; local dev project `onelocal-dev`. This repo owns the `ol_*` tables (23 tables incl. DRAFT, plus the view `ol_consent_current`) and 8 delivery tables (`riders`, `rider_store_links`, `rider_availability`, `push_tokens`, `org_dispatch_settings`, `delivery_jobs`, `delivery_assignments`, `delivery_events`) and 1 view `delivery_orders_needing_rider`. Reads/writes OS/POS tables (`organizations`, `org_users`, `roles`, `menu_*`, `item_channel_status`, `orders`, `order_items`, `order_events`, `kot_tickets`, `payments`, `platform_admins`, `locations`). All via service role; RLS ON with **no policies** on every `ol_*` table (see 06). Migrations 0021–0024 live (DOC-CLAIM); 0025 payments, 0026 checkouts, 0027 privacy, 0028 listings, 0029 dispatch are **DRAFT**; the server detects missing pieces and degrades (COD only, no checkout row, consents on phone, listing API 503, dispatch off).

**AUTH:**
Supabase Auth, one login for all apps. Customer: email+password, phone OTP, Google (PKCE) — **plus an anonymous device key** (`x-customer-key`) the server accepts for checkout; Partner: email+password then `org_users` membership + role; Rider: phone OTP + approved `riders` row; Master/admin: `platform_admins` row + CORS allow-list; service-to-service dispatch: bearer token + HMAC signature; Razorpay: webhook HMAC. Authorization is entirely in application code.

**PRIMARY USERS:**
Customers (shoppers) in Latur; restaurant staff (VINII Partner); riders (separate app, only dispatch API here); Proviyaa platform admins (Master console calling `/api/admin/*`); POS operators indirectly (shared tables); the founder/operations (journal, demand report).

**ORGANIZATION MODEL:**
OS `organizations` (uuid) own POS menus and staff (`org_users` + `roles`). One Local links an organization to a marketplace listing `ol_stores` (`organization_id`, optional `location_id`) approved by a platform admin (`status draft/pending/live/paused`; one live listing per organization+outlet). `ol_merchant_channels` holds one row per organization (accepting switch, accept window, prep time, pickup address). Orders and data are scoped by `organization_id` (merchant) and `city_id` (market) — but customer-checkout orders carry no `organization_id` (see Risks).

**LOCATION MODEL:**
`city_id text` (`latur`) via `ol_service_areas` (centre + radius; DB for coverage, **hard-coded constants for ordering/dispatch/rider checks**). Outlets are OS `locations` (uuid), referenced only by `ol_stores.location_id` (draft). Delivery points are lat/lng inside the address JSON; pickup point is `ol_stores.lat/lng` or `ol_merchant_channels.lat/lng`. Distance by haversine; no PostGIS, no zones. India-wide "discover" uses a bundled places file.

**ORDER MODEL:**
Customer side: a **checkout** (`ol_checkouts`, DRAFT) = one payment; **one `ol_orders` row per store** in the cart (food cart = one restaurant; shopping cart = many stores; the two never mix). Lines: jsonb `ol_orders.items` (read path) + `ol_order_items` (normalized, best effort). Status `placed → accepted → packed → out → delivered | cancelled` (`ol_orders.status`), advanced only by the Partner state machine `ol_partner_act` on POS-linked orders. Kitchen side: POS `orders` (`new → sent_to_kitchen → ready → delivered | cancelled`), `kot_tickets`, `order_events`. Two creation paths exist and are not joined: customer checkout (no POS order) vs `ol_create_restaurant_order` (POS-linked, used only by the Partner test order). IDs are uuids generated in the server (`crypto.randomUUID()`); idempotency via `Idempotency-Key` + unique index.

**PAYMENT MODEL:**
Cash on delivery (default) or Razorpay (UPI/card/netbanking/wallet/pay-later; EMI reported back). One Razorpay order per checkout for the server-computed total; payment state lives on `ol_checkouts` and is copied by trigger to its orders (DRAFT 0026; before it, online is disabled). Confirmation by app `verify` (signature) and by webhook (source of truth); webhook log `ol_payment_events`; refunds recorded when Razorpay reports them (`ol_refunds`); an internal refund function exists but nothing calls it. POS cash is recorded in POS `payments` only when staff mark a POS-linked order delivered. No wallet, coins, invoices; COD collection for non-POS orders is not recorded.

**INVENTORY MODEL:**
None (no stock quantities, no decrement). Availability flags only: `menu_items.is_available`, per-channel switch `item_channel_status` (`channel='one_local'`, `off_until`) edited in the Partner app, `ol_products.is_available` (demo). Catalogue cached 30 s.

**DELIVERY MODEL:**
Own rider pool (DRAFT 0029): a `delivery_jobs` row per successful order (COD at placement; online when paid), offered to one rider at a time (default 30 s, 3 rounds, 8 km, linked/nearest/fewest-jobs-today), first accept wins (database-enforced), escalation to the restaurant when no taker; sweep + heartbeats drive timeouts; rider privacy rules; delivery code derived from the order but never shown or verified (INFERRED unfinished). Job states after `assigned` belong to the rider app (not in repo). Customer tracking screen is a **client-side timer** with "Sample rider". The restaurant's own "out/delivered" staff buttons are an independent status path.

**OFFLINE MODEL:**
No offline support. AsyncStorage only (cart, profile/addresses, device key, consents, wishlist). No SQLite, outbox, queue or sync. Retries are manual or idempotent re-sends; server-side idempotency and optimistic version checks prevent duplicates.

**MAIN TABLES:**
`ol_orders`, `ol_checkouts` (DRAFT), `ol_order_items`, `ol_refunds`, `ol_payment_events` (DRAFT), `ol_stores`, `ol_products` (demo), `ol_merchant_channels`, `ol_partner_devices`, `ol_coupons`, `ol_service_areas`, `ol_categories`, `ol_brands`, `ol_banners`, `ol_reels`, `ol_events`, `ol_themed_stores`, `ol_discover_chips`, `ol_booking_enquiries`, `ol_support_requests`, `ol_consents` / `ol_privacy_requests` (DRAFT), delivery tables (DRAFT); borrowed: `organizations`, `locations`, `org_users`, `roles`, `platform_admins`, `menu_categories`, `menu_items`, `menu_item_variants`, `item_channel_status`, `orders`, `order_items`, `order_events`, `kot_tickets`, `payments`, `org_counters`, `auth.users`.

**MAIN APIs:**
Customer: `POST /api/cart/quote`, `POST /api/checkouts`, `GET /api/orders[/:id]`, `GET /api/checkouts/:id`, `POST /api/payments/order|verify|cod|webhook`, `GET /api/catalog|stores|products|coverage|nearby|places/*`, privacy `/api/privacy/*`. Partner: `/api/partner/me|orders|orders/:id/{accept,reject,ready,out,delivered}|outlet|items|devices|test-order`. Rider: `/api/rider/availability|heartbeat|push-token|offers/current|offers/:id/{accept,decline}|jobs/*`. Service: `/api/dispatch/jobs[...]|sweep`. Master: `/api/admin/me|organizations|listings[...]|shoppers[...]|media/upload-url|demand`. RPCs: `ol_create_restaurant_order`, `ol_partner_act`, `ol_expire_unanswered`, `ol_process_refund`, `dispatch_create_job|release|offer_next|answer|cancel|due_jobs`, `next_org_seq`.

**MAIN EVENTS:**
No realtime, queue, DB webhook or edge function. Event sources: `delivery_events` outbox (`delivery.created|released|offered|timed_out|no_rider|assigned|rejected|cancelled`), POS `order_events` (`placed, accepted, kot_fired, rejected, kot_ready, out_for_delivery, delivered, paid, timed_out`), Razorpay webhooks (`payment.captured, order.paid, payment.failed, refund.processed`), Expo push (`new_order, no_rider, job_offer, job_assigned, job_cancelled`), DB trigger `ol_checkouts_payment_to_orders`. Polling: Partner 5 s/10 s, rider heartbeat 30 s, dispatch sweep (caller UNKNOWN).

**SOURCE-OF-TRUTH ENTITIES:**
Identity: Supabase `auth.users`. Merchant, outlet, staff, menu, kitchen order, KOT, POS payment: OS/POS tables. Customer order, checkout and payment state, listing, merchant channel, coupon, service area, refund ledger, consent, privacy request: One Local `ol_*`. Delivery job, offers, rider presence, delivery events: 0029 tables (rider app owns later states). Money: Razorpay.

**KNOWN DUPLICATIONS:**
`ol_orders` vs POS `orders` (by design, but unlinked for customer checkouts); `ol_orders.items` vs `ol_order_items`; payment fields on `ol_checkouts` and `ol_orders`; `ol_products` vs POS items projected into products; `ol_merchant_channels` vs POS `channel_integrations`; pickup point in `ol_stores` and `ol_merchant_channels`; `ol_partner_devices` vs `push_tokens`; `ol_service_areas` vs hard-coded city constants; fee/GST rules in TypeScript, SQL and (ignored) POS bill settings; three order-number formats sharing the `OL-` prefix; four competing order-progress sources; `ol_support_requests` used for three purposes. Full list in 10.

**KNOWN RISKS:**
1. Customer food orders never reach the restaurant/POS (no `organization_id` / `pos_order_id`; Partner app lists only org-linked orders) — journal agrees.
2. `ol_order_items` insert likely fails for marketplace products (FK to `ol_products`) — INFERRED; refunds and analytics rely on it.
3. `ol_orders.status` never advances for customer-checkout orders; COD never marked collected; tracking is simulated.
4. Dispatch: depends on unapplied 0029 and secrets, on an unknown scheduler, and stops at `assigned`; delivery code unused; cash on delivery is tracked on `delivery_jobs` but not reconciled.
5. Service-role key for all access, RLS gives no backstop; per-process rate limiting; server accepts device-only checkouts.
6. Non-atomic checkout (checkout row, orders, lines, dispatch are separate calls); a restaurant order timeout needs Partner polling.
7. Five migrations are drafts with placeholder numbers; possible collision with the OS ledger / rider app's `riders` table.
8. No coupon redemption tracking; no customer cancel/refund request flow; refund RPC has no caller.
9. Stale docs: `CENTRAL_DB_MAP.md` pre-dates 0021.
10. DPDP: POS keeps its own copy of customer name/phone outside erasure reach (journal).

**UNKNOWN AREAS:**
Live production schema/rows/policies for OS/POS tables; deployed hosting and who runs the dispatch sweep; rider-app behaviour after assignment; POS-side consumption of One Local orders and existence of `pos_*` functions in production; Master's actual use of `/api/admin/*`; Auth provider settings (SMS/Google); exact production state of migrations 0025–0029. Full list in 11.
