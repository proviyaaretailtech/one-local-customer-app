import { require, requirePartnerAuth } from '@/server/partner';
import { act } from '@/server/restaurant';
import { json, route, readBody } from '@/server/http';

export const POST = route(async (request, params) => {
  const staff = await requirePartnerAuth(request);
  require(staff, 'accept');
  const body = await readBody(request);
  return json(await act(staff, params?.id ?? '', 'accept', body));
});
