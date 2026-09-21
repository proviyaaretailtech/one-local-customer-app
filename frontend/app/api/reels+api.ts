import { reelsFor, resolveCity } from '../../server/catalog';
import { json, route } from '../../server/http';

export const GET = route(request => json(reelsFor(resolveCity(request))));
