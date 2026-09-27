import { resolveCity } from '../../../server/catalog';
import { json, route } from '../../../server/http';
import { createCheckout } from '../../../server/store';

// Cash on delivery: saves the checkout, one order per store in it (online payments start at
// POST /api/payments/order instead).
export const POST = route(async request => json(await createCheckout(request, resolveCity(request))));
