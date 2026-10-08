# One Local → One Rider backend contract

**Date:** 2026-10-02 · **Status:** steps 2 of section 10 built and rehearsed on the local database (migration `0030_ol_delivery_steps.sql`, routes below marked built); the rest is proposed · **Builds on:** `docs/RIDER_DISPATCH_API.md` (what exists), `db/migrations/0029_ol_dispatch.sql` (draft, applied nowhere), `docs/RIDER_APP_E2E_V1.md` (rider-side design, sections 6 to 8)

## 0. Principle

One Local owns the delivery. One Rider is a client of it and keeps no delivery database. The two are joined by **commands over HTTPS**, never by syncing two databases.

| One Local (truth) | One Rider (execution) |
| --- | --- |
| Tables, API, dispatch, assignment, state machine, events, permissions, idempotency, conflict rulings, notifications, earnings, cash ledger | Screens, GPS, navigation, camera, OTP keypad, offline queue, retry, a local copy of the job it may show offline |

A rider action is always: **command → server validates → one transaction (job + event + order status) → new job returned.** The rider never writes a table.

## 1. Where we really are (so nothing is rebuilt)

Built and rehearsed on the local database (0029 and `dispatch-*` scripts): rider pool, offers, accept/decline, `delivery_jobs` with `version`, `delivery_events` outbox, one job per order, one winner per offer, cancel before pickup, sweep.

**Not built, and what this contract is:** everything from `assigned` onward: steps, pickup check, proof, exceptions, reassignment, earnings, cash. Plus three things the draft lacks: idempotency on rider commands, the rider-granular step, and rider-scoped read rules.

## 2. Canonical state: decision

The database holds **nine coarse states** today (`created, offered, assigned, at_pickup, picked_up, at_drop, delivered, exception, cancelled`). The rider design has **fifteen**.

**Decision (recommended): keep the nine as the one truth and add a `step` column for the fine position.** The rider's fifteen are a display derived from `(status, step, exception_kind)`. The alternative, widening `status` to fifteen, lost: the customer screen, the restaurant and operations only need the coarse state, and the check constraint is already in the draft.

| Rider display state | `status` | `step` |
| --- | --- | --- |
| offered | offered | null |
| accepted | assigned | `accepted` |
| to_pickup | assigned | `to_pickup` |
| at_pickup | at_pickup | `waiting` |
| pickup_verified | at_pickup | `verified` |
| picked_up | picked_up | `picked_up` |
| to_drop | picked_up | `to_drop` |
| at_drop | at_drop | `arrived` |
| handover | at_drop | `handover` |
| proof | at_drop | `proof` |
| delivered | delivered | null |
| failed / returned | exception → closed by operations | `failed` / `returned` |
| cancelled | cancelled | null |

Forward-only transitions (anything else is `409 invalid_transition`):

```
assigned/accepted → assigned/to_pickup → at_pickup/waiting → at_pickup/verified → picked_up/picked_up
 → picked_up/to_drop → at_drop/arrived → at_drop/handover → at_drop/proof → delivered
any live state → exception (only via the exception command) → operations resolves → previous state | failed | returned
```

## 3. Migrations (One Local first, in this order)

Numbers are placeholders; the OS ledger assigns real ones. Each is additive and each function is service-role only, like 0029.

| # | Adds | Why |
| --- | --- | --- |
| A | **Apply 0029** (needs 0025, 0026) | Foundation. Founder approval first. |
| B `…_delivery_steps` | `delivery_jobs.step`, `exception_kind`, `picked_up_at`, `delivered_at`; `delivery_commands(job_id, idempotency_key, command, request_hash, response jsonb, created_at, unique(job_id, idempotency_key))`; `delivery_proofs`; `delivery_exceptions`; function `dispatch_step`, `dispatch_verify_pickup`, `dispatch_submit_proof`, `dispatch_raise_exception`, `dispatch_resolve_exception` | The missing half of the job, with replay safety |
| C `…_delivery_order_sync` | Inside `dispatch_step`/`submit_proof`: write the order's own status (`picked_up` → `out`, `delivered` → `delivered`) in the **same transaction**, including the POS order when `pos_order_id` is set | Today four places hold progress and drift (audit `03`, `10`) |
| D `…_rider_money` | `earnings_rules`, `rider_earnings`, `rider_cash_ledger` (append-only), cash-limit check in availability | Earnings and COD cash |
| E `…_rider_rls` | Select policies so a rider's own login can read **only their** `delivery_jobs`, `delivery_assignments`, `rider_earnings`, `rider_cash_ledger`; ops roles read their organisation or location. **No** insert/update/delete policy for anyone: writes stay behind functions | Realtime and offline refresh without the service key; the current "server filter is the permission" stays as defence in depth |
| F `…_rider_onboarding` | Registration, documents, payout, zone, hub | Last: riders are approved by hand until then |

## 4. Idempotency and version rules (every state-changing rider command)

Headers: `Authorization: Bearer <rider Supabase token>`, `Idempotency-Key` (required), `X-Request-Id`, `X-App-Version`.

- First time a key is seen for a job: execute, store the full response in `delivery_commands`.
- Same key and same body again: return the stored response, `200`, header `Idempotent-Replay: true`. Five retries = one change.
- Same key, different body: `422 idempotency_mismatch`.
- Body carries `version` (the version the rider saw). If it is not the server's: `409 version_conflict` with `{ server_version, status, step, job }`. The rider replaces its local job with the returned one, drops queued commands already satisfied, and re-sends what is still valid.
- A replayed command whose effect already happened but whose version is old returns the stored response, not a conflict (the key is checked first).
- Offline commands carry `recorded_at`; the server stores it as the event time (never later than arrival) and its own `created_at` as arrival time. A `stale_command` refusal for very old commands is not built.

Error body, everywhere: `{ "detail": "human message", "code": "machine_code" }`.

## 5. Rider API (`/api/rider/*`)

Existing (unchanged): `POST availability`, `POST heartbeat`, `PUT push-token`, `GET offers/current`, `POST offers/:id/accept`, `POST offers/:id/decline`, `GET jobs/current`, `GET jobs/:id`. Add `Idempotency-Key` to accept, decline and availability.

### 5.1 Step
`POST /api/rider/jobs/:id/step`
```json
{ "to": "to_pickup", "version": 4, "lat": 18.4, "lng": 76.57, "accuracy_m": 12,
  "recorded_at": "2026-10-02T10:15:00Z", "reason": null }
```
`to` ∈ `to_pickup | at_pickup | picked_up | to_drop | at_drop | handover | proof` (built). Rules: caller is the job's `rider_id`; transition is the next legal one (section 2); `at_pickup` needs the rider within 150 m of the store pin with accuracy ≤ 50 m; `at_drop` is not distance-blocked. Too far: `422 too_far` with `{distance_m}`, and the rider may resend with a `reason` (soft rule, flagged on the event).
Response `200`: the job (section 6). Event: `delivery.at_pickup`, `delivery.to_drop`, … (section 8).

### 5.2 Verify pickup (built, checklist only)
`POST /api/rider/jobs/:id/pickup-verify` → `{ "version": 5, "items_ok": true }`; `items_ok: false` is `422 pickup_mismatch`. A kitchen-read code is not built (open question 4). Success moves `step` to `verified`; on a mismatch the rider uses the exception command.

### 5.3 Picked up
`POST /api/rider/jobs/:id/step` with `to: "picked_up"` (needs `verified`). This is the moment cancel becomes `409 already_picked_up` (already enforced) and the order flips to `out`. The exact customer address, point and notes are released to the rider here, as today.

### 5.4 Proof of delivery
`POST /api/rider/jobs/:id/proof`
```json
{ "version": 8, "method": "otp", "code": "4821", "lat": 18.42, "lng": 76.58,
  "cash_collected": 349.00, "recorded_at": "…" }
```
`method` ∈ `otp | photo | signature` (photo and signature carry `asset_id` from the upload endpoint). Rules: step must be `proof`; OTP compared to `otp_hash`; wrong code: `422 otp_invalid` with `{attempts_left}`; the 5th wrong code: `423 otp_locked` and an `exception:proof_failed` is raised for operations; a proof more than 300 m from the drop pin is accepted and flagged; `cash_collected` must equal `cash_to_collect` for COD, else `422 cash_mismatch`.
One transaction: proof row, job → `delivered`, order → `delivered`, `rider_earnings` row, `rider_cash_ledger` line (COD), event, customer push. Response: the job plus `{ earnings: { total, lines[] }, cash_in_hand }`.

### 5.5 Exception
`POST /api/rider/jobs/:id/exception`
`{ "version": 6, "kind": "not_ready|mismatch|incomplete|vehicle|safety|unavailable|address|refused|other", "note": "…", "asset_id": null, "lat": …, "lng": …, "corrected_lat": null, "corrected_lng": null }`
Job → `exception` (previous status kept in `exception_from`). Response includes `next_actions` for the rider (for `not_ready`: wait timer; `vehicle`: request reassignment; `unavailable`: call ×2 then wait). `safety` also pages operations at once. Rider cannot clear an exception; operations does (section 7).

### 5.6 Reads
`GET /api/rider/me` (profile, status, acceptance, cash in hand, today `{earnings, jobs}`) · `GET /api/rider/earnings?range=today|week|month` · `GET /api/rider/earnings/jobs/:id` · `GET /api/rider/cash` · `GET /api/rider/jobs?status=completed&cursor=` (history). All read-only, own rows only.

### 5.7 Files
`POST /api/rider/uploads` → `{ upload_url, asset_id }` for photo, signature and exception evidence; assets are private and tied to the job.

## 6. The job payload (one shape, every response)

```json
{
  "id": "uuid", "order_ref": "#9824", "status": "at_drop", "step": "handover", "version": 9,
  "display_state": "handover",
  "pickup": { "name": "Shree Restaurant", "area": "Station Road", "address": "…", "lat": 18.4, "lng": 76.57, "prep_ready": true },
  "drop":   { "area": "Shanti Enclave", "address": null, "lat": null, "lng": null, "notes": null, "customer_first_name": "Asha", "customer_phone": null },
  "items_count": 3, "cash_to_collect": 349.00, "payment_mode": "cod", "proof_methods": ["otp","photo"],
  "payout_estimate": null,
  "timeline": [ { "kind": "delivery.assigned", "at": "…" } ],
  "next": ["proof"], "exception": null
}
```
Visibility rules unchanged from `RIDER_DISPATCH_API.md`: drop address, point and notes only from `picked_up`; phone only while live; no item prices; never the delivery code or pickup code. `display_state` is computed by the server so the app never needs the table in section 2.

## 7. Server and operations side

| Route | Caller | What |
| --- | --- | --- |
| existing `POST/GET /api/dispatch/jobs…`, `release`, `cancel`, `sweep` | One Local, signed service credential | unchanged |
| `POST /api/dispatch/jobs/:id/reassign` | operations | withdraws the rider, bumps `version`, re-offers; allowed before `picked_up` |
| `POST /api/dispatch/exceptions/:id/resolve` | operations | `{ outcome: "resume"\|"reassign"\|"return"\|"fail"\|"cancel", note, compensation? }` |
| `GET /api/dispatch/events?after=<id>&limit=` | One Local, POS, Master | pull the outbox by cursor; `delivery_events.id` is the cursor |
| `GET /api/dispatch/riders`, `POST …/approve\|reject\|suspend` | operations | the admin set from `RIDER_APP_E2E_V1.md` section 8 |

**Order side effects (migration C):** `picked_up` → order `out`; `delivered` → order `delivered` and POS order closed; `cancelled`/`failed` → order notified. One Local never writes `delivery_jobs.status`, and dispatch never writes an order's status except through these functions, so the "four unsynchronised places" in the audit collapse to one writer.

## 8. Events (`delivery_events.kind`, `v: 1`)

Existing: `delivery.created, .released, .offered, .assigned, .rejected, .timed_out, .no_rider, .cancelled`.
Built in 0030: `delivery.to_pickup, .at_pickup, .pickup_verified, .picked_up, .to_drop, .at_drop, .handover, .proof_requested, .proof_submitted, .delivered, .exception, .exception_resolved, .reassigned`.
Still to come (migration D): `.cash_recorded, .earnings_posted`.

Every event is written in the same transaction as its change. `meta` carries `request_id, actor, rider_id, version_before, version_after, recorded_at, soft_flags[]`; never names, phones or addresses.

## 9. Authentication and access

| Caller | Credential | Reaches |
| --- | --- | --- |
| One Local, POS, Master | service token + HMAC signature, 5-minute window, `Idempotency-Key` on POST | `/api/dispatch/*` |
| Rider app | rider's own Supabase login with an `approved` `riders` row | `/api/rider/*`, own rows only |
| Operations | Master/partner login with role check | `/api/dispatch/*` admin set |
| Anyone else | none | nothing; tables have no anon or authenticated write grants |

A rider token is refused on `/api/dispatch/*` and a service token on `/api/rider/*`. Scope rules: Rider A sees jobs offered to or assigned to Rider A only; an operations manager sees every job of the organisations and locations the role grants.

## 10. Build order and the proof for each

1. Apply 0029 on a staging copy; run `db/tests/0029_dispatch_scenario.sql`.
2. Migration B + functions + `step`, `pickup-verify`, `proof`, `exception` routes. Proof: SQL scenario (happy path, double tap, retry ×5 = one change, stale version, 5 wrong OTPs, exception, reassign) and an HTTP script like `dispatch-integration.ts`.
3. Migration C. Proof: order status follows the job in one transaction; a failure rolls both back.
4. Migration E. Proof: rider A cannot read rider B's job through the Supabase client.
5. Migration D after earnings rates are decided.
6. Rider app switches from its mock to these routes, behind the `x-app` header.

## 10b. Built so far (2026-10-02, local database only)

- `db/migrations/0030_ol_delivery_steps.sql` (needs 0029): `step` and exception columns, `delivery_commands`, `delivery_proofs`, `delivery_exceptions`, and the functions `dispatch_step`, `dispatch_verify_pickup`, `dispatch_submit_proof`, `dispatch_raise_exception`, `dispatch_reassign`, `dispatch_resolve_exception`.
- Rider routes: `POST /api/rider/jobs/:id/step | pickup-verify | proof | exception`. Not built: `uploads` (photo and signature proof need an `asset_id` from it), `me`, earnings, cash, history.
- Operations routes (service credential for now, not an operations login): `POST /api/dispatch/jobs/:id/reassign`, `POST /api/dispatch/exceptions/:id/resolve`, `GET /api/dispatch/events?after=`.
- Checks: `db/tests/0030_steps_scenario.sql` (rolled back) and 28 new checks in `frontend/scripts/dispatch-integration.ts` (65 in all); the 45 database-free checks and the type check still pass.
- Known gaps: a rider whose job is in `exception` can still be offered another job (the busy list in `dispatch_offer_next` of 0029 omits it); `dispatch_cancel` of 0029 can cancel an exception job that was already picked up; the order's own status does not follow the job yet (migration C).

## 11. Open questions for the founder

1. **Coarse status plus `step`** (recommended) or all fifteen states in `status`?
2. **Rider pay per delivery** (base, per-km, peak): needed before `earnings` can be more than zero.
3. **Cash limit** and who confirms a rider's cash deposit.
4. **Pickup check:** barcode/QR on the bag, a short code the kitchen reads out, or a plain checklist?
5. **Proof of a contactless drop:** is a photo alone enough for food?
6. **Who may reassign or resolve an exception:** operations only, or the restaurant manager for `not_ready`?
7. The audit's open point still blocks full flow: a customer order never reaches the restaurant, so the job can be created but `accepted`/`ready` never happen for a real customer order.
