-- Rehearsal of 0030_ol_delivery_steps.sql on the LOCAL database (after 0029): plays a delivery from "assigned" to
-- "delivered" (steps, pickup check, wrong codes, exception, resume, proof), retries, stale versions, another rider's job,
-- and a reassignment. One transaction, rolled back, so nothing is kept.
--
-- Run from the repo root:
--   { echo "begin;"; grep -v -E '^(begin|commit);' db/migrations/0029_ol_dispatch.sql; grep -v -E '^(begin|commit);' db/migrations/0030_ol_delivery_steps.sql; cat db/tests/0030_steps_scenario.sql; echo "rollback;"; } \
--     | docker exec -i supabase_db_onelocal-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -A -t
-- Prints "all delivery step checks passed", or the first assertion that failed.
create function pg_temp.expect(q text, prefix text) returns void language plpgsql as $f$
begin
  execute q;
  raise exception 'expected % but it succeeded: %', prefix, q;
exception when others then
  if sqlerrm not like prefix || '%' then raise exception 'expected % but got %', prefix, sqlerrm; end if;
end $f$;

do $$
declare
  org uuid; u uuid[]; r1 uuid; r2 uuid; o1 uuid; o2 uuid; base jsonb; res jsonb; r jsonb;
  j1 uuid; j2 uuid; a uuid; v int; st text; ex uuid; n int;
begin
  select id into org from public.organizations limit 1;
  select array_agg(id) into u from (select id from auth.users limit 3) x;
  insert into public.ol_stores (id, name, organization_id) values ('tstore', 'Test Kitchen', org);
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[1], 'Rider One', 'solo', 'approved', 'bike') returning id into r1;
  insert into public.riders (user_id, full_name, type, status, vehicle) values (u[2], 'Rider Two', 'solo', 'approved', 'bike') returning id into r2;
  insert into public.rider_availability (rider_id, online, lat, lng, last_seen_at) values
    (r1, true, 18.4100, 76.5604, now()), (r2, true, 18.4200, 76.5604, now());
  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id, organization_id, delivery_address) values ('h1', '[]', 400, 460, 'tstore', org, '{"text":"x"}') returning id into o1;
  insert into public.ol_orders (customer_hash, items, subtotal, total, store_id, organization_id, delivery_address) values ('h2', '[]', 400, 460, 'tstore', org, '{"text":"x"}') returning id into o2;
  base := jsonb_build_object('organization_id', org, 'store_id', 'tstore', 'payment_mode', 'cod', 'cash_to_collect', 460,
     'items', jsonb_build_object('count', 4, 'temperature', 'hot'), 'pickup', jsonb_build_object('name', 'Test Kitchen', 'lat', 18.4088, 'lng', 76.5604),
     'drop', jsonb_build_object('area', 'Gandhi Chowk', 'lat', 18.4001, 'lng', 76.5702), 'otp_hash', 'abc', 'request_id', 'req');

  -- ---- job 1: the whole way ----
  res := public.dispatch_create_job(base || jsonb_build_object('ol_order_id', o1)); j1 := (res->>'job_id')::uuid;
  res := public.dispatch_release(j1, 20, 1);
  assert (res->>'rider_id')::uuid = r1, 'nearest rider offered';
  res := public.dispatch_answer((res->>'assignment_id')::uuid, r1, true);
  select version into v from public.delivery_jobs where id = j1;
  assert (select status from public.delivery_jobs where id = j1) = 'assigned', 'assigned';

  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'at_pickup', %s, 'k0', 'h0', 18.4088, 76.5604, 10, null, null)$q$, j1, r1, v), 'OL_BAD_STEP');
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'to_pickup', %s, 'k0', 'h0', null, null, null, null, null)$q$, j1, r1, v - 1), 'OL_STALE');
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'to_pickup', %s, 'k0', 'h0', null, null, null, null, null)$q$, j1, r2, v), 'OL_NOT_FOUND');

  r := public.dispatch_step(j1, r1, 'to_pickup', v, 'k1', 'h1', null, null, null, null, null);
  assert r->>'status' = 'assigned' and r->>'step' = 'to_pickup' and (r->>'version')::int = v + 1 and (r->>'replayed')::boolean = false, r::text;
  -- five retries of the same command change the job once
  for i in 1..5 loop
    r := public.dispatch_step(j1, r1, 'to_pickup', v, 'k1', 'h1', null, null, null, null, null);
    assert (r->>'replayed')::boolean and (r->>'version')::int = v + 1, 'replay returns the stored reply';
  end loop;
  assert (select version from public.delivery_jobs where id = j1) = v + 1, 'retries changed nothing';
  assert (select count(*) from public.delivery_events where job_id = j1 and kind = 'delivery.to_pickup') = 1, 'one event';
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'to_pickup', %s, 'k1', 'other', null, null, null, null, null)$q$, j1, r1, v), 'OL_IDEMPOTENCY');
  v := v + 1;

  -- arrived at pickup: too far needs a reason and is flagged
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'at_pickup', %s, 'k2', 'h2', 18.5000, 76.5604, 10, null, null)$q$, j1, r1, v), 'OL_TOO_FAR');
  r := public.dispatch_step(j1, r1, 'at_pickup', v, 'k2b', 'h2b', 18.4300, 76.5604, 10, now() - interval '2 minutes', 'gate is far from the pin');
  assert r->>'status' = 'at_pickup' and r->'flags' = '["too_far"]'::jsonb, r::text; v := v + 1;
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'picked_up', %s, 'k3', 'h3', null, null, null, null, null)$q$, j1, r1, v), 'OL_BAD_STEP');
  perform pg_temp.expect(format($q$select public.dispatch_verify_pickup(%L, %L, %s, 'k4', 'h4', false, null)$q$, j1, r1, v), 'OL_PICKUP_MISMATCH');
  r := public.dispatch_verify_pickup(j1, r1, v, 'k5', 'h5', true, null);
  assert r->>'step' = 'verified', r::text; v := v + 1;
  r := public.dispatch_step(j1, r1, 'picked_up', v, 'k6', 'h6', null, null, null, null, null);
  assert r->>'status' = 'picked_up'; v := v + 1;
  assert (select picked_up_at from public.delivery_jobs where id = j1) is not null, 'picked_up_at set';
  perform pg_temp.expect(format($q$select public.dispatch_cancel(%L, 'changed mind')$q$, j1), 'OL_PICKED_UP');
  r := public.dispatch_step(j1, r1, 'to_drop', v, 'k7', 'h7', null, null, null, null, null); v := v + 1;
  r := public.dispatch_step(j1, r1, 'at_drop', v, 'k8', 'h8', null, null, null, null, null); v := v + 1;
  perform pg_temp.expect(format($q$select public.dispatch_submit_proof(%L, %L, %s, 'p0', 'hp0', 'otp', 'abc', null, 18.4001, 76.5702, 460, null)$q$, j1, r1, v), 'OL_BAD_STEP');
  r := public.dispatch_step(j1, r1, 'handover', v, 'k9', 'h9', null, null, null, null, null); v := v + 1;

  -- proof: wrong codes keep their count, the fifth raises an exception
  for i in 1..4 loop
    r := public.dispatch_submit_proof(j1, r1, v, 'bad' || i, 'hbad' || i, 'otp', 'zzz', null, 18.4001, 76.5702, 460, null);
    assert r->>'result' = 'otp_invalid' and (r->>'attempts_left')::int = 5 - i, r::text;
  end loop;
  r := public.dispatch_submit_proof(j1, r1, v, 'bad1', 'hbad1', 'otp', 'zzz', null, 18.4001, 76.5702, 460, null);
  assert (r->>'replayed')::boolean and (select otp_attempts from public.delivery_jobs where id = j1) = 4, 'a retried wrong code is not counted twice';
  r := public.dispatch_submit_proof(j1, r1, v, 'bad5', 'hbad5', 'otp', 'zzz', null, 18.4001, 76.5702, 460, null);
  assert r->>'result' = 'otp_locked' and r->>'status' = 'exception', r::text;
  select (r->>'version')::int into v;
  assert (select kind from public.delivery_exceptions where job_id = j1 and status = 'open') = 'proof_failed', 'proof_failed exception';
  perform pg_temp.expect(format($q$select public.dispatch_submit_proof(%L, %L, %s, 'p1', 'hp1', 'otp', 'abc', null, 18.4001, 76.5702, 460, null)$q$, j1, r1, v), 'OL_WRONG_STATE');
  select id into ex from public.delivery_exceptions where job_id = j1 and status = 'open';
  r := public.dispatch_resolve_exception(ex, 'resume', 'customer confirmed by phone', 'ops');
  assert r->>'status' = 'at_drop' and r->>'step' = 'handover', r::text; v := (r->>'version')::int;
  assert (public.dispatch_resolve_exception(ex, 'resume', null, 'ops')->>'replayed')::boolean, 'resolve twice is harmless';
  perform pg_temp.expect(format($q$select public.dispatch_resolve_exception(%L, 'fail', null, 'ops')$q$, ex), 'OL_WRONG_STATE');

  perform pg_temp.expect(format($q$select public.dispatch_submit_proof(%L, %L, %s, 'p2', 'hp2', 'photo', null, null, 18.4001, 76.5702, 460, null)$q$, j1, r1, v), 'OL_BAD_REQUEST');
  perform pg_temp.expect(format($q$select public.dispatch_submit_proof(%L, %L, %s, 'p3', 'hp3', 'otp', 'abc', null, 18.4001, 76.5702, 100, null)$q$, j1, r1, v), 'OL_CASH_MISMATCH');
  r := public.dispatch_submit_proof(j1, r1, v, 'p4', 'hp4', 'otp', 'abc', null, 18.4001, 76.5702, 460, null);
  assert r->>'result' = 'delivered' and r->>'status' = 'delivered' and (r->>'flagged')::boolean = false, r::text;
  assert (select delivered_at from public.delivery_jobs where id = j1) is not null, 'delivered_at';
  assert (select method from public.delivery_proofs where job_id = j1) = 'otp', 'proof stored';
  assert (public.dispatch_submit_proof(j1, r1, v, 'p4', 'hp4', 'otp', 'abc', null, 18.4001, 76.5702, 460, null)->>'replayed')::boolean, 'retry of the winning proof replays';
  assert (select count(*) from public.delivery_events where job_id = j1 and kind = 'delivery.delivered') = 1, 'one delivered event';
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'to_drop', %s, 'late', 'hl', null, null, null, null, null)$q$, j1, r1, v + 1), 'OL_WRONG_STATE');

  -- ---- job 2: a problem before pickup, reassigned to another rider ----
  res := public.dispatch_create_job(base || jsonb_build_object('ol_order_id', o2)); j2 := (res->>'job_id')::uuid;
  res := public.dispatch_release(j2, 20, 1);
  assert (res->>'rider_id')::uuid = r1, 'r1 is free again and nearest';
  perform public.dispatch_answer((res->>'assignment_id')::uuid, r1, true);
  select version into v from public.delivery_jobs where id = j2;
  r := public.dispatch_raise_exception(j2, r1, v, 'e1', 'he1', 'vehicle', 'tyre burst', null, 18.41, 76.56, null, null);
  assert r->>'status' = 'exception' and r->>'exception_kind' = 'vehicle', r::text;
  assert (public.dispatch_raise_exception(j2, r1, v, 'e1', 'he1', 'vehicle', 'tyre burst', null, 18.41, 76.56, null, null)->>'replayed')::boolean, 'report retried';
  perform pg_temp.expect(format($q$select public.dispatch_raise_exception(%L, %L, %s, 'e2', 'he2', 'safety', null, null, 18.41, 76.56, null, null)$q$, j2, r1, (r->>'version')::int), 'OL_WRONG_STATE');
  select id into ex from public.delivery_exceptions where job_id = j2 and status = 'open';
  r := public.dispatch_resolve_exception(ex, 'reassign', 'send another rider', 'ops');
  assert r->>'status' = 'created', r::text;
  assert (select rider_id from public.delivery_jobs where id = j2) is null, 'rider removed';
  res := public.dispatch_offer_next(j2);
  assert res->>'result' = 'offered' and (res->>'rider_id')::uuid = r2, format('the other rider is offered, got %s', res);
  perform pg_temp.expect(format($q$select public.dispatch_step(%L, %L, 'to_pickup', 1, 'z', 'hz', null, null, null, null, null)$q$, j2, r1), 'OL_NOT_FOUND');
  select count(*) into n from public.delivery_events where job_id = j2 and kind in ('delivery.exception', 'delivery.reassigned');
  assert n = 2, 'events for the problem and the reassignment';

  raise notice 'all delivery step checks passed';
end $$;
