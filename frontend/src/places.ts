// Address search and map positions for the location flow. All Google calls go through our
// own API (app/api/places, app/api/geocode) so the Maps key never ships in the app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { apiGet } from './api';
import type { Point } from './delivery-location';
import type { Address } from './customer';

export const CITY_CENTER: Point = { lat: 18.4088, lng: 76.5604 }; // Latur

export type Suggestion = { place_id: string; title: string; subtitle: string };
export type Place = Point & {
  formatted: string; locality: string; city: string; state: string; pincode: string;
  serviceable: boolean; service_city: string | null; nearest_city: string; distance_km: number;
};

const near = (p?: Point | null) => (p ? `&lat=${p.lat}&lng=${p.lng}` : '');

export const searchPlaces = (q: string, session: string, around?: Point | null) =>
  apiGet<Suggestion[]>(`/places/autocomplete?q=${encodeURIComponent(q)}&session=${session}${near(around)}`);
export const placeDetails = (id: string, session: string) => apiGet<Place>(`/places/${encodeURIComponent(id)}?session=${session}`);
export const reverseGeocode = (p: Point) => apiGet<Place>(`/geocode/reverse?lat=${p.lat}&lng=${p.lng}`);
export const checkServiceable = (p: Point) =>
  apiGet<{ serviceable: boolean; city: string | null; nearest_city: string; distance_km: number }>(`/serviceability?lat=${p.lat}&lng=${p.lng}`);

export async function currentPoint(): Promise<Point> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location access is off. You can search for your area or move the pin instead.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Only if the customer already allowed location: never prompts.
export async function knownPoint(): Promise<Point | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync();
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

export function distanceKm(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------- Recent searches (this device) ----------
export type Recent = Point & { title: string; subtitle: string };
const RECENT_KEY = 'onecity.recent-places.v1';

export async function recentPlaces(): Promise<Recent[]> {
  try { return JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) || '[]'); } catch { return []; }
}

export async function rememberPlace(place: Recent) {
  const list = (await recentPlaces()).filter(r => r.title !== place.title || r.subtitle !== place.subtitle);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify([place, ...list].slice(0, 5))).catch(() => {});
}

// How an address reads in the header and when it is the selected delivery location.
export const addressText = (a: Address) => `${a.label}: ${[a.line, a.locality || a.area].filter(Boolean).join(', ')}${a.pin ? ` ${a.pin}` : ''}`;
