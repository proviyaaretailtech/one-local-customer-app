import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accessToken } from './lib/supabase';
// backendUrl is injected server-side via app.config.ts → extra; never use EXPO_PUBLIC_ vars for secrets.
// In development on a phone (Expo Go), fall back to the dev server that served the app,
// which also serves app/api.
const devServer = Constants.expoConfig?.hostUri ? `http://${Constants.expoConfig.hostUri}` : '';
const configuredBackend = (Constants.expoConfig?.extra?.backendUrl || devServer).replace(/\/$/, '');
// On web the API is served by this same Expo Router app (app/api), so requests stay
// same-origin; native apps use the configured backend URL.
export const BACKEND = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : configuredBackend;
export const API = BACKEND + '/api';
export const mediaUrl = (key: string) => `${API}/media/${key}`;
function resolveMedia(value: any): any {
  if (typeof value === 'string') { const media = value.match(/^(?:https?:\/\/[^/]+)?\/api\/media\/(.+)$/); return media ? mediaUrl(media[1]) : value; }
  if (Array.isArray(value)) return value.map(resolveMedia);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveMedia(v)]));
  return value;
}

// A random id this device creates once. Until sign-in exists it is what keeps one
// customer's orders private from another's (the server stores only its hash).
const CUSTOMER_KEY = 'onecity.customer-key.v1';
export function randomId(bytes = 24): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  const a = new Uint8Array(bytes);
  if (c?.getRandomValues) c.getRandomValues(a); else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
let customerKey: Promise<string> | null = null;
function getCustomerKey(): Promise<string> {
  return (customerKey ??= AsyncStorage.getItem(CUSTOMER_KEY).then(async saved => {
    if (saved) return saved;
    const key = randomId();
    await AsyncStorage.setItem(CUSTOMER_KEY, key);
    return key;
  }).catch(() => randomId()));
}

// Every call says which device it is and, when signed in, who the customer is.
async function identity(): Promise<Record<string, string>> {
  const [key, token] = await Promise.all([getCustomerKey(), accessToken().catch(() => null)]);
  return token ? { 'X-Customer-Key': key, Authorization: `Bearer ${token}` } : { 'X-Customer-Key': key };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Like api(), but failures carry the server's own message (the `detail` field).
export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: await identity() });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, typeof body?.detail === 'string' ? body.detail : 'Something went wrong. Please try again.');
  return resolveMedia(body);
}

export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: await identity() });
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
  gst?: number;
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

export async function apiPost<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await identity()), ...headers },
    body: JSON.stringify(body),
  });
  // Surface the server's own message ("Prices have changed…") instead of a bare status code.
  if (!r.ok) { const detail = await r.json().then(b => b?.detail).catch(() => null); throw new Error(typeof detail === 'string' ? detail : `API ${path} ${r.status}`); }
  return resolveMedia(await r.json());
}

// The cart's bill as the server works it out (server/pricing.ts).
export type TaxSplit = { rate: number; taxable: number; cgst: number; sgst: number };
export type Bill = {
  item_mrp_total: number; item_total: number; mrp_savings: number;
  delivery_fee: number; delivery_fee_before_waiver: number; free_delivery_from: number; amount_to_free_delivery: number;
  handling_fee: number; platform_fee: number;
  gst_added: TaxSplit & { total: number }; gst_included: TaxSplit[];
  coupon: { code: string; label: string; ok: boolean; message: string } | null;
  discount: number; total: number; total_savings: number;
};

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
