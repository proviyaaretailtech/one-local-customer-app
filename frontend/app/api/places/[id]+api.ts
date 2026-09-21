import { customerKey, json, limit, route } from '../../../server/http';
import { placeDetails } from '../../../server/maps';

export const GET = route(async (request, { id }) => {
  limit(customerKey(request) ?? 'anonymous', 'place', 30, 60_000);
  return json(await placeDetails(id, new URL(request.url).searchParams.get('session')));
});
