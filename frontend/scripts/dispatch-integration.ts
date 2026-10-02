// Runs the dispatch flow end to end through the real server code against the LOCAL Supabase: an order is
// placed, the nearest rider is offered it, declines move it on, accept wins, cancel, the sweep, auto-accept.
// Expo push and sign-in are simulated; the database is real. It refuses to run against anything but localhost,
// and removes what it creates.
// Needs the local database with 0021-0026 and 0029 applied, and frontend/.env.localdb.off (written by
// `python3 scripts/db.py local-env`, then renamed). Run from frontend/:  npx tsx scripts/dispatch-integration.ts
import { readFileSync } from 'node:fs';
const ROOT = process.cwd();
for (const line of readFileSync(`${ROOT}/.env.localdb.off`, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SUPABASE_URL ?? '')) throw new Error('refusing to run: not a local database');
Object.assign(process.env, { DISPATCH_SERVICE_TOKEN: 'it-token', DISPATCH_SIGNING_SECRET: 'it-secret' });

let passed = 0;
const check = (what: string, ok: boolean, detail?: unknown) => { if (!ok) { console.error('FAIL ', what, JSON.stringify(detail ?? '')); process.exitCode = 1; } else { passed++; console.log('ok   ', what); } };

// Expo push and sign-in are simulated; PostgREST is the real local database.
const pushes: any[] = []; const tokenToUser = new Map<string, string>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://exp.host/')) { const msgs = JSON.parse(init.body); pushes.push(...msgs); return Response.json({ data: msgs.map(() => ({ status: 'ok' })) }); }
  if (url.endsWith('/auth/v1/user')) { const t = String(init?.headers?.Authorization ?? '').slice(7); return tokenToUser.has(t) ? Response.json({ id: tokenToUser.get(t) }) : new Response('{}', { status: 401 }); }
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const { db } = await import(`../server/db`);
  const { hmacHex } = await import(`../server/http`);
  const dispatch = await import(`../server/dispatch`);
  const jobsRoute = await import(`../app/api/dispatch/jobs/index+api`);
  const jobRoute = await import(`../app/api/dispatch/jobs/[id]+api`);
  const cancelRoute = await import(`../app/api/dispatch/jobs/[id]/cancel+api`);
  const sweepRoute = await import(`../app/api/dispatch/sweep+api`);
  const offerRoute = await import(`../app/api/rider/offers/current+api`);
  const acceptRoute = await import(`../app/api/rider/offers/[id]/accept+api`);
  const declineRoute = await import(`../app/api/rider/offers/[id]/decline+api`);
  const availRoute = await import(`../app/api/rider/availability+api`);
  const beatRoute = await import(`../app/api/rider/heartbeat+api`);
  const tokenRoute = await import(`../app/api/rider/push-token+api`);
  const myJobRoute = await import(`../app/api/rider/jobs/[id]+api`);
  const currentJobRoute = await import(`../app/api/rider/jobs/current+api`);
  const d = db();
  const must = (r: { data: any; error: any }): any => { if (r.error) throw new Error(JSON.stringify(r.error)); return r.data; };

  // ---- seed (cleaned up at the end) ----
  const org = must(await d.from('organizations').select('id').limit(1))[0].id as string;
  const { data: list } = await d.auth.admin.listUsers({ perPage: 6 });
  const u = list!.users.map(x => x.id);
  must(await d.from('ol_stores').upsert({ id: 'it-store', name: 'IT Kitchen', organization_id: org }));
  must(await d.from('ol_merchant_channels').upsert({ organization_id: org, store_id: 'it-store', accepting: true, address: 'Main Road, Latur', lat: 18.4088, lng: 76.5604 }));
  const mk = async (i: number, name: string, extra: any = {}) => must(await d.from('riders').insert({ user_id: u[i], full_name: name, type: 'solo', status: 'approved', vehicle: 'bike', ...extra }).select('id'))[0].id as string;
  const rNear = await mk(0, 'Ravi Kumar'), rFar = await mk(1, 'Sana Sheikh'), rAuto = await mk(2, 'Auto Amit', { acceptance: 'auto' });
  const now = () => new Date().toISOString();
  must(await d.from('rider_availability').upsert([
    { rider_id: rNear, online: true, lat: 18.4100, lng: 76.5604, last_seen_at: now() },
    { rider_id: rFar, online: true, lat: 18.4300, lng: 76.5604, last_seen_at: now() },
    { rider_id: rAuto, online: false, lat: 18.41, lng: 76.56, last_seen_at: now() },
  ]));
  const jwt = (i: number) => { const t = `token-${i}-`.padEnd(40, 'x'); tokenToUser.set(t, u[i]); return t; };
  const as = (i: number, url: string, method = 'GET', body?: unknown) => new Request(`http://localhost/api/${url}`, { method, headers: { authorization: `Bearer ${jwt(i)}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const svc = async (url: string, body?: unknown, key?: string) => {
    const raw = body === undefined ? '' : JSON.stringify(body); const stamp = String(Math.floor(Date.now() / 1000));
    return new Request(`http://localhost/api/${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer it-token', 'x-request-id': 'it-1', 'x-timestamp': stamp, 'x-signature': await hmacHex('it-secret', `${stamp}.${raw}`), ...(body !== undefined ? { 'idempotency-key': key ?? 'it-key-0001-aaaa' } : {}) }, body: raw || undefined });
  };
  const order = async (extra: any = {}) => must(await d.from('ol_orders').insert({
    customer_hash: 'it', items: [{ id: 'x', name: 'Biryani', qty: 2, price: 200 }], subtotal: 400, total: 460, store_id: 'it-store', organization_id: org, eta_minutes: 30,
    delivery_address: { label: 'Home', text: 'Flat 4, Gandhi Chowk, Latur', lat: 18.4001, lng: 76.5702, notes: 'Ring twice' }, ...extra }).select('id'))[0].id as string;

  // rider-side registration
  let res = await tokenRoute.PUT(as(0, 'rider/push-token', 'PUT', { expo_push_token: 'ExponentPushToken[near-near-near-1]', platform: 'android' }), {});
  check('rider registers a push token', res.status === 200, await res.json());
  await tokenRoute.PUT(as(2, 'rider/push-token', 'PUT', { expo_push_token: 'ExponentPushToken[auto-auto-auto-1]', platform: 'ios' }), {});
  res = await availRoute.POST(as(0, 'rider/availability', 'POST', { online: true, lat: 18.41, lng: 76.5604 }), {});
  check('rider goes online inside the delivery area', res.status === 200, await res.json());
  res = await availRoute.POST(as(0, 'rider/availability', 'POST', { online: true, lat: 18.5204, lng: 73.8567 }), {});
  check('going online far away is refused: out_of_zone', res.status === 422 && (await res.json()).code === 'out_of_zone');
  res = await beatRoute.POST(as(0, 'rider/heartbeat', 'POST', { lat: 18.4100, lng: 76.5604, battery: 80 }), {});
  check('heartbeat is accepted while online', res.status === 200 && (await res.json()).online === true);
  res = await offerRoute.GET(as(3, 'rider/offers/current'), {});
  check('a login with no rider row is refused: not_enrolled', res.status === 403 && (await res.json()).code === 'not_enrolled');

  // ---- 1. a successful cash order pings the pool ----
  const o1 = await order();
  await dispatch.dispatchOrders([o1]);
  let job = must(await d.from('delivery_jobs').select('*').eq('ol_order_id', o1).single());
  check('the order flow created one job', job.status === 'offered' && job.dispatch_trigger === 'placed' && job.cash_to_collect == 460 && job.items_count === 2, job);
  check('pickup came from the restaurant channel (no store coordinates needed)', job.pickup_lat === 18.4088 && job.pickup_address === 'Main Road, Latur' && job.pickup_name === 'IT Kitchen', job);
  check('the drop area, notes and coordinates were taken from the order', job.drop_area === 'Gandhi Chowk' && job.drop_notes === 'Ring twice' && job.drop_lat === 18.4001, job);
  const asg = must(await d.from('delivery_assignments').select('*').eq('job_id', job.id));
  check('the nearest rider was offered it, and only one live offer exists', asg.length === 1 && asg[0].rider_id === rNear && asg[0].outcome === null, asg);
  check('their phone was rung with the job offer', pushes.some(p => p.to === 'ExponentPushToken[near-near-near-1]' && p.data.type === 'job_offer' && p.data.offer_id === asg[0].id && p.channelId === 'job-offers'), pushes);
  await dispatch.dispatchOrders([o1]);
  check('sending the same order again changes nothing (one job per order)', must(await d.from('delivery_jobs').select('id').eq('ol_order_id', o1)).length === 1 && must(await d.from('delivery_assignments').select('id').eq('job_id', job.id)).length === 1);
  check("the customer's code is derived, not stored", job.otp_hash === await dispatch.otpHash(o1, await dispatch.deliveryOtp(o1)) && !JSON.stringify(job).includes(await dispatch.deliveryOtp(o1) + '"'));

  res = await offerRoute.GET(as(0, 'rider/offers/current'), {});
  const offer = await res.json();
  check("the rider's app sees the live offer with seconds left, no street address", res.status === 200 && offer.offer_id === asg[0].id && offer.seconds_left > 20 && offer.job.drop.address === null && offer.job.drop.customer_phone === null, offer);
  check('the rider far away has no offer', (await offerRoute.GET(as(1, 'rider/offers/current'), {})).status === 204);

  // ---- 2. decline moves on; accept wins; double accept is safe ----
  res = await declineRoute.POST(as(0, 'x', 'POST', { reason: 'too far' }), { id: offer.offer_id });
  check('declining is accepted', res.status === 200);
  const second = must(await d.from('delivery_assignments').select('*').eq('job_id', job.id).order('round'));
  check('the next rider is offered straight away (round 2)', second.length === 2 && second[1].rider_id === rFar && second[1].outcome === null, second);
  await tokenRoute.PUT(as(1, 'rider/push-token', 'PUT', { expo_push_token: 'ExponentPushToken[far-far-far-1]', platform: 'android' }), {});
  res = await acceptRoute.POST(as(0, 'x', 'POST'), { id: second[1].id });
  check("a rider cannot answer someone else's offer", res.status === 404, await res.json());
  res = await acceptRoute.POST(as(1, 'x', 'POST'), { id: second[1].id });
  const accepted = await res.json();
  check('accepting assigns the job and returns it in the rider view', res.status === 200 && accepted.state === 'assigned' && accepted.pickup.address === 'Main Road, Latur' && accepted.drop.address === null && accepted.drop.customer_phone === null && accepted.cash_to_collect === 460, accepted);
  res = await acceptRoute.POST(as(1, 'x', 'POST'), { id: second[1].id });
  check('accepting twice is the same accept', res.status === 200);
  res = await acceptRoute.POST(as(0, 'x', 'POST'), { id: asg[0].id });
  check('answering an offer that already ended: offer_expired', res.status === 409 && (await res.json()).code === 'offer_expired');
  res = await myJobRoute.GET(as(1, 'x'), { id: job.id });
  check('the assigned rider can read their job', res.status === 200);
  res = await myJobRoute.GET(as(0, 'x'), { id: job.id });
  check("another rider cannot read someone else's job", res.status === 404);
  res = await currentJobRoute.GET(as(1, 'x'), {});
  check('GET jobs/current returns the active job', res.status === 200 && (await res.json()).id === job.id);

  // ---- 3. the order side reads it back (service credential) ----
  res = await jobRoute.GET(await svc(`dispatch/jobs/${job.id}`), { id: job.id });
  const view = await res.json();
  check('tracking read: assigned, rider first name only, ETA, timeline', res.status === 200 && view.status === 'assigned' && view.rider.first_name === 'Sana' && !JSON.stringify(view).includes('Shaikh') && view.eta_minutes >= 1 && view.timeline.map((t: any) => t.kind).join() === 'delivery.created,delivery.released,delivery.offered,delivery.rejected,delivery.offered,delivery.assigned', view);
  res = await jobsRoute.GET(await svc(`dispatch/jobs?ol_order_id=${o1}`), {});
  check('the same read works by order id', res.status === 200 && (await res.json()).job_id === job.id);

  // ---- 4. HTTP create: 201 then 200, and an order that is not deliverable ----
  const o2 = await order();
  const body = (id: string) => ({ ol_order_id: id, organization_id: org, store_id: 'it-store', order_no: 'A-1', payment_mode: 'cod', cash_to_collect: 460, items: { count: 2, temperature: 'hot' }, prep_minutes: 20,
    pickup: { name: 'IT Kitchen', address: 'Main Road', lat: 18.4088, lng: 76.5604 }, drop: { area: 'Gandhi Chowk', lat: 18.4001, lng: 76.5702, customer_first_name: 'Asha' } });
  await d.from('rider_availability').update({ online: false }).in('rider_id', [rNear, rFar]);
  res = await jobsRoute.POST(await svc('dispatch/jobs', body(o2), `onelocal:${o2}:delivery`), {});
  const created = await res.json();
  check('POST /dispatch/jobs creates the job: 201, searching, nobody online yet', res.status === 201 && created.status === 'created' && created.offer.state === 'searching', created);
  res = await jobsRoute.POST(await svc('dispatch/jobs', body(o2), `onelocal:${o2}:delivery`), {});
  check('the same call again returns the first job: 200', res.status === 200 && (await res.json()).job_id === created.job_id);
  const o3 = await order({ status: 'cancelled' });
  res = await jobsRoute.POST(await svc('dispatch/jobs', body(o3), `onelocal:${o3}:delivery`), {});
  check('a cancelled order is not deliverable: 409 order_not_deliverable', res.status === 409 && (await res.json()).code === 'order_not_deliverable');
  res = await jobsRoute.POST(await svc('dispatch/jobs', body('3b0f5b9e-8f55-4a52-9d57-2d6f4c0c1a99'), 'onelocal:missing:delivery'), {});
  check('an unknown order: 404', res.status === 404, await res.json());

  // ---- 5. nobody online: the job waits; a rider coming online picks it up; auto-accept assigns instantly ----
  await d.from('rider_availability').update({ online: true, last_seen_at: now(), lat: 18.41, lng: 76.56 }).eq('rider_id', rAuto);
  pushes.length = 0;
  res = await beatRoute.POST(as(0, 'rider/heartbeat', 'POST', { lat: 18.41, lng: 76.56 }), {});
  await d.from('rider_availability').update({ online: true, last_seen_at: now(), lat: 18.41, lng: 76.56 }).eq('rider_id', rAuto);
  const s1 = await (await sweepRoute.POST(await svc('dispatch/sweep', {}, 'sweep-it-0001'), {})).json();
  const j2 = must(await d.from('delivery_jobs').select('*').eq('id', created.job_id).single());
  check('the sweep offered the waiting job; the auto-accept rider was assigned instantly', j2.status === 'assigned' && j2.rider_id === rAuto && s1.advanced >= 1, { j2, s1 });
  check('the auto rider was told it was assigned', pushes.some(p => p.to === 'ExponentPushToken[auto-auto-auto-1]' && p.data.type === 'job_assigned'), pushes);

  // ---- 6. cancel ----
  res = await cancelRoute.POST(await svc('x', { reason: 'customer_cancelled' }, 'cancel-it-0001'), { id: created.job_id });
  const cancelled = await res.json();
  check('cancel before pickup: cancelled, and the assigned rider is told', res.status === 200 && cancelled.status === 'cancelled' && pushes.some(p => p.data.type === 'job_cancelled'), cancelled);
  await d.from('delivery_jobs').update({ status: 'picked_up' }).eq('id', job.id);
  res = await cancelRoute.POST(await svc('x', { reason: 'customer_cancelled' }, 'cancel-it-0002'), { id: job.id });
  check('cancel after pickup: 409 already_picked_up', res.status === 409 && (await res.json()).code === 'already_picked_up');

  // ---- 7. the sweep retries an order that never got a job, and cancels jobs of cancelled orders ----
  const o4 = await order({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() });
  const o5 = await order();
  await dispatch.dispatchOrders([o5]);
  await d.from('ol_orders').update({ status: 'cancelled' }).eq('id', o5);
  const s2 = await (await sweepRoute.POST(await svc('dispatch/sweep', {}, 'sweep-it-0002'), {})).json();
  check('the sweep created the missing job', s2.created >= 1 && must(await d.from('delivery_jobs').select('id').eq('ol_order_id', o4)).length === 1, s2);
  check("the sweep cancelled the job of a cancelled order", must(await d.from('delivery_jobs').select('status').eq('ol_order_id', o5))[0].status === 'cancelled', s2);

  // ---- 8. an online order is only dispatched once paid ----
  const o6 = await order({ payment_method: 'upi', payment_status: 'pending' });
  await dispatch.dispatchOrders([o6]);
  check('an unpaid online order gets no job', must(await d.from('delivery_jobs').select('id').eq('ol_order_id', o6)).length === 0);
  await d.from('ol_orders').update({ payment_status: 'paid' }).eq('id', o6);
  await dispatch.dispatchOrders([o6]);
  const j6 = must(await d.from('delivery_jobs').select('*').eq('ol_order_id', o6).single());
  check('once paid it does, with no cash to collect', j6.payment_mode === 'online' && Number(j6.cash_to_collect) === 0, j6);

  console.log(`\n${passed} integration checks passed`);
  // ---- cleanup ----
  const ids = must(await d.from('ol_orders').select('id').eq('customer_hash', 'it')).map((x: any) => x.id);
  await d.from('delivery_jobs').delete().in('ol_order_id', ids);
  await d.from('ol_orders').delete().in('id', ids);
  await d.from('riders').delete().in('id', [rNear, rFar, rAuto]);
  await d.from('ol_merchant_channels').delete().eq('organization_id', org);
  await d.from('ol_stores').delete().eq('id', 'it-store');
}
main().catch(e => { console.error(e); process.exit(1); });
