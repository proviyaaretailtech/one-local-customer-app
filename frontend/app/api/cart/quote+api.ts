import { resolveCity } from '../../../server/catalog';
import { customerKey, json, limit, readBody, route } from '../../../server/http';
import { quote } from '../../../server/pricing';

// The cart's bill, worked out by the server with the same rules checkout uses.
export const POST = route(async request => {
  limit(customerKey(request) ?? 'anonymous', 'quote', 120, 60_000);
  const body = await readBody<{ items?: unknown; coupon_code?: unknown }>(request);
  return json(await quote(resolveCity(request), body.items, body.coupon_code));
});
