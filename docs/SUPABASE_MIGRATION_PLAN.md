# MongoDB → Supabase Migration Plan

## Scope
Transfer the existing One Latur backend from the local FastAPI + MongoDB + in-memory sample-data model into a single Supabase PostgreSQL database. The goal is one shared Commerce OS that serves the customer app, merchant apps, rider apps, and Master/TV dashboard.

---

## 1. Current Data Inventory

### 1.1 MongoDB collections (persisted at runtime)

| Collection | Purpose | Records | Migration priority |
|---|---|---|---|
| `orders` | Sample customer orders | Runtime only | High (becomes real order history) |
| `booking_enquiries` | Demo movie/event/activity enquiries | Runtime only | Medium |
| `support_requests` | Help/support messages | Runtime only | Medium |
| `assistant_sessions` | AI chat session history | Runtime only | Medium |
| `catalog_assets` | Managed media asset metadata (images, reels) | Seeded | High (move to Supabase Storage + metadata table) |
| `ai_usage` | Hourly AI search budget counter | Runtime only | Low |
| `search_uploads` | Private photo/voice search uploads | Runtime only | Low |

### 1.2 In-memory / hard-coded catalogue modules

These are NOT in MongoDB today. They are Python lists that must become database tables in Supabase.

| Source file | Data | Supabase table |
|---|---|---|
| `catalog_data.py` | Categories, brands, products, banners, coupons, stores, events, reels | `categories`, `brands`, `products`, `banners`, `coupons`, `merchants`, `events`, `reels` |
| `city_catalog.py` | Additional city brands/products/categories/reels | Same tables above |
| `store_catalog.py` | Themed store categories/products/brands/stores | `collections`, `collection_items`, `products`, `brands`, `categories` |

---

## 2. Supabase Table Mapping

### 2.1 Core Commerce OS tables

```sql
-- Organizations / Merchants
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('store', 'restaurant', 'service', 'warehouse', 'hub')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  logo_url TEXT,
  tagline TEXT,
  rating NUMERIC(3,2) DEFAULT 4.5,
  delivery_time TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Locations per organization
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  pincode TEXT,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Brands (product brands, also used for brand spotlights)
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  logo_url TEXT,
  image_url TEXT,
  tagline TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  image_url TEXT,
  parent_id TEXT REFERENCES categories(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Products
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  weight TEXT,
  price NUMERIC(12,2) NOT NULL,
  mrp NUMERIC(12,2),
  discount_pct INTEGER,
  image_url TEXT,
  category_id TEXT REFERENCES categories(id),
  brand_id TEXT REFERENCES brands(id),
  organization_id UUID REFERENCES organizations(id),
  department TEXT NOT NULL,
  delivery_min INTEGER DEFAULT 15,
  rating NUMERIC(3,2) DEFAULT 4.5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Banners / home promos
CREATE TABLE banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  bg_color TEXT,
  department TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Discover / home chips
CREATE TABLE discover_chips (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  filter_key TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Coupons
CREATE TABLE coupons (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('flat', 'pct')),
  value NUMERIC(12,2) NOT NULL,
  min_order NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  max_uses INTEGER,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events (Book It)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('movies', 'events', 'activities')),
  subtitle TEXT,
  venue TEXT,
  price NUMERIC(12,2),
  image_url TEXT,
  tag TEXT,
  slots TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reels
CREATE TABLE reels (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  brand_id TEXT REFERENCES brands(id),
  video_url TEXT NOT NULL,
  video_web_url TEXT,
  caption TEXT,
  creator TEXT,
  likes INTEGER DEFAULT 0,
  tag TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Themed collections / stores
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  eyebrow TEXT,
  icon TEXT,
  image_url TEXT,
  department TEXT,
  sections TEXT[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0
);
```

### 2.2 User & identity tables

```sql
-- Customer profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'merchant', 'rider', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Saved addresses
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT,
  address TEXT NOT NULL,
  city TEXT,
  pincode TEXT,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 Order & transaction tables

```sql
-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  address_id UUID REFERENCES addresses(id),
  organization_id UUID REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'paid', 'accepted', 'preparing', 'packed', 'ready', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'refunded')),
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) DEFAULT 0,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  coupon_code TEXT REFERENCES coupons(code),
  payment_method TEXT,
  payment_status TEXT DEFAULT 'not_charged' CHECK (payment_status IN ('not_charged', 'pending', 'paid', 'failed', 'refunded')),
  rider_name TEXT,
  rider_phone TEXT,
  eta_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  name TEXT NOT NULL,
  weight TEXT,
  price NUMERIC(12,2) NOT NULL,
  mrp NUMERIC(12,2),
  image_url TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0)
);

-- Order status history (audit)
CREATE TABLE order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id UUID,
  actor_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 Booking & support tables

```sql
-- Booking enquiries (from MongoDB booking_enquiries)
CREATE TABLE booking_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  event_id TEXT REFERENCES events(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  event_date DATE NOT NULL,
  slot TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 8),
  status TEXT DEFAULT 'demo_enquiry_saved',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Support tickets (from MongoDB support_requests)
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  reference TEXT,
  status TEXT DEFAULT 'saved_for_review',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.5 AI & media tables

```sql
-- AI assistant sessions (from MongoDB assistant_sessions)
CREATE TABLE assistant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  messages JSONB DEFAULT '[]'::jsonb,
  busy_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI usage logs (from MongoDB ai_usage)
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Search uploads metadata (files go to Supabase Storage)
CREATE TABLE search_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  storage_path TEXT NOT NULL,
  content_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Media asset registry (replaces MongoDB catalog_assets)
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  storage_path TEXT NOT NULL,
  source_url TEXT,
  content_type TEXT,
  owner_type TEXT,
  owner_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.6 Future V1 ecosystem tables (to be activated)

```sql
-- Fulfilment / delivery
CREATE TABLE delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  rider_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'created',
  pickup_location JSONB,
  drop_location JSONB,
  route JSONB,
  eta_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory (foundation for V2)
CREATE TABLE inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT REFERENCES products(id),
  organization_id UUID REFERENCES organizations(id),
  location_id UUID REFERENCES locations(id),
  available INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscriptions / entitlements (Master Control Plane)
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'INR',
  interval TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  plan_id TEXT REFERENCES plans(id),
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Data Transformation Rules

### 3.1 Orders
- Map `Order.id` (UUID string) → `orders.id` (UUID)
- Split `items` array into `order_items` rows
- Set `payment_status` = 'not_charged' (sample orders)
- Add `profile_id` = NULL for anonymous orders (to be linked later via phone)

### 3.2 Catalogue (hard-coded → database)
- Import all `BRANDS`, `CITY_BRANDS`, `STORE_BRANDS` into `brands`
- Import `CATEGORIES`, `EXTRA_CATEGORIES`, `CITY_CATEGORIES`, `STORE_CATEGORIES` into `categories`
- Import `PRODUCTS`, `EXTRA_PRODUCTS`, `CITY_PRODUCTS`, `STORE_PRODUCTS` into `products`
- Convert legacy external Unsplash URLs to Supabase Storage keys or keep as-is for migration
- Map `store_id` → `organization_id` (create organizations for s1, s2, s3 and brand IDs used as stores)

### 3.3 Media
- Move files from current managed storage proxy into Supabase Storage buckets:
  - `public/catalog/` — product/store/banner images
  - `private/search/` — AI search uploads
- Replace `/api/media/{key}` references with Supabase Storage public URLs
- Drop `media_store.py` proxy after migration

### 3.4 Assistant sessions
- Convert Mongo `messages` array to PostgreSQL `JSONB`
- `busy_until` timestamp moved as-is

### 3.5 What to discard
- `ai_usage` hourly counter → replaced by `ai_usage_logs` with per-user/feature tracking
- `search_uploads` binary files → move to Supabase Storage; table keeps only metadata
- In-memory `COUPONS`, `BANNERS`, `DISCOVER_CHIPS` → seed into tables once, then admin-managed

---

## 4. Migration Execution Plan

### Phase A — Schema (Week 1)
1. Create Supabase project
2. Run all `CREATE TABLE` statements via Supabase SQL Editor or migrations
3. Set up Row Level Security policies for `profiles`, `orders`, `addresses`
4. Create Storage buckets: `catalog`, `search-uploads`, `delivery-proofs`

### Phase B — Seed static data (Week 1–2)
1. Write seed script to import categories, brands, products, banners, coupons, events, reels, collections from Python files
2. Upload images to Supabase Storage
3. Update product/store image URLs to Supabase public URLs

### Phase C — Migrate runtime MongoDB data (Week 2)
1. Export `orders`, `booking_enquiries`, `support_requests`, `assistant_sessions` from Mongo
2. Transform and insert into PostgreSQL
3. Verify record counts

### Phase D — Rewire frontend (Week 2–3)
1. Replace `backend/api.ts` calls with Supabase client
2. Replace `CartProvider` AsyncStorage with Supabase / remote cart table
3. Add auth flow (phone OTP) and profile creation
4. Update `use-catalog.ts` to read from Supabase

### Phase E — Sunset FastAPI backend (Week 3–4)
1. Move AI assistant logic to Supabase Edge Function
2. Move image/voice search to Edge Function
3. Move coupon validation to Edge Function or database function
4. Delete `backend/server.py`, `catalog_data.py`, Mongo dependency

---

## 5. Row Level Security — Minimum Required

```sql
-- Profiles: users can only read/edit their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their profile" ON profiles
  USING (id = auth.uid());

-- Orders: customers see their own; merchants see orders for their organization
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers see own orders" ON orders
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Merchants see org orders" ON orders
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Addresses: own only
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own addresses" ON addresses
  USING (profile_id = auth.uid());
```

---

## 6. Next Immediate Steps

1. Confirm this table design or provide your existing Supabase table list
2. I will generate the exact `CREATE TABLE` SQL for your Supabase project
3. I will create the seed migration script from the Python catalogue files
4. I will set up the Supabase client in the React Native frontend

Send your Supabase tables when ready and I will reconcile them with this plan.
