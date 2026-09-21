import { customerKey, HttpError, json, limit, route } from '../../../server/http';
import { autocomplete, parsePoint } from '../../../server/maps';

export const GET = route(async request => {
  // Every call costs money, so searches are limited per device.
  limit(customerKey(request) ?? 'anonymous', 'places', 60, 60_000);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json([]);
  if (q.length > 100) throw new HttpError(400, 'Please use a shorter search');
  return json(await autocomplete(q, parsePoint(url, false), url.searchParams.get('session')));
});
