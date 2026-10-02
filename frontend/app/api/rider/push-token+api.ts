import { limit, json, readBody, route } from '../../../server/http';
import { registerPushToken, requireRider } from '../../../server/rider';

export const PUT = route(async request => {
  const rider = await requireRider(request);
  limit(rider.id, 'rider-push-token', 10, 60_000);
  return json(await registerPushToken(rider, await readBody(request)));
});
