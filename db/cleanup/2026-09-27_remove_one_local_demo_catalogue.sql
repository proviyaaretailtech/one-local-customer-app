-- Remove One Local's demo catalogue from production (fresh slate before the Master portal adds
-- real organizations, stores and items). Prepared 27 Sep 2026; TO BE RUN BY THE FOUNDER in the
-- Supabase SQL editor (project ywylhzcxuoeilygzdonx) — the assistant does not delete production data.
--
-- What it removes (all rows are flagged is_demo = true and none is linked to an organization):
--   ol_products 84, ol_reels 3, ol_themed_stores 5, ol_stores 49, ol_brands 46, ol_categories 32,
--   ol_banners 3, ol_coupons 3, ol_events 4, plus ol_discover_chips 8 (sample chips, no demo flag).
--   Total 237 rows.
-- What it keeps: every table and column; ol_service_areas (Latur is a delivery city); all orders,
--   refunds, support requests; everything owned by VINII POS and the OS (organizations, staff,
--   menus, POS orders, roles, modules, platform admins, schema_migrations).
-- Backup taken first: backups/production_public_2026-09-27_1834.json (on the founder's Mac).
-- Undo: re-run the demo seed (`node frontend/scripts/seed-catalog.mjs --production`) or restore from the backup.
--
-- It stops without changing anything if it finds a non-demo row, or if the counts differ from the above.

begin;

do $$
declare n int;
begin
  select count(*) into n from ol_stores where not is_demo or organization_id is not null;
  if n > 0 then raise exception 'Stopped: % store(s) are not demo or are linked to an organization', n; end if;
  select count(*) into n from ol_products where not is_demo;
  if n > 0 then raise exception 'Stopped: % product(s) are not demo', n; end if;
  select (select count(*) from ol_products) + (select count(*) from ol_reels) + (select count(*) from ol_themed_stores)
       + (select count(*) from ol_stores) + (select count(*) from ol_brands) + (select count(*) from ol_categories)
       + (select count(*) from ol_banners) + (select count(*) from ol_coupons) + (select count(*) from ol_events)
       + (select count(*) from ol_discover_chips) into n;
  if n <> 237 then raise exception 'Stopped: expected 237 rows, found % — something changed since 27 Sep; re-check first', n; end if;
end $$;

delete from ol_products      where is_demo;
delete from ol_reels         where is_demo;
delete from ol_themed_stores where is_demo;
delete from ol_stores        where is_demo and organization_id is null;
delete from ol_brands        where is_demo;
delete from ol_categories    where is_demo;
delete from ol_banners       where is_demo;
delete from ol_coupons       where is_demo;
delete from ol_events        where is_demo;
delete from ol_discover_chips;

-- Should all be 0 except ol_service_areas (1).
select 'ol_products' t, count(*) from ol_products union all select 'ol_stores', count(*) from ol_stores
union all select 'ol_brands', count(*) from ol_brands union all select 'ol_categories', count(*) from ol_categories
union all select 'ol_service_areas', count(*) from ol_service_areas;

commit;
