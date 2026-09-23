import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { accessToken } from './lib/supabase';

const devServer = Constants.expoConfig?.hostUri ? `http://${Constants.expoConfig.hostUri}` : '';
const configuredBackend = (Constants.expoConfig?.extra?.backendUrl || devServer).replace(/\/$/, '');
export const BACKEND = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : configuredBackend;
export const PARTNER_API = BACKEND + '/api/partner';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(r: Response): Promise<string> {
  const body = await r.json().catch(() => null);
  return typeof body?.detail === 'string' ? body.detail : `Request failed (${r.status})`;
}

export async function partnerGet<T>(path: string): Promise<T> {
  const r = await fetch(`${PARTNER_API}${path}`, { headers: await authHeaders() });
  if (!r.ok) throw new ApiError(r.status, await parseError(r));
  return r.json();
}

export async function partnerPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${PARTNER_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await parseError(r));
  return r.json();
}

export async function partnerPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${PARTNER_API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await parseError(r));
  return r.json();
}

export async function partnerPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${PARTNER_API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, await parseError(r));
  return r.json();
}
