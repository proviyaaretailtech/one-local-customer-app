-- 0021 One Local core tables. Replaces the 14 empty first-draft ol_* tables.
-- Rules:
--   * Every table is prefixed ol_ and lives in public next to the OS/POS tables, which are never altered.
--   * Every table and column has a COMMENT.
--   * Row-level security is ON with no policies, and anon/authenticated have no grants:
--     only One Local's server (service role) can read or write these tables.
--   * Links to OS/POS tables (organizations, menu_items, orders, auth.users) are nullable, ON DELETE SET NULL.
-- It refuses to drop any draft table that has gained rows.

begin;

do $$
declare t text; n bigint;
begin
  foreach t in array array['ol_banners','ol_booking_enquiries','ol_brands','ol_catalog_assets','ol_categories','ol_coupons',
                           'ol_discover_chips','ol_events','ol_orders','ol_products','ol_reels','ol_stores',
                           'ol_support_requests','ol_themed_stores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then raise exception 'Refusing to drop public.% — it has % rows', t, n; end if;
      execute format('drop table public.%I cascade', t);
    end if;
  end loop;
end $$;

create table public.ol_service_areas (
  city_id    text primary key,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius_km  numeric(6,2) not null check (radius_km > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table  public.ol_service_areas is 'Cities One Local delivers in: a centre and radius for now. Adding a city is a new row, not new code.';
comment on column public.ol_service_areas.city_id    is 'Short id used everywhere as city_id, e.g. latur.';
comment on column public.ol_service_areas.name       is 'Display name.';
comment on column public.ol_service_areas.lat        is 'Latitude of the city centre.';
comment on column public.ol_service_areas.lng        is 'Longitude of the city centre.';
comment on column public.ol_service_areas.radius_km  is 'Delivery radius from the centre, in km.';
comment on column public.ol_service_areas.active     is 'False hides the city from customers.';
comment on column public.ol_service_areas.created_at is 'When the row was created.';

create table public.ol_categories (
  id text primary key, name text not null, emoji text not null default '', color text,
  department text not null, image text not null default '', sort_order int not null default 0,
  is_demo boolean not null default true, created_at timestamptz not null default now()
);
comment on table  public.ol_categories is 'Product categories shown in departments (Fruits, Burgers, Skincare...). Shared by all cities.';
comment on column public.ol_categories.id         is 'Stable id used by products (e.g. c9).';
comment on column public.ol_categories.name       is 'Display name.';
comment on column public.ol_categories.emoji      is 'Legacy emoji; usually empty.';
comment on column public.ol_categories.color      is 'Design colour token for the tile.';
comment on column public.ol_categories.department is 'food, grocery, pharmacy, beauty or shops.';
comment on column public.ol_categories.image      is 'Media path (/api/media/<key>).';
comment on column public.ol_categories.sort_order is 'Display order, smallest first.';
comment on column public.ol_categories.is_demo    is 'True for the sample catalogue; lets demo rows be hidden in one step.';
comment on column public.ol_categories.created_at is 'When the row was created.';

create table public.ol_brands (
  id text primary key, name text not null, department text, logo text not null default '',
  image text not null default '', tagline text not null default '',
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, created_at timestamptz not null default now()
);
comment on table  public.ol_brands is 'Brands and merchants whose products are listed (McDonald''s, Amul, Nike...).';
comment on column public.ol_brands.id         is 'Stable id; also the brand storefront id.';
comment on column public.ol_brands.name       is 'Display name.';
comment on column public.ol_brands.department is 'Department the brand sells in.';
comment on column public.ol_brands.logo       is 'Media path of the logo.';
comment on column public.ol_brands.image      is 'Media path of the hero image.';
comment on column public.ol_brands.tagline    is 'One-line brand message.';
comment on column public.ol_brands.city_id    is 'City this brand is listed in. Customers only see their own city.';
comment on column public.ol_brands.is_demo    is 'True for the sample catalogue.';
comment on column public.ol_brands.created_at is 'When the row was created.';

create table public.ol_stores (
  id text primary key, name text not null, logo text, tagline text, delivery_time text,
  rating numeric(3,2) not null default 4.5 check (rating between 0 and 5),
  tags text[] not null default '{}', department text, media jsonb not null default '[]',
  organization_id uuid references public.organizations(id) on delete set null,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_stores is 'Storefronts customers order from. When a store is a real VINII POS restaurant, organization_id links it to that merchant.';
comment on column public.ol_stores.id              is 'Stable store id.';
comment on column public.ol_stores.name            is 'Display name.';
comment on column public.ol_stores.logo            is 'Media path of the logo.';
comment on column public.ol_stores.tagline         is 'Short promise line.';
comment on column public.ol_stores.delivery_time   is 'Human text such as "25 min".';
comment on column public.ol_stores.rating          is 'Average rating, 0 to 5.';
comment on column public.ol_stores.tags            is 'Free-form labels.';
comment on column public.ol_stores.department      is 'Department the store belongs to.';
comment on column public.ol_stores.media           is 'Gallery: list of {type, url, thumbnail, video_web}.';
comment on column public.ol_stores.organization_id is 'The VINII POS merchant behind this store, when it is a real one.';
comment on column public.ol_stores.city_id         is 'City this store serves. Customers only see their own city.';
comment on column public.ol_stores.is_demo         is 'True for the sample catalogue.';
comment on column public.ol_stores.sort_order      is 'Display order, smallest first.';
comment on column public.ol_stores.created_at      is 'When the row was created.';

create table public.ol_products (
  id text primary key, name text not null, weight text not null default '',
  price numeric(10,2) not null check (price >= 0), mrp numeric(10,2) not null check (mrp >= price),
  image text not null default '', category_id text references public.ol_categories(id),
  store_id text, brand_id text, department text not null, delivery_min int not null default 15,
  discount_pct int, rating numeric(3,2) not null default 4.5, is_available boolean not null default true,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_products is 'Sellable items, prices in rupees. A product that comes from a VINII POS menu links to it through menu_item_id.';
comment on column public.ol_products.id           is 'Stable product id (also used in order lines and saved carts).';
comment on column public.ol_products.name         is 'Display name.';
comment on column public.ol_products.weight       is 'Pack size or short description.';
comment on column public.ol_products.price        is 'Selling price in INR.';
comment on column public.ol_products.mrp          is 'Printed maximum retail price in INR (never below price).';
comment on column public.ol_products.image        is 'Media path.';
comment on column public.ol_products.category_id  is 'Category.';
comment on column public.ol_products.store_id     is 'Store that fulfils this item.';
comment on column public.ol_products.brand_id     is 'Brand, if any.';
comment on column public.ol_products.department   is 'Department for tab filtering.';
comment on column public.ol_products.delivery_min is 'Estimated delivery minutes.';
comment on column public.ol_products.discount_pct is 'Discount shown on the card; empty when none.';
comment on column public.ol_products.rating       is 'Average rating, 0 to 5.';
comment on column public.ol_products.is_available is 'False hides the item without deleting it.';
comment on column public.ol_products.menu_item_id is 'The VINII POS menu item this mirrors, for restaurant items.';
comment on column public.ol_products.city_id      is 'City this item is sold in.';
comment on column public.ol_products.is_demo      is 'True for the sample catalogue.';
comment on column public.ol_products.sort_order   is 'Display order, smallest first.';
comment on column public.ol_products.created_at   is 'When the row was created.';
create index ol_products_city_department on public.ol_products (city_id, department);
create index ol_products_store on public.ol_products (store_id);

create table public.ol_banners (
  id text primary key, title text not null, subtitle text, image text, bg text,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_banners is 'Home-screen promotional banners, per city.';
comment on column public.ol_banners.id         is 'Stable id.';
comment on column public.ol_banners.title      is 'Headline.';
comment on column public.ol_banners.subtitle   is 'Supporting line.';
comment on column public.ol_banners.image      is 'Media path.';
comment on column public.ol_banners.bg         is 'Background colour token.';
comment on column public.ol_banners.city_id    is 'City the banner is shown in.';
comment on column public.ol_banners.is_demo    is 'True for sample content.';
comment on column public.ol_banners.sort_order is 'Display order, smallest first.';
comment on column public.ol_banners.created_at is 'When the row was created.';

create table public.ol_discover_chips (
  id text primary key, label text not null, emoji text, color text, sort_order int not null default 0
);
comment on table  public.ol_discover_chips is 'Quick filters on Discover (Trending, Under 99...). The filter logic lives in the API, keyed by id.';
comment on column public.ol_discover_chips.id         is 'Chip id understood by the products API (d1..d8).';
comment on column public.ol_discover_chips.label      is 'Text on the chip.';
comment on column public.ol_discover_chips.emoji      is 'Optional emoji.';
comment on column public.ol_discover_chips.color      is 'Design colour token.';
comment on column public.ol_discover_chips.sort_order is 'Display order, smallest first.';

create table public.ol_coupons (
  code text primary key, label text not null, kind text not null check (kind in ('flat','pct')),
  value numeric(10,2) not null check (value > 0), min_order numeric(10,2) not null default 0,
  description text not null default '', active boolean not null default true,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, created_at timestamptz not null default now()
);
comment on table  public.ol_coupons is 'Discount codes. City-scoped so a Latur offer cannot be used elsewhere.';
comment on column public.ol_coupons.code        is 'What the customer types, in capitals.';
comment on column public.ol_coupons.label       is 'Short display label.';
comment on column public.ol_coupons.kind        is 'flat = rupees off, pct = percent off.';
comment on column public.ol_coupons.value       is 'Rupees or percent.';
comment on column public.ol_coupons.min_order   is 'Minimum cart subtotal in INR.';
comment on column public.ol_coupons.description is 'Terms shown to the customer.';
comment on column public.ol_coupons.active      is 'False stops the code working.';
comment on column public.ol_coupons.city_id     is 'City where the code works.';
comment on column public.ol_coupons.is_demo     is 'True for sample codes.';
comment on column public.ol_coupons.created_at  is 'When the row was created.';

create table public.ol_events (
  id text primary key, title text not null, kind text not null check (kind in ('movies','events','activities')),
  subtitle text, venue text, price numeric(10,2), image text, tag text, slots text[] not null default '{}',
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_events is 'Book It listings: movies, events and activities.';
comment on column public.ol_events.id         is 'Stable id.';
comment on column public.ol_events.title      is 'Name.';
comment on column public.ol_events.kind       is 'Type of listing.';
comment on column public.ol_events.subtitle   is 'Genre or format line.';
comment on column public.ol_events.venue      is 'Venue.';
comment on column public.ol_events.price      is 'Price per person in INR.';
comment on column public.ol_events.image      is 'Media path.';
comment on column public.ol_events.tag        is 'Small eyebrow label.';
comment on column public.ol_events.slots      is 'Available time slots.';
comment on column public.ol_events.city_id    is 'City of the listing.';
comment on column public.ol_events.is_demo    is 'True for sample listings.';
comment on column public.ol_events.sort_order is 'Display order, smallest first.';
comment on column public.ol_events.created_at is 'When the row was created.';

create table public.ol_reels (
  id text primary key,
  product_id text references public.ol_products(id) on delete cascade,
  brand_id text references public.ol_brands(id) on delete cascade,
  video text not null, caption text, creator text, likes int not null default 0, tag text,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_reels is 'Short shoppable videos on Discover.';
comment on column public.ol_reels.id         is 'Stable id.';
comment on column public.ol_reels.product_id is 'Product the reel promotes.';
comment on column public.ol_reels.brand_id   is 'Brand behind the reel.';
comment on column public.ol_reels.video      is 'Media path of the video.';
comment on column public.ol_reels.caption    is 'Text under the reel.';
comment on column public.ol_reels.creator    is 'Display creator name.';
comment on column public.ol_reels.likes      is 'Like count.';
comment on column public.ol_reels.tag        is 'Eyebrow label.';
comment on column public.ol_reels.city_id    is 'City the reel is shown in.';
comment on column public.ol_reels.is_demo    is 'True for sample reels.';
comment on column public.ol_reels.sort_order is 'Display order, smallest first.';
comment on column public.ol_reels.created_at is 'When the row was created.';

create table public.ol_themed_stores (
  id text primary key, data jsonb not null,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  is_demo boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table  public.ol_themed_stores is 'Curated themed collections (festive, fitness...), one document each because their shape is presentation-driven.';
comment on column public.ol_themed_stores.id         is 'Stable id (festive, fitness...).';
comment on column public.ol_themed_stores.data       is 'Full collection definition as the app uses it.';
comment on column public.ol_themed_stores.city_id    is 'City the collection is shown in.';
comment on column public.ol_themed_stores.is_demo    is 'True for sample collections.';
comment on column public.ol_themed_stores.sort_order is 'Display order, smallest first.';
comment on column public.ol_themed_stores.created_at is 'When the row was created.';

create table public.ol_media_assets (
  key text primary key, bucket text not null default 'onecity-catalog', path text not null,
  content_type text not null, bytes int, created_at timestamptz not null default now()
);
comment on table  public.ol_media_assets is 'Catalogue images and videos in Supabase Storage. key is what the app asks for (/api/media/<key>).';
comment on column public.ol_media_assets.key          is 'Media key, e.g. burger or legacy-2e7560e3462d3586.';
comment on column public.ol_media_assets.bucket       is 'Storage bucket.';
comment on column public.ol_media_assets.path         is 'Object path inside the bucket.';
comment on column public.ol_media_assets.content_type is 'MIME type.';
comment on column public.ol_media_assets.bytes        is 'File size in bytes.';
comment on column public.ol_media_assets.created_at   is 'When the file was uploaded.';

create table public.ol_orders (
  id uuid primary key default gen_random_uuid(),
  customer_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text,
  payment_method text not null default 'cod' check (payment_method in ('cod','upi','card','netbanking')),
  payment_status text not null default 'not_charged' check (payment_status in ('not_charged','pending','paid','failed','refunded')),
  status text not null default 'placed' check (status in ('placed','accepted','packed','out','delivered','cancelled')),
  rider_name text, rider_phone text, eta_minutes int,
  delivery_address jsonb,
  idempotency_key text,
  pos_order_id uuid references public.orders(id) on delete set null,
  city_id text not null default 'latur' references public.ol_service_areas(city_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table  public.ol_orders is 'Orders placed in One Local. Prices are recomputed by the server. When an order goes to a VINII POS restaurant, pos_order_id links the two.';
comment on column public.ol_orders.id               is 'Order id.';
comment on column public.ol_orders.customer_hash    is 'Hash of the customer identity (signed-in account or device key). Never the raw key.';
comment on column public.ol_orders.user_id          is 'Signed-in customer, when there is one.';
comment on column public.ol_orders.items            is 'Line items at the moment of purchase: id, name, weight, price, mrp, image, qty.';
comment on column public.ol_orders.subtotal         is 'Sum of items in INR.';
comment on column public.ol_orders.discount         is 'Coupon discount in INR.';
comment on column public.ol_orders.delivery_fee     is 'Delivery charge in INR.';
comment on column public.ol_orders.total            is 'Amount payable in INR.';
comment on column public.ol_orders.coupon_code      is 'Coupon applied, if any.';
comment on column public.ol_orders.payment_method   is 'How the customer chose to pay.';
comment on column public.ol_orders.payment_status   is 'Payment state; kept separate from the order state.';
comment on column public.ol_orders.status           is 'Order state shown to the customer.';
comment on column public.ol_orders.rider_name       is 'Delivery partner name, once assigned.';
comment on column public.ol_orders.rider_phone      is 'Delivery partner phone, once assigned.';
comment on column public.ol_orders.eta_minutes      is 'Estimated minutes to delivery.';
comment on column public.ol_orders.delivery_address is 'Snapshot of the delivery address used.';
comment on column public.ol_orders.idempotency_key  is 'Client key that makes retries return the same order.';
comment on column public.ol_orders.pos_order_id     is 'The VINII POS order created for a restaurant, if any.';
comment on column public.ol_orders.city_id          is 'City the order was placed in.';
comment on column public.ol_orders.created_at       is 'When the order was placed.';
comment on column public.ol_orders.updated_at       is 'When the order last changed (set automatically).';
create unique index ol_orders_idempotency on public.ol_orders (customer_hash, idempotency_key) where idempotency_key is not null;
create index ol_orders_customer on public.ol_orders (customer_hash, created_at desc);
create index ol_orders_user on public.ol_orders (user_id, created_at desc) where user_id is not null;
create trigger ol_orders_updated_at before update on public.ol_orders for each row execute function public.set_updated_at();

create table public.ol_booking_enquiries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.ol_events(id),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  date date not null, slot text not null,
  guests int not null check (guests between 1 and 8),
  status text not null default 'demo_enquiry_saved',
  customer_hash text, user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table  public.ol_booking_enquiries is 'Requests to book a Book It slot. An enquiry, not a paid booking.';
comment on column public.ol_booking_enquiries.id            is 'Enquiry id.';
comment on column public.ol_booking_enquiries.event_id      is 'Event asked about.';
comment on column public.ol_booking_enquiries.name          is 'Customer name.';
comment on column public.ol_booking_enquiries.phone         is '10-digit Indian mobile number.';
comment on column public.ol_booking_enquiries.date          is 'Requested date (within 30 days, checked by the API).';
comment on column public.ol_booking_enquiries.slot          is 'Requested slot.';
comment on column public.ol_booking_enquiries.guests        is 'Number of guests.';
comment on column public.ol_booking_enquiries.status        is 'Handling status.';
comment on column public.ol_booking_enquiries.customer_hash is 'Hash of the device or account that asked.';
comment on column public.ol_booking_enquiries.user_id       is 'Signed-in customer, if any.';
comment on column public.ol_booking_enquiries.created_at    is 'When the enquiry was made.';

create table public.ol_support_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('order','payment','profile','other')),
  message text not null check (char_length(message) between 10 and 2000),
  reference text not null default '',
  status text not null default 'saved_for_review',
  customer_hash text, user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table  public.ol_support_requests is 'Help requests raised from the app.';
comment on column public.ol_support_requests.id            is 'Request id.';
comment on column public.ol_support_requests.topic         is 'Topic chosen.';
comment on column public.ol_support_requests.message       is 'What the customer wrote.';
comment on column public.ol_support_requests.reference     is 'Order number or other reference, optional.';
comment on column public.ol_support_requests.status        is 'Handling status.';
comment on column public.ol_support_requests.customer_hash is 'Hash of the device or account that asked.';
comment on column public.ol_support_requests.user_id       is 'Signed-in customer, if any.';
comment on column public.ol_support_requests.created_at    is 'When the request was made.';

-- Lock every ol_ table to the server: RLS on, no policies, no grants to anon/authenticated.
do $$
declare t text;
begin
  foreach t in array array['ol_service_areas','ol_categories','ol_brands','ol_stores','ol_products','ol_banners',
                           'ol_discover_chips','ol_coupons','ol_events','ol_reels','ol_themed_stores','ol_media_assets',
                           'ol_orders','ol_booking_enquiries','ol_support_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

insert into public.ol_service_areas (city_id, name, lat, lng, radius_km)
values ('latur', 'Latur', 18.4088, 76.5604, 15)
on conflict (city_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onecity-catalog', 'onecity-catalog', true, 41943040,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;

commit;
