import { json, route } from '../../../../server/http';
import { jobForRider, requireRider } from '../../../../server/rider';

// A rider sees only their own jobs, in the rider's view: area before pickup, address after.
export const GET = route(async (request, params) => json(await jobForRider(await requireRider(request), params?.id ?? '')));
