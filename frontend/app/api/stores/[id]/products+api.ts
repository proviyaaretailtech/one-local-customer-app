import { catalog, inCity, resolveCity } from '../../../../server/catalog';
import { json, route } from '../../../../server/http';

export const GET = route((request, { id }) => json(inCity(catalog.products, resolveCity(request)).filter(p => p.store_id === id)));
