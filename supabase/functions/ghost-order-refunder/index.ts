// ghost-order-refunder: makes the Cashfree refunds the database queued when an order was cancelled (restaurant rejected it, never answered,
// or went offline: see migration 0580). Woken every 30 s by pg_cron (ol_refund_worker_kick) only when there is work, so refunds go out
// even when the One Local server is down. The server's own refund worker stays as a second worker: a claim is exclusive and the Cashfree
// refund id is derived from the refund row, so two workers can never refund twice. Service role only.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cashfreeConfigured, cashfreeRefundId, createCfRefund, CashfreeError } from '../_shared/cashfree.ts';
import { json, jwtRole } from '../_shared/auth.ts';

const MAX_ATTEMPTS = 5;      // same as the server (refunds.ts REFUND_MAX_ATTEMPTS): then operations get an exception
const BACKOFF_SECONDS = 60;  // same as REFUND_BACKOFF_SECONDS

type Claimed = {
  refund_id: string; order_id: string; amount_minor: number; reason: string | null; provider_attempt: number;
  provider_order_id: string | null; paid_minor: number; issued_minor: number; would_exceed: boolean;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (jwtRole(req) !== 'service_role') return json(403, { error: 'forbidden' });
  const started = Date.now();
  const out = { requeued: 0, exhausted: 0, claimed: 0, sent: 0, processed: 0, failed: 0, skipped: null as string | null };
  // Not set up: claim nothing, so the server worker (or a later run) still can.
  if (!cashfreeConfigured()) { out.skipped = 'cashfree_not_configured'; return json(200, out); }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const requeue = await db.rpc('ol_refund_requeue_failed', { p_max_attempts: MAX_ATTEMPTS, p_base_seconds: BACKOFF_SECONDS });
  if (requeue.error) return json(500, { error: 'requeue_failed', detail: requeue.error.message });
  out.requeued = Number((requeue.data as Record<string, unknown>)?.requeued ?? 0);
  out.exhausted = Number((requeue.data as Record<string, unknown>)?.exhausted ?? 0);

  const claim = await db.rpc('ol_refund_claim_cashfree', { p_limit: 20 });
  if (claim.error) return json(500, { error: 'claim_failed', detail: claim.error.message });
  for (const c of (claim.data ?? []) as Claimed[]) {
    out.claimed++;
    try {
      if (!c.provider_order_id) throw new Error('no Cashfree order on file for this refund: refund it by hand');
      if (c.would_exceed) throw new Error('this refund would exceed the amount paid: check it with the payment team');
      // same id as the server worker: cashfreeRefundId('queue', refundId, provider_attempt)
      const refundId = await cashfreeRefundId('queue', c.refund_id, Number(c.provider_attempt ?? 0));
      const made = await createCfRefund({ orderId: c.provider_order_id, refundId, amountMinor: Number(c.amount_minor), note: String(c.reason ?? 'Order cancelled') });
      const upd = await db.rpc('ol_refund_provider_update', {
        p_refund: c.refund_id, p_provider: 'cashfree', p_merchant_ref: refundId, p_provider_refund_id: made.cfRefundId,
        p_provider_status: made.status || 'PENDING', p_source: 'worker', p_detail: null,
      });
      if (upd.error) throw new Error(upd.error.message);
      out.sent++;
      if ((upd.data as Record<string, unknown>)?.status === 'processed') out.processed++;
    } catch (error) {
      out.failed++;
      const message = error instanceof CashfreeError ? `${error.code || error.status} ${error.message}` : (error as Error)?.message ?? 'gateway error';
      // back in the queue with backoff; after MAX_ATTEMPTS it becomes an operations exception (ol_refund_requeue_failed)
      await db.rpc('ol_refund_fail', { p_refund: c.refund_id, p_error: String(message).slice(0, 280) });
    }
  }
  // one structured line per run (no amounts, no ids of people)
  console.log(JSON.stringify({ fn: 'ghost-order-refunder', ms: Date.now() - started, ...out }));
  return json(200, out);
});
