import { serviceability } from '../../server/catalog';
import { json, route } from '../../server/http';
import { parsePoint } from '../../server/maps';

// Free check (no Google call): does OneCity deliver to this point?
export const GET = route(request => json(serviceability(parsePoint(new URL(request.url), true)!)));
