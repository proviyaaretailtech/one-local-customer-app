# OneLocal Coins — what we need to build it

**Status:** planning note for the 2026-09-25 session. Nothing is live yet; the profile shows a
"coming soon" card with a teaser ("your orders so far would have earned about N coins", at a sample
rate of 1 coin per ₹10).

**The idea:** customers earn coins on every successful order and spend them on something worth more
than a discount — first of all movie nights and events through Book It, then treats from Latur stores.

---

## 1. Decisions only the founder can make (answer these first)

| # | Question | Suggested default |
|---|---|---|
| C1 | Earn rate | 1 coin per ₹10 of item value (not fees or GST), rounded down |
| C2 | What a coin is worth when spent | 1 coin = ₹1 at checkout; better value (e.g. 1 coin = ₹1.25) on movie tickets to steer redemption there |
| C3 | Who funds a coin — platform, store, or split? | Platform-funded to start; store-funded "bonus coins" later |
| C4 | When coins become spendable | After the order is **delivered** plus the return window (e.g. 24 h), so cancellations and refunds can't be gamed |
| C5 | Expiry | 180 days from earning, oldest spent first |
| C6 | Cap per order when spending | Up to 20% of the bill |
| C7 | Can coins ever become cash or be transferred? | **No.** Keeping them non-cash, non-transferable and platform-issued keeps them a loyalty programme rather than a prepaid payment instrument (RBI PPI rules). Take advice before changing this |
| C8 | Sign-in required? | Yes — coins attach to an account, never to a device key |
| C9 | Launch bonus | e.g. 50 coins on first delivered order |

## 2. Systems needed

### Ledger (the heart of it)
- New table `ol_coin_ledger` — append-only, never edited: `id, user_id, kind (earn | spend | expire | reverse | adjust | bonus), coins (signed integer), order_id?, refund_id?, booking_id?, reason, available_at, expires_at, created_by, created_at`.
- Balance = sum of rows where `available_at <= now()` and not expired. A view `ol_coin_balances` for fast reads.
- Same rules as the rest of the schema: RLS on, server-only access, idempotency key per event so a retried webhook can't pay twice, and a migration in the OS convention (`db/migrations/0025_…`).

### Earning engine
- Triggered when an order moves to **delivered** (not when it's placed). Hooks into the existing order status flow (`ol_orders.status`, and `ol_partner_act('delivered')` for restaurant orders).
- Writes an `earn` row with `available_at = delivered_at + return window` and `expires_at` per C5.
- Category/store multipliers and campaigns ("double coins this weekend") live in a small rules table, not in code.

### Reversal on cancel/refund
- `ol_process_refund` (migration 0024) writes a matching `reverse` row proportional to the refunded amount. If the customer already spent those coins, the balance can go negative and is recovered from future earnings — never by clawing back money.

### Spending at checkout
- `server/pricing.ts` gains a "coins" line: the customer chooses how many to apply, the quote caps it (C6) and shows the new total.
- `createOrder` writes a `spend` row in the same transaction as the order (an atomic Postgres function, like `ol_create_restaurant_order`), so an order and its coin spend can never be half-applied.

### Redemption catalogue (movie nights, events, treats)
- Book It today only records **enquiries**. Spending coins on a movie needs real bookings: seat or slot inventory, a booking record, confirmation, a partner (cinema/event organiser) settlement, and cancellation rules. That is the biggest piece of work here.
- Phase 1: coins as a discount on regular orders (cheap to build, uses the ledger + pricing).
- Phase 2: "reward vouchers" — fixed-price items (e.g. "2 movie tickets for 400 coins") fulfilled manually by the team with a partner cinema while the booking system is built.
- Phase 3: live seat booking with coins as a payment line.

### Expiry job
- A scheduled job (Supabase cron / edge function) writes `expire` rows nightly and sends a "coins expiring in 7 days" reminder.

### Customer-facing screens
- Balance on the profile and at checkout; a history screen (earned, spent, expiring); "how to earn" explainer; a coins line on the order-success screen ("+42 coins on the way").

### Notifications
- Push/email for: coins earned, coins available, coins expiring. Uses the notification preferences already on the profile.

### Admin & support tools
- Look up a customer's ledger, add a manual `adjust` (with reason, audited, two-person rule above a threshold), run a campaign.

### Abuse controls
- Earn only on delivered, paid orders; one account per phone; velocity limits (orders per day earning coins); no coins on orders fully paid with coins; flag self-referral loops.

### Accounting
- Unspent coins are a liability. The finance view needs: coins issued, spent, expired, outstanding, by month — straight from the ledger.

## 3. Suggested order of work
1. Founder answers C1–C9.
2. Ledger migration + earn on delivered + reverse on refund (server only, no UI yet).
3. Balance + history on the profile; "+N coins" on order success.
4. Spend at checkout (pricing + atomic order function).
5. Expiry job + reminders.
6. Reward vouchers for movie nights (manual fulfilment), then live booking.
