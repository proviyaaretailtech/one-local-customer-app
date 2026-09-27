import { adminRoute, preflight, shoppers } from '../../../../server/admin';
import { json } from '../../../../server/http';

// Shoppers (Supabase Auth users), ?q= email or phone; newest first, at most 100.
export const GET = adminRoute(async request => json(await shoppers(request)));
export const OPTIONS = preflight;
