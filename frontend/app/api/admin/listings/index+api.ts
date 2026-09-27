import { adminRoute, createListing, listListings, preflight } from '../../../../server/admin';
import { json } from '../../../../server/http';

// Marketplace listings (?status=&city=), and creating one (it starts as pending).
export const GET = adminRoute(async request => json(await listListings(request)));
export const POST = adminRoute(async request => json(await createListing(request), { status: 201 }));
export const OPTIONS = preflight;
