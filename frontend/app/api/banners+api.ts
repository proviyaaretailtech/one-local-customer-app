import { catalog, inCity, resolveCity } from '../../server/catalog';
import { json, route } from '../../server/http';

export const GET = route(request => json(inCity(catalog.banners, resolveCity(request))));
