// Partner sign-up from the OneLocal partner website (founder, 10 Oct 2026). Public and unauthenticated by design: anyone
// may apply, so the guard is validation, rate limits and idempotency, and the answer never echoes personal data back.
// Stored in ol_partner_applications (migrations 0334, 0335); operations review it, and on approval the same details seed
// the partner's organisation and the VINII Partner app.
//
// Two stages, one row, keyed by the browser's submit key:
//   draft  — after the first screen (partner type, business, owner, phone, email): "then we save your draft".
//   submit — everything, with the category path checked against data/partner-taxonomy.json (the onboarding designs).
import { z } from 'zod';
import taxonomy from './data/partner-taxonomy.json';
import { resolveCity } from './catalog';
import { db, dbConfigured, fromDbError } from './db';
import { HttpError } from './http';
import { limitCaller } from './limits';

export const CONSENT_VERSION = 'partner-signup-2026-10-10';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const optional = <T extends z.ZodTypeAny>(t: T) => t.optional().or(z.literal('').transform(() => undefined));
const Phone = z.string().transform(s => s.replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'));

const Basics = z.object({
  partner_type: z.enum(['store', 'restaurant', 'service', 'logistic']),
  business_name: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  owner_name: z.string().transform(clean).pipe(z.string().min(2).max(120)),
  phone: Phone,
  email: z.string().trim().toLowerCase().email('That email looks wrong').max(200),
  consent: z.literal(true, { message: 'Please accept to continue' }),
  submit_key: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
});
const Full = Basics.extend({
  category_family: optional(z.string().max(80)),
  category: optional(z.string().max(80)),
  subcategories: z.array(z.string().max(80)).max(30).default([]),
  outlets: z.coerce.number().int().min(1).max(500).default(1),
  address: z.string().transform(clean).pipe(z.string().min(5).max(400)),
  pin_code: z.string().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  whatsapp_ok: z.boolean().default(true),
  gstin: optional(z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN looks wrong')),
  fssai: optional(z.string().trim().regex(/^[0-9]{14}$/, 'FSSAI licence is 14 digits')),
  services: z.array(z.enum(['delivery', 'pickup', 'dine_in'])).min(1).max(3).default(['delivery']),
  own_delivery: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

type Category = { name: string; subcategories: string[] };
// The chosen path must exist in the onboarding tree; a restaurant picks types, a store a family + category, a service a category.
function checkPath(b: z.infer<typeof Full>): string | null {
  const subsOk = (allowed: string[]) => b.subcategories.length > 0 && b.subcategories.every(s => allowed.includes(s));
  if (b.partner_type === 'restaurant') return subsOk(taxonomy.restaurant.types.map(t => t.name)) ? null : 'Pick at least one restaurant type.';
  if (b.partner_type === 'logistic') return null;
  const cats: Category[] = b.partner_type === 'store'
    ? taxonomy.store.families.find(f => f.name === b.category_family)?.categories ?? []
    : taxonomy.service.categories;
  if (b.partner_type === 'store' && !cats.length) return 'Choose your store family.';
  const cat = cats.find(c => c.name === b.category);
  if (!cat) return 'Choose your category.';
  return subsOk(cat.subcategories) ? null : 'Select at least one subcategory.';
}
// The older single "business type" the rest of the platform reads, derived from the path.
function businessType(b: { partner_type: string; category_family?: string; category?: string; subcategories: string[] }): string {
  const has = (s: string) => b.subcategories.includes(s);
  if (b.partner_type === 'logistic') return 'logistics';
  if (b.partner_type === 'service') return 'service';
  if (b.partner_type === 'restaurant') return has('Café') || has('Bakery') ? 'cafe_bakery' : has('Sweets') ? 'sweets' : 'restaurant';
  if (has('Pharmacy / chemist')) return 'pharmacy';
  if (has('Supermarket')) return 'supermarket';
  if (b.category === 'Bakery and sweets') return 'sweets';
  if (b.category_family === 'Grocery and daily needs') return 'grocery';
  if (b.category === 'Beauty and health') return 'beauty';
  return 'retail';
}

export type ApplicationReceipt = { reference: string; status: string; existing: boolean };

function badRequest(error: z.ZodError): never {
  const first = error.issues[0];
  throw new HttpError(400, first?.message && !/^(Invalid|Expected|Required|Too small|Too big)/.test(first.message) ? first.message : `Please check ${String(first?.path?.[0] ?? 'the form').replace(/_/g, ' ')}.`);
}

async function byKey(key: string) {
  const { data, error } = await db().from('ol_partner_applications').select('id, reference, status').eq('submit_key', key).maybeSingle();
  if (error) fromDbError(error);
  return data as { id: string; reference: string; status: string } | null;
}

export async function submitPartnerApplication(request: Request, raw: unknown): Promise<ApplicationReceipt> {
  const stage = (raw as { stage?: unknown } | null)?.stage === 'draft' ? 'draft' : 'submit';
  // Drafts are saved as people go (auto-save), so they get a wider allowance than final submissions.
  if (stage === 'draft') await limitCaller(request, 'partner-draft', 30, 3_600_000, { verify: false, anonIpMax: 60 });
  else await limitCaller(request, 'partner-apply', 5, 3_600_000, { verify: false, anonIpMax: 15 });
  if (!dbConfigured()) throw new HttpError(503, 'Sign-ups are not open on this server yet.');
  const city = resolveCity(request);

  const parsed = (stage === 'draft' ? Basics : Full).safeParse(raw);
  if (!parsed.success) badRequest(parsed.error);
  const b = parsed.data as z.infer<typeof Full>;
  if (stage === 'submit') { const why = checkPath(b); if (why) throw new HttpError(400, why); }

  const base = {
    city_id: city, partner_type: b.partner_type, business_name: b.business_name, owner_name: b.owner_name, phone: b.phone, email: b.email,
    business_type: businessType({ partner_type: b.partner_type, category_family: b.category_family, category: b.category, subcategories: b.subcategories ?? [] }),
    consent_version: CONSENT_VERSION, consent_at: new Date().toISOString(), source: 'partner_website',
  };
  const full = stage === 'draft' ? {} : {
    category_family: b.category_family ?? null, category: b.category ?? null, subcategories: b.subcategories,
    outlets: b.outlets, address: b.address, pin_code: b.pin_code, whatsapp_ok: b.whatsapp_ok, gstin: b.gstin ?? null, fssai: b.fssai ?? null,
    services: b.services, own_delivery: b.own_delivery, notes: b.notes?.trim() || null, status: 'submitted',
  };

  const prior = await byKey(b.submit_key);
  if (prior && prior.status !== 'draft') return { reference: prior.reference, status: prior.status, existing: true };
  const write = prior
    ? db().from('ol_partner_applications').update({ ...base, ...full }).eq('id', prior.id).eq('status', 'draft')
    : db().from('ol_partner_applications').insert({ ...base, ...full, submit_key: b.submit_key, status: stage === 'draft' ? 'draft' : 'submitted' });
  const { data, error } = await write.select('reference, status').single();
  if (!error) return { reference: data.reference as string, status: data.status as string, existing: false };
  if (error.code === '23505') {
    // An open application (draft or submitted) already exists for this phone: answer with that one, so the owner keeps one reference.
    const { data: open } = await db().from('ol_partner_applications').select('reference, status')
      .eq('city_id', city).eq('phone', b.phone).in('status', ['draft', 'submitted', 'reviewing']).limit(1).maybeSingle();
    if (open) return { reference: open.reference as string, status: open.status as string, existing: true };
  }
  fromDbError(error);
}
