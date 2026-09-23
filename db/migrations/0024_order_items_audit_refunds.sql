-- 0024 Order line items, audit columns, and a refund ledger.
-- Closes three gaps flagged in review of 0021-0023:
--   1. ol_orders.items was JSONB-only — no per-line table for refunds/analytics/reconciliation.
--   2. No created_by/updated_by/deleted_at on the catalog tables merchants will eventually edit.
--   3. No refund state anywhere, even though ol_orders.payment_status already allowed 'refunded'.
-- All additive: nothing here changes an existing column's type or drops data.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Order line items
-- ---------------------------------------------------------------------------------------------
-- ol_orders.items (jsonb) stays as the fast read path the app already uses; this table is the
-- normalized source for anything that needs individual lines. Both are written in the same
-- request (see store.ts), so they never drift — the jsonb column is a cache, not truth.
create table public.ol_order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.ol_orders(id) on delete cascade,
  product_id   text references public.ol_products(id) on delete set null,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name         text not null,
  weight       text not null default '',
  image        text not null default '',
  price        numeric(10,2) not null check (price >= 0),
  mrp          numeric(10,2) not null check (mrp >= 0),
  qty          int not null check (qty between 1 and 99),
  discount     numeric(10,2) not null default 0 check (discount >= 0),
  line_total   numeric(10,2) generated always as (price * qty - discount) stored,
  refunded_qty int not null default 0 check (refunded_qty >= 0 and refunded_qty <= qty),
  created_at   timestamptz not null default now()
);
comment on table  public.ol_order_items is 'Individual lines of an order, priced at the moment of purchase. ol_orders.items (jsonb) is a read cache of the same data.';
comment on column public.ol_order_items.order_id     is 'Order this line belongs to.';
comment on column public.ol_order_items.product_id   is 'One Local product, for marketplace orders.';
comment on column public.ol_order_items.menu_item_id is 'POS menu item, for restaurant orders (mutually exclusive with product_id in practice).';
comment on column public.ol_order_items.name         is 'Item name at the time of purchase (survives the product being renamed or removed).';
comment on column public.ol_order_items.weight       is 'Pack size or short description at time of purchase.';
comment on column public.ol_order_items.image        is 'Item image at time of purchase.';
comment on column public.ol_order_items.price        is 'Unit price charged, in INR.';
comment on column public.ol_order_items.mrp          is 'Unit MRP shown, in INR.';
comment on column public.ol_order_items.qty          is 'Quantity purchased.';
comment on column public.ol_order_items.discount     is 'Per-line discount in INR (order-level coupon discount stays on ol_orders.discount).';
comment on column public.ol_order_items.line_total   is 'price * qty - discount. Computed, never written directly.';
comment on column public.ol_order_items.refunded_qty is 'How much of qty has been refunded so far; a line can be partially refunded.';
comment on column public.ol_order_items.created_at   is 'When the line was written (== order creation time).';
create index ol_order_items_order on public.ol_order_items (order_id);
create index ol_order_items_product on public.ol_order_items (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 2. Audit columns on the tables a merchant or admin screen will eventually edit
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ol_service_areas','ol_categories','ol_brands','ol_stores','ol_products','ol_banners',
                           'ol_discover_chips','ol_coupons','ol_events','ol_reels','ol_themed_stores'] loop
    execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('comment on column public.%I.created_by is %L', t, 'Who created this row; null for the seeded sample catalogue.');
    execute format('comment on column public.%I.updated_by is %L', t, 'Who last edited this row.');
    execute format('comment on column public.%I.deleted_at is %L', t, 'Soft delete: hidden from customers when set, kept for history. Null while live.');
  end loop;
end $$;

-- Orders: who cancelled it (customer, restaurant staff, or the system on timeout).
alter table public.ol_orders add column if not exists cancelled_by uuid references auth.users(id) on delete set null;
comment on column public.ol_orders.cancelled_by is 'Who cancelled the order, when status = cancelled. Null for a system timeout.';

-- Booking enquiries / support requests already have status; add who closed them out and when.
alter table public.ol_booking_enquiries add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.ol_booking_enquiries add column if not exists resolved_at timestamptz;
alter table public.ol_support_requests  add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.ol_support_requests  add column if not exists resolved_at timestamptz;

-- ---------------------------------------------------------------------------------------------
-- 3. Refunds
-- ---------------------------------------------------------------------------------------------
-- A ledger, not a payment-gateway integration: this records what was refunded and why. The
-- actual money movement (Razorpay refund API, cash handback) is a Phase 3 concern; this table
-- is what that phase writes into, and it's what support/reconciliation reads from today.
create table public.ol_refunds (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.ol_orders(id) on delete cascade,
  order_item_id uuid references public.ol_order_items(id) on delete set null,
  amount        numeric(10,2) not null check (amount > 0),
  reason        text not null check (char_length(reason) between 3 and 500),
  method        text not null default 'original' check (method in ('original','wallet','manual')),
  status        text not null default 'requested' check (status in ('requested','approved','rejected','processed')),
  reference     text,
  requested_by  uuid references auth.users(id) on delete set null,
  processed_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
comment on table  public.ol_refunds is 'Refund ledger. One order can have several rows (partial refunds, or one per line).';
comment on column public.ol_refunds.order_id      is 'Order being refunded.';
comment on column public.ol_refunds.order_item_id is 'Specific line, if this is a per-item refund; null for a whole-order refund.';
comment on column public.ol_refunds.amount        is 'Amount refunded, in INR.';
comment on column public.ol_refunds.reason        is 'Why, shown to the customer and kept for support.';
comment on column public.ol_refunds.method        is 'original = back to the payment method used; wallet = OneCity wallet credit; manual = handled outside the app.';
comment on column public.ol_refunds.status        is 'requested (customer/support asked) -> approved -> processed (money actually moved), or rejected.';
comment on column public.ol_refunds.reference     is 'Gateway refund id or other external reference, once processed.';
comment on column public.ol_refunds.requested_by  is 'Who asked for the refund (customer or support staff).';
comment on column public.ol_refunds.processed_by  is 'Who marked it processed.';
comment on column public.ol_refunds.created_at    is 'When requested.';
comment on column public.ol_refunds.processed_at  is 'When the money actually moved.';
create index ol_refunds_order on public.ol_refunds (order_id);

-- Refunds functions raise 'OL_...' errors the same way ol_partner_act does, for the same reason:
-- one call, one transaction, never a half-applied refund.
create or replace function public.ol_process_refund(p_order uuid, p_item uuid, p_amount numeric, p_reason text, p_actor uuid, p_method text default 'original')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order    public.ol_orders%rowtype;
  v_item     public.ol_order_items%rowtype;
  v_prior    numeric(10,2);
  v_cap      numeric(10,2);
  v_id       uuid := gen_random_uuid();
  v_now      timestamptz := now();
  v_status   text;
begin
  select * into v_order from public.ol_orders where id = p_order for update;
  if not found then raise exception 'OL_NOT_FOUND: order not found'; end if;
  if v_order.status not in ('delivered','out','packed','accepted') then
    raise exception 'OL_WRONG_STATE: only an order that was charged can be refunded';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'OL_BAD_REQUEST: refund amount must be positive'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'OL_BAD_REQUEST: a reason is needed to refund'; end if;

  select coalesce(sum(amount), 0) into v_prior from public.ol_refunds
    where order_id = p_order and status = 'processed' and (p_item is null or order_item_id = p_item);

  if p_item is not null then
    select * into v_item from public.ol_order_items where id = p_item and order_id = p_order for update;
    if not found then raise exception 'OL_NOT_FOUND: order line not found'; end if;
    v_cap := v_item.line_total - v_prior;
  else
    v_cap := v_order.total - v_prior;
  end if;
  if p_amount > v_cap then raise exception 'OL_BAD_REQUEST: refund of % exceeds the % still refundable', p_amount, v_cap; end if;

  insert into public.ol_refunds (id, order_id, order_item_id, amount, reason, method, status, requested_by, processed_by, created_at, processed_at)
  values (v_id, p_order, p_item, p_amount, p_reason, p_method, 'processed', p_actor, p_actor, v_now, v_now);

  if p_item is not null then
    update public.ol_order_items set refunded_qty = refunded_qty +
      ceil(p_amount / nullif(v_item.price, 0))::int where id = p_item;
  end if;

  -- Whole order fully refunded (including anything refunded before this call) -> payment_status flips.
  v_status := case when v_prior + p_amount >= v_order.total then 'refunded' else v_order.payment_status end;
  update public.ol_orders set payment_status = v_status where id = p_order;

  return jsonb_build_object('refund_id', v_id, 'amount', p_amount, 'order_payment_status', v_status,
    'refunded_so_far', v_prior + p_amount, 'order_total', v_order.total);
end;
$$;
comment on function public.ol_process_refund(uuid, uuid, numeric, text, uuid, text) is
  'Records and processes a refund (whole order or one line), atomically. Flips ol_orders.payment_status to refunded once the full total is covered. Raises OL_* errors the API turns into messages.';

do $$
declare t text;
begin
  foreach t in array array['ol_order_items','ol_refunds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on function public.ol_process_refund(uuid, uuid, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.ol_process_refund(uuid, uuid, numeric, text, uuid, text) to service_role;

commit;
