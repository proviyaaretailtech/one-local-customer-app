import { catalog, inCity, resolveCity } from '../../../server/catalog';
import { json, route } from '../../../server/http';

// Still a fixed sample list; becomes "from your past orders" once orders live in Supabase.
const SAMPLE = new Set(['p4', 'p6', 'p8', 'p11', 'p16']);

export const GET = route(request => json(inCity(catalog.products, resolveCity(request)).filter(p => SAMPLE.has(p.id))));
