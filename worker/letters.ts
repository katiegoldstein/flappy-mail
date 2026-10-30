// Letters: the coop, names, estimates, sending, the sender's tracking view and the public flight list.
import { Env, isDev, timeWarp, forceLoss, coopCap, rateLimitsOn, dailyLetterCap, LIMIT_PER_IP } from './env';
import { cityById, nearestCity, likelyCity, searchCities, cityJson } from './cities';
import { json, fail, token, sha256, normEmail, validEmail, cleanName, validName, firstName, readJson, ipBucket } from './util';
import { sendEmail, departureEmail } from './email';
import { City, lonlat, countryLabel } from '../shared/cities';
import { LonLat } from '../shared/geo';
import { pigeonPlan, bottlePlanAlong, positionAt, rollLoss, LOSS_TEXT, Plan, Segment, Carrier } from '../shared/travel';
import { seaRoute, isSeaAt } from '../shared/sea-route';
import { solarHour } from '../shared/sun';
import { pigeonName, bottleName, isValidName } from '../shared/names';

// A carrier is "in the air" until it lands, or until its loss moment if it's doomed.
const IN_AIR = 'arrives_at > ?1 AND (lost_at IS NULL OR lost_at > ?1)';

export async function coopStatus(env: Env, now = Date.now()) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(CASE WHEN lost_at IS NOT NULL AND lost_at < arrives_at THEN lost_at ELSE arrives_at END) AS next
     FROM letters WHERE carrier = 'pigeon' AND ${IN_AIR}`).bind(now).first<{ n: number; next: number | null }>();
  const cap = coopCap(env), inAir = r?.n ?? 0;
  return { cap, inAir, free: Math.max(0, cap - inAir), nextFreeAt: inAir >= cap ? r?.next ?? null : null };
}

async function namesInAir(env: Env, now: number): Promise<Set<string>> {
  const r = await env.DB.prepare(`SELECT carrier_name FROM letters WHERE ${IN_AIR}`).bind(now).all<{ carrier_name: string }>();
  return new Set(r.results.map(x => x.carrier_name));
}

export async function freshName(env: Env, carrier: Carrier, avoid?: string) {
  const taken = await namesInAir(env, Date.now());
  if (avoid) taken.add(avoid);
  return carrier === 'bottle' ? bottleName(taken) : pigeonName(taken);
}

// Bottle routes are slow to compute (up to ~20 ms), so each city pair is worked out once and stored.
async function cachedSeaRoute(env: Env, a: City, b: City): Promise<{ route: LonLat[]; miles: number } | null> {
  const pair = `${a.id}-${b.id}`;
  const hit = await env.DB.prepare('SELECT route, miles FROM sea_routes WHERE pair = ?').bind(pair).first<{ route: string | null; miles: number }>();
  if (hit) return hit.route ? { route: JSON.parse(hit.route), miles: hit.miles } : null;
  const sea = seaRoute(lonlat(a), lonlat(b));
  await env.DB.prepare('INSERT OR REPLACE INTO sea_routes (pair, route, miles) VALUES (?, ?, ?)')
    .bind(pair, sea ? JSON.stringify(sea.route) : null, sea?.miles ?? 0).run();
  return sea;
}

// "About 4 days, 6 hours" (pigeons) or "about 3 months" (bottles).
export function etaText(hours: number): string {
  const days = hours / 24;
  if (days >= 60) return `about ${Math.round(days / 30)} months`;
  if (days >= 14) return `about ${Math.round(days)} days`;
  if (hours < 1) return `about ${Math.max(5, Math.round((hours * 60) / 5) * 5)} minutes`; // short hops, like across a bay
  const d = Math.floor(days), h = Math.round(hours - d * 24);
  const hh = `${h} hour${h === 1 ? '' : 's'}`;
  return d ? `about ${d} day${d === 1 ? '' : 's'}, ${hh}` : `about ${hh}`;
}

// ---------- GET /api/cities?q= ----------
export function cities(url: URL) {
  return json({ cities: searchCities(url.searchParams.get('q') ?? '').map(cityJson) }, 200, { 'cache-control': 'public, max-age=86400' });
}

// ---------- GET /api/geo ---------- best guess at the sender's city
export function geo(req: Request, url: URL) {
  const cf = (req as Request & { cf?: { latitude?: string; longitude?: string } }).cf;
  const lat = Number(url.searchParams.get('lat') ?? cf?.latitude), lon = Number(url.searchParams.get('lon') ?? cf?.longitude);
  if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return json({ city: null });
  const c = likelyCity([lon, lat]);
  return json({ city: c ? cityJson(c) : null });
}

// ---------- GET /api/coop and /api/name ----------
export async function coop(env: Env) {
  return json(await coopStatus(env));
}
export async function name(env: Env, url: URL) {
  const carrier = url.searchParams.get('carrier') === 'bottle' ? 'bottle' : 'pigeon';
  return json({ name: await freshName(env, carrier, url.searchParams.get('not') ?? undefined) });
}

// ---------- POST /api/estimate {from, to} ----------
// The bottle is only mentioned when both cities are on the ocean and a sea route exists.
export async function estimate(env: Env, req: Request) {
  const b = (await readJson<{ from?: number; to?: number }>(req, 2000)) ?? {};
  const A = cityById(Number(b.from)), B = cityById(Number(b.to));
  if (!A || !B) return fail(400, 'bad_city', 'Pick both cities from the list.');
  const now = Date.now();
  const p = pigeonPlan(lonlat(A), lonlat(B), now);
  const hours = (p.arrivesAt - now) / 3_600_000;
  // originHour: local sun time where the pigeon takes off, so the departure scene has the right sky.
  const out: Record<string, unknown> = { pigeon: { miles: Math.round(p.miles), hours, text: etaText(hours) }, originHour: solarHour(A.lon, now) };
  if (A.coastal && B.coastal && A.id !== B.id) {
    const sea = await cachedSeaRoute(env, A, B);
    if (sea) { const h = sea.miles / 2; out.bottle = { miles: Math.round(sea.miles), hours: h, text: etaText(h) }; }
  }
  return json(out);
}

// Turnstile's server-side check. Without a secret it passes only in local development.
async function humanCheck(env: Env, tokenIn: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return isDev(env);
  if (!tokenIn) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', tokenIn);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).catch(() => null);
  type Verdict = { success: boolean; hostname?: string };
  const d: Verdict = r ? await r.json<Verdict>().catch(() => ({ success: false })) : { success: false };
  // In production, the check must have happened on our own site (not a token borrowed from elsewhere).
  if (d.success && !isDev(env) && d.hostname !== new URL(env.SITE_URL).hostname) return false;
  return d.success === true;
}

// GET /api/config: public settings the pages need.
export const config = (env: Env) => json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null }, 200, { 'cache-control': 'public, max-age=300' });

// ---------- POST /api/letters ----------
type SendBody = {
  body?: string; senderName?: string; senderEmail?: string; recipientName?: string; recipientEmail?: string;
  from?: number; to?: number; carrier?: Carrier; carrierName?: string; resendOf?: string; replyTo?: string;
  devDepartedAgoMs?: number; // local development only (the load-test seed script); ignored in production
  turnstileToken?: string;
};

export async function send(env: Env, req: Request, ctx: ExecutionContext) {
  const b = await readJson<SendBody>(req);
  if (!b) return fail(400, 'bad_request', 'That letter got scrambled. Try again?');
  const body = typeof b.body === 'string' ? b.body.replace(/\r\n/g, '\n').trim() : '';
  const senderName = cleanName(b.senderName), recipientName = cleanName(b.recipientName);
  const senderEmail = normEmail(String(b.senderEmail ?? '')), recipientEmail = normEmail(String(b.recipientEmail ?? ''));
  const A = cityById(Number(b.from)), B = cityById(Number(b.to));
  const carrier: Carrier = b.carrier === 'bottle' ? 'bottle' : 'pigeon';
  const carrierName = String(b.carrierName ?? '');
  if (!body) return fail(400, 'empty', 'Your letter is empty.', { field: 'body' });
  if (body.length > 1000) return fail(400, 'too_long', 'Letters are limited to 1,000 characters.', { field: 'body' });
  if (!senderName) return fail(400, 'name', 'Add your name.', { field: 'senderName' });
  if (!recipientName) return fail(400, 'name', 'Add their name.', { field: 'recipientName' });
  const nameRule = 'Names can only use letters, spaces, hyphens and apostrophes (up to 40).';
  if (!validName(senderName)) return fail(400, 'name', nameRule, { field: 'senderName' });
  if (!validName(recipientName)) return fail(400, 'name', nameRule, { field: 'recipientName' });
  if (!validEmail(senderEmail)) return fail(400, 'email', "That doesn't look like an email address.", { field: 'senderEmail' });
  if (!validEmail(recipientEmail)) return fail(400, 'email', "That doesn't look like an email address.", { field: 'recipientEmail' });
  if (!A) return fail(400, 'city', 'Pick your city from the list.', { field: 'from' });
  if (!B) return fail(400, 'city', 'Pick their city from the list.', { field: 'to' });
  if (!isValidName(carrierName, carrier)) return fail(400, 'carrier_name', 'Pick a name with the New name button.');

  // The invisible CAPTCHA (Cloudflare Turnstile).
  const ip = req.headers.get('cf-connecting-ip') ?? '';
  if (!(await humanCheck(env, b.turnstileToken, ip))) return fail(403, 'captcha', "We couldn't check that you're a person. Try sending again?");

  // Rate limits: 5 letters a day per sender connection, plus the site-wide daily cap.
  const now0 = Date.now(), dayAgo = now0 - 86_400_000;
  const ipHash = await sha256(ipBucket(ip) + '|' + (env.IP_SALT ?? 'flappy'));
  if (rateLimitsOn(env)) {
    const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM letters WHERE created_at > ?').bind(dayAgo).first<{ n: number }>();
    if ((today?.n ?? 0) >= dailyLetterCap(env)) return fail(429, 'rate_daily', 'The coop has sent all the birds it can for today. Try again tomorrow!');
    const byIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM letters WHERE sender_ip_hash = ? AND created_at > ?').bind(ipHash, dayAgo).first<{ n: number }>();
    if ((byIp?.n ?? 0) >= LIMIT_PER_IP) return fail(429, 'rate_ip', `You've sent ${LIMIT_PER_IP} birds today. The coop needs a rest. Try again tomorrow.`);
  }

  // The recipient asked not to get birds.
  const emailHash = await sha256(recipientEmail);
  if (await env.DB.prepare('SELECT 1 FROM blocked_recipients WHERE email_hash = ?').bind(emailHash).first())
    return fail(403, 'blocked', "That address has asked not to receive birds, so we can't send this one.", { field: 'recipientEmail' });

  const now = Date.now();
  let resendOf: string | null = null, replyTo: string | null = null;
  if (b.resendOf) {
    const orig = await env.DB.prepare('SELECT id, lost_at FROM letters WHERE tracking_token = ? AND lost = 1').bind(b.resendOf).first<{ id: string; lost_at: number }>();
    if (orig && orig.lost_at <= now) resendOf = orig.id;
  }
  if (b.replyTo) {
    const orig = await env.DB.prepare('SELECT id FROM letters WHERE letter_token = ?').bind(b.replyTo).first<{ id: string }>();
    if (orig) replyTo = orig.id;
  }

  // Plan the whole trip now.
  const warp = timeWarp(env);
  const departed = isDev(env) && Number(b.devDepartedAgoMs) > 0 ? now - Math.min(Number(b.devDepartedAgoMs), 30 * 86_400_000) : now;
  let plan: Plan;
  if (carrier === 'bottle') {
    const sea = A.coastal && B.coastal && A.id !== B.id ? await cachedSeaRoute(env, A, B) : null;
    if (!sea) return fail(400, 'no_bottle', "A bottle can't make that trip. Send a pigeon instead.");
    plan = bottlePlanAlong(sea.route, sea.miles, departed, { warp });
  } else plan = pigeonPlan(lonlat(A), lonlat(B), departed, { warp });
  // A sender's first letter always arrives; the 16% loss only applies after that.
  const firstLetter = !(await env.DB.prepare('SELECT 1 FROM letters WHERE sender_email = ? LIMIT 1').bind(senderEmail).first());
  const loss = forceLoss(env) || !firstLetter ? rollLoss(plan, { force: forceLoss(env) }) : { lost: false, lostAt: null, reason: null };

  const id = 'FM-' + token(6).toUpperCase().replace(/[-_]/g, 'X').slice(0, 7);
  const trackingToken = token(), letterToken = token();
  const cols = {
    id, tracking_token: trackingToken, letter_token: letterToken, sender_name: senderName, sender_email: senderEmail,
    recipient_name: recipientName, recipient_email: recipientEmail, body, carrier, carrier_name: carrierName,
    origin_city_id: A.id, origin_lat: A.lat, origin_lng: A.lon, dest_city_id: B.id, dest_lat: B.lat, dest_lng: B.lon,
    route: JSON.stringify(plan.route), distance_miles: plan.miles, plan: JSON.stringify(plan.segments),
    departed_at: plan.departedAt, arrives_at: plan.arrivesAt, lost: loss.lost ? 1 : 0, lost_at: loss.lostAt, lost_reason: loss.reason,
    reply_to_letter_id: replyTo, resend_of_letter_id: resendOf, sender_ip_hash: ipHash, created_at: now,
  };
  const names = Object.keys(cols), vals = Object.values(cols);
  const n = vals.length;
  // One statement, so two senders can't both take the last pigeon or the same name (SQLite runs writes one at a time).
  const res = await env.DB.prepare(
    `INSERT INTO letters (${names.join(', ')}) SELECT ${names.map((_, i) => '?' + (i + 1)).join(', ')}
     WHERE (?${n + 1} = 'bottle' OR (SELECT COUNT(*) FROM letters WHERE carrier = 'pigeon' AND arrives_at > ?${n + 2} AND (lost_at IS NULL OR lost_at > ?${n + 2})) < ?${n + 3})
     AND NOT EXISTS (SELECT 1 FROM letters WHERE carrier_name = ?${n + 4} AND arrives_at > ?${n + 2} AND (lost_at IS NULL OR lost_at > ?${n + 2}))`,
  ).bind(...vals, carrier, now, coopCap(env), carrierName).run();

  if (!res.meta.changes) {
    if ((await namesInAir(env, now)).has(carrierName))
      return fail(409, 'name_taken', `Another carrier called ${carrierName} is already in the air. Here's a new name.`, { name: await freshName(env, carrier) });
    const c = await coopStatus(env, now);
    return fail(409, 'coop_full', 'All pigeons are out.', { nextFreeAt: c.nextFreeAt });
  }

  const trackingUrl = `${env.SITE_URL}/?t=${trackingToken}`;
  const eta = etaText((plan.arrivesAt - now) * warp / 3_600_000);
  ctx.waitUntil((async () => {
    const ok = await sendEmail(env, departureEmail({
      to: senderEmail, carrierName, bottle: carrier === 'bottle', recipient: firstName(recipientName),
      fromCity: A.name, toCity: B.name, eta, trackingUrl,
    }));
    if (ok) await env.DB.prepare('UPDATE letters SET departure_email_sent_at = ? WHERE id = ?').bind(Date.now(), id).run();
  })());

  return json({ id, trackingToken, trackingUrl, carrierName, carrier, miles: Math.round(plan.miles), eta, departedAt: plan.departedAt, arrivesAt: plan.arrivesAt, warp }, 201);
}

// ---------- GET /api/track/:token ---------- the sender's private view
type Row = {
  id: string; carrier: Carrier; carrier_name: string; recipient_name: string; origin_city_id: number; dest_city_id: number;
  route: string; plan: string; distance_miles: number; departed_at: number; arrives_at: number; lost: number; lost_at: number | null; lost_reason: string | null;
  body: string; sender_name: string; sender_email: string; recipient_email: string;
};

function planOf(r: Row): Plan {
  return { carrier: r.carrier, route: JSON.parse(r.route), miles: r.distance_miles, departedAt: r.departed_at, arrivesAt: r.arrives_at, segments: JSON.parse(r.plan) as Segment[] };
}

// The pigeon's log: where it is, in words. Only the sender sees this.
function logLine(r: Row, plan: Plan, at: number, dest: City): string {
  const pos = positionAt(plan, at);
  const near = nearestCity(pos.lonlat, 50000);
  const place = near ? `${near.city.name}, ${countryLabel(near.city.cc)}` : 'the middle of nowhere';
  const sea = isSeaAt(pos.lonlat);
  const off = near ? `${Math.round(near.miles / 10) * 10 || 10} miles off ${near.city.name}` : 'far out at sea';
  const name = r.carrier_name;
  let where: string;
  if (r.carrier === 'bottle') where = sea ? `Bobbing along about ${off}.` : `Drifting near ${place}.`;
  else if (pos.state === 'sleeping') where = sea ? `Napping on a passing ship about ${off}. Back in the air at sunrise.` : `Asleep in a tree near ${place}. Back in the air at sunrise.`;
  else if (sea) where = `Flying over open water, about ${off}.`;
  else where = near && near.miles < 25 ? `Flying over ${place}.` : `Flying over the countryside near ${place}.`;
  const ahead = pos.milesLeft < 120 ? `${dest.name} is in sight!` : `${dest.name} is ${Math.round(pos.milesLeft).toLocaleString('en-US')} miles ahead.`;
  return `${where} ${ahead} We'll email you the moment ${name} ${r.carrier === 'bottle' ? 'washes up' : 'lands'}.`;
}

export async function track(env: Env, tok: string) {
  const r = await env.DB.prepare('SELECT * FROM letters WHERE tracking_token = ?').bind(tok).first<Row>();
  if (!r) return fail(404, 'not_found', "We couldn't find that pigeon. Check the link in your email.");
  const now = Date.now();
  const plan = planOf(r);
  const A = cityById(r.origin_city_id)!, B = cityById(r.dest_city_id)!;
  const isLost = r.lost === 1 && r.lost_at !== null && now >= r.lost_at; // never reveal a loss before it happens
  const status = isLost ? 'lost' : now >= r.arrives_at ? 'delivered' : 'in_transit';
  return json({
    id: r.id, carrier: r.carrier, name: r.carrier_name, recipientName: firstName(r.recipient_name),
    from: { name: A.name, cc: countryLabel(A.cc) }, to: { name: B.name, cc: countryLabel(B.cc) },
    route: plan.route, plan: plan.segments, miles: plan.miles, departedAt: r.departed_at, arrivesAt: r.arrives_at,
    status,
    stoppedAt: isLost ? r.lost_at : null,
    lossText: isLost ? LOSS_TEXT[r.lost_reason!] : null,
    lossReason: isLost ? r.lost_reason : null,
    // Where and when it happened, so the loss scene shows the right sky and terrain.
    lossScene: isLost ? (() => { const at = positionAt(plan, r.lost_at!).lonlat; return { sea: isSeaAt(at), hour: solarHour(at[0], r.lost_at!) }; })() : null,
    log: status === 'in_transit' ? logLine(r, plan, now, B) : null,
  });
}

// GET /api/track/:token/draft: "Send another bird" re-fills compose, only after a loss.
export async function draft(env: Env, tok: string) {
  const r = await env.DB.prepare('SELECT * FROM letters WHERE tracking_token = ?').bind(tok).first<Row>();
  if (!r || r.lost !== 1 || (r.lost_at ?? Infinity) > Date.now()) return fail(404, 'not_found', 'Nothing to resend.');
  const A = cityById(r.origin_city_id)!, B = cityById(r.dest_city_id)!;
  return json({ body: r.body, senderName: r.sender_name, senderEmail: r.sender_email, recipientName: r.recipient_name, recipientEmail: r.recipient_email, from: cityJson(A), to: cityJson(B) });
}

// ---------- GET /api/flights ---------- every carrier in the air, by city name; route points rounded
const coarse = (p: LonLat): LonLat => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
// The map refreshes every minute, so it only needs the stretch of each plan around now.
// This keeps a full coop's response small enough for phones.
export const PLAN_WINDOW_MS = 3 * 3_600_000;
export function planWindow(segments: Segment[], now: number): Segment[] {
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const near = segments.filter(s => s.t1 >= now - 60_000 && s.t0 <= now + PLAN_WINDOW_MS);
  return (near.length ? near : segments.slice(-1)).map(s => ({ t0: Math.round(s.t0), t1: Math.round(s.t1), f0: r5(s.f0), f1: r5(s.f1), state: s.state }));
}

// Past trips for the departures board: the carrier's name, cities and how it ended. No people's names or emails.
// A doomed letter only shows as lost once its loss moment has passed, like on the map.
const RECENT_LIMIT = 30;
async function recentTrips(env: Env, now: number) {
  const rows = await env.DB.prepare(
    `SELECT carrier, carrier_name, origin_city_id, dest_city_id, lost, CASE WHEN lost = 1 THEN lost_at ELSE arrives_at END AS ended_at
     FROM letters WHERE (lost = 0 AND arrives_at <= ?1) OR (lost = 1 AND lost_at <= ?1)
     ORDER BY ended_at DESC LIMIT ?2`).bind(now, RECENT_LIMIT).all<{ carrier: 'pigeon' | 'bottle'; carrier_name: string; origin_city_id: number; dest_city_id: number; lost: number; ended_at: number }>();
  return rows.results.map(r => ({
    name: r.carrier_name, kind: r.carrier, endedAt: r.ended_at, outcome: r.lost ? 'lost' : 'landed',
    from: cityById(r.origin_city_id)?.name ?? '?', to: cityById(r.dest_city_id)?.name ?? '?',
  }));
}

export async function flights(env: Env) {
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT id, carrier, carrier_name, origin_city_id, dest_city_id, route, plan, distance_miles, departed_at, arrives_at
     FROM letters WHERE ${IN_AIR} ORDER BY departed_at DESC`).bind(now).all<Row>();
  let flying = 0, sleeping = 0, bottles = 0;
  const birds = rows.results.map(r => {
    const plan = planOf(r);
    const state = positionAt(plan, now).state;
    if (r.carrier === 'bottle') bottles++; else if (state === 'sleeping') sleeping++; else flying++;
    return {
      id: r.id, name: r.carrier_name, kind: r.carrier,
      from: cityById(r.origin_city_id)?.name ?? '?', to: cityById(r.dest_city_id)?.name ?? '?',
      route: plan.route.map(coarse), plan: planWindow(plan.segments, now), departedAt: r.departed_at, arrivesAt: r.arrives_at,
    };
  });
  const landed = await env.DB.prepare(`SELECT COUNT(*) AS n FROM letters WHERE lost = 0 AND arrives_at <= ?1 AND arrives_at > ?2`).bind(now, now - 86_400_000).first<{ n: number }>();
  const cap = coopCap(env), pigeons = flying + sleeping;
  return json({ at: now, birds, recent: await recentTrips(env, now), counts: { pigeons, flying, sleeping, bottles, landedToday: landed?.n ?? 0, free: Math.max(0, cap - pigeons), cap } },
    200, { 'cache-control': 'public, max-age=60' });
}

