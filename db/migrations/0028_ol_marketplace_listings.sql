-- 0028 (DRAFT) Marketplace listings: a One Local store page approved by the Master.
-- DRAFT — the number is a placeholder; the OS repo ledger (Repo-1-) assigns the real one. NOT APPLIED
-- to any database. Needs the founder's approval. See docs/MASTER_CONTRACT_V1.md.
--
-- Why (founder, 27 Sep 2026): one source of truth. The marketplace shows the same item rows the POS
-- uses (menu_categories / menu_items / item_channel_status with channel 'one_local'); what One Local
-- adds is the listing itself — which organization and outlet, department, city, map point, delivery
-- radius, cover image — and a super admin's approval before it goes live. That is an ol_stores row.
--   1. ol_stores.status: draft / pending / live / paused. The default 'live' keeps every existing row
--      visible exactly as today; rows the Master creates start as 'pending'.
--   2. ol_stores.location_id, cover_image, lat, lng, delivery_radius_km: the outlet, the cover photo
--      and where the store delivers from and how far.
--   3. ol_stores.approved_by / approved_at: who switched the listing live, and when.
--   4. ol_stores.updated_at (+ trigger): when the listing last changed. Not in the first draft of the
--      contract, which returns updated_at but had no column for it.
--   5. One live listing per organization and outlet; an index for "listings in this city by status".
-- The pickup address stays in ol_merchant_channels (address, lat, lng, store_id already exist there).
-- All additive: new nullable columns, one column with a default, two indexes and a trigger. Nothing
-- is dropped or rewritten. Master-created rows always set is_demo = false explicitly.
--
-- Until this is applied the server keeps working (frontend/server/marketplace.ts,
-- listingColumnsReady): the Master's listing endpoints answer 503 "Apply migration 0028 first" and
-- the catalogue reads every existing row as live, exactly as before.

begin;

alter table public.ol_stores
  add column if not exists status text not null default 'live'
    constraint ol_stores_status_check check (status in ('draft', 'pending', 'live', 'paused')),
  add column if not exists location_id        uuid references public.locations(id) on delete set null,
  add column if not exists cover_image        text,
  add column if not exists lat                double precision,
  add column if not exists lng                double precision,
  add column if not exists delivery_radius_km numeric(5,2),
  add column if not exists approved_by        uuid references auth.users(id) on delete set null,
  add column if not exists approved_at        timestamptz,
  add column if not exists updated_at         timestamptz not null default now();

comment on column public.ol_stores.status             is 'Listing state: draft, pending (waiting for approval), live (customers see it) or paused. Only live rows are shown. Existing rows default to live.';
comment on column public.ol_stores.location_id        is 'The OS outlet (locations) this listing sells from, when the organization has more than one.';
comment on column public.ol_stores.cover_image        is 'Public URL of the store page cover image.';
comment on column public.ol_stores.lat                is 'Latitude the store delivers from.';
comment on column public.ol_stores.lng                is 'Longitude the store delivers from.';
comment on column public.ol_stores.delivery_radius_km is 'How far the store delivers, in km. Empty = the city''s service area.';
comment on column public.ol_stores.approved_by        is 'Platform admin who last switched the listing live.';
comment on column public.ol_stores.approved_at        is 'When the listing was last switched live.';
comment on column public.ol_stores.updated_at         is 'When the row last changed (set automatically).';

create or replace trigger ol_stores_updated_at
  before update on public.ol_stores
  for each row execute function public.set_updated_at();

-- One live listing per organization and outlet. A listing without an outlet counts as its own
-- outlet (coalesce), so an organization cannot have two live outlet-less listings either.
create unique index if not exists ol_stores_one_live_listing
  on public.ol_stores (organization_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'live' and deleted_at is null and organization_id is not null;

create index if not exists ol_stores_city_status on public.ol_stores (city_id, status);

commit;
