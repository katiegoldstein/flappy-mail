# Flappy Mail

Slow letters by 8-bit carrier pigeon. A letter flies in real time at 50 mph, sleeps at night, and the
recipient hears nothing until it lands. 16% of letters are lost on the way, and the sender only finds out when it happens.

**Status:** all 7 build steps are done and tested locally. Nothing is deployed yet: going live needs the accounts in
[Going live](#going-live).

## Services and what they cost

Every service is on a free plan. None of these free plans bills automatically: going over a limit makes requests fail
or emails wait, and nothing is charged unless you choose to upgrade. Limits were checked on 2026-10-27 against each
provider's own docs (linked).

| Service | Used for | Free-plan limits | What would cost money |
| --- | --- | --- | --- |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/) | The site and API (one Worker serving static assets) | 100,000 requests/day (resets midnight UTC); 10 ms CPU per request; 64 MiB Worker size (ours is 2.6 MB); 50 outside requests per run | Workers Paid, $5/month, only if daily traffic passes 100,000 requests. Over the limit, visitors see Cloudflare error 1027 until midnight UTC |
| [Cloudflare D1](https://developers.cloudflare.com/d1/platform/pricing/) | The database | 5 million rows read and 100,000 written per day; 500 MB per database, 5 GB total | Same Workers Paid plan. Over the limit, queries fail until midnight UTC (enforced since 2026-09-01) |
| [Cron Triggers](https://developers.cloudflare.com/workers/platform/limits/) | The email scheduler, every 5 minutes | 5 per account (we use 1); 10 ms CPU per run | Nothing at our scale |
| [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/plans/) | The invisible CAPTCHA | Unlimited checks, up to 20 widgets (we use 1) | Nothing |
| [Resend](https://resend.com/pricing) | Email | **3,000 emails/month and 100/day**, 3 domains | Pro, $20/month, for 50,000 emails/month and no daily cap |
| flappymail.net | The domain, registered through Vercel | | The yearly domain renewal (already paid) |

**The first limit we'll hit is Resend's 100 emails a day.** A delivered letter sends 3 emails (departure, arrival,
delivered) and a lost one sends 2, so the free plan covers about **33 letters a day**. Past that, emails aren't lost:
the scheduler retries every 5 minutes and they go out after the daily cap resets at midnight UTC, so a letter's
emails could arrive up to a day late. Upgrading Resend to Pro ($20/month) removes the daily cap.

Rough usage at a busy day (a full coop of 1,000 birds, 1,000 page views): about 2 million D1 rows read (the
flight list is cached at the edge for 60 seconds), a few thousand rows written, and well under 100,000 requests.

## Going live

These need you, since they mean creating accounts. Each is free.

1. **Cloudflare account** (free). Then, here: `npx wrangler login`, `npx wrangler d1 create flappy-mail` (put the ID
   it prints into `wrangler.toml`), `npx wrangler d1 migrations apply flappy-mail --remote`.
2. **Domain.** Cloudflare Workers can serve flappymail.net only once Cloudflare runs its DNS. That means switching
   the domain's nameservers in Vercel to the two Cloudflare gives you (free; the domain stays registered with Vercel).
3. **Turnstile widget** in the Cloudflare dashboard for flappymail.net. Put the site key in `wrangler.toml` as
   `TURNSTILE_SITE_KEY` and the secret with `npx wrangler secret put TURNSTILE_SECRET`.
4. **Resend account** (free). Add flappymail.net, then add the SPF, DKIM and DMARC records it shows to the domain's
   DNS (in Cloudflare after step 2). Then `npx wrangler secret put RESEND_API_KEY`.
5. `npx wrangler secret put IP_SALT` (any long random string; it keeps the hashed sender IPs unguessable).
6. `npm run build && npx wrangler deploy`.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # local-only settings
npm run db:migrate               # creates the local database
npm run build                    # the API serves the built site's assets
npm run dev                      # site on :5173, API + database on :8787
npm test                         # 19 tests: travel engine, names, emails
```

- **Email:** goes to a local outbox at http://localhost:5173/dev/outbox until Resend is set up. Locally the scheduler runs every 5 seconds.
- **CAPTCHA:** locally, Turnstile uses Cloudflare's official test keys, so the check always passes and needs no account.
- **Dev tools** (not in the production build): http://localhost:5173/review.html shows every screen at desktop and phone
  size; http://localhost:5173/dev/trips.html is a trip planner for any two cities.

### Dev switches (`.dev.vars`)

| Setting | Effect |
| --- | --- |
| `TIME_WARP=3600` | One trip-hour passes per real second. SF → LA lands, and its emails arrive, in about 20 seconds |
| `FORCE_LOSS=1` | Every new letter is lost, at a random point like a real loss |
| `COOP_CAP=3` | Shrinks the coop to test "ALL PIGEONS ARE OUT" |
| `RATE_LIMITS=off` | For the load test below |

They only take effect when `ENVIRONMENT=development` and the site URL isn't flappymail.net, so they can't be
switched on in production. The same goes for the seed script's backdated departures.

### Load testing the map

```bash
npm run seed -- 300   # needs RATE_LIMITS=off; sends 300 real letters through the local API
npm run db:reset      # removes every local letter and outbox email
```

The seed script refuses to run against anything but localhost. Its letters are ordinary letters in the local database.
There are no decoy birds anywhere: the map only ever shows real letters in transit.

## Abuse protection and privacy

- **Invisible CAPTCHA:** Cloudflare Turnstile runs when Send is pressed. It only shows anything if Cloudflare needs a click. Every send is checked server-side.
- **Rate limits:** 5 letters a day per sender connection (by hashed IP), plus the site-wide daily cap. Recipients can block further birds from the link in their email.
- **"Don't send me birds":** a link in every recipient email, plus one-click unsubscribe headers for mail apps. Blocked addresses can't be sent to, and letters already on their way are never announced to them.
- **Letters are plain text everywhere:** set with `textContent`, never parsed as HTML, links not made clickable. Emails never contain the letter.
- **Unguessable links:** tracking and letter links use 192-bit random tokens. Nothing lists letters.
- **No token leaks:** every page sends `Referrer-Policy: no-referrer`, so the tokens in links never reach Google Fonts or Cloudflare. Pages also get a strict Content-Security-Policy, `X-Frame-Options: DENY` and `nosniff` (`public/_headers`).
- **The public map is coarse:** it shows only pigeon names, countries, status and arrival times. Routes are rounded to 0.25°, so exact endpoints can't be read off it.
- **The loss stays secret:** it's never sent to anyone before `lost_at`. Doomed letters look identical to the rest until then.

## How it works

### API (`worker/`)

| Endpoint | What it does |
| --- | --- |
| `GET /api/cities?q=` | City autocomplete over the GeoNames list |
| `GET /api/geo` | Best guess at the sender's city (Cloudflare's request location, or `?lat&lon` from the AUTO button) |
| `GET /api/coop` | Pigeons free, and when the next one lands if the coop is empty |
| `GET /api/name?carrier=` | A fresh name not used by anything in the air |
| `GET /api/config` | The Turnstile site key |
| `POST /api/estimate` | Trip time, plus local sun time at the origin; mentions a bottle only when both cities are coastal and a sea route exists |
| `POST /api/letters` | Checks Turnstile and the rate limits, plans the trip, rolls the hidden 16%, takes a pigeon from the coop, sends the departure email |
| `GET /api/track/:token` | The sender's private view. A loss is revealed only after `lost_at` |
| `GET /api/letter/:token` | The recipient's letter, only once it has landed (never for lost letters) |
| `GET /api/letter/:token/reply` | "Send a bird back": route reversed, names and emails filled in |
| `GET/POST /block/:token` | "Don't send me birds". Opening the link shows a button; only a POST blocks (email scanners open every link) |
| `GET /api/flights` | Every carrier in the air: name, countries, coarse route, the next 3 hours of its plan. Cached 60 s; about 75 KB compressed for a full coop |

The coop limit and unique names are enforced in one SQL statement, so two people sending at once can't both take the
last pigeon (tested with three simultaneous sends at a cap of 3).

### Scheduler and emails (`worker/scheduler.ts`, `worker/email.ts`)

Every 5 minutes:
0. Departure emails that didn't go out at send time are retried.
1. Lost letters past `lost_at` are marked lost. The sender gets "Uh oh. Sir Pickles got caught in a storm" with a "Send another bird" link. The recipient is never told.
2. Landed letters are marked delivered. The recipient gets "A pigeon named Sir Pickles just landed on your windowsill", then the sender gets "Your letter to Maya was delivered".

Each email is claimed with a conditional UPDATE before it's sent, so overlapping runs can't double-send, and a failed
send is released for the next run. At most 40 emails go out per run, inside Cloudflare's 50-request allowance.

### Travel engine (`shared/`)

One set of modules shared by the browser and the server:

- **`travel.ts`:**
  - `pigeonPlan`: great circle at 50 mph, flying only 7:00–19:00 local solar time, built in 10-minute steps and stored as fly/sleep segments.
  - `bottlePlan`: 2 mph day and night over a sea route.
  - `positionAt`: the one position function.
  - `rollLoss`: a 16% crypto-random chance, lost 15–85% of the way.
- **`sea-route.ts`:** A* over a 0.5° world-ocean grid. The Panama and Suez canals and the narrow straits (Gibraltar, Bosporus, Dover, Øresund, Singapore, Hormuz, Bab-el-Mandeb) are kept open. Each city pair's route is computed once and stored.
- **`cities.ts`:** the GeoNames list of 34,188 cities with 15,000+ people. 11,659 are coastal (within 50 km of the world ocean; lakes and the Caspian don't count).

| Trip | Pigeon | Bottle |
| --- | --- | --- |
| SF → NYC | 2,566 mi, 4.1–4.7 days | 5,944 sea mi via Panama, ~124 days |
| SF → London | 5,354 mi, ~9 days | never offered (London is inland) |
| SF → LA | 347 mi, under a day | 410 sea mi, ~9 days |
| SF → Tokyo | 5,139 mi, ~8.3 days | 5,074 sea mi, ~106 days |

### The map (`src/map/`)

- **Basemap:** rasterized in the browser from Natural Earth for whatever's on screen (12–35 ms). During a drag or pinch the last image slides and scales (under 1 ms a frame), and it's redrawn when the gesture pauses.
- **Birds:** drawn at three levels of detail; about 4–5 ms with 280 birds on screen. Positions come from each stored plan, recomputed every second; the flight list refreshes every minute.
- **Your pigeon:** stays highlighted while you browse. "Back to my pigeon" appears when it's off screen.

### Cutscenes and audio (`src/cutscene.ts`, `src/audio.ts`)

- **Scenes:** departure, seven loss vignettes and arrival; 5–10 seconds each, skippable.
- **Skies and terrain:** the sky follows real local sun time at the place in question (where it took off, was lost, or landed). The terrain is a city skyline, fields, mountains or open ocean.
- **Audio:** generated with the Web Audio API, so there are no sound files. A looping chiptune theme plus effects. Sound is on by default and the mute choice is remembered; it starts on the first tap, and a "TAP FOR SOUND" hint shows until then.

## Choices made where the spec was open

- **The bottle easter egg** washes in only after the sender picks a city from the list, a beat later, and only when both cities are on the ocean coast. It never appears on page load, even when a draft or resend refills both cities.
- **Night shading matches the sleep rule:** pigeons fly by local *solar* time, so the night overlay is a north–south band. The mockup tilted it.
- **Map birds** are grey with no trail.
- **Zoom levels:** world (fits the screen), region at zoom 4.5, close-up at zoom 6.
- **Follow** toggles to Unfollow. Dragging or zooming also stops following.
- **Pigeon pronouns:** system copy uses the pigeon's name, since titles range from Sir to Dame.
- **Antarctica isn't drawn.** No letters go there, and it would fill half a phone screen.
- **Sleeping spot:** an asleep pigeon perches in a tree over land, and naps on a passing ship over open water.
- **"Don't send me birds"** needs one button press after opening the link; mail apps' one-click unsubscribe works directly. A plain link would let email security scanners block people by accident.
- **No email verification**, as assumed in the spec: the CAPTCHA, rate limits and block link handle abuse. Letters are kept indefinitely so recipients can reopen them.

## Spec checklist

- [x] SF → NYC estimates about 4–5 days, and the pigeon visibly sleeps at night on the map.
- [x] With time warp, the recipient gets the arrival email, reads the letter, and can reply.
- [x] With a forced loss, nothing reveals it early; the sender gets the lost email at `lost_at`, sees the loss cutscene, and can re-send.
- [x] The bottle never appears for SF → Denver or SF → London, and washes in for SF → Tokyo.
- [x] With the cap at 3, the next sender sees "ALL PIGEONS ARE OUT" with a countdown; simultaneous sends can't exceed the cap.
- [x] Every letter gets a unique, kid-safe name shown on every screen and in the emails.
- [x] The home page opens on the whole world, shows only real birds in transit, refreshes each minute, reveals no personal details, and a doomed pigeon vanishes only at `lost_at`.
- [x] Light mode by default, dark mode toggle, choice remembered.
- [x] Zooming goes from tiny sprites to mini sprites to full labeled pigeons; the same birds at every level.
- [x] A tracking link opens the close-up following the sender's pigeon with the private panel.
- [x] Sound starts after the first tap and the mute choice is remembered.
- [x] Every screen works at 390px and 1280px.
- [x] This README lists every service, its free-tier limits, and what would trigger a bill.

## Where things live

- `src/`: the pages (`home.ts`, `compose.ts`, `letter.ts`), the map (`map/`), cutscenes, audio, sprites.
- `shared/`: travel engine, geometry, sun, cities, names (used by the browser and the Worker).
- `worker/`: the API, scheduler, emails, recipient pages.
- `migrations/`: the database schema.
- `scripts/`: dev server, geography build (`npm run geo`), icons, local seed.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via `world-atlas`. City data:
[GeoNames](https://www.geonames.org/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), credited on the site.
