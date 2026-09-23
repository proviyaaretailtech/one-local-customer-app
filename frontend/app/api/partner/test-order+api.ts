import { requirePartnerAuth } from '../../../server/partner';
import { createTestOrder } from '../../../server/restaurant';
import { json, route } from '../../../server/http';

export const POST = route(async request => json(await createTestOrder(await requirePartnerAuth(request))));
