// Small helpers for the Worker.
// Security headers for responses the Worker makes itself (static pages get theirs from public/_headers).
export const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers } });

// Reads a JSON body of at most maxBytes; anything bigger or malformed gives null.
export async function readJson<T>(req: Request, maxBytes = 20_000): Promise<T | null> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) return null;
  const text = await req.text().catch(() => '');
  if (!text || text.length > maxBytes) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

// Rate limits count an IPv6 connection by its /64 network (one household), since each gets billions of addresses.
export const ipBucket = (ip: string) => (ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip);

export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json({ error: code, message, ...extra }, status);

// Long, unguessable tokens for the tracking and letter links.
export function token(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(e);
// Names appear in emails we send, so they're letters only (any language), with spaces, hyphens and apostrophes.
// That keeps links, "@" and phone numbers out, so nobody can use our emails to phish.
export const cleanName = (s: unknown) => (typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
export const validName = (s: string) => s.length >= 1 && s.length <= 40 && /^[\p{L}\p{M}][\p{L}\p{M}' ’-]*$/u.test(s);

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const firstName = (s: string) => s.trim().split(/\s+/)[0] || s;
