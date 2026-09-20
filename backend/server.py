"""
One Local Mobile App Backend — Supabase Migration
Single source of truth: Supabase (Postgres + Auth + Storage + Realtime)
Shared endpoints for customer, rider, and merchant (POS) apps
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path
import os
import logging
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field

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

if not supabase_url or not supabase_key:
    raise ValueError("❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")

supabase: Client = create_client(supabase_url, supabase_key)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models
# ============================================================================

class UserProfile(BaseModel):
    id: Optional[str] = None
    email: str
    role: Literal['customer', 'rider', 'merchant', 'admin'] = 'customer'
    phone: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    city: str = 'latur'
    created_at: Optional[datetime] = None

class Category(BaseModel):
    id: str
    name: str
    emoji: str
    color: str
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
    user_id: Optional[str] = None

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
    delivery_address_id: str = ''

class Order(BaseModel):
    id: Optional[str] = None
    user_id: Optional[str] = None
    items: List[OrderItem]
    subtotal: float
    discount: float = 0
    delivery_fee: float = 0
    total: float
    coupon_code: Optional[str] = None
    payment_method: Literal['cod', 'upi', 'card', 'netbanking'] = 'cod'
    payment_status: Literal['not_charged', 'charged', 'failed'] = 'not_charged'
    status: str = "placed"
    rider_id: Optional[str] = None
    rider_name: Optional[str] = "Pending"
    rider_phone: Optional[str] = None
    eta_minutes: int = 10
    created_at: Optional[datetime] = None

class Ride(BaseModel):
    id: Optional[str] = None
    rider_id: str
    order_id: str
    status: str = "assigned"
    pickup_lat: float
    pickup_lon: float
    dropoff_lat: float
    dropoff_lon: float
    eta_minutes: int = 10
    created_at: Optional[datetime] = None

# ============================================================================
# FastAPI App Setup
# ============================================================================

app = FastAPI(
    title="One Local Mobile API",
    description="Shared backend for customer, rider, and merchant apps",
    version="1.0.0"
)

# CORS for mobile apps (Expo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Dependency: Extract user from Authorization header
# ============================================================================

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Extract user from Supabase JWT token in Authorization header"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split(" ")[1]
    try:
        # For local development, we skip token validation
        # In production, decode JWT and verify signature
        user = supabase.auth.get_user(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user.user.id, "email": user.user.email}
    except Exception as e:
        logger.warning(f"Auth validation skipped (dev mode): {e}")
        # For demo, accept token as-is and extract user_id from it
        # This is NOT secure for production!
        return {"id": "demo_user", "email": "demo@example.com"}

# ============================================================================
# API Routes
# ============================================================================

api_router = APIRouter(prefix="/api")

# ---------- Health Check ----------

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "message": "One Local API is running", "version": "1.0.0"}

# ---------- Products & Catalog ----------

@api_router.get("/categories", response_model=List[Category])
async def get_categories(department: str = "grocery"):
    """Get product categories for a department"""
    try:
        response = supabase.table("categories").select("*").eq("department", department).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        return []  # Return empty list instead of error for demo

@api_router.get("/products", response_model=List[Product])
async def get_products(
    category_id: Optional[str] = None,
    department: str = "grocery",
    skip: int = 0,
    limit: int = 50
):
    """Get products, optionally filtered by category"""
    try:
        query = supabase.table("products").select("*").eq("department", department)
        if category_id:
            query = query.eq("category_id", category_id)
        response = query.range(skip, skip + limit).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching products: {e}")
        return []

@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    """Get a single product"""
    try:
        response = supabase.table("products").select("*").eq("id", product_id).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching product: {e}")
        raise HTTPException(status_code=404, detail="Product not found")

# ---------- Stores ----------

@api_router.get("/stores", response_model=List[Store])
async def get_stores(department: str = "grocery"):
    """Get stores for a department"""
    try:
        response = supabase.table("stores").select("*").eq("department", department).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching stores: {e}")
        return []

@api_router.get("/stores/{store_id}", response_model=Store)
async def get_store(store_id: str):
    """Get a single store"""
    try:
        response = supabase.table("stores").select("*").eq("id", store_id).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching store: {e}")
        raise HTTPException(status_code=404, detail="Store not found")

# ---------- Orders (Customer) ----------

@api_router.get("/orders", response_model=List[Order])
async def get_user_orders(current_user: dict = Depends(get_current_user)):
    """Get authenticated user's orders"""
    try:
        response = supabase.table("orders").select("*").eq("user_id", current_user["id"]).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching orders: {e}")
        return []

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single order (user can only see their own)"""
    try:
        response = supabase.table("orders").select("*").eq("id", order_id).eq("user_id", current_user["id"]).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching order: {e}")
        raise HTTPException(status_code=404, detail="Order not found or access denied")

@api_router.post("/orders", response_model=Order)
async def create_order(order: OrderCreate, current_user: dict = Depends(get_current_user)):
    """Create a new order"""
    try:
        new_order = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "items": [item.dict() for item in order.items],
            "subtotal": order.subtotal,
            "discount": order.discount,
            "delivery_fee": order.delivery_fee,
            "total": order.total,
            "coupon_code": order.coupon_code,
            "payment_method": order.payment_method,
            "payment_status": "not_charged",
            "status": "placed",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        response = supabase.table("orders").insert(new_order).execute()
        return response.data[0] if response.data else new_order
    except Exception as e:
        logger.error(f"Error creating order: {e}")
        raise HTTPException(status_code=500, detail="Failed to create order")

# ---------- Rides (Rider) ----------

@api_router.get("/rides", response_model=List[Ride])
async def get_rider_rides(current_user: dict = Depends(get_current_user)):
    """Get rides assigned to the current rider"""
    try:
        response = supabase.table("rides").select("*").eq("rider_id", current_user["id"]).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching rides: {e}")
        return []

@api_router.post("/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update ride status (only rider can update their own)"""
    try:
        # Verify rider owns this ride
        ride = supabase.table("rides").select("*").eq("id", ride_id).eq("rider_id", current_user["id"]).single().execute()
        if not ride.data:
            raise HTTPException(status_code=403, detail="Access denied")
        
        response = supabase.table("rides").update({"status": status}).eq("id", ride_id).execute()
        return {"success": True, "ride": response.data[0] if response.data else None}
    except Exception as e:
        logger.error(f"Error updating ride: {e}")
        raise HTTPException(status_code=500, detail="Failed to update ride")

# ---------- User Profile ----------

@api_router.get("/profile", response_model=UserProfile)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get authenticated user's profile"""
    try:
        response = supabase.table("users").select("*").eq("id", current_user["id"]).single().execute()
        return response.data
    except Exception as e:
        logger.warning(f"Profile not found, returning demo: {e}")
        return UserProfile(id=current_user["id"], email=current_user.get("email", "user@example.com"))

@api_router.post("/profile")
async def update_profile(profile: UserProfile, current_user: dict = Depends(get_current_user)):
    """Update authenticated user's profile"""
    try:
        profile.id = current_user["id"]
        response = supabase.table("users").update(profile.dict(exclude_none=True)).eq("id", current_user["id"]).execute()
        return {"success": True, "profile": response.data[0] if response.data else profile}
    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        return {"success": False, "error": str(e)}

# Include router
app.include_router(api_router)

# ============================================================================
# Startup
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
