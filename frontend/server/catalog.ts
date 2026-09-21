// Read side of the One Latur catalogue. Today the data is the assembled sample catalogue
// exported once from the retired Python backend (data/catalog.json); the next step moves it
// into Supabase tables behind these same functions, so routes do not change.
import data from './data/catalog.json';
import { HttpError } from './http';

export type Product = (typeof data.products)[number];
export type Store = (typeof data.stores)[number];
export type Coupon = (typeof data.coupons)[number];
export type Brand = (typeof data.brands)[number];
export type Event = (typeof data.events)[number];

export const catalog = data;

// ---------- Locality ----------
// Every listing belongs to one city; viewers only see their own city's listings.
// The sample catalogue is all Latur. A second city is data (city_id on rows), not code.
export const ACTIVE_CITIES: Record<string, string> = { latur: 'Latur, Maharashtra' };

// Where each city delivers: a centre and radius. A starting approximation; move to polygons
// (or pincode lists) once real delivery zones are drawn.
export const SERVICE_AREAS = [
  { city: 'latur', name: 'Latur', lat: 18.4088, lng: 76.5604, radiusKm: 15 },
];

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function serviceability(point: { lat: number; lng: number }) {
  const nearest = SERVICE_AREAS.map(area => ({ area, km: distanceKm(point, area) })).sort((x, y) => x.km - y.km)[0];
  const serviceable = nearest.km <= nearest.area.radiusKm;
  return { serviceable, city: serviceable ? nearest.area.city : null, nearest_city: nearest.area.name, distance_km: Math.round(nearest.km * 10) / 10 };
}

export function resolveCity(request: Request): string {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('city') || request.headers.get('x-city') || 'latur').trim().toLowerCase();
  if (!(slug in ACTIVE_CITIES)) throw new HttpError(404, "We haven't launched in this city yet");
  return slug;
}

const cityOf = (item: object) => (item as { city_id?: string }).city_id || 'latur';
export const inCity = <T extends object>(items: readonly T[], city: string): T[] => items.filter(i => cityOf(i) === city);

// ---------- Products ----------
const INTENTS: Record<string, string[]> = {
  care: ['pharmacy', 'beauty'], 'personal care': ['pharmacy', 'beauty'], 'pharmacy beauty': ['pharmacy', 'beauty'],
  shopping: ['shops'], shops: ['shops'], shop: ['shops'], groceries: ['grocery'], grocery: ['grocery'],
  supermarket: ['grocery'], pharmacy: ['pharmacy'], beauty: ['beauty'], food: ['food'],
};

export type ProductFilters = { category_id?: string | null; chip?: string | null; department?: string | null; brand_id?: string | null; q?: string | null };

export function filterProducts(city: string, f: ProductFilters): Product[] {
  let items = inCity(data.products, city);
  if (f.category_id) items = items.filter(p => p.category_id === f.category_id);
  if (f.department) items = items.filter(p => p.department === f.department || (f.department === 'care' && ['pharmacy', 'beauty'].includes(p.department)));
  if (f.brand_id) items = items.filter(p => p.brand_id === f.brand_id);
  if (f.q) {
    if (f.q.length > 80) throw new HttpError(400, 'Please use a shorter search');
    const query = f.q.toLowerCase().replace(/[&’']/g, ' ').split(/\s+/).filter(Boolean).join(' ');
    if (INTENTS[query]) {
      items = items.filter(p => INTENTS[query].includes(p.department));
    } else {
      const categories = new Map(data.categories.map(c => [c.id, c.name]));
      const brands = new Map(data.brands.map(b => [b.id, b.name]));
      const words = query.split(' ').filter(Boolean);
      items = items.filter(p => {
        const text = `${p.name} ${p.weight} ${categories.get(p.category_id) ?? ''} ${brands.get(p.brand_id ?? '') ?? ''}`.toLowerCase();
        return words.every(w => text.includes(w));
      });
    }
  }
  if (f.chip) {
    switch (f.chip) {
      case 'd1': items = items.filter(p => p.discount_pct); break;
      case 'd2': items = [...items].reverse().slice(0, 6); break;
      case 'd3': case 'd7': items = items.filter(p => p.category_id === 'c1'); break;
      case 'd4': items = items.filter(p => p.rating >= 4.6); break;
      case 'd5': items = items.filter(p => p.price < 99); break;
      case 'd6': items = items.filter(p => ['s1', 's2', 's3'].includes(p.store_id)); break;
      case 'd8': items = items.filter(p => p.weight.toLowerCase().includes('pack') || p.name.toLowerCase().includes('meal')); break;
      default: throw new HttpError(400, 'Unknown discovery filter');
    }
  }
  return items;
}

export function findProduct(city: string, id: string): Product | undefined {
  return inCity(data.products, city).find(p => p.id === id);
}

// ---------- Coupons ----------
export type CouponResult = { ok: boolean; discount: number; coupon: Coupon | null; message: string };

export function applyCoupon(rawCode: string, subtotal: number): CouponResult {
  const code = rawCode.trim().toUpperCase();
  const coupon = data.coupons.find(c => c.code === code);
  if (!coupon) return { ok: false, discount: 0, coupon: null, message: 'Invalid coupon code' };
  if (subtotal < coupon.min_order) return { ok: false, discount: 0, coupon: null, message: `Add ₹${(coupon.min_order - subtotal).toFixed(0)} more to use ${code}` };
  const discount = Math.min(coupon.kind === 'flat' ? coupon.value : Math.round((subtotal * coupon.value) / 100), subtotal);
  return { ok: true, discount, coupon, message: `Coupon ${code} applied!` };
}

// Same rule the cart shows today: free delivery from ₹199, otherwise ₹15.
export const deliveryFee = (subtotal: number) => (subtotal >= 199 || subtotal === 0 ? 0 : 15);

// ---------- Reels ----------
export function reelsFor(city: string) {
  return inCity(data.reels, city).map(r => ({
    ...r,
    video_web: `${r.video}-webm`,
    product: data.products.find(p => p.id === r.product_id),
    brand: data.brands.find(b => b.id === r.brand_id),
  }));
}
