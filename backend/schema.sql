-- One Local Mobile App — Supabase Schema
-- Single source of truth: PostgreSQL with RLS (Row-Level Security)
-- Multi-tenant architecture: customer, rider, merchant, admin roles

-- ============================================================================
-- Users Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  CHECK (role IN ('customer', 'rider', 'merchant', 'admin')),
  phone TEXT,
  name TEXT,
  avatar_url TEXT,
  city TEXT DEFAULT 'latur',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self" ON users
  USING (auth.uid() = id);

-- ============================================================================
-- Categories Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  department TEXT DEFAULT 'grocery',
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Products Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  weight TEXT,
  price FLOAT NOT NULL,
  mrp FLOAT NOT NULL,
  image TEXT,
  category_id TEXT REFERENCES categories(id),
  store_id TEXT,
  delivery_min INT DEFAULT 10,
  discount_pct INT,
  rating FLOAT DEFAULT 4.5,
  department TEXT DEFAULT 'grocery',
  brand_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Stores Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo TEXT,
  tagline TEXT,
  delivery_time TEXT,
  rating FLOAT DEFAULT 4.5,
  tags TEXT[],
  media JSONB,
  department TEXT DEFAULT 'grocery',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_self" ON stores
  USING (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin');

-- ============================================================================
-- Orders Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  subtotal FLOAT NOT NULL,
  discount FLOAT DEFAULT 0,
  delivery_fee FLOAT DEFAULT 0,
  total FLOAT NOT NULL,
  coupon_code TEXT,
  payment_method TEXT DEFAULT 'cod',
  payment_status TEXT DEFAULT 'not_charged',
  CHECK (payment_status IN ('not_charged', 'charged', 'failed')),
  status TEXT DEFAULT 'placed',
  CHECK (status IN ('placed', 'packed', 'out', 'delivered', 'cancelled')),
  rider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rider_name TEXT,
  rider_phone TEXT,
  eta_minutes INT DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_self" ON orders
  USING (auth.uid() = user_id);

CREATE POLICY "orders_rider_assigned" ON orders
  USING (auth.uid() = rider_id OR auth.uid() = user_id);

-- ============================================================================
-- Rides Table (for delivery tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'assigned',
  CHECK (status IN ('assigned', 'picked_up', 'in_transit', 'delivered')),
  pickup_lat FLOAT,
  pickup_lon FLOAT,
  dropoff_lat FLOAT,
  dropoff_lon FLOAT,
  eta_minutes INT DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rides_self" ON rides
  USING (auth.uid() = rider_id);

-- ============================================================================
-- Addresses Table (for delivery)
-- ============================================================================

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  zip TEXT,
  lat FLOAT,
  lon FLOAT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addresses_self" ON addresses
  USING (auth.uid() = user_id);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_rides_rider_id ON rides(rider_id);
CREATE INDEX idx_rides_order_id ON rides(order_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_department ON products(department);
CREATE INDEX idx_stores_department ON stores(department);

-- ============================================================================
-- Realtime Subscriptions (via Supabase Realtime)
-- ============================================================================

-- Enable realtime for important tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE rides;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed Data (Comment out in production)
-- ============================================================================

-- INSERT INTO categories (id, name, emoji, color, department, image)
-- VALUES
--   ('c1', 'Fruits & Veggies', '🥦', 'pastelGreen', 'grocery', 'https://...');
