// Email: short, playful, plain-text first. Never includes the letter text itself.
// Without RESEND_API_KEY (local development) emails go to the outbox table, readable at /dev/outbox.
import { Env, isDev } from './env';
import { escapeHtml } from './util';

export type Mail = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };

export async function sendEmail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    if (!isDev(env)) { console.error('RESEND_API_KEY is not set; email not sent:', mail.subject); return false; }
    await env.DB.prepare('INSERT INTO outbox (to_addr, subject, text, html, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(mail.to, mail.subject, mail.text, mail.html, Date.now()).run();
    return true;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers }),
  });
  if (!r.ok) console.error('Resend error', r.status, await r.text());
  return r.ok;
}

// One small "pixel" header in text, no images.
function wrap(title: string, paragraphs: string[], link?: { href: string; label: string }, footer?: string) {
  const p = paragraphs.map(t => `<p style="margin:0 0 14px;font:16px/1.4 Courier New,monospace;color:#2E2A40">${escapeHtml(t)}</p>`).join('');
  const button = link ? `<p style="margin:20px 0"><a href="${escapeHtml(link.href)}" style="display:inline-block;background:#E4574A;color:#fff;font:bold 15px Courier New,monospace;padding:12px 18px;border:3px solid #2E2A40;text-decoration:none">${escapeHtml(link.label)} &#9654;</a></p>` : '';
  const foot = footer ? `<p style="margin:24px 0 0;font:13px/1.4 Courier New,monospace;color:#6B5A3A">${footer}</p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#F6E7C1"><div style="max-width:520px;margin:0 auto;padding:24px">` +
    `<div style="background:#2A0F24;color:#FFD46B;font:bold 18px Courier New,monospace;padding:12px 16px;border-bottom:4px solid #FFD46B">&#128038; FLAPPY MAIL</div>` +
    `<div style="background:#FFF8E4;border:4px solid #2E2A40;border-top:0;padding:20px">` +
    `<h1 style="margin:0 0 14px;font:bold 18px Courier New,monospace;color:#2E2A40">${escapeHtml(title)}</h1>${p}${button}${foot}</div></div></body></html>`;
}

const textOf = (title: string, paragraphs: string[], link?: { href: string; label: string }) =>
  [title, '', ...paragraphs.flatMap(p => [p, '']), ...(link ? [`${link.label}: ${link.href}`, ''] : []), '— Flappy Mail'].join('\n');

export function departureEmail(o: { to: string; carrierName: string; bottle: boolean; recipient: string; fromCity: string; toCity: string; eta: string; trackingUrl: string }): Mail {
  const subject = o.bottle ? `${o.carrierName} is drifting off with your letter` : `${o.carrierName} has taken off with your letter`;
  const paras = [
    o.bottle
      ? `Your letter to ${o.recipient} is corked into ${o.carrierName} and bobbing away from ${o.fromCity} toward ${o.toCity}.`
      : `${o.carrierName} has your letter to ${o.recipient} tied on tight and is flying from ${o.fromCity} to ${o.toCity}.`,
    `Estimated arrival: ${o.eta}. ${o.bottle ? 'Bottles drift day and night, and slowly.' : 'Remember, pigeons sleep at night!'}`,
    `${o.recipient} won't hear a thing until it lands.`,
  ];
  const link = { href: o.trackingUrl, label: o.bottle ? 'Track your bottle' : 'Track your pigeon' };
  return { to: o.to, subject, text: textOf(subject, paras, link), html: wrap(subject, paras, link) };
}

// ---------- recipient: the bird landed ----------
export function arrivalEmail(o: { to: string; carrierName: string; bottle: boolean; senderFirst: string; recipientFirst: string; letterUrl: string; blockUrl: string }): Mail {
  const subject = o.bottle ? `A bottle washed up on your shore` : `A pigeon named ${o.carrierName} just landed on your windowsill`;
  const paras = [
    `Hi ${o.recipientFirst},`,
    o.bottle
      ? `${o.carrierName} just washed up with a letter for you from ${o.senderFirst}. It's been drifting a long time.`
      : `${o.carrierName} just landed with a letter for you from ${o.senderFirst}.`,
    `Flappy Mail sends letters by 8-bit carrier pigeon: they fly in real time, sleep at night, and only arrive when they arrive.`,
  ];
  const link = { href: o.letterUrl, label: 'Read your letter' };
  const foot = `Don't want birds? <a href="${escapeHtml(o.blockUrl)}" style="color:#6B5A3A">Don't send me birds</a>.`;
  const text = textOf(subject, paras, link) + `\n\nDon't want birds? Don't send me birds: ${o.blockUrl}`;
  return {
    to: o.to, subject, text, html: wrap(subject, paras, link, foot),
    // One-click unsubscribe for mail apps that support it (Gmail, Yahoo, Apple Mail).
    headers: { 'List-Unsubscribe': `<${o.blockUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// ---------- sender: delivered ----------
export function deliveredEmail(o: { to: string; carrierName: string; bottle: boolean; recipientFirst: string; toCity: string; tripText: string; trackingUrl: string }): Mail {
  const subject = `Your letter to ${o.recipientFirst} was delivered`;
  const paras = [
    o.bottle
      ? `${o.carrierName} washed up in ${o.toCity} after ${o.tripText} at sea. ${o.recipientFirst} has your letter.`
      : `${o.carrierName} landed in ${o.toCity} after ${o.tripText} in the air. ${o.recipientFirst} has your letter.`,
  ];
  const link = { href: o.trackingUrl, label: 'See the trip' };
  return { to: o.to, subject, text: textOf(subject, paras, link), html: wrap(subject, paras, link) };
}

// ---------- sender: lost in the mail ----------
export function lostEmail(o: { to: string; carrierName: string; bottle: boolean; recipientFirst: string; reasonText: string; resendUrl: string; trackingUrl: string }): Mail {
  const subject = `Uh oh. ${o.carrierName} ${o.reasonText}`;
  const paras = [
    `Uh oh. ${o.carrierName} ${o.reasonText}, and your letter to ${o.recipientFirst} didn't make it.`,
    `${o.recipientFirst} was never told a letter was coming. You can send it again with a fresh ${o.bottle ? 'bottle' : 'pigeon'}.`,
  ];
  const link = { href: o.resendUrl, label: 'Send another bird' };
  const foot = `<a href="${escapeHtml(o.trackingUrl)}" style="color:#6B5A3A">See what happened</a>`;
  return { to: o.to, subject, text: textOf(subject, paras, link) + `\n\nSee what happened: ${o.trackingUrl}`, html: wrap(subject, paras, link, foot) };
}
