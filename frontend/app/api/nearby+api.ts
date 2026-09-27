import { customerKey, json, limit, route } from '../../server/http';
import { parsePoint } from '../../server/maps';
import { nearby } from '../../server/nearby';

// Real local places around a point (food, grocery, shops, care), for towns we don't deliver to yet.
export const GET = route(async request => {
  limit(customerKey(request) ?? 'anonymous', 'nearby', 20, 60_000);
  return json(await nearby(parsePoint(new URL(request.url), true)!));
});
