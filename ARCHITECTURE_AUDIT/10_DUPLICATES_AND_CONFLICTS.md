# 10 — DUPLICATES AND CONFLICTS (One Local / OL-ui)

Reported only. Nothing here is a fix or a recommendation. Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT**.

## 1. Duplicate tables / records for the same business entity

| # | Entity | Where it lives | Conflict |
|---|---|---|---|
| 1 | **Restaurant order** | `ol_orders` (customer side) **and** POS `orders` (kitchen side), linked only by `ol_orders.pos_order_id` / `orders.external_ref = 'onelocal:<ol id>'` | Intentional "one order, two sides" (`PLATFORM_FOUNDATIONS.md` D17). But the link exists only when the order is created by `ol_create_restaurant_order`; the real customer checkout writes `ol_orders` alone (see #2) |
| 2 | **Same order, two creation paths** | `store.ts createCheckout` (customer; no org, no POS link) vs `ol_create_restaurant_order` (only the Partner test order calls it) | Different pricing code (TypeScript `pricing.ts` vs SQL using `menu_items.price`, ignoring variants, GST fixed 5%), different ids (`<store>_<menu item>_<variant>` text vs `menu_item_id` uuid), different payment (`not_charged/cod|online` vs hard-coded `cod`), different line shape. The SQL function produces `ol_orders.items[].id = 'mi_<uuid>'`, the checkout produces catalogue ids |
| 3 | **Order lines** | `ol_orders.items` (jsonb), `ol_order_items`, POS `order_items` | jsonb is declared "a read cache, not truth" (`0024` comment) but it is what all reads use; `ol_order_items` is written best-effort after commit (INFERRED to fail for marketplace product ids: FK `product_id → ol_products(id)`; `ol_products` is empty after the demo clean-up; `menu_item_id` is never filled by `store.ts`) |
| 4 | **Payment state** | `ol_checkouts` (0026 DRAFT) **and** `ol_orders` (same 4 fields + Razorpay ids in 0025) | Duplicated by design: a trigger copies checkout → orders. If both 0025 and 0026 apply, the four `ol_orders` Razorpay columns stay empty (0026 header). Before 0026, `ol_orders` is the only copy |
| 5 | **Payment record** | Razorpay (money), `ol_checkouts` (our record), POS `payments` (cash only, on staff "delivered"), `ol_payment_events` (webhook log) | No single payments ledger. `ol_orders.payment_method='cod'` vs POS `orders.payment_method='cash'` / `payments.method='cash'` for the same cash event |
| 6 | **Product / catalogue** | `ol_products` (+ `ol_categories`, `ol_brands`) vs POS `menu_items` + `menu_item_variants` + `menu_categories` projected at read time (`marketplace.ts listingCatalog`) | Two live sources merged in `catalog.ts withListings` (real listings first, demo second, "hidden" set removes demo rows whose store is a listing). Product id formats differ (`p4` vs `<store>_<uuid>[_<uuid>]`). `ol_products.menu_item_id` links them but is nullable and unused by the projection |
| 7 | **Store / merchant** | `ol_stores` (text id) vs `organizations` (uuid) vs `locations` (uuid) vs `ol_merchant_channels` (org-keyed) | One physical restaurant is: an organization, optionally a location, an `ol_stores` listing (`organization_id`, `location_id`), and an `ol_merchant_channels` row. Pickup address/lat/lng are stored in **both** `ol_stores.lat/lng` (0028) and `ol_merchant_channels.address/lat/lng` (`admin.ts saveChannel` writes both); dispatch prefers `ol_stores` then the channel row |
| 8 | **Channel / accepting switch** | `ol_merchant_channels.accepting` (One Local) vs POS `channel_integrations.is_accepting` (Swiggy/Zomato/ONDC/website/WhatsApp/QR) vs `ol_stores.status` (`paused`) vs `organizations.status` | `channel_integrations.channel` CHECK does not include `'one_local'`, so One Local did not reuse it. `item_channel_status.channel` does use `'one_local'` |
| 9 | **Customer** | `auth.users` (+`user_id`), `customer_hash` (sha256 of `user:<id>` or of the device key), OS `customers` (CRM, unrelated), planned-only `shoppers`, POS `orders.customer_name/customer_phone` (free text) | There is **no customer table**. The same person has two hashes (device before sign-in, account after) and `matches` merges them at read time. `delivery_jobs.customer_first_name/phone` is a third copy (snapshot from Auth). Erasure replaces the hash with `erased:<uuid>` |
| 10 | **Push token** | `ol_partner_devices` (restaurant staff) vs `push_tokens` (riders, 0029) | Two tables for the same Expo token concept; different columns (`organization_id,user_id` vs `rider_id`), platform CHECK differs (`ios,android,web` vs `ios,android`) |
| 11 | **Riders** | `riders` (+ `rider_store_links`, `rider_availability`) vs `ol_orders.rider_name/rider_phone/eta_minutes` | Order carries placeholder rider fields (`'Sample rider'`, `''`) that nothing updates from the real job |
| 12 | **Service area / city** | DB `ol_service_areas` (read by `coverage.ts`, `admin.ts requireCity`) vs hard-coded `ACTIVE_CITIES` and `SERVICE_AREAS` in `catalog.ts` (used by `resolveCity`, `serviceability`, dispatch drop validation, rider "go online", `maps.ts` bias) | Adding a city row in the DB does not enable it for ordering, dispatch or rider checks. Comment in `coverage.ts` says "opening a city is data, not an app release" — true only for the coverage screen |
| 13 | **Delivery fee rule** | `pricing.ts PRICING` (₹15 below ₹199 per store) vs `catalog.ts deliveryFee()` (same numbers, unused) vs the SQL function which takes `delivery_fee` from its caller | Three places for one rule; only `pricing.ts` is enforced on checkout |
| 14 | **GST rule** | `pricing.ts` (5% on food added; packaged goods inclusive, sample rates) vs `ol_create_restaurant_order` (`v_gst_pct := 5`, `orders.gst_pct`) vs POS `org_bill_settings` (sgst/cgst/service charge per org; **not read here**) | Same number, independent implementations; per-organization bill settings in the OS are ignored |
| 15 | **Delivery address** | `ol_orders.delivery_address` jsonb `{label,text,lat,lng,notes}`; saved addresses in the phone `Address {id,label,name,phone,line,area,pin,kind,lat,lng,building,street,locality,formatted,instructions}`; `delivery_jobs.drop_*` columns; Partner reads `address.area ?? address.locality` | Two address shapes; the server shape drops `name`, `phone`, `pin`, `building`. The Partner test order passes a third shape `{label,line,area}` |
| 16 | **Help-request table reused** | `ol_support_requests` carries support questions, "launch here" demand (`reference 'launch:<place>'`) and (pre-0027) privacy requests (`reference 'privacy:<ref>'`) | One table, three meanings, distinguished by a text prefix |
| 17 | **Event naming** | `ol_events` = Book-It listings (movies/events/activities); `order_events` (POS) and `delivery_events` = event logs; `ol_payment_events` = webhook log | "events" means three different things |
| 18 | **Order tracking truth** | `ol_orders.status`, `orders.status` (POS), `delivery_jobs.status`, client timer `stageAt(elapsed)` | Four sources of progress; they are not synchronised (see §2) |

## 2. Conflicting status fields

| Field | Values | Written by |
|---|---|---|
| `ol_orders.status` | `placed, accepted, packed, out, delivered, cancelled` | `ol_partner_act` (only); checkout inserts `placed` |
| POS `orders.status` | `new, in_billing, sent_to_kitchen, ready, awaiting_payment, paid, delivered, cancelled` | `ol_partner_act` |
| POS `kot_tickets.status` | `new, preparing, ready, delivered` | `ol_partner_act` |
| POS `order_items.status` | `pending, preparing, ready, delivered, cancelled` | `ol_partner_act` |
| `delivery_jobs.status` | `created, offered, assigned, at_pickup, picked_up, at_drop, delivered, exception, cancelled` | dispatch functions (up to `assigned`/`cancelled`); the rest by the rider app (not in repo) |
| `delivery_assignments.outcome` | `accepted, rejected, timed_out, withdrawn` | dispatch functions |
| `ol_orders.payment_status` / `ol_checkouts.payment_status` | `not_charged, pending, paid, failed, refunded` | payments code / triggers / refund code |
| `ol_refunds.status` | `requested, approved, rejected, processed` | only `processed` is ever written |
| `ol_stores.status` | `draft, pending, live, paused` | admin API |
| `riders.status` | `draft, submitted, verification_pending, approved, rejected, documents_expired, suspended` | by hand (no code writes it) |
| `ol_booking_enquiries.status` | free text, default `demo_enquiry_saved` | – |
| `ol_support_requests.status` | free text, default `saved_for_review` | – |

Specific conflicts:
1. **"Out for delivery" differs:** `ol_partner_act('out')` sets `ol_orders.status='out'` and `kot_tickets.status='delivered'` but leaves POS `orders.status='ready'`; `delivery_jobs` has its own `picked_up/at_drop`.
2. **"Delivered" can be set in three independent places** (`ol_orders` by staff, `orders` by staff via the same RPC, `delivery_jobs` by the rider app); no code reconciles them.
3. **Cancelled** can be set by restaurant reject/timeout (`ol_orders`, `orders`) and separately by `dispatch_cancel` (`delivery_jobs`); the job is cancelled by the sweep only after `ol_orders` is cancelled; the reverse (job cancelled → order cancelled) does not exist.
4. `ol_orders.status` for customer-checkout orders has no writer after `placed` (INFERRED); the customer UI ignores it and runs a timer.
5. `payment_status 'paid'` for a POS-linked cash order is set at staff "delivered" time, while for a customer-checkout COD order it stays `not_charged` forever (INFERRED; nothing marks COD collected).
6. `ol_orders.payment_method` CHECK was widened in 0025; the customer app type `PaymentMethod` in `frontend/src/customer.tsx` lacks `emi`/`cardless_emi` (these are only reported back by Razorpay).
7. `ol_refunds.method 'wallet'` exists though no wallet exists.

## 3. Different ID formats

| Concept | Formats in use |
|---|---|
| Order number shown to humans | POS `display_no` `OL-00012` (per-org counter); dispatch `order_no` `OL-3F9A1B` (first 6 hex of the order uuid); Razorpay description `Order #3F9A1B2C` (8 hex of the **checkout** uuid) — the same `OL-` prefix, two meanings |
| Store / product / category / brand / banner / event / reel ids | `text` (`s1`, `p4`, `c1`, `org-<slug>-<outlet>`, `<store>_<uuid>_<uuid>`) |
| Organization, location, user, order, checkout, job, rider | `uuid` |
| `delivery_jobs.pos_order_id` | `uuid` with **no foreign key** (every other link to `orders` has one) |
| `rider_store_links.store_id`, `delivery_jobs.store_id`, `ol_orders.store_id` | `text` references `ol_stores(id)` |
| City | `city_id text` (`latur`) vs outlet `location_id uuid` vs address lat/lng |
| Customer ownership | 64-hex hash text vs `user_id uuid` |
| Keys | device key hex vs idempotency key `^[A-Za-z0-9_-]{8,128}$` vs dispatch `idempotency_key` `onelocal:<uuid>:delivery` vs POS `external_ref` `onelocal:<uuid>` |

## 4. Inconsistent naming

- Product/brand names: **OneCity** (app display name, storage keys `onecity.*`, bucket `onecity-catalog`, Live Activity module `onecity-live-activity`), **One Latur** (docs, `onelatur.*` keys, `/api` index message "One Latur API", rider app id `onlatur-rider`), **One Local** (tables `ol_*`, delivery app id `one-local`), **VINII** (POS/Partner), **Proviyaa** (OS/Master).
- Table prefixes: `ol_*` everywhere except the 0029 delivery tables (`riders`, `rider_store_links`, `rider_availability`, `push_tokens`, `org_dispatch_settings`, `delivery_*`) whose generic names live in the same `public` schema as other apps.
- `customer_hash` (database column) vs `customer` (same value in the in-memory types of `store.ts`).
- `orders` (POS) vs `ol_orders` vs the route `/api/orders` (= `ol_orders`) vs `/api/partner/orders/:id` (= POS order id) — the same word with two id spaces. The Partner `id` is the **POS order id**, `one_local_id` is the `ol_orders.id`.
- Statuses spelled `cancelled` (UK) in all tables; `canceled` not used.

## 5. Multiple sources of truth (summary)

| Fact | Competing sources |
|---|---|
| Is a city live? | `ol_service_areas` vs `catalog.ts` constants |
| Price of an item | POS `menu_items.price` / `menu_item_variants.price` (marketplace) vs `ol_products.price` (demo) vs the stored `ol_orders.items[].price` (snapshot) |
| Is an item available | `menu_items.is_available`, `item_channel_status`, `ol_products.is_available`, catalogue cache (30 s) |
| Where to pick up | `ol_stores.lat/lng`, `ol_merchant_channels.lat/lng/address`, `locations.address` (admin preview uses channel, then location address) |
| Has the order been paid | `ol_checkouts.payment_status`, `ol_orders.payment_status`, Razorpay (webhook is the declared truth), POS `orders.paid_at`/`payments` |
| Where is the order / rider | `ol_orders.status`, `orders.status`, `delivery_jobs.status`, `delivery_events`, client timer, `ol_orders.rider_name` placeholder |
| Who is the customer | `auth.users`, `customer_hash`, POS free-text name/phone, `delivery_jobs.customer_*` |
| Consent state | phone AsyncStorage `onecity.privacy.v1` vs `ol_consents` (0027 DRAFT) |
| Migration numbering | repo files `0025`–`0029` are placeholders; the OS ledger (`schema_migrations`, Repo-1-) assigns real numbers. `docs/PLATFORM_FOUNDATIONS.md` ("New tables this needs (migrations 0025–0026 in Repo-1-)") reserves 0025–0026 for **different** planned tables: `apps`, `shoppers`, `ol_addresses`, `riders`, `platform_admin_scopes`, `app_devices` (generalises `ol_partner_devices`, "merged later"), `app_config`, `feature_flags`, `audit_log`. None exist in this repo's SQL. The same docs plan a `riders` table to come from the rider app, while this repo's draft 0029 also creates `riders` (**possible collision**, UNKNOWN which one the OS ledger will carry) |

## 6. Other inconsistencies noticed while mapping

- `ol_order_items.product_id` FK vs marketplace product ids (INFERRED failing insert; see #3 above).
- `ol_coupons` has no redemption table or per-user limit: a code can be applied on every checkout (no table records use).
- `ol_orders.cancelled_by`, `ol_booking_enquiries.resolved_by`, `ol_support_requests.resolved_by/resolved_at`, `ol_order_items.discount`, `ol_media_assets` have no writer in this repo.
- `ol_partner_act('out')` and `('delivered')` are not followed by any dispatch call; `onRestaurantAccepted/Rejected` are the only hooks.
- The Partner `delivered` action marks cash collected on the POS (`payments`) even when a rider (not the restaurant) collected the cash; `delivery_jobs.cash_to_collect` is tracked separately and no reconciliation exists.
- Journal 2026-09-27 says "Migrations 0021–0024 are confirmed live in production" while `docs/CENTRAL_DB_MAP.md` (2026-09-22) still lists the superseded first-draft `ol_*` tables; the map is stale.
- `catalog.ts` header says "After the founder's clean-up (db/cleanup/) no demo rows are left", yet the JSON fallback (`data/catalog.json`) still serves demo data when no database is configured.
