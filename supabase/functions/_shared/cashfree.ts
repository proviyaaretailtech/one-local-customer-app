// Cashfree refunds for the Edge Functions (Deno). Mirrors frontend/server/cashfree.ts exactly where it matters for money:
// the same deterministic refund id and idempotency key, so a refund started here and retried by the server worker (or the other way
// round) is the SAME refund at Cashfree, never a second one. Headers: x-client-id, x-client-secret, x-api-version, x-idempotency-key.
// The secret never leaves this file's requests and nothing from a request is logged.

const HOST = { sandbox: 'https://sandbox.cashfree.com/pg', production: 'https://api.cashfree.com/pg' } as const;
const DEFAULT_API_VERSION = '2026-01-01';

export function cashfreeKeys() {
  const env = (Deno.env.get('CASHFREE_ENV') ?? '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
  // A stand-in host for tests is honoured only outside production: a stray setting can never move real money elsewhere.
  const override = (Deno.env.get('CASHFREE_BASE_URL') ?? '').trim();
  return {
    id: (Deno.env.get('CASHFREE_PG_APP_ID') ?? '').trim(),
    secret: (Deno.env.get('CASHFREE_PG_SECRET_KEY') ?? '').trim(),
    env,
    version: (Deno.env.get('CASHFREE_API_VERSION') ?? '').trim() || DEFAULT_API_VERSION,
    host: env === 'sandbox' && override ? override.replace(/\/$/, '') : HOST[env],
  };
}
export const cashfreeConfigured = () => { const k = cashfreeKeys(); return !!(k.id && k.secret); };

export class CashfreeError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Same as the server's cashfreeRefundId(...parts). */
export async function cashfreeRefundId(...parts: (string | number)[]): Promise<string> {
  return `olr_${(await sha256(`ol-refund|${parts.join('|')}`)).slice(0, 24)}`;
}

/** Same as the server's idempotencyUuid(label). */
async function idempotencyUuid(label: string): Promise<string> {
  const h = await sha256(`ol-cashfree|${label}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const short = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function cf(method: 'GET' | 'POST', path: string, body?: unknown, idempotency?: string): Promise<Record<string, unknown>> {
  const k = cashfreeKeys();
  if (!k.id || !k.secret) throw new CashfreeError(503, 'not_configured', 'Cashfree is not configured');
  let r: Response;
  try {
    r = await fetch(`${k.host}${path}`, {
      method,
      headers: {
        'x-api-version': k.version, 'content-type': 'application/json', 'x-request-id': crypto.randomUUID(),
        'x-client-id': k.id, 'x-client-secret': k.secret, ...(idempotency ? { 'x-idempotency-key': idempotency } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new CashfreeError(0, 'network', 'No answer from Cashfree');
  }
  const json = await r.json().catch(() => null) as Record<string, unknown> | null;
  if (!r.ok) throw new CashfreeError(r.status, short(json?.code, 80), short(json?.message, 200) || `Cashfree answered ${r.status}`);
  return json ?? {};
}

export type CfRefund = { refundId: string; cfRefundId: string | null; status: string };
const mapRefund = (j: Record<string, unknown>): CfRefund => ({
  refundId: String(j.refund_id ?? ''), cfRefundId: j.cf_refund_id != null ? String(j.cf_refund_id) : null, status: String(j.refund_status ?? '').toUpperCase(),
});

export async function createCfRefund(a: { orderId: string; refundId: string; amountMinor: number; note: string }): Promise<CfRefund> {
  const body = { refund_amount: a.amountMinor / 100, refund_id: a.refundId, refund_note: a.note.trim().padEnd(3, '.').slice(0, 100), refund_speed: 'STANDARD' };
  try {
    return mapRefund(await cf('POST', `/orders/${encodeURIComponent(a.orderId)}/refunds`, body, await idempotencyUuid(`refund:${a.refundId}`)));
  } catch (error) {
    // The same refund id again (the first call worked but its answer was lost): read the refund that exists instead of making another.
    if (error instanceof CashfreeError && (error.status === 409 || /refund_already_exist|duplicate|already/i.test(`${error.code} ${error.message}`))) {
      try { return mapRefund(await cf('GET', `/orders/${encodeURIComponent(a.orderId)}/refunds/${encodeURIComponent(a.refundId)}`)); } catch { /* the original error */ }
    }
    throw error;
  }
}
