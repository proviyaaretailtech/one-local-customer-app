import { json, route } from '../../../server/http';
import { handleWebhook } from '../../../server/payments';

// Razorpay -> us. Signed with RAZORPAY_WEBHOOK_SECRET; the source of truth if the app was closed mid-payment.
export const POST = route(async request => json(await handleWebhook(request)));
