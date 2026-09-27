// Real local places for "discover" towns (where we don't deliver yet): restaurants, grocers,
// shops and pharmacies from OpenStreetMap (© OpenStreetMap contributors, ODbL — the app shows
// the credit). Fetched through the public Overpass API: one query per area for all four kinds,
// one query at a time (Overpass allows a client only a couple of slots), cached for hours, so a
// busy town costs one query per cache period. The search area fits the place: a couple of km in a
// metro (anything wider is tens of thousands of shops), wider around towns, and 15 → 40 km around
// a village, so the page is never empty; every listing carries its distance.
import { distanceKm, nearestPlace } from './geo';
import { HttpError } from './http';

export type NearbyKind = 'food' | 'grocery' | 'shops' | 'care';
export type NearbyPlace = {
  id: string; name: string; type: string; lat: number; lng: number; distance_km: number;
  address: string | null; phone: string | null; cuisine: string | null; hours: string | null; website: string | null;
};
export type NearbyResult = { radius_km: number; groups: Record<NearbyKind, NearbyPlace[]>; source: 'OpenStreetMap' };

const TAGS: Record<NearbyKind, { amenity?: string[]; shop?: string[] }> = {
  food: { amenity: ['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream'], shop: ['bakery', 'confectionery', 'sweets'] },
  grocery: { shop: ['supermarket', 'convenience', 'greengrocer', 'grocery', 'dairy', 'butcher', 'general', 'frozen_food'] },
  shops: { shop: ['clothes', 'shoes', 'electronics', 'mobile_phone', 'jewelry', 'books', 'gift', 'hardware', 'furniture', 'department_store', 'mall', 'sports', 'optician', 'bag', 'boutique', 'stationery', 'toys', 'variety_store'] },
  care: { amenity: ['pharmacy', 'clinic', 'hospital', 'doctors', 'dentist'], shop: ['chemist', 'beauty', 'cosmetics', 'hairdresser'] },
};
const KINDS = Object.keys(TAGS) as NearbyKind[];
const kindOf = (t: Record<string, string>): NearbyKind | null =>
  KINDS.find(k => (t.amenity && TAGS[k].amenity?.includes(t.amenity)) || (t.shop && TAGS[k].shop?.includes(t.shop))) ?? null;
const all = (key: 'amenity' | 'shop') => [...new Set(KINDS.flatMap(k => TAGS[k][key] ?? []))].join('|');

// Search radii by how built-up the place is.
function radiiFor(point: { lat: number; lng: number }): number[] {
  try {
    const p = nearestPlace(point);
    if (p.population >= 1_000_000) return [2_000, 5_000];
    if (p.kind === 'city' || p.kind === 'locality' || p.population >= 100_000) return [4_000, 12_000];
    if (p.kind === 'town') return [8_000, 25_000];
  } catch { /* outside the place list: treat as rural */ }
  return [15_000, 40_000];
}
const PER_KIND = 40;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TTL_MS = 6 * 3_600_000;

type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
const g = globalThis as unknown as { __onecityNearby?: Map<string, { at: number; value: Promise<NearbyResult> }>; __onecityOverpass?: Promise<unknown> };
const cache = (g.__onecityNearby ??= new Map());

// One Overpass request at a time from this server.
function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = (g.__onecityOverpass ?? Promise.resolve()).catch(() => {}).then(task);
  g.__onecityOverpass = run.catch(() => {});
  return run;
}

async function overpass(query: string): Promise<Element[]> {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST', signal: AbortSignal.timeout(28_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OneLocal/1.0 (city marketplace app)' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) throw new Error(`overpass ${response.status}`);
      // An overloaded server answers 200 with an XML "remark" instead of JSON.
      const body = (await response.json().catch(() => null)) as { elements?: Element[] } | null;
      if (!body) throw new Error('overpass returned no JSON');
      return body.elements ?? [];
    } catch (e) { last = e; }
  }
  console.warn('[nearby]', last);
  throw new HttpError(502, 'Local listings are unavailable right now. Please try again.');
}

const label = (t: Record<string, string>) => (t.amenity ?? t.shop ?? 'place').replace(/_/g, ' ');
const address = (t: Record<string, string>) => {
  const parts = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] ?? t['addr:neighbourhood'], t['addr:city']].filter(Boolean);
  return parts.length ? parts.join(', ') : t['addr:full'] ?? null;
};
const latin = (s?: string) => !!s && /^[\x20-\x7e]+$/.test(s);

async function search(at: { lat: number; lng: number }): Promise<NearbyResult> {
  let result: NearbyResult | null = null;
  for (const radius of radiiFor(at)) {
    const around = `(around:${radius},${at.lat},${at.lng})`;
    const elements = await queued(() => overpass(
      `[out:json][timeout:25];(nwr["amenity"~"^(${all('amenity')})$"]["name"]${around};nwr["shop"~"^(${all('shop')})$"]["name"]${around};);out center 600;`,
    ));
    const groups = Object.fromEntries(KINDS.map(k => [k, [] as NearbyPlace[]])) as Record<NearbyKind, NearbyPlace[]>;
    for (const e of elements) {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, t = e.tags ?? {}, kind = kindOf(t);
      if (lat == null || lng == null || !t.name || !kind) continue;
      groups[kind].push({
        id: `osm-${e.type[0]}${e.id}`, name: latin(t['name:en']) ? t['name:en'] : t.name, type: label(t), lat, lng,
        distance_km: Math.round(distanceKm(at, { lat, lng }) * 10) / 10,
        address: address(t), phone: t.phone ?? t['contact:phone'] ?? null, cuisine: t.cuisine?.replace(/[;_]/g, ' ') ?? null,
        hours: t.opening_hours ?? null, website: t.website ?? t['contact:website'] ?? null,
      });
    }
    for (const k of KINDS) groups[k] = groups[k].sort((a, b) => a.distance_km - b.distance_km).slice(0, PER_KIND);
    result = { radius_km: radius / 1000, groups, source: 'OpenStreetMap' };
    // Widen only when the place is nearly empty.
    if (KINDS.reduce((n, k) => n + groups[k].length, 0) >= 12) break;
  }
  return result!;
}

export function nearby(point: { lat: number; lng: number }): Promise<NearbyResult> {
  // ~1 km grid, so neighbours share one cached answer.
  const at = { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
  const key = `${at.lat}:${at.lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = search(at);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return value;
}
