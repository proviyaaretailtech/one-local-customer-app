# Profile, support tickets and event tickets — Swiggy study → One Local plan

Agent 4 of 5 (account/profile + "tickets"). Study date 27 Sep 2026. No repo file was edited.
No personal data is recorded here. Swiggy's Scenes (events) did not render through iPhone Mirroring, so the event-ticket
section leans on District patterns seen earlier (Profile → Bookings, "Continue your booking" toast) and on common
Indian ticketing practice. Treat those parts as proposal, not observation.

"Tickets" means two things in One Local and both are covered:
- **Support tickets**: a customer's problem with an order or booking (Part B).
- **Event tickets**: Book It bookings for movies, events and activities (Part C).

---

## A. Profile ("You" tab)

### A1. What Swiggy does (observed)
- Coloured header with name, phone and email, a dashed "ADD PHOTO" circle, and a **Help** pill in the header.
- **Membership card**: "one ACTIVE · ₹X saved in N days · Explore benefits ▾". Savings are the first thing shown.
- An app-update card when a new version exists.
- **Four quick tiles**: Saved Address, Payment Modes, **My Refunds**, Swiggy Money (wallet).
- A long list of secondary rows (vouchers, account statement, favourites, partner rewards, a contact-permission toggle).
- **Past orders on the profile itself**, with tabs Food | Instamart | Dineout. Each card: store thumbnail, name, locality,
  "Delivered ✓", item summary ("1X …, & 1 more"), **separate Food rating and Delivery rating star rows**, a large
  **Reorder** button, and "Ordered: date, time • Bill Total: ₹X". Then "View More Orders". App version in the footer.

### A2. What we have today
| Area | File | State |
|---|---|---|
| Identity card | `app/(tabs)/account.tsx` | Dark card, photo or initials, name, email, edit button, sign-in call to action. Good. No phone shown. |
| Stats row | `account.tsx` | Orders / Saved / Addresses counts. Counts, not actions. |
| Coins card | `account.tsx` | "OneLocal Coins · SOON" with a teaser at a sample 1 coin per ₹10 (rule undecided, `docs/ONELOCAL_COINS_PLAN.md`). |
| Preferences | `account.tsx` | Diet, language, notification switches. Saved on tap. Good, and not something Swiggy puts on the profile. |
| Lists | `account.tsx` `GROUPS` | Orders & bookings / Account / Rewards / Help. Wallet row marked SOON. |
| Edit profile | `app/profile-edit.tsx` | Photo, name, email, phone, birthday, diet. **Saved on this device only.** |
| Addresses | `app/addresses.tsx` | Device-only list, "Deliver here". |
| Payments | `app/payments.tsx` | Preference only, no charging (correct for now). |
| Wallet | `app/wallet.tsx` | Demo wallet behind a feature flag. |
| Refer | `app/refer.tsx` | Share code, rewards not active. |
| Orders | `app/orders.tsx` | Separate screen. Card shows short id, date, **raw status text** (`out`, `packed`), item photos, total, Track, Reorder. No store name, no department, no rating. |
| Order detail | `app/order/[id].tsx` | Tracking timeline and a sample-rider notice. **No "Get help" entry point.** |
| Bookings | `app/enquiries.tsx` | Reads enquiries from **device storage only** (`src/bookings.ts`, AsyncStorage), so they vanish on reinstall and do not follow the account even though the server stores them. Back button always goes to `/book-it`, even when opened from the profile. |
| Help | `app/help.tsx` | FAQ plus a free-text form (topic chips + optional reference + message). Not order-first; no list of past requests; no status. One FAQ answer says "Profile → My Orders" but the tab is called "You". |

### A3. Proposed structure (top to bottom)
Keep our own look (dark ink identity card, lime accents). Borrow Swiggy's *order of information*, not its colours.

1. **Header strip**: back is not needed (it is a tab); right side gets a small **Help** pill (goes to the order-first Help home) and a settings icon.
2. **Identity card** (existing). Add masked phone once sign-in is by phone. Keep the camera badge on the avatar.
3. **Coins / membership card** (existing card, promoted): when Coins ship, show "N coins · ₹X saved with One Local this month" and a link to history. Until then keep the SOON teaser. One Local has no paid membership; savings-to-date is the motivating number, and it can be computed today from `ol_orders.discount`.
4. **App-update card**: only when the server says a newer build or OTA is available (ties to `apps.min_supported_runtime`, `docs/PLATFORM_FOUNDATIONS.md`). Low priority.
5. **Four quick tiles** replacing the counts row: **Addresses · Payments · Refunds · Wallet/Coins**. Refunds is the new one and reads the existing `ol_refunds` ledger. Counts can live as small numbers on the tiles.
6. **Your orders** (moved onto the profile, first 3 shown): department tabs **Shop | Food | Book It** (Swiggy: Food | Instamart | Dineout). Each card:
   - store logo + name + locality; human status ("On the way", "Delivered ✓", "Cancelled");
   - item summary "2 × Paneer tikka, & 1 more";
   - for delivered Food orders: **two separate star rows — "Food" and "Delivery"** (rating the restaurant and the rider separately keeps a bad delivery from punishing the kitchen);
   - big **Reorder** button; "Ordered: date, time • Bill total ₹X";
   - "Get help" link (goes straight to issue picker for that order);
   - "View all orders" → `app/orders.tsx`.
   The Book It tab lists bookings (Part C) and links to "My tickets".
7. **Preferences** (existing, keep).
8. **Grouped lists** (existing), trimmed: Wishlist, Refer & Earn, About, and later Vouchers, Coins history, Account statement.
9. Sign out, device notice, app version in the footer (Swiggy shows it; support staff ask for it).

### A4. Gaps to close for the profile
- Profile, addresses and payment preference are device-only (F12 in `BACKEND_REARCHITECTURE_PLAN.md`). Already planned under the `shoppers` / `ol_addresses` migration; the profile redesign should not wait for it but should not add more device-only state.
- Orders API returns no store name, department or locality. Add `store`, `department` (`shop|food|book`) and `locality` to the list response (`server/store.ts` `rowToOrder`; `organization_id` already exists for restaurant orders).
- No rating storage anywhere. Needs `ol_order_ratings` (draft in B6).
- Status labels are raw database words; add one shared map (`placed → Order placed`, `accepted → Confirmed`, `packed → Packed`, `out → On the way`, `delivered → Delivered`, `cancelled → Cancelled`).
- Reorder in `orders.tsx` re-adds items by product id; check how it behaves for restaurant orders (menu items) and for items now out of stock. It should tell the customer what could not be added.

---

## B. Support tickets

### B1. What Swiggy does (observed)
- Help home opens with **"You have N active refunds — VIEW MY REFUNDS"**.
- Then **"RECENT ORDER"**: the latest order card; tapping it starts help for that order.
- "Issues with previous orders ›" for older ones.
- "HELP WITH OTHER QUERIES": membership FAQs, general issues, partner onboarding, safety emergency.
- Help is **order-first**: pick the order, then the issue. It is not a blank form.
- Cart shows the cancellation policy text before paying.

### B2. Proposed customer flow
```
Help home
 ├─ Active refunds banner  ("1 refund in progress · ₹120")  → My refunds
 ├─ Recent order / booking card  → issue picker for that order
 ├─ "Issues with previous orders" → order picker (last 30 days, all departments)
 ├─ Open requests (if any)  → ticket detail
 └─ Other help: Coins & wallet, Account & sign-in, Payments, Store/partner onboarding, Safety (urgent), FAQ

Issue picker (depends on department and order state)
 Shop / Food, delivered:  Item missing · Wrong item · Damaged or spilled · Quality issue · Quantity short
                          · Late delivery · Rider behaviour · Charged wrongly · Other
 Shop / Food, in progress: Where is my order? · Cancel order · Change address/instructions · Other
 Book It:                 Cancel booking · Did not receive ticket · Event cancelled or changed · Entry refused · Other
 No order:                the "Other help" topics above

Detail step (only what the issue needs)
 - item-level issues: tick the affected lines and quantity (from ol_order_items)
 - quality/damage: optional photo (upload-sign, later)
 - short free text (optional for most issues)

Outcome
 A. Auto-resolved: rules allow it (small amount, inside the window, low customer refund history)
    → refund recorded instantly through ol_process_refund(), shown as "₹X refund started to <method>"; ticket saved as auto_resolved.
 B. Info answer: e.g. "Where is my order?" → shows live tracking, no ticket unless the customer taps "Still need help".
 C. Ticket opened: reference number, expected reply time, lands in "My requests" and in the Master queue.
```
Why order-first: the ticket arrives already linked to the order, the lines and the amount, so support can act in one step, and the
customer never has to type an order number. Our current free-text "Order reference" field goes away for order issues.

### B3. Ticket lifecycle and statuses
| Status | Meaning | Customer sees |
|---|---|---|
| `open` | Created, nobody has picked it up | "Received — we usually reply within 2 hours" |
| `in_progress` | Assigned to an agent | "We're looking into it" |
| `awaiting_customer` | Agent asked a question | "We need a reply from you" (badge on the profile) |
| `resolved` | Agent gave an outcome (refund, replacement, explanation) | "Resolved — was this helpful?" with Reopen for 7 days |
| `auto_resolved` | Rules resolved it instantly | "Refund started" |
| `closed` | Final: customer confirmed, or 7 days after resolved with no reply | Read-only |
| `saved_for_review` | Legacy value written by today's `createSupportRequest` | Shown as `open` |

Transitions: open → in_progress → (awaiting_customer ⇄ in_progress) → resolved → closed; resolved → open on reopen (once or twice, then a new ticket);
open/in_progress → resolved directly is fine. Every transition writes a row to the ticket's message thread (kind `status`) so the history is complete.

Refund statuses already exist in `ol_refunds`: `requested → approved → processed` or `rejected`. The customer copy for refunds:
requested = "Refund requested", approved = "Refund approved", processed = "Refund sent · reaches your account in 3–5 working days (UPI/card) or instantly (wallet)", rejected = "Refund not approved" + reason.

### B4. What the Master admin needs to see (One Latur workspace in Repo-1-, via `/api/admin/*`, D13/D14)
- **Queue**: filter by status, city, department, issue, priority, assigned agent, SLA breached. Sort by oldest waiting.
- **Ticket screen**: customer (masked phone, order count, lifetime refunds and refund rate), the order with lines and photos, rider and store,
  the thread, internal notes (never shown to the customer), and one-click actions: refund lines (calls `ol_process_refund`), give coins or a coupon,
  cancel order, reply, change status, reassign.
- **Guard rails**: refund above a threshold needs a second approver (open question in `MASTER_ADMIN_HANDSHAKE.md`); agents only see their
  `city_ids` scope; every action goes to `audit_log`.
- **Issue catalogue editor**: which issues each department offers, the auto-refund cap and window, whether a photo is required.
- **Reports**: tickets per 100 orders by store and by rider, first response time, resolution time, auto-resolve rate, refund money by reason.
- **Demand signals** already arrive in the same table (`launch:<place>` rows from `createLaunchRequest`); the queue should filter these out by default.

### B5. API contract proposal (customer)
All are signed-in only (today's `/support-requests` is anonymous, flagged F14). All creates take an `Idempotency-Key` header.
Rate limit class SLOW (5/hour, 20/day) as in the rearchitecture plan.

**GET `/api/support/home`**
```json
{ "active_refunds": { "count": 1, "amount": 120 },
  "recent": { "kind": "order", "id": "uuid", "store": "…", "department": "food", "status": "delivered", "total": 300, "created_at": "…" },
  "open_tickets": [ { "id": "uuid", "ref": "OL-T-4F2A9C", "status": "awaiting_customer", "title": "Item missing", "updated_at": "…" } ],
  "topics": [ { "code": "coins", "label": "Coins & wallet" }, { "code": "safety", "label": "Safety emergency", "urgent": true } ] }
```

**GET `/api/orders/:id/help`** — what help this order can get right now.
```json
{ "order": { "id": "uuid", "department": "food", "status": "delivered", "delivered_at": "…" },
  "items": [ { "order_item_id": "uuid", "name": "…", "qty": 2, "refundable_amount": 180 } ],
  "issues": [ { "code": "item_missing", "label": "Item missing", "needs_items": true, "needs_photo": false, "window_open": true } ],
  "existing_ticket": null }
```

**POST `/api/support-tickets`**
```json
// request
{ "order_id": "uuid", "booking_id": null, "issue_code": "item_missing",
  "items": [ { "order_item_id": "uuid", "qty": 1 } ], "message": "optional", "photos": [] }
// response 201
{ "ticket": { "id": "uuid", "ref": "OL-T-4F2A9C", "status": "auto_resolved", "issue_code": "item_missing", "created_at": "…" },
  "outcome": "auto_refunded",                       // or "ticket_opened" | "info"
  "refund": { "id": "uuid", "amount": 90, "status": "processed", "method": "original" },
  "eta_text": null }
```
Errors: 400 bad issue for this order; 409 a ticket for this order and issue is already open (returns it); 410 help window closed (offers "Other").

**GET `/api/support-tickets`** → `[{ id, ref, status, title, order_id, booking_id, updated_at, unread }]` (mine, newest first).
**GET `/api/support-tickets/:id`** → ticket + `messages: [{ id, author: "customer"|"agent"|"system", kind: "message"|"status", body, created_at }]` (internal notes filtered out).
**POST `/api/support-tickets/:id/messages`** `{ "body": "…" }` → the new message; moves `awaiting_customer → in_progress`.
**POST `/api/support-tickets/:id/actions`** `{ "action": "reopen" | "confirm_resolved", "rating": 1-5?, "comment": "?" }`.
**GET `/api/refunds`** → `[{ id, order_id, amount, status, method, reason, created_at, processed_at }]` (reads existing `ol_refunds`).
**POST `/api/support-requests`** stays for old app versions (D10) and writes a ticket with `issue_code = 'other'`.

Admin (Master, D14): `GET /api/admin/support-tickets?status=&city=&department=&issue=&assignee=&breached=`,
`GET /api/admin/support-tickets/:id`, `PATCH /api/admin/support-tickets/:id { status, priority, assigned_to }`,
`POST /api/admin/support-tickets/:id/messages { body, internal }`,
`POST /api/admin/support-tickets/:id/refund { order_item_id?, amount, reason, method }` → `ol_process_refund` + links `support_request_id`,
`GET/PUT /api/admin/support-issue-types`.

Realtime (D5, listen-only): the app may subscribe to a narrow channel for "your ticket changed" so the badge updates without polling.

### B6. Migration draft — support, ratings (DRAFT, NOT APPLIED)
> DRAFT for discussion only. Not applied, not added to the repo. Per D7 the number is assigned by the Repo-1- migration
> ledger (0025 and 0026 are already spoken for), so it is written as `00NN_ol_support_tickets.sql`.
> Follows the 0021/0024 rules: `ol_` prefix, a COMMENT on every table and column (abbreviated below for length;
> the real file must comment every column), RLS on with no policies, service role only, additive only — no column
> type changes, no drops, existing constraints untouched.

```sql
-- 00NN_ol_support_tickets.sql  (DRAFT — NOT APPLIED)
-- Turns ol_support_requests into an order-first ticket: linked order/booking, issue code, lifecycle,
-- a message thread, a Master-editable issue catalogue, refund linkage, and order ratings.
begin;

-- 1. Issue catalogue (Master edits this; the app reads it)
create table public.ol_support_issue_types (
  code             text primary key check (code ~ '^[a-z_]{3,40}$'),
  department       text not null check (department in ('shop','food','book','general')),
  label            text not null check (char_length(label) between 3 and 60),
  applies_when     text not null default 'any' check (applies_when in ('any','in_progress','delivered','no_order')),
  needs_items      boolean not null default false,
  needs_photo      boolean not null default false,
  auto_resolution  text not null default 'none' check (auto_resolution in ('none','refund_items','info_tracking','cancel_order','cancel_booking')),
  auto_refund_cap  numeric(10,2) not null default 0 check (auto_refund_cap >= 0),
  window_hours     int not null default 48 check (window_hours between 0 and 720),
  priority         text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  sort_order       int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);
comment on table public.ol_support_issue_types is 'Issues a customer can pick for an order or booking, per department. Edited from the Master.';
comment on column public.ol_support_issue_types.auto_refund_cap is 'Largest refund the system may give without an agent, in INR. 0 = never auto-refund.';
comment on column public.ol_support_issue_types.window_hours    is 'How long after delivery (or the show) this issue can be raised.';
-- … comments for every other column …

-- 2. Extend the existing request table (all new columns nullable or defaulted; old rows stay valid)
alter table public.ol_support_requests
  add column if not exists ref                text,
  add column if not exists order_id           uuid references public.ol_orders(id) on delete set null,
  add column if not exists booking_id         uuid,   -- FK added in the bookings migration (Part C) once ol_bookings exists
  add column if not exists issue_code         text references public.ol_support_issue_types(code) on delete set null,
  add column if not exists department         text check (department in ('shop','food','book','general')),
  add column if not exists affected_items     jsonb not null default '[]'::jsonb,
  add column if not exists photos             jsonb not null default '[]'::jsonb,
  add column if not exists priority           text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists assigned_to        uuid references auth.users(id) on delete set null,
  add column if not exists channel            text not null default 'app' check (channel in ('app','whatsapp','phone','email','admin')),
  add column if not exists city_id            text references public.ol_service_areas(city_id),
  add column if not exists resolution_code    text check (resolution_code in ('refunded','replaced','coins_credited','coupon_given','explained','no_action','duplicate')),
  add column if not exists resolution_note    text check (char_length(resolution_note) <= 1000),
  add column if not exists first_response_at  timestamptz,
  add column if not exists sla_due_at         timestamptz,
  add column if not exists customer_rating    int check (customer_rating between 1 and 5),
  add column if not exists reopen_count       int not null default 0 check (reopen_count between 0 and 5),
  add column if not exists idempotency_key    text,
  add column if not exists updated_at         timestamptz not null default now();

-- status had no check constraint in 0021. Add one that includes the legacy value, NOT VALID so no old row is rejected,
-- then VALIDATE (safe: the only value ever written is 'saved_for_review').
alter table public.ol_support_requests add constraint ol_support_requests_status_check
  check (status in ('saved_for_review','open','in_progress','awaiting_customer','resolved','auto_resolved','closed')) not valid;
alter table public.ol_support_requests validate constraint ol_support_requests_status_check;

-- topic keeps its 0021 check ('order','payment','profile','other'); department + issue_code carry the new detail.
-- message keeps its 10–2000 check; for pick-an-issue tickets the server writes a readable summary
-- ("Item missing: 1 of 2 lines") so the constraint is never loosened.

comment on column public.ol_support_requests.ref            is 'Short human reference shown to the customer, e.g. OL-T-4F2A9C.';
comment on column public.ol_support_requests.order_id       is 'Order the issue is about, if any.';
comment on column public.ol_support_requests.booking_id     is 'Book It booking the issue is about, if any.';
comment on column public.ol_support_requests.issue_code     is 'Issue picked from ol_support_issue_types.';
comment on column public.ol_support_requests.affected_items is 'Array of {order_item_id, qty} the customer marked.';
comment on column public.ol_support_requests.assigned_to    is 'Agent handling it.';
comment on column public.ol_support_requests.sla_due_at     is 'When a first reply is due; breaches show red in the Master queue.';
-- … comments for every other new column …

create unique index if not exists ol_support_requests_ref on public.ol_support_requests (ref) where ref is not null;
create unique index if not exists ol_support_requests_idem on public.ol_support_requests (customer_hash, idempotency_key) where idempotency_key is not null;
create index if not exists ol_support_requests_queue on public.ol_support_requests (city_id, status, sla_due_at);
create index if not exists ol_support_requests_order on public.ol_support_requests (order_id) where order_id is not null;
create index if not exists ol_support_requests_customer on public.ol_support_requests (customer_hash, created_at desc);

-- 3. Thread: messages, status changes and internal notes in one ordered list
create table public.ol_support_messages (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.ol_support_requests(id) on delete cascade,
  author_kind text not null check (author_kind in ('customer','agent','system')),
  author_id   uuid references auth.users(id) on delete set null,
  kind        text not null default 'message' check (kind in ('message','status','note')),
  body        text not null check (char_length(body) between 1 and 2000),
  from_status text, to_status text,
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table  public.ol_support_messages is 'Conversation and history of a support ticket. kind=note is internal and never sent to the customer.';
-- … comments for every column …
create index ol_support_messages_request on public.ol_support_messages (request_id, created_at);

-- 4. Refunds know which ticket caused them
alter table public.ol_refunds add column if not exists support_request_id uuid references public.ol_support_requests(id) on delete set null;
comment on column public.ol_refunds.support_request_id is 'Ticket that led to this refund, if any.';
create index if not exists ol_refunds_support on public.ol_refunds (support_request_id) where support_request_id is not null;

-- 5. Order ratings: food/items and delivery rated separately
create table public.ol_order_ratings (
  order_id        uuid primary key references public.ol_orders(id) on delete cascade,
  customer_hash   text not null,
  user_id         uuid references auth.users(id) on delete set null,
  items_rating    int check (items_rating between 1 and 5),
  delivery_rating int check (delivery_rating between 1 and 5),
  tags            text[] not null default '{}',
  comment         text check (char_length(comment) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (items_rating is not null or delivery_rating is not null)
);
comment on table public.ol_order_ratings is 'Customer rating of an order: the store/kitchen and the delivery are scored separately.';
-- … comments for every column …

-- 6. Same access rules as 0021/0024
do $$
declare t text;
begin
  foreach t in array array['ol_support_issue_types','ol_support_messages','ol_order_ratings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- 7. Seed issues (sample; the Master owns them afterwards)
insert into public.ol_support_issue_types (code, department, label, applies_when, needs_items, auto_resolution, auto_refund_cap, sort_order) values
  ('where_is_order','food','Where is my order?','in_progress',false,'info_tracking',0,10),
  ('item_missing','food','Item missing','delivered',true,'refund_items',200,20),
  ('wrong_item','food','Wrong item received','delivered',true,'refund_items',200,30),
  ('damaged','shop','Damaged or spilled','delivered',true,'none',0,40),
  ('cancel_booking','book','Cancel my booking','any',false,'cancel_booking',0,10),
  ('ticket_not_received','book','I did not get my ticket','any',false,'none',0,20),
  ('other','general','Something else','any',false,'none',0,99)
on conflict (code) do nothing;

commit;
```
Server work that goes with it (`server/store.ts`): a `createSupportTicket` that requires a signed-in caller, checks the
order belongs to the caller (same `customer_hash` match `getOrder` already does), checks the window and the issue, and, for
`refund_items` under the cap, calls `ol_process_refund` and then links the ticket — ideally inside one Postgres function
(`ol_open_support_ticket`) so a ticket and its auto-refund are never half-written, the same pattern as `ol_partner_act`.

---

## C. Event tickets (Book It)

### C1. What exists
- `ol_events` has `kind` (movies/events/activities), a single `price`, and `slots text[]` (show times with no date, no capacity).
- `app/booking/[id].tsx` saves an **enquiry** (date, slot, guests 1–8, name, phone) to `ol_booking_enquiries` with
  status `demo_enquiry_saved`. No payment, no seat, no ticket, no QR. It asks for name and phone even when signed in.
- `app/enquiries.tsx` ("My Bookings" on the profile) lists enquiries from **device storage**, not the server.
- Coins plan Phase 2/3 wants coins spendable on movie tickets, which needs a real booking record first.

### C2. Patterns to borrow (District / Scenes; Scenes itself not observed)
- **Profile → Bookings** as its own list, split **Upcoming | Past**.
- **"Continue your booking" toast** when the customer leaves mid-flow: a time-limited seat/slot hold with a countdown.
- A **ticket screen** that is an entry pass: event poster, name, date/time, venue with map link, ticket count and type,
  seat or zone, a large QR, booking reference, "show this at the entrance", brightness raised while open.
- Cancellation rules shown *before* paying, and on the ticket ("Cancellable until 2 hours before the show · 75% refund").
- Post-event: "How was it?" rating, and the ticket moves to Past.

### C3. Data model draft (DRAFT, NOT APPLIED — would follow B6 in the ledger)
```sql
-- 00NN_ol_bookings.sql  (DRAFT — NOT APPLIED). Same rules as 0021/0024; every column commented in the real file.
begin;

-- A dated, capacity-limited occurrence of an event. Replaces reliance on ol_events.slots (which stays for old app versions).
create table public.ol_event_shows (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null references public.ol_events(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  venue         text,
  capacity      int not null check (capacity between 1 and 100000),
  sold          int not null default 0 check (sold >= 0),
  held          int not null default 0 check (held >= 0),
  status        text not null default 'on_sale' check (status in ('scheduled','on_sale','sold_out','cancelled','completed')),
  cancel_policy jsonb not null default '{"until_hours":2,"refund_pct":75}'::jsonb,
  city_id       text not null default 'latur' references public.ol_service_areas(city_id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (sold + held <= capacity)
);

-- Price tiers per show (General, Premium, Early bird, Kids). Seat maps are out of scope for v1: zones, not seats.
create table public.ol_event_ticket_types (
  id        uuid primary key default gen_random_uuid(),
  show_id   uuid not null references public.ol_event_shows(id) on delete cascade,
  name      text not null check (char_length(name) between 2 and 40),
  price     numeric(10,2) not null check (price >= 0),
  capacity  int check (capacity > 0),
  max_per_booking int not null default 8 check (max_per_booking between 1 and 20),
  sort_order int not null default 0
);

-- The booking: one checkout, one payment, one reference.
create table public.ol_bookings (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,                 -- e.g. OL-B-7K3M2Q, shown on the ticket
  customer_hash   text not null,
  user_id         uuid references auth.users(id) on delete set null,
  show_id         uuid not null references public.ol_event_shows(id),
  event_id        text not null references public.ol_events(id),
  enquiry_id      uuid references public.ol_booking_enquiries(id) on delete set null,  -- if it started as an enquiry
  status          text not null default 'held' check (status in
                    ('held','pending_payment','confirmed','cancelled','refunded','attended','expired','failed')),
  quantity        int not null check (quantity between 1 and 20),
  subtotal        numeric(10,2) not null check (subtotal >= 0),
  fees            numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  coins_used      int not null default 0 check (coins_used >= 0),
  total           numeric(10,2) not null check (total >= 0),
  payment_method  text check (payment_method in ('upi','card','netbanking','wallet','coins','venue')),
  payment_status  text not null default 'not_charged' check (payment_status in ('not_charged','pending','paid','failed','refunded','partially_refunded')),
  hold_expires_at timestamptz,                           -- drives "Continue your booking"
  cancel_policy   jsonb not null,                        -- snapshot at purchase time
  cancelled_at    timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancel_reason text,
  idempotency_key text,
  city_id         text not null default 'latur' references public.ol_service_areas(city_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index ol_bookings_idem on public.ol_bookings (customer_hash, idempotency_key) where idempotency_key is not null;
create index ol_bookings_customer on public.ol_bookings (customer_hash, created_at desc);
create index ol_bookings_show on public.ol_bookings (show_id, status);

-- One row per admission = one QR. Lets a group split up at the gate and lets one ticket be cancelled alone.
create table public.ol_booking_tickets (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.ol_bookings(id) on delete cascade,
  ticket_type_id uuid references public.ol_event_ticket_types(id) on delete set null,
  type_name      text not null,                       -- snapshot
  price          numeric(10,2) not null,
  zone_or_seat   text,
  qr_token_hash  text not null unique,                -- sha256 of the secret in the QR; the secret itself is never stored
  status         text not null default 'valid' check (status in ('valid','used','void','refunded')),
  checked_in_at  timestamptz,
  checked_in_by  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Link the pieces built earlier
alter table public.ol_support_requests add constraint ol_support_requests_booking_fk
  foreign key (booking_id) references public.ol_bookings(id) on delete set null not valid;
alter table public.ol_refunds add column if not exists booking_id uuid references public.ol_bookings(id) on delete set null;
-- ol_refunds.order_id is NOT NULL today; booking refunds need it nullable or a separate path. Open question (see end).

-- RLS on, service role only, as 0021/0024.
commit;
```
Holding and confirming must be atomic Postgres functions (`ol_hold_booking`, `ol_confirm_booking`, `ol_cancel_booking`) that
lock the show row, move counts between `held` and `sold`, and never oversell — same "one call, one transaction" rule as
`ol_process_refund`. A scheduled job expires holds past `hold_expires_at` and releases their seats.

### C4. Booking API draft
- `GET /api/events/:id/shows?from=&to=` → shows with ticket types, seats left, cancel policy.
- `POST /api/bookings` (Idempotency-Key) `{ show_id, tickets: [{ ticket_type_id, qty }] }` → `{ booking: { id, ref, status: "held", hold_expires_at, total } }`.
- `POST /api/bookings/:id/confirm` `{ payment_method, coins? }` → `{ booking: { status: "confirmed" }, tickets: [...] }` (payments Phase 3; until then `venue` = pay at venue, or keep enquiries).
- `GET /api/bookings?scope=upcoming|past` → list for "My tickets".
- `GET /api/bookings/active-hold` → the one unfinished hold, for the "Continue your booking" toast.
- `GET /api/bookings/:id` → booking + tickets, each with `qr_payload` (only returned to the owner, over the authenticated call).
- `POST /api/bookings/:id/cancel` `{ ticket_ids?: [], reason }` → refund amount by the snapshotted policy, writes `ol_refunds`.
- Venue/partner: `POST /api/partner/checkin { qr_payload }` → `{ ok, ticket: { type_name, zone_or_seat }, already_used_at? }`.
- Keep `POST /api/booking-enquiries` for old versions (D10); add `GET /api/me/booking-enquiries` so enquiries stop living only on the device.

### C5. "My tickets" screen (replaces `app/enquiries.tsx` as the profile's Bookings entry)
- Title "My tickets". Tabs **Upcoming | Past**. Upcoming sorted by show time, soonest first; a "Today" chip on same-day tickets.
- Card: poster thumbnail, event name, date · time, venue, "2 × General", status pill (Confirmed / Cancelled / Refund sent / Enquiry).
- Tap → **Entry pass**.
- Enquiries (while real booking is not live) show in the same list with an "Enquiry — not a ticket" pill, so there is one place to look.
- Empty state: "Your next good time starts here" + Explore Book It (existing copy).
- Back goes to where the customer came from (fix the hard-coded `/book-it`).

### C6. Entry pass (new `app/ticket/[id].tsx`)
- Top: poster, event name, date, time, venue, "Get directions".
- **QR block**: one QR per admission, swipe between them ("Ticket 1 of 2"); ticket type and zone under each; booking reference in text
  for manual lookup; screen brightness raised while open; works offline once loaded (cache the payload on the device).
- QR content: a signed payload (`ticket id + secret`, signed by the server key) so a venue phone can verify it offline and mark
  it used when back online. The database stores only the hash of the secret.
- Status overlays: "Used at 7:42 pm", "Cancelled", "Refunded" — a used or cancelled pass never shows a scannable QR.
- Below: cancellation policy and a **Cancel tickets** button while allowed (shows the refund amount before confirming);
  "Get help with this booking" (goes to the issue picker with `booking_id`); add to calendar; share (sends event details, never the QR).
- Later: Apple Wallet / Google Wallet pass.

---

## D. Top 10 changes, ranked (S = a day or two, M = about a week, L = multiple weeks)

| # | Change | Size | Files / pieces |
|---|---|---|---|
| 1 | **Order-first Help home**: active-refunds banner, recent order card, "issues with previous orders", other topics; "Get help" button on the order detail screen | M | `app/help.tsx`, `app/order/[id].tsx`, `GET /api/support/home`, `GET /api/orders/:id/help` |
| 2 | **Ticket migration** (B6): issue catalogue, ticket columns, message thread, refund link, ratings — proposed to the Repo-1- ledger | M | new migration (Repo-1-), `server/store.ts` |
| 3 | **Issue picker + ticket creation with auto-refund under a cap**, signed-in only, idempotent; old `/support-requests` kept as a shim | M | `POST /api/support-tickets`, `ol_open_support_ticket()` |
| 4 | **"My requests" list and ticket detail** with statuses, thread and reopen | M | new `app/support/index.tsx`, `app/support/[id].tsx` |
| 5 | **My Refunds**: read the existing `ol_refunds` ledger; quick tile on the profile | S | `GET /api/refunds`, new `app/refunds.tsx` |
| 6 | **Profile quick tiles** (Addresses, Payments, Refunds, Wallet/Coins) replacing the counts row; Help pill in the header; savings line on the Coins card | S | `app/(tabs)/account.tsx` |
| 7 | **Past orders on the profile** with Shop / Food / Book It tabs, store name, human status labels, Reorder that reports unavailable items | M | `account.tsx`, `app/orders.tsx`, `rowToOrder` in `server/store.ts` |
| 8 | **Separate Food and Delivery ratings** on delivered orders | S–M | `ol_order_ratings`, `POST /api/orders/:id/rating`, order card + order detail |
| 9 | **Bookings follow the account**: `GET /api/me/booking-enquiries`, fix back navigation, rename to "My tickets", stop asking signed-in users for name/phone | S | `app/enquiries.tsx`, `src/bookings.ts`, `app/booking/[id].tsx` |
| 10 | **Real event bookings**: shows, ticket types, holds with "Continue your booking", entry pass with QR, cancel by policy, venue check-in; Master support queue alongside | L | C3–C6, `/api/admin/support-tickets*` in Repo-1- console |

## E. Open questions for the founder
1. Auto-refund cap per issue (suggest ₹200 for Food "item missing / wrong item", none for Shop until photos exist) and whether the second-approver rule applies above it.
2. Refunds for cancelled bookings: back to the payment method, or to wallet/coins by default? `ol_refunds.order_id` is required today, so booking refunds need either that column relaxed or a separate path.
3. Book It payments: pay at venue first (booking without online payment) or wait for the payment gateway (Phase 3)?
4. Default cancellation policy for events (suggested: until 2 hours before, 75% back).
5. Support hours and the reply-time promise to show customers ("usually within 2 hours, 9 am–10 pm").
6. Should a safety emergency topic dial a phone number directly (needs `support.phone` from app config)?
7. Separate rider rating: do riders see their scores, and does a low delivery rating ever affect the store?
