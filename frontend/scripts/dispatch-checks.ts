// Checks the dispatch edge with no database: the service credential (token, timestamp, signature), the
// job payload rules, the delivery code, what a rider may see before and after pickup, and that the rider
// routes refuse anyone who is not signed in. The database half (one job per order, one winner, offers
// moving on) is rehearsed in SQL: db/tests/0029_dispatch_scenario.sql.
// Run from frontend/:  npx tsx scripts/dispatch-checks.ts
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];

let passed = 0;
function check(what: string, ok: boolean, detail?: unknown) {
  if (!ok) { console.error(`FAIL  ${what}`, detail ?? ''); process.exitCode = 1; return; }
  passed++; console.log(`ok    ${what}`);
}
const statusOf = async (run: () => Promise<Response>) => { const r = await run(); return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) as any }; };

const TOKEN = 'service-token-for-checks', SECRET = 'signing-secret-for-checks';
const ORDER = '3b0f5b9e-8f55-4a52-9d57-2d6f4c0c1a11', ORG = '9c1e1f3a-1f0e-4d0c-9c49-1b0a5b0d2e22', OTHER_ORG = '5d7f2b1c-6a4e-4c8e-8b3a-0e1d2c3b4a55';

const jobBody = (over: Record<string, unknown> = {}) => ({
  ol_order_id: ORDER, pos_order_id: null, organization_id: ORG, order_no: 'A-1042', payment_mode: 'cod', cash_to_collect: 460,
  items: { count: 4, temperature: 'hot' }, prep_minutes: 20, promised_by: '2026-10-02T19:45:00+05:30',
  pickup: { name: 'Mysore Dining Hall', address: 'Main Road', lat: 18.4088, lng: 76.5604, phone: '+910000000000' },
  drop: { area: 'Gandhi Chowk', address: 'Flat 4, Gandhi Chowk', lat: 18.4001, lng: 76.5702, customer_first_name: 'Asha', customer_phone: '+911111111111' },
  vehicle: 'any', dispatch_trigger: 'placed', ...over,
});

async function main() {
  const { hmacHex } = await import('../server/http');
  const dispatch = await import('../server/dispatch');
  const jobs = await import('../app/api/dispatch/jobs/index+api');
  const cancel = await import('../app/api/dispatch/jobs/[id]/cancel+api');
  const sweepRoute = await import('../app/api/dispatch/sweep+api');
  const offers = await import('../app/api/rider/offers/current+api');
  const accept = await import('../app/api/rider/offers/[id]/accept+api');
  const availability = await import('../app/api/rider/availability+api');

  type Opts = { token?: string; stamp?: string; sign?: string; requestId?: string | null; key?: string | null; method?: string };
  async function signed(url: string, body: unknown, o: Opts = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const stamp = o.stamp ?? String(Math.floor(Date.now() / 1000));
    const headers: Record<string, string> = { authorization: `Bearer ${o.token ?? TOKEN}`, 'x-timestamp': stamp, 'x-signature': o.sign ?? await hmacHex(SECRET, `${stamp}.${raw}`) };
    if (o.requestId !== null) headers['x-request-id'] = o.requestId ?? 'req-1';
    if (o.key !== null && body !== undefined) headers['idempotency-key'] = o.key ?? `onelocal:${ORDER}:delivery`;
    return new Request(`http://localhost/api/${url}`, { method: o.method ?? (body === undefined ? 'GET' : 'POST'), headers, body: raw || undefined });
  }
  const post = async (body: unknown, o?: Opts) => statusOf(async () => jobs.POST(await signed('dispatch/jobs', body, o), {}));

  // ---------- Not set up ----------
  let r = await post(jobBody());
  check('no credential configured: 503 not_configured', r.status === 503 && r.body?.code === 'not_configured', r);

  Object.assign(process.env, { DISPATCH_SERVICE_TOKEN: TOKEN, DISPATCH_SIGNING_SECRET: SECRET });

  // ---------- The service credential ----------
  r = await post(jobBody());
  check('a signed call passes the credential and reaches the database (503 here: none connected)', r.status === 503 && /database/i.test(r.body?.detail), r);
  r = await post(jobBody(), { token: 'a-user-jwt.eyJzdWIiOiJ1c2VyIn0.signature-of-some-user' });
  check("a user's token is refused", r.status === 401 && r.body?.code === 'unauthorized', r);
  r = await statusOf(async () => jobs.POST(new Request('http://localhost/api/dispatch/jobs', { method: 'POST', body: '{}' }), {}));
  check('no credential at all is refused', r.status === 401, r);
  r = await post(jobBody(), { stamp: String(Math.floor(Date.now() / 1000) - 600) });
  check('a request older than 5 minutes is refused', r.status === 401 && r.body?.code === 'stale_request', r);
  r = await post(jobBody(), { stamp: new Date().toISOString() });
  check('an ISO timestamp is accepted', r.status === 503, r);
  r = await post(jobBody(), { sign: '0'.repeat(64) });
  check('a wrong signature is refused', r.status === 401 && r.body?.code === 'bad_signature', r);
  const tampered = await signed('dispatch/jobs', jobBody());
  r = await statusOf(async () => jobs.POST(new Request(tampered.url, { method: 'POST', headers: tampered.headers, body: JSON.stringify(jobBody({ cash_to_collect: 1 })) }), {}));
  check('a body changed after signing is refused', r.status === 401 && r.body?.code === 'bad_signature', r);
  r = await post(jobBody(), { requestId: null });
  check('X-Request-Id is required', r.status === 400 && r.body?.code === 'invalid_request', r);
  r = await post(jobBody(), { key: null });
  check('Idempotency-Key is required on a POST', r.status === 400 && r.body?.code === 'invalid_request', r);
  r = await statusOf(async () => cancel.POST(await signed('dispatch/jobs/x/cancel', { reason: 'customer_cancelled' }), { id: ORDER }));
  check('cancel passes the same credential (then needs the database)', r.status === 503, r);
  r = await statusOf(async () => cancel.POST(await signed('dispatch/jobs/x/cancel', { reason: 'because' }), { id: ORDER }));
  check('cancel refuses an unknown reason', r.status === 400 && r.body?.code === 'invalid_payload', r);
  r = await statusOf(async () => sweepRoute.POST(await signed('dispatch/sweep', {}, { key: 'sweep-0001-aaaa' }), {}));
  check('the sweep passes the credential too', r.status === 503, r);

  // ---------- Which restaurants a credential may dispatch for ----------
  process.env.DISPATCH_ALLOWED_ORGS = ORG;
  r = await post(jobBody({ organization_id: OTHER_ORG }));
  check('another organization is refused (403 organization_not_allowed)', r.status === 403 && r.body?.code === 'organization_not_allowed', r);
  r = await post(jobBody({ organization_id: null }));
  check('a store with no merchant is refused unless * is allowed', r.status === 403, r);
  r = await post(jobBody());
  check('the allowed organization passes', r.status === 503, r);
  process.env.DISPATCH_ALLOWED_ORGS = `${ORG},*`;
  r = await post(jobBody({ organization_id: null }));
  check('with * a store with no merchant passes', r.status === 503, r);
  delete process.env.DISPATCH_ALLOWED_ORGS;

  // ---------- The job payload ----------
  const bad = async (what: string, over: Record<string, unknown>, status = 400, code = 'invalid_payload') => {
    const x = await post(jobBody(over));
    check(what, x.status === status && x.body?.code === code, x);
  };
  await bad('ol_order_id must be a uuid', { ol_order_id: 'A-1042' });
  await bad('payment_mode must be cod or online', { payment_mode: 'cash' });
  await bad('an online order carries no cash', { payment_mode: 'online', cash_to_collect: 100 });
  await bad('cash cannot be negative', { cash_to_collect: -5 });
  await bad('items.count must be a whole number from 1', { items: { count: 0 } });
  await bad('temperature is hot, cold or ambient', { items: { count: 1, temperature: 'lukewarm' } });
  await bad('promised_by must be a date', { promised_by: 'soon' });
  await bad('vehicle must be a known class', { vehicle: 'rocket' });
  await bad('the drop needs coordinates (a rider navigates to a point, not text)', { drop: { area: 'Gandhi Chowk', address: 'text only' } });
  await bad('a restaurant with no map location: 422 no_pickup_location', { pickup: { name: 'Mysore Dining Hall', address: 'Main Road' } }, 422, 'no_pickup_location');
  await bad('a drop outside the delivery area: 422 outside_delivery_area', { drop: { area: 'Pune', lat: 18.5204, lng: 73.8567 } }, 422, 'outside_delivery_area');
  const parsed = dispatch.parseJobPayload(jobBody({ cash_to_collect: 460.456, store_id: ' mcdonalds ' }));
  check('a good payload is accepted and tidied', parsed.cash_to_collect === 460.46 && parsed.store_id === 'mcdonalds' && parsed.pickup.lat === 18.4088 && parsed.dispatch_trigger === 'placed', parsed);

  // ---------- The delivery code ----------
  const code = await dispatch.deliveryOtp(ORDER);
  check('the delivery code is 4 digits', /^\d{4}$/.test(code), code);
  check('the same order always gives the same code', code === await dispatch.deliveryOtp(ORDER));
  const codes = new Set(await Promise.all(Array.from({ length: 20 }, (_, i) => dispatch.deliveryOtp(`3b0f5b9e-8f55-4a52-9d57-2d6f4c0c1a${String(i).padStart(2, '0')}`))));
  check('different orders give different codes', codes.size > 10, [...codes]);
  const hash = await dispatch.otpHash(ORDER, code);
  check('the stored hash is not the code and depends on the order', hash !== code && hash.length === 64 && hash !== await dispatch.otpHash('other-order', code));

  // ---------- What a rider sees ----------
  const row = (status: string) => ({
    id: 'job-1', order_no: 'A-1042', status, version: 3, pickup_name: 'Mysore Dining Hall', pickup_address: 'Main Road', pickup_lat: 18.4088, pickup_lng: 76.5604, pickup_phone: '+910000000000',
    drop_area: 'Gandhi Chowk', drop_address: 'Flat 4, Gandhi Chowk', drop_lat: 18.40017, drop_lng: 76.57023, drop_notes: 'Ring twice', customer_first_name: 'Asha', customer_phone: '+911111111111',
    items_count: 4, temperature: 'hot', cash_to_collect: '460.00', promised_by: null, otp_hash: 'secret-hash',
  });
  const offered = dispatch.riderJob(row('offered'));
  check('an offered job shows the area and the restaurant, no street address and no phones', offered.drop.area === 'Gandhi Chowk' && offered.drop.address === null && offered.drop.customer_phone === null && offered.pickup.address === null && offered.pickup.phone === null, offered);
  check('before pickup the drop point is rounded to about a kilometre', offered.drop.lat === 18.4 && offered.drop.lng === 76.57, offered.drop);
  const assigned = dispatch.riderJob(row('assigned'), { lat: 18.41, lng: 76.56 });
  check('once assigned the rider gets the pickup address and the customer first name and phone, still not the address', assigned.pickup.address === 'Main Road' && assigned.drop.customer_phone === '+911111111111' && assigned.drop.address === null && assigned.drop.instructions === null, assigned);
  check('an assigned job carries the ETA to pickup', (assigned.eta?.to_pickup_min ?? 0) >= 1, assigned.eta);
  const picked = dispatch.riderJob(row('picked_up'));
  check('after pickup the full address, exact point and instructions appear', picked.drop.address === 'Flat 4, Gandhi Chowk' && picked.drop.lat === 18.40017 && picked.drop.instructions === 'Ring twice', picked.drop);
  const delivered = dispatch.riderJob(row('delivered'));
  check('after delivery the customer phone disappears again', delivered.drop.customer_phone === null);
  check('the delivery code never reaches the rider', !JSON.stringify([offered, assigned, picked, delivered]).includes('secret-hash'));
  check('cash to collect is a number, and no item prices are exposed', assigned.cash_to_collect === 460 && !('items' in assigned) && !('total' in assigned));

  // ---------- Rider routes need a signed-in rider ----------
  r = await statusOf(async () => offers.GET(new Request('http://localhost/api/rider/offers/current'), {}));
  check('offers/current refuses a caller who is not signed in', r.status === 401, r);
  r = await statusOf(async () => accept.POST(new Request('http://localhost/api/rider/offers/x/accept', { method: 'POST', headers: { authorization: 'Bearer short' } }), { id: 'x' }));
  check('accepting an offer refuses a bad token', r.status === 401, r);
  r = await statusOf(async () => availability.POST(new Request('http://localhost/api/rider/availability', { method: 'POST', body: '{"online":true}' }), {}));
  check('going online refuses a caller who is not signed in', r.status === 401, r);

  // ---------- The order flow never breaks an order ----------
  let threw = false;
  try { await dispatch.dispatchOrders([ORDER]); } catch { threw = true; }
  check('with no database, dispatchOrders does nothing and does not throw', !threw);

  console.log(`\n${passed} checks passed`);
}
main().catch(e => { console.error(e); process.exit(1); });
