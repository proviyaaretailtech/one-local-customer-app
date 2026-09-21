-- 0022 VINII Partner (restaurant order-accepting app) — see docs/PRD_VINII_PARTNER_V1.md.
-- Adds only One Local tables/columns; POS tables are used as they are
-- (orders, order_items, order_events, kot_tickets, item_channel_status with channel 'one_local').

begin;

create table public.ol_merchant_channels (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,
  store_id              text references public.ol_stores(id) on delete set null,
  accepting             boolean not null default false,
  back_at               timestamptz,
  accept_window_seconds int not null default 60 check (accept_window_seconds between 15 and 600),
  default_prep_minutes  int not null default 20 check (default_prep_minutes between 5 and 120),
  missed_in_a_row       int not null default 0 check (missed_in_a_row >= 0),
  auto_pause_after      int not null default 3 check (auto_pause_after between 1 and 20),
  address               text,
  lat                   double precision,
  lng                   double precision,
  city_id               text not null default 'latur' references public.ol_service_areas(city_id),
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now()
);
comment on table  public.ol_merchant_channels is 'One Local as a sales channel for a VINII POS restaurant: whether it is taking One Local orders and how. Stands in for a one_local row in channel_integrations until the OS allows that channel.';
comment on column public.ol_merchant_channels.organization_id       is 'The restaurant (OS organization).';
comment on column public.ol_merchant_channels.store_id              is 'Its storefront in One Local, if listed.';
comment on column public.ol_merchant_channels.accepting             is 'True while the restaurant takes One Local orders.';
comment on column public.ol_merchant_channels.back_at               is 'When a paused restaurant plans to accept again (shown to customers).';
comment on column public.ol_merchant_channels.accept_window_seconds is 'How long staff have to accept a new order before it is cancelled.';
comment on column public.ol_merchant_channels.default_prep_minutes  is 'Prep time pre-selected when accepting.';
comment on column public.ol_merchant_channels.missed_in_a_row       is 'Orders that timed out consecutively; reset by any accept or reject.';
comment on column public.ol_merchant_channels.auto_pause_after      is 'Missed orders in a row that switch accepting off automatically.';
comment on column public.ol_merchant_channels.address               is 'Pickup address shown to customers and riders.';
comment on column public.ol_merchant_channels.lat                   is 'Latitude of the restaurant (for delivery distance).';
comment on column public.ol_merchant_channels.lng                   is 'Longitude of the restaurant.';
comment on column public.ol_merchant_channels.city_id               is 'City where the restaurant sells on One Local.';
comment on column public.ol_merchant_channels.updated_by            is 'Staff member who last changed these settings.';
comment on column public.ol_merchant_channels.updated_at            is 'When these settings last changed (set automatically).';
create trigger ol_merchant_channels_updated_at before update on public.ol_merchant_channels for each row execute function public.set_updated_at();

create table public.ol_partner_devices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null check (platform in ('ios','android','web')),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
comment on table  public.ol_partner_devices is 'Staff phones that ring for new One Local orders (VINII Partner app).';
comment on column public.ol_partner_devices.id              is 'Device registration id.';
comment on column public.ol_partner_devices.organization_id is 'Restaurant the phone rings for.';
comment on column public.ol_partner_devices.user_id         is 'Staff member signed in on the phone.';
comment on column public.ol_partner_devices.expo_push_token is 'Expo push token; removed when Expo reports it is no longer registered.';
comment on column public.ol_partner_devices.platform        is 'ios, android or web.';
comment on column public.ol_partner_devices.last_seen_at    is 'Last time the app checked in.';
comment on column public.ol_partner_devices.created_at      is 'When the phone was registered.';
create index ol_partner_devices_org on public.ol_partner_devices (organization_id);

alter table public.ol_orders
  add column organization_id     uuid references public.organizations(id) on delete set null,
  add column restaurant_deadline timestamptz,
  add column prep_minutes        int check (prep_minutes between 5 and 120),
  add column gst                 numeric(10,2) not null default 0,
  add column cancel_reason       text;
comment on column public.ol_orders.organization_id     is 'Restaurant the order was sent to (restaurant orders only).';
comment on column public.ol_orders.restaurant_deadline is 'Accept-by time; unanswered orders are cancelled after it.';
comment on column public.ol_orders.prep_minutes        is 'Prep time the restaurant chose when accepting.';
comment on column public.ol_orders.gst                 is 'GST charged on restaurant food, in INR.';
comment on column public.ol_orders.cancel_reason       is 'Why the order was cancelled (rejected with reason, or restaurant did not respond).';
create index ol_orders_org_status on public.ol_orders (organization_id, status, created_at desc) where organization_id is not null;

do $$
declare t text;
begin
  foreach t in array array['ol_merchant_channels','ol_partner_devices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

commit;
