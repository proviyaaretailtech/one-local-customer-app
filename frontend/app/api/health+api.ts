import { json, route } from '../../server/http';

export const GET = route(() => json({ status: 'ok', time: new Date().toISOString() }));
