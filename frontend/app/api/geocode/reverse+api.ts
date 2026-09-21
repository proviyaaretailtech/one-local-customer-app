import { customerKey, json, limit, route } from '../../../server/http';
import { parsePoint, reverseGeocode } from '../../../server/maps';

export const GET = route(async request => {
  limit(customerKey(request) ?? 'anonymous', 'geocode', 30, 60_000);
  const point = parsePoint(new URL(request.url), true)!;
  return json(await reverseGeocode(point.lat, point.lng));
});
