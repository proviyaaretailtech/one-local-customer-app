// Dispatch: every successful delivery order pings the rider pool until a driver is assigned.
// Contract: "One Local Delivery app /docs/RIDER_DISPATCH_CONTRACT.md". Tables and atomic functions:
// db/migrations/0029_ol_dispatch.sql. This file only validates, shapes and notifies; every state
// change is one database function, so two taps or two servers can never both win.
//
// Three callers:
//   * the order flow (store.ts on a cash order, payments.ts when money is confirmed) calls
//     dispatchOrders() in-process the moment an order is successful;
//   * other services (VINII, operations tooling) call the same thing over HTTP, /api/dispatch/*,
//     signed with a service credential (serviceRequest below) — never with a user's token;
//   * riders answer offers through /api/rider/* (rider.ts).
// An order never fails because dispatch is down: the hook logs, the order stays, and the sweep
// (POST /api/dispatch/sweep, also run from rider heartbeats) retries any order that has no job yet.
import { distanceKm, serviceability } from './catalog';
import { db, dbConfigured, fromDbError, rpc } from './db';
import { HttpError, hmacHex, sha256, signatureOk } from './http';
import { pushToRestaurant, pushToRider } from './push';

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (detail: string) => new HttpError(400, detail, undefined, 'invalid_payload');

// ---------- Configuration ----------
// DISPATCH_SERVICE_TOKEN   bearer credential of the services allowed to call /api/dispatch/*
// DISPATCH_SIGNING_SECRET  HMAC secret for X-Signature (also derives delivery codes unless DISPATCH_OTP_SECRET is set)
// DISPATCH_ALLOWED_ORGS    optional comma list of organization ids the credential may dispatch for ('*' = also stores with no merchant)
const env = () => ({
  token: process.env.DISPATCH_SERVICE_TOKEN?.trim() ?? '',
  secret: process.env.DISPATCH_SIGNING_SECRET?.trim() ?? '',
  otpSecret: process.env.DISPATCH_OTP_SECRET?.trim() || process.env.DISPATCH_SIGNING_SECRET?.trim() || '',
  orgs: (process.env.DISPATCH_ALLOWED_ORGS ?? '').split(',').map(s => s.trim()).filter(Boolean),
});
export const dispatchConfigured = () => dbConfigured() && !!env().otpSecret;

// ---------- Service credential ----------
const sameSecret = async (a: string, b: string) => (await hmacHex('compare', a)) === (await hmacHex('compare', b));
const MAX_SKEW_MS = 5 * 60_000;

export type ServiceCall = { requestId: string; idempotencyKey: string | null; body: Row; allowOrg: (organizationId: unknown) => void };

// Bearer token + X-Timestamp + X-Signature = HMAC-SHA256(secret, timestamp + "." + raw body). A user's
// JWT is not the service token, so it is refused here whatever it is valid for elsewhere.
export async function serviceRequest(request: Request, opts: { write: boolean }): Promise<ServiceCall> {
  const { token, secret, orgs } = env();
  if (!token || !secret) throw new HttpError(503, 'Dispatch is not set up on this server yet.', undefined, 'not_configured');
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !(await sameSecret(auth.slice(7).trim(), token))) throw new HttpError(401, 'Not allowed.', undefined, 'unauthorized');

  const requestId = request.headers.get('x-request-id')?.trim() ?? '';
  if (!/^[\w:.-]{1,128}$/.test(requestId)) throw new HttpError(400, 'X-Request-Id is required.', undefined, 'invalid_request');
  const stamp = request.headers.get('x-timestamp')?.trim() ?? '';
  const sent = /^\d{10}$/.test(stamp) ? Number(stamp) * 1000 : Date.parse(stamp);
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > MAX_SKEW_MS) throw new HttpError(401, 'The request is too old or has no valid X-Timestamp.', undefined, 'stale_request');

  const raw = await request.text();
  if (raw.length > 64 * 1024) throw new HttpError(413, 'Request is too large');
  if (!(await signatureOk(secret, `${stamp}.${raw}`, request.headers.get('x-signature')))) throw new HttpError(401, 'The signature does not match.', undefined, 'bad_signature');

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null;
  if (opts.write && (!idempotencyKey || !/^[\w:.-]{8,200}$/.test(idempotencyKey))) throw new HttpError(400, 'Idempotency-Key is required.', undefined, 'invalid_request');

  let body: Row = {};
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = []; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Request body must be a JSON object');
  }
  const allowOrg = (organizationId: unknown) => {
    if (!orgs.length || (orgs.includes('*') && !organizationId)) return;
    if (!organizationId || !orgs.includes(String(organizationId))) throw new HttpError(403, 'This credential may not dispatch for that organization.', undefined, 'organization_not_allowed');
  };
  return { requestId, idempotencyKey, body, allowOrg };
}

// ---------- The delivery code ----------
// The customer's 4-digit code is derived from the order, never stored: the database keeps only a hash
// to check it against. One Local shows the code to the customer with deliveryOtp(); the rider never
// receives it, only types what the customer tells them.
export async function deliveryOtp(olOrderId: string): Promise<string> {
  const secret = env().otpSecret;
  if (!secret) throw new HttpError(503, 'Dispatch is not set up on this server yet.', undefined, 'not_configured');
  const digest = await hmacHex(secret, `delivery-otp:${olOrderId}`);
  return String(parseInt(digest.slice(0, 8), 16) % 10_000).padStart(4, '0');
}
export const otpHash = async (olOrderId: string, code: string) => sha256(`${code}:${olOrderId}`);

// ---------- Creating the job ----------
export type JobPayload = {
  ol_order_id: string; pos_order_id: string | null; organization_id: string | null; store_id: string | null;
  order_no: string | null; kitchen_no: string | null; payment_mode: 'cod' | 'online'; cash_to_collect: number;
  items: { count: number; temperature: 'hot' | 'cold' | 'ambient' }; prep_minutes: number | null; promised_by: string | null;
  pickup: { name: string; address: string | null; lat: number; lng: number; phone: string | null };
  drop: { area: string | null; address: string | null; lat: number; lng: number; instructions: string | null; customer_first_name: string | null; customer_phone: string | null };
  vehicle: string; dispatch_trigger: 'placed' | 'accepted';
};

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
function coordinate(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

// What POST /api/dispatch/jobs accepts (contract 2.1). Errors name the field.
export function parseJobPayload(b: Row): JobPayload {
  if (typeof b.ol_order_id !== 'string' || !UUID.test(b.ol_order_id)) throw bad('ol_order_id must be a uuid');
  for (const k of ['pos_order_id', 'organization_id'] as const) if (b[k] != null && (typeof b[k] !== 'string' || !UUID.test(b[k]))) throw bad(`${k} must be a uuid`);
  if (b.payment_mode !== 'cod' && b.payment_mode !== 'online') throw bad('payment_mode must be cod or online');
  const cash = b.cash_to_collect ?? 0;
  if (typeof cash !== 'number' || !Number.isFinite(cash) || cash < 0 || cash > 100_000) throw bad('cash_to_collect must be a number from 0');
  if (b.payment_mode === 'online' && cash !== 0) throw bad('cash_to_collect must be 0 for an order already paid online');
  const items = (b.items ?? {}) as Row;
  const count = items.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 500) throw bad('items.count must be a whole number from 1');
  const temperature = items.temperature ?? 'ambient';
  if (!['hot', 'cold', 'ambient'].includes(temperature)) throw bad('items.temperature must be hot, cold or ambient');
  const prep = b.prep_minutes ?? null;
  if (prep !== null && (!Number.isInteger(prep) || prep < 0 || prep > 240)) throw bad('prep_minutes must be 0 to 240');
  const promised = b.promised_by == null ? null : Number.isFinite(Date.parse(String(b.promised_by))) ? new Date(String(b.promised_by)).toISOString() : (() => { throw bad('promised_by must be a date and time'); })();
  const vehicle = b.vehicle ?? 'any';
  if (!['any', 'bike', 'scooter', 'cycle', 'car'].includes(vehicle)) throw bad('vehicle must be any, bike, scooter, cycle or car');
  const trigger = b.dispatch_trigger ?? 'placed';
  if (trigger !== 'placed' && trigger !== 'accepted') throw bad('dispatch_trigger must be placed or accepted');

  const pickup = (b.pickup ?? {}) as Row, drop = (b.drop ?? {}) as Row;
  const pickupName = text(pickup.name, 120);
  if (!pickupName) throw bad('pickup.name is required');
  const pLat = coordinate(pickup.lat, -90, 90), pLng = coordinate(pickup.lng, -180, 180);
  if (pLat === null || pLng === null) throw new HttpError(422, 'The restaurant has no map location yet, so a rider cannot be sent.', undefined, 'no_pickup_location');
  const dLat = coordinate(drop.lat, -90, 90), dLng = coordinate(drop.lng, -180, 180);
  if (dLat === null || dLng === null) throw bad('drop.lat and drop.lng are required: a rider navigates to a map point, not to text');
  if (!serviceability({ lat: dLat, lng: dLng }).serviceable) throw new HttpError(422, 'That address is outside the delivery area.', undefined, 'outside_delivery_area');

  return {
    ol_order_id: b.ol_order_id, pos_order_id: b.pos_order_id ?? null, organization_id: b.organization_id ?? null, store_id: text(b.store_id, 120),
    order_no: text(b.order_no, 40), kitchen_no: text(b.kitchen_no, 40), payment_mode: b.payment_mode, cash_to_collect: Math.round(cash * 100) / 100,
    items: { count, temperature }, prep_minutes: prep, promised_by: promised,
    pickup: { name: pickupName, address: text(pickup.address, 300), lat: pLat, lng: pLng, phone: text(pickup.phone, 20) },
    drop: {
      area: text(drop.area, 120), address: text(drop.address, 300), lat: dLat, lng: dLng, instructions: text(drop.instructions, 300),
      customer_first_name: text(drop.customer_first_name, 60), customer_phone: text(drop.customer_phone, 20),
    },
    vehicle, dispatch_trigger: trigger,
  };
}

type Created = { job_id: string; status: string; version: number; replayed: boolean; dispatch_trigger: string; released: boolean };

// The one entry point for "a delivery order is successful". Idempotent per order.
export async function createJob(payload: JobPayload, requestId: string) {
  const otp = await otpHash(payload.ol_order_id, await deliveryOtp(payload.ol_order_id));
  const created = await rpc<Created>('dispatch_create_job', { p: { ...payload, otp_hash: otp, request_id: requestId } });
  // Trigger 'placed': ping the pool now. Also heals a job whose first attempt died between create and release.
  if (created.dispatch_trigger === 'placed' && !created.released) {
    await releaseJob(created.job_id, payload.prep_minutes, null, requestId);
  }
  return { created: !created.replayed, job: await jobView(created.job_id) };
}

// ---------- Offering to riders ----------
type Offer = { result: 'offered' | 'waiting' | 'no_rider' | 'not_open' | 'not_released'; assignment_id?: string; rider_id?: string; round?: number; expires_at?: string; auto?: boolean; escalated?: boolean; status?: string };

// What happens after the database picked (or failed to pick) a rider: ring them, or auto-assign, or alert.
async function afterOffer(jobId: string, offer: Offer, requestId: string): Promise<Offer> {
  if (offer.result === 'offered' && offer.rider_id && offer.assignment_id) {
    const { data: job } = await db().from('delivery_jobs').select('pickup_name, drop_area, cash_to_collect, items_count').eq('id', jobId).maybeSingle();
    if (offer.auto) {
      try {
        await rpc('dispatch_answer', { p_assignment: offer.assignment_id, p_rider: offer.rider_id, p_accept: true, p_reason: null, p_request_id: requestId });
        await pushToRider(offer.rider_id, { title: 'New job assigned', body: `${job?.pickup_name ?? 'Pickup'} → ${job?.drop_area ?? 'customer'}`, data: { type: 'job_assigned', job_id: jobId } });
        return { ...offer, result: 'offered', status: 'assigned' };
      } catch (error) {
        // Someone else took it, or it lapsed: the sweep moves on. Never fatal.
        console.warn('[dispatch] auto-accept failed', jobId, error instanceof HttpError ? error.detail : error);
        return offer;
      }
    }
    await pushToRider(offer.rider_id, {
      title: 'New delivery job',
      body: `${job?.pickup_name ?? 'Pickup'} → ${job?.drop_area ?? 'customer'}${job?.cash_to_collect ? ` · collect ₹${Math.round(Number(job.cash_to_collect))}` : ''}`,
      data: { type: 'job_offer', job_id: jobId, offer_id: offer.assignment_id, expires_at: offer.expires_at },
    });
  } else if (offer.result === 'no_rider' && !offer.escalated) {
    const { data: job } = await db().from('delivery_jobs').select('organization_id, order_no').eq('id', jobId).maybeSingle();
    if (job?.organization_id) {
      await pushToRestaurant(job.organization_id, { title: 'No rider found yet', body: `Order ${job.order_no ?? ''} is waiting for a rider. We are on it.`, data: { type: 'no_rider', job_id: jobId } });
    }
  }
  return offer;
}

// Move a released job to its next step: lapse an overdue offer, offer to the next rider, or escalate.
export async function advanceJob(jobId: string, requestId: string): Promise<Offer> {
  return afterOffer(jobId, await rpc<Offer>('dispatch_offer_next', { p_job: jobId, p_request_id: requestId }), requestId);
}

export async function releaseJob(jobId: string, prepMinutes: number | null, expectedVersion: number | null, requestId: string): Promise<Offer> {
  const offer = await rpc<Offer>('dispatch_release', { p_job: jobId, p_prep: prepMinutes, p_expected: expectedVersion, p_request_id: requestId });
  return afterOffer(jobId, offer, requestId);
}

export async function cancelJob(jobId: string, reason: string, expectedVersion: number | null, requestId: string) {
  // Who to tell that the card should close: a rider with a live offer, or the assigned rider.
  const [{ data: live }, { data: job }] = await Promise.all([
    db().from('delivery_assignments').select('rider_id').eq('job_id', jobId).is('outcome', null).maybeSingle(),
    db().from('delivery_jobs').select('rider_id').eq('id', jobId).maybeSingle(),
  ]);
  const result = await rpc<{ status: string; version: number; replayed: boolean }>('dispatch_cancel', { p_job: jobId, p_reason: reason, p_expected: expectedVersion, p_request_id: requestId });
  const rider = job?.rider_id ?? live?.rider_id;
  if (rider && !result.replayed) await pushToRider(rider as string, { title: 'Order cancelled', body: 'This delivery was cancelled.', data: { type: 'job_cancelled', job_id: jobId }, sound: false });
  return { ...result, job: await jobView(jobId) };
}

// ---------- Reading a job ----------
const SPEED_KMH = 20;
const first = (name: unknown) => String(name ?? '').trim().split(/\s+/)[0] || null;

async function loadJob(key: { id?: string; ol_order_id?: string }): Promise<Row> {
  const value = key.id ?? key.ol_order_id ?? '';
  if (!UUID.test(value)) throw new HttpError(404, 'Job not found', undefined, 'not_found');
  const { data, error } = await db().from('delivery_jobs').select('*').eq(key.id ? 'id' : 'ol_order_id', value).maybeSingle();
  if (error) fromDbError(error);
  if (!data) throw new HttpError(404, 'Job not found', undefined, 'not_found');
  return data;
}

// What One Local's tracking screen and VINII's order detail read (contract 2.3). No rider phone.
export async function jobView(jobId: string, by: 'id' | 'ol_order_id' = 'id') {
  const job = await loadJob(by === 'id' ? { id: jobId } : { ol_order_id: jobId });
  const [{ data: assignments }, { data: events }] = await Promise.all([
    db().from('delivery_assignments').select('round, outcome').eq('job_id', job.id).order('round', { ascending: false }).limit(1),
    db().from('delivery_events').select('kind, created_at').eq('job_id', job.id).order('id'),
  ]);
  let rider: Row | null = null, eta: number | null = null;
  if (job.rider_id) {
    const [{ data: r }, { data: a }] = await Promise.all([
      db().from('riders').select('full_name, vehicle').eq('id', job.rider_id).maybeSingle(),
      db().from('rider_availability').select('lat, lng, last_seen_at').eq('rider_id', job.rider_id).maybeSingle(),
    ]);
    rider = { first_name: first(r?.full_name), vehicle: r?.vehicle ?? null, lat: a?.lat ?? null, lng: a?.lng ?? null, seen_at: a?.last_seen_at ?? null };
    if (a?.lat != null && a?.lng != null) {
      const target = ['picked_up', 'at_drop'].includes(job.status) ? { lat: job.drop_lat, lng: job.drop_lng } : { lat: job.pickup_lat, lng: job.pickup_lng };
      eta = Math.max(1, Math.ceil((distanceKm({ lat: a.lat, lng: a.lng }, target) / SPEED_KMH) * 60));
    }
  }
  const last = assignments?.[0];
  const offerState = job.status === 'cancelled' ? 'cancelled' : job.rider_id ? 'accepted' : job.escalated_at ? 'no_rider' : !job.released_at ? 'waiting_for_restaurant' : 'searching';
  return {
    job_id: job.id, ol_order_id: job.ol_order_id, status: job.status, version: job.version,
    offer: { round: last?.round ?? 0, state: offerState },
    rider, eta_minutes: eta,
    timeline: (events ?? []).map(e => ({ kind: e.kind, at: e.created_at })),
  };
}

export const jobViewByOrder = (olOrderId: string) => jobView(olOrderId, 'ol_order_id');

// ---------- What a rider may see (contract 3, privacy rules RD4) ----------
// Area before pickup, address after. A first name. The customer's phone only while the job is live.
const ACTIVE = ['assigned', 'at_pickup', 'picked_up', 'at_drop'];
const area2 = (n: number) => Math.round(n * 100) / 100; // about 1 km: a neighbourhood, not a door

export function riderJob(job: Row, riderPoint?: { lat: number; lng: number } | null) {
  const revealed = ['picked_up', 'at_drop', 'delivered'].includes(job.status);
  const pickupPoint = { lat: job.pickup_lat, lng: job.pickup_lng };
  return {
    id: job.id, order_ref: job.order_no, state: job.status, version: job.version, category: 'on_order',
    pickup: {
      name: job.pickup_name,
      address: ACTIVE.includes(job.status) || revealed ? job.pickup_address : null,
      lat: job.pickup_lat, lng: job.pickup_lng,
      phone: ACTIVE.includes(job.status) ? job.pickup_phone : null,
    },
    drop: {
      area: job.drop_area,
      address: revealed ? job.drop_address : null,
      lat: revealed ? job.drop_lat : area2(job.drop_lat), lng: revealed ? job.drop_lng : area2(job.drop_lng),
      customer_first_name: job.customer_first_name,
      customer_phone: ACTIVE.includes(job.status) ? job.customer_phone : null,
      instructions: revealed ? job.drop_notes : null,
    },
    items_count: job.items_count, temperature: job.temperature, cash_to_collect: Number(job.cash_to_collect),
    promised_by: job.promised_by, payout_estimate: null, // rider pay rates are not set yet (contract open question 5)
    distance_km: Math.round(distanceKm(pickupPoint, { lat: job.drop_lat, lng: job.drop_lng }) * 10) / 10,
    eta: riderPoint ? { to_pickup_min: Math.max(1, Math.ceil((distanceKm(riderPoint, pickupPoint) / SPEED_KMH) * 60)) } : null,
  };
}

// ---------- The order flow ----------
let warned = false;
const reported = new Set<string>();

// An order is successful: cash orders when placed, online orders when the payment is confirmed. Every
// delivery order gets one job. Never throws: an order must not fail because dispatch is down.
export async function dispatchOrders(orderIds: string[]) {
  if (!dbConfigured()) return; // no database (UI work with `expo start`): there is no rider pool either
  if (!dispatchConfigured()) {
    if (!warned) { warned = true; console.warn('[dispatch] DISPATCH_SIGNING_SECRET is not set: orders are placed but no rider is pinged.'); }
    return;
  }
  for (const id of orderIds) {
    try { await createJobForOrder(id); }
    catch (error) { console.error('[dispatch] order', id, 'has no delivery job yet, the sweep will retry it:', error instanceof HttpError ? `${error.code ?? error.status} ${error.detail}` : error); }
  }
}

// Builds the contract's payload from the stored order, store and customer, then creates the job.
export async function createJobForOrder(olOrderId: string, requestId = `order-flow:${olOrderId}`) {
  const { data: o, error } = await db().from('ol_orders').select('*').eq('id', olOrderId).maybeSingle();
  if (error) fromDbError(error);
  if (!o) throw new HttpError(404, 'Order not found', undefined, 'not_found');
  if (o.payment_method !== 'cod' && o.payment_status !== 'paid') throw new HttpError(409, 'This order is not successful yet.', undefined, 'order_not_deliverable');

  const store = o.store_id ? (await db().from('ol_stores').select('*').eq('id', o.store_id).maybeSingle()).data : null;
  const channelQuery = db().from('ol_merchant_channels').select('*');
  const channel = o.organization_id ? (await channelQuery.eq('organization_id', o.organization_id).maybeSingle()).data
    : o.store_id ? (await channelQuery.eq('store_id', o.store_id).maybeSingle()).data : null;

  const address = (o.delivery_address ?? {}) as Row;
  const lines = Array.isArray(o.items) ? (o.items as Row[]) : [];
  const parts = String(address.text ?? '').split(',').map(s => s.trim()).filter(Boolean);
  let name: string | null = null, phone: string | null = null;
  if (o.user_id) {
    try {
      const { data } = await db().auth.admin.getUserById(o.user_id);
      const meta = (data?.user?.user_metadata ?? {}) as Row;
      name = first(meta.full_name ?? meta.name);
      phone = data?.user?.phone ? `+${String(data.user.phone).replace(/^\+/, '')}` : null;
    } catch { /* a name and number are a convenience; the delivery works without them */ }
  }
  const prep = o.prep_minutes ?? channel?.default_prep_minutes ?? null;
  const cod = o.payment_method === 'cod';

  return createJob(parseJobPayload({
    ol_order_id: o.id, pos_order_id: o.pos_order_id ?? null, organization_id: o.organization_id ?? null, store_id: o.store_id ?? null,
    order_no: `OL-${String(o.id).slice(0, 6).toUpperCase()}`,
    payment_mode: cod ? 'cod' : 'online', cash_to_collect: cod ? Number(o.total) : 0,
    items: { count: lines.reduce((n, l) => n + (Number(l.qty) || 1), 0) || 1, temperature: o.organization_id ? 'hot' : 'ambient' },
    prep_minutes: prep, promised_by: new Date(Date.parse(o.created_at) + (Number(o.eta_minutes) || 30) * 60_000).toISOString(),
    pickup: { name: store?.name ?? 'Store', address: channel?.address ?? null, lat: store?.lat ?? channel?.lat ?? null, lng: store?.lng ?? channel?.lng ?? null, phone: null },
    drop: {
      area: address.area ?? address.locality ?? parts[1] ?? parts[0] ?? null, address: address.text ?? null,
      lat: address.lat ?? null, lng: address.lng ?? null, instructions: address.notes ?? null, customer_first_name: name, customer_phone: phone,
    },
  }), requestId);
}

// A restaurant accepted (trigger 'accepted') or rejected the order on the VINII Partner phone.
export async function onRestaurantAccepted(posOrderId: string, prepMinutes: number) {
  if (!dispatchConfigured()) return;
  try {
    const { data: job } = await db().from('delivery_jobs').select('id').eq('pos_order_id', posOrderId).maybeSingle();
    if (job) await releaseJob(job.id, prepMinutes, null, `partner-accept:${posOrderId}`);
  } catch (error) { console.error('[dispatch] release after accept failed', posOrderId, error instanceof HttpError ? error.detail : error); }
}

export async function onRestaurantRejected(posOrderId: string, reason: string) {
  if (!dispatchConfigured()) return;
  try {
    const { data: job } = await db().from('delivery_jobs').select('id').eq('pos_order_id', posOrderId).maybeSingle();
    if (job) await cancelJob(job.id, `restaurant_rejected: ${reason}`.slice(0, 200), null, `partner-reject:${posOrderId}`);
  } catch (error) { console.error('[dispatch] cancel after reject failed', posOrderId, error instanceof HttpError ? error.detail : error); }
}

// ---------- The sweep ----------
// Run every 15-30 seconds by a scheduler (POST /api/dispatch/sweep) and, lightly, by rider heartbeats:
//   1. offers that lapsed move on to the next rider, and a dead pool escalates to operations;
//   2. jobs whose order was cancelled (the restaurant did not answer in time) are cancelled;
//   3. successful orders that never got a job (dispatch was down) get one.
export async function sweep(requestId: string) {
  const out = { advanced: 0, cancelled: 0, created: 0, failed: 0 };
  const due = await rpc<string[]>('dispatch_due_jobs', { p_limit: 50 });
  for (const id of due ?? []) { try { await advanceJob(id, requestId); out.advanced++; } catch (e) { out.failed++; console.error('[dispatch] sweep advance', id, e); } }

  const { data: open } = await db().from('delivery_jobs').select('id, ol_order_id').in('status', ['created', 'offered', 'assigned', 'at_pickup']).limit(500);
  if (open?.length) {
    const { data: dead } = await db().from('ol_orders').select('id').in('id', open.map(j => j.ol_order_id)).eq('status', 'cancelled');
    const gone = new Set((dead ?? []).map(o => o.id));
    for (const j of open.filter(j => gone.has(j.ol_order_id))) {
      try { await cancelJob(j.id, 'order_cancelled', null, requestId); out.cancelled++; } catch (e) { out.failed++; console.error('[dispatch] sweep cancel', j.id, e); }
    }
  }

  const { data: missing } = await db().from('delivery_orders_needing_rider').select('ol_order_id').limit(20);
  for (const m of missing ?? []) {
    try { await createJobForOrder(m.ol_order_id, requestId); out.created++; }
    catch (e) {
      out.failed++;
      // A problem that does not heal itself (no map location for the store) is logged once, not on every sweep.
      if (!reported.has(m.ol_order_id)) { reported.add(m.ol_order_id); console.error('[dispatch] sweep cannot create a job for', m.ol_order_id, e instanceof HttpError ? e.detail : e); }
    }
  }
  return out;
}

// Cheap enough to run on rider heartbeats: keeps offers moving while any rider is online, even with no scheduler.
let lastAdvance = 0;
export async function advanceDue(requestId: string, minGapMs = 10_000) {
  if (Date.now() - lastAdvance < minGapMs) return;
  lastAdvance = Date.now();
  try {
    const due = await rpc<string[]>('dispatch_due_jobs', { p_limit: 10 });
    for (const id of due ?? []) await advanceJob(id, requestId);
  } catch (error) { console.warn('[dispatch] advanceDue', error instanceof HttpError ? error.detail : error); }
}
