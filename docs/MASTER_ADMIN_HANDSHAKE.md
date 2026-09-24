# Master Admin ⇄ OneCity apps — handshake

How the Master Admin (the founder's control panel) and the customer, rider and merchant apps share
one Supabase database, and how an edit in the admin reaches a customer's phone.

**Rule:** the database is the contract. The admin writes rows; the apps read them through our own
API (`frontend/app/api/*`). No app talks to another app directly. Production
(`ywylhzcxuoeilygzdonx`) changes are additive only, with a backup first.

---

## 1. How an admin edit reaches the apps

```
Master Admin UI ──write──▶ Supabase (ol_* tables) ──▶ API (/api/…) ──▶ customer / rider / merchant apps
        │                         │
        └──── ol_audit_log ◀──────┘  (every admin write is recorded: who, what, before → after)
                                  └──▶ Realtime channel "ol_changes" ──▶ apps refetch the affected screen
```

- **Catalogue, prices, banners, coupons, flags:** the API reads the database on each request (short
  cache, ≤60 s). Edits appear on the next screen open. Realtime makes it instant for open screens.
- **Orders:** status changes (merchant accepts, rider picks up) are written to `ol_orders` and pushed
  over Realtime; the customer's tracking screen, widget and Live Activity update from that.
- **UI/code changes** (new screen, layout) are not admin edits — they ship by OTA
  (`docs/OTA_UPDATES.md`) or a store build.

## 2. Tables

### Already exist (0021–0023 applied to production; 0024 applied locally, production PENDING)

| Table | Admin edits | Used by |
| --- | --- | --- |
| `ol_categories`, `ol_products`, `ol_brands`, `ol_stores`, `ol_themed_stores` | Catalogue CRUD, stock, price/MRP, images | customer |
| `ol_media_assets` | Image/video library | all |
| `ol_banners`, `ol_discover_chips`, `ol_reels`, `ol_events` | Home/discover content | customer |
| `ol_coupons` | Discount codes | customer, pricing |
| `ol_service_areas` | Delivery zones per city | customer, rider |
| `ol_orders`, `ol_order_items` | Status, notes (read mostly) | all three |
| `ol_refunds` (+ `ol_process_refund()`) | Issue refunds | admin, customer |
| `ol_booking_enquiries`, `ol_support_requests` | Respond / close | admin |
| `ol_merchant_channels`, `ol_partner_devices` | Link restaurants, rider phones | merchant, rider |

### To create (next migration, 0025 — additive)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `ol_feature_flags` | Switch features per city without a deploy (replaces env logic in `server/features.ts`) | `key`, `city_id`, `enabled`, `rollout_pct`, `note`, `updated_by`, `updated_at` |
| `ol_pricing_rules` | Everything in `PRICING` (`server/pricing.ts`): delivery fee, free-delivery threshold, handling/platform fee, food GST, delivery GST | `city_id`, `key`, `value`, `valid_from`, `valid_to` |
| `ol_tax_rates` | GST by category or HSN (today sample rates in code, to confirm with CA) | `category_id` / `hsn`, `rate_pct` |
| `ol_discounts` | Automatic discounts (store-wide %, category sale, BOGO) beyond codes | `scope`, `scope_id`, `type`, `value`, `min_cart`, `starts_at`, `ends_at`, `max_uses`, `active` |
| `ol_import_jobs` | Bulk upload tracking | `id`, `kind` (products/prices/stock/images), `file_path`, `status`, `rows_total`, `rows_ok`, `errors jsonb`, `created_by` |
| `ol_audit_log` | Every admin write | `actor`, `table`, `row_id`, `action`, `before jsonb`, `after jsonb`, `at` |
| `ol_admin_users` | Who may use the admin, and at what level | `user_id`, `role` (owner/ops/catalog/support/finance), `city_ids` |
| `ol_notifications` | Push campaigns & templates | `title`, `body`, `audience`, `send_at`, `status` |
| `ol_customer_profiles`, `ol_addresses` | Move profile/addresses from the phone to the DB | per customer |
| `ol_coins_ledger` | OneLocal Coins (see `ONELOCAL_COINS_PLAN.md`) | `customer`, `delta`, `reason`, `order_id`, `expires_at` |

All new tables: `city_id`, `created_at`, `updated_at`, RLS on, writes only through the service role
(admin API) — never from a phone.

## 3. Master Admin screens needed

1. **Dashboard** — today's orders, revenue, cancellations, live riders.
2. **Catalogue** — categories, products (price, MRP, stock, images, GST rate), brands, stores; bulk edit.
3. **Bulk upload** — CSV/XLSX template download → upload → preview with row errors → confirm →
   `ol_import_jobs` shows progress. Images by ZIP or URL column. Nothing is written until confirmed.
4. **Pricing & fees** — edit `ol_pricing_rules`; preview a sample bill before saving.
5. **Discounts & coupons** — create, schedule, cap uses, see redemptions.
6. **Feature flags** — on/off per city (AI search, maps, online payments, wallet, coins, Google sign-in).
7. **Content** — banners, discover chips, reels, themed stores; drag to reorder; schedule.
8. **Orders** — list/filter, detail, change status, assign rider, refund (calls `ol_process_refund`).
9. **Merchants & riders** — onboarding, devices, channels, payouts (later).
10. **Customers & support** — lookup, support requests, enquiries.
11. **Notifications** — compose push, audience, schedule.
12. **Delivery zones** — draw/edit `ol_service_areas`.
13. **Admins & audit** — roles, and the audit log viewer.

## 4. API contract

- Admin writes go through `/api/admin/*` routes, checked against `ol_admin_users` role, each writing
  `ol_audit_log`. (Not built yet.)
- Apps keep today's reads unchanged: `GET /api/features`, `POST /api/cart/quote`, catalogue routes,
  `/api/orders/*`. Swapping env/code values for table values happens behind these routes, so apps
  need no update.
- Money is always recomputed on the server (`quote()`); the admin changes rules, never totals on an
  existing order.

## 5. Order of work

1. Founder approves production migration 0024 (0021–0023 already applied; backup first).
2. Migration 0025 with the tables above; seed from current code values so nothing changes on day one.
3. Point `features()` and `PRICING` at the tables (with code values as fallback).
4. Build admin: flags → pricing → catalogue + bulk upload → orders/refunds → rest.
5. Realtime channel for instant refresh.

## 6. Decisions only the founder can make

- Handling fee, platform fee, GST on delivery — amounts (today 0).
- GST rates per category (CA to confirm).
- Who gets which admin role; is refund approval one step or two?
- Will the Master Admin be a separate web app or a section of the existing OS?
