import { resolveCity } from '../../../server/catalog';
import { json, route } from '../../../server/http';
import { createOrder, listOrders } from '../../../server/store';

export const GET = route(async request => json(await listOrders(request)));
export const POST = route(async request => json(await createOrder(request, resolveCity(request))));
