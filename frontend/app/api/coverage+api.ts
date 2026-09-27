import { coverage } from '../../server/coverage';
import { json, route } from '../../server/http';
import { parsePoint } from '../../server/maps';

// What One Local offers at a map position: live (we deliver), discover (listings only) or soon.
export const GET = route(async request => json(await coverage(parsePoint(new URL(request.url), true)!)));
