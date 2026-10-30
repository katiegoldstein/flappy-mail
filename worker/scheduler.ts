// The scheduler, every 5 minutes (a Cron Trigger). Each email is claimed before it's sent, by setting
// its *_email_sent_at in a conditional UPDATE, so overlapping runs never send the same email twice.
// If sending fails the claim is released and the next run tries again.
import { Env, timeWarp } from './env';
import { sendEmail, Mail, departureEmail, arrivalEmail, deliveredEmail, lostEmail } from './email';
import { sha256, firstName } from './util';
import { cityById } from './cities';
import { etaText } from './letters';
import { LOSS_TEXT } from '../shared/travel';

type Due = {
  id: string; tracking_token: string; letter_token: string; carrier: 'pigeon' | 'bottle'; carrier_name: string;
  sender_name: string; sender_email: string; recipient_name: string; recipient_email: string; dest_city_id: number;
  departed_at: number; arrives_at: number; lost_reason: string | null;
  arrival_email_sent_at: number | null; delivered_email_sent_at: number | null;
};
type Col = 'departure_email_sent_at' | 'lost_email_sent_at' | 'arrival_email_sent_at' | 'delivered_email_sent_at';

const BATCH = 50; // letters looked at per run
// Emails sent per run. Cloudflare's free plan allows 50 outside requests per run; anything left over goes 5 minutes later.
const EMAIL_BUDGET = 40;
let budget = EMAIL_BUDGET;

async function claimAndSend(env: Env, id: string, col: Col, now: number, mail: () => Mail | Promise<Mail | null>): Promise<boolean> {
  if (budget <= 0) return false;
  const claim = await env.DB.prepare(`UPDATE letters SET ${col} = ? WHERE id = ? AND ${col} IS NULL`).bind(now, id).run();
  if (!claim.meta.changes) return false; // another run got there first
  const m = await mail();
  if (!m) return true; // nothing to send (the recipient blocked birds), but the step is done
  budget--;
  const ok = await sendEmail(env, m).catch(e => { console.error(e); return false; });
  if (!ok) await env.DB.prepare(`UPDATE letters SET ${col} = NULL WHERE id = ?`).bind(id).run();
  return ok;
}

export async function runScheduler(env: Env, now = Date.now()) {
  const site = env.SITE_URL;
  const done = { departures: 0, lost: 0, arrivals: 0, delivered: 0 };
  budget = EMAIL_BUDGET;

  // 0. Departure emails that didn't go out at send time (for example, the daily email cap was hit).
  const dep = await env.DB.prepare(
    `SELECT * FROM letters WHERE departure_email_sent_at IS NULL AND created_at < ? LIMIT ${BATCH}`).bind(now - 60_000).all<Due & { origin_city_id: number }>();
  for (const r of dep.results) {
    const A = cityById(r.origin_city_id), B = cityById(r.dest_city_id);
    if (await claimAndSend(env, r.id, 'departure_email_sent_at', now, () => departureEmail({
      to: r.sender_email, carrierName: r.carrier_name, bottle: r.carrier === 'bottle', recipient: firstName(r.recipient_name),
      fromCity: A?.name ?? 'home', toCity: B?.name ?? 'its destination',
      eta: etaText(((r.arrives_at - r.departed_at) * timeWarp(env)) / 3_600_000), trackingUrl: `${site}/?t=${r.tracking_token}`,
    }))) done.departures++;
  }

  // 1. Lost letters, at their loss moment: mark lost, tell the sender. The recipient is never told.
  const lost = await env.DB.prepare(
    `SELECT * FROM letters WHERE lost = 1 AND lost_at <= ? AND lost_email_sent_at IS NULL LIMIT ${BATCH}`).bind(now).all<Due>();
  for (const r of lost.results) {
    await env.DB.prepare(`UPDATE letters SET status = 'lost' WHERE id = ?`).bind(r.id).run();
    if (await claimAndSend(env, r.id, 'lost_email_sent_at', now, () => lostEmail({
      to: r.sender_email, carrierName: r.carrier_name, bottle: r.carrier === 'bottle', recipientFirst: firstName(r.recipient_name),
      reasonText: LOSS_TEXT[r.lost_reason ?? 'storm'], resendUrl: `${site}/send?resend=${r.tracking_token}`, trackingUrl: `${site}/?t=${r.tracking_token}`,
    }))) done.lost++;
  }

  // 2. Arrivals: mark delivered, email the recipient, then the sender.
  const due = await env.DB.prepare(
    `SELECT * FROM letters WHERE lost = 0 AND arrives_at <= ? AND (arrival_email_sent_at IS NULL OR delivered_email_sent_at IS NULL) LIMIT ${BATCH}`).bind(now).all<Due>();
  for (const r of due.results) {
    await env.DB.prepare(`UPDATE letters SET status = 'delivered' WHERE id = ?`).bind(r.id).run();
    const bottle = r.carrier === 'bottle';
    if (r.arrival_email_sent_at === null) {
      const sent = await claimAndSend(env, r.id, 'arrival_email_sent_at', now, async () => {
        // The recipient may have said "Don't send me birds" while this one was on its way.
        if (await env.DB.prepare('SELECT 1 FROM blocked_recipients WHERE email_hash = ?').bind(await sha256(r.recipient_email)).first()) return null;
        return arrivalEmail({
          to: r.recipient_email, carrierName: r.carrier_name, bottle, senderFirst: firstName(r.sender_name), recipientFirst: firstName(r.recipient_name),
          letterUrl: `${site}/l/${r.letter_token}`, blockUrl: `${site}/block/${r.letter_token}`,
        });
      });
      if (!sent) continue; // the sender hears "delivered" only after the recipient's email has gone
      done.arrivals++;
    }
    const city = cityById(r.dest_city_id);
    // Trip length in trip time (the dev time warp squeezes real time, not the story).
    const tripHours = ((r.arrives_at - r.departed_at) * timeWarp(env)) / 3_600_000;
    if (await claimAndSend(env, r.id, 'delivered_email_sent_at', now, () => deliveredEmail({
      to: r.sender_email, carrierName: r.carrier_name, bottle, recipientFirst: firstName(r.recipient_name),
      toCity: city?.name ?? 'its destination', tripText: etaText(tripHours).replace(/^about /, ''), trackingUrl: `${site}/?t=${r.tracking_token}`,
    }))) done.delivered++;
  }
  return done;
}
