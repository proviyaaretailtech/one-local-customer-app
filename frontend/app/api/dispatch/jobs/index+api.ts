import { json, route } from '../../../../server/http';
import { createJob, jobViewByOrder, parseJobPayload, serviceRequest } from '../../../../server/dispatch';

// Server to server (a service credential, never a user's token). The order flow calls this the moment a
// delivery order is successful; it creates the one job for the order and pings the rider pool.
export const POST = route(async request => {
  const call = await serviceRequest(request, { write: true });
  const payload = parseJobPayload(call.body);
  call.allowOrg(payload.organization_id);
  const { created, job } = await createJob(payload, call.requestId);
  return json(job, { status: created ? 201 : 200 });
});

// ?ol_order_id=<uuid>: the same read as /jobs/:job_id, for a caller that only knows the order.
export const GET = route(async request => {
  const call = await serviceRequest(request, { write: false });
  const id = new URL(request.url).searchParams.get('ol_order_id') ?? '';
  return json(await jobViewByOrder(id));
});
