-- 0029 Dispatch: every successful delivery order pings the rider pool until a driver is assigned.
-- Contract: One Local Delivery app /docs/RIDER_DISPATCH_CONTRACT.md. Rider app: docs/RIDER_APP_E2E_V1.md (section 4).
--
-- DRAFT: applied nowhere. Rehearse on the local database; production needs the founder's approval.
-- Requires 0021-0026 (ol_orders, ol_stores, payment state and store_id on orders).
--
-- Scope of this migration: the order -> rider pool -> driver assigned half of a delivery. It holds the
-- job, every offer and answer, the outbox of delivery events, and only as much of the rider pool as
-- dispatch needs to pick someone (who they are, whether they are online and where, where to ring
-- them). Onboarding, documents, money and the later job steps are separate migrations that extend
-- `riders` additively.
--
-- Places are plain latitude / longitude (double precision) with a haversine function, not PostGIS:
-- one city, a pool of dozens, no polygons yet. The zone model of RIDER_APP_E2E_V1 section 2 swaps
-- dispatch_km() for a PostGIS query when it lands, without changing any caller.
--
-- Every function is atomic and callable only by the server (service role), like 0023.

begin;

-- ---------- The pool ----------
create table public.riders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  full_name       text not null,
  phone           text,
  type            text not null default 'store' check (type in ('store','solo')),
  status          text not null default 'draft' check (status in ('draft','submitted','verification_pending','approved','rejected','documents_expired','suspended')),
  organization_id uuid references public.organizations(id) on delete set null,
  vehicle         text check (vehicle in ('bike','scooter','cycle','car')),
  acceptance      text not null default 'manual' check (acceptance in ('auto','manual')),
  cash_limit      numeric(10,2) check (cash_limit >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table  public.riders is 'People who deliver (OnLatur). Identity is auth.users (D1); a person may also be a shopper or staff. Only approved riders are offered jobs.';
comment on column public.riders.id              is 'Rider id.';
comment on column public.riders.user_id         is 'The rider''s login (phone OTP).';
comment on column public.riders.full_name       is 'Name; only the first name is ever shown to customers or restaurants.';
comment on column public.riders.phone           is 'Verified phone from the login.';
comment on column public.riders.type            is 'store = linked to a restaurant or store, solo = works for the platform.';
comment on column public.riders.status          is 'Onboarding and standing; only approved riders receive offers.';
comment on column public.riders.organization_id is 'The restaurant that manages this rider; null for an independent rider.';
comment on column public.riders.vehicle         is 'Vehicle used for deliveries.';
comment on column public.riders.acceptance      is 'manual = 30 second offer to accept; auto = assigned straight away.';
comment on column public.riders.cash_limit      is 'Most cash a rider may hold before going online is blocked (null = the city default).';
comment on column public.riders.created_at      is 'When the rider registered.';
comment on column public.riders.updated_at      is 'When the row last changed (set automatically).';
create trigger riders_updated_at before update on public.riders for each row execute function public.set_updated_at();

create table public.rider_store_links (
  rider_id uuid not null references public.riders(id) on delete cascade,
  store_id text not null references public.ol_stores(id) on delete cascade,
  priority int  not null default 1 check (priority >= 1),
  status   text not null default 'active' check (status in ('active','paused')),
  primary key (rider_id, store_id)
);
comment on table  public.rider_store_links is 'Which stores a rider delivers for. Linked riders are offered a store''s jobs before platform riders.';
comment on column public.rider_store_links.rider_id is 'The rider.';
comment on column public.rider_store_links.store_id is 'The store (ol_stores).';
comment on column public.rider_store_links.priority is 'Smaller first when several linked riders qualify.';
comment on column public.rider_store_links.status   is 'active or paused.';

create table public.rider_availability (
  rider_id     uuid primary key references public.riders(id) on delete cascade,
  online       boolean not null default false,
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  accuracy_m   int,
  battery      int check (battery between 0 and 100),
  last_seen_at timestamptz
);
comment on table  public.rider_availability is 'Whether a rider is online and where they last were. A rider not seen for 60 seconds is treated as offline.';
comment on column public.rider_availability.rider_id     is 'The rider.';
comment on column public.rider_availability.online       is 'True while the rider has pressed Go Online.';
comment on column public.rider_availability.lat          is 'Last latitude reported.';
comment on column public.rider_availability.lng          is 'Last longitude reported.';
comment on column public.rider_availability.accuracy_m   is 'GPS accuracy in metres.';
comment on column public.rider_availability.battery      is 'Battery percent at the last report.';
comment on column public.rider_availability.last_seen_at is 'When the app last reported (heartbeat every 30 seconds).';
create index rider_availability_online on public.rider_availability (last_seen_at) where online;

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references public.riders(id) on delete cascade,
  expo_push_token text not null unique,
  platform   text not null check (platform in ('ios','android')),
  last_ok_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table  public.push_tokens is 'Phones that ring for job offers. A token Expo reports as unregistered is removed.';
comment on column public.push_tokens.id              is 'Registration id.';
comment on column public.push_tokens.rider_id        is 'The rider whose phone this is.';
comment on column public.push_tokens.expo_push_token is 'Expo push token.';
comment on column public.push_tokens.platform        is 'ios or android.';
comment on column public.push_tokens.last_ok_at      is 'Last time the app registered or Expo accepted a push.';
comment on column public.push_tokens.created_at      is 'When the phone was registered.';
create index push_tokens_rider on public.push_tokens (rider_id);

-- ---------- Per restaurant settings ----------
create table public.org_dispatch_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  dispatch_trigger text not null default 'placed' check (dispatch_trigger in ('placed','accepted')),
  offer_seconds    int  not null default 30 check (offer_seconds between 10 and 120),
  max_rounds       int  not null default 3  check (max_rounds between 1 and 20),
  search_radius_km numeric(4,1) not null default 8 check (search_radius_km between 1 and 50),
  updated_at       timestamptz not null default now()
);
comment on table  public.org_dispatch_settings is 'How a restaurant''s deliveries are dispatched. No row = the defaults here (ping on placed, 30 second offers, 3 rounds, 8 km).';
comment on column public.org_dispatch_settings.organization_id  is 'The restaurant.';
comment on column public.org_dispatch_settings.dispatch_trigger is 'placed = ping riders as soon as the order is successful; accepted = only once the restaurant accepts.';
comment on column public.org_dispatch_settings.offer_seconds    is 'How long one rider has to answer an offer.';
comment on column public.org_dispatch_settings.max_rounds       is 'Offers made (one rider each) before operations is alerted.';
comment on column public.org_dispatch_settings.search_radius_km is 'Furthest a rider may be from the pickup and still be offered the job.';
comment on column public.org_dispatch_settings.updated_at       is 'When the settings last changed.';
create trigger org_dispatch_settings_updated_at before update on public.org_dispatch_settings for each row execute function public.set_updated_at();

-- ---------- The job ----------
create table public.delivery_jobs (
  id               uuid primary key default gen_random_uuid(),
  ol_order_id      uuid not null unique references public.ol_orders(id) on delete restrict,
  pos_order_id     uuid,
  organization_id  uuid references public.organizations(id) on delete set null,
  store_id         text references public.ol_stores(id) on delete set null,
  city_id          text not null default 'latur' references public.ol_service_areas(city_id),
  status           text not null default 'created' check (status in ('created','offered','assigned','at_pickup','picked_up','at_drop','delivered','exception','cancelled')),
  version          int  not null default 1,
  idempotency_key  text not null unique,
  rider_id         uuid references public.riders(id) on delete set null,
  payment_mode     text not null check (payment_mode in ('cod','online')),
  cash_to_collect  numeric(10,2) not null default 0 check (cash_to_collect >= 0),
  items_count      int  not null default 1 check (items_count >= 1),
  temperature      text not null default 'ambient' check (temperature in ('hot','cold','ambient')),
  vehicle          text not null default 'any' check (vehicle in ('any','bike','scooter','cycle','car')),
  prep_minutes     int  check (prep_minutes between 0 and 240),
  promised_by      timestamptz,
  order_no         text,
  kitchen_no       text,
  pickup_name      text not null,
  pickup_address   text,
  pickup_lat       double precision not null check (pickup_lat between -90 and 90),
  pickup_lng       double precision not null check (pickup_lng between -180 and 180),
  pickup_phone     text,
  drop_area        text,
  drop_address     text,
  drop_lat         double precision not null check (drop_lat between -90 and 90),
  drop_lng         double precision not null check (drop_lng between -180 and 180),
  drop_notes       text,
  customer_first_name text,
  customer_phone   text,
  otp_hash         text not null,
  otp_attempts     int  not null default 0,
  dispatch_trigger text not null default 'placed' check (dispatch_trigger in ('placed','accepted')),
  released_at      timestamptz,
  rounds_base      int  not null default 0 check (rounds_base >= 0),
  escalated_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table  public.delivery_jobs is 'One delivery task per order, forever (ol_order_id is unique). Owned by OnLatur dispatch; the order flow never writes its status and dispatch never writes the order''s.';
comment on column public.delivery_jobs.id               is 'Job id.';
comment on column public.delivery_jobs.ol_order_id      is 'The One Local store order this delivers (one job per order).';
comment on column public.delivery_jobs.pos_order_id     is 'The kitchen''s side of the order in VINII POS, when there is one.';
comment on column public.delivery_jobs.organization_id  is 'The restaurant or merchant (tenant); null for a store with no merchant yet.';
comment on column public.delivery_jobs.store_id         is 'The One Local store the order came from; used to find riders linked to it.';
comment on column public.delivery_jobs.city_id          is 'Market the job belongs to.';
comment on column public.delivery_jobs.status           is 'created, offered, assigned, at_pickup, picked_up, at_drop, delivered, exception or cancelled. Moves only through the dispatch functions.';
comment on column public.delivery_jobs.version          is 'Bumped on every change; callers send the version they saw so two taps cannot both win.';
comment on column public.delivery_jobs.idempotency_key  is 'onelocal:<ol_order_id>:delivery. Sending the same order twice returns this job.';
comment on column public.delivery_jobs.rider_id         is 'The rider who accepted; null until assigned.';
comment on column public.delivery_jobs.payment_mode     is 'cod or online.';
comment on column public.delivery_jobs.cash_to_collect  is 'Cash the rider collects, delivery fee included; 0 for an order already paid online.';
comment on column public.delivery_jobs.items_count      is 'How many items the rider carries (no item names or prices).';
comment on column public.delivery_jobs.temperature      is 'hot, cold or ambient, so the rider carries it right.';
comment on column public.delivery_jobs.vehicle          is 'Vehicle class the job needs; any = no restriction.';
comment on column public.delivery_jobs.prep_minutes     is 'Minutes the kitchen needs; offers are timed so the rider arrives as it is ready.';
comment on column public.delivery_jobs.promised_by      is 'Delivery time promised to the customer.';
comment on column public.delivery_jobs.order_no         is 'Order number shown to the rider.';
comment on column public.delivery_jobs.kitchen_no       is 'Kitchen ticket number used at pickup.';
comment on column public.delivery_jobs.pickup_name      is 'Restaurant or store name.';
comment on column public.delivery_jobs.pickup_address   is 'Pickup address text.';
comment on column public.delivery_jobs.pickup_lat       is 'Pickup latitude. Places are coordinates first, text second.';
comment on column public.delivery_jobs.pickup_lng       is 'Pickup longitude.';
comment on column public.delivery_jobs.pickup_phone     is 'Restaurant phone for the rider.';
comment on column public.delivery_jobs.drop_area        is 'Neighbourhood only; all a rider sees before pickup.';
comment on column public.delivery_jobs.drop_address     is 'Full delivery address; shown to the rider only from picked_up.';
comment on column public.delivery_jobs.drop_lat         is 'Delivery latitude.';
comment on column public.delivery_jobs.drop_lng         is 'Delivery longitude.';
comment on column public.delivery_jobs.drop_notes      is 'The customer''s delivery instructions; shown to the rider with the address, from picked_up.';
comment on column public.delivery_jobs.customer_first_name is 'First name only.';
comment on column public.delivery_jobs.customer_phone   is 'Shown to the rider only during an active job.';
comment on column public.delivery_jobs.otp_hash         is 'Hash of the 4 digit delivery code. The code itself is never stored; One Local derives it for the customer.';
comment on column public.delivery_jobs.otp_attempts     is 'Wrong code attempts; 5 raises an exception.';
comment on column public.delivery_jobs.dispatch_trigger is 'placed or accepted: when riders are offered the job (copied from the restaurant''s settings at creation).';
comment on column public.delivery_jobs.released_at      is 'When offering to riders began; null while waiting for the restaurant (trigger accepted).';
comment on column public.delivery_jobs.rounds_base      is 'Offers made before the latest release, so a re-dispatch by operations gets a fresh set of rounds.';
comment on column public.delivery_jobs.escalated_at     is 'When operations was alerted (no rider took it); cleared by a re-dispatch.';
comment on column public.delivery_jobs.cancel_reason    is 'Why the job was cancelled.';
comment on column public.delivery_jobs.created_at       is 'When the job was created.';
comment on column public.delivery_jobs.updated_at       is 'When the job last changed (set automatically).';
create trigger delivery_jobs_updated_at before update on public.delivery_jobs for each row execute function public.set_updated_at();
create index delivery_jobs_rider  on public.delivery_jobs (rider_id, status) where rider_id is not null;
create index delivery_jobs_open   on public.delivery_jobs (created_at) where status in ('created','offered');
create index delivery_jobs_org    on public.delivery_jobs (organization_id, created_at desc) where organization_id is not null;

-- ---------- Every offer and answer ----------
create table public.delivery_assignments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.delivery_jobs(id) on delete cascade,
  rider_id    uuid not null references public.riders(id) on delete cascade,
  round       int  not null check (round >= 1),
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  outcome     text check (outcome in ('accepted','rejected','timed_out','withdrawn')),
  reason      text,
  answered_at timestamptz
);
comment on table  public.delivery_assignments is 'Every offer made to a rider and how it ended. outcome is null while the offer is live.';
comment on column public.delivery_assignments.id          is 'Offer id (what the rider app accepts or declines).';
comment on column public.delivery_assignments.job_id      is 'The job offered.';
comment on column public.delivery_assignments.rider_id    is 'The rider offered it.';
comment on column public.delivery_assignments.round       is '1 for the first offer on the job, 2 for the next, and so on.';
comment on column public.delivery_assignments.offered_at  is 'When the offer was made.';
comment on column public.delivery_assignments.expires_at  is 'When the offer lapses if unanswered.';
comment on column public.delivery_assignments.outcome     is 'accepted, rejected, timed_out, withdrawn (job cancelled); null while live.';
comment on column public.delivery_assignments.reason      is 'Reason a rider gave for declining.';
comment on column public.delivery_assignments.answered_at is 'When it ended.';
-- The database itself refuses two winners, two live offers on a job, or two live offers to a rider.
create unique index delivery_one_live_offer_per_job   on public.delivery_assignments (job_id)   where outcome is null;
create unique index delivery_one_live_offer_per_rider on public.delivery_assignments (rider_id) where outcome is null;
create unique index delivery_one_accepted_per_job     on public.delivery_assignments (job_id)   where outcome = 'accepted';
create unique index delivery_one_offer_per_round      on public.delivery_assignments (job_id, round);
create index delivery_assignments_rider on public.delivery_assignments (rider_id, offered_at desc);

-- ---------- Outbox ----------
create table public.delivery_events (
  id         bigserial primary key,
  job_id     uuid not null references public.delivery_jobs(id) on delete cascade,
  kind       text not null,
  v          int  not null default 1,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
comment on table  public.delivery_events is 'Outbox: every change to a job, written in the same transaction as the change. One Local and VINII read it (Realtime today).';
comment on column public.delivery_events.id         is 'Sequence number; readers keep a cursor.';
comment on column public.delivery_events.job_id     is 'The job.';
comment on column public.delivery_events.kind       is 'delivery.created, .offered, .assigned, .rejected, .timed_out, .no_rider, .cancelled, ...';
comment on column public.delivery_events.v          is 'Event schema version.';
comment on column public.delivery_events.meta       is 'Details: request_id, app, actor, rider_id, round... Never names, phones or addresses.';
comment on column public.delivery_events.created_at is 'When it happened.';
create index delivery_events_job on public.delivery_events (job_id, id);

-- Delivery orders that are successful but have no job (dispatch was down). Operations'' "needs a rider" list.
create view public.delivery_orders_needing_rider as
  select o.id as ol_order_id, o.organization_id, o.store_id, o.status, o.payment_method, o.payment_status, o.created_at
  from public.ol_orders o
  where o.status not in ('cancelled','delivered')
    and o.created_at < now() - interval '1 minute'
    and o.created_at > now() - interval '24 hours'
    and (o.payment_method = 'cod' or o.payment_status = 'paid')
    and not exists (select 1 from public.delivery_jobs j where j.ol_order_id = o.id);
comment on view public.delivery_orders_needing_rider is 'Successful orders from the last 24 hours, older than a minute, that have no delivery job yet. The sweep retries them; operations watches the list. Older orders are never swept into a delivery: nobody rides for a day-old order.';

-- ---------- Row-level security: server only ----------
do $$
declare t text;
begin
  foreach t in array array['riders','rider_store_links','rider_availability','push_tokens','org_dispatch_settings','delivery_jobs','delivery_assignments','delivery_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on public.delivery_orders_needing_rider from anon, authenticated;
grant select on public.delivery_orders_needing_rider to service_role;
grant usage, select on sequence public.delivery_events_id_seq to service_role;

-- ---------- Functions ----------
create or replace function public.dispatch_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;
comment on function public.dispatch_km(double precision, double precision, double precision, double precision) is 'Straight-line kilometres between two points (haversine).';

-- Create the job for an order. p: the body of POST /api/dispatch/jobs plus otp_hash and request_id.
-- Same order twice returns the first job (replayed = true). Does not start offering: see dispatch_offer_next.
create or replace function public.dispatch_create_job(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order  public.ol_orders%rowtype;
  v_job    public.delivery_jobs%rowtype;
  v_org    uuid := nullif(p->>'organization_id', '')::uuid;
  v_trig   text;
begin
  select * into v_order from public.ol_orders where id = (p->>'ol_order_id')::uuid;
  if not found then raise exception 'OL_NOT_FOUND: order not found'; end if;

  select * into v_job from public.delivery_jobs where ol_order_id = v_order.id;
  if found then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'version', v_job.version, 'replayed', true,
                              'dispatch_trigger', v_job.dispatch_trigger, 'released', v_job.released_at is not null);
  end if;

  if v_order.status in ('cancelled', 'delivered') then
    raise exception 'OL_NOT_DELIVERABLE: this order is % and cannot be delivered', v_order.status;
  end if;
  if v_org is distinct from v_order.organization_id and v_order.organization_id is not null then
    raise exception 'OL_BAD_REQUEST: organization_id does not match the order';
  end if;

  select dispatch_trigger into v_trig from public.org_dispatch_settings where organization_id = v_org;
  v_trig := coalesce(v_trig, p->>'dispatch_trigger', 'placed');

  insert into public.delivery_jobs (
    ol_order_id, pos_order_id, organization_id, store_id, city_id, idempotency_key, payment_mode, cash_to_collect,
    items_count, temperature, vehicle, prep_minutes, promised_by, order_no, kitchen_no,
    pickup_name, pickup_address, pickup_lat, pickup_lng, pickup_phone,
    drop_area, drop_address, drop_lat, drop_lng, drop_notes, customer_first_name, customer_phone, otp_hash, dispatch_trigger)
  values (
    v_order.id, nullif(p->>'pos_order_id', '')::uuid, v_org, nullif(p->>'store_id', ''), coalesce(v_order.city_id, 'latur'),
    'onelocal:' || v_order.id || ':delivery', p->>'payment_mode', coalesce((p->>'cash_to_collect')::numeric, 0),
    coalesce((p#>>'{items,count}')::int, 1), coalesce(p#>>'{items,temperature}', 'ambient'), coalesce(p->>'vehicle', 'any'),
    (p->>'prep_minutes')::int, (p->>'promised_by')::timestamptz, p->>'order_no', p->>'kitchen_no',
    p#>>'{pickup,name}', p#>>'{pickup,address}', (p#>>'{pickup,lat}')::double precision, (p#>>'{pickup,lng}')::double precision, p#>>'{pickup,phone}',
    p#>>'{drop,area}', p#>>'{drop,address}', (p#>>'{drop,lat}')::double precision, (p#>>'{drop,lng}')::double precision, p#>>'{drop,instructions}',
    p#>>'{drop,customer_first_name}', p#>>'{drop,customer_phone}', p->>'otp_hash', v_trig)
  returning * into v_job;

  insert into public.delivery_events (job_id, kind, meta)
  values (v_job.id, 'delivery.created', jsonb_build_object('request_id', p->>'request_id', 'app', 'one-local', 'actor', 'order_flow', 'dispatch_trigger', v_trig));

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'version', v_job.version, 'replayed', false,
                            'dispatch_trigger', v_trig, 'released', false);
end;
$$;
comment on function public.dispatch_create_job(jsonb) is 'Creates the one delivery job for an order, idempotently, with its delivery.created event.';

-- Offer the job to the next rider, one at a time. Safe to call at any time and from anywhere (an accept
-- that failed, a timeout sweep, a rider reading their offer): it first lapses an overdue live offer, then
-- offers to the best remaining candidate, or alerts operations after max_rounds offers (or, with nobody
-- online at all, after max_rounds x offer_seconds).
-- Returns {result: 'offered'|'waiting'|'no_rider'|'not_open'|'not_released', ...}.
create or replace function public.dispatch_offer_next(p_job uuid, p_request_id text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_job    public.delivery_jobs%rowtype;
  v_set    public.org_dispatch_settings%rowtype;
  v_secs   int := 30;
  v_rounds int := 3;
  v_radius numeric := 8;
  v_live   public.delivery_assignments%rowtype;
  v_total  int;
  v_made   int;
  v_rider  record;
  v_asg    public.delivery_assignments%rowtype;
begin
  select * into v_job from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'OL_NOT_FOUND: job not found'; end if;
  if v_job.status not in ('created', 'offered') then return jsonb_build_object('result', 'not_open', 'status', v_job.status); end if;
  if v_job.released_at is null then return jsonb_build_object('result', 'not_released'); end if;
  if v_job.escalated_at is not null then return jsonb_build_object('result', 'no_rider', 'escalated', true); end if;

  select * into v_set from public.org_dispatch_settings where organization_id = v_job.organization_id;
  if found then v_secs := v_set.offer_seconds; v_rounds := v_set.max_rounds; v_radius := v_set.search_radius_km; end if;

  select * into v_live from public.delivery_assignments where job_id = p_job and outcome is null;
  if found then
    if v_live.expires_at > now() then
      return jsonb_build_object('result', 'waiting', 'assignment_id', v_live.id, 'rider_id', v_live.rider_id, 'expires_at', v_live.expires_at);
    end if;
    update public.delivery_assignments set outcome = 'timed_out', answered_at = now() where id = v_live.id;
    insert into public.delivery_events (job_id, kind, meta)
    values (p_job, 'delivery.timed_out', jsonb_build_object('request_id', p_request_id, 'actor', 'system', 'round', v_live.round, 'rider_id', v_live.rider_id));
  end if;

  select count(*) into v_total from public.delivery_assignments where job_id = p_job;
  v_made := v_total - v_job.rounds_base;

  -- Candidates: approved, online, seen in the last 60 s, no live offer, no active job, never offered this job,
  -- right vehicle, within the radius. Linked to this store or restaurant first, then the nearest; fewest jobs
  -- today breaks ties (fairness).
  if v_made < v_rounds then
    select r.id as rider_id, r.acceptance,
           (r.organization_id is not null and r.organization_id = v_job.organization_id)
             or exists (select 1 from public.rider_store_links l where l.rider_id = r.id and l.store_id = v_job.store_id and l.status = 'active') as linked,
           public.dispatch_km(a.lat, a.lng, v_job.pickup_lat, v_job.pickup_lng) as km
      into v_rider
      from public.riders r
      join public.rider_availability a on a.rider_id = r.id
     where r.status = 'approved' and a.online and a.last_seen_at > now() - interval '60 seconds' and a.lat is not null and a.lng is not null
       and (v_job.vehicle = 'any' or r.vehicle = v_job.vehicle)
       and not exists (select 1 from public.delivery_assignments x where x.rider_id = r.id and x.outcome is null)
       and not exists (select 1 from public.delivery_jobs j where j.rider_id = r.id and j.status in ('assigned','at_pickup','picked_up','at_drop'))
       and not exists (select 1 from public.delivery_assignments x where x.rider_id = r.id and x.job_id = p_job)
       and public.dispatch_km(a.lat, a.lng, v_job.pickup_lat, v_job.pickup_lng) <= v_radius
     order by linked desc, km asc,
              (select count(*) from public.delivery_jobs j where j.rider_id = r.id and j.created_at > date_trunc('day', now())) asc
     limit 1;

    if found then
      insert into public.delivery_assignments (job_id, rider_id, round, expires_at)
      values (p_job, v_rider.rider_id, v_total + 1, now() + make_interval(secs => v_secs))
      returning * into v_asg;
      update public.delivery_jobs set status = 'offered', version = version + 1 where id = p_job;
      insert into public.delivery_events (job_id, kind, meta)
      values (p_job, 'delivery.offered', jsonb_build_object('request_id', p_request_id, 'actor', 'system', 'round', v_asg.round, 'rider_id', v_rider.rider_id));
      return jsonb_build_object('result', 'offered', 'assignment_id', v_asg.id, 'rider_id', v_rider.rider_id, 'round', v_asg.round,
                                'expires_at', v_asg.expires_at, 'auto', v_rider.acceptance = 'auto', 'km', round(v_rider.km::numeric, 2));
    end if;

    -- Nobody to ring right now. Keep waiting (the sweep tries again) until the job has waited as long as
    -- all its rounds would have taken, then escalate like any other failed round.
    if now() < v_job.released_at + make_interval(secs => v_secs * v_rounds) then
      return jsonb_build_object('result', 'waiting', 'reason', 'no_candidate');
    end if;
  end if;

  update public.delivery_jobs set status = 'created', escalated_at = now(), version = version + 1 where id = p_job;
  insert into public.delivery_events (job_id, kind, meta)
  values (p_job, 'delivery.no_rider', jsonb_build_object('request_id', p_request_id, 'actor', 'system', 'rounds', v_made));
  return jsonb_build_object('result', 'no_rider', 'rounds', v_made);
end;
$$;
comment on function public.dispatch_offer_next(uuid, text) is 'Offers a released job to the next best rider, one at a time; lapses an overdue offer first; after max_rounds offers (or the same time with nobody online) writes delivery.no_rider for operations.';

-- Start offering (trigger accepted, or operations re-dispatching a stuck job). p_expected is the version the caller saw
-- (only checked on a job that was never released).
create or replace function public.dispatch_release(p_job uuid, p_prep int, p_expected int, p_request_id text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_job public.delivery_jobs%rowtype;
begin
  select * into v_job from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'OL_NOT_FOUND: job not found'; end if;
  if v_job.status not in ('created', 'offered') then raise exception 'OL_WRONG_STATE: this job is already %', v_job.status; end if;
  if p_expected is not null and v_job.released_at is null and v_job.version <> p_expected then
    raise exception 'OL_STALE: this job was already changed';
  end if;

  if v_job.released_at is null or v_job.escalated_at is not null then
    -- First release, or operations re-dispatching a job that ran out of rounds: a fresh set of rounds.
    update public.delivery_jobs
       set released_at = now(), escalated_at = null, version = version + 1,
           rounds_base = (select count(*) from public.delivery_assignments where job_id = p_job),
           prep_minutes = coalesce(p_prep, prep_minutes)
     where id = p_job;
    insert into public.delivery_events (job_id, kind, meta)
    values (p_job, 'delivery.released', jsonb_build_object('request_id', p_request_id, 'actor', 'order_flow', 'prep_minutes', p_prep));
  end if;
  return public.dispatch_offer_next(p_job, p_request_id);
end;
$$;
comment on function public.dispatch_release(uuid, int, int, text) is 'Marks a job ready to be offered (restaurant accepted, or operations re-dispatch) and starts the offer round. A job already being offered is left alone.';

-- A rider answers a live offer. Accept: the first to answer wins and the job becomes assigned.
create or replace function public.dispatch_answer(p_assignment uuid, p_rider uuid, p_accept boolean, p_reason text default null, p_request_id text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_asg public.delivery_assignments%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  select * into v_asg from public.delivery_assignments where id = p_assignment and rider_id = p_rider;
  if not found then raise exception 'OL_NOT_FOUND: offer not found'; end if;
  select * into v_job from public.delivery_jobs where id = v_asg.job_id for update;
  select * into v_asg from public.delivery_assignments where id = p_assignment for update;

  if v_asg.outcome is not null then
    if v_asg.outcome = 'accepted' and p_accept then return jsonb_build_object('job_id', v_job.id, 'result', 'accepted', 'replayed', true); end if;
    if v_asg.outcome = 'withdrawn' then raise exception 'OL_GONE: this order was cancelled'; end if;
    raise exception 'OL_EXPIRED: this offer is no longer open';
  end if;
  if v_asg.expires_at <= now() then raise exception 'OL_EXPIRED: this offer has run out'; end if;
  if v_job.status <> 'offered' then raise exception 'OL_TAKEN: this job was already taken'; end if;

  if p_accept then
    update public.delivery_assignments set outcome = 'accepted', answered_at = now() where id = p_assignment;
    update public.delivery_jobs set status = 'assigned', rider_id = p_rider, version = version + 1 where id = v_job.id;
    insert into public.delivery_events (job_id, kind, meta)
    values (v_job.id, 'delivery.assigned', jsonb_build_object('request_id', p_request_id, 'app', 'onlatur-rider', 'actor', 'rider', 'rider_id', p_rider, 'round', v_asg.round));
    return jsonb_build_object('job_id', v_job.id, 'result', 'accepted', 'replayed', false);
  end if;

  update public.delivery_assignments set outcome = 'rejected', reason = left(p_reason, 200), answered_at = now() where id = p_assignment;
  insert into public.delivery_events (job_id, kind, meta)
  values (v_job.id, 'delivery.rejected', jsonb_build_object('request_id', p_request_id, 'app', 'onlatur-rider', 'actor', 'rider', 'rider_id', p_rider, 'round', v_asg.round));
  return jsonb_build_object('job_id', v_job.id, 'result', 'rejected');
end;
$$;
comment on function public.dispatch_answer(uuid, uuid, boolean, text, text) is 'A rider accepts or declines their live offer. One winner per job, enforced by row locks and a unique index.';

-- Cancel a job that has not been picked up; withdraws any live offer.
create or replace function public.dispatch_cancel(p_job uuid, p_reason text, p_expected int default null, p_request_id text default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_job public.delivery_jobs%rowtype;
begin
  select * into v_job from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'OL_NOT_FOUND: job not found'; end if;
  if v_job.status = 'cancelled' then return jsonb_build_object('job_id', v_job.id, 'status', 'cancelled', 'version', v_job.version, 'replayed', true); end if;
  if v_job.status in ('picked_up', 'at_drop', 'delivered') then raise exception 'OL_PICKED_UP: the order is already picked up (%)', v_job.status; end if;
  if p_expected is not null and v_job.version <> p_expected then raise exception 'OL_STALE: this job was already changed'; end if;

  update public.delivery_assignments set outcome = 'withdrawn', answered_at = now(), reason = 'job cancelled' where job_id = p_job and outcome is null;
  update public.delivery_jobs set status = 'cancelled', cancel_reason = left(p_reason, 200), version = version + 1 where id = p_job returning * into v_job;
  insert into public.delivery_events (job_id, kind, meta)
  values (p_job, 'delivery.cancelled', jsonb_build_object('request_id', p_request_id, 'actor', 'order_flow', 'reason', p_reason, 'rider_id', v_job.rider_id));
  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'version', v_job.version, 'replayed', false);
end;
$$;
comment on function public.dispatch_cancel(uuid, text, int, text) is 'Cancels a job before pickup and withdraws any live offer. After pickup it refuses and the order flow raises an exception instead.';

-- Released jobs that need the next step: a lapsed offer, or no live offer and no escalation yet.
-- A scheduler (or the next rider read) passes each to dispatch_offer_next.
create or replace function public.dispatch_due_jobs(p_limit int default 50)
returns setof uuid
language sql stable
set search_path = public, pg_temp
as $$
  select j.id from public.delivery_jobs j
   where j.status in ('created', 'offered') and j.released_at is not null and j.escalated_at is null
     and (exists (select 1 from public.delivery_assignments a where a.job_id = j.id and a.outcome is null and a.expires_at <= now())
          or not exists (select 1 from public.delivery_assignments a where a.job_id = j.id and a.outcome is null))
   order by j.created_at limit p_limit
$$;
comment on function public.dispatch_due_jobs(int) is 'Released jobs that need the next step: a lapsed offer, or no live offer and no escalation yet.';

revoke all on function public.dispatch_create_job(jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_offer_next(uuid, text) from public, anon, authenticated;
revoke all on function public.dispatch_release(uuid, int, int, text) from public, anon, authenticated;
revoke all on function public.dispatch_answer(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.dispatch_cancel(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.dispatch_due_jobs(int) from public, anon, authenticated;
grant execute on function public.dispatch_create_job(jsonb) to service_role;
grant execute on function public.dispatch_offer_next(uuid, text) to service_role;
grant execute on function public.dispatch_release(uuid, int, int, text) to service_role;
grant execute on function public.dispatch_answer(uuid, uuid, boolean, text, text) to service_role;
grant execute on function public.dispatch_cancel(uuid, text, int, text) to service_role;
grant execute on function public.dispatch_due_jobs(int) to service_role;

commit;
