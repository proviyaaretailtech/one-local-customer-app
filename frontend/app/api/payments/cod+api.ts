import { json, route } from '../../../server/http';
import { switchToCash } from '../../../server/payments';

// After a failed or cancelled online payment: the same order becomes pay on delivery.
export const POST = route(async request => json(await switchToCash(request)));
