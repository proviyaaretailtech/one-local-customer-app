import { route } from '../../../server/http';
import { checkoutPage } from '../../../server/payments';

// The page the phone app's WebView opens: Razorpay Checkout for one of the caller's own orders.
export const GET = route(checkoutPage);
