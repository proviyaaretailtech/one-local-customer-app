import { catalog, inCity, resolveCity } from '../../../../server/catalog';
import { HttpError, json, route } from '../../../../server/http';

export const GET = route((request, { id }) => {
  const store = inCity(catalog.stores, resolveCity(request)).find(s => s.id === id);
  if (!store) throw new HttpError(404, 'Store not found');
  return json(store);
});
