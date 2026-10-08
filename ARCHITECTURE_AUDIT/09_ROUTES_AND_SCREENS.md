# 09 — ROUTES AND SCREENS (One Local / OL-ui)

Tags: no tag = stated in the repo; **INFERRED**; **UNKNOWN**.
Format: SCREEN/ROUTE → USER ACTION → API/RPC → DATABASE TABLES → SIDE EFFECTS.
Screens are Expo Router files. Tab bar (`frontend/app/(tabs)/_layout.tsx`): `index, categories, discover, food, book-it` visible; `reels, cart, account, grocery, pharmacy, beauty, shops, care` hidden tabs (reachable by link). "Catalogue" = `GET /api/catalog` (+ `/products`, `/stores`) → `ol_*` catalogue tables and item master (see 04). Bundle names: customer app display name "OneCity" (`app.config.ts`), repo/branding also "One Latur", "One Local".

## 1. Customer app (`frontend/app/`)

| SCREEN / ROUTE | USER ACTION | API / RPC | DB TABLES | SIDE EFFECTS |
|---|---|---|---|---|
| `(tabs)/index` (Home) | open | `GET /api/stores` (`api<Store[]>('/stores')`), `GET /api/catalog` via `useCatalog` | `ol_stores, ol_products, ol_categories, ol_brands, ol_banners, ol_coupons, …` (cached) | – |
| `(tabs)/categories`, `category/[id]`, `collection/[id]`, `brand/[id]` | browse | `GET /api/catalog` | catalogue | – |
| `(tabs)/food`, `grocery`, `shops`, `pharmacy`, `care`, `beauty` (department screens) | browse a department | `GET /api/catalog` (department filter client-side) | catalogue | – |
| `store/[id]` | open a store | `GET /api/stores/:id`, `/stores/:id/products`, `/categories` | `ol_stores` + products | – |
| `product/[id]` | open product; add to cart | `GET /api/products/:id/story` | catalogue | cart (AsyncStorage `onelatur.cart.v2`) |
| `search`, `smart-search` | text search; "discover" places | `GET /api/products?q=`; `GET /api/nearby` | catalogue; Google Places or Overpass | photo/voice AI search is switched off (503) |
| `(tabs)/discover`, `(tabs)/reels` | browse chips and reels | `GET /api/reels`, `/catalog`, `/discover` | `ol_reels, ol_discover_chips, ol_products` | like flag stored locally |
| `(tabs)/book-it`, `booking/[id]` | choose event, date, slot, guests, name, phone; submit | `GET /api/events`; `POST /api/booking-enquiries` | `ol_events`, INSERT `ol_booking_enquiries` | copy saved to AsyncStorage `onelatur.booking-enquiries`; no merchant notification |
| `enquiries` | view past enquiries | none (reads local copy) | – | – |
| `location`, `india`, `address-map`, `address-form`, `addresses` | choose delivery town/address | `GET /api/coverage`, `/india/*`, `/places/*`, `/geocode/reverse`, `/serviceability`; `POST /api/launch-requests` (discover-only town) | `ol_service_areas` (coverage); INSERT `ol_support_requests` (`launch:<id>`) | saved addresses live in AsyncStorage `onecity.customer.v1`; chosen location in `one-latur-location` |
| `(tabs)/cart` | open | `POST /api/cart/quote` (re-quoted on change); `POST /api/coupons/apply`; GET `/api/features` | reads catalogue/coupons | – |
| `(tabs)/cart` | **Pay on delivery** | `POST /api/checkouts` (`Idempotency-Key`) | INSERT `ol_checkouts`, `ol_orders`, `ol_order_items` | `dispatchOrders` → `delivery_jobs`, `delivery_events`, rider push; navigates to `order/[id]` |
| `(tabs)/cart` | **Pay online** (when `online_payments`) | `POST /api/payments/order` → Razorpay Checkout in WebView (`/api/payments/checkout-page`) → `POST /api/payments/verify`; fallback `GET /api/checkouts/:id`; `POST /api/payments/cod` to switch | `ol_checkouts` (INSERT, UPDATE), `ol_orders` (INSERT + trigger updates) | Razorpay order; on paid: `dispatchOrders` |
| `sign-in` | email+password / sign-up / phone OTP / Google | Supabase Auth direct | `auth.users` | consent recorded (`privacy.ts recordConsent`), then `POST /api/privacy/consents` after sign-in |
| `orders` (My Orders) / `(tabs)/account` | open | `GET /api/orders` | `ol_orders` | – |
| `order/[id]` (tracking) | open an order | `GET /api/orders/:id`, `GET /api/checkouts/:id` (sibling store orders) | `ol_orders`, `ol_checkouts` | **progress is a local timer** (10 min); iOS Live Activity + widget updated from it; rider shown as "Sample rider" |
| `help` | send a question | `POST /api/support-requests` | INSERT `ol_support_requests` | – |
| `privacy`, `privacy-notice` | export data / manage consents / delete account / grievance / nominee / "Clear this phone" | `GET /api/privacy/export`, `GET|POST /api/privacy/consents`, `POST /api/privacy/erasure`, `POST /api/privacy/grievances`, `POST /api/privacy/nominee` | `ol_orders, ol_checkouts, ol_refunds, ol_support_requests, ol_booking_enquiries, ol_consents, ol_privacy_requests` | erasure signs out everywhere; AsyncStorage wiped |
| `profile-edit`, `payments` (preferred method), `wishlist`, `refer`, `about`, `wallet` | local settings | none | none | AsyncStorage only (`onecity.customer.v1`, `onecity.saved-products.v1`, `onecity-demo-wallet`); referral rewards and wallet are not active |
| `assistant` | chat | `/api/assistant/*` → 503 | – | switched off |
| `+html.tsx`, `_layout.tsx` | shell | – | – | `_layout` wraps Auth, Cart, Customer providers and the React Query client |

## 2. VINII Partner app (`partner/app/`)

| SCREEN | USER ACTION | API / RPC | DB TABLES | SIDE EFFECTS |
|---|---|---|---|---|
| `sign-in` | email + password | Supabase Auth direct, then `GET /api/partner/me` | `auth.users`, `org_users`, `roles`, `organizations`, `ol_merchant_channels` | 403 if not active staff of an organization |
| `index` | open | redirect | – | – |
| `orders` | tabs New / Preparing / Ready / Past; pulls every 5 s (new) / 10 s | `GET /api/partner/orders?tab=` | RPC `ol_expire_unanswered`; `ol_orders` ⨝ `orders` ⨝ `order_items` | unanswered orders get cancelled by the RPC |
| `alert` (full-screen incoming order) | polled new order auto-opens; **Accept** (pick prep time) / **Reject** (reason) | `POST /api/partner/orders/:id/accept|reject` | RPC `ol_partner_act` (`orders, order_items, kot_tickets, order_events, ol_orders, ol_merchant_channels`) | accept → KOT row + `dispatch` release; reject → `dispatch_cancel` |
| `order/[id]` | view; **Ready**, **Out for delivery**, **Delivered**; call customer (`tel:`) | `GET /api/partner/orders/:id`, `POST …/ready|out|delivered` | RPC `ol_partner_act`; `order_events` read | delivered writes POS `payments` (cash) |
| `items` | switch an item on/off for One Local | `GET /api/partner/items`, `PATCH /api/partner/items/:id` | `menu_categories, menu_items, item_channel_status` | item hidden/visible on the customer app within the 30 s catalogue cache |
| `settings` | Accepting / not accepting; register push device; **Send test order** | `PATCH /api/partner/outlet`, `PUT /api/partner/devices`, `POST /api/partner/test-order` | `ol_merchant_channels`, `ol_partner_devices`; test order → RPC `ol_create_restaurant_order` | test order pushes "New order…" |

## 3. Master admin (not in this repo) calling `/api/admin/*`

| ROUTE | ACTION | API | TABLES | SIDE EFFECTS |
|---|---|---|---|---|
| Organizations list | search | `GET /api/admin/organizations` | `organizations, locations, menu_*, item_channel_status, ol_stores` | – |
| Listing create / edit / preview / approve / pause | operator | `POST|GET|PATCH /api/admin/listings…`, `POST …/status` | `ol_stores`, `ol_merchant_channels` | catalogue cache invalidated; audit log line |
| Upload logo / cover | operator | `POST /api/admin/media/upload-url` | Storage `onecity-catalog` | – |
| Shoppers | list / block | `GET /api/admin/shoppers`, `POST …/:id/block` | `auth.users` (admin API), `ol_orders` | Auth ban |
| Demand | view | `GET /api/admin/demand` | `ol_support_requests` | – |

## 4. Rider and dispatch (callers outside this repo)

| ROUTE | CALLER | TABLES |
|---|---|---|
| `/api/rider/*` | One Rider app | `riders, rider_availability, push_tokens, delivery_assignments, delivery_jobs` |
| `/api/dispatch/*` | VINII / operations tooling (signed) | `delivery_*`, `ol_orders` |

## 5. Gaps visible from the screen map

- No screen or API to **cancel an order**, **request a refund**, **view real delivery status**, **view the delivery code**, or **rate**.
- The customer has no way to see that a **restaurant never saw** their food order (see `03_ORDER_LIFECYCLE.md` §0).
- Wallet, Coins, referrals are placeholders.
