// validate-restaurant-live (Guard 2): can this restaurant take a One Local order right now? The rule itself lives in the database
// (ol_restaurant_live: switch, platform hold, approval, map point, POS heartbeat in the last 5 minutes, business hours); this exposes it.
// The One Local server calls the same rule directly before it creates a Cashfree order. Any valid JWT (the app's anon key included):
// the answer is only yes/no and reason codes, never who is on shift or when the device last checked in (that is for the service role).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { json, jwtRole } from '../_shared/auth.ts';

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, CORS);
  const body = await req.json().catch(() => ({})) as { organization_id?: string; store_id?: string };
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let org = typeof body.organization_id === 'string' && UUID.test(body.organization_id) ? body.organization_id : null;
  if (!org && typeof body.store_id === 'string' && body.store_id.length <= 120) {
    const { data, error } = await db.from('ol_stores').select('organization_id').eq('id', body.store_id).eq('is_demo', false).maybeSingle();
    if (error) return json(500, { error: 'lookup_failed' }, CORS);
    org = (data?.organization_id as string | null) ?? null;
  }
  if (!org) return json(200, { allow_order: false, reasons: ['not_listed'] }, CORS);

  const { data, error } = await db.rpc('ol_restaurant_live', { p_org: org });
  if (error) return json(500, { error: 'check_failed' }, CORS);
  const live = (data ?? {}) as Record<string, unknown>;
  if (jwtRole(req) === 'service_role') return json(200, live, CORS);
  return json(200, { allow_order: live.allow_order === true, reasons: live.reasons ?? [], accept_window_seconds: live.accept_window_seconds ?? 240 }, CORS);
});
