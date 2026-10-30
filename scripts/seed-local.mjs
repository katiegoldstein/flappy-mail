// LOCAL LOAD TEST ONLY. Sends real letters through the local API so the map can be checked with a
// full sky: random routes between big cities, departed at random times over the last few days.
// They're ordinary letters in the local database (their emails land in the local outbox).
// Refuses to run against anything but localhost. Set RATE_LIMITS=off in .dev.vars first. Remove them with: npm run db:reset
// Usage: node scripts/seed-local.mjs [count] [base url]
import fs from 'node:fs';

const count = Number(process.argv[2] ?? 200);
const base = process.argv[3] ?? 'http://127.0.0.1:8787';
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) { console.error(`Refusing to seed ${base}: local development only.`); process.exit(1); }

const { rows } = JSON.parse(fs.readFileSync(new URL('../public/data/cities.json', import.meta.url), 'utf8'));
const big = rows.slice(0, 400); // the biggest cities
const pick = () => big[Math.floor(Math.random() * big.length)];
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

let ok = 0, bottles = 0;
for (let i = 0; i < count; i++) {
  const a = pick(); let b = pick();
  while (b[0] === a[0]) b = pick();
  const est = await post('/api/estimate', { from: a[0], to: b[0] });
  const carrier = est.bottle && Math.random() < 0.25 ? 'bottle' : 'pigeon';
  const { name } = await fetch(`${base}/api/name?carrier=${carrier}`).then(r => r.json());
  const hours = (carrier === 'bottle' ? est.bottle.hours : est.pigeon.hours) ?? 24;
  const r = await post('/api/letters', {
    body: `Load-test letter ${i + 1}.`, senderName: 'Load Test', senderEmail: `seed+${i}@example.com`,
    recipientName: 'Test Recipient', recipientEmail: `seed-to+${i}@example.com`, from: a[0], to: b[0], carrier, carrierName: name,
    turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', // passes with Turnstile's local test keys
    devDepartedAgoMs: Math.random() * Math.min(hours, 10 * 24) * 3_600_000 * 0.95,
  });
  if (r.id) { ok++; if (carrier === 'bottle') bottles++; } else console.log('skipped:', r.message);
}
console.log(`Seeded ${ok} letters (${bottles} bottles) into the local database.`);
