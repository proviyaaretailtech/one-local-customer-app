-- Rehearsal of 0029_ol_dispatch.sql on the LOCAL database: plays one delivery through the offer round
-- (linked rider first, decline, lapse, a late rider comes online, accept, double accept, cancel, escalate,
-- re-dispatch, needs-a-rider list). Everything runs in one transaction that is rolled back, so nothing is kept.
--
-- Needs the local Supabase container with 0021-0026 applied (scripts/db.py local-migrate). Run from the repo root:
--   { echo "begin;"; grep -v -E '^(begin|commit);' db/migrations/0029_ol_dispatch.sql; cat db/tests/0029_dispatch_scenario.sql; echo "rollback;"; } \
--     | docker exec -i supabase_db_onelocal-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -A -t
-- Prints "all dispatch checks passed", or the first assertion that failed.
create temp table _t(k text primary key, v text);
do $$
declare
  org uuid; u uuid[]; r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
  o1 uuid; o2 uuid; j jsonb; j1 uuid; j2 uuid; res jsonb; a1 uuid; a2 uuid; a3 uuid; err text;
  base jsonb;
begin
  select id into org from public.organizations limit 1;
  select array_agg(id) into u from (select id from auth.users limit 6) x;
  insert into public.ol_stores (id, name, organization_id) values ('tstore', 'Test Kitchen', org);
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[1], 'Linked Rider', 'store', 'approved', 'bike') returning id into r1;
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[2], 'Solo Near', 'solo', 'approved', 'bike') returning id into r2;
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[3], 'Offline', 'solo', 'approved', 'bike') returning id into r3;
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[4], 'Far Away', 'solo', 'approved', 'bike') returning id into r4;
  insert into public.riders (user_id, full_name, type, status) values (u[5], 'Unapproved', 'solo', 'submitted') returning id into r5;
  insert into public.rider_store_links values (r1, 'tstore', 1, 'active');
  -- pickup is 18.4088, 76.5604 (Latur). r1 ~3 km, r2 ~1 km, r3 offline, r4 ~20 km, r5 not approved
  insert into public.rider_availability (rider_id, online, lat, lng, last_seen_at) values
    (r1, true, 18.4350, 76.5604, now()), (r2, true, 18.4178, 76.5604, now()), (r3, false, 18.41, 76.56, now()),
    (r4, true, 18.60, 76.56, now()), (r5, true, 18.41, 76.56, now());

  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id, organization_id, delivery_address)
  values ('h1', '[]', 400, 460, 'tstore', org, '{"text":"x"}') returning id into o1;
  base := jsonb_build_object('ol_order_id', o1, 'organization_id', org, 'store_id', 'tstore', 'payment_mode', 'cod', 'cash_to_collect', 460,
     'items', jsonb_build_object('count', 4, 'temperature', 'hot'), 'pickup', jsonb_build_object('name', 'Test Kitchen', 'lat', 18.4088, 'lng', 76.5604),
     'drop', jsonb_build_object('area', 'Gandhi Chowk', 'lat', 18.4001, 'lng', 76.5702), 'otp_hash', 'abc', 'request_id', 'req-1');

  j := public.dispatch_create_job(base); j1 := (j->>'job_id')::uuid;
  assert (j->>'replayed')::boolean = false and j->>'status' = 'created', 'create';
  j := public.dispatch_create_job(base);
  assert (j->>'replayed')::boolean and (j->>'job_id')::uuid = j1, 'replay returns the first job';
  assert (select count(*) from public.delivery_jobs) = 1, 'one job';
  assert public.dispatch_offer_next(j1)->>'result' = 'not_released', 'not offered before release';

  res := public.dispatch_release(j1, 20, 1);
  assert res->>'result' = 'offered' and (res->>'rider_id')::uuid = r1, format('linked rider first, got %s', res);
  a1 := (res->>'assignment_id')::uuid;
  assert public.dispatch_offer_next(j1)->>'result' = 'waiting', 'live offer is left alone';
  begin perform public.dispatch_answer(a1, r2, true); assert false, 'wrong rider accepted'; exception when others then
    assert sqlerrm like 'OL_NOT_FOUND%', sqlerrm; end;

  res := public.dispatch_answer(a1, r1, false, 'too far');
  assert res->>'result' = 'rejected', 'reject';
  res := public.dispatch_offer_next(j1);
  assert res->>'result' = 'offered' and (res->>'rider_id')::uuid = r2 and (res->>'round')::int = 2, format('next is nearest solo %s', res);
  a2 := (res->>'assignment_id')::uuid;

  update public.delivery_assignments set expires_at = now() - interval '1 second' where id = a2;
  begin perform public.dispatch_answer(a2, r2, true); assert false, 'expired offer accepted'; exception when others then
    assert sqlerrm like 'OL_EXPIRED%', sqlerrm; end;
  res := public.dispatch_offer_next(j1);
  assert res->>'result' = 'waiting' and res->>'reason' = 'no_candidate', format('lapsed, nobody left: %s', res);
  assert (select outcome from public.delivery_assignments where id = a2) = 'timed_out', 'timed out recorded';
  assert j1 in (select public.dispatch_due_jobs()), 'job is due for the sweep';

  update public.rider_availability set online = true, lat = 18.41, lng = 76.56, last_seen_at = now() where rider_id = r3;
  res := public.dispatch_offer_next(j1);
  assert res->>'result' = 'offered' and (res->>'rider_id')::uuid = r3 and (res->>'round')::int = 3, format('r3 offered: %s', res);
  a3 := (res->>'assignment_id')::uuid;
  -- r4 (too far) and r5 (unapproved) never get offers
  assert not exists (select 1 from public.delivery_assignments where rider_id in (r4, r5)), 'far and unapproved never offered';

  res := public.dispatch_answer(a3, r3, true);
  assert res->>'result' = 'accepted', 'accept';
  assert (select status from public.delivery_jobs where id = j1) = 'assigned' and (select rider_id from public.delivery_jobs where id = j1) = r3, 'assigned';
  assert (public.dispatch_answer(a3, r3, true)->>'replayed')::boolean, 'accept twice is the same accept';
  assert (select array_agg(kind order by id) from public.delivery_events where job_id = j1)
       = array['delivery.created','delivery.released','delivery.offered','delivery.rejected','delivery.offered','delivery.timed_out','delivery.offered','delivery.assigned'], 'event trail';
  assert public.dispatch_offer_next(j1)->>'result' = 'not_open', 'assigned job is not offered again';

  -- the database itself refuses a second live offer / second winner
  begin insert into public.delivery_assignments (job_id, rider_id, round, expires_at, outcome) values (j1, r1, 99, now(), 'accepted');
    assert false, 'second winner'; exception when unique_violation then null; end;

  -- cancel after assignment withdraws; cancelled order cannot be dispatched
  res := public.dispatch_cancel(j1, 'customer_cancelled');
  assert res->>'status' = 'cancelled', 'cancel after assign';
  assert (public.dispatch_cancel(j1, 'customer_cancelled')->>'replayed')::boolean, 'cancel twice';

  -- a job after pickup cannot be cancelled
  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id) values ('h2', '[]', 100, 100, 'tstore') returning id into o2;
  j := public.dispatch_create_job(base || jsonb_build_object('ol_order_id', o2, 'organization_id', null));
  j2 := (j->>'job_id')::uuid;
  update public.delivery_jobs set status = 'picked_up' where id = j2;
  begin perform public.dispatch_cancel(j2, 'x'); assert false, 'cancelled after pickup'; exception when others then
    assert sqlerrm like 'OL_PICKED_UP%', sqlerrm; end;

  -- nobody online anywhere: waits, then escalates once, and a re-dispatch gets fresh rounds
  update public.delivery_jobs set status = 'created' where id = j2;
  update public.rider_availability set online = false;
  res := public.dispatch_release(j2, null, null);
  assert res->>'result' = 'waiting', format('empty pool waits: %s', res);
  update public.delivery_jobs set released_at = now() - interval '10 minutes' where id = j2;
  res := public.dispatch_offer_next(j2);
  assert res->>'result' = 'no_rider', 'escalates after rounds x offer time';
  assert (select count(*) from public.delivery_events where job_id = j2 and kind = 'delivery.no_rider') = 1, 'one no_rider event';
  assert public.dispatch_offer_next(j2)->>'escalated' = 'true', 'no second escalation';
  assert j2 not in (select public.dispatch_due_jobs()), 'escalated jobs leave the sweep';
  update public.rider_availability set online = true, lat = 18.41, lng = 76.56, last_seen_at = now() where rider_id = r2;
  res := public.dispatch_release(j2, 15, null);
  assert res->>'result' = 'offered' and (res->>'rider_id')::uuid = r2 and (select escalated_at from public.delivery_jobs where id = j2) is null, format('re-dispatch: %s', res);

  -- the needs-a-rider list
  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id, created_at) values ('h3', '[]', 1, 1, 'tstore', now() - interval '5 minutes');
  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id, created_at) values ('h4', '[]', 1, 1, 'tstore', now() - interval '3 days');
  assert not exists (select 1 from public.delivery_orders_needing_rider n join public.ol_orders o on o.id = n.ol_order_id where o.customer_hash = 'h4'), 'a three day old order is never swept into a delivery';
  assert (select count(*) from public.delivery_orders_needing_rider where ol_order_id in (select id from public.ol_orders where customer_hash in ('h1','h2','h3'))) = 1 and exists (select 1 from public.delivery_orders_needing_rider n join public.ol_orders o on o.id = n.ol_order_id where o.customer_hash = 'h3'), 'needs-a-rider list shows only the order without a job';

  insert into _t values ('ok', 'all dispatch checks passed');
end $$;
select v from _t;
