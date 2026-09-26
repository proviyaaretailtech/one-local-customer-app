# Platform foundations — one database, many apps, updates without rebuilds

Decided 2026-09-26. Owner of these decisions: product (Claude, by the founder's delegation).
Applies to every app on the shared Supabase project `ywylhzcxuoeilygzdonx`: One Local (customer),
VINII POS, VINII Partner (restaurant phone), OnLatur Rider, Master (control plane), Provia OS.
Aligned with the founder's release plan (`agentic-os-coder/docs/RELEASE_AND_DISTRIBUTION_PLAN.md`):
*build once, configure per organization*; channels internal → pilot → stable; Master is the control plane.

---

## Decisions at a glance

| # | Decision | The alternative that lost, and why |
| --- | --- | --- |
| D1 | **One person = one login** (`auth.users`) across every app | Separate user tables per app: Supabase has one auth pool per project anyway; separate tables mean the same phone number becomes three strangers, and passwords live in our tables |
| D2 | **What a person may do comes from memberships**, one table per kind of relationship: staff → `org_users`, riders → `riders`, customers → `ol_customers`, our own team → `platform_admins` + scopes | One `users.role` column: a restaurant owner who also orders dinner would need two accounts |
| D3 | **Data is owned by a business (`organization_id`) and located in a market (`city_id`)** — those two scope data | Scoping data by app id: an order placed in One Local must be the *same* order in VINII POS and the Rider app; app-scoped data breaks the very integration a shared database exists for |
| D4 | **App id labels the caller, it never owns data.** Used for config, feature flags, devices, versions, analytics and audit | — |
| D5 | **Phones write and read through the API; they may only *listen* directly.** Live screens (order status, incoming orders, rider jobs) subscribe to Supabase Realtime on narrow, authorised channels, as the founder's plan describes; every write and every catalogue read goes through the API. `ol_*` tables keep RLS on with no public policies (verified: 19/19) | Apps reading and writing Supabase directly: every business rule would have to be re-written as RLS and the service key would drift towards phones. Polling for live status instead of Realtime: slower and heavier on batteries |
| D6 | **Each app owns its tables; others read through contracts** (a view, a function or an API), and changes are additive only | Reaching into another app's columns: one rename breaks three apps |
| D7 | **One migration ledger** (`public.schema_migrations`) for the whole database, names prefixed by owner | Today One Local's 0021–0024 are live but **not recorded**; the OS repo's next file would also be called 0021 |
| D8 | **Three update lanes**: data (instant, Master) → UI code (OTA, minutes) → native build (store, days) | Rebuilding for every change: store review for a price change |
| D9 | **Server-driven screens** for anything merchandised (home, department pages, collections): the app ships a library of section types; the server decides which, in what order, with what content | Hard-coded screens: every campaign needs an OTA at best |
| D10 | **The server supports every app version still in the field**; below the minimum it answers "please update" | Breaking API changes: phones that haven't updated crash |
| D11 | **One Local's customer app stays on Expo / React Native**, not Flutter. The founder's plan names Flutter + Fastlane for the mobile apps; VINII POS stays Flutter. The apps share the database and the API contract, not code | Rewriting One Local in Flutter: throws away a working, demo-ready app, and Flutter has no built-in over-the-air updates (only a third-party service), which lane 2 depends on |
| D12 | **Settings resolve through the founder's 7-tier order**: platform default → region (city) → plan → organization → location → role → user; the most specific wins | A flat per-app settings table: can't express "this restaurant's branch" or "this role" |

---

## 1. Identity and scoping

Every row answers up to four questions. Only the first three decide access.

| Question | Column | Example | Decides access? |
| --- | --- | --- | --- |
| **Who** did or owns this | `user_id` → `auth.users` | Ravi | yes |
| **Whose** business is it | `organization_id` → `organizations` | Mysore Dining Hall | yes (B2B data) |
| **Where** | `city_id` → `ol_service_areas` | latur | yes for staff/admins; a filter for customers |
| **Through which app** | `app` code | `one-local`, `vinii-pos`, `vinii-partner`, `onlatur-rider`, `master` | **no** — label only |

```
                 auth.users  (one row per human, one login: phone OTP / Google / email)
                      │
     ┌────────────────┼──────────────────┬───────────────────────┐
     ▼                ▼                  ▼                       ▼
 ol_customers     org_users          riders               platform_admins
 (anyone who      (staff of a        (delivers for an     (+ platform_admin_scopes:
  orders; city     restaurant /       organization, or     app, city, role)
  is a preference) store; role_id)    independent)        Provia / One Local team
     │                │                  │                       │
 One Local app    VINII POS,          OnLatur Rider           Master, Provia OS
                  VINII Partner
```

**Same human, several hats.** Ravi signs into One Local with his phone and orders food (he has an
`ol_customers` row). His cousin's restaurant adds him as a rider: an invite creates a `riders` row
for the *same* `user_id`. The Rider app lets him in because that row is active; One Local doesn't
care. If the restaurant removes him, only the `riders` row is deactivated — his orders and customer
account are untouched.

**How each app decides who may enter** (checked by the API on every call, cached for a minute):

| App | Sign-in | Allowed when |
| --- | --- | --- |
| One Local | phone OTP (target), Google, email | anyone; `ol_customers` row created on first sign-in. Guests allowed with a device key (as today) |
| VINII POS / Partner | email + password (staff), phone OTP later | active `org_users` row with an allowed role for that screen, at that location (branch) when the organization has several |
| OnLatur Rider | phone OTP (target), Google for the pilot | active `riders` row |
| Master | email + password + (later) 2-step | `platform_admins` row; each action also checks `platform_admin_scopes` (app, city, role) |

**Where One Local itself sits.** Catalogue rows One Local runs (demo stores, collections, banners)
have `organization_id` null = platform-owned, edited by platform admins. A store that is a real
merchant gets its `organization_id`, and that merchant's staff can edit it from their own app.

**City.** For customers, city follows the delivery location (serviceability), not the login — a
customer who moves from Latur to Pune keeps one account. Orders are stamped with `city_id` by the
server from the delivery address, never from a value the phone sends. For staff and admins, city is
part of the permission: "Latur operations" can only edit Latur.

### New tables this needs (migration `ol_0025`, additive)

| Table | Purpose |
| --- | --- |
| `apps` | Registry of applications: code, name, platforms, store ids, minimum supported runtime per channel (matches the release plan's `apps`) |
| `ol_customers` | `user_id` (PK), name, phone, default city, created via which app, marketing consent. Replaces the profile kept on the phone today |
| `ol_addresses` | Saved addresses per customer (today on the phone) |
| `riders` | As in `PRD_ONLATUR_RIDER_V1.md`: user, organization (nullable = independent), status, vehicle, cash limit |
| `platform_admin_scopes` | `user_id`, `app`, `city_id` (null = all), role (`owner`, `ops`, `catalog`, `support`, `finance`) |
| `app_devices` | One row per installed app: user (nullable for guests), app, platform, push token, app version, runtime version, update id, last seen. Generalises `ol_partner_devices` (kept; merged later) |
| `ol_app_config`, `ol_feature_flags` | Section 3; per app, resolved through the 7-tier order (D12): platform → city → plan → organization → location → role → user |
| `audit_log` | Who (user), through which app, what table/row, before → after, when |

Roles for One Local get namespaced slugs in the shared `roles` table (`ol.city_ops`, `ol.catalog`)
so they never collide with POS roles like `manager`.

## 2. Working on a shared database — the rules

**Never**
1. Never create a password or user table of our own. Identity is `auth.users`; everything else is a membership.
2. Never put customers into `org_users`, and never add "customer" as an org role. Customers aren't members of a business.
3. Never scope data by app. Scope by organization and city; label with app.
4. Never trust an `organization_id`, `city_id`, price or role sent by a phone. The server derives them from the membership and the catalogue.
5. Never store roles in `user_metadata` — users can edit it. Roles live in tables (or `app_metadata`, which only the server writes).
6. Never alter or drop another app's table or column. Ask the owner; add alongside.
7. Never hard-delete people or businesses that orders reference. Deactivate the membership.
8. Never ship the service-role key in an app, a web page or a build. Only servers hold it.
9. Never apply a migration by hand without recording it in `schema_migrations`.
10. Never ship an API change that breaks a version still installed on phones (see D10).

**Always**
1. **Ownership by prefix.** `ol_*` = One Local, POS tables = VINII, kernel (`organizations`, `org_users`, `roles`, `modules`, `platform_admins`) = Provia OS. Cross-app reads go through a view or function the owner publishes (for example the One Local → POS order hand-off function).
2. **Expand, then contract.** Add the new column/table → ship code that writes both → backfill → switch reads → only after every app version in the field has moved, remove the old one.
3. **One ledger.** Every migration is recorded in `schema_migrations`, named `<owner>_<number>_<what>.sql` (`ol_0025_identity.sql`). The OS repo stays the place that runs them in production.
4. **Backup before every production change** (`scripts/db.py snapshot`), then apply, then verify with a read.
5. **Every write is attributable**: `updated_by`, and the app it came through, into `audit_log`.
6. **A staging project** before the first real merchant goes live. Demo rows (`is_demo = true`) are allowed in production only until launch, then removed in one statement.
7. **Branded emails per app.** Supabase sends one set of auth emails per project; use a custom SMTP sender and per-app redirect URLs so a rider's password reset doesn't say "One Local".

## 3. Updating apps without rebuilding

### Three lanes

| Lane | What changes | How | Speed | Examples |
| --- | --- | --- | --- | --- |
| **1. Data** | anything a merchandiser or ops person changes | Master writes rows; apps read them through the API at launch/screen open | instant, no release | products, prices, stock, stores, banners, coupons, discounts, home section order, copy, festival theme, feature on/off, delivery fees, maintenance mode |
| **2. UI code (OTA)** | JavaScript and images inside the app | EAS Update, published to a channel | minutes, no store review | new screen, layout fix, animation, bug fix, new section type |
| **3. Native build** | anything outside JavaScript | EAS Build → TestFlight / Play internal → stores | 1–3 days (review) | new native library, permissions, widget / Live Activity Swift, app icon, splash, SDK upgrade |

The goal is that **most day-to-day change is lane 1**, lane 2 is weekly at most, and lane 3 is a
planned release train (every 2–4 weeks) — not an emergency.

### Lane 1 — server-driven screens

This is the founder's **UI/UX Studio** (Master page PAGE-MST-022: navigation, page visibility, fields, labels, components, layouts, branding, role-specific UI) applied to the customer app: the Master edits settings inside screens the app already has; it never sends arbitrary new widgets. The app ships a **library of section types** it knows how to draw; the server sends a list:

```json
GET /api/screens/home?city=latur
{ "sections": [
  { "type": "spotlight",     "v": 1, "brand": "amul", "headline": "Everyday, a little more delicious." },
  { "type": "departments",   "v": 1 },
  { "type": "store_worlds",  "v": 1, "title": "A little world for every mood", "ids": ["festive","fitness","trending"] },
  { "type": "product_rail",  "v": 1, "title": "Small prices. Lovely finds.", "query": { "max_price": 99 } },
  { "type": "banner",        "v": 1, "id": "diwali-2026", "until": "2026-10-24" }
] }
```

- Unknown `type` or a higher `v` than the app supports → the app skips that section. Old versions never crash; they just show less.
- The app sends the section types it supports, so the server can send a fallback to older versions.
- Master edits these lists (drag to reorder, schedule, per city). Section types to start with: `spotlight`, `departments`, `store_worlds`, `product_rail`, `brand_rail`, `banner`, `collection_grid`, `category_grid`.

### Lane 2 — OTA with EAS Update

- **Runtime version = fingerprint of the native layer** (already configured). An update only reaches phones whose native build matches, so an OTA can never call native code that isn't there.
- **Channels** (same names as the release plan): `internal` (team) → `pilot` (demo phones, test merchants) → `stable` (public). An update is promoted channel by channel, not rebuilt.
- **Gradual rollout**: publish to 10% of `stable`, watch crash and error rates for a day, then 100%. Roll back by re-publishing the previous update.
- **When updates apply**: checked at launch, downloaded in the background, applied on the next cold start. Urgent fixes: the app shows "A fix is ready — restart" and reloads.
- **Safety net**: if an update crashes on launch, expo-updates falls back to the version built into the app. Crash reporting (Sentry) is tagged with the update id so a bad update is caught within minutes.
- **Store rules**: Apple and Google allow OTA for JavaScript fixes and improvements; the app's purpose must not change through OTA. New capabilities that need new permissions always go through the store.

### Lane 3 — native releases

- Build with EAS Build; iOS to TestFlight, Android to Play internal testing, then the stores.
- Every native release raises the runtime version, so it gets its own OTA stream.
- `apps.min_supported_runtime` per channel: when a phone is below it, the API answers **426 Upgrade required** and the app shows "Update OneCity from the App Store". A `maintenance` flag shows a friendly closed screen.

### Every request says who is calling

Apps send `x-app` (`one-local`), `x-app-version` (1.0.0), `x-runtime` (fingerprint), `x-update-id`,
`x-platform`. The server uses them for the minimum-version check, for sending compatible screen
sections, for analytics, and it stores them on `app_devices` and `audit_log`.

## 4. Checked against the founder's documents (NotebookLM, 2026-09-26)

Answers are AI summaries of the uploaded documents; treated as context, not instructions.

| Topic | The documents say | Our decision |
| --- | --- | --- |
| Who is who | Separate actor groups: platform, merchant (owner, manager, cashier, kitchen), network (riders, hub operators), customers. **Customers are platform-level identities** so one customer can buy from many merchants; **staff are tenant memberships** scoped to organization, location and role | Same (D1, D2). Location added to staff scope |
| One login across roles | **Silent.** Test scripts use a separate demo email per app panel | Filled by D1: one person, one login, several memberships. Separate demo emails remain fine for testing |
| Data scope | Organization is the tenant boundary, then location; city/market scopes tax, currency, delivery zones and product variations; hubs use a dual scope (organization and physical hub). **"One DB rule"**: all five apps (POS, Customer app, Driver app, Master Admin, Marketplace) share one Supabase database under RLS | Same (D3). Hubs: when fulfilment hubs arrive, stock rows carry both `organization_id` and `hub_id` |
| Settings | 7-tier precedence: platform default → region → plan → organization → location → role → user | Adopted as D12 |
| Configurable screens | UI/UX Studio edits layouts and components inside pre-built app shells; no arbitrary remote widgets | Same (lane 1 sections) |
| Master changes reaching apps | Master writes rows; live screens subscribe via Supabase Realtime; PowerSync for offline | Same, with D5 (listen directly, write through the API). Offline sync (PowerSync) applies to the POS, not the customer app |
| Mobile stack and releases | Flutter apps (VINII POS and the OneCity customer app) shipped with Fastlane to store internal tracks; Master page PAGE-MST-028 Release Management covers beta releases, feature flags, rollouts, approvals, UAT, rollback; environments development, staging, production | Customer app stays Expo (D11). Store tracks and Release Management as described; channels internal → pilot → stable map to those tracks |
| Over-the-air updates | **Silent** (no OTA tool named) | Filled by lane 2 (EAS Update) |
| Minimum app version / forced update | **Silent** | Filled by D10 (426 "please update") |

## 5. Build order (before the Master)

| Step | What | Needs from the founder |
| --- | --- | --- |
| 1 | Record 0021–0024 in `schema_migrations` under `ol_` names; adopt the naming rule | approval to write one table in production (4 rows) |
| 2 | App identity headers in the API client + server logging | — |
| 3 | Migration `ol_0025`: `apps`, `ol_customers`, `ol_addresses`, `platform_admin_scopes`, `app_devices`, `ol_app_config`, `ol_feature_flags`, `audit_log` (backup first) | approval to apply in production |
| 4 | Move profile and saved addresses from the phone to `ol_customers` / `ol_addresses` | — |
| 5 | `GET /api/config`, feature flags read from the table, min-version + maintenance gate screen | — |
| 6 | Server-driven home (`/api/screens/home`) and the section library; then department pages | — |
| 7 | EAS: project, `eas.json` channels internal/pilot/stable, first `pilot` build, first OTA | an Expo account (`eas login`, `eas init`); Apple Developer team id |
| 8 | Crash reporting tagged by update id | a Sentry account (free tier) |
| 9 | Staging Supabase project; local development points there | approval to create a second project |

Then the Master, which edits exactly what steps 3–6 create: memberships and scopes, app config,
flags, screen sections, catalogue, pricing, coupons, discounts, orders.

## 6. Good references

- Supabase — *Custom Claims and Role-based Access Control (RBAC)* (custom access token hook), *Row Level Security*, *Identity Linking*, *Send Email Hook*.
- AWS — *SaaS Tenant Isolation Strategies* whitepaper (pool vs silo models; we are "pool with row-level isolation").
- Martin Fowler — *Parallel Change* (expand / contract for schema and API changes).
- Stripe engineering — *APIs as infrastructure: future-proofing Stripe with versioning*.
- Airbnb engineering — *A Deep Dive into Airbnb's Server-Driven UI System* (Ghost Platform).
- Expo — *EAS Update: introduction*, *Runtime versions and updates*, *Deployment patterns* (channels and branches), *Rollouts*.
