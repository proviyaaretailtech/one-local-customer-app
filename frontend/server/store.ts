// Write side: orders, booking enquiries and support requests.
// TEMPORARY: held in server memory (lost on restart) until the Supabase tables are applied;
// then these functions write to Postgres and the routes stay the same.
import { applyCoupon, catalog, deliveryFee, findProduct } from './catalog';
import { caller } from './auth';
import { customerKey, HttpError, limit, readBody } from './http';

const PAYMENT_METHODS = ['cod', 'upi', 'card', 'netbanking'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type OrderItem = { id: string; name: string; weight: string; price: number; mrp: number; image: string; qty: number };
export type Order = {
  id: string; items: OrderItem[]; subtotal: number; discount: number; delivery_fee: number; total: number;
  coupon_code: string | null; payment_method: PaymentMethod; payment_status: 'not_charged'; status: string;
  rider_name: string; rider_phone: string; eta_minutes: number; created_at: string;
};
type Stored = Order & { city_id: string; customer: string; user_id: string | null };

type Memory = { orders: Stored[]; replies: Map<string, { fingerprint: string; order: Order; at: number }>; enquiries: object[]; support: object[] };
const g = globalThis as unknown as { __onecityStore?: Memory };
const mem: Memory = (g.__onecityStore ??= { orders: [], replies: new Map(), enquiries: [], support: [] } as Memory);

const publicOrder = ({ city_id, customer, user_id, ...order }: Stored): Order => ({
  ...order,
  // Keep images current if a product photo changed after the order was placed.
  items: order.items.map(i => ({ ...i, image: catalog.products.find(p => p.id === i.id)?.image ?? i.image })),
});

async function requireCustomer(request: Request) {
  const who = await caller(request);
  if (!who.owner) throw new HttpError(401, 'Please update the app and try again.');
  return { hash: who.owner, userId: who.userId };
}

// Prices, fees and discounts are always recomputed here; what the app sends is only a check.
export async function createOrder(request: Request, city: string): Promise<Order> {
  const customer = await requireCustomer(request);
  limit(customer.hash, 'order', 5, 60_000);
  const body = await readBody<{ items?: unknown; total?: unknown; coupon_code?: unknown; payment_method?: unknown }>(request);

  const idempotencyKey = request.headers.get('idempotency-key');
  const fingerprint = JSON.stringify(body);
  const replyKey = idempotencyKey ? `${customer.hash}:${idempotencyKey}` : null;
  if (replyKey) {
    const prior = mem.replies.get(replyKey);
    if (prior && Date.now() - prior.at < 86_400_000) {
      if (prior.fingerprint !== fingerprint) throw new HttpError(409, 'This checkout was already used for a different order.');
      return prior.order;
    }
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) throw new HttpError(400, 'Your cart is empty or too large.');
  const items: OrderItem[] = body.items.map((raw: unknown) => {
    const line = raw as { id?: unknown; qty?: unknown };
    const product = typeof line.id === 'string' ? findProduct(city, line.id) : undefined;
    if (!product) throw new HttpError(400, 'An item in your cart is no longer available. Please review your cart.');
    if (!Number.isInteger(line.qty) || (line.qty as number) < 1 || (line.qty as number) > 99) throw new HttpError(400, 'Please check the quantities in your cart.');
    return { id: product.id, name: product.name, weight: product.weight, price: product.price, mrp: product.mrp, image: product.image, qty: line.qty as number };
  });

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const fee = deliveryFee(subtotal);
  const code = typeof body.coupon_code === 'string' && body.coupon_code.trim() ? body.coupon_code.slice(0, 30) : null;
  const coupon = code ? applyCoupon(code, subtotal) : null;
  if (code && !coupon?.ok) throw new HttpError(409, coupon?.message || 'This coupon can no longer be used.');
  const discount = coupon?.discount ?? 0;
  const total = Math.max(subtotal + fee - discount, 0);
  if (typeof body.total === 'number' && Math.abs(body.total - total) > 0.5) throw new HttpError(409, 'Prices have changed. Please review your cart and try again.');

  const method = PAYMENT_METHODS.includes(body.payment_method as PaymentMethod) ? (body.payment_method as PaymentMethod) : 'cod';
  const order: Order = {
    id: crypto.randomUUID(), items, subtotal, discount, delivery_fee: fee, total,
    coupon_code: discount > 0 ? coupon!.coupon!.code : null, payment_method: method, payment_status: 'not_charged', status: 'placed',
    // No real rider exists yet; the tracking screen already says so.
    rider_name: 'Sample rider', rider_phone: '', eta_minutes: 10, created_at: new Date().toISOString(),
  };
  mem.orders.push({ ...order, city_id: city, customer: customer.hash, user_id: customer.userId });
  if (replyKey) mem.replies.set(replyKey, { fingerprint, order, at: Date.now() });
  return order;
}

// Only the account (or device) that placed an order can list or open it.
export async function listOrders(request: Request): Promise<Order[]> {
  const { matches } = await caller(request);
  return mem.orders.filter(o => matches.includes(o.customer)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map(publicOrder);
}

export async function getOrder(request: Request, id: string): Promise<Order> {
  const { matches } = await caller(request);
  const order = mem.orders.find(o => o.id === id && matches.includes(o.customer));
  if (!order) throw new HttpError(404, 'Order not found');
  return publicOrder(order);
}

// ---------- Book It enquiries ----------
export async function createEnquiry(request: Request) {
  limit(customerKey(request) ?? 'anonymous', 'enquiry', 5, 3_600_000);
  const b = await readBody<Record<string, unknown>>(request);
  const event = catalog.events.find(e => e.id === b.event_id);
  if (!event || typeof b.slot !== 'string' || !event.slots.includes(b.slot)) throw new HttpError(400, 'Choose an available event and time');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = new Date(today); last.setDate(last.getDate() + 30);
  const chosen = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? new Date(`${b.date}T00:00:00`) : null;
  if (!chosen || Number.isNaN(chosen.getTime()) || chosen < today || chosen > last) throw new HttpError(400, 'Choose a date within the next 30 days');
  if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 80) throw new HttpError(400, 'Enter your name');
  if (typeof b.phone !== 'string' || !/^[6-9][0-9]{9}$/.test(b.phone)) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
  if (!Number.isInteger(b.guests) || (b.guests as number) < 1 || (b.guests as number) > 8) throw new HttpError(400, 'Choose between 1 and 8 guests');
  const saved = { event_id: event.id, name: b.name, phone: b.phone, date: b.date, slot: b.slot, guests: b.guests, id: crypto.randomUUID(), status: 'demo_enquiry_saved', created_at: new Date().toISOString() };
  mem.enquiries.push(saved);
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
  mem.support.push({ topic: b.topic, message: b.message, reference, ...receipt });
  return receipt;
}
