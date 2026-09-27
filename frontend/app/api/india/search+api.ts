import { customerKey, HttpError, json, limit, route } from '../../../server/http';
import { searchIndia } from '../../../server/geo';
import { parsePoint } from '../../../server/maps';

// Any city, town, locality or village in India (our own list — free, no Google call).
export const GET = route(request => {
  limit(customerKey(request) ?? 'anonymous', 'india-search', 120, 60_000);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length > 80) throw new HttpError(400, 'Please use a shorter search');
  return json(searchIndia(q, parsePoint(url, false)));
});
