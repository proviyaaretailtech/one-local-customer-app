import { catalog, inCity, resolveCity } from '../../server/catalog';
import { json, route } from '../../server/http';

export const GET = route(request => {
  const kind = new URL(request.url).searchParams.get('kind');
  return json(inCity(catalog.events, resolveCity(request)).filter(e => !kind || e.kind === kind));
});
