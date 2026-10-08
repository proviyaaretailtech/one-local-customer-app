# 11 — UNKNOWN OR UNVERIFIED (One Local / OL-ui)

Everything below could not be established from this repository alone. Items are grouped by why. "DOC-CLAIM" = stated in `docs/` or `docs/JOURNAL.md` but not provable from code or SQL.

## 1. Live database state (this audit read files only; no database was queried)

| # | Unknown | What the repo says |
|---|---|---|
| U1 | Which migrations are actually applied to production project `ywylhzcxuoeilygzdonx` | DOC-CLAIM (journal 2026-09-27): 0021–0024 live; 0025–0029 not applied (0025/0026 on the local DB; 0029 tried locally and removed). Verify with `python3 scripts/db.py status` (read-only) |
| U2 | Current production row counts (orders, listings, riders, etc.) | Journal: demo catalogue removed 2026-09-27; 9 organizations in OS (`CENTRAL_DB_MAP.md` 2026-09-22 snapshot: 9 organizations, 41 POS orders, 26 `org_users`). Not re-checked |
| U3 | Whether `ol_orders` in production contains orders with `organization_id` / `pos_order_id` (i.e. any P2-path orders other than Partner test orders) | – |
| U4 | Whether `ol_order_items` has any rows in production (INFERRED FK failure would leave it empty) | – |
| U5 | RLS **policies** on all OS/POS tables and on `platform_admins`, `locations`, `menu_item_variants` | Counts only in `CENTRAL_DB_MAP.md` (140 total); the local replica has none |
| U6 | Storage policies on `storage.objects` for `onecity-catalog` | none defined here |
| U7 | Whether the production `orders.status` / `payments.method` CHECK lists equal the local replica's | replica is "generated from production's catalog" (header) as of its generation date |
| U8 | Production values of Postgres `realtime` publication membership | not configured in this repo |
| U9 | Whether `locations` has rows and whether Master-created listings use `location_id` | snapshot: 0 rows |
| U10 | Exact Supabase Auth providers enabled (phone OTP SMS provider, Google OAuth, email confirmation) | the app asks `GET /auth/v1/settings` at runtime; local `config.toml` defaults only |

## 2. Behaviour outside this repository

| # | Unknown | Notes |
|---|---|---|
| U11 | The **Rider app** (One Rider / One Local Delivery): how it handles pickup, drop, proof, OTP verification, exceptions, cash; who sets `delivery_jobs.status` beyond `assigned`; how riders are created/approved | Only the pool-and-offer half is in this repo (`rider.ts`); docs `PRD_ONLATUR_RIDER_V1.md`, `RIDER_APP_E2E_V1.md`, `RIDER_DISPATCH_API.md` describe the rest |
| U12 | The **POS (VINII, Flutter/web)**: how it consumes One Local orders, whether it reads `external_ref`, whether it handles `placed_by='integration'`, `channel='online'`; existence in production of `pos_place_order`, `pos_set_order_status`, `pos_mark_handed_over` (named in `PLATFORM_FOUNDATIONS.md` §6) | not in this repo or its replica |
| U13 | The **Master (Repo-1-)**: whether it already calls `/api/admin/*`, what it writes directly, whether it reads `ol_*` tables | `MASTER_CONTRACT_V1.md`, `MASTER_ADMIN_HANDSHAKE.md` |
| U14 | **Who calls `POST /api/dispatch/sweep`** and how often; who holds `DISPATCH_SERVICE_TOKEN`/`DISPATCH_SIGNING_SECRET`; whether dispatch is configured in any deployed environment | journal: "A scheduler must call the sweep every 15 to 30 seconds once this is live" |
| U15 | Any scheduler for privacy retention purge | journal: "not built" |
| U16 | How a customer-checkout food order would be routed to a restaurant (which function, which key mapping product id → `menu_item_id`) | documented as a future `ol_place_checkout` → `pos_place_order` (build-order C5); not in code |
| U17 | Who accepts / progresses a customer-checkout order that has no `organization_id` (e.g. grocery/shop stores) | no code path found |
| U18 | Whether the customer is ever shown the delivery code | `deliveryOtp()` has no caller outside `dispatch.ts` |
| U19 | Which of the two "order stage" truths the customer should see in future | UI uses a timer today |
| U20 | Where the Expo API server is actually deployed (`BACKEND_URL` is an env var). Docs name Vercel as the production host (`docs/MASTER_ADMIN_HANDSHAKE.md`, `docs/DPDP.md`: "Vercel or a container host"); `.emergent/*` shows an Emergent preview-pod setup. Not confirmed | `docs/`, `.emergent/*`, `app.config.ts` |
| U21 | `EAS_PROJECT_ID` / OTA update channel in use | env |
| U22 | Which screens call the SecureStore wrapper (`frontend/src/utils/storage/index.ts`) | not traced |
| U23 | Whether `backend/` (FastAPI media store + seed scripts) is still deployed anywhere | no server entry file in repo; `/api/media/[id]` replaces it |
| U24 | Pricing items the founder has not decided: handling fee, platform fee, GST on delivery, GST rate per category (CA), rider payout per delivery | `pricing.ts` constants, `docs/JOURNAL.md` open questions |
| U25 | Refund policy and the money-movement path (cash handback, Razorpay refund API) | `0024` header: "Phase 3 concern" |

## 3. INFERRED statements (deduced from code, not written down)

| # | Inference | Basis |
|---|---|---|
| I1 | Customer-checkout orders never reach the Partner app or the POS | `createCheckout` sets no `organization_id`/`pos_order_id`; `restaurant.ts` filters on `organization_id`; journal admits "not yet connected" |
| I2 | `ol_orders.status` of a customer-checkout order stays `placed` indefinitely | the only writers of `ol_orders.status` are `ol_partner_act` and the checkout insert |
| I3 | `ol_order_items` inserts fail for marketplace products | FK `product_id → ol_products(id)`; marketplace ids are synthetic `<store>_<uuid>` strings absent from `ol_products`; `ol_products` emptied by the clean-up |
| I4 | A COD checkout order stays `payment_status = 'not_charged'` forever | no code marks cash collected for non-POS-linked orders |
| I5 | `ol_expire_unanswered` is the only timeout trigger and depends on a Partner app polling the list | called only from `restaurant.ts listOrders` |
| I6 | A blocked shopper can keep using an existing access token for up to ~60 s | `auth.ts` cache TTL |
| I7 | `ol_refunds.status` `requested/approved/rejected` are never written | no writer |
| I8 | `backend/` Python is legacy | no server file; `BACKEND_REARCHITECTURE_PLAN.md` |
| I9 | Possible `riders` table collision with the rider app's planned table | docs vs 0029 |
| I10 | Two simultaneous servers would each hold separate rate-limit buckets and catalogue caches | in-process Maps |
| I11 | A customer order without `user_id` (device-only) has no name/phone on the delivery job | `createJobForOrder` reads user metadata only when `o.user_id` |

## 4. Not examined

- Binary/large assets (`frontend/assets`, `Sources/`, `backups/`) and `node_modules`.
- The content of `frontend/server/data/catalog.json` (4,092 lines, demo seed), `india-places.tsv.gz`, `media.json` beyond their role.
- `frontend/e2e/*`, `test_reports/*`, `tests/`, `design_guidelines.json`, `image_testing.md` — test/design material.
- `docs/*.pdf`, `docs/research/*`, `docs/ONELOCAL_COINS_PLAN.md`, `docs/SWIGGY_*` reference/planning docs were not read in full; only headings of `PLATFORM_FOUNDATIONS.md` and the journal were used.
- Git history other than the status given at session start.
- The `ios/` native project and `frontend/targets/widget` Swift beyond their names.
- `.env`, `.env.local` contents were deliberately **not** opened (secrets). Variable names come from code.
