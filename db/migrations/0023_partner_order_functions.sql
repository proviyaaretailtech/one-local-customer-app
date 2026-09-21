-- 0023 Atomic order functions for One Local restaurant orders and the VINII Partner app.
-- Each function does all of its writes in one transaction, so an order is never half-created
-- and two phones can never both accept. Only the server (service role) may call them.
-- POS tables are written exactly as the POS itself writes them (numbers from next_org_seq,
-- statuses and event kinds the POS already uses).

begin;

-- Place a One Local order with a VINII POS restaurant.
-- p: {organization_id, customer_hash, user_id?, city_id?, idempotency_key?, delivery_fee?, customer_name?,
--     customer_phone?, notes?, delivery_address?, lines: [{menu_item_id, qty}]}
-- Prices come from menu_items (never from the app). GST uses the POS default (orders.gst_pct = 5).
create or replace function public.ol_create_restaurant_order(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := (p->>'organization_id')::uuid;
  v_hash       text := p->>'customer_hash';
  v_key        text := nullif(p->>'idempotency_key', '');
  v_fee        numeric(10,2) := coalesce((p->>'delivery_fee')::numeric, 0);
  v_channel    public.ol_merchant_channels%rowtype;
  v_existing   public.ol_orders%rowtype;
  v_line       jsonb;
  v_item       public.menu_items%rowtype;
  v_qty        int;
  v_lines      jsonb := '[]'::jsonb;
  v_subtotal   numeric(10,2) := 0;
  v_gst_pct    numeric := 5;
  v_gst        numeric(10,2);
  v_total      numeric(10,2);
  v_ol_id      uuid := gen_random_uuid();
  v_pos_id     uuid;
  v_order_no   bigint;
  v_display    text;
  v_deadline   timestamptz;
  v_count      int := 0;
begin
  if v_org is null or v_hash is null then
    raise exception 'OL_BAD_REQUEST: organization_id and customer_hash are required';
  end if;

  -- Same checkout retried: return the order already created.
  if v_key is not null then
    select * into v_existing from public.ol_orders where customer_hash = v_hash and idempotency_key = v_key;
    if found then
      return jsonb_build_object('ol_order_id', v_existing.id, 'pos_order_id', v_existing.pos_order_id,
        'total', v_existing.total, 'deadline', v_existing.restaurant_deadline, 'replayed', true);
    end if;
  end if;

  select * into v_channel from public.ol_merchant_channels where organization_id = v_org;
  if not found or not v_channel.accepting then
    raise exception 'OL_NOT_ACCEPTING: this restaurant is not taking orders right now';
  end if;

  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 or jsonb_array_length(p->'lines') > 50 then
    raise exception 'OL_EMPTY: the cart is empty or too large';
  end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_qty := (v_line->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'OL_BAD_QTY: quantities must be between 1 and 99';
    end if;
    select * into v_item from public.menu_items
      where id = (v_line->>'menu_item_id')::uuid and organization_id = v_org;
    if not found or not v_item.is_available or exists (
        select 1 from public.item_channel_status s
        where s.menu_item_id = v_item.id and s.channel = 'one_local' and not s.is_available
          and (s.off_until is null or s.off_until > now())) then
      raise exception 'OL_ITEM_UNAVAILABLE: % is no longer available', coalesce(v_item.name, 'an item');
    end if;
    v_subtotal := v_subtotal + v_item.price * v_qty;
    v_count := v_count + v_qty;
    v_lines := v_lines || jsonb_build_object('id', 'mi_' || v_item.id, 'menu_item_id', v_item.id, 'name', v_item.name,
      'weight', coalesce(v_item.description, ''), 'price', v_item.price, 'mrp', v_item.price,
      'image', coalesce(v_item.image_url, ''), 'qty', v_qty, 'station', v_item.station, 'course', v_item.course);
  end loop;

  v_gst := round(v_subtotal * v_gst_pct / 100, 2);
  v_total := v_subtotal + v_gst + v_fee;
  v_deadline := now() + make_interval(secs => v_channel.accept_window_seconds);
  v_order_no := public.next_org_seq(v_org, 'order');
  v_display := 'OL-' || lpad(v_order_no::text, 5, '0');

  insert into public.orders (organization_id, order_no, display_no, channel, status, customer_name, customer_phone,
                             subtotal, gst_pct, gst_amount, total, placed_by, notes, external_ref)
  values (v_org, v_order_no, v_display, 'online', 'new', nullif(p->>'customer_name', ''), nullif(p->>'customer_phone', ''),
          v_subtotal, v_gst_pct, v_gst, v_total, 'integration', nullif(p->>'notes', ''), 'onelocal:' || v_ol_id)
  returning id into v_pos_id;

  insert into public.order_items (order_id, menu_item_id, name, qty, unit_price, station, course)
  select v_pos_id, (l->>'menu_item_id')::uuid, l->>'name', (l->>'qty')::int, (l->>'price')::numeric,
         coalesce(l->>'station', 'main'), coalesce(l->>'course', 'eat')
  from jsonb_array_elements(v_lines) l;

  insert into public.order_events (organization_id, order_id, kind, message, actor, meta)
  values (v_org, v_pos_id, 'placed', 'Order ' || v_display || ' placed on One Local — ' || v_count || ' items', 'one_local',
          jsonb_build_object('source', 'one_local', 'ol_order_id', v_ol_id));

  insert into public.ol_orders (id, customer_hash, user_id, items, subtotal, discount, delivery_fee, gst, total,
                                payment_method, status, delivery_address, idempotency_key, pos_order_id,
                                organization_id, restaurant_deadline, city_id)
  values (v_ol_id, v_hash, nullif(p->>'user_id', '')::uuid, v_lines, v_subtotal, 0, v_fee, v_gst, v_total,
          'cod', 'placed', p->'delivery_address', v_key, v_pos_id, v_org, v_deadline, coalesce(p->>'city_id', 'latur'));

  return jsonb_build_object('ol_order_id', v_ol_id, 'pos_order_id', v_pos_id, 'display_no', v_display,
    'subtotal', v_subtotal, 'gst', v_gst, 'delivery_fee', v_fee, 'total', v_total, 'deadline', v_deadline, 'replayed', false);
end;
$$;

comment on function public.ol_create_restaurant_order(jsonb) is
  'Creates a One Local restaurant order atomically: One Local order + POS order, items and placed event. Prices from menu_items; GST 5%. Raises OL_* errors the API turns into messages.';

-- A staff action from VINII Partner, or the system timing an order out.
-- p_action: accept | reject | ready | out | delivered | timeout
-- p_expected: the POS order's updated_at the phone last saw (not needed for timeout).
create or replace function public.ol_partner_act(p_order uuid, p_action text, p_actor uuid, p_actor_name text,
                                                 p_expected timestamptz, p_prep int default null, p_reason text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders%rowtype;
  v_ol      public.ol_orders%rowtype;
  v_channel public.ol_merchant_channels%rowtype;
  v_kot     uuid;
  v_kot_no  bigint;
  v_now     timestamptz := now();
  v_actor   text := coalesce(nullif(p_actor_name, ''), 'staff');
  v_paused  boolean := false;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'OL_NOT_FOUND: order not found'; end if;
  select * into v_ol from public.ol_orders where pos_order_id = p_order for update;
  if not found then raise exception 'OL_NOT_ONE_LOCAL: this is not a One Local order'; end if;

  if p_action <> 'timeout' and (p_expected is null or v_order.updated_at <> p_expected) then
    raise exception 'OL_STALE: this order was already changed on another phone';
  end if;

  if p_action = 'accept' then
    if v_order.status <> 'new' then raise exception 'OL_WRONG_STATE: only new orders can be accepted'; end if;
    if v_ol.restaurant_deadline is not null and v_now > v_ol.restaurant_deadline + interval '5 seconds' then
      raise exception 'OL_EXPIRED: the time to accept this order has passed';
    end if;
    if p_prep is null or p_prep < 5 or p_prep > 120 then raise exception 'OL_BAD_REQUEST: prep time must be 5 to 120 minutes'; end if;
    v_kot_no := public.next_org_seq(v_order.organization_id, 'kot');
    insert into public.kot_tickets (organization_id, order_id, kot_no, station, status)
    values (v_order.organization_id, p_order, v_kot_no, 'main', 'new') returning id into v_kot;
    update public.order_items set kot_ticket_id = v_kot where order_id = p_order and status = 'pending';
    update public.orders set status = 'sent_to_kitchen', updated_at = v_now where id = p_order;
    update public.ol_orders set status = 'accepted', prep_minutes = p_prep, eta_minutes = p_prep + 15 where id = v_ol.id;
    update public.ol_merchant_channels set missed_in_a_row = 0 where organization_id = v_order.organization_id;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta) values
      (v_order.organization_id, p_order, 'accepted', 'Accepted by ' || v_actor || ' · ready in ' || p_prep || ' min', 'partner',
       jsonb_build_object('prep_minutes', p_prep, 'by', p_actor)),
      (v_order.organization_id, p_order, 'kot_fired', 'KOT ' || v_kot_no || ' fired for ' || v_order.display_no, 'partner',
       jsonb_build_object('kot_no', v_kot_no));

  elsif p_action = 'reject' then
    if v_order.status <> 'new' then raise exception 'OL_WRONG_STATE: only new orders can be rejected'; end if;
    if coalesce(btrim(p_reason), '') = '' then raise exception 'OL_BAD_REQUEST: a reason is needed to reject'; end if;
    update public.orders set status = 'cancelled', updated_at = v_now where id = p_order;
    update public.order_items set status = 'cancelled' where order_id = p_order;
    update public.ol_orders set status = 'cancelled', cancel_reason = 'Restaurant: ' || p_reason where id = v_ol.id;
    update public.ol_merchant_channels set missed_in_a_row = 0 where organization_id = v_order.organization_id;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta)
    values (v_order.organization_id, p_order, 'rejected', 'Rejected by ' || v_actor || ': ' || p_reason, 'partner',
            jsonb_build_object('reason', p_reason, 'by', p_actor));

  elsif p_action = 'ready' then
    if v_order.status <> 'sent_to_kitchen' then raise exception 'OL_WRONG_STATE: only accepted orders can be marked ready'; end if;
    update public.kot_tickets set status = 'ready', updated_at = v_now where order_id = p_order and status in ('new', 'preparing');
    update public.order_items set status = 'ready' where order_id = p_order and status in ('pending', 'preparing');
    update public.orders set status = 'ready', updated_at = v_now where id = p_order;
    update public.ol_orders set status = 'packed' where id = v_ol.id;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta)
    values (v_order.organization_id, p_order, 'kot_ready', v_order.display_no || ' is ready', 'partner', jsonb_build_object('by', p_actor));

  elsif p_action = 'out' then
    if v_order.status <> 'ready' or v_ol.status <> 'packed' then raise exception 'OL_WRONG_STATE: only ready orders can go out'; end if;
    update public.kot_tickets set status = 'delivered', updated_at = v_now where order_id = p_order;
    update public.order_items set status = 'delivered' where order_id = p_order and status <> 'cancelled';
    update public.orders set updated_at = v_now where id = p_order;
    update public.ol_orders set status = 'out' where id = v_ol.id;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta)
    values (v_order.organization_id, p_order, 'out_for_delivery', v_order.display_no || ' is out for delivery', 'partner', jsonb_build_object('by', p_actor));

  elsif p_action = 'delivered' then
    if v_ol.status <> 'out' then raise exception 'OL_WRONG_STATE: only orders out for delivery can be delivered'; end if;
    update public.orders set status = 'delivered', payment_method = 'cash', paid_at = v_now, updated_at = v_now where id = p_order;
    insert into public.payments (organization_id, order_id, method, amount, reference, created_by)
    values (v_order.organization_id, p_order, 'cash', v_order.total, 'onelocal:' || v_ol.id, p_actor);
    update public.ol_orders set status = 'delivered', payment_status = 'paid' where id = v_ol.id;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta) values
      (v_order.organization_id, p_order, 'delivered', v_order.display_no || ' delivered', 'partner', jsonb_build_object('by', p_actor)),
      (v_order.organization_id, p_order, 'paid', 'Cash ₹' || v_order.total || ' collected on delivery', 'partner', jsonb_build_object('method', 'cash'));

  elsif p_action = 'timeout' then
    if v_order.status <> 'new' or v_ol.restaurant_deadline is null or v_now <= v_ol.restaurant_deadline then
      return jsonb_build_object('changed', false);
    end if;
    update public.orders set status = 'cancelled', updated_at = v_now where id = p_order;
    update public.order_items set status = 'cancelled' where order_id = p_order;
    update public.ol_orders set status = 'cancelled', cancel_reason = 'The restaurant did not respond in time' where id = v_ol.id;
    update public.ol_merchant_channels set missed_in_a_row = missed_in_a_row + 1
      where organization_id = v_order.organization_id returning * into v_channel;
    if found and v_channel.missed_in_a_row >= v_channel.auto_pause_after and v_channel.accepting then
      update public.ol_merchant_channels set accepting = false where organization_id = v_order.organization_id;
      v_paused := true;
    end if;
    insert into public.order_events (organization_id, order_id, kind, message, actor, meta)
    values (v_order.organization_id, p_order, 'timed_out', v_order.display_no || ' was not answered in time', 'one_local',
            jsonb_build_object('auto_paused', v_paused));

  else
    raise exception 'OL_BAD_REQUEST: unknown action %', p_action;
  end if;

  select * into v_order from public.orders where id = p_order;
  select * into v_ol from public.ol_orders where id = v_ol.id;
  return jsonb_build_object('changed', true, 'pos_status', v_order.status, 'ol_status', v_ol.status,
                            'updated_at', v_order.updated_at, 'auto_paused', v_paused);
end;
$$;

comment on function public.ol_partner_act(uuid, text, uuid, text, timestamptz, int, text) is
  'One step of a One Local restaurant order (accept, reject, ready, out, delivered, timeout), atomic, with optimistic version check and row locks.';

-- Cancel every unanswered One Local order past its accept-by time. Called by the API while phones poll.
create or replace function public.ol_expire_unanswered(p_org uuid default null)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare r record; n int := 0;
begin
  for r in
    select o.pos_order_id from public.ol_orders o join public.orders po on po.id = o.pos_order_id
    where o.status = 'placed' and po.status = 'new' and o.restaurant_deadline < now()
      and (p_org is null or o.organization_id = p_org)
    order by o.restaurant_deadline
    for update of o skip locked
  loop
    perform public.ol_partner_act(r.pos_order_id, 'timeout', null, 'system', null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

comment on function public.ol_expire_unanswered(uuid) is
  'Times out unanswered One Local restaurant orders (optionally for one restaurant); returns how many were cancelled.';

revoke all on function public.ol_create_restaurant_order(jsonb) from public, anon, authenticated;
revoke all on function public.ol_partner_act(uuid, text, uuid, text, timestamptz, int, text) from public, anon, authenticated;
revoke all on function public.ol_expire_unanswered(uuid) from public, anon, authenticated;
grant execute on function public.ol_create_restaurant_order(jsonb) to service_role;
grant execute on function public.ol_partner_act(uuid, text, uuid, text, timestamptz, int, text) to service_role;
grant execute on function public.ol_expire_unanswered(uuid) to service_role;

commit;
