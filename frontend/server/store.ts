// Write side: orders, booking enquiries and support requests.
// Backed by Postgres (ol_orders / ol_booking_enquiries / ol_support_requests) when Supabase is
// configured; falls back to in-process memory otherwise (e.g. `expo start` with no .env), so
// local UI work never needs a database. See db.ts / dbConfigured().
import { getCatalog } from './catalog';
import { caller } from './auth';
import { db, dbConfigured, fromDbError } from './db';
import { customerKey, HttpError, limit, readBody } from './http';
import { quote } from './pricing';
import { features } from './features';
import { placeById } from './geo';

// What the customer picks at checkout. 'cod' goes through POST /api/orders; every other choice
// goes through POST /api/payments/order and is only a preference — the method Razorpay reports
// for the actual payment (which can also be 'emi' or 'cardless_emi') is what gets stored.
export const ONLINE_METHODS = ['upi', 'card', 'netbanking', 'wallet', 'paylater'] as const;
export type PaymentMethod = 'cod' | (typeof ONLINE_METHODS)[number] | 'emi' | 'cardless_emi';
export type PaymentStatus = 'not_charged' | 'pending' | 'paid' | 'failed' | 'refunded';

export type OrderItem = { id: string; name: string; weight: string; price: number; mrp: number; image: string; qty: number };
export type Order = {
  id: string; items: OrderItem[]; subtotal: number; discount: number; delivery_fee: number; gst: number; total: number;
  coupon_code: string | null; payment_method: PaymentMethod; payment_status: PaymentStatus; status: string;
  rider_name: string; rider_phone: string; eta_minutes: number; created_at: string;
};
// Razorpay references live on the stored row only; the app never needs them on an order.
type RazorpayRefs = { razorpay_order_id: string | null; razorpay_payment_id: string | null; paid_at: string | null; payment_error: string | null };
type Stored = Order & RazorpayRefs & { city_id: string; customer: string; user_id: string | null };
const publicOrder = ({ city_id, customer, user_id, razorpay_order_id, razorpay_payment_id, paid_at, payment_error, ...order }: Stored): Order => order;

// ---------- In-memory fallback (no database configured) ----------
type Memory = { orders: Stored[]; replies: Map<string, { fingerprint: string; order: Order; at: number }>; enquiries: object[]; support: object[] };
const g = globalThis as unknown as { __onecityStore?: Memory };
const mem: Memory = (g.__onecityStore ??= { orders: [], replies: new Map(), enquiries: [], support: [] } as Memory);

async function freshenImages(order: Order): Promise<Order> {
  const catalog = await getCatalog();
  // Keep images current if a product photo changed after the order was placed.
  return { ...order, items: order.items.map(i => ({ ...i, image: catalog.products.find(p => p.id === i.id)?.image ?? i.image })) };
}

const rowToOrder = (row: Record<string, unknown>): Order => ({
  id: row.id as string, items: row.items as OrderItem[], subtotal: Number(row.subtotal), discount: Number(row.discount),
  delivery_fee: Number(row.delivery_fee), gst: Number(row.gst ?? 0), total: Number(row.total), coupon_code: (row.coupon_code as string) ?? null,
  payment_method: row.payment_method as PaymentMethod, payment_status: (row.payment_status as PaymentStatus) ?? 'not_charged', status: row.status as string,
  rider_name: (row.rider_name as string) ?? 'Sample rider', rider_phone: (row.rider_phone as string) ?? '',
  eta_minutes: (row.eta_minutes as number) ?? 10, created_at: row.created_at as string,
});

async function requireCustomer(request: Request) {
  const who = await caller(request);
  if (!who.owner) throw new HttpError(401, 'Please update the app and try again.');
  return { hash: who.owner, userId: who.userId };
}

// Prices, fees and discounts are always recomputed here; what the app sends is only a check.
// `online` is set by POST /api/payments/order: the order is saved with payment 'pending' and only
// becomes real (shown in the customer's list) once Razorpay confirms the money (payments.ts).
export async function createOrder(request: Request, city: string, online = false): Promise<Order> {
  const customer = await requireCustomer(request);
  limit(customer.hash, 'order', 5, 60_000);
  const body = await readBody<{ items?: unknown; total?: unknown; coupon_code?: unknown; payment_method?: unknown }>(request);

  const idempotencyKey = request.headers.get('idempotency-key');
  const fingerprint = JSON.stringify(body);

  if (!dbConfigured()) {
    const replyKey = idempotencyKey ? `${customer.hash}:${idempotencyKey}` : null;
    if (replyKey) {
      const prior = mem.replies.get(replyKey);
      if (prior && Date.now() - prior.at < 86_400_000) {
        if (prior.fingerprint !== fingerprint) throw new HttpError(409, 'This checkout was already used for a different order.');
        return prior.order;
      }
    }
    const order = await buildOrder(body, city, online);
    mem.orders.push({ ...order, city_id: city, customer: customer.hash, user_id: customer.userId, razorpay_order_id: null, razorpay_payment_id: null, paid_at: null, payment_error: null });
    if (replyKey) mem.replies.set(replyKey, { fingerprint, order, at: Date.now() });
    return order;
  }

  // With a database, the unique index on (customer_hash, idempotency_key) does the
  // deduplication: a retry with the same key returns the row the first attempt created.
  if (idempotencyKey) {
    const { data: existing } = await db().from('ol_orders').select('*')
      .eq('customer_hash', customer.hash).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existing) {
      if (JSON.stringify({ items: existing.items, total: Number(existing.total), coupon_code: existing.coupon_code, payment_method: existing.payment_method }) !== fingerprint) {
        // best-effort check only; recomputed totals may legitimately differ in shape from the raw body
      }
      return freshenImages(rowToOrder(existing));
    }
  }

  const order = await buildOrder(body, city, online);
  const { data, error } = await db().from('ol_orders').insert({
    id: order.id, customer_hash: customer.hash, user_id: customer.userId, items: order.items,
    subtotal: order.subtotal, discount: order.discount, delivery_fee: order.delivery_fee, gst: order.gst, total: order.total,
    coupon_code: order.coupon_code, payment_method: order.payment_method, payment_status: order.payment_status,
    status: 'placed', rider_name: order.rider_name, rider_phone: order.rider_phone, eta_minutes: order.eta_minutes,
    idempotency_key: idempotencyKey || null, city_id: city, created_at: order.created_at,
  }).select().single();
  if (error) {
    // A concurrent retry can lose the race on the unique index; fetch what the winner wrote.
    if (idempotencyKey && error.code === '23505') {
      const { data: won } = await db().from('ol_orders').select('*').eq('customer_hash', customer.hash).eq('idempotency_key', idempotencyKey).single();
      if (won) return freshenImages(rowToOrder(won));
    }
    fromDbError(error);
  }

  // Normalized lines alongside the jsonb cache on ol_orders.items — the source for refunds,
  // per-item analytics and reconciliation. Best-effort: the order itself is already committed
  // above, so a failure here is logged, not surfaced to the customer.
  const { error: lineError } = await db().from('ol_order_items').insert(
    order.items.map(i => ({ order_id: order.id, product_id: i.id, name: i.name, weight: i.weight, image: i.image, price: i.price, mrp: i.mrp, qty: i.qty })),
  );
  if (lineError) console.error('[store] ol_order_items insert failed for order', order.id, lineError.message);

  return order;
}

// A whole-order or single-line refund. Called from support tooling, not directly by the app yet.
export async function refundOrder(orderId: string, amount: number, reason: string, actorUserId: string | null, orderItemId?: string, method: 'original' | 'wallet' | 'manual' = 'original') {
  if (!dbConfigured()) throw new HttpError(503, 'Refunds need the database to be connected.');
  const { data, error } = await db().rpc('ol_process_refund', {
    p_order: orderId, p_item: orderItemId ?? null, p_amount: amount, p_reason: reason, p_actor: actorUserId, p_method: method,
  });
  if (error) fromDbError(error);
  return data as { refund_id: string; amount: number; order_payment_status: string; refunded_so_far: number; order_total: number };
}

// ---------- Payment state (read and written by payments.ts) ----------
export type PaymentRecord = RazorpayRefs & { id: string; customer: string; total: number; payment_method: PaymentMethod; payment_status: PaymentStatus };
const PAYMENT_COLUMNS = 'id, customer_hash, total, payment_method, payment_status, razorpay_order_id, razorpay_payment_id, paid_at, payment_error';

export async function findPayment(by: 'id' | 'razorpay_order_id' | 'razorpay_payment_id', value: string): Promise<PaymentRecord | null> {
  if (!value) return null;
  if (!dbConfigured()) {
    const o = mem.orders.find(x => x[by] === value);
    return o ? { id: o.id, customer: o.customer, total: o.total, payment_method: o.payment_method, payment_status: o.payment_status,
      razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: o.razorpay_payment_id, paid_at: o.paid_at, payment_error: o.payment_error } : null;
  }
  if (by === 'id' && !/^[0-9a-f-]{36}$/i.test(value)) return null;
  const { data, error } = await db().from('ol_orders').select(PAYMENT_COLUMNS).eq(by, value).maybeSingle();
  if (error) fromDbError(error);
  if (!data) return null;
  const { customer_hash, total, ...rest } = data as Record<string, unknown>;
  return { ...(rest as Omit<PaymentRecord, 'customer' | 'total'>), customer: customer_hash as string, total: Number(total) };
}

// Changes an order's payment fields, but only while its payment is in one of `from` — which is
// what makes /verify and the webhook safe to repeat or to race each other. True if it changed.
export async function updatePayment(id: string, patch: Partial<RazorpayRefs & { payment_method: PaymentMethod; payment_status: PaymentStatus }>, from: PaymentStatus[]): Promise<boolean> {
  if (!dbConfigured()) {
    const o = mem.orders.find(x => x.id === id);
    if (!o || !from.includes(o.payment_status)) return false;
    Object.assign(o, patch);
    return true;
  }
  const { data, error } = await db().from('ol_orders').update(patch).eq('id', id).in('payment_status', from).select('id');
  if (error) fromDbError(error);
  return !!data?.length;
}

// A refund made in the Razorpay dashboard (or by a later refund API call) has already moved the
// money, so it goes straight into the ledger as processed, whatever state the order is in. The
// Razorpay refund id is the reference, so a repeated webhook cannot record it twice.
export async function recordGatewayRefund(orderId: string, refundId: string, amount: number) {
  if (!dbConfigured()) {
    const o = mem.orders.find(x => x.id === orderId);
    if (o && amount >= o.total) o.payment_status = 'refunded';
    return;
  }
  const now = new Date().toISOString();
  const { data: known } = await db().from('ol_refunds').select('id, status').eq('reference', refundId).maybeSingle();
  if (known) {
    if (known.status !== 'processed') await db().from('ol_refunds').update({ status: 'processed', processed_at: now }).eq('id', known.id);
  } else {
    const { error } = await db().from('ol_refunds').insert({ order_id: orderId, amount, reason: 'Refunded through Razorpay', method: 'original', status: 'processed', reference: refundId, created_at: now, processed_at: now });
    if (error && error.code !== '23505') fromDbError(error);
  }
  const [{ data: order }, { data: refunds }] = await Promise.all([
    db().from('ol_orders').select('total').eq('id', orderId).maybeSingle(),
    db().from('ol_refunds').select('amount').eq('order_id', orderId).eq('status', 'processed'),
  ]);
  const refunded = (refunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  if (order && refunded >= Number(order.total)) await db().from('ol_orders').update({ payment_status: 'refunded' }).eq('id', orderId);
}

// Same bill the cart showed (pricing.ts); the app's total is only a check that nothing changed.
async function buildOrder(body: { items?: unknown; total?: unknown; coupon_code?: unknown; payment_method?: unknown }, city: string, online: boolean): Promise<Order> {
  const bill = await quote(city, body.items, body.coupon_code);
  if (bill.coupon && !bill.coupon.ok) throw new HttpError(409, bill.coupon.message || 'This coupon can no longer be used.');
  if (typeof body.total === 'number' && Math.abs(body.total - bill.total) > 0.5) throw new HttpError(409, 'Prices have changed. Please review your cart and try again.');

  // A plain order is always cash on delivery whatever the app sends; an online method is only
  // accepted on the payments path, so no order can claim 'upi' without a payment behind it.
  if (online && !(features().online_payments && (ONLINE_METHODS as readonly string[]).includes(body.payment_method as string))) {
    throw new HttpError(400, 'Choose how you want to pay.');
  }
  const method = online ? (body.payment_method as PaymentMethod) : 'cod';
  return {
    id: crypto.randomUUID(),
    items: bill.lines.map(l => ({ id: l.id, name: l.name, weight: l.weight, price: l.price, mrp: l.mrp, image: l.image, qty: l.qty })),
    subtotal: bill.item_total, discount: bill.discount, delivery_fee: bill.delivery_fee, gst: bill.gst_added.total, total: bill.total,
    coupon_code: bill.discount > 0 ? bill.coupon!.code : null, payment_method: method, payment_status: online ? 'pending' : 'not_charged', status: 'placed',
    // No real rider exists yet; the tracking screen already says so.
    rider_name: 'Sample rider', rider_phone: '', eta_minutes: 10, created_at: new Date().toISOString(),
  };
}

// Only the account (or device) that placed an order can list or open it. An online attempt that
// was never paid is not an order yet, so it stays out of the list (it can still be opened by id,
// which is how the checkout checks whether a payment went through after all).
const UNPAID: PaymentStatus[] = ['pending', 'failed'];
export async function listOrders(request: Request): Promise<Order[]> {
  const { matches } = await caller(request);
  if (!matches.length) return [];

  if (!dbConfigured()) {
    return mem.orders.filter(o => matches.includes(o.customer) && !UNPAID.includes(o.payment_status)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
      .map(publicOrder);
  }

  const { data, error } = await db().from('ol_orders').select('*').in('customer_hash', matches)
    .not('payment_status', 'in', `(${UNPAID.join(',')})`).order('created_at', { ascending: false }).limit(200);
  if (error) fromDbError(error);
  const catalog = await getCatalog();
  return (data ?? []).map(row => {
    const order = rowToOrder(row);
    return { ...order, items: order.items.map(i => ({ ...i, image: catalog.products.find(p => p.id === i.id)?.image ?? i.image })) };
  });
}

export async function getOrder(request: Request, id: string): Promise<Order> {
  const { matches } = await caller(request);

  if (!dbConfigured()) {
    const order = mem.orders.find(o => o.id === id && matches.includes(o.customer));
    if (!order) throw new HttpError(404, 'Order not found');
    return freshenImages(publicOrder(order));
  }

  if (!matches.length || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Order not found');
  const { data, error } = await db().from('ol_orders').select('*').eq('id', id).in('customer_hash', matches).maybeSingle();
  if (error) fromDbError(error);
  if (!data) throw new HttpError(404, 'Order not found');
  return freshenImages(rowToOrder(data));
}

// ---------- Book It enquiries ----------
export async function createEnquiry(request: Request) {
  limit(customerKey(request) ?? 'anonymous', 'enquiry', 5, 3_600_000);
  const b = await readBody<Record<string, unknown>>(request);
  const catalog = await getCatalog();
  const event = catalog.events.find(e => e.id === b.event_id);
  if (!event || typeof b.slot !== 'string' || !event.slots.includes(b.slot)) throw new HttpError(400, 'Choose an available event and time');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = new Date(today); last.setDate(last.getDate() + 30);
  const chosen = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? new Date(`${b.date}T00:00:00`) : null;
  if (!chosen || Number.isNaN(chosen.getTime()) || chosen < today || chosen > last) throw new HttpError(400, 'Choose a date within the next 30 days');
  if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 80) throw new HttpError(400, 'Enter your name');
  if (typeof b.phone !== 'string' || !/^[6-9][0-9]{9}$/.test(b.phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
  if (!Number.isInteger(b.guests) || (b.guests as number) < 1 || (b.guests as number) > 8) throw new HttpError(400, 'Choose between 1 and 8 guests');

  const { hash, userId } = await caller(request).then(c => ({ hash: c.owner, userId: c.userId }));
  const saved = { event_id: event.id, name: b.name, phone: b.phone, date: b.date, slot: b.slot, guests: b.guests, id: crypto.randomUUID(), status: 'demo_enquiry_saved', created_at: new Date().toISOString() };

  if (!dbConfigured()) { mem.enquiries.push(saved); return saved; }
  const { error } = await db().from('ol_booking_enquiries').insert({
    id: saved.id, event_id: saved.event_id, name: saved.name, phone: saved.phone, date: saved.date,
    slot: saved.slot, guests: saved.guests, status: saved.status, customer_hash: hash, user_id: userId, created_at: saved.created_at,
  });
  if (error) fromDbError(error);
  return saved;
}

// ---------- Help & support ----------
const TOPICS = ['order', 'payment', 'profile', 'other'];

export async function createSupportRequest(request: Request) {
  limit(customerKey(request) ?? 'anonymous', 'support', 5, 3_600_000);
  const b = await readBody<Record<string, unknown>>(request);
  if (typeof b.topic !== 'string' || !TOPICS.includes(b.topic)) throw new HttpError(400, 'Choose a topic');
  if (typeof b.message !== 'string' || b.message.trim().length < 10 || b.message.length > 2000) throw new HttpError(400, 'Please describe your question in at least 10 characters');
  const reference = typeof b.reference === 'string' ? b.reference.slice(0, 100) : '';
  const receipt = { id: crypto.randomUUID(), status: 'saved_for_review', created_at: new Date().toISOString() };

  const { hash, userId } = await caller(request).then(c => ({ hash: c.owner, userId: c.userId }));
  if (!dbConfigured()) { mem.support.push({ topic: b.topic, message: b.message, reference, ...receipt }); return receipt; }
  const { error } = await db().from('ol_support_requests').insert({
    id: receipt.id, topic: b.topic, message: b.message, reference, status: receipt.status,
    customer_hash: hash, user_id: userId, created_at: receipt.created_at,
  });
  if (error) fromDbError(error);
  return receipt;
}

// "Launch One Local here" from a discover-only place. Kept in the help-request table (topic
// 'other', reference 'launch:<place id>') so the demand list needs no new table yet; the Master
// can count requests per place with one query.
export async function createLaunchRequest(request: Request) {
  limit(customerKey(request) ?? 'anonymous', 'launch', 3, 86_400_000);
  const b = await readBody<Record<string, unknown>>(request);
  const place = placeById(typeof b.place_id === 'string' ? b.place_id : '');
  const where = [place.name, place.district, place.state].filter(Boolean).join(', ');
  const receipt = { id: crypto.randomUUID(), status: 'saved_for_review', created_at: new Date().toISOString(), place: where };
  const message = `Please launch One Local in ${where} (${place.lat}, ${place.lng}).`;
  const reference = `launch:${place.id}`.slice(0, 100);

  const { hash, userId } = await caller(request).then(c => ({ hash: c.owner, userId: c.userId }));
  if (!dbConfigured()) { mem.support.push({ topic: 'other', message, reference, ...receipt }); return receipt; }
  const { error } = await db().from('ol_support_requests').insert({
    id: receipt.id, topic: 'other', message, reference, status: receipt.status,
    customer_hash: hash, user_id: userId, created_at: receipt.created_at,
  });
  if (error) fromDbError(error);
  return receipt;
}
