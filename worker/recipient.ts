// The recipient's side: the letter page's data, "Send a bird back", and "Don't send me birds".
import { Env, timeWarp } from './env';
import { json, fail, sha256, firstName, escapeHtml, SECURITY_HEADERS } from './util';
import { cityById, cityJson } from './cities';
import { countryLabel } from '../shared/cities';

type LetterRow = {
  id: string; letter_token: string; carrier: 'pigeon' | 'bottle'; carrier_name: string; body: string;
  sender_name: string; sender_email: string; recipient_name: string; recipient_email: string;
  origin_city_id: number; dest_city_id: number; distance_miles: number; departed_at: number; arrives_at: number; lost: number;
};

// A letter can be read only once its carrier has landed (lost letters never land).
async function landed(env: Env, tok: string) {
  const r = await env.DB.prepare('SELECT * FROM letters WHERE letter_token = ?').bind(tok).first<LetterRow>();
  return r && r.lost === 0 && Date.now() >= r.arrives_at ? r : null;
}

// GET /api/letter/:token
export async function letter(env: Env, tok: string) {
  const r = await landed(env, tok);
  if (!r) return fail(404, 'not_found', "We couldn't find that letter. Check the link in your email.");
  const A = cityById(r.origin_city_id)!, B = cityById(r.dest_city_id)!;
  return json({
    carrier: r.carrier, carrierName: r.carrier_name, body: r.body,
    from: firstName(r.sender_name), to: firstName(r.recipient_name),
    fromCity: { name: A.name, cc: countryLabel(A.cc) }, toCity: { name: B.name, cc: countryLabel(B.cc), lon: B.lon },
    miles: Math.round(r.distance_miles), tripHours: ((r.arrives_at - r.departed_at) * timeWarp(env)) / 3_600_000, arrivedAt: r.arrives_at,
  });
}

// GET /api/letter/:token/reply: compose with the route reversed and both names and emails filled in.
export async function reply(env: Env, tok: string) {
  const r = await landed(env, tok);
  if (!r) return fail(404, 'not_found', 'Nothing to reply to.');
  return json({
    senderName: r.recipient_name, senderEmail: r.recipient_email, recipientName: r.sender_name, recipientEmail: r.sender_email,
    from: cityJson(cityById(r.dest_city_id)!), to: cityJson(cityById(r.origin_city_id)!),
  });
}

// GET /block/:token shows a one-button page; POST blocks the address (also what mail apps' one-click unsubscribe sends).
// A plain GET never blocks, because email scanners open every link in a message.
export async function block(env: Env, req: Request, tok: string) {
  const r = await env.DB.prepare('SELECT recipient_email FROM letters WHERE letter_token = ?').bind(tok).first<{ recipient_email: string }>();
  if (!r) return page('Hmm.', "We couldn't find that link.", '', 404);
  if (req.method === 'POST') {
    await env.DB.prepare('INSERT OR IGNORE INTO blocked_recipients (email_hash, created_at) VALUES (?, ?)').bind(await sha256(r.recipient_email), Date.now()).run();
    return page('No more birds.', `We won't deliver any more letters to ${r.recipient_email}. Letters already on their way won't be delivered to you either.`, '');
  }
  return page("Don't send me birds", `Stop all Flappy Mail letters to ${r.recipient_email}? Nobody will be told.`,
    `<form method="post"><button type="submit">DON'T SEND ME BIRDS</button></form>`);
}

function page(title: string, text: string, extra: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Flappy Mail</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap">
<style>body{margin:0;min-height:100vh;background:#5C94FC;display:flex;align-items:center;justify-content:center;font-family:VT323,monospace;color:#2E2A40;padding:16px;box-sizing:border-box}
main{background:#F6E7C1;border:4px solid #2E2A40;box-shadow:8px 8px 0 #2E2A40;padding:24px;max-width:460px}
h1{font:16px/1.5 'Press Start 2P',monospace;margin:0 0 14px}p{font-size:22px;margin:0 0 18px;overflow-wrap:anywhere}
button{font:12px 'Press Start 2P',monospace;padding:16px;min-height:52px;width:100%;background:#E4574A;color:#fff;border:4px solid #2E2A40;box-shadow:0 6px 0 #7E1019;cursor:pointer}
a{color:#2E2A40}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>${extra}<p style="font-size:18px;margin:0"><a href="/">Flappy Mail</a></p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
}
