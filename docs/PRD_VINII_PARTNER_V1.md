# PRD — VINII Partner V1: the restaurant's order-accepting app

**Status:** draft for founder approval · **Date:** 2026-09-22 · **Family:** VINII POS merchant apps (decision D07) · **Working name:** VINII Partner
**Platform:** React Native with Expo — same SDK 57, Expo Router and toolchain as the One Local app — as a second app in this repository: `OL-ui/partner/`. It talks only to One Local's server (`/api/partner/*`), which reads and writes the POS tables with the server key.
**Goal:** when a customer orders food in One Local, the restaurant's phone **rings with the new order** (Swiggy-partner style), staff **accept or reject within 60 seconds**, then mark it **ready** and **delivered** — and the customer sees each step live.

---

## 1. Sources

| Source | What it decides | Confidence |
|---|---|---|
| POS source understanding §3.2 "OneCity restaurant order" | The order is *placed*, not automatically accepted; the restaurant receives it, **explicitly accepts or rejects using the expected order version and a reason**; acceptance starts the kitchen; a restaurant that cannot receive orders must not keep promising acceptance | read directly |
| POS PRD §10 integration contracts | OneCity creates the order with an idempotency key → *placed*; restaurant accept/reject with expected version and reason; kitchen ticket with unique id; ready event | read directly |
| Decision D03, D04 | Cash-first pilot; OneCity restaurant reachability timeout 5 minutes; device heartbeat 60 s | read directly |
| viyaa routes §13 | Order lifecycle ORDER_CREATED → MERCHANT_ACCEPTED → PREPARING → READY → DELIVERY_ASSIGNED → PICKED_UP → DELIVERED → COMPLETED | read directly |
| Product Architecture §68 | Notification platform: in-app and push, priorities, retries, delivery status | read directly |
| Founder notebook (AI summary) | **60-second accept/reject timer for vendors** | medium — confirm |
| Live database (`docs/CENTRAL_DB_MAP.md`) | POS `orders` accepts `channel='online'`, `placed_by='integration'`, `external_ref`; order and kitchen numbers come from `next_org_seq`; `kot_tickets` statuses new → preparing → ready → delivered; `item_channel_status` has no channel restriction; staff are `org_users` with roles; email sign-in is enabled | read directly |
| Swiggy restaurant-partner app (general reference) | Interaction patterns only: outlet on/off, ringing new-order card, prep time on accept, order tabs, item out-of-stock | reference |

---

## 2. Scope

**Pilot (V1):** one city (Latur) · **one restaurant — dummy data:** *Mysore Dining Hall (Test)*, the existing test organization that already has 6 staff logins and 35 menu items in 9 categories: Biriyani, Curries, Dining Hall Combos, "Dose · Roti · Rice", Snacks, Sweets, Thalis, Cold Beverages, Hot Beverages · orders only from One Local's Food section · cash on delivery · delivery done by the restaurant's own staff (the rider app comes later; its PRD is `PRD_ONLATUR_RIDER_V1.md`).

**Not in V1:** Swiggy/Zomato order sync, printing from the phone (the Windows POS prints), menu editing (only switching items on/off), online payments, payouts, multiple branches.

---

## 3. Decisions (proposed defaults)

| # | Decision | Proposal | Note |
|---|---|---|---|
| PD1 | Accept window | **60 s** (notebook), ringing until answered | On timeout the order is cancelled for the customer ("restaurant didn't respond") |
| PD2 | Auto-pause | After **3 missed orders in a row** the restaurant is switched to "not accepting" and the owner is notified | Honours "must not keep promising acceptance" |
| PD3 | Prep time | Staff pick 10 / 15 / 20 / 30 / 45 min on accept (default 20) | Shown to the customer as the ETA |
| PD4 | GST | POS menu prices exclude GST; One Local adds **5%** GST (POS default) as a separate cart line for restaurant orders | Keeps One Local and POS totals identical |
| PD5 | Who may do what | Accept/reject/outlet on-off: org_owner, org_admin, manager, biller · Mark ready: also kitchen · Read-only: viewer | Uses existing `roles` |
| PD6 | Sign-in | Existing staff email + password (email sign-in is already on) | No new accounts needed for the pilot |
| PD7 | Several phones | Every signed-in phone of the restaurant rings; the first to accept wins, the others stop ringing | |
| PD8 | Pilot name | Show the pilot as "Mysore Dining Hall (Test)" with a test Latur address | The database restaurants are dummies |

---

## 4. Order flow and states

```
One Local (customer)           One Local server                      VINII Partner (restaurant)          POS (Windows)
Places Food order (COD) ─────► creates One Local order + POS order ─► 🔔 NEW ORDER rings (60 s)
"Waiting for the restaurant"   (online / integration / OL-000024)      Accept + prep time ─────────────► kitchen ticket appears
"Preparing · ready in 20 min"◄ order accepted, kitchen ticket created   (or Reject + reason → customer told)
"Ready"                      ◄ ready                                   Mark ready  ◄──────────────────── (or kitchen marks ready)
"Out for delivery"           ◄ out for delivery                        Out for delivery
"Delivered"                  ◄ delivered, cash recorded                Delivered (cash collected ₹X)
```

| Step | POS `orders.status` | POS `kot_tickets.status` | POS `order_events.kind` | One Local order status |
|---|---|---|---|---|
| Order arrives | `new` | — | `placed` | `placed` |
| Accepted | `sent_to_kitchen` | `new` | `accepted` (meta: prep minutes, by) | `accepted` |
| Kitchen starts (optional, from POS) | `sent_to_kitchen` | `preparing` | `kot_preparing` | `accepted` |
| Ready | `ready` | `ready` | `kot_ready` | `packed` |
| Out for delivery | `ready` | `delivered` | `out_for_delivery` | `out` |
| Delivered | `delivered` | `delivered` | `delivered`, then `paid` (cash) | `delivered` |
| Rejected / timed out | `cancelled` | — | `rejected` / `timed_out` (meta: reason) | `cancelled` |

Every change carries the order's last-updated time as the *expected version*; a stale change is refused ("someone else already accepted this order").

---

## 5. The new-order alert (built and proven first)

- **Card:** full screen. Order number, time placed, customer first name, items with quantities and notes, total, "Cash on delivery", a **60 s countdown ring**, prep-time chips, **Accept** (large) and **Reject** (asks for a reason: item out of stock · kitchen busy · closing soon · other).
- **Sound:** a loud repeating ring with vibration until someone answers or time runs out; stops on every phone when any phone answers.
- **In every app state:**
  - **App open:** checks every 5 s while the restaurant is accepting, and opens the card.
  - **Background or locked:** a high-priority push with the custom sound. Tapping it opens the card.
  - **Closed:** the same push.
- **Push path:** One Local server → Expo Push → Firebase (Android) / Apple (iOS).
  - **Android:** a dedicated "New orders" channel with the ring sound. Push can only be tested on a **development build**, because Expo Go can't receive pushes on Android.
  - **iOS:** time-sensitive notifications. Needs an Apple Developer account.
- **Proof milestone (P0):** a **Send test order** button in Settings creates a fake order for this restaurant only. It passes when:
  1. The card and sound appear within 3 s with the app open.
  2. A push with sound arrives within 10 s with the app in the background or the phone locked.
  3. Accept, reject and time-out are recorded on the server.
  4. A second phone stops ringing when the first one accepts.

---

## 6. Screens

| ID | Screen | Contents | Actions |
|---|---|---|---|
| PRT-001 | Sign in | VINII Partner brand, email + password, "Forgot password" (Supabase reset) | sign in |
| PRT-002 | Orders (home) | Header: restaurant name + **Accepting orders** switch (with "Back at" time when off); tabs **New · Preparing · Ready · Past**; order cards with number, age, items count, total, status chip | open order, switch accepting |
| PRT-003 | New order alert | Section 5 | accept with prep time, reject with reason |
| PRT-004 | Order detail | Items, notes, customer first name and area, bill (items, GST, delivery fee, total), payment, timeline of events | mark ready → out for delivery → delivered (slide to confirm), call customer (during the order only) |
| PRT-005 | Items | Menu by category (the 9 categories) with **Available on One Local** switches; "Off until" (1 h, today, manual) | switch items |
| PRT-006 | Settings | Restaurant, signed-in person and role, notification status, **Send test order**, sound test, sign out | test |

**UI rules (shared with One Local):** the same colour tokens, type and radius; the VINII green (#76EC00) for the accepting state (from the approved POS reference); one primary action per screen; 56 px buttons; slide to confirm irreversible steps; every list has loading, empty, offline and error states; big bold totals.

---

## 7. Data

**Existing OS/POS tables used unchanged:** `organizations`, `org_users`, `roles`, `menu_categories`, `menu_items`, `item_channel_status` (channel `one_local`), `orders`, `order_items`, `order_events`, `kot_tickets`, `payments`, `org_counters` via `next_org_seq()`.

**New One Local tables** (migration `0022`, same rules as `0021`: `ol_` prefix, comments on everything, server-only access):
| Table | Purpose |
|---|---|
| `ol_merchant_channels` | Per restaurant: accepting One Local orders, back-at time, default prep time, missed-in-a-row count, test address and map position for the pilot |
| `ol_partner_devices` | Staff phones to ring: organization, user, Expo push token, platform, last seen |
| `ol_orders` (new columns) | `organization_id`, `restaurant_deadline` (accept-by time), `prep_minutes`, `gst` |

The POS channel list (`channel_integrations`) only allows Swiggy, Zomato, ONDC, website, WhatsApp and QR. Adding "one_local" there is a small OS change to request; until then `ol_merchant_channels` holds the switch.

---

## 8. API (One Local server; staff must be signed in and active members of the restaurant)

| Route | Purpose |
|---|---|
| `GET /api/partner/me` | Person, role, restaurant, accepting status |
| `PATCH /api/partner/outlet` | Accepting on/off, back-at time |
| `GET /api/partner/orders?tab=new\|preparing\|ready\|past` | Order lists |
| `GET /api/partner/orders/:id` | Detail and timeline |
| `POST /api/partner/orders/:id/accept` | `{ prep_minutes, expected_updated_at }` |
| `POST /api/partner/orders/:id/reject` | `{ reason, expected_updated_at }` |
| `POST /api/partner/orders/:id/ready` · `/out` · `/delivered` | Next step, with expected version |
| `GET /api/partner/items` · `PATCH /api/partner/items/:id` | Menu availability for One Local |
| `PUT /api/partner/devices` | Register this phone for alerts |
| `POST /api/partner/test-order` | P0 proof (5 per hour) |

One Local changes: Food shows the pilot restaurant's live menu (only items available on One Local, and only while it is accepting); a restaurant cart checks out into a POS order; tracking reads the POS state; a timer cancels unanswered orders after 60 s (PD1).

---

## 9. Build sequence

| Milestone | Delivers | Done when |
|---|---|---|
| **P0 — It rings** | Partner app sign-in, Orders list, alert card with ring and countdown, test order, device registration, push | the four checks in §5 pass on a real phone |
| **P1 — Real orders** | One Local Food shows the pilot menu; checkout creates the POS order; accept/reject/timeout; ready → out → delivered; customer tracking follows | a One Local order is accepted on the phone and delivered, with the customer seeing each step, and it appears in the POS |
| **P2 — Restaurant control** | Items on/off, accepting switch with back-at, auto-pause after misses, multi-phone race | pilot restaurant runs a service with it |

**How it's built to keep debugging small:** a local copy of the database (the POS tables it touches, rebuilt from production's structure, with the pilot restaurant's menu and dummy staff) runs on the Mac; everything is tested against it first; production changes are applied only after approval, through the same numbered migrations.

## 10. Open questions
PD1–PD8, plus: is restaurant-delivered (no rider app) acceptable for the pilot? Which of the 6 existing staff logins should be used for testing (or create a dedicated test login)?
