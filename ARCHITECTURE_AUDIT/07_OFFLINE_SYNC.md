# 07 — OFFLINE BEHAVIOUR and SYNC (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**.

## 0. Verdict

**This application does not support offline operation.** Searches of `frontend/`, `partner/`, `frontend/server/` for `sqlite`, `expo-sqlite`, `realm`, `watermelon`, `outbox`, queue/replay of mutations found no local database, no mutation queue, no sync engine, no last-sync timestamp, no conflict resolution. Not invented below.

| Item asked for | Answer |
|---|---|
| Local database | **None.** Only key/value storage: `@react-native-async-storage/async-storage` (and `frontend/src/utils/storage/index.ts` also wraps `expo-secure-store` (Keychain) for native "secure" values; which screens call it was not traced — **UNKNOWN**) |
| SQLite tables | None |
| Local IDs | Device customer key (random, below); cart line ids are catalogue ids; saved address ids (`Address.id`) are generated on the phone. Orders get their id on the **server** (`crypto.randomUUID()` inside `createCheckout`) — no client-generated order id |
| Server IDs | Same as above |
| Sync mechanism | None. Reads are on-demand REST + React Query caching (`frontend/src/query-client.ts` is a default `QueryClient`; catalogue/feature queries set `staleTime` 60 s; `partner/src/query-client.ts` sets `retry 1`, `staleTime` 5 s) |
| Outbox | None on the phones. (A server-side `delivery_events` outbox exists for dispatch — not an offline mechanism) |
| Retry | Customer: manual retry buttons; cart screen re-sends the same `Idempotency-Key` for the same basket (`checkoutKey` ref) so a retry/double tap returns the same checkout. After sign-in the cart "carries on paying by itself" (in-memory `payAfterSignIn`). Consents recorded while signed out are kept on the phone and re-sent after sign-in (`frontend/src/privacy.ts`). Partner/rider: polling re-fetches |
| Idempotency | Server-side only: `Idempotency-Key` → unique `(customer_hash, idempotency_key)` on `ol_checkouts` (or `ol_orders` pre-0026); dispatch `delivery_jobs.idempotency_key = 'onelocal:<ol_order_id>:delivery'` and `ol_order_id` UNIQUE; Razorpay events deduped on `ol_payment_events.event_id`; refunds on `ol_refunds.reference` unique; `ol_partner_act` uses an optimistic version check (`orders.updated_at`) → `OL_STALE` |
| Conflict resolution | Optimistic concurrency only for partner actions (`version` = `orders.updated_at`; mismatch → 409 "already changed on another phone"); dispatch uses `delivery_jobs.version` and partial unique indexes (first accept wins) |
| Last-sync timestamp | None |
| Queued mutations | None |
| Duplicate prevention | See Idempotency; plus first-wins constraints on offers (`delivery_one_live_offer_per_job/rider`, `delivery_one_accepted_per_job`) |
| Offline UX | `frontend/src/components/error-boundary.tsx` and per-screen error text with "Try again"; the cart is persisted locally so it survives being offline |

## 1. What is persisted on the phone (AsyncStorage keys found)

| Key | File | Content | Notes |
|---|---|---|---|
| `onecity.customer-key.v1` | `frontend/src/api.ts` | random 48-hex device key sent as `x-customer-key` | removed by "Clear this phone"; the next request makes a new one |
| `onelatur.cart.v2` / `onelatur.cart.v1` | `frontend/src/cart.tsx` | `{food:[...], shopping:[...], kind}` (v1 = single list, migrated) | the **only** cart — no server cart |
| `onecity.customer.v1` | `frontend/src/customer.tsx` | profile (name, email, phone, avatar, photo data URI, birthday, diet, language, notification prefs), **saved addresses**, last payment method/UPI app, referral code | the address book exists only here |
| `onecity.saved-products.v1` | `customer.tsx` | wishlist product ids | |
| `onecity.privacy.v1` | `frontend/src/privacy.ts` | consent choices + notice version (re-sent to server after sign-in) | |
| `onelatur.booking-enquiries` | `frontend/src/bookings.ts` | copies of submitted Book It enquiries | local list of server-saved rows |
| `onelatur.followed.v1` | `frontend/src/followed.ts` | followed store ids | |
| `onecity.recent-places.v1` | `frontend/src/places.ts` | last 5 searched places | |
| `onecity.location-asked.v1` | `app-shell.tsx` | flag | |
| `one-latur-location` | `frontend/app/addresses.tsx` | chosen delivery location text | |
| `onecity-demo-wallet` | `frontend/app/wallet.tsx` | demo wallet entries | not connected to any server balance |
| `onecity-ai-session` | `frontend/app/assistant.tsx` | AI chat session id | assistant API is switched off |
| `reel-like-<id>` | `reel-card.tsx` | like flag | |
| launch-request flag `LAUNCH_KEY(place.id)` | `explore-town.tsx` | "I asked for this town" | |
| Supabase session | `frontend/src/lib/supabase.ts`, `partner/src/lib/supabase.ts` | auth session persisted in AsyncStorage (`persistSession`, PKCE) on native; browser storage on web | |
| `partner-alert-seen` | `partner/src/use-alert.ts` | declared constant; the seen set is an **in-memory** `Set` (not persisted) | |

`frontend/src/privacy.ts` lists every key the app writes (for the DPDP "what is on this phone" export and "Clear this phone").

## 2. Server-side "no database" mode (not offline sync)

When `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent, the server answers from memory (`store.ts`, `privacy.ts`, `marketplace.ts`) and `frontend/server/data/catalog.json`. This is a **development fallback** for UI work (`expo start` with no `.env`); data is lost on restart.

## 3. Offline-relevant gaps (facts)

- A customer who loses connectivity mid-payment: Razorpay's webhook is the source of truth; the app re-checks `GET /api/checkouts/:id` after the WebView closes (`cart.tsx onPaymentResult`).
- The Partner app relies on 5 s polling and push; with no connection it shows nothing new. Orders time out server-side after the accept window (default 60 s) regardless.
- The Rider app is not in this repo; its offline behaviour is **UNKNOWN**.
