import { resolveCity } from '../../../server/catalog';
import { json, route } from '../../../server/http';
import { startPayment } from '../../../server/payments';

// Saves the order (payment pending) and opens a Razorpay order for the server's total.
export const POST = route(async request => json(await startPayment(request, resolveCity(request))));
