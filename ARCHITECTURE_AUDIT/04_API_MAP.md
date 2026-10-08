# 04 — API MAP and DATABASE OPERATIONS (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT** = table/function from a migration not applied to production per `docs/JOURNAL.md`.

## 0. How the API is built

- Expo Router API routes in `frontend/app/api/**/+api.ts` (one file per route/method); each is a thin wrapper around a function in `frontend/server/*.ts`. Customer and Partner apps (`frontend/`, `partner/`) call the same server; the Partner app uses the `/api/partner/*` prefix.
- There is **no Edge Function, no Supabase Database Webhook, no direct SQL from app code, and the apps never call `supabase.from(...)`** — `grep` finds `supabase.auth.*` only in the client (sign-in). All reads/writes go through `db()` in `frontend/server/db.ts` = `@supabase/supabase-js` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role; bypasses RLS).
- Every state-changing multi-table operation is an RPC (Postgres function). Errors are `OL_*` exceptions mapped to HTTP status by `db.ts fromDbError` (`OL_BAD_REQUEST/BAD_QTY/EMPTY 400`, `NOT_FOUND/NOT_ONE_LOCAL 404`, `NOT_ACCEPTING/ITEM_UNAVAILABLE/STALE/WRONG_STATE/EXPIRED/NOT_DELIVERABLE/PICKED_UP/TAKEN 409`, `OL_GONE 410`) plus a machine `code` for the dispatch/rider APIs.
- Without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` the server runs in an **in-memory fallback** (`store.ts`, `privacy.ts`, `marketplace.ts` memory, `catalog.json`), used by `expo start` for UI work.
- Auth schemes: **(C)** customer: `x-customer-key` header (device) and optional Supabase JWT (`auth.ts caller()`); **(P)** partner staff: Supabase JWT + `org_users` row (`partner.ts requirePartnerAuth`); **(R)** rider: JWT + approved `riders` row (`rider.ts requireRider`); **(A)** platform admin: JWT + `platform_admins` row (`admin.ts requireAdmin`); **(S)** service: bearer `DISPATCH_SERVICE_TOKEN` + `x-timestamp` + `x-signature` HMAC + `x-request-id` (`dispatch.ts serviceRequest`); **(W)** Razorpay webhook signature; **(–)** none.
- City scoping: `resolveCity` reads `?city=` or `x-city` (default `latur`); `404` if not in `ACTIVE_CITIES` (hardcoded `{latur}`).
- Rate limiting: in-process memory (`http.ts limit`), resets on restart, not shared across servers.

## 1. Route table

| Method + path | Auth | Handler | Tables / RPCs / external | Notes |
|---|---|---|---|---|
| **Catalogue (reads)** | | | | |
| GET `/api/catalog` | – | `catalog.ts getCatalog` | `ol_categories, ol_brands, ol_stores, ol_products(is_available), ol_banners, ol_discover_chips, ol_coupons(active), ol_events, ol_themed_stores, ol_reels`; plus `organizations, menu_categories, menu_items, menu_item_variants, item_channel_status(channel='one_local')` via `marketplace.ts readItemMaster` for live listings | 30 s in-memory cache; invalidated by admin writes |
| GET `/api/categories`, `/api/banners`, `/api/discover`, `/api/events`, `/api/reels`, `/api/coupons` | – | same cache | as above | |
| GET `/api/products`, `/api/products/:id`, `/api/products/:id/story`, `/api/products/buy-again` | – | `catalog.ts filterProducts / findProduct` | cache | `buy-again` is a hard-coded sample id list `p4,p6,p8,p11,p16` |
| GET `/api/stores`, `/api/stores/:id`, `/api/stores/:id/products` | – | cache | cache | |
| GET `/api/media/:id` | – | `media.ts serveMedia` | `data/media.json` (key → Storage URL, 302); dev: local `backend/.media_build` | |
| GET `/api/health`, `/api` | – | static | – | |
| GET `/api/features` | – | `features.ts` | env only | flags `ai_search, assistant, maps, online_payments, wallet, coins, google_sign_in` |
| **Location** | | | | |
| GET `/api/serviceability?lat&lng` | – | `catalog.ts serviceability` | constant `SERVICE_AREAS` | |
| GET `/api/coverage?lat&lng` | – | `coverage.ts` | `ol_service_areas` (60 s cache) + `geo.ts` India places file | levels `live|discover|soon` |
| GET `/api/nearby?lat&lng` | – | `nearby.ts` | Google Places (New) or Overpass (OSM) | limit 20/min |
| GET `/api/places/autocomplete`, `/api/places/:id`, `/api/geocode/reverse` | – | `maps.ts` | Google Places / Geocoding | needs `GOOGLE_MAPS_API_KEY` |
| GET `/api/india/popular`, `/api/india/search`, `/api/india/states[/:state[/:district]]` | – | `geo.ts` | bundled `data/india-places.tsv.gz` | |
| **Cart and checkout** | | | | |
| POST `/api/cart/quote` | (C) optional | `pricing.ts quote` | cache reads only | limit 120/min |
| POST `/api/coupons/apply` | – | `catalog.ts applyCoupon` | cache | limit 10/min |
| POST `/api/checkouts` | (C) | `store.ts createCheckout` | `ol_checkouts` INSERT (0026), `ol_orders` INSERT, `ol_order_items` INSERT; reads `ol_checkouts`/`ol_orders` for idempotency; then `dispatch.ts dispatchOrders` | header `Idempotency-Key`; limit 5/60 s per customer |
| GET `/api/checkouts/:id` | (C) | `store.ts getCheckout` | `ol_checkouts`, `ol_orders` | owner only (`customer_hash IN matches`) |
| POST `/api/orders` | (C) | `store.ts createOrder` | as `/checkouts`, returns first order | legacy for older app versions |
| GET `/api/orders` | (C) | `store.ts listOrders` | `ol_orders` (`customer_hash IN matches`, `payment_status NOT IN (pending,failed)`, 200 newest) | |
| GET `/api/orders/:id` | (C) | `store.ts getOrder` | `ol_orders` | |
| POST `/api/booking-enquiries` | (C) optional | `store.ts createEnquiry` | `ol_booking_enquiries` INSERT | validates event/slot/date (≤30 days)/phone regex; limit 5/h |
| POST `/api/support-requests` | (C) optional | `store.ts createSupportRequest` | `ol_support_requests` INSERT | limit 5/h |
| POST `/api/launch-requests` | (C) optional | `store.ts createLaunchRequest` | `ol_support_requests` INSERT (`topic 'other'`, `reference 'launch:<place id>'`) | limit 3/day |
| **Payments (Razorpay)** | | | | |
| POST `/api/payments/order` | (C) | `payments.ts startPayment` | `createCheckout(online)` writes (above); `ol_checkouts` UPDATE `razorpay_order_id`; **Razorpay** `POST /v1/orders` | 503 if no keys / 0026 not applied |
| POST `/api/payments/verify` | (C) | `payments.ts verifyPayment` | `ol_checkouts` UPDATE (→ `paid`), trigger → `ol_orders`; Razorpay `GET /v1/payments/:id`; then `dispatchOrders` | HMAC verification |
| POST `/api/payments/cod` | (C) | `payments.ts switchToCash` | `ol_checkouts` UPDATE (→ `cod`/`not_charged`); `dispatchOrders` | |
| POST `/api/payments/webhook` | (W) | `payments.ts handleWebhook` | `ol_payment_events` SELECT/INSERT; `ol_checkouts` UPDATE; `ol_refunds` INSERT/UPDATE; `ol_orders` UPDATE (`payment_status`); `dispatchOrders` | events `payment.captured, order.paid, payment.failed, refund.processed` |
| GET `/api/payments/checkout-page` | (C) | `payments.ts checkoutPage` | `ol_checkouts` (read) | Returns an HTML page that loads `https://checkout.razorpay.com/v1/checkout.js` inside the app's WebView |
| **Privacy (DPDP)** | | | | |
| GET `/api/privacy/export` | (C) signed-in | `privacy.ts exportMyData` | `ol_orders, ol_support_requests, ol_booking_enquiries, ol_refunds, ol_checkouts?, ol_consents?, ol_privacy_requests?`; Supabase `auth/v1/user`; writes `ol_privacy_requests` INSERT (kind export) | limit 5/h |
| GET/POST `/api/privacy/consents` | (C) signed-in | `recordConsents`, `currentConsents` | `ol_consents` INSERT/SELECT (0027 DRAFT; else "phone only") | |
| POST `/api/privacy/erasure` | (C) signed-in | `requestErasure` | UPDATE `ol_orders` (address NULL, user_id NULL, `customer_hash = erased:<uuid>`, key NULL), UPDATE `ol_checkouts`, UPDATE `ol_refunds.requested_by`, DELETE `ol_booking_enquiries`, UPDATE `ol_support_requests` (message erased), INSERT `ol_consents` (optional ones withdrawn), `ol_privacy_requests` INSERT/UPDATE; Supabase `auth/v1/logout?scope=global` or `auth.admin.deleteUser` (only if `PRIVACY_HARD_DELETE=on` and no other membership in `org_users, riders, platform_admins`) | refused (409) while an order placed in the last 24 h is still open |
| POST `/api/privacy/grievances`, `/api/privacy/nominee` | (C) signed-in | `raiseGrievance`, `nominate` | `ol_privacy_requests` INSERT (0027) or `ol_support_requests` (`reference 'privacy:<ref>'`) | |
| **VINII Partner (restaurant staff)** | | | | |
| GET `/api/partner/me` | (P) | `partner.ts` + `restaurant.ts getOutlet` | `org_users` (+ `roles`, `organizations` joins), `ol_merchant_channels` | |
| GET `/api/partner/orders?tab=new|preparing|ready|past` | (P) | `restaurant.ts listOrders` | RPC `ol_expire_unanswered`; SELECT `ol_orders` ⨝ `orders` ⨝ `order_items` filtered by `organization_id` | tab→status: new=`placed`, preparing=`accepted`, ready=`packed,out`, past=`delivered,cancelled` (3 days, 50) |
| GET `/api/partner/orders/:id` | (P) | `restaurant.ts getOrder` | `ol_orders` ⨝ POS, `order_events` | `:id` is the **POS order id** |
| POST `/api/partner/orders/:id/accept | reject | ready | out | delivered` | (P) with role action check | `restaurant.ts act` | SELECT `orders.organization_id` (ownership); RPC `ol_partner_act`; then `dispatch.ts onRestaurantAccepted/Rejected` | body `{version = orders.updated_at, prep_minutes | reason}` |
| PATCH `/api/partner/outlet` | (P) | `restaurant.ts setOutlet` | UPDATE `ol_merchant_channels` (`accepting`, `back_at`, `missed_in_a_row=0`, `updated_by`) | |
| GET `/api/partner/items`; PATCH `/api/partner/items/:id` | (P) | `listItems`, `setItem` | SELECT `menu_categories, menu_items, item_channel_status`; UPSERT `item_channel_status` (`channel 'one_local'`; `onConflict organization_id,menu_item_id,channel`, fallback update-then-insert) | |
| PUT `/api/partner/devices` | (P) | `registerDevice` | UPSERT `ol_partner_devices` on `expo_push_token` | |
| POST `/api/partner/test-order` | (P) | `createTestOrder` | RPC `ol_create_restaurant_order`; Expo push | The only caller of that RPC |
| **Rider (One Rider app)** | | | | |
| POST `/api/rider/availability` | (R) | `rider.ts setAvailability` | UPSERT `rider_availability`; may call `advanceDue` | must be inside `SERVICE_AREAS` to go online |
| POST `/api/rider/heartbeat` | (R) | `heartbeat` | UPDATE `rider_availability`; `advanceDue` | 12/min |
| PUT `/api/rider/push-token` | (R) | `registerPushToken` | UPSERT `push_tokens` | |
| GET `/api/rider/offers/current` | (R) | `currentOffer` | `delivery_assignments`, `delivery_jobs`, `rider_availability`; may `advanceJob` | 204 when none |
| POST `/api/rider/offers/:id/accept | decline` | (R) | `acceptOffer`, `declineOffer` | RPC `dispatch_answer` | |
| GET `/api/rider/jobs/current`, `/api/rider/jobs/:id` | (R) | `currentJob`, `jobForRider` | `delivery_jobs` (filtered `rider_id = me`) | privacy-shaped view `riderJob` |
| **Dispatch service API** | | | | |
| POST `/api/dispatch/jobs`; GET `/api/dispatch/jobs?ol_order_id=` | (S) | `dispatch.ts createJob / jobViewByOrder` | RPC `dispatch_create_job` etc. | |
| GET `/api/dispatch/jobs/:id` | (S) | `jobView` | `delivery_jobs, delivery_assignments, delivery_events, riders, rider_availability` | |
| POST `/api/dispatch/jobs/:id/release`, `/cancel` | (S) | `releaseJob`, `cancelJob` | RPC `dispatch_release`, `dispatch_cancel` | |
| POST `/api/dispatch/sweep` | (S) | `dispatch.ts sweep` | RPC `dispatch_due_jobs`; `delivery_jobs`, `ol_orders`, view `delivery_orders_needing_rider` | **UNKNOWN who calls it** — journal says "a scheduler must call the sweep every 15 to 30 seconds"; `.emergent/cron/` holds only the generic Emergent cron watcher, no entry for it |
| **Master admin API** (Proviyaa OS console) | | | | |
| GET `/api/admin/me`, `/organizations`, `/demand`, `/shoppers` | (A) read | `admin.ts` | `platform_admins`, `organizations`, `locations`, item master tables, `ol_stores`, `ol_merchant_channels`, `ol_support_requests`, `ol_orders` (counts), `auth.admin.listUsers` | page size 50, `X-Total-Count` |
| GET/POST `/api/admin/listings`; GET/PATCH `/api/admin/listings/:id`; GET `/…/preview`; POST `/…/status` | (A) read / write (`master_admin, onboarding_admin, operations`) | `createListing, updateListing, setListingStatus, previewListing` | INSERT/UPDATE `ol_stores` (`status`, `approved_by`, `approved_at`, `created_by`, `updated_by`, …), INSERT/UPDATE `ol_merchant_channels`; requires 0028 else 503 `migration_required` | going `live` needs ≥ 1 item available on One Local and no other live listing for that outlet |
| POST `/api/admin/shoppers/:id/block` | (A) write | `blockShopper` | `auth.admin.updateUserById(ban_duration '876000h'|'none')`; refuses platform admins and merchant staff | |
| POST `/api/admin/media/upload-url`; PUT/GET `/api/admin/media/dev/:key` | (A) write | `uploadUrl`, `devUpload/devFile` | Storage `createSignedUploadUrl` in bucket `onecity-catalog` | dev route works only without a database |
| **Switched off** | | | | |
| `/api/assistant/*`, `/api/search/*` | – | static 503 | – | "AI feature switched off while it moves to the new backend" |

## 2. Database operations (important ones)

| File : function | Table | Op | Fields written | Fields read | Condition | Trigger (user action) |
|---|---|---|---|---|---|---|
| `store.ts : createCheckout` | `ol_checkouts` | SELECT | – | `*` | `customer_hash`, `idempotency_key` | Pay tapped (retry safe) |
| `store.ts : createCheckout` | `ol_checkouts` | INSERT | id, customer_hash, user_id, kind, item_total, discount, delivery_fee, total, coupon_code, payment_method, payment_status, idempotency_key, city_id, created_at | – | 0026 present | Pay tapped |
| `store.ts : createCheckout` | `ol_orders` | INSERT (batch) | id, customer_hash, user_id, items, subtotal, discount, delivery_fee, gst, total, coupon_code, payment_method, payment_status, status `'placed'`, rider_name, rider_phone, eta_minutes, delivery_address, city_id, created_at, checkout_id, store_id (or idempotency_key pre-0026) | – | – | Pay tapped |
| `store.ts : createCheckout` | `ol_checkouts` | DELETE | – | – | rollback if orders insert fails | – |
| `store.ts : createCheckout` | `ol_order_items` | INSERT (batch) | order_id, product_id, name, weight, image, price, mrp, qty | – | best effort | Pay tapped |
| `store.ts : checkoutsReady` | `ol_checkouts` | SELECT id LIMIT 1 | – | id | probe every 60 s until present | any checkout |
| `store.ts : listOrders / getOrder / ordersOf` | `ol_orders` | SELECT | – | `*` | `customer_hash IN matches`; `payment_status NOT IN (pending,failed)` | My Orders / order screen |
| `store.ts : findPayment` | `ol_checkouts`, `ol_orders` | SELECT | – | id, customer_hash, total, payment_*, razorpay_* | by id / razorpay ids | payment calls |
| `store.ts : updatePayment` | `ol_checkouts` | UPDATE | any of payment_method, payment_status, razorpay_order_id, razorpay_payment_id, paid_at, payment_error | id | `payment_status IN (from)` — compare-and-set; trigger copies to `ol_orders` | verify / webhook / cod switch |
| `store.ts : recordGatewayRefund` | `ol_refunds`, `ol_orders`, `ol_checkouts` | SELECT/INSERT/UPDATE | refund row (amount, reason, method, status, reference, created_at, processed_at); `payment_status='refunded'` | order totals, refunds | `reference` unique (23505 ignored) | Razorpay `refund.processed` |
| `store.ts : refundOrder` | RPC `ol_process_refund` | RPC | see 01 | – | – | **not called anywhere** |
| `store.ts : createEnquiry / createSupportRequest / createLaunchRequest` | `ol_booking_enquiries`, `ol_support_requests` | INSERT | see 01 | – | – | Book It form / Help / "Launch One Local here" |
| `payments.ts : alreadyHandled / remember` | `ol_payment_events` | SELECT / INSERT | event_id, event, checkout_id, order_id, razorpay_payment_id | event_id | 23505 ignored | webhook |
| `restaurant.ts : listOrders / counts / getOrder` | `ol_orders` (+ embedded `orders`, `order_items`), `order_events` | SELECT | – | status, totals, items, delivery_address, restaurant_deadline, POS display_no/status/updated_at/customer_name/phone/notes | `organization_id = staff org` | Partner screens (poll 5 s / 10 s) |
| `restaurant.ts : act` | `orders` | SELECT | – | organization_id | ownership check | accept/reject/ready/out/delivered |
| `restaurant.ts : act` | RPC `ol_partner_act` | RPC | across POS + OL tables (see 03 §3.C) | – | optimistic version | same |
| `restaurant.ts : setOutlet / getOutlet` | `ol_merchant_channels` | UPDATE / SELECT | accepting, back_at, missed_in_a_row, updated_by | all | org | Open/Closed switch |
| `restaurant.ts : listItems / setItem` | `menu_categories`, `menu_items`, `item_channel_status` | SELECT / UPSERT | item_channel_status (organization_id, menu_item_id, channel `one_local`, is_available, off_until, updated_at) | – | org ownership checked on `menu_items` | Partner "Items" screen |
| `restaurant.ts : registerDevice` | `ol_partner_devices` | UPSERT | organization_id, user_id, expo_push_token, platform, last_seen_at | – | – | Partner app start |
| `push.ts : pushToRestaurant / pushToRider` | `ol_partner_devices`, `push_tokens` | SELECT, DELETE (dead tokens `DeviceNotRegistered`) | – | expo_push_token | – | order/job events |
| `dispatch.ts : createJobForOrder` | `ol_orders`, `ol_stores`, `ol_merchant_channels`, `auth.users` (admin API) | SELECT | – | order row, store row (name, lat, lng), channel (address, lat, lng, default_prep_minutes), user metadata | – | after a successful order |
| `dispatch.ts : createJob/advance/release/cancel/sweep` | RPCs + `delivery_jobs, delivery_assignments, delivery_events, riders, rider_availability, ol_orders, delivery_orders_needing_rider` | RPC / SELECT | via functions | – | – | see 03 §3.D |
| `rider.ts` | `riders, rider_availability, push_tokens, delivery_assignments, delivery_jobs` | SELECT / UPSERT / UPDATE | availability, push token | – | `rider.status='approved'` | Rider app |
| `catalog.ts : loadFromDb` | 10 catalogue tables + item master | SELECT | – | all | cached 30 s | any browse |
| `marketplace.ts : readItemMaster / readListingRows / readChannels / readLocations` | `organizations, menu_categories, menu_items, menu_item_variants, item_channel_status, ol_stores, ol_merchant_channels, locations` | SELECT (paged 1000) | – | – | – | catalogue + Master |
| `admin.ts : createListing / updateListing / setListingStatus / saveChannel` | `ol_stores`, `ol_merchant_channels` | INSERT / UPDATE | see 04 §1 | – | – | Master actions |
| `admin.ts : platformAdmin / isPlatformAdmin / isMerchantStaff` | `platform_admins`, `org_users` | SELECT | – | role | – | admin auth (30 s cache) |
| `admin.ts : orderCounts` | `ol_orders` | SELECT paged | – | id, user_id, checkout_id | `user_id IN (...)` | Master shoppers list |
| `admin.ts : demand` | `ol_support_requests` | SELECT | – | reference, message, created_at | `reference LIKE 'launch:%'` | Master demand screen |
| `privacy.ts` | see §1 | SELECT/INSERT/UPDATE/DELETE | – | – | – | Privacy screens |
| `coverage.ts : liveAreas` | `ol_service_areas` | SELECT | – | city_id, name, lat, lng, radius_km | `active` | location check |
| `frontend/scripts/seed-catalog.mjs` | `ol_*` catalogue | UPSERT | demo rows (`is_demo=true`) | – | local DB only | developer command |

## 3. Client-side (not DB) calls

| Caller | Remote | Purpose |
|---|---|---|
| `frontend/src/auth.tsx` | Supabase Auth: `signUp`, `signInWithPassword`, `signInWithOtp`/`verifyOtp` (phone), `signInWithOAuth` (Google, PKCE), `getSession`, `onAuthStateChange`; `GET {SUPABASE_URL}/auth/v1/settings` | customer sign-in |
| `partner/src/auth.tsx` | `signInWithPassword`, session listener | staff sign-in |
| `frontend/src/api.ts`, `partner/src/api.ts` | `{BACKEND}/api/...` with bearer token + `x-customer-key` | all data |
| `frontend/src/components/razorpay-checkout.tsx` | WebView on `/api/payments/checkout-page` | payment UI |
| `frontend/src/native/ios-extras.ts`, `modules/onecity-live-activity`, `targets/widget` | local iOS APIs | Live Activity/widget (client timer, no server) |

Legacy: `backend/*.py` (FastAPI media store + seed scripts) and `/api/assistant`, `/api/search` stubs are the **replaced** Python backend (`docs/BACKEND_REARCHITECTURE_PLAN.md`); `backend/` has no server entry file in the repo (INFERRED: remnants).
