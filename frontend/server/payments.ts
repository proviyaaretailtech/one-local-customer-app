// Online payments through Razorpay (Orders API + Razorpay Checkout). Plain-English guide: docs/PAYMENTS.md.
//
//   1. POST /api/payments/order   saves our order as payment 'pending' (createOrder prices it) and opens
//                                 a Razorpay order for the SERVER's total — never the app's number.
//   2. The app opens Razorpay Checkout. Card numbers, UPI PINs and bank logins are typed into
//      Razorpay's own page; nothing of that passes through the app or this server.
//   3. POST /api/payments/verify  checks Razorpay's signature and marks the order paid.
//   4. POST /api/payments/webhook Razorpay tells us directly. This is the source of truth: if the app
//                                 was closed mid-payment, the order still ends up paid (or failed).
// Every step is safe to repeat: payment state only ever moves forward (store.ts updatePayment).
// With no Razorpay keys, online_payments is off, every route here answers 503 and checkout stays
// cash on delivery exactly as before.
import { caller } from './auth';
import { db, dbConfigured } from './db';
import { features } from './features';
import { customerKey, HttpError, limit, readBody } from './http';
import { createOrder, findPayment, ONLINE_METHODS, PaymentMethod, PaymentRecord, recordGatewayRefund, updatePayment } from './store';

const RAZORPAY = 'https://api.razorpay.com/v1';
const keys = () => ({
  id: process.env.RAZORPAY_KEY_ID?.trim() ?? '',
  secret: process.env.RAZORPAY_KEY_SECRET?.trim() ?? '',
  webhook: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? '',
});

function requireKeys() {
  const k = keys();
  if (!features().online_payments || !k.id || !k.secret) throw new HttpError(503, 'Online payment is not available right now. Please choose Pay on delivery.');
  return k;
}

const paise = (rupees: number) => Math.round(rupees * 100);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function razorpay<T>(path: string, body?: unknown): Promise<T> {
  const k = requireKeys();
  const r = await fetch(`${RAZORPAY}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${btoa(`${k.id}:${k.secret}`)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    // Only Razorpay's error code and short description are logged, never a payload.
    console.error('[payments] razorpay', path.split('/')[1], r.status, json?.error?.code, text(json?.error?.description, 200));
    throw new HttpError(502, 'Could not reach the payment service. No money was taken. Please try again.');
  }
  return json as T;
}

// ---------- Signatures ----------
// Razorpay signs with HMAC-SHA256 and sends the result as hex. crypto.subtle.verify recomputes it and
// compares in constant time, so a forged signature cannot be guessed byte by byte from timings.
export async function signatureOk(secret: string, message: string, signature: unknown): Promise<boolean> {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new Uint8Array(signature.match(/../g)!.map(h => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(message));
}

// ---------- What Razorpay Checkout opens on ----------
// The row the customer tapped (UPI app, card, net banking…) goes first as its own block; Razorpay's
// other methods stay below it, so a customer is never stuck if their pick fails. EMI and Pay Later
// only show when Razorpay has them switched on for the account.
export const UPI_APPS = ['google_pay', 'phonepe', 'paytm', 'bhim', 'whatsapp', 'id'] as const;
export type UpiApp = (typeof UPI_APPS)[number];
const BLOCK_NAMES: Record<string, string> = { upi: 'Pay by UPI', card: 'Credit & debit cards', netbanking: 'Netbanking', wallet: 'Wallets', paylater: 'Pay Later & EMI' };

function displayConfig(method: string, app: string) {
  const instruments = method === 'upi'
    ? [app === 'id' ? { method: 'upi', flows: ['collect'] } : (UPI_APPS as readonly string[]).includes(app) ? { method: 'upi', flows: ['intent', 'qr'], apps: [app] } : { method: 'upi' }]
    : method === 'paylater' ? [{ method: 'paylater' }, { method: 'cardless_emi' }, { method: 'emi' }]
    : [{ method }];
  return { display: { blocks: { chosen: { name: BLOCK_NAMES[method] ?? 'Pay', instruments } }, sequence: ['block.chosen'], preferences: { show_default_blocks: true } } };
}

// Everything Razorpay Checkout needs except the prefill (which stays in the app) and the callbacks.
function checkoutOptions(record: PaymentRecord, keyId: string, method: string, app: string) {
  return {
    key: keyId, order_id: record.razorpay_order_id, amount: paise(record.total), currency: 'INR',
    name: 'One Local', description: `Order #${record.id.slice(0, 8).toUpperCase()}`,
    notes: { order_id: record.id }, theme: { color: '#174D37' },
    config: (ONLINE_METHODS as readonly string[]).includes(method) ? displayConfig(method, app) : undefined,
  };
}

async function ownedOrder(request: Request, orderId: unknown): Promise<PaymentRecord> {
  const [{ matches }, record] = await Promise.all([caller(request), findPayment('id', text(orderId, 64))]);
  if (!record || !matches.includes(record.customer)) throw new HttpError(404, 'Order not found');
  return record;
}

// ---------- 1. Start a payment ----------
type StartBody = { payment_method?: unknown; upi_app?: unknown; prefill?: { name?: unknown; email?: unknown; contact?: unknown } };

export async function startPayment(request: Request, city: string) {
  const k = requireKeys();
  limit(customerKey(request) ?? 'anonymous', 'pay-start', 10, 60_000);
  const body = await readBody<StartBody>(request.clone());
  // Prices, coupon, the app's total check, idempotency and payment 'pending' all happen in createOrder.
  const order = await createOrder(request, city, true);
  let record = await findPayment('id', order.id);
  if (!record) throw new HttpError(500, 'Something went wrong. Please try again.');
  if (record.payment_method === 'cod') throw new HttpError(409, 'This order is already set to pay on delivery.');

  // A retry of the same checkout (same Idempotency-Key) reuses the Razorpay order: Razorpay allows
  // several attempts on one order and captures at most one, so the customer is never charged twice.
  if (!record.razorpay_order_id && record.payment_status !== 'paid') {
    const created = await razorpay<{ id: string; amount: number }>('/orders', {
      amount: paise(record.total), currency: 'INR', receipt: record.id, notes: { order_id: record.id },
    });
    if (created.amount !== paise(record.total)) throw new HttpError(502, 'Could not reach the payment service. No money was taken. Please try again.');
    await updatePayment(record.id, { razorpay_order_id: created.id }, ['pending', 'failed']);
    record = { ...record, razorpay_order_id: created.id };
  }

  const p = body.prefill ?? {};
  const email = text(p.email, 120), contact = text(p.contact, 15).replace(/\D/g, '');
  const prefill = { name: text(p.name, 80), email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '', contact: /^[6-9]\d{9}$/.test(contact) ? `+91${contact}` : '' };
  const method = text(body.payment_method, 20), app = text(body.upi_app, 20);
  return {
    order_id: record.id, payment_status: record.payment_status,
    razorpay_order_id: record.razorpay_order_id, key_id: k.id, amount: paise(record.total), currency: 'INR', prefill,
    checkout: checkoutOptions(record, k.id, method, app),
  };
}

// ---------- 2. The app reports a successful payment ----------
const PAYABLE = ['pending', 'failed', 'not_charged'] as const;

// Razorpay's own record of the payment: the method actually used and the amount actually taken.
// Best effort — if Razorpay cannot be reached the signature alone is proof enough (Razorpay's guidance),
// and the webhook will fill in the method.
async function fetchPayment(paymentId: string) {
  try { return await razorpay<{ amount: number; method: string; order_id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}`); }
  catch { return null; }
}

const KNOWN_METHODS: PaymentMethod[] = ['upi', 'card', 'netbanking', 'wallet', 'paylater', 'emi', 'cardless_emi'];
const asMethod = (m: unknown) => (KNOWN_METHODS.includes(m as PaymentMethod) ? (m as PaymentMethod) : undefined);

async function markPaid(record: PaymentRecord, paymentId: string, method: PaymentMethod | undefined) {
  const changed = await updatePayment(record.id, {
    payment_status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString(), payment_error: null, ...(method ? { payment_method: method } : {}),
  }, [...PAYABLE]);
  // Paid twice for one order (two tabs, two phones): keep the first, flag the second for a refund.
  if (!changed && record.razorpay_payment_id && record.razorpay_payment_id !== paymentId) {
    console.error('[payments] second payment on an already-paid order — refund it from the Razorpay dashboard', record.id, paymentId);
  }
}

export async function verifyPayment(request: Request) {
  const k = requireKeys();
  limit(customerKey(request) ?? 'anonymous', 'pay-verify', 20, 60_000);
  const b = await readBody<Record<string, unknown>>(request);
  const record = await ownedOrder(request, b.order_id);
  const rzpOrder = text(b.razorpay_order_id, 64), paymentId = text(b.razorpay_payment_id, 64);

  if (record.payment_status === 'paid' && record.razorpay_payment_id === paymentId) return { order_id: record.id, payment_status: 'paid' };
  if (!rzpOrder || rzpOrder !== record.razorpay_order_id || !(await signatureOk(k.secret, `${rzpOrder}|${paymentId}`, b.razorpay_signature))) {
    throw new HttpError(400, 'We could not confirm this payment. If money was taken it will be matched to your order shortly, or refunded.');
  }
  const payment = await fetchPayment(paymentId);
  if (payment && (payment.amount !== paise(record.total) || payment.order_id !== rzpOrder)) {
    console.error('[payments] amount mismatch on verify', record.id, payment.amount, paise(record.total));
    await updatePayment(record.id, { payment_error: 'Paid amount did not match the order' }, ['pending', 'failed']);
    throw new HttpError(409, 'The amount paid did not match your order. Our team will refund it. Please contact support.');
  }
  await markPaid(record, paymentId, asMethod(payment?.method));
  return { order_id: record.id, payment_status: 'paid' };
}

// ---------- Switch a failed or abandoned online payment to cash ----------
// The same order becomes cash on delivery rather than a second order being placed, so a payment that
// was only slow (and lands later through the webhook) can never leave the customer with two orders.
export async function switchToCash(request: Request) {
  limit(customerKey(request) ?? 'anonymous', 'pay-cash', 10, 60_000);
  const b = await readBody<Record<string, unknown>>(request);
  const record = await ownedOrder(request, b.order_id);
  if (record.payment_status === 'paid') return { order_id: record.id, payment_status: 'paid' };
  await updatePayment(record.id, { payment_method: 'cod', payment_status: 'not_charged', payment_error: null }, ['pending', 'failed']);
  const now = await findPayment('id', record.id);
  return { order_id: record.id, payment_status: now?.payment_status ?? 'not_charged' };
}

// ---------- 3. Razorpay tells us directly ----------
// Event ids already handled. Handling is idempotent anyway; this just skips the work and keeps an
// audit trail (ol_payment_events, migration 0025) — ids and outcome only, never the payload.
const g = globalThis as unknown as { __onecityPayEvents?: Set<string> };
const seenInMemory = (g.__onecityPayEvents ??= new Set());

async function alreadyHandled(eventId: string) {
  if (!eventId) return false;
  if (!dbConfigured()) return seenInMemory.has(eventId);
  const { data } = await db().from('ol_payment_events').select('event_id').eq('event_id', eventId).maybeSingle();
  return !!data;
}

async function remember(eventId: string, event: string, orderId: string | null, paymentId: string | null) {
  if (!eventId) return;
  if (!dbConfigured()) { if (seenInMemory.size > 10_000) seenInMemory.clear(); seenInMemory.add(eventId); return; }
  const { error } = await db().from('ol_payment_events').insert({ event_id: eventId, event, order_id: orderId, razorpay_payment_id: paymentId });
  if (error && error.code !== '23505') console.error('[payments] could not record webhook event', event, error.message);
}

type PaymentEntity = { id: string; order_id: string; amount: number; method?: string; notes?: Record<string, string>; error_description?: string };

export async function handleWebhook(request: Request) {
  limit('razorpay', 'pay-webhook', 600, 60_000);
  const secret = keys().webhook;
  if (!secret) throw new HttpError(503, 'Payment webhook is not set up');
  const raw = await request.text();
  if (raw.length > 256 * 1024) throw new HttpError(413, 'Request is too large');
  // The signature covers the exact bytes Razorpay sent, so it is checked before anything is parsed.
  if (!(await signatureOk(secret, raw, request.headers.get('x-razorpay-signature')))) throw new HttpError(400, 'Invalid signature');

  let body: { event?: string; payload?: { payment?: { entity?: PaymentEntity }; order?: { entity?: { id: string } }; refund?: { entity?: { id: string; payment_id: string; amount: number } } } };
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid body'); }
  const event = text(body.event, 60);
  const eventId = text(request.headers.get('x-razorpay-event-id'), 100);
  if (await alreadyHandled(eventId)) return { ok: true };

  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;
  let orderId: string | null = null;

  if (event === 'payment.captured' || event === 'order.paid' || event === 'payment.failed') {
    const rzpOrder = payment?.order_id || body.payload?.order?.entity?.id || '';
    const record = (await findPayment('razorpay_order_id', rzpOrder)) ?? (await findPayment('id', text(payment?.notes?.order_id, 64)));
    if (!payment || !record) {
      console.error('[payments] webhook for an order we do not know', event, rzpOrder);
    } else if (event === 'payment.failed') {
      orderId = record.id;
      await updatePayment(record.id, { payment_status: 'failed', payment_error: text(payment.error_description, 200) || 'Payment failed' }, ['pending']);
    } else if (payment.amount !== paise(record.total)) {
      orderId = record.id;
      console.error('[payments] amount mismatch on webhook', record.id, payment.amount, paise(record.total));
      await updatePayment(record.id, { payment_error: 'Paid amount did not match the order' }, ['pending', 'failed']);
    } else {
      orderId = record.id;
      await markPaid(record, payment.id, asMethod(payment.method));
    }
  } else if (event === 'refund.processed' && refund) {
    const record = await findPayment('razorpay_payment_id', refund.payment_id);
    if (record) { orderId = record.id; await recordGatewayRefund(record.id, refund.id, refund.amount / 100); }
    else console.error('[payments] refund for a payment we do not know', refund.id);
  }

  await remember(eventId, event, orderId, payment?.id ?? refund?.payment_id ?? null);
  return { ok: true };
}

// ---------- Checkout page for the phone app ----------
// The native app shows Razorpay Checkout inside a WebView (react-native-webview is already in the iOS
// build; the Razorpay native SDK would need a new build — see docs/PAYMENTS.md). The page is loaded with
// the customer's own headers, so only the owner can open it; the amount and ids come from our record.
// Name/phone/email are handed in by the app after load, so they never appear in a URL.
export async function checkoutPage(request: Request) {
  const k = requireKeys();
  limit(customerKey(request) ?? 'anonymous', 'pay-page', 20, 60_000);
  const url = new URL(request.url);
  const record = await ownedOrder(request, url.searchParams.get('order'));
  if (!record.razorpay_order_id || record.payment_status === 'paid' || record.payment_method === 'cod') throw new HttpError(409, 'This order has nothing left to pay.');
  const options = checkoutOptions(record, k.id, text(url.searchParams.get('method'), 20), text(url.searchParams.get('app'), 20));
  const safe = JSON.stringify(options).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pay securely</title><style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F8F9F5;color:#1A1A1A;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}p{max-width:280px;line-height:1.5}</style></head>
<body><p id="m">Opening secure payment…</p>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function () {
  var options = ${safe}, failure = '';
  function send(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function open(withConfig) {
    var o = Object.assign({}, options, {
      prefill: (window.__OL_PREFILL || {}),
      handler: function (r) { send({ type: 'success', razorpay_payment_id: r.razorpay_payment_id, razorpay_order_id: r.razorpay_order_id, razorpay_signature: r.razorpay_signature }); },
      modal: { confirm_close: true, ondismiss: function () { send(failure ? { type: 'failed', reason: failure } : { type: 'dismiss' }); } }
    });
    if (!withConfig) delete o.config;
    var rzp = new Razorpay(o);
    rzp.on('payment.failed', function (r) { failure = (r && r.error && r.error.description) || 'Payment failed'; });
    rzp.open();
  }
  if (typeof Razorpay === 'undefined') { document.getElementById('m').textContent = 'Could not load the payment page. Check your internet and try again.'; send({ type: 'failed', reason: 'Could not load the payment page' }); return; }
  // If Razorpay rejects the method shortcut (for example an app it does not list), open the full page instead.
  try { open(true); } catch (e) { open(false); }
})();
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
