import { json, route } from '../../../../server/http';
import { jobView, serviceRequest } from '../../../../server/dispatch';

// What One Local's tracking screen and VINII's order detail read: status, rider first name and position, ETA.
export const GET = route(async (request, params) => {
  await serviceRequest(request, { write: false });
  return json(await jobView(params?.id ?? ''));
});
