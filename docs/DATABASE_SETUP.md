# Supabase Database Setup Guide

## 🚀 Quick Start

### 1. Create Supabase Project

1. Go to **https://supabase.com** → Sign up (free)
2. Create new project:
   - **Name:** One Local
   - **Database Password:** (save this!)
   - **Region:** Singapore (closest to India)
3. Wait for database to initialize (~2 min)
4. Copy credentials from **Settings → API**:
   ```
   Project URL: https://ywylhzcxuoeilygzdonx.supabase.co
   Anon Public Key: sb_publishable_jx2WYiDuTQYrfIFd2BdGew_G_xNg1bG
   Service Role Key: (keep this secret!)
   ```

### 2. Update .env File

```bash
# .env (already exists with placeholders)
SUPABASE_URL=https://ywylhzcxuoeilygzdonx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_jx2WYiDuTQYrfIFd2BdGew_G_xNg1bG
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>
```

### 3. Create Database Schema

**Option A: SQL Editor (Fastest)**
1. Open Supabase Dashboard → SQL Editor
2. Paste entire content from `backend/schema.sql`
3. Click **Run**
4. ✅ All tables + RLS policies created

**Option B: CLI (Recommended for teams)**
```bash
npm install -g supabase
supabase init
supabase db push  # Pushes migrations in order
```

### 4. Seed Demo Data

Run the seed script:
```bash
# Copy seed_data.py into backend/
python backend/seed_data.py
```

Expected output:
```
✅ Seeded 50 products
✅ Seeded 8 categories
✅ Seeded 5 stores
✅ Seeded 3 demo users
```

---

## 🗄️ Database Schema Overview

### Core Tables

#### 1. **users** — Authentication + Profiles
```sql
id (UUID)           -- From Supabase Auth
email (TEXT)        -- Unique, required
role (TEXT)         -- customer | rider | merchant | admin
phone (TEXT)        -- Optional
name (TEXT)         -- Optional
avatar_url (TEXT)   -- Cloud storage URL
city (TEXT)         -- Default: 'latur'
created_at          -- Timestamp
```

**RLS Policy:** Users see only their own profile
```sql
-- Users can view/update their own profile
USING (auth.uid() = id)
```

#### 2. **categories** — Product Categories
```sql
id (TEXT)           -- "c1", "c2", etc
name (TEXT)         -- "Fruits & Veggies"
emoji (TEXT)        -- "🥦"
color (TEXT)        -- "pastelGreen" (maps to theme token)
department (TEXT)   -- "grocery", "food", "care", etc
image (TEXT)        -- URL to category image
```

**No RLS:** Public read-only

#### 3. **products** — Inventory
```sql
id (TEXT)
name (TEXT)
weight (TEXT)       -- "500g", "1kg"
price (FLOAT)       -- Selling price
mrp (FLOAT)         -- Max retail price
image (TEXT)        -- Product photo URL
category_id (TEXT)  -- Foreign key: categories.id
store_id (TEXT)     -- Which store sells this
delivery_min (INT)  -- Min delivery time (minutes)
discount_pct (INT)  -- Discount %
rating (FLOAT)      -- 1-5 stars
department (TEXT)   -- "grocery", "food", etc
brand_id (TEXT)     -- Brand name/ID
```

**No RLS:** Public read-only

#### 4. **stores** — Merchants
```sql
id (TEXT)
user_id (UUID)      -- Owner (Foreign key: users.id)
name (TEXT)         -- "Latur Fresh Market"
logo (TEXT)         -- Logo image URL
tagline (TEXT)      -- "Fresh from farm"
delivery_time (TEXT) -- "30-45 mins"
rating (FLOAT)      -- 1-5 stars
tags (TEXT[])       -- ["organic", "fresh"]
media (JSONB)       -- Videos + images
department (TEXT)   -- "grocery", "food", etc
created_at
```

**RLS Policy:** Merchants see/edit only their own store
```sql
USING (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin')
```

#### 5. **orders** — Customer Orders
```sql
id (UUID)           -- Primary key
user_id (UUID)      -- Customer (Foreign key: users.id)
items (JSONB)       -- [{id, name, qty, price, image}]
subtotal (FLOAT)
discount (FLOAT)
delivery_fee (FLOAT)
total (FLOAT)
coupon_code (TEXT)
payment_method (TEXT) -- 'cod', 'upi', 'card', 'netbanking'
payment_status (TEXT) -- 'not_charged', 'charged', 'failed'
status (TEXT)       -- 'placed', 'packed', 'out', 'delivered', 'cancelled'
rider_id (UUID)     -- Assigned delivery rider
rider_name (TEXT)
rider_phone (TEXT)
eta_minutes (INT)
created_at
updated_at
```

**RLS Policies:**
```sql
-- Customers see only their own orders
USING (auth.uid() = user_id)

-- Riders see orders assigned to them
USING (auth.uid() = rider_id)
```

#### 6. **rides** — Delivery Tracking
```sql
id (UUID)
rider_id (UUID)     -- Delivery person
order_id (UUID)     -- Which order (Foreign key: orders.id)
status (TEXT)       -- 'assigned', 'picked_up', 'in_transit', 'delivered'
pickup_lat (FLOAT)  -- Current location
pickup_lon (FLOAT)
dropoff_lat (FLOAT) -- Destination
dropoff_lon (FLOAT)
eta_minutes (INT)   -- Time to delivery
created_at
updated_at
```

**RLS Policy:** Riders see only their assigned rides
```sql
USING (auth.uid() = rider_id)
```

#### 7. **addresses** — Delivery Addresses
```sql
id (UUID)
user_id (UUID)      -- Owner (Foreign key: users.id)
label (TEXT)        -- "Home", "Work", "Mom's place"
street (TEXT)
city (TEXT)
state (TEXT)
zip (TEXT)
lat (FLOAT)         -- For map
lon (FLOAT)
is_default (BOOLEAN)
created_at
```

**RLS Policy:** Users see/edit only their own addresses
```sql
USING (auth.uid() = user_id)
```

---

## 🔐 Row-Level Security (RLS)

**What is RLS?** Database-level security that filters rows based on user identity.

**Example:**
```sql
-- User A cannot see User B's orders, even if they guess the API
SELECT * FROM orders WHERE user_id = auth.uid();
-- ✅ Returns only User A's orders
-- ❌ Returns nothing if accessed by User B
```

**Status:** All critical tables have RLS enabled
- ✅ users
- ✅ orders
- ✅ rides
- ✅ addresses
- ✅ stores
- ❌ products (public read-only)
- ❌ categories (public read-only)

---

## 🔄 Realtime Subscriptions

**Enabled tables:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE rides;
```

**How it works:**

1. **Frontend subscribes:**
```typescript
const { orders } = useRealtimeOrders(userId);
```

2. **Backend updates order:**
```sql
UPDATE orders SET status = 'packed' WHERE id = '...';
```

3. **Frontend gets notified instantly** (< 500ms)
```typescript
orders[0].status === 'packed'  // ✅ Auto-updated
```

---

## 🌱 Seed Data

### Create Demo Users
```sql
-- Customer
INSERT INTO auth.users (id, email, password) VALUES
  ('user-1', 'customer@example.com', 'hashed_password');

-- Rider
INSERT INTO users (id, email, role, name)
  VALUES ('rider-1', 'rider@example.com', 'rider', 'Suraj');

-- Merchant
INSERT INTO users (id, email, role, name)
  VALUES ('merchant-1', 'shop@example.com', 'merchant', 'Latur Fresh');
```

### Seed Products
```python
# backend/seed_data.py
products = [
  {
    "id": "p1",
    "name": "Organic Tomatoes",
    "weight": "500g",
    "price": 40,
    "mrp": 50,
    "category_id": "c1",
    "department": "grocery",
  },
  # ... more products
]
supabase.table("products").insert(products).execute()
```

### Run Seed Script
```bash
cd backend
python seed_data.py
```

---

## 🔌 Backend Connection

### Python (FastAPI)
```python
from supabase import create_client

supabase = create_client(
  os.environ['SUPABASE_URL'],
  os.environ['SUPABASE_ANON_KEY']
)

# Fetch products
response = supabase.table('products').select('*').execute()
print(response.data)  # List of products

# Insert order
new_order = {
  'user_id': user_id,
  'items': [...],
  'total': 450,
}
supabase.table('orders').insert(new_order).execute()

# Realtime subscription
channel = supabase.channel('orders').on(
  'postgres_changes',
  { 'event': 'UPDATE', 'schema': 'public', 'table': 'orders' },
  lambda payload: print('Order updated:', payload)
).subscribe()
```

### JavaScript (Frontend)
```typescript
import { supabase } from './lib/supabase'

// Fetch
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('department', 'grocery')

// Insert
const { data: order } = await supabase
  .from('orders')
  .insert({ user_id, items, total })

// Realtime
const subscription = supabase
  .channel(`orders-${userId}`)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'orders' },
    (payload) => setOrder(payload.new)
  )
  .subscribe()
```

---

## 🧪 Testing Queries

### Supabase SQL Editor

```sql
-- 1. Get all products in grocery department
SELECT * FROM products WHERE department = 'grocery' LIMIT 10;

-- 2. Get customer's orders with status
SELECT id, status, total, created_at 
FROM orders 
WHERE user_id = auth.uid() 
ORDER BY created_at DESC;

-- 3. Count orders by status
SELECT status, COUNT(*) as count 
FROM orders 
WHERE user_id = auth.uid()
GROUP BY status;

-- 4. Get active riders
SELECT id, name, phone FROM users 
WHERE role = 'rider' 
AND created_at > NOW() - INTERVAL '30 days';

-- 5. Top-selling products
SELECT product_id, SUM(qty) as total_sold 
FROM (SELECT jsonb_array_elements(items) as item 
      FROM orders 
      WHERE status = 'delivered') 
GROUP BY product_id 
ORDER BY total_sold DESC 
LIMIT 10;
```

---

## 📊 Database Performance

### Indexes (Auto-created)
```sql
-- Queries by user
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Filter by status
CREATE INDEX idx_orders_status ON orders(status);

-- Latest orders first
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Category browsing
CREATE INDEX idx_products_category ON products(category_id);

-- Department filtering
CREATE INDEX idx_products_department ON products(department);
```

### Expected Performance
- Single row lookup: < 10ms
- Category with 100 products: < 50ms
- User's 100 orders: < 100ms
- Realtime update notification: < 500ms

---

## 🆘 Troubleshooting

### Issue: "RLS policy denies access"
**Cause:** User trying to access other users' data
**Fix:** Check RLS policies — they should only return rows where `auth.uid()` matches

### Issue: "Realtime not updating"
**Cause:** Table not in `supabase_realtime` publication
**Fix:** Run:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

### Issue: "Connection refused"
**Cause:** SUPABASE_URL or keys wrong
**Fix:** Verify in `.env`:
```
SUPABASE_URL=https://ywylhzcxuoeilygzdonx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_jx2WYiDuTQYrfIFd2BdGew_G_xNg1bG
```

### Issue: "Auth users table doesn't exist"
**Cause:** Supabase Auth not initialized
**Fix:** Go to Supabase Dashboard → Auth → Enable Auth

---

## ✅ Verification Checklist

- [ ] Supabase project created
- [ ] `.env` updated with URL + keys
- [ ] Schema migrated (`schema.sql` executed)
- [ ] Demo data seeded
- [ ] RLS policies verified
- [ ] Realtime subscriptions enabled
- [ ] Backend connects successfully
- [ ] Frontend Supabase client working
- [ ] Can read products (public)
- [ ] Can read own orders (RLS protected)
- [ ] Can receive realtime updates

---

## 🚀 Next Steps

1. **Test locally:** Run backend + frontend with Supabase
2. **Verify RLS:** Try accessing other users' data (should fail)
3. **Test realtime:** Update order status, see live update
4. **Seed production data:** Create categories + products for Latur
5. **Scale:** Monitor database performance, add more indexes if needed

---

**Database is ready! 🎉**
