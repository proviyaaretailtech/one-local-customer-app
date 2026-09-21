import { catalog } from '../../../server/catalog';
import { json, route } from '../../../server/http';

export const GET = route(() => json(catalog.coupons));
