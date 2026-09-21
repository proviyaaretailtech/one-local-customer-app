# One Latur — Backend Re-architecture Plan (MongoDB out, one shared Postgres in)

**Status:** proposal for founder sign-off · **Audit date:** 2026-09-21 · **Owner:** backend
**Supersedes:** `docs/SUPABASE_MIGRATION_PLAN.md` (in part), `backend/schema.sql`, and my first-cut `backend/migrations_ol.sql` (do **not** run that file).

This plan is grounded in a read of every backend route, every frontend network call, all 38 screens, the seed scripts, and the sibling projects that share this database (`proviyaa-pos` decision record D01–D10 and its architecture summary). Where I could not verify something (the live contents of the shared Supabase project) it is marked **UNVERIFIED**.

---

## 0. Read this first

### 0.1 What is true today (one paragraph)
The app shows "Couldn't load this right now" because nothing serves its data: FastAPI was never running, and the version of the backend that serves the catalogue (`server_old.py`) had lost its imports. I repaired it (it now serves on :8001 through a dev proxy). **No feature of the app runs on Supabase today.** The 2026-09-20 journal entry describes a Supabase migration as delivered; in reality the tables in `schema.sql` were never created in the project (the anon key sees none of `users`, `products`, `stores`, `rides`, `addresses`, `categories` — every probe returned a schema-cache miss), `server.py` implements a different, smaller API than the UI uses (and accepts any token as a fake user — F20), and the frontend Supabase helpers point at tables that belong to *other* apps. Treat Phase 1–2 of that entry as "designed", not "done".

### 0.2 Two corrections to what I told you earlier
1. **Do not run `backend/migrations_ol.sql` (or the seed script) on the shared project.** The POS decision record (D06) says the Proviyaa OS repository owns central schema migrations; a second migration history applied by hand is exactly what it forbids. **Correction (2026-09-22):** the first draft *was* applied — 14 empty `ol_*` tables with public-read policies exist in production (see `docs/CENTRAL_DB_MAP.md`). They hold no data; this plan replaces them.
2. **The `ol_` prefix in `public` is the wrong isolation tool.** Use dedicated Postgres schemas that the Data API does not expose (see §3.3).
3. **My interim write shim was unsafe and is fixed.** It named Supabase tables after the old Mongo collections, so `orders` would have pointed at the *shared* project's `public.orders`. The anon key is denied there and no order was ever placed through it, so nothing was written; it is now memory-only (writes vanish on restart) until Phase 2–5 replace it.

### 0.3 The plan in five lines
1. **One database, one API.** Only the API talks to Postgres. Apps never hold the admin key; every service gets its own least-privilege database role.
2. **Postgres schemas by domain** (`core` OS-owned, `catalogue`, `commerce`, `onecity`, `media`, `platform`), none exposed to the Data API, RLS on everything as the second lock.
3. **Supabase Storage replaces both Mongo `catalog_assets` and the Emergent object-store proxy**; uploads go browser/phone → Storage via short-lived signed URLs the API issues after checking who you are and what you may upload.
4. **Identity first:** Supabase Auth (guest session → phone OTP at checkout). Today there is no sign-in and no way to know whose order is whose.
5. **Rate limiting in three layers** (edge, per-identity API budgets, domain quotas such as AI spend), with a uniform 429 contract.

### 0.4 Decisions I need from you (details in §12)
| # | Decision | My default if you say "your call" | Needed by |
|---|---|---|---|
| D1 | What environment is Supabase project `ywylhzcxuoeilygzdonx` (prod / staging / dev / One Local's own)? | Treat as **shared staging**; develop on a local Supabase (Docker) + a new dev project | Phase 0 |
| D2 | Schema governance: OK to author migrations here in PR-ready form and hand them to the OS repo? | Yes | Phase 0 |
| D3 | Give me a **read-only schema dump** of the central project (or the OS repo `Repo-1-` migrations) so I can reconcile instead of guess | — | Phase 0 |
| D4 | Start clean (no port of old Mongo demo data)? | Yes — it is all sample data and Mongo is unreachable anyway | Phase 0 |
| D5 | Guest checkout allowed? | No: browse as guest, phone OTP at checkout | Phase 4 |
| D6 | Mixed-store carts split into one order per merchant? | Yes (the tenant-isolation rule requires it — §4.3) | Phase 5 |
| D7 | API hosting + Redis | Always-on container host (Fly/Railway/Render/Cloud Run) + Upstash Redis | Phase 2 |
| D8 | Keep the Emergent LLM gateway, or use provider keys directly? | Keep for now (only its storage half is removed) | Phase 6 |
| D9 | Wallet: promo credits only, or real-money top-ups? | Promo credits only (real stored value can bring RBI prepaid-instrument obligations — take advice first) | Phase 5 |
| D10 | Delivery fee / platform fee / tax rules (POS Q01) | Blocks *real* checkout totals; keep sample rules until answered | Phase 5 |
| D11 | Where do the merchant/admin **upload screens** live? | A role-gated, web-only `/admin` route group in this Expo project now; VINII POS / Master reuse the same API later | Phase 3 |

---

## 1. Baseline audit — what is actually there

### 1.1 MongoDB footprint (complete list)
No Mongo instance is reachable from this machine (`MONGO_URL` is blank, port 27017 closed), so **there is nothing to export** and nothing running depends on it except the routes below. The catalogue itself was never in Mongo: it is Python lists (`catalog_data.py`, `city_catalog.py`, `store_catalog.py`, `server_old.py`).

| Mongo collection | Written by | Read by | Target |
|---|---|---|---|
| `catalog_assets` (id → storage_path, content_type, source) | 6 seed scripts, `transcode_reels.py` | `media_store.media` (`GET /api/media/{id}`) | `media.asset` + Supabase Storage. **Re-creatable** from the source URLs in the seed scripts (57 of 65 distinct URLs answer today, §5.4) |
| `orders` | `POST /api/orders` | `GET /api/orders`, `GET /api/orders/{id}` | `commerce.checkout / order / order_line / order_status_event` |
| `booking_enquiries` | `POST /api/booking-enquiries` | *(nothing — the app reads its own local copy)* | `onecity.booking_enquiry` |
| `support_requests` | `POST /api/support-requests` | *(nothing)* | `onecity.support_ticket` |
| `assistant_sessions` (embedded `messages[]`, last 40, `busy_until` lock) | `assistant.py` | `assistant.py` | `onecity.assistant_session` + `assistant_message` |
| `ai_usage` (one global counter per hour) | `ai_search.limit()` | same | `platform.usage_counter` (per user / IP / global) |
| `search_uploads` (path of private photos) | `POST /api/search/image` | *(nothing)* | `media.asset` in a private bucket with an expiry |

Files that touch Mongo: `assistant.py`, `ai_search.py`, `media_store.py`, `server_old.py` (my temporary shim), `seed_media.py`, `seed_city_media.py`, `seed_store_assets.py`, `seed_motion_assets.py`, `seed_festival_refresh.py`, `transcode_reels.py`.

**Seed volume** (what the importer must carry): 32 categories · 46 brands · 84 products (54 grocery, 13 shops, 8 beauty, 6 food, 3 pharmacy) · 49 storefronts · 3 banners · 8 discover chips · 3 coupons · 4 events · 6 reels · 5 themed collections.

### 1.2 Findings register
Severity is about real-world impact if this shipped as-is.

| ID | Sev | Finding | Evidence | Fixed in |
|---|---|---|---|---|
| F1 | **Critical** | `GET /api/orders` returns **every customer's orders** to any caller. No auth, no owner filter | `server_old.py` `list_orders` | P1 (disable) → P2/P4 |
| F2 | High | `POST /api/orders` trusts client prices, totals, delivery fee, discount, coupon and image URLs; no idempotency (double-tap = two orders); no availability, store-open or service-area check | `create_order`, `cart.tsx` `handleCheckout` | P1 (server recompute) → P5 |
| F3 | High | One order holds items from many merchants with one total. Incompatible with tenant isolation: a merchant must only ever see its own lines | `Order` model; cart mixes `store_id`s | P5 (§4.3) |
| F4 | High | Every order is created with a hard-coded rider ("Suraj", +91 98765 43210) and 10-min ETA; `payment_status` can only be `not_charged` | `Order` model | P5 |
| F5 | High | `src/lib/supabase.ts` queries `public.products/orders/stores/categories` (other apps' tables in the shared project), hard-codes project URL and key as fallbacks, and calls a removed realtime API; `use-realtime-orders.ts` subscribes to `public.orders` | those two files | P1 (remove) → P5 |
| F6 | High | AI budget is **one global counter** (60/hour for everyone, assistant and search share it): one user can lock everybody out; nothing per user. The assistant and search routers are **not mounted** in the running server, so those features 404 today | `ai_search.limit`, `server_old.py` wiring | P2 (limiter) → P6 |
| F7 | Med | Assistant chats are readable by anyone holding the session UUID; sessions can be created without limit | `assistant.py` | P6 |
| F8 | Med | CORS is `*` with credentials on, and the middleware is registered twice | `server_old.py` | P1 |
| F9 | Med | Media proxy streams each file through the API and caches 100 whole files (including videos) in process memory; every image costs an API request; storage login uses `EMERGENT_LLM_KEY` | `media_store.py` | P3 |
| F10 | Med | `/catalog`, `/products`, `/stores` return everything, unpaginated; the UI loads the whole catalogue in one call and filters on the client | `use-catalog.ts`, `catalog-search.ts` | P3 |
| F11 | Med | Business rules live in the client (delivery fee ₹15 under ₹199; coupon effect) and in Python (chip `d6` = hard-coded store ids `s1–s3`; chip `d2` "new arrivals" = reversed list) | `cart.tsx`, `/products?chip` | P3 / P5 |
| F12 | Med | All customer data is on-device only (profile, addresses, wishlist, followed stores, payment preference, referral code, demo wallet, cart, booking enquiries): lost on reinstall, invisible to support and to other apps | `customer.tsx`, `followed.ts`, `bookings.ts`, `wallet.tsx` | P4 |
| F13 | Med | Order tracking is a client-side 10-minute animation; status never comes from data. `OrderTracking` and `useRealtimeOrders` exist but are not wired | `app/order/[id].tsx` | P5 |
| F14 | Med | Anonymous write endpoints with no throttle: `/booking-enquiries`, `/support-requests`, `/assistant/sessions`, `/coupons/apply` (coupon codes can be brute-forced) | `server_old.py` | P1 (interim) → P2 |
| F15 | Low | Three incompatible `orders` definitions in this workspace: `backend/schema.sql` (delivery), `shared/types/supabase.ts` (restaurant dine-in with `table_id`), and the real `public.orders` in the shared project (**UNVERIFIED**; anon key gets "permission denied") | — | P0 / P2 |
| F16 | Low | `users.role` (single role) in `schema.sql` conflicts with the OS memberships model where one person can be a customer *and* merchant staff | `schema.sql` | P2 |
| F17 | Info | Seed images are third-party (bigbasket/zepto CDNs, amul.com, Unsplash, simpleicons). Fine as sample data; replace with merchant-owned or licensed images before public launch | `seed_*.py` | P3 (upload buttons) |
| F18 | Info | No bootstrap call (min app version, feature flags, service areas): old builds cannot be steered or retired | — | P2 |
| F19 | Info | `EMERGENT_LLM_KEY`, `MONGO_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` are all empty in `.env`: AI, media storage and any server-side Supabase call cannot work here whatever the code does | `.env` | P0 |
| F20 | **Critical** *(if deployed)* | `backend/server.py` — the file the 2026-09-20 journal calls the secure multi-tenant API — treats **any** bad or forged token as the fixed user `demo_user` (the `except Exception` swallows even its own 401), so every unauthenticated caller shares one identity; `POST /profile` accepts the caller's own `role` (self-service admin); `POST /rides/{id}/status` accepts any free-text status; its queries use the anon key, so the `auth.uid()` RLS policies in `schema.sql` can never match. Not running and not used by the UI — **must never be deployed** | `get_current_user`, `update_profile`, `update_ride_status` | P2 (replaced) |

### 1.3 What is broken *right now* in the running app
Catalogue, stores, prices, coupons, cart and checkout work (checkout keeps orders in memory only). **Broken:** every product/brand/store **image** (media map lived in Mongo), the **AI assistant**, **photo/voice search**, and **order history across restarts**.

---

## 2. Design rules (inherited from the ecosystem, plus ours)

These come from the POS decision record (D06, D09) and the ecosystem architecture summary. They bind One Latur too, because it writes into the same central system.

1. **Schema ownership:** the OS repository owns central migrations and shared contracts. We author migrations in PR-ready form, prove them on a dev database, and hand them over. No hand-edits in the dashboard.
2. **No competing databases:** customer, catalogue, order, payment, refund and settlement truth is shared and domain-owned. One Latur is a *demand layer*, not a second commerce database.
3. **Tenant isolation is an invariant**, not configuration. Every merchant-owned row carries `organization_id` (and `location_id` where relevant); an order belongs to exactly one merchant.
4. **Separate state machines:** order, kitchen, delivery, payment and settlement states are separate columns/tables. The customer-facing 4-step timeline is a *derived view*.
5. **Money is integer minor units** (paise) with a currency, explicit rounding, immutable financial postings; corrections are reversals, never edits.
6. **Idempotency everywhere it matters:** every create/command carries an idempotency key; retries produce one business effect. State changes carry an expected version.
7. **Audit is append-only** (who, what, when, from where, result).
8. **Provider confirmations are verified server-side and de-duplicated** (payments).
9. **Least privilege:** no app holds the admin key. Each service has its own database role and its own storage permissions.
10. **Locality is enforced by the server** (service area), not by a label the client sends.
11. **The UI keeps working during the migration:** the current `/api/*` contract stays as a compatibility layer until old builds are retired (§6.3).

---

## 3. Target architecture

### 3.1 Picture
```
  One Latur app (Expo)     VINII POS (Flutter, Windows)     OnLatur rider app      Master / OS admin (Next.js)
        |  Auth ⟷ Supabase        |  PowerSync (D05) + commands      |                        |
        |  Storage (signed URL)   |                                  |                        |
        +-----------+-------------+-------------+--------------------+------------------------+
                    v                           v
           ┌──────────────────────────────────────────────┐
           │  Edge: CDN / WAF (coarse per-IP limits, TLS) │
           └────────────────────┬─────────────────────────┘
                                v
           ┌──────────────────────────────────────────────┐
           │  API  (FastAPI, modular: one router per domain)│
           │  auth · rate limit · idempotency · audit      │
           └───┬───────────────┬──────────────┬───────────┘
               v               v              v
        Postgres (Supabase)  Storage       Redis (limits)      LLM gateway / Razorpay (outbound only)
        schemas: core*, catalogue, commerce, onecity, media, platform     * OS-owned, read-only to us
               │
               └── Realtime (order status out to phones/POS) · Outbox events → POS / rider / push
```

### 3.2 Who talks to what

| Client | Auth | Reads/writes data via | Files | Live updates |
|---|---|---|---|---|
| One Latur app | Supabase Auth directly (sign-in only) | **API only** | Signed URLs from API → Storage | Realtime (private channel per order), polling fallback |
| VINII POS | Supabase Auth (staff) | PowerSync for local-first scope + **API commands** for writes (D05) | signed URLs | PowerSync stream |
| OnLatur rider | Supabase Auth | API only | signed URLs (delivery proof) | Realtime |
| Master / admin | Supabase Auth + role | Admin API (separate scopes) | signed URLs | — |

The rule that answers your "same admin key" concern: **the service-role key exists only inside the API (and only for Storage admin calls)**; the API's *database* access uses its own limited role. A leaked phone app can then never reach the database directly.

### 3.3 Database layout, ownership and keys

| Schema | Owner | Contents | One Latur access |
|---|---|---|---|
| `core` | **OS / Master** | organization, location, membership, role, permission, entitlement, configuration version | read-only through views |
| `catalogue` | shared (Commerce OS) | category, brand, product, product price history, location_product (availability) | read; write only via API commands |
| `commerce` | shared (Commerce OS) | customer, checkout, order, order_line, order_status_event, payment, payment_event, refund | API writes; RLS-scoped reads |
| `onecity` | **One Latur (us)** | service_area, department, storefront, banner, chip, collection, reel, event, coupon, wishlist, follow, address, profile, wallet, assistant, support, bookings, referral | full |
| `media` | shared | asset registry (replaces `catalog_assets`) | API writes |
| `platform` | shared | idempotency_key, usage_counter, audit_event, outbox_event | API writes |

*Isolation properties (all deliberate):*
- **None of these schemas is added to the Data API's exposed-schemas list.** Even if an RLS policy is wrong, the anon/publishable key cannot reach the tables at all. (Only `auth`/`storage` behave as Supabase defines.)
- **The API connects with direct Postgres (transaction pooler), not with the service-role key over PostgREST.** That gives real multi-statement transactions (an order is written atomically across 4 tables), and lets us set `request.jwt.claims` per request so **RLS still applies as a second lock** rather than being bypassed.
- **One DB role per service** with grants per schema: `onecity_api` (RW `onecity`, `commerce`, `platform`, `media`; RW `catalogue` but only exercised by the admin routes; read-only `core` views), `pos_sync` (PowerSync replication role, scoped), `fulfilment_api`, `master_admin`. No shared superuser credential in any app.
- **Every table has RLS enabled**, a policy per role, and a test that proves tenant isolation (a merchant cannot read another merchant's orders; a customer cannot read another customer's).
- `updated_at` + soft delete (`deleted_at`) + UUID primary keys on every synced table (PowerSync needs stable keys and scoping columns).

### 3.4 Environments and migration workflow
- **Local:** Supabase CLI + Docker (both installed here) → `supabase start`. All development and RLS tests run here; the shared project is never touched by development.
- **Dev:** a *new* Supabase project for One Latur development (the production project is already in **Mumbai, ap-south-1** — verified 2026-09-22). Staging = the existing shared project **only once D1 says so**. Prod = separate.
- **Migrations:** numbered SQL files in `db/migrations/` (Supabase CLI format), reviewed as PRs, applied by CI, never by hand. Each PR also proposes the same files to the OS repo (D06). Down-migrations for anything destructive.
- **Seed data:** dev/staging only, flagged `is_demo = true` on organizations/products so demo content can never mix with real merchants.
- **Secrets:** per-environment; `.env` stays git-ignored (verified: `.env`, `.env.*`, `.venv/` are ignored). The publishable key is public by design but the project URL/key must come from build config, not hard-coded fallbacks (`src/lib/supabase.ts` today).

---

## 4. Schema, derived from what the UI actually shows

### 4.1 Screen → data → tables
| Screen(s) | Data it needs | Tables |
|---|---|---|
| Home `(tabs)/index` | area, storefront rail, banners, department strip, product rails | `service_area`, `storefront`, `banner`, `product`, `brand` |
| Categories, `category/[id]` | categories by department, products by category | `category`, `product` |
| Food · Grocery · Shops · Pharmacy · Beauty · Care | department listings, brand spotlight | `department`, `product`, `brand`, `storefront` |
| Discover, Reels | reels, chips, likes | `reel`, `reel_like`, `discover_chip` |
| `search`, `smart-search` | text search; AI photo/voice search | `product` (+ search index), `media.asset` (private), `usage_counter` |
| `assistant` | sessions, messages, cart context | `assistant_session`, `assistant_message` |
| `product/[id]`, `brand/[id]`, `store/[id]`, `collection/[id]` | detail pages, store products, follow, themed collections | `product`, `location_product`, `brand`, `storefront`, `store_follow`, `collection(_item)` |
| Book It, `booking/[id]`, `enquiries` | events, slots, my enquiries | `event`, `event_slot`, `booking_enquiry` |
| Cart (+ One Saver) | authoritative quote: prices, delivery fee, coupon, availability | `coupon`, `fee_rule`, `location_product`, `product` |
| Checkout, `order/[id]`, `orders` | place order, live tracking, history | `checkout`, `order`, `order_line`, `order_status_event`, `payment`, delivery job (view) |
| Account, `profile-edit` | profile, **avatar upload** | `customer`, `customer_profile`, `media.asset` |
| `addresses` | saved addresses | `address` |
| `wishlist` | saved products | `wishlist_item` |
| `payments` | preferred method (never card data) | `customer_profile.preferred_payment` |
| `wallet` | credit ledger | `wallet_entry` |
| `refer` | code, redemptions | `customer_profile.referral_code`, `referral_redemption` |
| `help` | support requests | `support_ticket` |

### 4.2 Table catalogue
Keys: **PK** primary key · text PKs keep today's ids (`p1`, `c9`, `mcdonalds`) so deep links and persisted carts keep working; new rows get a UUID string. Money columns are `*_minor` (paise). Every table also has `created_at`, `updated_at`; synced/merchant tables add `deleted_at`. Every table has RLS on.

**`onecity` (ours)**
| Table | Key columns | Rules / notes |
|---|---|---|
| `service_area` | id, slug (`latur`), name, state, `pincodes text[]`, center, radius_m, active, launched_at | The unit of locality. Polygons (PostGIS) later if pincodes prove too coarse |
| `department` | id (`food`,`grocery`,`pharmacy`,`beauty`,`shops`,`book-it`), name, group (`care` = pharmacy+beauty), palette_token, sort_order | Replaces hard-coded strings in UI and API |
| `storefront` | location_id **PK**, slug, display_name, tagline, logo_media_id, tags[], department_id, rating_avg/count, visible | Marketplace presence of a merchant location. Today's 49 "stores" become storefronts of demo organizations |
| `storefront_area` | location_id, service_area_id, min_order_minor, fee_rule_id | **Which areas a storefront serves** (§4.4) |
| `storefront_media` | location_id, media_id, kind (image/video), sort | Replaces the `media[]` JSON on stores |
| `fee_rule` | id, service_area_id, threshold_minor, fee_minor, … | Moves ₹15-under-₹199 out of the client. Real rules wait on D10 |
| `banner` | id, service_area_id (null = all), title, subtitle, media_id, bg_token, cta jsonb, starts_at, ends_at, sort_order | |
| `discover_chip` | id, label, emoji, color_token, `filter jsonb`, sort_order | Declarative filter (`discount`, `rating_gte`, `price_lt`, `newest`, `category`, `storefronts`) replaces the hard-coded `d1…d8` logic |
| `collection`, `collection_item` | id, name, subtitle, eyebrow, icon, media_id, department_id, sections[] · collection_id, category_id/product_id, sort | The 5 themed stores |
| `reel`, `reel_like` | id, service_area_id, product_id, brand_id, storefront_id, video_media_id, poster_media_id, caption, creator_label, tag, likes_count, status · (reel_id, customer_id) unique | |
| `event`, `event_slot` | id, service_area_id, kind, title, subtitle, venue, price_minor, media_id, tag · id, event_id, starts_at, capacity, booked | Free-text slots (`"11:00 AM"`) become real, capacity-aware slots |
| `booking_enquiry` | id, customer_id, event_id, slot_id, name, phone_e164, event_date, guests (1–8), status, idempotency_key | Rules already in code (date ≤ 30 days ahead, phone regex) become CHECKs + API validation. This is an *enquiry*, not a paid booking |
| `coupon`, `coupon_redemption` | code, label, kind (flat/pct), value, min_order_minor, max_discount_minor, service_area_id, max_uses, per_user_limit, starts_at, expires_at, active · (code, customer_id, order_id) | Per-user limits and audit; stops a code being reused |
| `customer_profile` | customer_id **PK**, display_name, email, avatar_media_id, referral_code (unique), preferred_payment, default_service_area_id, marketing_opt_in | |
| `address` | id, customer_id, label, recipient_name, phone_e164, line1, locality, pincode, lat, lng, service_area_id (resolved), is_default | Fields mirror `Address` in `customer.tsx` |
| `wishlist_item`, `store_follow` | (customer_id, product_id) · (customer_id, location_id) | Replace `onecity.saved-products.v1`, `onelatur.followed.v1` |
| `referral_redemption` | id, referrer_customer_id, referred_customer_id, code, status | Reward rules undefined today → open item |
| `wallet_entry` | id, customer_id, amount_minor (signed), kind, reason, reference, idempotency_key | Append-only ledger; balance is a view. **Promo credits only** until D9 |
| `assistant_session`, `assistant_message` | id, customer_id, busy_until · id, session_id, seq, role, text, metadata jsonb | Keeps the last-40 window and the 90-second "one reply at a time" lock, now a row lock |
| `support_ticket` | id, customer_id, topic (`order/payment/profile/other`), message (10–2000), reference, order_id, status | |
| `push_token` | customer_id, token, platform | Needed for order notifications (not in the app yet) |

**`catalogue` (shared)**
| Table | Key columns | Rules |
|---|---|---|
| `category` | id, parent_id, name, department_id, color_token, media_id, sort_order, active | |
| `brand` | id, organization_id (nullable), name, department_id, logo_media_id, hero_media_id, tagline | |
| `product` | id, organization_id, brand_id, category_id, department_id, name, description, weight_label, `price_minor`, `mrp_minor`, tax_code, rating_avg/count, image_media_id, active, `is_demo`, `version` | CHECK `0 < price_minor ≤ mrp_minor`; discount % is derived, not stored |
| `product_price_history` | product_id, version, price_minor, mrp_minor, changed_by, changed_at | Trigger-written; orders snapshot the version they were priced at |
| `location_product` | location_id, product_id, available, price_override_minor | What a POS "Item availability" toggle writes |

**`commerce` (shared; implement to the ecosystem contract, propose to OS repo)**
| Table | Key columns | Rules |
|---|---|---|
| `customer` | id (= auth user id), phone_e164 (unique), email, full_name, is_anonymous | Platform-level customer |
| `checkout` | id, customer_id, address_snapshot jsonb, service_area_id, subtotal/discount/delivery_fee/tax/total `_minor`, currency, coupon_code, payment_method, `idempotency_key` | UNIQUE (customer_id, idempotency_key). The unit the customer pays for |
| `order` | id, checkout_id, customer_id, **organization_id, location_id**, origin (`onecity`), `status` (`placed/accepted/rejected/cancelled/completed`), `version`, amounts, placed_at, accepted_at, cancel_reason | One merchant per order (§4.3). Status is *order lifecycle only* |
| `order_line` | id, order_id, product_id, product_version, name_snapshot, weight_snapshot, unit_price_minor, mrp_minor, tax_minor, qty, line_total_minor, image_media_id | Immutable: no UPDATE grant |
| `order_status_event` | id, order_id, kind (`order/kitchen/delivery/payment`), from, to, actor_type, actor_id, reason, at | Append-only; feeds Realtime and the tracking view |
| `payment`, `payment_event` | id, checkout_id, method, provider, provider_order_id, provider_payment_id (unique), amount_minor, status, verified_at · provider, event_id (unique), payload | Provider events de-duplicated on `event_id`; `not_charged → pending → captured/failed → refunded` |

**`media`, `platform` (shared)**
| Table | Key columns | Rules |
|---|---|---|
| `media.asset` | id, bucket, path, kind, mime, bytes, width, height, duration_ms, sha256, owner_org_id, uploaded_by, purpose, `status` (`pending/ready/rejected/expired`), `legacy_key` (unique, e.g. `burger`, `legacy-2e75…`), `variants jsonb`, expires_at | Replaces `catalog_assets`. `legacy_key` keeps old `/api/media/<key>` links resolvable |
| `platform.idempotency_key` | actor_id, key, method, path, request_hash, response_status, response_body, expires_at | Same key + same body → same response; same key + different body → 409 |
| `platform.usage_counter` | subject_kind (`user/ip/global`), subject_id, feature, window_start, count | AI budgets; DB-backed fallback for critical limits |
| `platform.audit_event` | id, at, actor_type, actor_id, action, entity, entity_id, before, after, ip, request_id | Append-only: no UPDATE/DELETE grants |
| `platform.outbox_event` | id, aggregate_type, aggregate_id, type, version, payload, created_at, delivered_at, attempts | Written in the same transaction as the business change; a worker delivers to Realtime / POS / rider / push |
| `platform.app_config` | key, value jsonb | Backs `GET /v1/bootstrap` (min app version, flags, maintenance) |

**`core` (OS-owned; read-only to us, UNVERIFIED shape).** The shared project already contains tables that look like this layer (`org_users`, `roles`, `modules`, `customers`, `menu_categories`, `deal_events`, `readiness_checks`) — the anon key's error hints named them. We depend only on a small **view contract** (`core.v_active_locations`, `core.v_memberships`) so their internal shape can change. D3 (schema dump) turns this from a guess into a mapping.

### 4.3 Structural decisions, with the alternative that lost
1. **One checkout, one order per merchant.** *Alternative: keep today's single mixed order.* Lost because a merchant's POS may see only its own lines (tenant isolation), a restaurant and a grocer cannot both "accept" one order, and each has its own delivery/fee/cancel path. Cost: the confirmation screen shows N orders (the API's v1 compat response returns the first, so the current UI does not change on day one).
2. **Separate state machines; derived timeline.** *Alternative: today's single `status` (`placed/packed/out/delivered`).* Lost because order acceptance, kitchen, delivery and payment progress independently (POS docs). The 4-step UI reads a view: `placed` = order placed, `packed` = kitchen ready, `out` = delivery picked up, `delivered` = delivery completed.
3. **Paise, not rupee floats.** The v1 API keeps returning rupee numbers so the current UI works unchanged; the DB and all arithmetic are integers. (Cart totals are computed *only* on the server.)
4. **Text primary keys for catalogue, UUIDs for transactions.** *Alternative: UUID everywhere + a mapping table.* Lost because persisted carts and deep links already contain `p1`, `s3`, etc.
5. **Roles come from memberships, not a column on the user.** One person can be customer and merchant staff. `users.role` in `schema.sql` is dropped.
6. **Service areas by pincode list now, polygons later.** *Alternative: PostGIS from day one.* Lost on cost; the column set leaves room for it.
7. **`is_demo` everywhere for sample data**, so demo storefronts never appear in production discovery.

### 4.4 Locality — "Latur viewers only see Latur listings"
- **The viewer's area** is the signed-in customer's selected/default address area; before sign-in, the `area` the device sends (`?area=latur`), validated against `service_area.active`. Unknown or inactive area → `404 AREA_NOT_LAUNCHED`.
- **A storefront is visible** iff: `visible` ∧ its organization is active and entitled ∧ it has a `storefront_area` row for the viewer's area ∧ it is open (or takes pre-orders) ∧ for POS-integrated restaurants, the POS heartbeat is within the approved reachability window (D04: 5 minutes) so the app never promises acceptance from an unreachable kitchen.
- **Products, brands, banners, reels, events, coupons, collections and AI answers** are filtered through the same area (the assistant currently builds its catalogue from *all* products and would recommend items the viewer cannot buy).
- **Enforced in SQL views** (`onecity.v_visible_storefront`, `v_visible_product`, …) that the API always queries, with RLS as a backstop. Checkout re-checks: address pincode ∈ area pincodes and storefront serves it, else `422 OUT_OF_SERVICE_AREA`.
- **Cache keys include the area**, and public GETs take `area` as a *query parameter* (CDN-friendly) rather than only a header.
- **Adding a city is data, not code:** one `service_area` row + `storefront_area` rows.
- Merchants see their own organization's data regardless of area; city-scoped admins depend on how `core` models scope (D3).

---

## 5. Storage and upload buttons (Supabase Storage replaces Mongo `catalog_assets` **and** the Emergent object store)

### 5.1 Buckets
| Bucket | Access | Holds | Limits |
|---|---|---|---|
| `catalog-public` | public read via CDN, **no client write** | product / brand / storefront / banner / category / event / reel media | images ≤ 5 MB (JPEG, PNG, WebP, AVIF — **no SVG**, it can carry script); reel video ≤ 40 MB (MP4/WebM), merchant/admin only |
| `user-private` | private, signed read URLs | customer avatars; AI search photos (**24-hour expiry**) | images ≤ 8 MB. Voice clips are never stored (they are transcribed and discarded, as today) |
| `delivery-proofs` | private, signed read URLs for the customer and merchant of that order | rider proof photos | images ≤ 5 MB; retention per policy |
| `merchant-docs` *(later)* | private | licences / KYC | — |

Path convention: `{org_id or platform}/{purpose}/{entity_id}/{asset_uuid}.{ext}`. Clients never choose the path.

### 5.2 The upload handshake (four steps; the API is never in the byte path)
1. **Pick + shrink on the device** — `expo-image-picker` (camera or library) → `expo-image-manipulator` (both already dependencies) to ≤ 1600 px, JPEG/WebP ~0.8. HEIC is converted here.
2. **`POST /v1/uploads/sign`** `{purpose, entity_type, entity_id?, mime, bytes}` with `Authorization` and `Idempotency-Key`. The API checks: who you are; whether *you may upload this purpose for this entity* (avatar → yourself; product/brand/storefront media → a membership with catalogue-write on that organization; banner/reel/collection → admin); mime allow-list and size cap for that purpose; your daily quota. It creates `media.asset` (`status=pending`, expires in 15 minutes) and returns `{asset_id, bucket, path, token, upload_url}` from Storage's signed-upload API.
3. **Upload directly to Storage** with that one-time token (progress bar, cancel, retry).
4. **`POST /v1/uploads/{asset_id}/complete`** — the API reads the object back and verifies size, real content type (magic bytes, not the header the client sent) and dimensions; rejects and **deletes** it on mismatch; stores `sha256`; generates variants (`thumb` 256, `card` 640, `hero` 1280, WebP); attaches it to the entity (`*_media_id`); writes an audit event. Assets not completed within 15 minutes are swept to `expired` and their objects removed.

Client writes to Storage are denied by policy everywhere; only the signed token in step 3 can write, and only to the one path the server chose. The API uses its service key **only** for creating those signed URLs.

### 5.3 The upload buttons
- **`<UploadButton />` + `useUpload()`** in `src/components/` and `src/hooks/`: states *idle → picking → compressing → uploading (%) → processing → done / error*, cancel via `AbortController`, retry, permission prompts (camera/photos strings in `app.json`), web file-input fallback, accessible labels, 44-pt touch target (the app's existing standard).
- **Where they go**
  1. `profile-edit` — **avatar** (private bucket). Today the avatar is an icon name (`profile.avatar = 'person'`).
  2. `smart-search` — the existing photo search stays a multipart upload to the API (the model needs the bytes); it gains per-user limits and an optional 24-hour private copy.
  3. **Admin/merchant catalogue uploader (D11):** product image, brand logo/hero, storefront logo + gallery, banner, category image, event poster, reel video. Built as a role-gated, web-only route group in this project so you have working upload buttons soon; it calls the same `/v1/uploads/*` endpoints VINII POS and Master will use, so nothing is written twice.
  4. Rider app: delivery proof (later).

### 5.4 Moving today's media into Storage (one idempotent importer)
- Replace the seven seed scripts with **one manifest-driven `scripts/import_media.py`**: for each key → download → normalise (Pillow; SVG → PNG) → upload to `catalog-public/legacy/{key}` → insert `media.asset` with `legacy_key` → back-fill `*_media_id`. Derived assets (`float-*` cut-outs, `*-webm` transcodes) are regenerated by the same code that made them.
- **Do it soon.** I probed the 65 distinct external URLs referenced in the code (HEAD requests, no downloads): **57 answer today**. 6 Google sample-video URLs return 403 but are already superseded in code by the `reel-*` assets. **2 Unsplash photos return 404 and need replacing.** Seven images are hosted on `static.prod-images.emergentagent.com` / `…emergentagent.net` — they resolve now but belong to a platform you may stop using, so pull them first.
- **Compatibility:** the API keeps `GET /api/media/{key}` for a while as a **302 redirect** to the Storage URL, because carts persisted on devices (`cart.tsx` rewrites `/api/media/<key>` links) and old app builds still use it. New responses carry absolute Storage/CDN URLs; `resolveMedia` in `src/api.ts` passes absolute URLs through untouched.
- **Licensing:** the sample images from retailer CDNs and brand sites are not yours to publish commercially. Fine for demo builds; replace with merchant-uploaded or licensed images before launch (F17).
- **Reel video:** the H.264 → VP9/WebM transcode moves from a one-off script to a small background worker (ffmpeg cannot run in an edge function). Until then accept MP4/H.264 and keep the existing `video_web` alternative.

---

## 6. API contract — every handshake, written down once

A "handshake" is anything the caller and the API must agree on for a call to succeed and stay safe. These apply to **every** `/v1` route; §7 says which ones each route uses.

| # | Handshake | Contract | Gap today |
|---|---|---|---|
| H1 | **Transport & CORS** | HTTPS + HSTS. CORS **allow-list** (web app origin, admin origin, local dev), one CORS middleware, no wildcard with credentials. JSON body ≤ 64 KB (multipart only on AI search, ≤ 8 MB). Server timeouts on every route | `*` with credentials, registered twice (F8) |
| H2 | **Streaming** | `POST /assistant/chat` is NDJSON over a long POST read by XHR `onprogress` (`assistant.ts`). Proxies must not buffer or gzip that route; client timeout (80 s) must stay above the server's (65 s) | works only because the dev proxy pipes |
| H3 | **Identity** | `Authorization: Bearer <Supabase access token>` (guest = anonymous session; user = phone-verified). API verifies signature (JWKS), `exp`, `iss`, `aud`. **`sub` is the only source of "who"** — never a user id in a body. Client refreshes once on 401, retries once. Roles come from memberships (`core`), cached ≤ 5 min | none (no login exists; F1, F20) |
| H4 | **Bootstrap** | `GET /v1/bootstrap` at cold start → `{min_app_version, latest_app_version, force_upgrade, maintenance, feature_flags, service_areas[], server_time}`. Old builds get `426` | absent (F18) |
| H5 | **Locality** | `area` query param on public GETs, validated; unknown/inactive → `404 AREA_NOT_LAUNCHED` (§4.4) | interim `?city=` / `X-City` |
| H6 | **Idempotency** | `Idempotency-Key: <uuid>` on every create/command (checkout, payment intent/verify, booking, support, upload-sign, wallet). Same key + same body → stored response replayed (`Idempotent-Replayed: true`); same key + different body → `409 IDEMPOTENCY_KEY_REUSED`; duplicate in flight → `409 IN_PROGRESS`. Kept 24 h | absent (F2) |
| H7 | **Versioned state changes** | `If-Match: <version>` / `expected_version` on order accept/reject/cancel and any PATCH → `409 VERSION_CONFLICT` with current state | absent |
| H8 | **Price handshake** | Cart → `POST /v1/cart/quote` returns `quote_id` + authoritative lines, fee, discount, total (TTL 10 min). Checkout sends `quote_id`; if prices/availability moved → `409 PRICE_CHANGED` + fresh quote and the UI asks the customer to confirm | client does the math (F2, F11) |
| H9 | **Errors** | `{ "error": { "code", "message", "request_id", "details" } }`. 400 validation (field errors in `details`) · 401 · 403 · 404 · 409 · 413 · 415 · 422 business rule (`OUT_OF_SERVICE_AREA`, `COUPON_NOT_ELIGIBLE`…) · 426 · 429 (+ `Retry-After`) · only 502/503/504 are retryable. Legacy `{detail}` stays on `/api/*` (the UI reads `payload.detail`) | generic `Error('API path 500')` |
| H10 | **Correlation** | Client sends `X-Request-Id`, `X-App-Version`, `X-Platform`; API echoes `X-Request-Id`, adds `X-API-Version`; legacy routes add `Deprecation` + `Sunset` | none |
| H11 | **Pagination & cache** | `limit` (default 20, max 50) + opaque `cursor`. Public catalogue: `ETag` + `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, keyed by `area`. Anything authenticated: `no-store` | unpaginated (F10) |
| H12 | **Media** | Absolute Storage/CDN URLs + `variants`; legacy `/api/media/{key}` answers `302` | proxy (F9) |
| H13 | **Realtime** | Private channel `order:{id}` fed by a DB trigger on `order_status_event`; RLS on the realtime messages admits only that order's customer, that merchant's staff and the assigned rider. Client **polls `GET /v1/orders/{id}` every 15 s if the socket drops and refetches on reconnect** (never trusts missed events) | simulated timer (F13) |
| H14 | **Payments** | API creates the provider order → app opens Checkout → app posts `{order_id, payment_id, signature}` to `/payments/verify` (server checks the HMAC). **The signed webhook is the source of truth**, de-duplicated on provider event id; the app's result is only a hint. Refunds later, authorised and idempotent (D09) | none (`not_charged` only, F4) |
| H15 | **Cross-app events** | Transactional outbox → at-least-once delivery, consumers de-duplicate on `event_id`, ordered per aggregate by `version`. Types: `order.placed`, `order.accepted`, `order.rejected`, `order.cancelled`, `kitchen.ready`, `delivery.assigned`, `delivery.picked_up`, `delivery.delivered`, `payment.captured`, `payment.failed`, `catalogue.availability_changed` (each `.v1`) | none |
| H16 | **Units** | UTC ISO-8601 timestamps; IST only on device. v1 money as rupee numbers **plus** `*_minor` fields from day one. Currency `INR`. Phones E.164 (`+91…`), Indian mobile pattern `^[6-9][0-9]{9}$` at input | floats |
| H17 | **One client** | All calls go through `src/api.ts`, which injects auth, request id, app version, timeout (10 s; 80 s streaming), retry with jitter on 429/502/503/504 honouring `Retry-After`, and parses the error envelope. Today `assistant.ts` uses raw XHR and `uploadSearch` raw fetch, so header injection would silently skip them | 3 code paths |
| H18 | **Config injection** | `BACKEND_URL`, Supabase URL and key come from build config per environment (`app.config.ts`). On web the client uses `window.location.origin` (API must be same-origin behind a proxy, or an allow-listed origin). No hard-coded fallbacks | hard-coded project URL + key |
| H19 | **First-run claim** | On first sign-in, one idempotent `POST /v1/me/import-local` moves the on-device profile, addresses, wishlist, followed stores, payment preference and referral code to the server; afterwards the server is the source of truth | data is device-only (F12) |
| H20 | **Account deletion** | `DELETE /v1/me` (soft-delete now, purge job later). Both app stores require in-app deletion once accounts can be created in-app | absent |

**Versioning:** new routes live under `/api/v1/*`. The current `/api/*` contract is kept as a compatibility layer for at least two app releases (with `Deprecation`/`Sunset` headers) and is covered by the 9 existing test files, which become its regression suite.

---

## 7. Route-by-route evaluation

Rate-limit classes (`PUB`, `SRCH`, `READ`, `WRITE`, `SLOW`, `COUPON`, `ORDER`, `UPLOAD`, `AI`, `HOOK`, `ADMIN`, `HEALTH`) are defined in §8.

### 7.1 Every route that exists today
| Route | Called by | What it does today | Problems (handshake gaps) | Becomes | Verdict |
|---|---|---|---|---|---|
| `GET /api/` | — | greeting | no health semantics | `GET /v1/health`, `/v1/ready` (DB ping) | replace |
| `GET /api/catalog` | `use-catalog`, `use-discovery` (home, categories, wishlist, department screens) | whole catalogue: brands, products, categories, events, themed stores | unpaginated, no area, no cache headers (F10) | compat kept, area-scoped + cached; new `GET /v1/home`, `/v1/products`, `/v1/brands`, `/v1/categories`, `/v1/collections` | migrate |
| `GET /api/categories` | `store/[id]` | all categories | no area / department filter | `GET /v1/categories` | migrate |
| `GET /api/discover` | **nobody** | chips | unused; chip logic hard-coded (F11) | folded into `/v1/home` | retire |
| `GET /api/banners` | **nobody** | banners | unused (home promos are hard-coded in UI) | folded into `/v1/home` | retire |
| `GET /api/stores` | `(tabs)/index` | all stores | no area, open/closed or paging | `GET /v1/storefronts` with the visibility rule (§4.4) | migrate |
| `GET /api/stores/{id}` | `store/[id]` | one store | id may be a brand or store; no area check | `GET /v1/storefronts/{id}` | migrate |
| `GET /api/stores/{id}/products` | `store/[id]` | products of a store | unpaginated; ignores availability | `GET /v1/storefronts/{id}/products` (joins `location_product`) | migrate |
| `GET /api/products` | `cart.tsx` (whole list, to reprice the cart); filters unused by the UI | filter by category/chip/department/brand/`q` | `q` unbounded; chip rules hard-coded; used as a price oracle | `GET /v1/products` (validated filters, paginated). Cart repricing moves to `POST /v1/cart/quote` | migrate |
| `GET /api/products/buy-again` | **nobody** | hard-coded ids | fake | `GET /v1/me/buy-again` from real order history | replace |
| `GET /api/products/{id}` | `product/[id]` | one product | no area; no availability | `GET /v1/products/{id}` | migrate |
| `GET /api/coupons` | `one-saver` | all coupons | not area-aware, not per user | `GET /v1/coupons?area=` (+ "eligible for you" when signed in) | migrate |
| `POST /api/coupons/apply` | `cart.tsx` | checks a code against the subtotal | brute-forceable; returns HTTP 200 for failure; not re-checked at order time (F2, F14) | folded into `POST /v1/cart/quote`; compat route kept | replace |
| `POST /api/orders` | `cart.tsx` | creates an order from client totals | F1–F4: no auth, no idempotency, trusts prices, mixed merchants, fake rider | `POST /v1/checkout` | **rebuild** |
| `GET /api/orders` | `orders.tsx` | **all** orders | **F1 critical** | `GET /v1/orders` (own only) | **rebuild** |
| `GET /api/orders/{id}` | `order/[id]` | any order by id | no ownership; no live status (F13) | `GET /v1/orders/{id}` + Realtime | **rebuild** |
| `GET /api/reels` | `use-discovery` | reels joined with product + brand | no area; static likes; unpaginated | `GET /v1/reels`, `PUT/DELETE /v1/reels/{id}/like` | migrate |
| `GET /api/events` | **nobody** (events come inside `/catalog`) | events | free-text slots | `GET /v1/events`, `/v1/events/{id}/slots` | migrate |
| `POST /api/booking-enquiries` | `booking/[id]` | validates event/slot/date ≤ 30 d, stores | anonymous, unthrottled; nothing reads it back (`enquiries.tsx` shows a local copy) | `POST /v1/booking-enquiries` + `GET /v1/me/booking-enquiries` | migrate |
| `POST /api/support-requests` | `help.tsx` | stores a ticket | anonymous spam vector (F14) | `POST /v1/support-tickets` + list | migrate |
| `POST /api/assistant/sessions` | `assistant.tsx` | creates a session | **not mounted** (F6); unauthenticated | `POST /v1/assistant/sessions` | rebuild |
| `GET /api/assistant/sessions/{id}` | `assistant.tsx` | returns messages | UUID is the only secret (F7) | owner-only | rebuild |
| `POST /api/assistant/chat` | `assistant.ts` (XHR stream) | streams an answer + product ids + comparison links | not mounted; global budget; catalogue not area-filtered; lock lived in Mongo | `POST /v1/assistant/chat` | rebuild |
| `POST /api/search/image` | `smart-search`, `uploadSearch` | photo → catalogue match; stores a private copy forever | global budget; no per-user cap | `POST /v1/search/image` | rebuild |
| `POST /api/search/voice` | `smart-search`, `assistant` | audio → ffmpeg → whisper → match | needs an ffmpeg binary on the host; global budget | `POST /v1/search/voice` | rebuild |
| `GET /api/media/{id}` | every image | streams the object through the API | F9 | `302` to Storage/CDN, then retire | compat only |
| *`server.py`* `GET /health` | — | ok | — | `/v1/health` | replace |
| *`server.py`* `GET /categories, /products, /products/{id}, /stores, /stores/{id}` | — | duplicates of the above, different shapes | drift | — | delete |
| *`server.py`* `GET/POST /orders`, `GET /orders/{id}` | — | user-scoped via a fake-able identity | F20, F2 | — | delete |
| *`server.py`* `GET /rides`, `POST /rides/{id}/status` | rider app (future) | free-text status | F20 | `POST /v1/rider/jobs/{id}/…` with a state machine | rebuild |
| *`server.py`* `GET/POST /profile` | — | caller can set own `role` | F20 | `GET/PATCH /v1/me` (role never writable) | delete |

### 7.2 Handshakes the UI needs that no route provides today
Session/bootstrap · sign-in (phone OTP) and sign-out · profile read/update · **address CRUD** · wishlist sync · follow sync · referral code + redeem · wallet balance · **authoritative cart quote** · order **cancel** and **reorder** · order **live status** · **booking list** · **support-ticket list** · push-token registration · **service-area resolution** (pincode/GPS → area; today the location is a free-text string in `delivery-location.ts`) · **uploads** (sign/complete) · **account deletion** · payment intent/verify/webhook.

### 7.3 Target route catalogue (`/api/v1`)
Auth: **none** · **guest** (any valid session, incl. anonymous) · **user** (phone-verified) · **staff** (membership + permission) · **rider** · **admin**. "Idem" = needs `Idempotency-Key`.

| Group | Route | Auth | Special handshake | Limit | Cache | Tables |
|---|---|---|---|---|---|---|
| Platform | `GET /health`, `/ready` | none | — | HEALTH | no-store | (ping) |
| | `GET /bootstrap` | none | `X-App-Version`, `X-Platform` | PUB | 60 s | `app_config`, `service_area` |
| | `POST /areas/resolve` `{pincode \| lat,lng}` | none | — | PUB (30/min) | — | `service_area` |
| Identity | `GET /me` · `PATCH /me` | user | `If-Match`; `role` never writable | READ / WRITE | no-store | `customer`, `customer_profile` |
| | `POST /me/import-local` | user | Idem | SLOW | — | profile, address, wishlist, follow |
| | `DELETE /me` | user | re-auth (OTP) | SLOW | — | soft delete + purge job |
| | `GET/POST/PATCH/DELETE /me/addresses` | user | pincode → area check | WRITE | no-store | `address` |
| | `GET /me/wishlist` · `PUT/DELETE /me/wishlist/{product_id}` | user | — | WRITE | — | `wishlist_item` |
| | `GET /me/follows` · `PUT/DELETE /me/follows/{location_id}` | user | — | WRITE | — | `store_follow` |
| | `GET /me/wallet` | user | read-only (credits are server-issued) | READ | no-store | `wallet_entry` |
| | `GET /me/referral` · `POST /referrals/redeem` | user | — | SLOW | — | `referral_redemption` |
| | `PUT /me/push-token` | user | — | WRITE | — | `push_token` |
| Catalogue | `GET /home` | none | `area` | PUB | s-maxage 60 | banner, chip, storefront, product |
| | `GET /departments`, `/categories`, `/brands`, `/brands/{id}`, `/collections`, `/collections/{id}` | none | `area` | PUB | 60 s | catalogue + onecity |
| | `GET /products` · `/products/{id}` · `/search?q=` | none | `area`, `limit ≤ 50`, `cursor`, `q ≤ 80` | PUB / SRCH | 60 s | `product`, `location_product` |
| | `GET /storefronts` · `/storefronts/{id}` · `/storefronts/{id}/products` | none | visibility rule | PUB | 60 s | `storefront*`, `location_product` |
| | `GET /reels` · `PUT/DELETE /reels/{id}/like` | none / guest | `area` | PUB / WRITE | 60 s | `reel`, `reel_like` |
| | `GET /events` · `/events/{id}/slots?date=` | none | `area` | PUB | 60 s | `event`, `event_slot` |
| | `GET /coupons` | none / user | `area` | PUB | 60 s (public) | `coupon` |
| Checkout | `POST /cart/quote` | guest | returns `quote_id` (H8) | SRCH (60/min) | no-store | product, location_product, coupon, fee_rule |
| | `POST /checkout` | **user** | Idem + `quote_id` + `address_id` | **ORDER** | — | checkout, order, order_line, payment, coupon_redemption, outbox |
| Orders | `GET /orders` · `/orders/{id}` | user (owner) · staff · rider (assigned) | `ETag`; Realtime `order:{id}` | READ | no-store | `order`, `order_line`, `order_status_event`, delivery view |
| | `POST /orders/{id}/cancel` | user | `If-Match`; only before acceptance | WRITE (5/min) | — | `order`, `order_status_event` |
| | `POST /orders/{id}/reorder` · `GET /me/buy-again` | user | returns a fresh quote | WRITE / READ | no-store | `order_line`, product |
| Payments | `POST /payments/intents` · `/payments/verify` | user | Idem | ORDER | — | `payment` |
| | `POST /webhooks/razorpay` | signature | de-dupe on event id | HOOK | — | `payment_event`, `payment` |
| Engagement | `POST /booking-enquiries` · `GET /me/booking-enquiries` | user | Idem; date ≤ 30 days; guests 1–8 | SLOW | no-store | `booking_enquiry` |
| | `POST /support-tickets` · `GET /me/support-tickets` | user | Idem | SLOW | no-store | `support_ticket` |
| AI | `POST /assistant/sessions` · `GET/DELETE /assistant/sessions/{id}` | guest (owner) | — | AI | no-store | `assistant_*` |
| | `POST /assistant/chat` | guest (owner) | NDJSON stream (H2); one reply at a time | **AI** | — | `assistant_*`, `usage_counter` |
| | `POST /search/image` · `/search/voice` | guest | multipart ≤ 8 MB / 6 MB | **AI** | — | `media.asset`, `usage_counter` |
| Media | `POST /uploads/sign` · `/uploads/{id}/complete` · `DELETE /uploads/{id}` | guest/user/staff/admin per purpose | Idem; purpose-scoped authz (§5.2) | **UPLOAD** | — | `media.asset`, audit |
| Merchant (POS, admin UI) | `POST /merchant/orders/{id}/accept\|reject\|ready` | staff (location scope) | `expected_version` + Idem | ADMIN | — | `order`, `order_status_event`, outbox |
| | `PUT /admin/locations/{id}/products/{pid}/availability` | staff | audit | ADMIN | — | `location_product` |
| | `POST/PATCH /admin/products, /brands, /storefronts, /banners, /reels, /collections, /events, /coupons` | staff / admin | `If-Match`; audit; uploads attach here | ADMIN | — | catalogue + onecity |
| Rider | `POST /rider/jobs/{id}/pickup\|deliver\|fail` | rider | Idem; state machine; proof upload | ADMIN | — | delivery job, `order_status_event` |
| Compat | every route in §7.1 | as before | `Deprecation`, `Sunset` | as class | — | — |

---

## 8. Rate limiting and abuse control

### 8.1 Three layers
1. **Edge (CDN/WAF).** Coarse per-IP ceiling (order of 600 req/min), bot and scanner rules, TLS, request-size cap. Public catalogue GETs are cached here, so most read traffic never reaches the API.
2. **API, per identity.** A token bucket per (class, subject) in Redis. Subject = the token's `sub`; for callers without one, the client IP taken **only from the trusted proxy header** (never a raw `X-Forwarded-For` from the internet; IPv6 grouped by /64). Limits live in `platform.app_config`, so they can be tuned without a deploy.
3. **Domain quotas.** Things that cost money or can be abused in ways a request count cannot capture: AI spend, OTP sends, order attempts, upload bytes.

### 8.2 Limits by class *(starting values — tune after a load test)*
| Class | Applies to | Key | Limit | Extra rules |
|---|---|---|---|---|
| `HEALTH` | `/health`, `/ready` | IP | 30/min | |
| `PUB` | public catalogue reads | IP (user if signed in) | 120/min, burst 40 | mostly absorbed by CDN cache |
| `SRCH` | `/search`, `/cart/quote` | user, else IP | 60/min | `q` ≤ 80 chars; cart ≤ 50 lines |
| `READ` | authenticated reads | user | 120/min | |
| `WRITE` | wishlist, follows, addresses, profile, likes, reorder | user | 60/min | order **cancel**: 5/min |
| `SLOW` | booking enquiry, support ticket, import-local, referral redeem, account delete | user **and** phone | 5/hour, 20/day | duplicates de-duplicated by `Idempotency-Key` |
| coupon attempts | inside `/cart/quote` | user | 10/min, 100/day | a **failed** code counts ×3 (stops brute force) |
| `ORDER` | `/checkout`, payment intent/verify | user | 5/min, 30/day | ≤ 3 open unpaid COD orders; accounts < 24 h old ≤ 3 orders/day |
| `UPLOAD` | `/uploads/sign`, `/complete` | user | sign 20/min, 200/day; complete 40/min | ≤ 500 MB/day/user; reels ≤ 10/day/organization |
| `AI` | assistant chat, image search, voice search | user | chat 20/h · image 15/h · voice 20/h | 1 in-flight chat per session; guest sessions get half; **global daily spend cap** (§8.4) |
| `HOOK` | provider webhooks | provider | signature + event-id de-dupe | no per-IP cap; burst-tolerant |
| `ADMIN` | merchant/admin/rider commands | user | 120/min | every write audited |
| **Auth (Supabase)** | OTP + anonymous sign-in | phone / IP | resend ≥ 30 s, 3 per 10 min, 10/day per phone, 20/h per IP | CAPTCHA on OTP and on anonymous sign-in; SMS gateway spend cap |

### 8.3 The 429 contract
- `429` with `Retry-After` (seconds), `RateLimit-Limit / -Remaining / -Reset` on every response, body `{"error":{"code":"RATE_LIMITED","details":{"class":"ORDER","retry_after_s":37}}}`.
- Client: friendly per-class message ("Too many attempts — try again in 37 s"), disable the control during cool-down, exponential backoff **with jitter**, and **never auto-retry a POST with a new idempotency key**.
- **If Redis is down:** reads (`PUB`, `READ`) fail open; `ORDER`, `AI`, `UPLOAD`, `SLOW` and OTP fail **closed** to a conservative in-process limiter. Never silently unlimited on the money-and-cost routes.

### 8.4 AI budgets (fixes F6)
Per-user hourly caps (table above) **plus** a per-user daily cost estimate, **plus** a global daily spend ceiling with a kill switch in `app_config`. When tripped the API answers `503 AI_PAUSED` and the UI falls back to plain text search (the current copy already says so). Counters live in `platform.usage_counter` (survives restarts, replaces the Mongo hourly counter). Alert at 80 % of the ceiling.

### 8.5 Other guards that belong with rate limiting
Body-size caps (H1) · pagination caps (H11) · `statement_timeout` (5 s) and a capped connection pool for the API's DB role · image decompression-bomb guard (keep the existing 24-megapixel check) · magic-byte content checks on uploads · per-route timeouts · idempotency (a retry storm cannot double-charge).

### 8.6 Watching it
Dashboards for 429 rate per class, top offenders, AI spend against ceiling, OTP sends/cost, p95 latency per route, DB slow queries. Alerts: 5xx > 1 %, AI spend ≥ 80 %, OTP sends spike, Redis unavailable.

---

## 9. Getting rid of MongoDB — the kill list

| Where | Action |
|---|---|
| `backend/assistant.py` | rewrite on Postgres (`assistant_session`, `assistant_message`); replace `find_one_and_update` lock with a row lock; drop `pymongo` import |
| `backend/ai_search.py` | `ai_usage` → `platform.usage_counter`; `search_uploads` → `media.asset` (private, 24 h expiry); `put_object` → Supabase Storage |
| `backend/media_store.py` | delete the proxy and the Emergent object-store client; keep only the `302` compat route until old builds are gone |
| `backend/server_old.py` | remove my interim in-memory `_DB` shim; split into the modular `app/` package; retire the file |
| `backend/server.py`, `backend/schema.sql`, `docs/SUPABASE_MIGRATION_PLAN.md` | mark **DEPRECATED — do not deploy**, then delete once superseded |
| `seed_media.py`, `seed_city_media.py`, `seed_store_assets.py`, `seed_motion_assets.py`, `seed_festival_refresh.py`, `seed_legacy_media.py`, `transcode_reels.py` | replace with `scripts/import_media.py` (manifest) + `scripts/seed_catalogue.py` |
| `.env.example`, `.env.local` | remove `MONGO_URL`, `DB_NAME` (the "LEGACY BACKEND" block); remove `INTEGRATION_PROXY_URL` once only the LLM half of the Emergent gateway is used (D8) |
| `frontend/src/lib/supabase.ts` | delete the `products/orders/stores/categories` helpers and the removed-API realtime helpers; keep auth only |
| `frontend/src/hooks/use-realtime-orders.ts` | re-point to the private `order:{id}` channel + polling fallback |
| `backend/tests/*` | keep; they become the compatibility-route regression suite |

**Definition of done:** `git grep -nEi "pymongo|motor|MONGO_URL|DB_NAME|catalog_assets|/objstore/"` returns nothing outside `docs/`; the API boots with no Mongo variables; a CI job enforces the grep; every route in §7.1 is either migrated, compat-only, or deleted.

---

## 10. Phased plan of action

Sizes are relative (S < M < L), not calendar promises. **Fastest visible progress: P1 → minimum P2 → P3**, which brings the catalogue and every image back on Supabase and gives you working upload buttons.

| Phase | Goal | Work | Exit criteria | Size | Needs |
|---|---|---|---|---|---|
| **P0** Ground truth | Decide and de-risk | Answer D1–D4; get the central schema dump (Appendix B) → `docs/CENTRAL_DB_MAP.md`; create a dev Supabase project (Mumbai) and run `supabase start` locally; freeze this plan | Decisions recorded; central schema mapped; dev DB reachable | S | you |
| **P1** Stop the bleeding | Remove the dangerous behaviour with no new infrastructure | Lock `GET /orders` (no list-all); recompute prices/fee/total server-side and ignore client prices/images; drop the fake rider; single CORS allow-list; interim in-process limits on write routes and coupon apply; remove the Supabase data helpers from the app; banner `server.py` **DO NOT DEPLOY**; correct the 2026-09-20 journal claims | No route returns another person's data; totals cannot be tampered with; tests green | S | — |
| **P2** Foundation | Real database, identity, API skeleton | Migrations pipeline + local DB; schemas, roles, RLS, **isolation tests**; API package (`config`, `db` via pooler, `auth` JWT verify, `errors`, request-id, `ratelimit`, `idempotency`, `audit`); `/v1/health, /ready, /bootstrap, /me`; Supabase Auth (phone OTP + anonymous + CAPTCHA); CI (lint, types, tests, RLS tests, contract tests); **security audit gate #1** on the skeleton and schema | OTP sign-in works on dev; RLS tests prove customer/merchant isolation; limiter tests pass; audit findings triaged | L | D1–D3, D7 |
| **P3** Catalogue + Storage + uploads | Images back, Mongo out of media | Idempotent catalogue seeder (`is_demo`); `import_media.py` → `catalog-public` (do this early — §5.4); `/v1` read routes with area, paging, cache; `/api/*` compat now backed by Postgres; `302` media; upload API; `<UploadButton/>`; avatar; admin uploader (D11) | Every image served from Supabase Storage; an image uploaded from the UI shows up in the app; catalogue and media run with no Mongo | M–L | P2 (auth for uploads; public reads can ship first) |
| **P4** Customer identity & state | Data survives reinstall | OTP sign-in sheet (at checkout and in Account); guest → user upgrade; profile, addresses, wishlist, follows, referral, payment preference endpoints; `import-local`; bookings + support via API; account deletion | Reinstall → sign in → profile, addresses, wishlist and follows return; user A cannot read user B (tested) | M | P2 |
| **P5** Orders, payments, live status | A real, safe order lifecycle | `cart/quote`; `checkout` splitting per merchant; idempotency; coupon redemption; fee rules (sample until D10); status events, Realtime + polling fallback; cancel/reorder; Razorpay intent/verify/webhook (test mode); outbox; merchant and rider command routes contract-tested against stub POS/rider clients; tracking screen on real data | Order placed in the app reaches a stub merchant; accept → app updates live; double-tap = one order; changed price → `PRICE_CHANGED` flow works; webhook replay = one payment | L | P3, P4, D5, D6, D9, D10 |
| **P6** AI on Postgres | Assistant and AI search back, safely | Sessions/messages; area-filtered catalogue in the prompt; per-user and global budgets with kill switch; private 24 h search photo copies; gateway decision (D8) | Assistant and photo/voice search work; a single user cannot exhaust the budget (tested); kill switch tested | M | P2, P3 |
| **P7** Eradicate + harden | Mongo gone, ready to launch | Execute §9; CI grep gate; load test; **security audit gate #2** (full run of the Cloudflare skill — needs your profile/budget answer); observability, backup/restore drill, runbooks; retire `/api/*` compat when telemetry shows < 2 % traffic | Zero Mongo references; boots with no Mongo variables; audit triaged; load targets met | M | all |

---

## 11. Verification strategy
- **Unit:** pricing, fee and coupon engine (property-based); order/kitchen/delivery/payment state machines (every illegal transition rejected); idempotency (replay, conflict, in-flight).
- **Database:** migrations apply and roll back on an empty DB; **RLS isolation matrix** (every role × every table: customer A ↛ customer B, merchant A ↛ merchant B, rider ↛ prices) as a CI gate.
- **API:** generated OpenAPI + contract tests (schemathesis); the 9 existing test files against the compat routes.
- **Data migration:** seed counts must match (32 categories, 46 brands, 84 products, 49 storefronts, 3 banners, 8 chips, 3 coupons, 4 events, 6 reels, 5 collections); media parity (every referenced key resolves); price checksum before/after; visual check of Home, Food, Grocery, Store pages.
- **Rate limits:** one test per class (limit, 429 shape, recovery) plus the Redis-down behaviour.
- **End-to-end (Expo web):** sign in → browse in area → quote → checkout → live status → cancel; upload an image; AI budget exhaustion.
- **Load (k6):** targets to confirm, not promises — cached catalogue GET p95 < 300 ms, quote < 800 ms, checkout < 1.5 s at 200 concurrent users.
- **Security:** audit gates #1 and #2; secret scanning and dependency audit in CI.
- **Rollback:** every phase ships behind `app_config` flags; compat routes stay; migrations reversible; the media importer is idempotent.

---

## 12. Risks and open items
| Risk | Why it matters | Mitigation |
|---|---|---|
| Governance clash with the OS repo (D06) | A second migration history in the shared project is exactly what the POS record forbids | Author PR-ready migrations, prove on local/dev, hand to the OS repo; no dashboard edits |
| Shared project is of unknown status (D1) and its live schema is unknown (D3) | Name collisions (`orders` already exists) and unknown policies | Non-`public`, non-exposed schemas; schema dump before any apply |
| OTP by SMS in India needs sender/template registration (DLT) | Lead time can block sign-in | Start registration in P0; test with a Supabase test-OTP list meanwhile |
| Razorpay onboarding/KYC | Blocks live payments, not development | Build and test in provider test mode |
| Wallet | Real-money stored value can attract prepaid-instrument rules | Promo credits only until advised (D9) |
| Fee/tax rules undefined (POS Q01) | Real totals cannot be certified | Sample rules behind `fee_rule`; flagged in the UI copy |
| Third-party sample images | Not licensed for commercial use (F17) | Upload buttons + merchant images before launch |
| Emergent-hosted assets and gateway | May disappear with the workspace | Import media now (§5.4); decide the LLM gateway (D8) |
| Sync tool (PowerSync) still in evaluation (D05) | Shapes which tables need stable keys/scoping columns | Schema already uses UUID/text PKs, tenant columns, `updated_at`, soft delete |
| Anonymous sign-ins can be farmed | Free identities defeat per-user limits | CAPTCHA + per-IP limits + stricter guest budgets; OTP required for money routes |
| Region: current project is Singapore | Added latency for Latur users | New dev/prod projects in Mumbai |
| Single Redis | Limiter outage | Fail-open/closed policy by class (§8.3) |

---

## Appendix A — What changed in the repo during this audit
- `backend/server_old.py`: restored missing imports (catalogue modules, `hashlib`, `media_store`); replaced the missing Mongo handle with a **temporary in-memory** store; added interim city scoping (`?city=` / `X-City`, default `latur`; unknown → 404) — this becomes the `service_area` model; original kept as `server_old.py.bak` (git also has it).
- `frontend/metro.config.js`: dev proxy forwarding `/api` to FastAPI on `127.0.0.1:8001` (the web build calls same-origin `/api`); original kept as `metro.config.js.bak`.
- `backend/migrations_ol.sql`, `backend/migrate_to_supabase.py`: **superseded by this plan — do not run** (untracked, never applied).
- `OL-ui/.env`: created as a copy of `.env.local` to run the backend locally; git-ignored; no secrets are set in it.

## Appendix B — How to give me the central schema (D3) without pasting credentials
Any one of these, saved to a file whose path you tell me (never paste passwords or keys into chat):
1. `supabase link --project-ref <ref>` then `supabase db dump --schema public --file central_public_schema.sql` (needs Docker and the database password; schema only, includes RLS policies), plus `supabase migration list`.
2. The OS repository's `supabase/migrations/` folder (the POS record names `Repo-1-` as the owner) — a checkout or zip.
3. A read-only, project-scoped Supabase MCP connection.
I have **not** cloned or read the OS repository and have made no change to any Supabase project.
