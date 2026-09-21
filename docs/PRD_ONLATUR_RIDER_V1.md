# PRD — OnLatur Rider V1 (delivery partner app)

**Status:** draft for founder approval · **Date:** 2026-09-22 · **Product:** OnLatur (delivery and fulfilment: rider app, dispatch and delivery engine — POS decision D07)
**Platform:** React Native with Expo (same SDK 57, Expo Router and toolchain as the One Local app), in this repository as a second app, `OL-ui/rider/`, sharing One Local's API and design tokens.
**First goal:** prove that a rider's phone reliably **receives an incoming order alert** — Swiggy-style: it rings, shows the job, counts down, and the rider accepts or rejects — then run one real order end to end from one restaurant.

---

## 1. Sources and confidence

| Source | What it gives this PRD | Confidence |
|---|---|---|
| Product Architecture §51 "VINII RIDER" | The seven rider pages PAGE-RID-001 to 007 and their functions | read directly |
| Product Flow Phase 8 "V1 Rider Delivery"; V1 scope list | V1 = store-managed and restaurant-managed riders; rider registration, availability, current job, pickup, navigation, delivery, proof, exceptions, earnings; dispatch job creation, assignment, reassignment, route, ETA, tracking. Combined, hub and shared riders are later | read directly |
| viyaa routes §11–13 | OnLatur modules (Rider App, Delivery Operations, Delivery Engine); delivery is generic (food, retail, medicine, documents); the order lifecycle ORDER_CREATED → … → DELIVERY_ASSIGNED → PICKED_UP → DELIVERED → COMPLETED | read directly |
| Product Architecture §68, §77, §81 | Notification platform (in-app, push, SMS, WhatsApp; priority, retries, delivery status); fulfilment tables; delivery events | read directly |
| POS PRD §9–11; POS source understanding §3.3–3.4 | OneCity delivery flow (POS explicitly accepts → kitchen → one linked job → rider accepts and confirms pickup → proof closes fulfilment); COD: rider records cash against the job, custody and remittance are separate facts; the rider sees only what the job needs and cannot change prices or items | read directly |
| Founder notebook (AI summary, 2026-09-22) | Vendor-side 60-second accept/reject timer; virtual (masked) calling between rider and customer; rider priority types (store-linked first, then independent); rider auth route idea | **medium — not in the local copies; confirm** |
| Live database map (`docs/CENTRAL_DB_MAP.md`) | POS `orders` accepts channel `online`, `placed_by` `integration`, `external_ref`; `order_events`; `channel_integrations` per restaurant; no delivery tables exist yet | read directly |
| Swiggy delivery-partner app (general reference) | Interaction patterns only: online toggle, loud incoming-order card with countdown, step-by-step job, slide to confirm, cash in hand | reference, not copied |

**Where the documents are silent** (so this PRD proposes, marked ⚑): the rider's accept timer, alert sound and repeat, rejection limits, re-dispatch rules, cash-in-hand limits and deposit rules, KYC documents, exact earnings rates.

---

## 2. Scope

### 2.1 In V1 (pilot)
- **One city:** Latur (the existing delivery area: 15 km around the centre).
- **One restaurant — dummy data:** *Mysore Dining Hall* (an existing test organization in the database), given a **test address in Latur** for the pilot. Its menu has 35 items in 9 categories: Biriyani, Curries, Dining Hall Combos, "Dose · Roti · Rice", Snacks, Sweets, Thalis, Cold Beverages, Hot Beverages. All of it is marked as demo data.
- **Riders:** restaurant-managed riders only (Product Flow V1 model RESTAURANT → RESTAURANT MANAGED RIDER → CUSTOMER). Pilot: 1–3 riders.
- **One order per trip.** No combined or multi-stop jobs.
- **Payment:** cash on delivery only (POS D03: cash-first pilot; digital payments stay pending until a provider is verified).
- **Order source:** One Local's Food section, for the pilot restaurant only.

### 2.2 Not in V1
Combined and multi-stop jobs (PAGE-RID-003), hub and shared riders, independent fleet riders, KYC document collection, surge pricing, background GPS tracking while the app is closed, online payments, rider wallet payouts, incentives.

---

## 3. Decisions needed (proposed defaults)

| # | Decision | Proposal ⚑ | Why it matters |
|---|---|---|---|
| RD1 | Pilot restaurant | Mysore Dining Hall (dummy), with a test address in Latur; renamed in-app as "Mysore Dining Hall (Test)" | The 9 restaurants in the database are dummies with no addresses |
| RD2 | Rider accept window | 30 seconds, then the job is offered to the next rider | Documents are silent for riders |
| RD3 | When dispatch starts | When the restaurant accepts the order (rider arrives while food is prepared) | Earlier assignment = shorter delivery time; later = less rider waiting |
| RD4 | Calling | V1: rider sees the customer's phone only during an active job, hidden afterwards. V2: masked calling (notebook rule) through a telephony provider | Masked calling needs a paid provider (e.g. Exotel) |
| RD5 | Rider sign-in | Google sign-in (already built), only for riders the restaurant has added | Phone OTP needs an SMS provider and DLT registration |
| RD6 | Rider pay (pilot) | A fixed amount per delivery plus per km, both set by you; shown but not paid out by the app | "No invented fee percentages" (POS PRD §9) |
| RD7 | Cash limit | Rider cannot go online with more than ₹2,000 cash in hand until deposited ⚑ | Documents are silent; limits custody risk |
| RD8 | Test phone | Start with Android (free to test; iOS push needs a paid Apple Developer account) | Decides the first build |

---

## 4. End-to-end flow (pilot)

```
Customer (One Local)        Restaurant (VINII POS)          Server (One Local API)              Rider (OnLatur Rider)
─────────────────────       ──────────────────────          ─────────────────────               ─────────────────────
Places Food order (COD) ──► New online order appears   ◄── writes POS order (channel online,
                            with 60 s accept timer ⚑        placed_by integration, external_ref)
                            Accepts ──────────────────────► creates delivery job (RD3) ──────►  🔔 INCOMING JOB (30 s, RD2)
Tracking: "Restaurant                                       offers to nearest online rider      Accept ──► job assigned
 accepted"  ◄──────────────────────────────────────────────  (re-offers on reject/timeout)       Navigate to restaurant
                            Kitchen: preparing → ready                                          "Arrived at restaurant"
Tracking: "Rider is at     ◄───────────────────────────────  status events both ways ◄─────────  Pickup: verify order no.
 the restaurant"                                                                                 + item count → "Picked up"
Tracking: "On the way"                                                                           Navigate to customer
Shows 4-digit delivery OTP                                                                       "Arrived" → enter OTP
Tracking: "Delivered"      POS order: delivered            job completed; cash recorded ◄────   Collect ₹ cash → "Delivered"
                                                           (custody, not remittance)             Earnings updated
```

**Separate states, never one overloaded status** (POS PRD §9): order (customer view), kitchen (POS), delivery job, payment, cash custody.

| Delivery job state | Meaning | Who moves it |
|---|---|---|
| `created` | Restaurant accepted; looking for a rider | server |
| `offered` | Offered to one rider; timer running | server |
| `assigned` | Rider accepted | rider |
| `at_pickup` | Rider at the restaurant | rider |
| `picked_up` | Order handed over and checked | rider |
| `at_drop` | Rider at the customer | rider |
| `delivered` | OTP verified (or photo fallback); cash recorded | rider |
| `exception` | Something went wrong; operations decides | rider / server |
| `cancelled` | Order cancelled before pickup | restaurant / server |

The customer's tracking screen reads these instead of today's simulated timer.

---

## 5. The incoming job alert (the first thing we prove)

Modelled on Swiggy's delivery app: it is loud, obvious and fast to answer. The copy and design are OneCity's own.

### 5.1 What the rider sees and hears
- **Full-screen card:** "New delivery", restaurant name and area, distance to the restaurant, distance restaurant → customer (area only, not the full address yet), cash to collect (₹), estimated earning, and a **countdown ring (30 s, RD2)**.
- **Actions:** one large **Accept** button (slide to accept, to avoid pocket taps) and a small **Reject**. Reject asks for a reason (too far, vehicle issue, other).
- **Sound and haptics:** a distinct ringtone that repeats until the rider answers or the timer ends, with vibration. Stops immediately on any action.
- **Expiry:** at 0 the card closes with "Missed — offered to another rider". A missed count is shown on Home.

### 5.2 Delivery of the alert in every app state
| App state | How the alert arrives |
|---|---|
| Open (foreground) | The app checks for offers every 5 s while the rider is online (a live channel replaces this later) and opens the full-screen card with sound |
| In background / phone locked | A high-priority push notification with the job summary and the custom sound; tapping it opens the card with the remaining time |
| App closed | Same push; the card opens on launch if the offer is still live |
| Offline or no network | No offer is sent: a rider who hasn't been seen for 60 s (POS heartbeat D04) is treated as offline and skipped |

**Technical path:** server → Expo Push Service → Firebase Cloud Messaging (Android) / Apple Push Notification service (iOS) → phone.
- **Android:** a dedicated high-importance notification channel ("Incoming orders") with the custom sound.
- **iOS:** time-sensitive notifications. Critical alerts, which ring even in silent mode, need special Apple approval and are not in V1.
- **Expo Go can't receive pushes on Android,** so the push test needs a **development build** of the rider app. In-app alerts work in any build.
- **Accounts needed:** an Expo account, and a **Firebase project for Android push** (this is where Firebase is needed). For iOS, an Apple Developer account.

### 5.3 Proof milestone (M0) — "does the phone ring?"
A **Send test alert** button in Settings. The server creates a test offer for this rider only. Pass when, on a real phone:
1. App open → card and sound within 3 s.
2. App in background → push with sound within 10 s; tapping it opens the card with the correct remaining time.
3. Phone locked → push shows on the lock screen with sound.
4. Accept and Reject reach the server and are recorded. A missed offer is recorded as `timed_out`.

---

## 6. Screens (V1)

Page IDs follow the founder's registry (Product Architecture §51) and add the ones V1 needs.

| Page | Screen | Contents | Key actions |
|---|---|---|---|
| RID-008 (new) | Sign in | OnLatur Rider brand; "Continue with Google"; "Only riders added by a restaurant can sign in" | sign in |
| RID-001 | Home | Big Online/Offline switch; today's deliveries and earnings; cash in hand (with deposit reminder over RD7 limit); active job card; missed offers | go online/offline, open job |
| RID-001A (new) | Incoming job | Section 5.1 | slide to accept, reject |
| RID-002 | Current job | One step at a time, one primary button: *Go to restaurant → Arrived → Pickup → Go to customer → Arrived → Deliver*; restaurant and customer cards; Navigate (opens Google Maps); Call (RD4) | advance step, navigate, call, report problem |
| RID-004 | Pickup | Order number to match with the restaurant's bill; item count; optional bill photo | "Picked up" (slide), report problem |
| RID-005 | Deliver | Enter the customer's 4-digit OTP; cash to collect with "I collected ₹X"; photo proof if the customer isn't reachable | "Delivered" (slide) |
| RID-006 | Report a problem | Customer not reachable · restaurant delay · wrong or damaged item · vehicle issue · other; note; photo | send to operations |
| RID-007 | Earnings | Today and this week: deliveries, base, distance, adjustments (RD6); cash collected vs deposited | view job history |
| RID-009 (new) | Settings | Profile, vehicle type, notification check (**Send test alert**), sound test, sign out | test alert |

**UI rules (aligned with One Local):** same colour tokens (forest, lime, surfaces), type and radius; one primary action per screen; 56 px minimum buttons (gloves, bikes); high contrast for sunlight; slide-to-confirm for steps that can't be undone (accept, picked up, delivered); every screen has loading, empty, offline and error states; big numbers for money and distance.

---

## 7. Data (fulfilment domain — founder table names, Product Architecture §77)

New tables, locked like One Local's: row-level security on, only the server reads and writes them. Every table and column gets a comment.

| Table | Purpose | Key columns |
|---|---|---|
| `riders` | People who deliver | id, user_id (auth), organization_id (restaurant that manages them), name, phone, vehicle, status (invited/active/suspended), cash_limit |
| `rider_availability` | Online state and last position | rider_id, online, last_seen_at, lat, lng, battery |
| `push_tokens` | Where to send alerts | rider_id, expo_token, platform, last_ok_at |
| `delivery_jobs` | One delivery (the physical task) | id, ol_order_id, pos_order_id, organization_id, status (§4), pickup (lat/lng/address), drop (lat/lng/area, address revealed after pickup), cash_to_collect, distance_km, otp_hash, version |
| `delivery_assignments` | Every offer and answer | job_id, rider_id, offered_at, expires_at, outcome (accepted/rejected/timed_out/withdrawn), reason |
| `delivery_proofs` | How delivery was proven | job_id, kind (otp/photo), media, at, lat/lng |
| `delivery_exceptions` | Problems reported | job_id, rider_id, kind, note, media, resolved_by, resolution |
| `rider_cash_ledger` | Cash custody, never edited | rider_id, job_id, kind (collected/deposited/adjustment), amount, at, recorded_by |
| `rider_earnings` | What each job earned | rider_id, job_id, base, distance, adjustment, rule_version |

**Events** (outbox, versioned; Product Architecture §81 and POS PRD §10): `delivery.created`, `delivery.offered`, `delivery.assigned`, `delivery.rejected`, `delivery.timed_out`, `delivery.arrived_pickup`, `delivery.picked_up`, `delivery.arrived_drop`, `delivery.completed`, `delivery.exception`, `rider.cash_collected`, `rider.cash_deposited`.

**Link to the POS without changing POS tables:** the pilot writes POS orders with `channel = 'online'`, `placed_by = 'integration'`, `external_ref = 'onelocal:<order id>'`, plus `order_items` and `order_events`. Adding a proper `one_local` channel value is a small OS change to request from the OS team.

---

## 8. API (same One Local server, `/api/rider/*`; rider must be signed in and enrolled)

| Route | Purpose | Rules |
|---|---|---|
| `GET /rider/me` | Profile, status, cash in hand, today's summary | |
| `POST /rider/availability` | Go online/offline; send position | refused if cash over the limit (RD7) |
| `POST /rider/heartbeat` | Every 30 s while online (position, battery) | a rider silent for 60 s is treated as offline |
| `GET /rider/offers/current` | The live offer, if any, with seconds left | polled every 5 s in foreground |
| `POST /rider/offers/:id/accept` · `/reject` | Answer an offer | only before expiry; one winner per job |
| `GET /rider/jobs/current` · `/jobs/:id` | Active job | rider sees only their own jobs |
| `POST /rider/jobs/:id/step` | arrived_pickup · picked_up · arrived_drop | expected version; steps only move forward |
| `POST /rider/jobs/:id/deliver` | OTP (or photo) + cash collected | OTP checked on the server; wrong OTP 5 times → exception |
| `POST /rider/jobs/:id/exception` | Report a problem | |
| `GET /rider/earnings?range=` | Earnings and cash ledger | |
| `PUT /rider/push-token` | Register the phone for alerts | |
| `POST /rider/test-alert` | M0 proof | own device only; 5 per hour |

Rate limits, idempotency keys and error format follow the One Local backend plan. Dispatch and timers run on the server (V1 rule: offer to the nearest online rider of the restaurant; on reject or timeout, the next; if nobody accepts in 3 rounds, alert the restaurant and raise an exception).

---

## 9. Changes in the other apps

| App | Change |
|---|---|
| One Local (customer) | Food orders from the pilot restaurant go to the POS; the tracking screen shows real job states and the 4-digit delivery OTP; the rider's first name appears once assigned |
| VINII POS (restaurant) | The existing Online Orders screen shows One Local orders with an accept/reject timer (60 s ⚑ notebook); accepting starts dispatch; "Ready" is visible to the rider |
| Master / OS | The pilot restaurant gets a Latur location (address and map pin) and a "One Local" channel switch; restaurant managers can add riders |

---

## 10. Prerequisites and known issues

1. **Database changes need your approval.** One Local's tables (already written, waiting) and the new delivery tables must be applied to production. Auto-mode blocks this, so choose option A, B or C from our last conversation.
2. **Server key:** you add the Supabase secret key to `OL-ui/.env`.
3. **Dummy restaurants:** none has a Latur address; RD1 gives the pilot restaurant a test one.
4. **One Local orders are still held in memory** until step 1 is done.
5. **Accounts for push:** an Expo account and a Firebase project (Android); an Apple Developer account for iOS (RD8).
6. **Google sign-in** must be switched on in Supabase (checklist `docs/SETUP_GOOGLE_MAPS_AND_SIGN_IN.md`) for riders and customers to sign in.

---

## 11. Build sequence

| Milestone | Delivers | Done when |
|---|---|---|
| **M0 — Does it ring?** | Rider app shell (sign in, Home, Settings), push token registration, test alert, incoming job card with sound and countdown | the four checks in §5.3 pass on a real Android phone |
| **M1 — A job end to end, simulated** | Delivery tables, dispatch with timeout and re-offer, all job steps, OTP, cash record, earnings | a test job created from the server goes offer → accept → pickup → deliver with OTP; a missed offer moves to the next rider |
| **M2 — Real order from One Local** | One Local → POS order → restaurant accept → job → rider → customer tracking shows each step | one real pilot order delivered in Latur with the customer seeing every step live |
| **M3 — Pilot hardening** | Exceptions, cash deposit flow, rider limits, monitoring, iOS build | a week of pilot deliveries with no lost orders and cash ledger matching |

---

## 12. Tests
- **Alert:** foreground, background, locked, app closed, poor network, Do Not Disturb on, two riders racing to accept one offer (only one wins).
- **Job:** steps can't be skipped or reversed; wrong OTP; cancelled order before pickup; rider goes offline mid-job; app killed and reopened mid-job (resumes at the right step).
- **Money:** cash ledger entries are never edited; deposit reconciles; delivery proof alone never marks cash as remitted (POS PRD §9).
- **Privacy:** a rider sees the customer's full address only after pickup and phone only during the job; a rider can never see another rider's jobs or any prices beyond cash to collect.

## 13. Open questions for the founder
RD1–RD8 above, plus: who acts as "operations" for problems in the pilot (you, or the restaurant manager)? Should riders see their exact earnings per job from day one?

## Appendix — traceability (Product Architecture §97)
| Page | Route (app) | API | Permission | Event | Tables | QA |
|---|---|---|---|---|---|---|
| RID-001A Incoming job | `/offer/[id]` | API-RID-OFFER-ACCEPT / REJECT | PERM-RIDER-JOB | delivery.assigned / rejected / timed_out | delivery_assignments | QA-RID-ALERT-01..06 |
| RID-002 Current job | `/job/[id]` | API-RID-JOB-STEP | PERM-RIDER-JOB | delivery.arrived_pickup / picked_up / arrived_drop | delivery_jobs | QA-RID-JOB-01..05 |
| RID-005 Deliver | `/job/[id]/deliver` | API-RID-JOB-DELIVER | PERM-RIDER-JOB | delivery.completed, rider.cash_collected | delivery_proofs, rider_cash_ledger | QA-RID-DEL-01..04 |
| RID-007 Earnings | `/earnings` | API-RID-EARNINGS | PERM-RIDER-SELF | — | rider_earnings, rider_cash_ledger | QA-RID-EARN-01 |
| RID-009 Settings | `/settings` | API-RID-TEST-ALERT, API-RID-PUSH-TOKEN | PERM-RIDER-SELF | — | push_tokens | QA-RID-ALERT-01 |
