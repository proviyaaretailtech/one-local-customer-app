// Helpers shared by the /api routes. Expo Router API routes run only on the server, so
// nothing in /server is ever bundled into the app.

export class HttpError extends Error {
  // `code` is a machine-readable reason ('offer_expired'); apps that only know `detail` ignore it.
  constructor(public status: number, public detail: string, public headers?: Record<string, string>, public code?: string) { super(detail); }
}

export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init);

// The app reads `detail` from error bodies, so errors keep the shape the old backend used.
export const fail = (status: number, detail: string, headers?: Record<string, string>, code?: string) =>
  Response.json(code ? { detail, code } : { detail }, { status, headers });

type Handler = (request: Request, params: Record<string, string>) => Response | Promise<Response>;

export function route(handler: Handler): Handler {
  return async (request, params) => {
    try {
      return await handler(request, params ?? {});
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.detail, error.headers, error.code);
      console.error('[api]', request.method, new URL(request.url).pathname, error);
      return fail(500, 'Something went wrong. Please try again.');
    }
  };
}

export async function readBody<T = Record<string, unknown>>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too large');
  try {
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as T;
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
}

// Interim per-process limiter until the shared Redis limiter lands (plan §8). Resets on restart.
const g = globalThis as unknown as { __onecityLimits?: Map<string, { count: number; reset: number }> };
const buckets = (g.__onecityLimits ??= new Map());

export function limit(subject: string, name: string, max: number, windowMs: number) {
  const now = Date.now();
  const key = `${name}:${subject}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++bucket.count > max) {
    const seconds = Math.ceil((bucket.reset - now) / 1000);
    throw new HttpError(429, `Too many attempts. Please try again in ${seconds} seconds.`, { 'Retry-After': String(seconds) });
  }
}

// Each device sends a random key it created itself (src/api.ts). Until sign-in exists it is the
// only thing that separates one customer's orders from another's, so only its hash is stored.
export function customerKey(request: Request): string | null {
  const key = request.headers.get('x-customer-key');
  return key && /^[A-Za-z0-9_-]{24,128}$/.test(key) ? key : null;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 checks. crypto.subtle.verify recomputes the signature and compares in constant time, so a
// forged one cannot be guessed byte by byte from timings. Used for Razorpay's webhook and for the
// dispatch service's signed calls (dispatch.ts).
export async function signatureOk(secret: string, message: string, signature: unknown): Promise<boolean> {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new Uint8Array(signature.match(/../g)!.map(h => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(message));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))), b => b.toString(16).padStart(2, '0')).join('');
}
