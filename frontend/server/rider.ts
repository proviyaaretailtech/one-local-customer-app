// The rider's side of dispatch: who is calling, going online, the live offer, answering it.
// Routes: /api/rider/* (docs/RIDER_APP_E2E_V1.md section 5). Only the pool-and-offer half exists so far;
// onboarding, the job steps after assignment, proof and money are separate pieces of work.
// A rider is a login (Supabase phone OTP) with an approved row in `riders` (D2).
import { distanceKm, serviceability } from './catalog';
import { advanceDue, advanceJob, riderJob } from './dispatch';
import { db, fromDbError, rpc } from './db';
import { HttpError } from './http';
import { signedInUserId } from './auth';

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Rider = { id: string; userId: string; name: string; type: string; organizationId: string | null };

export async function requireRider(request: Request): Promise<Rider> {
  const userId = await signedInUserId(request);
  if (!userId) throw new HttpError(401, 'Sign in to continue.');
  const { data, error } = await db().from('riders').select('id, full_name, type, status, organization_id').eq('user_id', userId).maybeSingle();
  if (error) fromDbError(error);
  if (!data) throw new HttpError(403, 'You are not registered as a rider yet.', undefined, 'not_enrolled');
  if (data.status === 'suspended') throw new HttpError(403, 'Your rider account is suspended. Please contact support.', undefined, 'suspended');
  if (data.status !== 'approved') throw new HttpError(403, 'Your rider application is not approved yet.', undefined, 'not_approved');
  return { id: data.id, userId, name: data.full_name, type: data.type, organizationId: data.organization_id };
}

const point = (b: Row) => {
  const lat = b.lat, lng = b.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'Send your location (lat and lng).', undefined, 'invalid_payload');
  }
  return { lat, lng };
};
const small = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);

// POST /rider/availability. Going online needs a position inside the delivery area.
export async function setAvailability(rider: Rider, b: Row) {
  if (typeof b.online !== 'boolean') throw new HttpError(400, 'Say whether you are going online.', undefined, 'invalid_payload');
  const row: Row = { rider_id: rider.id, online: b.online, last_seen_at: new Date().toISOString() };
  if (b.online) {
    const here = point(b);
    if (!serviceability(here).serviceable) throw new HttpError(422, 'You are outside the delivery area.', undefined, 'out_of_zone');
    Object.assign(row, here, { accuracy_m: small(b.accuracy_m, 0, 100_000) });
  }
  const { error } = await db().from('rider_availability').upsert(row, { onConflict: 'rider_id' });
  if (error) fromDbError(error);
  // A job may have been waiting for exactly this rider.
  if (b.online) await advanceDue(`online:${rider.id}`, 0);
  return { online: b.online };
}

// POST /rider/heartbeat, every 30 seconds while online. A rider silent for 60 seconds counts as offline.
export async function heartbeat(rider: Rider, b: Row) {
  const here = point(b);
  const { data, error } = await db().from('rider_availability').update({
    ...here, accuracy_m: small(b.accuracy_m, 0, 100_000), battery: small(b.battery, 0, 100), last_seen_at: new Date().toISOString(),
  }).eq('rider_id', rider.id).eq('online', true).select('rider_id');
  if (error) fromDbError(error);
  // Heartbeats double as the dispatch clock while no scheduler is running.
  await advanceDue(`heartbeat:${rider.id}`);
  return { ok: true, online: !!data?.length, server_time: new Date().toISOString() };
}

export async function registerPushToken(rider: Rider, b: Row) {
  const token = String(b.expo_push_token ?? '');
  if (!/^Expo(nent)?PushToken\[[^\]]{4,200}\]$/.test(token)) throw new HttpError(400, 'Invalid device registration.', undefined, 'invalid_payload');
  if (b.platform !== 'ios' && b.platform !== 'android') throw new HttpError(400, 'Invalid device registration.', undefined, 'invalid_payload');
  const { error } = await db().from('push_tokens').upsert(
    { rider_id: rider.id, expo_push_token: token, platform: b.platform, last_ok_at: new Date().toISOString() }, { onConflict: 'expo_push_token' });
  if (error) fromDbError(error);
  return { ok: true };
}

async function position(riderId: string) {
  const { data } = await db().from('rider_availability').select('lat, lng').eq('rider_id', riderId).maybeSingle();
  return data?.lat != null && data?.lng != null ? { lat: data.lat as number, lng: data.lng as number } : null;
}

// GET /rider/offers/current: the live offer with the seconds left, or null (the route answers 204).
// An offer that lapsed is moved on here too, so a rider opening the app never sees a dead card.
export async function currentOffer(rider: Rider) {
  const { data: offer, error } = await db().from('delivery_assignments').select('*').eq('rider_id', rider.id).is('outcome', null).maybeSingle();
  if (error) fromDbError(error);
  if (!offer) return null;
  if (Date.parse(offer.expires_at) <= Date.now()) {
    await advanceJob(offer.job_id, `offer-read:${rider.id}`);
    return null;
  }
  const { data: job } = await db().from('delivery_jobs').select('*').eq('id', offer.job_id).maybeSingle();
  if (!job) return null;
  const here = await position(rider.id);
  const view = riderJob(job, here);
  return {
    offer_id: offer.id, round: offer.round, expires_at: offer.expires_at,
    seconds_left: Math.max(0, Math.round((Date.parse(offer.expires_at) - Date.now()) / 1000)),
    job: view, payout_estimate: view.payout_estimate,
    pickup: { name: job.pickup_name, distance_km: here ? Math.round(distanceKm(here, { lat: job.pickup_lat, lng: job.pickup_lng }) * 10) / 10 : null },
    drop: { area: job.drop_area, distance_km: view.distance_km },
    eta_min: view.eta?.to_pickup_min ?? null, note: job.temperature === 'hot' ? 'Hot food: keep it upright and go straight to the customer.' : null,
  };
}

function offerId(id: string) {
  if (!UUID.test(id)) throw new HttpError(404, 'Offer not found', undefined, 'not_found');
  return id;
}

// POST /rider/offers/:id/accept. The first to answer wins; everyone else gets already_taken.
export async function acceptOffer(rider: Rider, id: string) {
  const result = await rpc<{ job_id: string }>('dispatch_answer', { p_assignment: offerId(id), p_rider: rider.id, p_accept: true, p_reason: null, p_request_id: `accept:${id}` });
  return jobForRider(rider, result.job_id);
}

// POST /rider/offers/:id/decline. The next rider is offered the job straight away.
export async function declineOffer(rider: Rider, id: string, b: Row) {
  const reason = typeof b.reason === 'string' ? b.reason.slice(0, 200) : null;
  const result = await rpc<{ job_id: string }>('dispatch_answer', { p_assignment: offerId(id), p_rider: rider.id, p_accept: false, p_reason: reason, p_request_id: `decline:${id}` });
  await advanceJob(result.job_id, `decline:${id}`);
  return { ok: true };
}

export async function jobForRider(rider: Rider, jobId: string) {
  if (!UUID.test(jobId)) throw new HttpError(404, 'Job not found', undefined, 'not_found');
  // A rider sees only their own jobs: the filter is the permission.
  const { data, error } = await db().from('delivery_jobs').select('*').eq('id', jobId).eq('rider_id', rider.id).maybeSingle();
  if (error) fromDbError(error);
  if (!data) throw new HttpError(404, 'Job not found', undefined, 'not_found');
  return riderJob(data, await position(rider.id));
}

export async function currentJob(rider: Rider) {
  const { data, error } = await db().from('delivery_jobs').select('*').eq('rider_id', rider.id)
    .in('status', ['assigned', 'at_pickup', 'picked_up', 'at_drop']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) fromDbError(error);
  return data ? riderJob(data, await position(rider.id)) : null;
}
