import Constants from 'expo-constants';
import { Platform } from 'react-native';
// backendUrl is injected server-side via app.config.ts → extra; never use EXPO_PUBLIC_ vars for secrets.
const configuredBackend = (Constants.expoConfig?.extra?.backendUrl || '').replace(/\/$/, '');
// Browser previews are served through an origin-rewriting proxy. Keep preview
// requests same-origin; native apps always use the configured backend URL.
export const BACKEND = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : configuredBackend;
export const API = BACKEND + '/api';
export const mediaUrl = (key: string) => `${API}/media/${key}`;
function resolveMedia(value: any): any {
  if (typeof value === 'string') { const media = value.match(/^(?:https?:\/\/[^/]+)?\/api\/media\/(.+)$/); return media ? mediaUrl(media[1]) : value; }
  if (Array.isArray(value)) return value.map(resolveMedia);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveMedia(v)]));
  return value;
}

export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`API ${path} ${r.status}`);
  return resolveMedia(await r.json());
}

export type Category = { id: string; name: string; emoji: string; color: string; department: string; image: string };
export type DiscoverChip = { id: string; label: string; emoji: string; color: string };
export type Banner = { id: string; title: string; subtitle: string; image: string; bg: string };
export type Product = {
  id: string; name: string; weight: string; price: number; mrp: number;
  image: string; category_id: string; store_id: string;
  delivery_min: number; discount_pct?: number | null; rating: number;
  department?: string; brand_id?: string;
};
export type StoreMedia = { type: "video" | "image"; url: string; thumbnail?: string; video_web?: string };
export type Store = {
  id: string; name: string; logo: string; tagline: string;
  delivery_time: string; rating: number; tags: string[]; media: StoreMedia[];
};

export type Coupon = {
  code: string; label: string; kind: "flat" | "pct"; value: number;
  min_order: number; description: string;
};

export type CouponResult = {
  ok: boolean; discount: number; coupon?: Coupon | null; message: string;
};

export type OrderItem = {
  id: string; name: string; weight: string; price: number; mrp: number; image: string; qty: number;
};

export type Order = {
  id: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon_code?: string | null;
  payment_method?: 'cod' | 'upi' | 'card' | 'netbanking';
  payment_status?: 'not_charged';
  status: string;
  rider_name: string;
  rider_phone: string;
  eta_minutes: number;
  created_at: string;
};

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${path} ${r.status}`);
  return resolveMedia(await r.json());
}

export type Brand = { id: string; name: string; department: string; logo: string; image: string; tagline: string };
export type EventListing = { id: string; title: string; kind: string; subtitle: string; venue: string; price: number; image: string; tag: string; slots: string[] };
export type ThemedStore = { id: string; name: string; subtitle: string; eyebrow: string; categories: string[]; icon: string; image: string; sections: string[] };
export type Catalog = { brands: Brand[]; products: Product[]; categories: Category[]; events: EventListing[]; themed_stores: ThemedStore[] };
export type Reel = { id: string; video: string; video_web: string; product: Product; caption: string; creator: string; likes: number; tag: string; brand: Brand };
export type AISearchResult = { query: string; product_ids: string[]; explanation: string; transcript?: string };
export async function uploadSearch(mode: 'image' | 'voice', uri: string, name: string, type: string, signal: AbortSignal): Promise<AISearchResult> {
  const { Platform } = await import('react-native');
  const form = new FormData();
  if (Platform.OS === 'web') { const response = await fetch(uri); form.append('file', await response.blob(), name); }
  else form.append('file', { uri, name, type } as any);
  const response = await fetch(`${API}/search/${mode}`, { method: 'POST', body: form, signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Search is unavailable. Please try again.');
  return payload;
}
