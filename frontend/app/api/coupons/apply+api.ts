import { applyCoupon } from '../../../server/catalog';
import { customerKey, HttpError, json, limit, readBody, route } from '../../../server/http';

export const POST = route(async request => {
  // Coupon codes are guessable, so attempts are limited per device.
  limit(customerKey(request) ?? 'anonymous', 'coupon', 10, 60_000);
  const body = await readBody<{ code?: unknown; subtotal?: unknown }>(request);
  if (typeof body.code !== 'string' || body.code.length > 30 || typeof body.subtotal !== 'number' || body.subtotal < 0) throw new HttpError(400, 'Enter a coupon code');
  return json(applyCoupon(body.code, body.subtotal));
});
