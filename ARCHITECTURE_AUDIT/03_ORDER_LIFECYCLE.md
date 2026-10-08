# 03 — ORDER / TRANSACTION LIFECYCLE (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT** = migration not applied to production per `docs/JOURNAL.md`.

## 0. The most important finding, up front

This repo contains **two disconnected order creation paths**:

| Path | Where | Creates | Reaches the restaurant / POS? |
|---|---|---|---|
| **P1. Customer checkout** (the real customer flow) | `frontend/server/store.ts createCheckout` ← `POST /api/checkouts` and `POST /api/payments/order` | `ol_checkouts` (if 0026), `ol_orders`, `ol_order_items` — **no** `organization_id`, **no** `pos_order_id`, **no** POS `orders` row | **No.** The Partner app lists orders `WHERE ol_orders.organization_id = <staff org>` (`restaurant.ts listOrders`), so a customer-checkout order never appears. Confirmed by the journal (2026-09-27 and 2026-09-28: "Orders for Master-approved restaurants are not yet sent on to the POS or the VINII Partner app", "Checkout still does not create the kitchen's side of an order") |
| **P2. Restaurant order SQL function** | `ol_create_restaurant_order` (0023), called **only** by `restaurant.ts createTestOrder` ← `POST /api/partner/test-order` | POS `orders`, `order_items`, `order_events`, and `ol_orders` (with `organization_id`, `pos_order_id`, `restaurant_deadline`) | Yes — this is the only path the Partner app and `ol_partner_act` state machine can act on |

Consequences (all INFERRED from the code paths above): a customer's food order is saved and (for COD, or once paid) handed to the rider-dispatch pool, but no restaurant is ever notified; and the restaurant-side state machine (accept → ready → out → delivered) cannot be exercised by a real customer order. Status for non-POS-linked orders never advances past `placed` in this repo (nothing writes it), while the customer's tracking screen shows a client-side timed animation, not `ol_orders.status` (`frontend/app/order/[id].tsx`, `frontend/src/native/ios-extras.ts stageAt`).

Production status of tables/migrations used below is in `01_DATABASE.md` §0.

---

## 1. How an order starts

| Question | Answer (with source) |
|---|---|
| Who/what creates it | The customer app's cart screen `frontend/app/(tabs)/cart.tsx handleCheckout`: `POST /api/checkouts` (cash) or `POST /api/payments/order` (online). Both call `createCheckout` in `frontend/server/store.ts` |
| Cart creation | Client-only. `frontend/src/cart.tsx` keeps **two carts** in AsyncStorage key `onelatur.cart.v2` — `food` (one restaurant only) and `shopping` (many stores). No server-side cart exists. The server sees the cart only as `items:[{id,qty}]` on `POST /api/cart/quote` and on checkout |
| Order ID generation | `crypto.randomUUID()` in `buildCheckout` — application-generated, one uuid per store order and one for the checkout |
| Customer identification | Headers `x-customer-key` (device) and optional `Authorization: Bearer <Supabase access token>`; `auth.ts caller()` → `customer_hash` + `user_id`. The **server accepts a device-key-only checkout** (`requireCustomer` needs only `who.owner`); the **app** forces sign-in first when Supabase is configured (`cart.tsx` pushes `/sign-in?next=checkout`) |
| Organization identification | **Not set** by checkout (P1). Set only by `ol_create_restaurant_order` (P2) from `p.organization_id` |
| Location / store identification | `ol_orders.store_id` = store of each bill group (needs 0026); `ol_orders.city_id` = `resolveCity(request)` (`?city=` or `x-city`, default `latur`; only `latur` is active in `ACTIVE_CITIES`) |
| Order splitting | One order **per store** in the cart (`pricing.ts quote` → `groups`). Food cart = exactly one restaurant (409 otherwise); shopping cart = any number of stores. Food and shopping can never be in the same checkout (409) |
| Pricing source | Server recomputes everything from the catalogue (`pricing.ts quote`); the app's `total` is only a ±₹0.50 sanity check (409 "Prices have changed") |

## 2. Pricing, discounts, taxes (`frontend/server/pricing.ts`)

| Rule | Value / behaviour |
|---|---|
| Item price | Catalogue `price` (`ol_products.price`, or `menu_item_variants.price`/`menu_items.price` for marketplace listings); MRP = price for marketplace listings |
| Delivery fee | Per store: ₹15 when that store's item total < ₹199, else ₹0 (`PRICING.deliveryFee`, `freeDeliveryFrom`). A duplicate helper `deliveryFee()` exists in `catalog.ts` (unused) |
| Handling fee, platform fee | Constants `0` ("undecided") |
| GST on restaurant food | 5% added on top of food lines per store; split cgst/sgst; `gst_added.total` = food GST + GST on delivery (rate `0`, undecided) → stored as `ol_orders.gst` |
| GST on packaged goods | Included in MRP, backed out for display only (`gst_included`) using a sample per-category table (flagged "SAMPLE RATES — confirm with the CA"); **not stored** on the order |
| Coupon | `ol_coupons` (`kind flat|pct`, `value`, `min_order`, optional `store_id` from 0026). Applied to the checkout item total (or one store's part for a store coupon); discount spread across stores in paise, remainder on the biggest store. Checkout fails with 409 if coupon not ok |
| Store bill total | `max(item_total + delivery_fee + handling_fee + platform_fee + gst_added.total − discount, 0)` |
| Checkout total | Sum of store totals |
| Per-line discount | `ol_order_items.discount` exists but is never set (always 0) |
| Order-level cap/limit | `quote` ≤ 50 lines, qty 1–99; `createCheckout` rate limit 5 per 60 s per customer (`limit()` is per-process memory) |

## 3. State transitions

Notation: EVENT / ACTOR / TABLE / FIELD / OLD → NEW / CODE LOCATION / API-RPC / SIDE EFFECTS.
"Old value" `∅` = row does not exist yet.

### 3.A Customer checkout, cash on delivery (path P1)

**A1. Cart priced** — EVENT: quote requested. ACTOR: customer app. TABLE: none (no write). CODE: `frontend/server/pricing.ts quote`. API: `POST /api/cart/quote` (limit 120/min). SIDE EFFECTS: none; coupon check reads `getCatalog()`; `POST /api/coupons/apply` is a second, simpler coupon call (`applyCoupon(code, subtotal)`).

**A2. Checkout created (COD)**
- EVENT: customer taps Pay on delivery. ACTOR: customer (device key or signed in).
- API: `POST /api/checkouts` with `Idempotency-Key` header → `createCheckout(request, city, online=false)`; `POST /api/orders` is the legacy equivalent returning the first order.
- TABLE `ol_checkouts` (only when 0026 applied, `checkoutsReady()`): row INSERT — `kind`, `item_total`, `discount`, `delivery_fee`, `total`, `coupon_code`, `payment_method='cod'`, `payment_status='not_charged'`, `idempotency_key`, `city_id`, `customer_hash`, `user_id`, `created_at`. OLD `∅` → NEW row.
- TABLE `ol_orders`: one INSERT per store — `status = 'placed'`, `payment_method='cod'`, `payment_status='not_charged'`, `items` jsonb, `subtotal`, `discount`, `delivery_fee`, `gst`, `total`, `coupon_code`, `rider_name='Sample rider'`, `rider_phone=''`, `eta_minutes` (= parsed store delivery time or 10), `delivery_address` jsonb, `city_id`, `created_at`; with 0026: `checkout_id`, `store_id`; without 0026: `idempotency_key` (`key`, `key:2`, `key:3`…). OLD `∅` → NEW `placed`.
- TABLE `ol_order_items`: INSERT one row per line (`order_id`, `product_id`, `name`, `weight`, `image`, `price`, `mrp`, `qty`). **Best effort** — failure is only `console.error`'d. INFERRED: the `product_id → ol_products(id)` FK rejects ids of marketplace products (they are not rows in `ol_products`), and since `ol_products` is empty after the clean-up, every line insert would fail in production; then `ol_order_items` stays empty.
- Failure handling: if `ol_orders` insert fails, the `ol_checkouts` row is deleted; on unique-index conflict (code 23505) the first result is returned (idempotent).
- Idempotency: unique `(customer_hash, idempotency_key)`; same key returns the earlier checkout. In-memory mode (no database) keeps replies in a Map for 24 h and rejects a changed fingerprint with 409.
- SIDE EFFECTS: `dispatchOrders(order ids)` (see 3.D). No notification to customer, restaurant, or POS. No inventory change. No analytics write.

**A3. Orders listed / opened** — ACTOR: customer. `GET /api/orders` (`listOrders`: `customer_hash IN matches`, excludes `payment_status IN (pending,failed)`, 200 newest) and `GET /api/orders/:id`, `GET /api/checkouts/:id`. Read-only.

### 3.B Online payment (Razorpay) — requires 0026 (DRAFT)

**B1. Payment started** — ACTOR: customer. API: `POST /api/payments/order` → `payments.ts startPayment` → `createCheckout(..., online=true)`. TABLE `ol_checkouts` INSERT with `payment_method` = chosen (`upi|card|netbanking|wallet|paylater`) and **`payment_status = 'pending'`**; `ol_orders` INSERT with the same fields, `status='placed'`. Then `POST https://api.razorpay.com/v1/orders {amount: paise(total), currency:'INR', receipt: checkout id, notes:{checkout_id}}` (Basic auth with `RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET`); `ol_checkouts.razorpay_order_id` set (`updatePayment` allowed from `pending|failed`). Without Razorpay keys `features().online_payments` is false → 503 and the cart stays COD-only. Orders with `payment_status IN (pending,failed)` are hidden from the customer's list.

**B2. Payment confirmed by the app** — API: `POST /api/payments/verify {checkout_id, razorpay_order_id, razorpay_payment_id, razorpay_signature}`. Checks `HMAC-SHA256(key_secret, order_id|payment_id)`, then (best effort) `GET /v1/payments/<id>` to compare amount/order. TABLE `ol_checkouts`: `payment_status` `pending|failed|not_charged` → `paid`; `razorpay_payment_id`, `paid_at`, `payment_error=null`, `payment_method` (the method Razorpay reports: `upi, card, netbanking, wallet, paylater, emi, cardless_emi`). Trigger `ol_checkouts_payment_to_orders` copies method/status/paid_at/error to each `ol_orders` row. SIDE EFFECTS: `dispatchOrders(order_ids)`. Amount mismatch → `payment_error='Paid amount did not match the order'`, 409.

**B3. Payment confirmed/failed by Razorpay webhook (source of truth)** — API: `POST /api/payments/webhook`; signature `x-razorpay-signature` = HMAC-SHA256(`RAZORPAY_WEBHOOK_SECRET`, raw body). Events handled: `payment.captured`, `order.paid` → same as B2 (`markPaid`); `payment.failed` → `ol_checkouts.payment_status` `pending` → `failed`, `payment_error` = Razorpay description; `refund.processed` → see 3.E. Dedupe by `x-razorpay-event-id` in `ol_payment_events` (insert after handling). Rate limit 600/min.

**B4. Switch a failed/abandoned online payment to cash** — API: `POST /api/payments/cod {checkout_id}`. `ol_checkouts`: `payment_method` → `cod`, `payment_status` `pending|failed` → `not_charged`. SIDE EFFECTS: `dispatchOrders`.

**B5. Second payment on an already paid checkout** — not auto-refunded; `console.error` asks the operator to refund from the Razorpay dashboard.

### 3.C Restaurant order, POS-linked (path P2) — `ol_create_restaurant_order` + `ol_partner_act`

Callable in this repo only from `POST /api/partner/test-order` (test order: 1–2 random available menu items, `customer_hash='partner-test:<staff user id>'`, delivery_fee 0, payment fixed `'cod'`).

**C1. Placed** — ACTOR: server (service role). RPC `ol_create_restaurant_order`. Validations: `OL_NOT_ACCEPTING` unless `ol_merchant_channels.accepting`; items must exist for the org, `menu_items.is_available`, and not switched off in `item_channel_status` for `channel='one_local'` (`off_until` null or future); qty 1–99; ≤50 lines. TABLE `orders` INSERT: `status 'new'`, `channel 'online'`, `placed_by 'integration'`, `order_no`/`display_no` (`OL-00012` via `next_org_seq(org,'order')`), `subtotal`, `gst_pct 5`, `gst_amount`, `total = subtotal + gst + delivery_fee`, `external_ref 'onelocal:<ol id>'`. `order_items` INSERT (status `pending`). `order_events` INSERT `kind 'placed'`, actor `'one_local'`. `ol_orders` INSERT: `status 'placed'`, `payment_method 'cod'`, `payment_status 'not_charged'` (default), `restaurant_deadline = now() + accept_window_seconds` (default 60 s), `pos_order_id`, `organization_id`, `items` jsonb, `gst`. SIDE EFFECT (test-order route only): Expo push "New order OL-xxxxx … accept within 60 seconds" to `ol_partner_devices` of the org (`push.ts pushToRestaurant`). **Does not call dispatch, does not insert `ol_order_items`.** The function hard-codes `payment_method 'cod'`.

**C2. Accept** — ACTOR: restaurant staff (roles `org_owner, org_admin, manager, biller, location_manager, operations_manager`). API `POST /api/partner/orders/:posOrderId/accept {version, prep_minutes}` → RPC `ol_partner_act(... 'accept')`. Preconditions: `orders.status='new'`; not past `restaurant_deadline + 5 s` (`OL_EXPIRED`); prep 5–120; `p_expected = orders.updated_at` (`OL_STALE` otherwise). Writes: `kot_tickets` INSERT (`kot_no` via `next_org_seq(org,'kot')`, station `'main'`, status `'new'`); `order_items.kot_ticket_id` set (items with status `pending`); `orders.status` `new` → **`sent_to_kitchen`**; `ol_orders.status` `placed` → **`accepted`**, `prep_minutes`, `eta_minutes = prep + 15`; `ol_merchant_channels.missed_in_a_row` → 0; `order_events` `accepted` + `kot_fired`. SIDE EFFECT: `dispatch.ts onRestaurantAccepted` → releases a held delivery job (only if one exists and `dispatch_trigger='accepted'`).

**C3. Reject** — same roles. `POST …/reject {version, reason}`. Precondition `orders.status='new'`, reason required. `orders.status` `new` → `cancelled`; all `order_items.status` → `cancelled`; `ol_orders.status` `placed` → `cancelled`, `cancel_reason = 'Restaurant: <reason>'`; `missed_in_a_row` → 0; `order_events 'rejected'`. SIDE EFFECT: `onRestaurantRejected` → `dispatch_cancel` the job.

**C4. Timeout (restaurant did not answer)** — ACTOR: system. Triggered by RPC `ol_expire_unanswered`, which runs at the start of every Partner `GET /api/partner/orders` (and nowhere else — no scheduler in this repo). In `ol_partner_act('timeout')` when `orders.status='new'` and `now() > restaurant_deadline`: `orders.status` → `cancelled`; items `cancelled`; `ol_orders.status` `placed` → `cancelled`, `cancel_reason 'The restaurant did not respond in time'`; `ol_merchant_channels.missed_in_a_row` +1; when ≥ `auto_pause_after` (default 3) → `accepting=false` (auto-pause); `order_events 'timed_out'`. Dispatch job cancellation follows in the next dispatch sweep (`order_cancelled`).

**C5. Ready** — `POST …/ready`. Precondition `orders.status='sent_to_kitchen'`. `kot_tickets.status` (`new|preparing`) → `ready`; `order_items.status` (`pending|preparing`) → `ready`; `orders.status` → **`ready`**; `ol_orders.status` `accepted` → **`packed`**; `order_events 'kot_ready'`. Roles also include `kitchen`.

**C6. Out for delivery** — `POST …/out`. Precondition `orders.status='ready'` AND `ol_orders.status='packed'`. `kot_tickets.status` → `delivered`; `order_items.status` → `delivered` (non-cancelled); `orders.updated_at` only (**POS `orders.status` stays `ready`**); `ol_orders.status` `packed` → **`out`**; `order_events 'out_for_delivery'`.

**C7. Delivered (cash collected)** — `POST …/delivered`. Precondition `ol_orders.status='out'`. `orders.status` → **`delivered`**, `payment_method 'cash'`, `paid_at = now()`; `payments` INSERT (`method 'cash'`, `amount = orders.total`, `reference 'onelocal:<ol id>'`, `created_by` = staff user id); `ol_orders.status` → **`delivered`**, `payment_status` `not_charged` → **`paid`**; `order_events` `delivered` and `paid`. No dispatch hook is called here. The staff-marked "delivered" is independent of `delivery_jobs.status` (INFERRED: two parallel delivery truths).

### 3.D Rider dispatch (0029, DRAFT; production behaviour = no-op until applied and `DISPATCH_SIGNING_SECRET` set)

Hook: `dispatchOrders(orderIds)` runs after a COD checkout (3.A2), after `markPaid` (3.B2/B3) and after switch-to-cash (3.B4). If `DISPATCH_SIGNING_SECRET`/`DISPATCH_OTP_SECRET` is unset it only warns once and returns; if it throws it is logged and the sweep retries within 24 h (`delivery_orders_needing_rider`). "Successful order" = `payment_method='cod'` OR `payment_status='paid'` (`createJobForOrder` throws 409 `order_not_deliverable` otherwise).

| EVENT | ACTOR | TABLE.FIELD | OLD → NEW | CODE / RPC | SIDE EFFECTS |
|---|---|---|---|---|---|
| Job created | server (order flow) or dispatch service over HTTP | `delivery_jobs` INSERT; `status` | ∅ → `created`; `version 1`; `dispatch_trigger` (org setting else `'placed'`); `otp_hash`; pickup point from `ol_stores.lat/lng` else `ol_merchant_channels.lat/lng` (422 `no_pickup_location` otherwise); drop point from `ol_orders.delivery_address.lat/lng` (400 if absent; 422 `outside_delivery_area` if outside `SERVICE_AREAS`) | `dispatch.ts createJob` → RPC `dispatch_create_job`; HTTP `POST /api/dispatch/jobs` (service-signed) | `delivery_events` row `delivery.created`; customer name/phone read from `auth.admin.getUserById`; cash to collect = `ol_orders.total` for COD else 0 |
| Job released | server | `delivery_jobs.released_at`, `rounds_base`, `version+1`; `delivery_events` | `released_at NULL → now()` | RPC `dispatch_release` (immediately when trigger `'placed'`; after restaurant accept when `'accepted'`) | event `delivery.released` |
| Offered to rider | system | `delivery_assignments` INSERT (`outcome NULL`, `expires_at = now + offer_seconds`, default 30 s); `delivery_jobs.status` | `created → offered` | RPC `dispatch_offer_next`; candidate: `riders.status='approved'`, online, `last_seen_at` < 60 s, vehicle match, no live offer/active job, never offered this job, within radius (default 8 km); order: linked store/org first, nearest, fewest jobs today | event `delivery.offered`; Expo push "New delivery job" (`pushToRider`, ttl 30 s); `acceptance='auto'` riders are auto-accepted at once |
| Rider accepts | rider | `delivery_assignments.outcome`; `delivery_jobs.status`, `rider_id` | `NULL → accepted`; `offered → assigned` | `POST /api/rider/offers/:id/accept` → RPC `dispatch_answer` | event `delivery.assigned` |
| Rider declines | rider | `delivery_assignments.outcome` | `NULL → rejected` | `POST /api/rider/offers/:id/decline` → `dispatch_answer` then `advanceJob` | event `delivery.rejected` |
| Offer lapses | system | `delivery_assignments.outcome` | `NULL → timed_out` | `dispatch_offer_next` (called by sweep, heartbeat `advanceDue`, rider reading offers, rider going online) | event `delivery.timed_out` |
| No rider | system | `delivery_jobs.escalated_at`, `status` | → `created` with `escalated_at` set after `max_rounds` offers (or `max_rounds × offer_seconds` with nobody online) | `dispatch_offer_next` | event `delivery.no_rider`; push "No rider found yet" to the restaurant devices |
| Cancelled | restaurant reject / sweep sees `ol_orders.status='cancelled'` / service call | `delivery_jobs.status`, `cancel_reason`; live `delivery_assignments.outcome → withdrawn` | → `cancelled` (refused when `picked_up|at_drop|delivered`) | RPC `dispatch_cancel`; HTTP `POST /api/dispatch/jobs/:id/cancel` (reasons `restaurant_rejected, restaurant_timed_out, customer_cancelled, other`) | event `delivery.cancelled`; push "Order cancelled" to the rider |
| **At pickup / picked up / at drop / delivered / exception** | rider app (**not in this repo**) | `delivery_jobs.status` allows these values | – | **No function or route in this repo sets them** (journal: "the job stops at assigned") | – |

Customer-facing: `GET /api/dispatch/jobs?ol_order_id=` returns `jobView` for services (no rider phone); **no customer route exposes it**; the customer app shows `rider_name 'Sample rider'`.

### 3.E Refunds

| EVENT | ACTOR | TABLE.FIELD | OLD → NEW | CODE / API | SIDE EFFECTS |
|---|---|---|---|---|---|
| Gateway refund recorded | Razorpay (webhook `refund.processed`) | `ol_refunds` INSERT (`status 'processed'`, `method 'original'`, `reason 'Refunded through Razorpay'`, `reference = rfnd id`, booked on the first store order it fits); `ol_orders.payment_status` → `refunded` when that order's processed refunds ≥ its total; `ol_checkouts.payment_status` → `refunded` when all ≥ checkout total | `paid → refunded` | `store.ts recordGatewayRefund` (found by `razorpay_payment_id`) | Does **not** change `ol_orders.status`, does not touch POS, does not release inventory |
| Internal refund | support tooling (**no route or caller exists**) | `ol_refunds` INSERT (`status 'processed'`), `ol_order_items.refunded_qty += ceil(amount/price)`, `ol_orders.payment_status → refunded` when total covered | allowed only when `ol_orders.status IN (delivered,out,packed,accepted)` | RPC `ol_process_refund` via `store.ts refundOrder` | Records only; no money movement call. Statuses `requested/approved/rejected` exist but nothing creates them |
| Customer-requested refund | – | – | – | **none** (no UI or route) | – |

### 3.F Cancellation and failure matrix

| Case | Supported? |
|---|---|
| Customer cancels an order | **No route, no UI.** `ol_orders.cancelled_by` is never written |
| Restaurant rejects / times out | Yes, only for POS-linked orders (3.C3/C4) |
| Online payment fails | `ol_checkouts.payment_status → failed`; order stays `placed` but hidden from the list; customer can switch to cash |
| Admin cancels an order | **No** admin order routes exist (`/api/admin/*` covers listings, shoppers, media, demand, organizations) |
| Delivery job cancelled | Yes (3.D) |

### 3.G Everything else asked for

| Topic | Current state |
|---|---|
| Order acceptance | Only POS-linked orders (3.C2). Customer-checkout orders: **UNKNOWN who accepts** — nothing does in this repo |
| Preparation / ready | POS-linked only (3.C5). The SQL function copies `station` and `course` from `menu_items` to `order_items`; `menu_items.prep_minutes` is not used. ETA = the accepted prep time + 15 (`ol_orders.eta_minutes`) |
| Fulfilment / delivery / completion | Staff-marked (3.C6–C7) for POS-linked; rider app for job states (not in repo). For customer-checkout orders `ol_orders.status` is never advanced → **stays `placed`** (INFERRED) |
| Inventory impact | **None.** Availability only: catalogue excludes `ol_products.is_available=false` (demo) and POS items with `menu_items.is_available=false` or switched off for `one_local`. `quote` re-checks only that the product id exists in the cached catalogue (30 s TTL) |
| Notifications | Expo push to restaurant devices (`new_order` — **only from the test-order route**; `no_rider`), to riders (`job_offer`, `job_assigned`, `job_cancelled`). No customer push, SMS, WhatsApp or email in this repo. iOS Live Activity/widget are driven locally by the client timer (`frontend/src/native/ios-extras.ts`) |
| Analytics | None stored. Console log lines: `[admin] {json}` audit line for admin writes, `[privacy] {json}`, `[dispatch]`, `[payments]`, `[api]` errors. The admin "demand" report counts `launch:` rows in `ol_support_requests` |
| Customer delivery code | Derived (`dispatch.ts deliveryOtp`), only its hash is stored; **no endpoint returns it to the customer and nothing verifies it** (INFERRED unfinished) |
| Loyalty / coins / wallet | Not implemented (feature flags false; wallet screen demo in AsyncStorage) |
| Invoices | None generated |
| Tables / dine-in | Not used (`orders.table_id` always NULL, channel `'online'`) |
