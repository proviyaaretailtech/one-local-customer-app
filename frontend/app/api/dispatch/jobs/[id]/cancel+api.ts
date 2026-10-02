import { HttpError, json, route } from '../../../../../server/http';
import { cancelJob, serviceRequest } from '../../../../../server/dispatch';

const REASONS = ['restaurant_rejected', 'restaurant_timed_out', 'customer_cancelled', 'other'];

// Before pickup: the job is cancelled and any rider's offer card closes. After pickup: 409 already_picked_up
// and the order flow raises an exception instead.
export const POST = route(async (request, params) => {
  const call = await serviceRequest(request, { write: true });
  const { reason, expected_version } = call.body;
  if (typeof reason !== 'string' || !REASONS.includes(reason)) throw new HttpError(400, `reason must be one of ${REASONS.join(', ')}`, undefined, 'invalid_payload');
  if (expected_version != null && !Number.isInteger(expected_version)) throw new HttpError(400, 'expected_version must be a whole number', undefined, 'invalid_payload');
  const { job } = await cancelJob(params?.id ?? '', reason, (expected_version as number) ?? null, call.requestId);
  return json(job);
});
