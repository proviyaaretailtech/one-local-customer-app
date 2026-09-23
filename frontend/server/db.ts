// Server-side database access (Supabase, service role). Used only by app/api routes.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from .env, or from .env.local which
// `scripts/db.py local-env` writes to point development at the local database.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'The database is not connected yet.');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const dbConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Database functions raise errors like "OL_STALE: this order was already changed on another phone".
const STATUS: Record<string, number> = {
  OL_BAD_REQUEST: 400, OL_BAD_QTY: 400, OL_EMPTY: 400, OL_NOT_FOUND: 404, OL_NOT_ONE_LOCAL: 404,
  OL_NOT_ACCEPTING: 409, OL_ITEM_UNAVAILABLE: 409, OL_STALE: 409, OL_WRONG_STATE: 409, OL_EXPIRED: 409,
};

export function fromDbError(error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? 'Database error';
  const match = message.match(/^(OL_[A-Z_]+):\s*(.*)$/);
  if (match) throw new HttpError(STATUS[match[1]] ?? 400, match[2]);
  console.error('[db]', error);
  throw new HttpError(500, 'Something went wrong. Please try again.');
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) fromDbError(error);
  return data as T;
}
