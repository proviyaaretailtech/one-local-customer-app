# Online payments (Razorpay)

The One Local app can now take real online payments through Razorpay: UPI (Google Pay, PhonePe,
Paytm, BHIM, WhatsApp, or a UPI ID / QR code), debit and credit cards, netbanking, wallets, and
EMI / Pay Later where Razorpay offers them. Cash on delivery stays available.

**Today it is switched off**, because no Razorpay keys are set. Until they are, the app behaves
exactly as before: every order is cash on delivery, and the payment screen is a sample selector
that takes no money.

---

## What the customer sees once it is on

1. The cart's bottom bar shows **PAY USING** with their last-used method, and a big **Pay ₹…**
   button. One tap pays with the method they used last time.
2. Tapping **PAY USING** opens the **Payment Options** screen: items, total and savings at the top;
   the store and delivery address; a payment-offers strip; their **Preferred Payment**; **Pay by any
   UPI App**; **Credit & Debit Cards**; and **More Payment Options** (Pay Later, Wallets,
   Netbanking, Pay on Delivery). Picking a row opens its own Pay button.
3. Paying opens **Razorpay's own secure page**, already set to the method they picked. Card
   numbers, UPI PINs and bank passwords are typed there — never into our app, and they never reach
   our server.
4. When Razorpay confirms, the order appears with "paid online" and tracking starts as usual.
5. If they cancel or the payment fails, they see: *"Payment didn't go through. No money was taken.
   Try again or choose another way to pay."* They can retry, pick another method, or switch the same
   order to pay on delivery (so they can never end up with two orders).

If the customer closes the app in the middle of paying, Razorpay tells our server directly (the
"webhook"), and the order is marked paid anyway. An unpaid attempt never shows in their order list.

---

## What you need to do

### 1. Create a Razorpay account and get TEST keys (15 minutes, no paperwork)

1. Sign up at **dashboard.razorpay.com**.
2. Switch the dashboard to **Test Mode** (toggle at the top).
3. Go to **Account & Settings → API Keys → Generate Test Key**. You get two values:
   - **Key Id** — starts with `rzp_test_`. This one is not secret; the app is allowed to see it.
   - **Key Secret** — shown once. This one is secret. Never share it in chat or email.
4. Go to **Account & Settings → Payment Capture** and make sure payments are **captured
   automatically**. (If capture is manual, money is only held, and our app waits for a capture
   that never comes.)

### 2. Put three values on the server

Set these on the server that runs the One Local API (and in `frontend/.env` for local testing):

| Setting | What goes in it |
|---|---|
| `RAZORPAY_KEY_ID` | The Key Id (`rzp_test_…`) |
| `RAZORPAY_KEY_SECRET` | The Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | A long random password you make up in step 3 |

As soon as the first two are set, online payments switch on by themselves. To turn them off again
without removing keys, set `FEATURE_ONLINE_PAYMENTS=off`.

### 3. Tell Razorpay where to send payment updates (the webhook)

In the Razorpay dashboard: **Account & Settings → Webhooks → Add New Webhook**.

- **Webhook URL:** `https://<your API address>/api/payments/webhook`
  (the same address the app uses for its API, e.g. the production backend URL).
- **Secret:** make up a long random password; put the same value in `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** tick `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.

Razorpay cannot reach a laptop on home Wi-Fi, so the webhook only works once the API runs on a
public address. Paying from the app still works without it; the webhook is the safety net.

### 4. Approve the database change

The payment details need four new columns on orders and one new small table. They are written as
`db/migrations/0025_ol_payments.sql`. **It has not been applied to any database** — it needs your
approval, and the OS repo keeps the migration ledger. It only adds things; nothing existing is
changed or removed. Until it is applied, online payments only work in local "no database" mode.

### 5. Later: go live with real money

In the Razorpay dashboard, complete **KYC / account activation** (business details, PAN, bank
account, website/app details). Razorpay reviews it (usually a few working days). Then generate
**Live** keys (`rzp_live_…`), set up the webhook again in Live Mode, and replace the three values.
Nothing in the app changes.

---

## How to test (Test Mode — no real money moves)

1. Set the three test values, restart the API, open the app, add items and go to the cart.
2. Tap **Pay ₹…** (or choose a method in **PAY USING**).
3. On Razorpay's page:
   - **UPI success:** choose UPI ID and enter `success@razorpay`.
   - **UPI failure:** enter `failure@razorpay` — you should see our "didn't go through" message.
   - **Cards:** use one of the card numbers Razorpay publishes on its "Test Card Details" page
     (razorpay.com/docs/payments/payments/test-card-details). Any future expiry date and any CVV.
   - **Netbanking / wallets:** pick any bank or wallet; Razorpay shows a Success / Failure button.
4. Check the order shows "paid online", and that it appears in the Razorpay dashboard under
   **Transactions → Payments**.
5. Refund it from the dashboard: after the webhook arrives, the order is marked refunded.

Never type a real card, UPI ID or bank login while in Test Mode.

---

## What is not done yet

- **Restaurant (VINII POS) orders** are still placed through their own path and are cash on
  delivery. When a restaurant marks a paid-online order as delivered, the POS side still records
  "cash collected" — that needs fixing before restaurant orders can be paid online.
- **Refunds from our side** (a support person pressing "Refund" in our own tools) do not call
  Razorpay yet. Refunds done in the Razorpay dashboard are recorded automatically.
- **Payment offers:** the strip on the Payment Options screen says no offers are running. Offers
  created in Razorpay show on Razorpay's page automatically; showing them in our screen is later.
- **OneCity Wallet / OneLocal Coins** appear only when those features are on, and cannot be spent
  at checkout yet.
- **Saved cards** are Razorpay's feature (the customer ticks "save card" on Razorpay's page); we do
  not store cards.
- **Phone app:** Razorpay's page opens inside the app (a built-in browser window). UPI apps open
  from there where the phone allows it; otherwise the customer can pay by UPI ID or QR. Razorpay's
  dedicated phone kit would give the smoothest UPI-app experience, but it needs a new app build
  (and a store release), so it is left for the next native release.
- Nothing has been tried against real Razorpay servers yet, because there are no keys. The server
  logic was checked end to end with Razorpay's replies simulated.

---

## For developers

- Server: `frontend/server/payments.ts` (Razorpay calls, signatures, webhook), payment state helpers
  in `frontend/server/store.ts`. Routes under `frontend/app/api/payments/`:
  `POST order`, `POST verify`, `POST webhook`, `POST cod`, `GET checkout-page`.
- App: `src/components/payment-sheet.tsx` (Payment Options), `src/components/razorpay-checkout.tsx`
  (phone, WebView) and `.web.tsx` (web, checkout.js), flow in `app/(tabs)/cart.tsx`.
- The amount charged is always the server's total, in paise. The key secret and webhook secret stay
  on the server; only the Key Id goes to the app. Payloads are never logged or stored.
