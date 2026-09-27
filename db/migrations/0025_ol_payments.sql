-- 0025 Online payments (Razorpay) on One Local orders.
-- What the app needs to take real payments (frontend/server/payments.ts, docs/PAYMENTS.md):
--   1. Razorpay references and paid time on ol_orders, so a payment can be matched to its order
--      from either side (the app's verify call, or Razorpay's webhook).
--   2. The payment methods Razorpay can report (wallet, EMI, pay later), not only cod/upi/card/netbanking.
--   3. A log of webhook events already handled (ids and outcome only, never the payload), so a
--      repeated delivery is skipped and support can see what Razorpay told us.
--   4. Refund references unique, so one Razorpay refund can never be recorded twice.
-- All additive: new nullable columns, a widened check, a new table, new indexes. Nothing is dropped
-- or rewritten. NOT YET APPLIED — needs the founder's approval; the OS repo owns the migration ledger.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Razorpay references on the order
-- ---------------------------------------------------------------------------------------------
alter table public.ol_orders add column if not exists razorpay_order_id   text;
alter table public.ol_orders add column if not exists razorpay_payment_id text;
alter table public.ol_orders add column if not exists paid_at             timestamptz;
alter table public.ol_orders add column if not exists payment_error       text check (payment_error is null or char_length(payment_error) <= 300);
comment on column public.ol_orders.razorpay_order_id   is 'Razorpay order opened for this order (order_...). One per order; retries reuse it.';
comment on column public.ol_orders.razorpay_payment_id is 'The Razorpay payment that paid this order (pay_...), once paid.';
comment on column public.ol_orders.paid_at             is 'When the online payment was confirmed.';
comment on column public.ol_orders.payment_error       is 'Short reason the last online attempt failed, for support. Never card or bank details.';
create unique index if not exists ol_orders_razorpay_order   on public.ol_orders (razorpay_order_id)   where razorpay_order_id is not null;
create unique index if not exists ol_orders_razorpay_payment on public.ol_orders (razorpay_payment_id) where razorpay_payment_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 2. Every method Razorpay can report
-- ---------------------------------------------------------------------------------------------
-- 0021 created the check inline, so Postgres named it ol_orders_payment_method_check. The new list
-- is a superset of the old one, so every existing row still passes.
alter table public.ol_orders drop constraint if exists ol_orders_payment_method_check;
alter table public.ol_orders add constraint ol_orders_payment_method_check
  check (payment_method in ('cod','upi','card','netbanking','wallet','paylater','emi','cardless_emi'));
comment on column public.ol_orders.payment_method is 'How the customer paid: cod, or the method Razorpay reported (upi, card, netbanking, wallet, paylater, emi, cardless_emi).';

-- ---------------------------------------------------------------------------------------------
-- 3. Webhook events already handled
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ol_payment_events (
  event_id            text primary key,
  event               text not null,
  order_id            uuid references public.ol_orders(id) on delete set null,
  razorpay_payment_id text,
  created_at          timestamptz not null default now()
);
comment on table  public.ol_payment_events is 'Razorpay webhook events already handled. Ids and outcome only; the payload is never stored.';
comment on column public.ol_payment_events.event_id            is 'Razorpay event id (X-Razorpay-Event-Id header).';
comment on column public.ol_payment_events.event               is 'Event name, e.g. payment.captured, payment.failed, order.paid, refund.processed.';
comment on column public.ol_payment_events.order_id            is 'Our order the event was about, when we recognised it.';
comment on column public.ol_payment_events.razorpay_payment_id is 'Razorpay payment the event was about.';
comment on column public.ol_payment_events.created_at          is 'When we handled it.';
create index if not exists ol_payment_events_order on public.ol_payment_events (order_id);

-- ---------------------------------------------------------------------------------------------
-- 4. One ledger row per Razorpay refund
-- ---------------------------------------------------------------------------------------------
create unique index if not exists ol_refunds_reference on public.ol_refunds (reference) where reference is not null;

-- Server only, like every other ol_ table.
alter table public.ol_payment_events enable row level security;
revoke all on table public.ol_payment_events from anon, authenticated;
grant select, insert, update, delete on table public.ol_payment_events to service_role;

commit;
