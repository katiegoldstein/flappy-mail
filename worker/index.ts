// Flappy Mail Worker: the API under /api, dev tools under /dev (local only), static site for everything else.
import { Env, isDev } from './env';
import { fail, escapeHtml } from './util';
import * as L from './letters';
import * as R from './recipient';
import { runScheduler } from './scheduler';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    // www.flappymail.net → flappymail.net
    if (url.hostname.startsWith('www.')) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    const p = url.pathname;
    try {
      // Writes only come from our own pages: other websites can't post on a visitor's behalf.
      if (req.method === 'POST' && p.startsWith('/api/') && !isDev(env)) {
        const origin = req.headers.get('origin');
        if (origin && origin !== new URL(env.SITE_URL).origin) return fail(403, 'origin', 'Not allowed.');
      }
      if (p === '/api/cities') return L.cities(url);
      if (p === '/api/geo') return L.geo(req, url);
      if (p === '/api/coop') return L.coop(env);
      if (p === '/api/config') return L.config(env);
      if (p === '/api/name') return L.name(env, url);
      if (p === '/api/estimate' && req.method === 'POST') return L.estimate(env, req);
      if (p === '/api/letters' && req.method === 'POST') return L.send(env, req, ctx);
      if (p === '/api/flights') return cached(req, ctx, () => L.flights(env), isDev(env));
      const m = p.match(/^\/api\/track\/([\w-]{20,})(\/draft)?$/);
      if (m) return m[2] ? L.draft(env, m[1]) : L.track(env, m[1]);
      const lm = p.match(/^\/api\/letter\/([\w-]{20,})(\/reply)?$/);
      if (lm) return lm[2] ? R.reply(env, lm[1]) : R.letter(env, lm[1]);
      if (p.startsWith('/api/')) return fail(404, 'not_found', 'No such endpoint.');
      const bm = p.match(/^\/block\/([\w-]{20,})$/);
      if (bm) return R.block(env, req, bm[1]);
      // The recipient's letter link: /l/<token> serves the letter page, which loads the letter itself.
      if (/^\/l\/[\w-]{20,}$/.test(p)) return env.ASSETS.fetch(new Request(new URL('/letter', url), req));
      if (p.startsWith('/dev/')) return isDev(env) ? devRoutes(env, url) : new Response('Not found', { status: 404 });
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return fail(500, 'oops', 'Something went wrong in the coop. Try again in a moment.');
    }
  },

  // Every 5 minutes: arrival, delivered and lost emails (step 5).
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduler(env).then(r => console.log('scheduler', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;

// The public flight list is the same for everyone, so it's cached at the edge for 60 seconds.
async function cached(req: Request, ctx: ExecutionContext, make: () => Promise<Response>, skip: boolean) {
  if (skip) return make();
  const cache = caches.default;
  const key = new Request(new URL(req.url).origin + '/api/flights');
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Local development only.
async function devRoutes(env: Env, url: URL) {
  // Run the scheduler now instead of waiting for the 5-minute cron (scripts/dev.mjs calls this every few seconds).
  if (url.pathname === '/dev/tick') return Response.json(await runScheduler(env));
  if (url.pathname === '/dev/outbox') {
    const id = Number(url.searchParams.get('id'));
    if (id) {
      const m = await env.DB.prepare('SELECT html FROM outbox WHERE id = ?').bind(id).first<{ html: string }>();
      return new Response(m?.html ?? 'Not found', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    const rows = await env.DB.prepare('SELECT id, to_addr, subject, text, created_at FROM outbox ORDER BY id DESC LIMIT 50').all<{ id: number; to_addr: string; subject: string; text: string; created_at: number }>();
    const items = rows.results.map(r => `<li><a href="/dev/outbox?id=${r.id}" target="_blank">${escapeHtml(r.subject)}</a><br><small>to ${escapeHtml(r.to_addr)} · ${new Date(r.created_at).toLocaleString()}</small><pre>${escapeHtml(r.text)}</pre></li>`).join('');
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Outbox (dev)</title>
<style>body{font:16px/1.4 monospace;background:#F6E7C1;color:#2E2A40;max-width:760px;margin:0 auto;padding:20px}li{background:#FFF8E4;border:3px solid #2E2A40;padding:12px;margin:0 0 14px;list-style:none}pre{white-space:pre-wrap}ul{padding:0}</style>
<h1>Outbox (local dev)</h1><p>Emails Flappy Mail would have sent. Real sending starts once Resend is set up.</p><ul>${items || '<li>No emails yet.</li>'}</ul>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response('Not found', { status: 404 });
}
