# 05 — EVENT MAP (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**; **DRAFT** = not applied to production per `docs/JOURNAL.md`.

## 0. Summary

- **There is no message queue, no Supabase Realtime subscription, no Database Webhook, no Edge Function and no pub/sub in this repo.** Phones **poll**.
- Two append-only event stores exist: POS `order_events` (written by the SQL functions of 0023) and `delivery_events` (the dispatch outbox, 0029 DRAFT). **Nothing in this repo reads either as a feed** for another system (`order_events` is read for the Partner order detail; `delivery_events` for the tracking `timeline`).
- `docs/PLATFORM_FOUNDATIONS.md` D20 / §6.5 describes a future outbox `ol_order_events` with canonical names (`checkout.created`, `order.created`, `order.accepted`, `order.cancelled`, `order.fulfilled`, `payment.*`…). **No migration creates it and no code writes it.**

## 1. Event table

EVENT | PRODUCER | CONSUMER | PAYLOAD | DATABASE EFFECT

### 1.1 Database triggers

| EVENT | PRODUCER | CONSUMER | PAYLOAD | DB EFFECT |
|---|---|---|---|---|
| `BEFORE UPDATE` on `ol_orders`, `ol_merchant_channels`, `ol_checkouts`, `ol_stores`, `ol_privacy_requests`, `riders`, `org_dispatch_settings`, `delivery_jobs` | Postgres trigger | same row | – | `updated_at = now()` (`set_updated_at`) |
| `AFTER UPDATE OF payment_method, payment_status, paid_at, payment_error` on `ol_checkouts` (only when one changed) | trigger `ol_checkouts_payment_to_orders` (0026 DRAFT) | `ol_orders` of that checkout | new row values | UPDATE `ol_orders` set the same four fields |
| `BEFORE UPDATE OR DELETE` on `ol_consents` | trigger `ol_consents_append_only` (0027 DRAFT) | – | – | raises `OL_BAD_REQUEST` (DELETE allowed only with `set local ol.privacy_purge='on'`) |

### 1.2 Outbox rows (written in the same transaction as the change)

**`delivery_events`** (DRAFT 0029) — `kind` values and the function that writes them. Payload is `meta jsonb` always containing `request_id`, `actor` (`order_flow`, `system`, `rider`), and per kind the fields below.

| `kind` | Producer function | `meta` extras | Consumer |
|---|---|---|---|
| `delivery.created` | `dispatch_create_job` | `app 'one-local'`, `dispatch_trigger` | `jobView.timeline` (HTTP `GET /api/dispatch/jobs…`) — **no subscriber** |
| `delivery.released` | `dispatch_release` | `prep_minutes` | same |
| `delivery.offered` | `dispatch_offer_next` | `round`, `rider_id` | same |
| `delivery.timed_out` | `dispatch_offer_next` | `round`, `rider_id` | same |
| `delivery.no_rider` | `dispatch_offer_next` | `rounds` | same; also triggers a push to the restaurant (`afterOffer`) |
| `delivery.assigned` | `dispatch_answer` | `app 'onlatur-rider'`, `rider_id`, `round` | same |
| `delivery.rejected` | `dispatch_answer` | `app 'onlatur-rider'`, `rider_id`, `round` | same |
| `delivery.cancelled` | `dispatch_cancel` | `reason`, `rider_id` | same |

Column `v int default 1` = event schema version.

**POS `order_events`** (OS-owned table, written by 0023 functions): `kind` values `placed` (actor `one_local`), `accepted`, `kot_fired`, `rejected`, `kot_ready`, `out_for_delivery`, `delivered`, `paid` (actor `partner`), `timed_out` (actor `one_local`). Payload `meta`: `source`, `ol_order_id`, `prep_minutes`, `by`, `kot_no`, `reason`, `method`, `auto_paused`. Consumer in this repo: `restaurant.ts getOrder` (shows the timeline in the Partner app). Other consumers (POS UI, Master) — **UNKNOWN**.

### 1.3 HTTP webhooks received

| EVENT | PRODUCER | CONSUMER | PAYLOAD | DB EFFECT |
|---|---|---|---|---|
| `payment.captured`, `order.paid` | Razorpay → `POST /api/payments/webhook` | `payments.ts handleWebhook` → `markPaid` | `payload.payment.entity {id, order_id, amount, method, notes.checkout_id}` | `ol_checkouts` → `paid` (+ trigger to `ol_orders`); `ol_payment_events` INSERT; `dispatchOrders` |
| `payment.failed` | Razorpay | same | `payment.entity.error_description` | `ol_checkouts.payment_status` `pending → failed`, `payment_error`; `ol_payment_events` |
| `refund.processed` | Razorpay | `recordGatewayRefund` | `payload.refund.entity {id, payment_id, amount}` | `ol_refunds` INSERT; `ol_orders`/`ol_checkouts.payment_status → refunded` when covered |
| Signed calls from another service | "VINII / operations tooling" (docs) → `/api/dispatch/*` | `dispatch.ts serviceRequest` | job payload (`docs/RIDER_DISPATCH_API.md`) | dispatch RPCs |
| Scheduled call | Intended: a scheduler → `POST /api/dispatch/sweep` every 15–30 s | `dispatch.ts sweep` | – | advances/cancels/creates jobs. **Who calls it: UNKNOWN** (no schedule in this repo; heartbeats and offer reads call `advanceDue` as a partial substitute) |

The `.emergent/cron/*` files are the generic Emergent preview-pod cron runner (envelope `{"event":"schedule.triggered","schedule_id","run_id","dispatch_time","job_id","data":null}` POSTed with `WEBHOOK_CRON_SECRET`); `webhook-crons` contains only the watcher entry — no One Local job (**no sweep, no privacy purge job**). `docs/JOURNAL.md` (privacy entry) says the scheduled retention clean-up is not built.

### 1.4 Application-level events (code → code)

| EVENT | PRODUCER | CONSUMER | PAYLOAD | DB EFFECT |
|---|---|---|---|---|
| "Order successful" | `store.ts createCheckout` (COD); `payments.ts markPaid` / `switchToCash` | `dispatch.ts dispatchOrders` → `createJobForOrder` → `createJob` | `ol_order_id` | `delivery_jobs`, `delivery_events` (see 03 §3.D) |
| "Restaurant accepted" | `restaurant.ts act('accept')` | `dispatch.ts onRestaurantAccepted` | `pos_order_id`, `prep_minutes` | `dispatch_release` if a job exists |
| "Restaurant rejected" | `restaurant.ts act('reject')` | `dispatch.ts onRestaurantRejected` | `pos_order_id`, reason | `dispatch_cancel` |
| "Restaurant timed out" | `ol_expire_unanswered` (inside `ol_partner_act`) | Dispatch **sweep** (`order_cancelled`) | – | `dispatch_cancel` on next sweep |
| Catalogue invalidation | `admin.ts` listing writes → `catalog.ts invalidateCatalog()` | catalogue cache of this process | – | none (other server processes catch up within the 30 s TTL) |

### 1.5 Push notifications (Expo Push API `https://exp.host/--/api/v2/push/send`)

| EVENT | PRODUCER | CONSUMER | PAYLOAD `data` | DB EFFECT |
|---|---|---|---|---|
| `new_order` | `restaurant.ts notifyNewOrder` — **called only by `createTestOrder`** (a real customer order does not push) | Partner app devices (`ol_partner_devices` of the org); sound `new_order.wav`, channel `new-orders`, ttl 60 s | `{type, order_id}` | dead tokens (`DeviceNotRegistered`) deleted |
| `no_rider` | `dispatch.ts afterOffer` | restaurant devices | `{type, job_id}` | same |
| `job_offer` | `afterOffer` | rider devices (`push_tokens`), `job_offer.wav`, channel `job-offers`, ttl 30 s | `{type, job_id, offer_id, expires_at}` | same |
| `job_assigned` | `afterOffer` (auto-accept) | rider | `{type, job_id}` | – |
| `job_cancelled` | `cancelJob` | rider | `{type, job_id}` | – |

### 1.6 Polling and timers (substitutes for realtime)

| Consumer | Mechanism | Interval | Source |
|---|---|---|---|
| Partner app: new orders | React Query `refetchInterval` on `GET /api/partner/orders?tab=new` (only while `accepting`) | 5 s | `partner/src/use-alert.ts`, `use-orders.ts` (10 s for other tabs) |
| Partner server: timeout detection | `ol_expire_unanswered` at the start of each partner list request | per poll | `restaurant.ts listOrders` |
| Rider app: presence | `POST /api/rider/heartbeat` | every 30 s (rider silent > 60 s counts offline) | `rider.ts` comments |
| Dispatch clock | `advanceDue(requestId, minGapMs=10 s)` from heartbeats, from rider going online, from reading an expired offer | ≥ 10 s | `dispatch.ts` |
| Customer order screen | **no polling** — one fetch on open; progress is a client timer (`TOTAL_S = 10 min`) | – | `frontend/app/order/[id].tsx` |
| Catalogue cache | 30 s TTL; service area cache 60 s; admin cache 30 s; Supabase user lookup cache 60 s (10 s on failure); migration probes every 60 s | – | various |

### 1.7 Log lines (no consumer in repo; for operators)

`[admin] {at, by, role, action, target, …}` — one per admin write (listing create/update/status, shopper block, media upload URL). `[privacy] {at, event, who(tag), …}`. `[payments]`, `[dispatch]`, `[push]`, `[store]`, `[db]`, `[api]` errors/warnings.

## 2. Events named in documents but not implemented

`checkout.created`, `order.created`, `order.accepted`, `order.cancelled`, `order.fulfilled`, `payment.*` (`docs/PLATFORM_FOUNDATIONS.md` §6.5, table `ol_order_events`); Realtime channels (D5); `pos_place_order` / `pos_mark_handed_over` POS functions (agreed names in the docs; **not in this repo, not in `db/local/0000_os_replica.sql`**; their production existence is UNKNOWN); `ol_place_checkout` single-transaction function (build-order item C5).
