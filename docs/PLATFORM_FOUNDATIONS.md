# Platform foundations — one database, many apps, updates without rebuilds

Decided 2026-09-26; D16–D25 added 2026-09-28 (section 6, the platform contract). Owner of these decisions: product (Claude, by the founder's delegation).
Applies to every app on the shared Supabase project `ywylhzcxuoeilygzdonx`: One Local (customer),
VINII POS, VINII Partner (restaurant phone), OnLatur Rider, Master (control plane), Provia OS.
Canonical names (POS repo decision D07): **Proviyaa** = the ecosystem, **Proviyaa Master** = its control plane,
**VINII POS** = merchant apps, **One Latur** = the marketplace instance of the **OneCity** pattern (this repo, working
name "One Local"), **OnLatur** = delivery and riders.
Aligned with the founder's release plan (`agentic-os-coder/docs/RELEASE_AND_DISTRIBUTION_PLAN.md`):
*build once, configure per organization*; channels internal → pilot → stable; Master is the control plane.

---

## Decisions at a glance

| # | Decision | The alternative that lost, and why |
| --- | --- | --- |
| D1 | **One person = one login** (`auth.users`) across every app | Separate user tables per app: Supabase has one auth pool per project anyway; separate tables mean the same phone number becomes three strangers, and passwords live in our tables |
| D2 | **What a person may do comes from memberships**, one table per kind of relationship: staff → `org_users`, riders → `riders`, marketplace customers → `shoppers` (not `customers`: that OS table holds the business owners who buy Proviyaa), our own team → `platform_admins` + scopes | One `users.role` column: a restaurant owner who also orders dinner would need two accounts |
| D3 | **Data is owned by a business (`organization_id`) and located in a market (`city_id`)** — those two scope data | Scoping data by app id: an order placed in One Local must be the *same* order in VINII POS and the Rider app; app-scoped data breaks the very integration a shared database exists for |
| D4 | **App id labels the caller, it never owns data.** Used for config, feature flags, devices, versions, analytics and audit | — |
| D5 | **Phones write and read through the API; they may only *listen* directly.** Live screens (order status, incoming orders, rider jobs) subscribe to Supabase Realtime on narrow, authorised channels, as the founder's plan describes; every write and every catalogue read goes through the API. `ol_*` tables keep RLS on with no public policies (verified: 19/19) | Apps reading and writing Supabase directly: every business rule would have to be re-written as RLS and the service key would drift towards phones. Polling for live status instead of Realtime: slower and heavier on batteries |
| D6 | **Each app owns its tables; others read through contracts** (a view, a function or an API), and changes are additive only | Reaching into another app's columns: one rename breaks three apps |
| D7 | **One migration ledger, owned by the OS repository `loki1514/Repo-1-`** (as the POS repo's owner-approved D06 already says). Other apps propose migrations there; file names carry the owner (`0021_ol_one_local_core.sql`) | Today One Local's 0021–0024 are live but **not recorded** and not in Repo-1-, which stops at 0020. They move there under the same numbers, so production's reality and the ledger match |
| D8 | **Three update lanes**: data (instant, Master) → UI code (OTA, minutes) → native build (store, days) | Rebuilding for every change: store review for a price change |
| D9 | **Server-driven screens** for anything merchandised (home, department pages, collections): the app ships a library of section types; the server decides which, in what order, with what content | Hard-coded screens: every campaign needs an OTA at best |
| D10 | **The server supports every app version still in the field**; below the minimum it answers "please update" | Breaking API changes: phones that haven't updated crash |
| D11 | **One Local's customer app stays on Expo / React Native**, not Flutter. The founder's plan names Flutter + Fastlane for the mobile apps; VINII POS stays Flutter. The apps share the database and the API contract, not code | Rewriting One Local in Flutter: throws away a working, demo-ready app, and Flutter has no built-in over-the-air updates (only a third-party service), which lane 2 depends on |
| D12 | **Settings resolve through the founder's 7-tier order**: platform default → region (city) → plan → organization → location → role → user; the most specific wins | A flat per-app settings table: can't express "this restaurant's branch" or "this role" |
| D13 | **One Master website for every app: the existing Proviyaa console in Repo-1- (`/admin`)**, extended with a *One Latur* workspace (catalogue, screen sections, pricing, coupons, discounts, orders, shoppers, support) and an *OnLatur* workspace (riders, zones, dispatch), next to what it already has (organizations, people, roles, modules, workflows, growth, success, support). Merchants keep their own portal (`/org`) and never enter the Master | A new admin website per app: a second sign-in, a second copy of organizations, people and roles, and they drift. A brand-new Master site: throws away a working console with platform roles and section-level permissions |
| D14 | **The Master's One Latur screens change data by calling One Latur's admin API** (`/api/admin/*`) with the admin's own login, not by writing `ol_*` tables themselves | Master writing the tables directly: pricing, refund and validation rules would exist in two codebases, and changes would bypass One Latur's checks and audit |
| D15 | **`ywylhzcxuoeilygzdonx` is production for every app from today.** The POS repo's note calling it "staging" (2026-09-15) is superseded; it holds real organizations, staff and now the live One Latur app. A new, separate staging project serves development for all apps | Keeping two labels for one database: one team would test destructively on what another team runs live |
| D16 | **Every kind of record has one owner, and only the owner changes it.** Other apps read it (through a view or function the owner publishes) or ask the owner to change it (its API or a front-door database function). Sharpens D6 from "app" to "domain": ownership table in §6.2 | Any app writing any table it can reach under RLS: three order tables already carry three status vocabularies |
| D17 | **A restaurant order placed on One Local is one order with two sides.** One Latur owns the customer side (`ol_orders`, `ol_checkouts`: what was bought, paid, and where it goes). The POS owns the kitchen side (`orders`: what is cooked and billed). They are linked 1:1 by `ol_orders.pos_order_id` and `orders.external_ref = 'onelocal:<id>'`, and both links are unique. Neither app writes the other's side except through the owner's front-door function | One merged orders table for every channel: the marketplace needs checkouts across stores, addresses and online payment, and the kitchen needs KOTs, tables and billing. Merging now breaks both working apps |
| D18 | **The database refuses bad states.** Status columns have CHECK lists. Money columns are `>= 0` and totals add up. External references (payment ids, POS links) are UNIQUE. Status changes go through the owner's function, which checks an allowed-moves list, and final states stay final | Rules in app code only: three codebases (Next.js, Expo, Flutter) write orders, and one mistake anywhere corrupts all |
| D19 | **A retry never makes a second record.** Every create, pay, refund and accept call carries an idempotency key, which the owner stores as UNIQUE. The same key with the same request returns the first answer. The same key with a different request gets `409`. A retry of a move already made returns the current state, not an error. The offline POS uses its outbox intent id as the key | Relying on the network: a POS or phone that retries after a timeout makes Order #1001 and #1002 |
| D20 | **Events are rows written in the same transaction as the change, in the owner's own append-only table (the outbox).** Every row carries a canonical name from the founder's event list (`order.created`, `payment.completed`…), a version, `organization_id`, `city_id`, actor, app and request id, and no personal data. Consumers listen over Supabase Realtime or read by cursor, and de-duplicate by event id | A separate message broker now: new infrastructure and running cost with nothing to solve at today's volume. Revisit when a consumer outside Postgres needs it. Realtime on raw tables alone: row changes carry no meaning ("status changed" instead of "order.cancelled") and can't be replayed after downtime. One shared `platform_events` table written by every app: that is itself a shared mutable table, against D16 |
| D21 | **Every API call carries the same envelope** (founder §82). Headers: `x-request-id`, a UUID from the client, echoed in the response, logs, audit and events. The bearer token gives the user. `x-app`, `x-app-version`, `x-runtime`, `x-platform` as in §3. `idempotency-key` on writes. The server works out the **authorization context** (organization, location, role, scopes) from memberships. It never takes it from the request body | Each app inventing its own headers: a problem can't be traced across One Local → POS → Partner |
| D22 | **Permissions are actions, not pages.** Examples: `listing.approve`, `order.accept`, `order.refund`, `shopper.block`. A role is a bundle of actions, and the server checks the action on every call. Hiding a button is only cosmetic. One catalogue of action names lives in the OS kernel. It is seeded from today's code maps (`server/partner.ts`, `server/admin.ts`) | Module-level access only (`role_module_access` today): a cashier who can see orders must still not be able to refund them |
| D23 | **Support sees what a merchant sees through "view as", never through their password.** It is read-only, limited to 30 minutes and one organization, and needs a reason (a ticket). The actor, the person viewed, the organization, the reason, the start and the end are logged. The screen shows a banner. Any change during support is made as the admin themself and logged as the admin | Sharing a password or minting the user's own token: the audit trail can't tell support from the merchant, and the DPDP Act asks for the least access. Write-as-user is deferred until a real case needs it |
| D24 | **Each API has one written contract.** Request and response schemas live in the owner's server code (zod). The owner publishes them as OpenAPI (`/api/openapi.json`). Repo-1- (TypeScript) and the Flutter apps generate their clients from it. Contract checks run on every change. Every error has one shape, `{ "detail", "code" }`. A breaking change means a new version path; within a version, changes are additive only (D10) | Hand-written types per app: already drifting (§6.6, the Partner app's staff sign-in) |
| D25 | **Seven version numbers, each kept in one place.** API: the path. App version and runtime: headers, and `apps.min_supported_runtime`. OTA update: its id. Configuration: `app_config.version`. Database schema: the `schema_migrations` ledger. Events: `v` on each event. They move independently and are never mixed | One "release number" for everything: an OTA fix would need a schema bump, or the other way round |

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
 shoppers     org_users          riders               platform_admins
 (anyone who      (staff of a        (delivers for an     (+ platform_admin_scopes:
  orders; city     restaurant /       organization, or     app, city, role)
  is a preference) store; role_id)    independent)        Provia / One Local team
     │                │                  │                       │
 One Local app    VINII POS,          OnLatur Rider           Master, Provia OS
                  VINII Partner
```

**Same human, several hats.** Ravi signs into One Local with his phone and orders food (he has an
`shoppers` row). His cousin's restaurant adds him as a rider: an invite creates a `riders` row
for the *same* `user_id`. The Rider app lets him in because that row is active; One Local doesn't
care. If the restaurant removes him, only the `riders` row is deactivated — his orders and customer
account are untouched.

**How each app decides who may enter** (checked by the API on every call, cached for a minute):

| App | Sign-in | Allowed when |
| --- | --- | --- |
| One Local | phone OTP (target), Google, email | anyone; `shoppers` row created on first sign-in. Guests allowed with a device key (as today) |
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

### New tables this needs (migrations 0025–0026 in Repo-1-, additive)

| Table | Purpose |
| --- | --- |
| `apps` | Registry of applications: code, name, platforms, store ids, minimum supported runtime per channel (matches the release plan's `apps`) |
| `shoppers` | `user_id` (PK), name, phone, default city, created via which app, marketing consent. Replaces the profile kept on the phone today |
| `ol_addresses` | Saved addresses per customer (today on the phone) |
| `riders` | As in `PRD_ONLATUR_RIDER_V1.md`: user, organization (nullable = independent), status, vehicle, cash limit |
| `platform_admin_scopes` | `user_id`, `app`, `city_id` (null = all), role (`owner`, `ops`, `catalog`, `support`, `finance`) |
| `app_devices` | One row per installed app: user (nullable for guests), app, platform, push token, app version, runtime version, update id, last seen. Generalises `ol_partner_devices` (kept; merged later) |
| `app_config`, `feature_flags` | Section 3; per app, resolved through the 7-tier order (D12): platform → city → plan → organization → location → role → user |
| `audit_log` | Who (user), through which app, what table/row, before → after, when |

**Who owns each new table** (the founder's architecture puts identities, memberships, roles,
configuration, feature availability, releases and audit in the Master; the POS repo records the same):

| Owner | Tables | Where the migration is written |
| --- | --- | --- |
| Proviyaa Master (control plane) | `apps`, `platform_admin_scopes`, `app_devices`, `app_config`, `feature_flags`, `audit_log` | Repo-1- |
| Commerce core (One Latur builds it first) | `shoppers` | proposed from this repo into Repo-1- |
| One Latur | `ol_addresses` (and the existing `ol_*`) | proposed from this repo into Repo-1- |
| OnLatur | `riders` | proposed from the rider app into Repo-1- |

"One Local is the central app" (founder, 2026-09-22) stands for the product: it is the flagship live
app. It no longer means One Local runs its own database changes; the single ledger is Repo-1- (D7).

Roles for One Local get prefixed slugs in the shared `roles` table (`ol_city_ops`, `ol_catalog`)
so they never collide with POS roles like `manager`. (Corrected 2026-09-28: the table's slug rule,
`^[a-z0-9]+(_[a-z0-9]+)*$` in Repo-1- 0004, refuses dots, so the earlier `ol.city_ops` could not be inserted.)

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
3. **One ledger.** Every migration is recorded in `schema_migrations`, named `<number>_<owner>_<what>.sql` in Repo-1- (`0026_ol_shoppers.sql`). Repo-1- is the only place that runs them in production.
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
| 1 | Copy 0021–0024 into Repo-1- as `0021_ol_…`–`0024_ol_…` (a pull request), and record them in `schema_migrations` | approval to open a pull request on Repo-1- and to write 4 rows in production |
| 2 | App identity headers in the API client + server logging | — |
| 3 | Migrations 0025–0026 in Repo-1-: Master tables (`apps`, `platform_admin_scopes`, `app_devices`, `app_config`, `feature_flags`, `audit_log`) and One Latur tables (`shoppers`, `ol_addresses`); backup first | approval of the pull request and to apply in production |
| 4 | Move profile and saved addresses from the phone to `shoppers` / `ol_addresses` | — |
| 5 | `GET /api/config`, feature flags read from the table, min-version + maintenance gate screen | — |
| 6 | Server-driven home (`/api/screens/home`) and the section library; then department pages | — |
| 7 | EAS: project, `eas.json` channels internal/pilot/stable, first `pilot` build, first OTA | an Expo account (`eas login`, `eas init`); Apple Developer team id |
| 8 | Crash reporting tagged by update id | a Sentry account (free tier) |
| 9 | Staging Supabase project for all apps (POS, One Latur, Master); development points there; POS repo's D06/Q04 updated to match D15 | approval to create a second project |

Then the Master — new workspaces inside Repo-1-'s console (D13), which edit exactly what steps 3–6 create: memberships and scopes, app config,
flags, screen sections, catalogue, pricing, coupons, discounts, orders.

## 6. The platform contract (aligned 2026-09-28)

The founder shared an outside architecture review whose idea is "many clients, one platform". It
agrees with the founder's own *Product Architecture* on each point: §71 offline outbox and idempotency,
§74 domains, §80 append-only audit, §81 events, §82 the fields every API call carries, §83 action-level
permissions, and Master page PAGE-MST-003 "impersonate with controlled audit". It also agrees with
D1–D15. This section records how we apply it, where we deliberately depart from it, and what the code
does today. The same day, a parallel session aligned VINII Partner (`One Local Delivery app /docs/PLATFORM_CONTRACT_ALIGNMENT.md`).
Its POS order contract (§4 there: front-door functions, allowed status moves, event names) is adopted
here and not repeated.

**The rule: apps are clients, and the platform is the truth.** The Master (React/Next.js), the POS
(Flutter) and One Local and Partner (Expo) never talk to each other. They agree only on identity,
data ownership, API contracts, events, configuration and authorization. The network boundary makes
the screen technology irrelevant. The exceptions (offline, printers and scanners, token storage, push,
deep links) stay inside each app's own runtime.

### 6.1 Principle by principle

| Principle | Founder's document | Where we are (2026-09-28) | Decision |
| --- | --- | --- | --- |
| One identity, many memberships | actor groups; §103 | Decided. Gap: `current_org_id()` picks one of a person's organizations at random (Partner alignment G1) | D1, D2 |
| Only the owner changes a record | §74 domains | The Master changes One Local only through its API ✔. One Local writes POS tables itself ✗ | D16, D17 |
| The database refuses bad states | §102 "valid state transitions" | CHECK lists on every `ol_*` status ✔. No allowed-moves rule on POS orders. No money checks on `ol_orders` | D18 |
| Retries never duplicate | §71, §82 | Checkout ✔ (key plus unique index). POS orders have no key (G4). The POS outbox is built but sends nothing yet | D19 |
| Events | §81 | `order_events` timeline over Realtime ✔. No canonical names, and nothing for marketplace orders | D20 |
| Every call carries who, where, why | §82 | Not sent or read anywhere | D21 |
| Action-level permissions | §83 | Code maps only. The database checks membership, not role (G2) | D22 |
| Audited impersonation | PAGE-MST-003 | Absent (the Master's support page says "Planned") | D23 |
| One written API contract | — | None. `shared/types/supabase.ts` is stale and unused. Checks are not run automatically | D24 |
| Versioning | — | Specified in §3, headers not sent yet | D25 |
| Offline only where needed | §71; POS D02, D05, D10 | POS: Drift plus an outbox, PowerSync spike not wired. Customer app, Partner and Master are online-only | unchanged |

### 6.2 Who owns what (D16)

| Domain | Owner | Tables | Everyone else changes it through |
| --- | --- | --- | --- |
| Identity and memberships | Proviyaa OS (Repo-1-) | `auth.users`, `org_users`, `roles`, `platform_admins` (+ `platform_admin_scopes`) | Master screens; Supabase Auth |
| Organizations, outlets, plans | Proviyaa OS | `organizations`, `locations`, `subscriptions`, `org_modules` | Master `/admin`, merchant `/org` |
| Catalogue (the Item Master) | Proviyaa OS merchant portal (VINII) | `menu_categories`, `menu_items`, `menu_item_variants`, `item_channel_status` | `/org` screens. The Partner app's item switch is a direct write today; it becomes a POS-owned function |
| Kitchen order, KOT, restaurant payments | VINII POS (tables in the Repo-1- ledger) | `orders`, `order_items`, `kot_tickets`, `payments`, `order_events` | `pos_place_order`, `pos_set_order_status`, `pos_record_payment` (proposed, Partner alignment §4.1) |
| Marketplace | One Latur (this repo) | `ol_*`: listings, checkouts, orders, payments, refunds, shoppers, addresses, consents | One Local's API. The Master uses `/api/admin/*` (D14) |
| Delivery and riders | OnLatur (not built) | `riders`, deliveries | the rider API |
| Config, flags, apps, devices, audit | Master | `app_config`, `feature_flags`, `apps`, `app_devices`, `audit_log` | Master screens. `audit_log` accepts appends from every owner and is never edited |

Reads are open to other apps, but through a view or function the owner publishes, so a renamed
column breaks one view instead of three apps. Today One Local reads the Item Master tables directly
(`frontend/server/marketplace.ts`). The POS side should publish a channel-catalogue view for it.

### 6.3 One order, two sides (D17)

```
Customer (One Local)  POST /api/checkout   idempotency-key: <per attempt>
      │
      ▼
ol_place_checkout()   ── one database transaction ─────────────────────────────┐
  ├─ ol_checkouts, ol_orders, ol_order_items          customer side (One Latur) │
  ├─ ol_order_events: checkout.created, order.created  One Latur's outbox       │
  └─ restaurant store? → pos_place_order(key = ol order id)                     │
        ├─ orders (channel 'online', external_ref 'onelocal:<id>')             │
        ├─ order_items, kot_tickets                   kitchen side (POS)        │
        └─ order_events: placed (= order.created)     the POS's outbox          │
──────────────────────────────────────────────────────────────────────────────┘
      Realtime / cursor ──► VINII Partner · Windows POS · KDS · rider app · analytics

Kitchen moves (accept, ready, out, delivered) → ol_partner_act → pos_set_order_status
      → order_events on the kitchen side, ol_orders status + ol_order_events on the customer side
```

Both sides are written in one transaction, so an order exists on both sides or on neither. This is
possible because every app shares one Postgres. The status words differ by side, and the event name
is what joins them:

| Customer side (`ol_orders`) | Kitchen side (`orders`) | Event |
| --- | --- | --- |
| placed | new | `order.created` |
| accepted | sent_to_kitchen | `order.accepted` |
| packed | ready | `kot.ready` |
| out | ready (event `out_for_delivery`) | `delivery.picked_up` |
| delivered | delivered | `order.fulfilled` |
| cancelled | cancelled | `order.cancelled` (`meta.reason`) |

The Windows POS's own `online_orders` table stores display strings and a free-text status. It must
not become a third truth. Its Online Orders screen reads `orders` where the channel is `online`. The
table is not in production (checked 2026-09-28).

### 6.4 Allowed moves and retries (D18, D19)

- **Customer side**:
  - `placed → accepted → packed → out → delivered`, and `placed` or `accepted → cancelled`.
  - `delivered` and `cancelled` are final.
  - Payment: `not_charged` or `pending → paid → refunded`, and `pending → failed → pending` (a retry).
  - Enforced in the owner's function and by a trigger, so they hold whoever writes.
- **Kitchen side**: Partner alignment §4.2. `paid` and `cancelled` are final, nothing returns to
  `new`, and cancelling a paid order is a refund.
- **Keys**:

  | Operation | Key |
  | --- | --- |
  | Checkout | the `idempotency-key` header the phone generates per attempt (in place) |
  | Kitchen order | the One Local order id |
  | Offline POS | its outbox intent id |
  | Payments | Razorpay's ids (unique, in place) |
  | Refunds | their reference (unique, in place) |
  | Accept / ready / out | the expected version, plus "already there" returning the current state |

### 6.5 Events (D20)

Every event row carries these fields:
- `event_id` and a canonical `type`
- `v` (the event version)
- `organization_id` and `city_id`
- `subject` (type and id)
- `actor_user_id`, `app` and `request_id`
- `occurred_at`
- `payload`: ids, amounts and states only. Never names, phone numbers or addresses (DPDP).

Kitchen-side events stay in `order_events`, keeping their kinds (the mapping is in Partner alignment
§4.3). Customer-side events go into a new append-only `ol_order_events`. Its first names:
- checkout: `checkout.created`
- order: `order.created`, `order.accepted`, `order.cancelled`, `order.fulfilled`
- payment: `payment.completed`, `payment.failed`, `payment.refunded`
- listing: `listing.approved`, `listing.paused`

Names are only ever added, and each new one is added to this list in the same change.

### 6.6 Where the code is today (checked 2026-09-28)

**Fixed in this change.** The Partner API's staff sign-in (`frontend/server/partner.ts`) asked for
`org_users.name` and `is_active`, and matched roles by display name. The real columns are `full_name`
and `status`, and the permission rules use role slugs (`manager`, not "Manager"). Production's schema
was checked. On the real database every staff sign-in would have failed, and so would the "is this
shopper a merchant's staff member" check before a block (`frontend/server/admin.ts`). No automated
check covered either. Both now follow the OS schema. A person on staff at two restaurants gets their
earliest membership until the app lets them choose.

| # | Gap | Evidence | Effect | Fix | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | Checkout never creates the kitchen order | `server/store.ts:147-222` writes `ol_orders` with no `organization_id` or `pos_order_id`. `ol_create_restaurant_order` is called only by the test path (`server/restaurant.ts:177`) | A real restaurant order would reach neither the Partner app nor the POS (already a go-live blocker in the journal) | §6.3 | One Local, POS |
| 2 | Checkout is three separate writes. The order lines are best-effort | `server/store.ts:181-219` | A failure between them leaves an order without its lines | One `ol_place_checkout` function | One Local |
| 3 | On the database, a reused key with a different cart returns the first checkout | The comparison runs only in sample-data mode (`store.ts:158-162` vs `177-180`) | Two different carts can collapse into one | Store the request fingerprint; answer `409` | One Local |
| 4 | Retrying an accept that already succeeded answers "stale" | `db/migrations/0023:141-143` | The Partner app shows an error for an order that was accepted | Return the current state | One Local |
| 5 | One Local writes POS tables and reads the Item Master directly | 0023 (`orders`, `order_items`, `order_events`, `kot_tickets`, `payments`); `server/restaurant.ts:136-147` (`item_channel_status`); `server/marketplace.ts:220-239` | Two codebases decide what a kitchen order means | D16: POS front-door functions and a published view | POS, One Local |
| 6 | `ol_orders` money has no `>= 0` or totals-add-up checks. `pos_order_id` is not unique. `ol_products.store_id` and `brand_id` have no foreign key. Two statuses are free text | 0021:106, 258-269, 308, 330 | Bad rows are accepted silently | Additive constraint migration | One Local |
| 7 | The OS web POS changes a KOT by id with the service key, with no organization check and no allowed-moves check. `settleOrder` does not check state either | `Repo-1-/apps/web/src/lib/pos.ts:277-289, 483-497` | A signed-in staff member who knows another restaurant's ticket id can change it | Filter by the caller's organization and check the move | Repo-1- |
| 8 | The Windows POS's `online_orders` migration lets anyone with the public key read, change and delete | `proviyaa-pos/supabase/migrations/20260918_create_online_orders.sql:34-55` (`USING (true)` for `anon`) | Not in production. It would expose every online order if applied | Never apply as written; read `orders` instead (§6.3) | POS |
| 9 | Shared RLS: one organization per person (G1), membership but not role (G2), no key on POS orders (G4), owners can't update their organization (G5) | Partner alignment §3 | Multi-restaurant staff are broken, and any staff login can change prices or payments | One additive Repo-1- migration (Partner alignment Q2) | Repo-1- |
| 10 | No request ids or app headers, no `audit_log` (admin writes go to server logs, `server/admin.ts:89`), no action catalogue, no view-as, no OpenAPI. Errors are `{detail}` in the customer API but `{detail, code}` in the admin API | this sweep | Problems can't be traced across apps, and the contract drifts (the Partner sign-in above) | D21–D24 | all |

**Already right:**
- The service key is only on servers, in all three repos.
- Checkout carries an idempotency key with a unique index.
- Razorpay ids are unique, the webhook event id is the key, and payment state only moves forward.
- The Master changes One Local only through its admin API.
- The POS outbox is unique per (client order, operation).
- Every One Local status has a CHECK list.
- `order_events` is live over Realtime.

### 6.7 Where we depart from the review, and why

- **No API gateway or separate central API service yet.** The front doors are each owner's server
  plus Postgres functions, one transaction each. Supabase issues and verifies the tokens. A gateway
  earns its place when outside partners call us (Partner alignment Q4 asks the founder the same).
- **"Domain services" are owners, not microservices.** An owner is a repo and its functions, not a
  separately deployed service per domain.
- **The customer app stays Expo (D11).** The review's "Flutter Mobile" changes nothing, because apps
  share contracts, not code.
- **`users.email UNIQUE` is Supabase Auth's job.** We keep no user table of our own (§2, Never 1).
- **Impersonation is narrowed to read-only "view as"** (D23).
- **No message broker yet** (D20).

### 6.8 Build order (adds to §5)

| Step | What | Owner | Needs from the founder |
| --- | --- | --- | --- |
| C1 | ✔ Partner sign-in and the shopper-block check follow the OS schema | One Local | — |
| C2 | Organization filter and allowed-moves check on `setKotStatus` / `settleOrder` | Repo-1- | — |
| C3 | Keep `online_orders` out of production; the Windows POS reads `orders` (channel `online`) | POS | agree D17 with the POS owner |
| C4 | POS front-door functions, `orders.idempotency_key`, G1/G2 RLS: one additive Repo-1- migration | Repo-1-, POS | approve the migration |
| C5 | `ol_place_checkout` (one transaction, calls `pos_place_order` for restaurants, writes `ol_order_events`), money and uniqueness constraints, fingerprint check, accept-retry fix | One Local | approve the migration |
| C6 | Request envelope (D21) in every client; servers echo and log it (merges §5 step 2) | all | — |
| C7 | `audit_log` (append-only) and the action catalogue seeded from the code maps (merges §5 step 3) | Repo-1- | approve the migration |
| C8 | "View as" for support | Repo-1- | — |
| C9 | zod schemas → OpenAPI → generated clients (Repo-1- `lib/one-local.ts`, Dart), checks in CI, `{detail, code}` everywhere | One Local, then the others | — |

C2–C5 come before the first real restaurant goes live. C6–C8 go with the Master build.

## 7. Good references

- Supabase — *Custom Claims and Role-based Access Control (RBAC)* (custom access token hook), *Row Level Security*, *Identity Linking*, *Send Email Hook*.
- AWS — *SaaS Tenant Isolation Strategies* whitepaper (pool vs silo models; we are "pool with row-level isolation").
- Martin Fowler — *Parallel Change* (expand / contract for schema and API changes).
- Stripe engineering — *APIs as infrastructure: future-proofing Stripe with versioning*.
- Airbnb engineering — *A Deep Dive into Airbnb's Server-Driven UI System* (Ghost Platform).
- Expo — *EAS Update: introduction*, *Runtime versions and updates*, *Deployment patterns* (channels and branches), *Rollouts*.
