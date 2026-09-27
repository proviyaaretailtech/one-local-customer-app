-- 0026 (DRAFT) Checkouts: one payment, one order per store.
-- DRAFT — the number is a placeholder; the OS repo ledger assigns the real one. NOT APPLIED to any
-- database. Needs the founder's approval. Apply after 0025 (payments), which it builds on.
--
-- Why (founder, 27 Sep 2026): food carts hold one restaurant; shopping carts (groceries, shops,
-- pharmacy, beauty) can mix stores. At checkout the server splits a cart into one order per store,
-- so each store only ever sees its own items, and the customer pays once for all of them.
--   1. ol_checkouts: what the customer paid for in one go — totals, payment state and the Razorpay
--      references (one Razorpay order per checkout). Payment moves from the order to the checkout.
--   2. ol_orders.checkout_id and ol_orders.store_id: which checkout an order belongs to and which
--      store fulfils it. The delivery address already has a column (ol_orders.delivery_address, 0021).
--   3. A trigger copies the checkout's payment state onto its orders in the same transaction, so every
--      store order always shows the same payment state as the checkout.
--   4. ol_coupons.store_id: a coupon that only one store's part of a checkout can use.
--   5. ol_payment_events.checkout_id: which checkout a Razorpay webhook event was about.
-- All additive: a new table, new nullable columns, new indexes, a new trigger. Nothing is dropped or
-- rewritten; existing orders keep checkout_id null and show exactly as before.
--
-- Until this is applied the server keeps working (frontend/server/store.ts, checkoutsReady): each
-- store order is saved on its own with no checkout row, and only cash on delivery is offered.
-- 0025's Razorpay columns on ol_orders stay for support look-ups but new payments are recorded on
-- ol_checkouts; if 0025 and 0026 are applied together, those four ol_orders columns simply stay empty.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Checkouts
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ol_checkouts (
  id                  uuid primary key default gen_random_uuid(),
  customer_hash       text not null,
  user_id             uuid references auth.users(id) on delete set null,
  kind                text not null check (kind in ('food','shopping')),
  item_total          numeric(10,2) not null check (item_total >= 0),
  discount            numeric(10,2) not null default 0 check (discount >= 0),
  delivery_fee        numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total               numeric(10,2) not null check (total >= 0),
  coupon_code         text,
  payment_method      text not null default 'cod' check (payment_method in ('cod','upi','card','netbanking','wallet','paylater','emi','cardless_emi')),
  payment_status      text not null default 'not_charged' check (payment_status in ('not_charged','pending','paid','failed','refunded')),
  razorpay_order_id   text,
  razorpay_payment_id text,
  paid_at             timestamptz,
  payment_error       text check (payment_error is null or char_length(payment_error) <= 300),
  idempotency_key     text,
  city_id             text not null default 'latur' references public.ol_service_areas(city_id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table  public.ol_checkouts is 'One checkout = one payment by the customer. Its store orders are the ol_orders rows with this checkout_id (one per store; a food checkout is always one restaurant).';
comment on column public.ol_checkouts.id                  is 'Checkout id.';
comment on column public.ol_checkouts.customer_hash       is 'Hash of the customer identity (signed-in account or device key), as on ol_orders.';
comment on column public.ol_checkouts.user_id             is 'Signed-in customer, when there is one.';
comment on column public.ol_checkouts.kind                is 'food (one restaurant) or shopping (groceries, shops, pharmacy, beauty; one or more stores).';
comment on column public.ol_checkouts.item_total          is 'Sum of item prices over all its store orders, in INR.';
comment on column public.ol_checkouts.discount            is 'Coupon discount over all its store orders, in INR.';
comment on column public.ol_checkouts.delivery_fee        is 'Delivery fees over all its store orders (each store has its own), in INR.';
comment on column public.ol_checkouts.total               is 'Amount the customer pays, in INR: the sum of its store orders'' totals.';
comment on column public.ol_checkouts.coupon_code         is 'Coupon applied, if any.';
comment on column public.ol_checkouts.payment_method      is 'cod, or the method Razorpay reported for the payment.';
comment on column public.ol_checkouts.payment_status      is 'Payment state of the whole checkout; copied onto its orders by trigger.';
comment on column public.ol_checkouts.razorpay_order_id   is 'The one Razorpay order opened for this checkout (order_...). Retries reuse it.';
comment on column public.ol_checkouts.razorpay_payment_id is 'The Razorpay payment that paid this checkout (pay_...), once paid.';
comment on column public.ol_checkouts.paid_at             is 'When the online payment was confirmed.';
comment on column public.ol_checkouts.payment_error       is 'Short reason the last online attempt failed, for support. Never card or bank details.';
comment on column public.ol_checkouts.idempotency_key     is 'Client key that makes retries return the same checkout.';
comment on column public.ol_checkouts.city_id             is 'City the checkout was placed in.';
comment on column public.ol_checkouts.created_at          is 'When the checkout was placed.';
comment on column public.ol_checkouts.updated_at          is 'When the checkout last changed (set automatically).';
create unique index if not exists ol_checkouts_idempotency     on public.ol_checkouts (customer_hash, idempotency_key) where idempotency_key is not null;
create unique index if not exists ol_checkouts_razorpay_order   on public.ol_checkouts (razorpay_order_id)   where razorpay_order_id is not null;
create unique index if not exists ol_checkouts_razorpay_payment on public.ol_checkouts (razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists ol_checkouts_customer on public.ol_checkouts (customer_hash, created_at desc);
create index if not exists ol_checkouts_user     on public.ol_checkouts (user_id, created_at desc) where user_id is not null;
create trigger ol_checkouts_updated_at before update on public.ol_checkouts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- 2. Which checkout and which store each order belongs to
-- ---------------------------------------------------------------------------------------------
alter table public.ol_orders add column if not exists checkout_id uuid references public.ol_checkouts(id) on delete set null;
alter table public.ol_orders add column if not exists store_id    text references public.ol_stores(id) on delete set null;
comment on column public.ol_orders.checkout_id      is 'The checkout this order was paid under, with the other store orders placed at the same time. Null for orders from before checkouts.';
comment on column public.ol_orders.store_id         is 'The store that fulfils this order. Every item in the order comes from this store.';
comment on column public.ol_orders.delivery_address is 'Where to deliver, as the customer chose it: {label, text, lat, lng, notes}. lat/lng may be null; notes are for the rider.';
create index if not exists ol_orders_checkout on public.ol_orders (checkout_id) where checkout_id is not null;
create index if not exists ol_orders_store    on public.ol_orders (store_id, created_at desc) where store_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. The checkout's payment state, copied onto its orders in the same transaction
-- ---------------------------------------------------------------------------------------------
create or replace function public.ol_checkout_payment_to_orders() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.ol_orders
     set payment_method = new.payment_method, payment_status = new.payment_status,
         paid_at = new.paid_at, payment_error = new.payment_error
   where checkout_id = new.id;
  return new;
end $$;
comment on function public.ol_checkout_payment_to_orders() is 'Keeps every store order of a checkout on the same payment state as the checkout.';
create trigger ol_checkouts_payment_to_orders
  after update of payment_method, payment_status, paid_at, payment_error on public.ol_checkouts
  for each row
  when (old.payment_method is distinct from new.payment_method or old.payment_status is distinct from new.payment_status
        or old.paid_at is distinct from new.paid_at or old.payment_error is distinct from new.payment_error)
  execute function public.ol_checkout_payment_to_orders();

-- ---------------------------------------------------------------------------------------------
-- 4. Coupons for one store
-- ---------------------------------------------------------------------------------------------
alter table public.ol_coupons add column if not exists store_id text references public.ol_stores(id) on delete cascade;
comment on column public.ol_coupons.store_id is 'When set, the coupon only counts against this store''s part of a checkout. Null = the whole checkout.';

-- ---------------------------------------------------------------------------------------------
-- 5. Webhook events name their checkout
-- ---------------------------------------------------------------------------------------------
alter table public.ol_payment_events add column if not exists checkout_id uuid references public.ol_checkouts(id) on delete set null;
comment on column public.ol_payment_events.checkout_id is 'Our checkout the event was about, when we recognised it (order_id holds its first store order).';
create index if not exists ol_payment_events_checkout on public.ol_payment_events (checkout_id);

-- Server only, like every other ol_ table.
alter table public.ol_checkouts enable row level security;
revoke all on table public.ol_checkouts from anon, authenticated;
grant select, insert, update, delete on table public.ol_checkouts to service_role;
revoke all on function public.ol_checkout_payment_to_orders() from public, anon, authenticated;

commit;
