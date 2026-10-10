// Partner sign-up from the OneLocal partner website (founder, 10 Oct 2026). Public and unauthenticated by design: anyone
// may apply, so the guard is validation, rate limits and idempotency, and the answer never echoes personal data back.
// Stored in ol_partner_applications (migration 0334); operations review it, and on approval the same details seed the
// partner's organisation and the VINII Partner app.
import { z } from 'zod';
import { resolveCity } from './catalog';
import { db, dbConfigured, fromDbError } from './db';
import { HttpError } from './http';
import { limitCaller } from './limits';

export const CONSENT_VERSION = 'partner-signup-2026-10-10';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const Body = z.object({
  business_name: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  business_type: z.enum(['restaurant', 'cloud_kitchen', 'cafe_bakery', 'sweets', 'grocery', 'supermarket', 'pharmacy', 'beauty', 'retail', 'other']),
  outlets: z.coerce.number().int().min(1).max(500).default(1),
  address: z.string().transform(clean).pipe(z.string().min(5).max(400)),
  pin_code: z.string().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  owner_name: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  phone: z.string().transform(s => s.replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number')),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  whatsapp_ok: z.boolean().default(true),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN looks wrong').optional().or(z.literal('').transform(() => undefined)),
  fssai: z.string().trim().regex(/^[0-9]{14}$/, 'FSSAI licence is 14 digits').optional().or(z.literal('').transform(() => undefined)),
  services: z.array(z.enum(['delivery', 'pickup', 'dine_in'])).min(1).max(3).default(['delivery']),
  own_delivery: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  consent: z.literal(true, { message: 'Please accept the terms to continue' }),
  submit_key: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
});

export type ApplicationReceipt = { reference: string; status: string; existing: boolean };

export async function submitPartnerApplication(request: Request, raw: unknown): Promise<ApplicationReceipt> {
  // Three applications an hour per browser key + address (anonymous), 10 per address: a form spammer meets the address ceiling.
  await limitCaller(request, 'partner-apply', 3, 3_600_000, { verify: false, anonIpMax: 10 });
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first?.message && !/^(Invalid|Expected|Required|Too small|Too big)/.test(first.message) ? first.message : `Please check ${String(first?.path?.[0] ?? 'the form').replace(/_/g, ' ')}.`);
  }
  if (!dbConfigured()) throw new HttpError(503, 'Sign-ups are not open on this server yet.');
  const b = parsed.data;
  const city = resolveCity(request);
  const row = {
    city_id: city, business_name: b.business_name, business_type: b.business_type, outlets: b.outlets, address: b.address, pin_code: b.pin_code,
    owner_name: b.owner_name, phone: b.phone, email: b.email ?? null, whatsapp_ok: b.whatsapp_ok, gstin: b.gstin ?? null, fssai: b.fssai ?? null,
    services: b.services, own_delivery: b.own_delivery, notes: b.notes?.trim() || null,
    consent_version: CONSENT_VERSION, consent_at: new Date().toISOString(), submit_key: b.submit_key, source: 'partner_website',
  };
  const { data, error } = await db().from('ol_partner_applications').insert(row).select('reference, status').single();
  if (!error) return { reference: data.reference as string, status: data.status as string, existing: false };
  if (error.code === '23505') {
    // Same submit (a retry) or an open application for this phone: answer with that one, so the owner keeps one reference.
    const { data: prior } = await db().from('ol_partner_applications').select('reference, status')
      .or(`submit_key.eq.${b.submit_key},and(city_id.eq.${city},phone.eq.${b.phone},status.in.(submitted,reviewing))`).limit(1).maybeSingle();
    if (prior) return { reference: prior.reference as string, status: prior.status as string, existing: true };
  }
  fromDbError(error);
}
