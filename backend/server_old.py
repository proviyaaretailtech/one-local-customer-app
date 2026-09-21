"""
One Local Mobile App Backend — Phase 1: Supabase Migration
Single source of truth: Supabase (Postgres + Auth + Storage + Realtime)
Shared endpoints for customer, rider, and merchant (POS) apps
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from functools import lru_cache
import hashlib

# Catalogue data modules (the app's read-only source of truth for now)
from catalog_data import image, BRANDS, EXTRA_PRODUCTS, EXTRA_CATEGORIES, EVENTS, REELS
from city_catalog import CITY_BRANDS, CITY_PRODUCTS, CITY_CATEGORIES, CITY_REELS
from store_catalog import STORE_BRANDS, STORE_PRODUCTS, STORE_CATEGORIES, THEMED_STORES
import media_store

# Supabase client
try:
    from supabase import create_client, Client
except ImportError:
    print("⚠️  supabase not installed. Run: pip install supabase")
    raise

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR.parent / '.env')

# Initialize Supabase
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_ANON_KEY')
supabase_service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    raise ValueError("❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")

supabase: Client = create_client(supabase_url, supabase_key)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="One Local Mobile API",
    description="Shared backend for customer, rider, and merchant apps",
    version="1.0.0"
)

# CORS for mobile apps (Expo, native)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")



# ---------- Write store (TEMPORARY, in-memory) ----------
# MongoDB is gone. Until the Postgres repository layer lands (see
# docs/BACKEND_REARCHITECTURE_PLAN.md) writes are held in process memory only and are
# lost on restart. They must NOT go to Supabase: the shared project already has other
# apps' tables (e.g. public.orders) and this code must never touch them.
class _Collection:
    def __init__(self, name):
        self.name = name
        self.memory = []

    async def insert_one(self, doc):
        self.memory.append(doc)
        return doc

    async def find_one(self, query, projection=None):
        key, value = next(iter(query.items()))
        return next((d for d in self.memory if d.get(key) == value), None)

    def find(self, query=None, projection=None):
        return _Cursor(self)


class _Cursor:
    def __init__(self, collection):
        self.collection = collection
        self.key = None
        self.desc = True

    def sort(self, key, direction=-1):
        self.key, self.desc = key, direction < 0
        return self

    async def to_list(self, limit):
        rows = list(self.collection.memory)
        if self.key:
            rows.sort(key=lambda d: str(d.get(self.key) or ""), reverse=self.desc)
        return rows[:limit]


class _DB:
    def __init__(self):
        self._tables = {}

    def __getattr__(self, name):
        return self._tables.setdefault(name, _Collection(name))


db = _DB()
app.state.db = db


# ---------- Locality (city scoping) ----------
# Every listing belongs to one city. A viewer only ever sees their own city's
# listings. The city comes from ?city= or the X-City header (default: latur),
# is validated here, and later will be tied to the signed-in user's profile.
ACTIVE_CITIES = {'latur': 'Latur, Maharashtra'}


def resolve_city(city: Optional[str] = Query(None), x_city: Optional[str] = Header(None)) -> str:
    slug = (city or x_city or 'latur').strip().lower()
    if slug not in ACTIVE_CITIES:
        raise HTTPException(status_code=404, detail="We haven't launched in this city yet")
    return slug


def city_of(item) -> str:
    """City a catalogue item belongs to; the existing sample catalogue is all Latur."""
    if isinstance(item, dict):
        return item.get('city_id') or 'latur'
    return getattr(item, 'city_id', None) or 'latur'


def in_city(items, city):
    return [i for i in items if city_of(i) == city]


# ---------- Models ----------
class Category(BaseModel):
    id: str
    name: str
    emoji: str
    color: str  # pastel token name
    department: str = 'grocery'
    image: str = ''


class Product(BaseModel):
    id: str
    name: str
    weight: str
    price: float
    mrp: float
    image: str
    category_id: str
    store_id: str
    delivery_min: int = 10
    discount_pct: Optional[int] = None
    rating: float = 4.5
    department: str = 'grocery'
    brand_id: str = ''


class StoreMedia(BaseModel):
    type: str  # "video" | "image"
    url: str
    thumbnail: Optional[str] = None
    video_web: Optional[str] = None


class Store(BaseModel):
    id: str
    name: str
    logo: str
    tagline: str
    delivery_time: str
    rating: float
    tags: List[str]
    media: List[StoreMedia]
    department: str = 'grocery'


class Banner(BaseModel):
    id: str
    title: str
    subtitle: str
    image: str
    bg: str  # pastel token name


class Coupon(BaseModel):
    code: str
    label: str
    kind: str  # "flat" | "pct"
    value: float
    min_order: float = 0
    description: str


class OrderItem(BaseModel):
    id: str
    name: str
    weight: str
    price: float
    mrp: float
    image: str
    qty: int


class OrderCreate(BaseModel):
    items: List[OrderItem]
    subtotal: float
    discount: float = 0
    delivery_fee: float = 0
    total: float
    coupon_code: Optional[str] = None
    payment_method: Literal['cod', 'upi', 'card', 'netbanking'] = 'cod'


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    items: List[OrderItem]
    subtotal: float
    discount: float = 0
    delivery_fee: float = 0
    total: float
    coupon_code: Optional[str] = None
    payment_method: Literal['cod', 'upi', 'card', 'netbanking'] = 'cod'
    payment_status: Literal['not_charged'] = 'not_charged'
    status: str = "placed"  # placed | packed | out | delivered
    rider_name: str = "Suraj"
    rider_phone: str = "+91 98765 43210"
    eta_minutes: int = 10
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------- Seed data ----------
CATEGORIES: List[Category] = [
    Category(id="c1", name="Fruits & Veggies", emoji="🥦", color="pastelGreen"),
    Category(id="c2", name="Dairy & Eggs", emoji="🥛", color="pastelYellow"),
    Category(id="c3", name="Snacks", emoji="🍿", color="pastelRed"),
    Category(id="c4", name="Cold Drinks", emoji="🥤", color="pastelBlue"),
    Category(id="c5", name="Bakery", emoji="🍞", color="pastelOrange"),
    Category(id="c6", name="Instant Food", emoji="🍜", color="pastelPurple"),
    Category(id="c7", name="Personal Care", emoji="🧴", color="pastelPink"),
    Category(id="c8", name="Home Needs", emoji="🧺", color="pastelMint"),
]

DISCOVER_CHIPS = [
    {"id": "d1", "label": "Trending", "emoji": "🔥", "color": "pastelRed"},
    {"id": "d2", "label": "New", "emoji": "✨", "color": "pastelYellow"},
    {"id": "d3", "label": "Fresh", "emoji": "🥬", "color": "pastelGreen"},
    {"id": "d4", "label": "Bestseller", "emoji": "⭐", "color": "pastelOrange"},
    {"id": "d5", "label": "Under ₹99", "emoji": "💸", "color": "pastelBlue"},
    {"id": "d6", "label": "Local", "emoji": "📍", "color": "pastelMint"},
    {"id": "d7", "label": "Organic", "emoji": "🌿", "color": "pastelPurple"},
    {"id": "d8", "label": "Combo", "emoji": "🎁", "color": "pastelPink"},
]

BANNERS: List[Banner] = [
    Banner(id="b1", title="10 min grocery", subtitle="Fresh at your door",
           image="https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
           bg="pastelGreen"),
    Banner(id="b2", title="Snacks Sale", subtitle="Up to 40% off",
           image="https://images.unsplash.com/photo-1739065883242-92659253f7a6?w=800",
           bg="pastelYellow"),
    Banner(id="b3", title="Fresh Delivery", subtitle="Rider on the way",
           image="https://images.unsplash.com/photo-1733565823567-ca12618dec46?w=800",
           bg="pastelRed"),
]

COUPONS: List[Coupon] = [
    Coupon(code="LATUR10", label="10% OFF", kind="pct", value=10, min_order=99,
           description="Save 10% on orders above ₹99"),
    Coupon(code="FRESH50", label="₹50 OFF", kind="flat", value=50, min_order=199,
           description="Flat ₹50 off on orders above ₹199"),
    Coupon(code="WELCOME", label="₹25 OFF", kind="flat", value=25, min_order=0,
           description="Welcome offer for new shoppers"),
]

STORES: List[Store] = [
    Store(
        id="s1",
        name="Latur Fresh Mart",
        logo="https://images.unsplash.com/photo-1580913428023-02c695666d61?w=400",
        tagline="Farm to home in 10 mins",
        delivery_time="10 min",
        rating=4.7,
        tags=["Grocery", "Fresh", "Organic"],
        media=[
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                       thumbnail="https://images.unsplash.com/photo-1542838132-92c53300491e?w=600"),
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
                       thumbnail="https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600"),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1543168256-418811576931?w=800"),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1506617564039-2f3b650b7010?w=800"),
        ],
    ),
    Store(
        id="s2",
        name="Green Basket",
        logo="https://images.unsplash.com/photo-1573246123716-6b1782bfc499?w=400",
        tagline="Handpicked veggies daily",
        delivery_time="12 min",
        rating=4.6,
        tags=["Vegetables", "Fruits"],
        media=[
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
                       thumbnail="https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=600"),
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
                       thumbnail="https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=600"),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=800"),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800"),
        ],
    ),
    Store(
        id="s3",
        name="Snack Junction",
        logo="https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400",
        tagline="Chips, biscuits & more",
        delivery_time="15 min",
        rating=4.5,
        tags=["Snacks", "Chocolates"],
        media=[
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
                       thumbnail="https://images.unsplash.com/photo-1739065883242-92659253f7a6?w=600"),
            StoreMedia(type="video",
                       url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
                       thumbnail=image('snacks')),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=800"),
            StoreMedia(type="image",
                       url="https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800"),
        ],
    ),
]

PRODUCTS: List[Product] = [
    Product(id="p1", name="Fresh Tomatoes", weight="500 g", price=25, mrp=40,
            image="https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400",
            category_id="c1", store_id="s1", discount_pct=37),
    Product(id="p2", name="Onions", weight="1 kg", price=32, mrp=45,
            image="https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400",
            category_id="c1", store_id="s2", discount_pct=28),
    Product(id="p3", name="Bananas", weight="1 dozen", price=48, mrp=60,
            image="https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400",
            category_id="c1", store_id="s2", discount_pct=20),
    Product(id="p4", name="Amul Milk", weight="500 ml", price=28, mrp=30,
            image="https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400",
            category_id="c2", store_id="s1"),
    Product(id="p5", name="Farm Eggs", weight="6 pcs", price=55, mrp=72,
            image="https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400",
            category_id="c2", store_id="s1", discount_pct=23),
    Product(id="p6", name="Lays Classic", weight="52 g", price=20, mrp=20,
            image="https://images.unsplash.com/photo-1621447504864-d8686f215021?w=400",
            category_id="c3", store_id="s3"),
    Product(id="p7", name="Kurkure Masala", weight="80 g", price=20, mrp=20,
            image="https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=400",
            category_id="c3", store_id="s3"),
    Product(id="p8", name="Coca Cola", weight="750 ml", price=40, mrp=45,
            image="https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400",
            category_id="c4", store_id="s3", discount_pct=11),
    Product(id="p9", name="Sprite", weight="750 ml", price=40, mrp=45,
            image="https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400",
            category_id="c4", store_id="s3"),
    Product(id="p10", name="Brown Bread", weight="400 g", price=45, mrp=50,
            image="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400",
            category_id="c5", store_id="s1"),
    Product(id="p11", name="Maggi Noodles", weight="4 pack", price=56, mrp=60,
            image="https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400",
            category_id="c6", store_id="s1"),
    Product(id="p12", name="Dettol Handwash", weight="200 ml", price=99, mrp=125,
            image="https://images.unsplash.com/photo-1585237017125-24baf8d7406f?w=400",
            category_id="c7", store_id="s1", discount_pct=20),
    Product(id="p13", name="Apples", weight="1 kg", price=180, mrp=220,
            image="https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400",
            category_id="c1", store_id="s2", discount_pct=18),
    Product(id="p14", name="Paneer", weight="200 g", price=95, mrp=110,
            image="https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400",
            category_id="c2", store_id="s1", discount_pct=13),
    Product(id="p15", name="Dark Chocolate", weight="80 g", price=180, mrp=220,
            image="https://images.unsplash.com/photo-1548907040-4baa42d10919?w=400",
            category_id="c3", store_id="s3", discount_pct=18),
    Product(id="p16", name="Butter", weight="100 g", price=52, mrp=58,
            image="https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400",
            category_id="c2", store_id="s1"),
]


# Expand the sample catalogue without changing existing product/order identifiers.
for cat in CATEGORIES:
    cat.image = image({'c1': 'fruit', 'c2': 'milk', 'c3': 'fries', 'c4': 'coffee', 'c5': 'bread', 'c6': 'pasta', 'c7': 'skincare', 'c8': 'fresh'}[cat.id])
CATEGORIES.extend(Category(id=cid, name=name, emoji='', color='pastelGreen', department=dept, image=image(asset)) for cid, name, dept, asset in EXTRA_CATEGORIES + CITY_CATEGORIES + STORE_CATEGORIES)
BRANDS.extend(CITY_BRANDS)
BRANDS.extend(STORE_BRANDS)
EXTRA_PRODUCTS.extend(CITY_PRODUCTS)
EXTRA_PRODUCTS.extend(STORE_PRODUCTS)
PRODUCTS.extend(Product(**p) for p in EXTRA_PRODUCTS)
for p in PRODUCTS:
    if p.id == 'p6':
        p.image = image('snacks')
    if p.id in {'p1', 'p3', 'p4', 'p5', 'p10'}:
        p.image = image({'p1': 'tomatoes', 'p3': 'bananas', 'p4': 'milk', 'p5': 'eggs', 'p10': 'bread'}[p.id])
for b in BRANDS:
    STORES.append(Store(id=b['id'], name=b['name'], logo=b['logo'] or b['image'], tagline=b['tagline'], delivery_time='25 min' if b['department'] == 'food' else '15 min', rating=4.6, tags=[b['department'].title(), 'Sample brand'], department=b['department'], media=[StoreMedia(type='video', url=image('reel-burger'), thumbnail=b['image']), StoreMedia(type='video', url=image('reel-tomato'), thumbnail=b['image']), StoreMedia(type='image', url=b['image']), StoreMedia(type='image', url=b['image'])]))

for store in STORES:
    for index, medium in enumerate(store.media):
        if medium.type == 'video':
            asset = 'reel-burger' if store.department == 'food' and index == 0 else 'reel-tomato' if index == 0 else 'reel-pasta'
            medium.url = image(asset)
            medium.video_web = image(asset + '-webm')

# Imported legacy photos now share the same managed-media lifecycle as new assets.
# Sources remain reproducible for the one-time importer, never fetched at runtime.
LEGACY_MEDIA_SOURCES = {}


def managed_legacy_image(url):
    if not url.startswith('http'):
        return url
    key = 'legacy-' + hashlib.sha256(url.encode()).hexdigest()[:16]
    LEGACY_MEDIA_SOURCES[key] = url
    return image(key)


for p in PRODUCTS:
    p.image = managed_legacy_image(p.image)
for banner in BANNERS:
    banner.image = managed_legacy_image(banner.image)
for store in STORES:
    store.logo = managed_legacy_image(store.logo)
    for medium in store.media:
        if medium.thumbnail:
            medium.thumbnail = managed_legacy_image(medium.thumbnail)
        if medium.type == 'image':
            medium.url = managed_legacy_image(medium.url)

# ---------- Routes ----------
app.state.products = PRODUCTS
@api_router.get("/")
async def root():
    return {"message": "One Latur API"}


@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    return CATEGORIES


@api_router.get("/discover")
async def get_discover_chips():
    return DISCOVER_CHIPS


@api_router.get("/banners", response_model=List[Banner])
async def get_banners(city: str = Depends(resolve_city)):
    return in_city(BANNERS, city)


@api_router.get("/stores", response_model=List[Store])
async def get_stores(city: str = Depends(resolve_city)):
    return in_city(STORES, city)


@api_router.get("/stores/{store_id}", response_model=Store)
async def get_store(store_id: str, city: str = Depends(resolve_city)):
    for s in in_city(STORES, city):
        if s.id == store_id:
            return s
    raise HTTPException(status_code=404, detail="Store not found")


@api_router.get("/stores/{store_id}/products", response_model=List[Product])
async def get_store_products(store_id: str, city: str = Depends(resolve_city)):
    return [p for p in in_city(PRODUCTS, city) if p.store_id == store_id]


@api_router.get("/products", response_model=List[Product])
async def get_products(category_id: Optional[str] = None, chip: Optional[str] = None, department: Optional[str] = None, brand_id: Optional[str] = None, q: Optional[str] = None, city: str = Depends(resolve_city)):
    items = in_city(PRODUCTS, city)
    if category_id:
        items = [p for p in items if p.category_id == category_id]
    if department:
        items = [p for p in items if p.department == department or (department == 'care' and p.department in {'pharmacy', 'beauty'})]
    if brand_id:
        items = [p for p in items if p.brand_id == brand_id]
    if q:
        query = ' '.join(q.lower().replace('&', ' ').replace('’', ' ').replace("'", ' ').split())
        intents = {'care': {'pharmacy', 'beauty'}, 'personal care': {'pharmacy', 'beauty'}, 'pharmacy beauty': {'pharmacy', 'beauty'}, 'shopping': {'shops'}, 'shops': {'shops'}, 'shop': {'shops'}, 'groceries': {'grocery'}, 'grocery': {'grocery'}, 'supermarket': {'grocery'}, 'pharmacy': {'pharmacy'}, 'beauty': {'beauty'}, 'food': {'food'}}
        if query in intents:
            items = [p for p in items if p.department in intents[query]]
        else:
            category_names = {c.id: c.name for c in CATEGORIES}
            brand_names = {b['id']: b['name'] for b in BRANDS}
            items = [p for p in items if all(word in (p.name + ' ' + p.weight + ' ' + category_names.get(p.category_id, '') + ' ' + brand_names.get(p.brand_id, '')).lower() for word in query.split())]
    if chip:
        if chip == 'd1':
            items = [p for p in items if p.discount_pct]
        elif chip == 'd2':
            items = list(reversed(items))[:6]
        elif chip in {'d3', 'd7'}:
            items = [p for p in items if p.category_id == 'c1']
        elif chip == 'd4':
            items = [p for p in items if p.rating >= 4.6]
        elif chip == 'd5':
            items = [p for p in items if p.price < 99]
        elif chip == 'd6':
            items = [p for p in items if p.store_id in {'s1', 's2', 's3'}]
        elif chip == 'd8':
            items = [p for p in items if 'pack' in p.weight.lower() or 'meal' in p.name.lower()]
        else:
            raise HTTPException(400, 'Unknown discovery filter')
    return items


@api_router.get("/products/buy-again", response_model=List[Product])
async def buy_again(city: str = Depends(resolve_city)):
    # simulated repeat purchases
    ids = {"p4", "p6", "p8", "p11", "p16"}
    return [p for p in in_city(PRODUCTS, city) if p.id in ids]


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str, city: str = Depends(resolve_city)):
    for p in in_city(PRODUCTS, city):
        if p.id == product_id:
            return p
    raise HTTPException(status_code=404, detail="Product not found")


# ---------- Coupons ----------
@api_router.get("/coupons", response_model=List[Coupon])
async def list_coupons():
    return COUPONS


class CouponApply(BaseModel):
    code: str
    subtotal: float


class CouponResult(BaseModel):
    ok: bool
    discount: float = 0
    coupon: Optional[Coupon] = None
    message: str = ""


@api_router.post("/coupons/apply", response_model=CouponResult)
async def apply_coupon(payload: CouponApply):
    code = payload.code.strip().upper()
    for c in COUPONS:
        if c.code == code:
            if payload.subtotal < c.min_order:
                return CouponResult(ok=False, message=f"Add ₹{c.min_order - payload.subtotal:.0f} more to use {code}")
            discount = c.value if c.kind == "flat" else round(payload.subtotal * c.value / 100)
            discount = min(discount, payload.subtotal)
            return CouponResult(ok=True, discount=discount, coupon=c, message=f"Coupon {code} applied!")
    return CouponResult(ok=False, message="Invalid coupon code")


# ---------- Orders ----------
@api_router.post("/orders", response_model=Order)
async def create_order(payload: OrderCreate, city: str = Depends(resolve_city)):
    order = Order(**payload.dict())
    doc = {**order.dict(), 'city_id': city}
    await db.orders.insert_one(doc)
    return order


@api_router.get("/orders", response_model=List[Order])
async def list_orders():
    docs = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    product_images = {p.id: p.image for p in PRODUCTS}
    for doc in docs:
        for item in doc.get('items', []):
            if item['id'] in product_images:
                item['image'] = product_images[item['id']]
    return [Order(**d) for d in docs]


@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str):
    doc = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    product_images = {p.id: p.image for p in PRODUCTS}
    for item in doc.get('items', []):
        if item['id'] in product_images:
            item['image'] = product_images[item['id']]
    return Order(**doc)


@api_router.get('/catalog')
async def catalog(city: str = Depends(resolve_city)):
    return {'city': city, 'brands': in_city(BRANDS, city), 'products': in_city(PRODUCTS, city), 'categories': CATEGORIES, 'events': in_city(EVENTS, city), 'themed_stores': in_city(THEMED_STORES, city), 'sample': True}


@api_router.get('/reels')
async def reels(city: str = Depends(resolve_city)):
    return [{**r, 'video_web': r['video'] + '-webm', 'product': next(p for p in PRODUCTS if p.id == r['product_id']), 'brand': next(b for b in BRANDS if b['id'] == r['brand_id'])} for r in in_city(CITY_REELS, city)]


@api_router.get('/events')
async def events(kind: Optional[str] = None, city: str = Depends(resolve_city)):
    return [e for e in in_city(EVENTS, city) if not kind or e['kind'] == kind]


class BookingEnquiryCreate(BaseModel):
    event_id: str
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=r'^[6-9][0-9]{9}$')
    date: str
    slot: str
    guests: int = Field(ge=1, le=8)


class BookingEnquiry(BookingEnquiryCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = 'demo_enquiry_saved'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post('/booking-enquiries', response_model=BookingEnquiry)
async def booking_enquiry(payload: BookingEnquiryCreate):
    from datetime import date, timedelta
    event = next((e for e in EVENTS if e['id'] == payload.event_id), None)
    if not event or payload.slot not in event['slots']:
        raise HTTPException(400, 'Choose an available event and time')
    try:
        selected = date.fromisoformat(payload.date)
        if not date.today() <= selected <= date.today() + timedelta(days=30):
            raise ValueError()
    except ValueError as exc:
        raise HTTPException(400, 'Choose a date within the next 30 days') from exc
    if not payload.name.strip() or len(payload.name.strip()) < 2:
        raise HTTPException(400, 'Enter your name')
    result = BookingEnquiry(**payload.model_dump())
    await db.booking_enquiries.insert_one(result.model_dump())
    return result


class SupportRequestCreate(BaseModel):
    topic: Literal['order', 'payment', 'profile', 'other']
    message: str = Field(min_length=10, max_length=2000)
    reference: str = Field(default='', max_length=100)


class SupportReceipt(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = 'saved_for_review'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.post('/support-requests', response_model=SupportReceipt)
async def save_support_request(payload: SupportRequestCreate):
    if len(payload.message.strip()) < 10:
        raise HTTPException(400, 'Please describe your question in at least 10 characters')
    receipt = SupportReceipt()
    document = {**payload.model_dump(), **receipt.model_dump()}
    await db.support_requests.insert_one(document)
    return receipt


# ---------- App wiring ----------
app.include_router(api_router)
app.include_router(media_store.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)



