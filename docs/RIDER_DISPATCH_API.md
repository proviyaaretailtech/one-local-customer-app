# Rider dispatch: what is built

**Date:** 2026-10-02 · **Contract:** `One Local Delivery app /docs/RIDER_DISPATCH_CONTRACT.md` (the shapes both sides agreed) · **Rider app:** `One Rider app /onedriver/OL-ui/rider` (`docs/API_MAP.md`) · **Schema:** `db/migrations/0029_ol_dispatch.sql` (**a draft, applied nowhere**)

Every successful delivery order pings the rider pool until a driver is assigned. This page says what exists, how to run it and what is not built.

## 1. The flow

```
cash order placed ──────────────┐
online order, payment confirmed ┴─► dispatchOrders()  (store.ts / payments.ts, in-process)
                                       │ one job per order (idempotent), the customer's 6-digit code derived (HMAC, OTP_HMAC_SECRET), not stored
                                       ▼
                     delivery_jobs  created ─► released (trigger "placed": at once; "accepted": when the restaurant accepts)
                                       │
                                       ▼ dispatch_offer_next, one rider at a time, 30 s each
        linked riders first ─► then the nearest solo rider ─► push to the phone + GET /rider/offers/current
                                       │ accept = assigned (first answer wins) · decline / lapse = next rider
                                       ▼ after 3 offers (or 3 x 30 s with nobody online): delivery.no_rider, restaurant phone alerted
```

A retry never makes a second job, and an order never fails because dispatch is down: the hook logs, and the sweep creates any job that is missing (orders of the last 24 hours only).

## 2. Endpoints

**Server to server** (`/api/dispatch/*`): `Authorization: Bearer <DISPATCH_SERVICE_TOKEN>`, `X-Request-Id`, `X-Timestamp` (unix seconds or ISO, within 5 minutes), `X-Signature` = hex `HMAC-SHA256(DISPATCH_SIGNING_SECRET, timestamp + "." + raw body)` (also on GET, with an empty body), and `Idempotency-Key` on every POST. A user's token is refused.

| Route | What it does |
| --- | --- |
| `POST /api/dispatch/jobs` | Creates the job and pings the pool. `201`, or `200` with the first job on a repeat. Body: contract 2.1 (`organization_id` may be null for a store with no merchant yet) |
| `GET /api/dispatch/jobs/:id` or `GET /api/dispatch/jobs?ol_order_id=` | Status, rider first name and position, ETA, timeline. No rider phone |
| `POST /api/dispatch/jobs/:id/release` | Starts offering (trigger "accepted", or operations re-dispatching a job that found nobody) |
| `POST /api/dispatch/jobs/:id/cancel` | `{reason}`: before pickup cancels and closes any rider's offer; after pickup `409 already_picked_up` |
| `POST /api/dispatch/sweep` | Run every 15–30 s by a scheduler: moves lapsed offers on, escalates, cancels jobs of cancelled orders, creates missing jobs |

Errors: `{ detail, code }`. Codes: `invalid_payload` (names the field), `unauthorized`, `bad_signature`, `stale_request`, `organization_not_allowed` (403), `order_not_deliverable` (409), `no_pickup_location` and `outside_delivery_area` (422), `already_picked_up` (409), `not_configured` (503).

**Rider side** (`/api/rider/*`, the rider's own Supabase login with an approved `riders` row): `POST availability`, `POST heartbeat`, `PUT push-token`, `GET offers/current` (204 when none), `POST offers/:id/accept`, `POST offers/:id/decline`, `GET jobs/current`, `GET jobs/:id`. Codes: `not_enrolled`, `not_approved`, `suspended`, `out_of_zone`, `offer_expired`, `already_taken`, `offer_withdrawn`.

What a rider sees: the area before pickup, the street address, exact point and instructions only from `picked_up`; a first name; the customer's phone only while the job is live; cash to collect and the item count, never item prices; never the delivery code.

## 3. To switch it on

1. The founder approves migration `0029` (it needs 0025 and 0026 first) and sends it to the OS ledger for its real number.
2. Set `DISPATCH_SERVICE_TOKEN`, `DISPATCH_SIGNING_SECRET` and `OTP_HMAC_SECRET` (the key of the delivery code; required in production and never the same as the signing secret; outside production it falls back to a local value). Optionally `DISPATCH_ALLOWED_ORGS`. Jobs created before the 6-digit code keep their 4-digit `sha256_v1` code (`delivery_jobs.otp_scheme`/`otp_digits`) on the server only. Until `DISPATCH_SIGNING_SECRET` is set, orders are placed and no rider is pinged.
3. Schedule `POST /api/dispatch/sweep` every 15–30 seconds. Rider heartbeats also move offers on while any rider is online, but only the sweep escalates an empty pool.
4. Riders need an `approved` row in `riders` (there is no onboarding endpoint yet) and, for a restaurant's own riders, a row in `rider_store_links` or `riders.organization_id`.
5. A store needs a map point: `ol_stores.lat/lng` (migration 0028) or `ol_merchant_channels.lat/lng`. Without one the job is refused with `no_pickup_location` and the order shows in `delivery_orders_needing_rider`.

## 4. How it was checked

| Check | What it covers | Result |
| --- | --- | --- |
| `npx tsx scripts/dispatch-checks.ts` (no database) | service credential, payload rules, delivery code, what a rider may see, rider routes refuse strangers | 45 pass |
| `db/tests/0029_dispatch_scenario.sql` (local database, rolled back) | one job per order, linked rider first, decline, lapse, late rider, one winner, double accept, cancel, escalation, re-dispatch, 24-hour window | passes |
| `npx tsx scripts/dispatch-integration.ts` (local database, real server code) | the above through the HTTP handlers, plus push, sweep, auto-accept, online-only-when-paid | 37 pass |

The existing suites still pass (checkout 42, admin 96, privacy 56) and the type check is clean. Nothing was run against production, and nothing was tried with a real phone or a real rider.

## 5. Not built (by design of this step)

- **Everything after assignment:** `step`, pickup verification, tracking points, proof/OTP check, exceptions, SOS, cash ledger, earnings. The job stops at `assigned`; the mapping to the order's own status (`picked_up` → `out`, `delivered`) belongs with those endpoints.
- **Rider onboarding** (register, KYC, vehicle, payout, zone and hub): the rider app's `docs/API_MAP.md` lists them; riders are approved by hand for now.
- **Showing the assigned rider to the customer:** One Local still shows "Sample rider". The tracking screen should read `GET /api/dispatch/jobs?ol_order_id=` through One Local's own order route (the customer's app must never hold the service credential).
- **Rider pay:** `payout_estimate` is `null` until the rates are set (contract question 5).
- **Zones and PostGIS:** distance is a straight line within `search_radius_km` (default 8). Zones from `RIDER_APP_E2E_V1.md` section 2 replace `dispatch_km()` later.
- **Cash limit** check when going online (needs the cash ledger).
- **Restaurant timeout** cancels the job through the sweep (up to one sweep interval late), not instantly.
