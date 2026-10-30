// Dev-only promo film, the recipient's side: a pigeon flies into town, the "landed" notification, the letter page.
// /film-receive.html?record=1 — a renderer calls window.__frame(i) for each frame (30 fps) and screenshots it.
// Not part of the production build (like film.html).
import './style.css';
import './letter.css';
import { h, logo, params, fmt } from './ui';
import { Scene } from './cutscene';
import { MapView, Bird } from './map/mapview';
import { loadCities } from './city-search';
import { installRecordClock } from './record-clock';
import { drawSprite, spriteEl, PIGEON, PIGEON_FLAP, PIGEON_STAND, CLOUD, CLOUD_PAL, CLOUD_SMALL, BOW, BOW_PAL } from './sprites';
import { pigeonPlan, positionAt, Plan } from '../shared/travel';
import { lonlat } from '../shared/cities';
import { routeLengths } from '../shared/geo';

const step = params.get('record') ? installRecordClock() : (_ms: number) => {};
export const FPS = 30;

// ---------- timeline (seconds) ----------
const T = { map: [0, 3.0], page: [2.85, 10.25], end: [10.1, 12.6] } as const;
const NOTIFY = 1.85, TAP_NOTE = 2.55;          // the notification drops in, then gets tapped
const SCENE_SPEED = 1.5;                       // the arrival scene, a little faster than real time
const LANDED = T.page[0] + 3 / SCENE_SPEED;    // the pigeon touches down on the sill
const UNTIE = 5.75, OPEN = UNTIE + 0.65;       // tap the ribbon; the letter unrolls (as on the site)
const TAP_REPLY = 9.65;
const FADE = 0.15;
export const LENGTH = T.end[1];
const events: [string, number][] = [];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const shown = (t: number, [a, b]: readonly [number, number], first = false, last = false) =>
  Math.min(first ? 1 : clamp01((t - a) / FADE), last ? 1 : clamp01((b - t) / FADE));
const at = (t: number, when: number) => Math.round(t * FPS) === Math.round(when * FPS); // exactly one frame

// ---------- stage ----------
document.body.style.cssText = 'margin:0;overflow:hidden;background:#120A24';
const layer = (bg = '') => { const d = h('div', { style: `position:fixed;inset:0;overflow:hidden;${bg}` }); document.body.append(d); return d; };

// 1. The real map: our pigeon flies into San Francisco.
const mapShot = layer();
const mapEl = h('div', { class: 'map', style: 'position:absolute;inset:0' });
mapShot.append(mapEl);
const map = new MapView(mapEl);
map.otherTags = false;
const dest = h('div', { style: 'position:absolute;transform:translate(calc(-100% - 16px),-50%)' },
  h('span', { class: 'pixel', style: 'font-size:12px;padding:6px 8px;background:#FFD46B;color:#3D1530;border:3px solid #14101F' }, 'SAN FRANCISCO'));
mapShot.append(dest);
// The "landed" email, as a phone notification (its subject line is the real one from worker/email.ts).
const note = h('div', { style: 'position:absolute;left:14px;right:14px;top:16px;display:flex;gap:14px;align-items:flex-start;padding:16px;background:rgba(255,248,228,.97);border-radius:22px;box-shadow:0 10px 30px rgba(20,16,31,.45)' },
  h('div', { style: 'flex:none;width:52px;height:52px;border-radius:12px;background:#2A0F24;display:flex;align-items:center;justify-content:center' }, logo(2)),
  h('div', { style: 'flex:1;min-width:0;font:600 17px/1.3 -apple-system,system-ui,sans-serif;color:#14101F' },
    h('div', { style: 'display:flex;justify-content:space-between;font-size:14px;font-weight:500;color:#6B5A3A;margin-bottom:3px' }, h('span', {}, 'Flappy Mail'), h('span', {}, 'now')),
    h('div', {}, 'A pigeon named Sir Pickles just landed on your windowsill'),
    h('div', { style: 'font-weight:400;color:#3D3550;margin-top:2px' }, 'A letter for you from Katie.')));
mapShot.append(note);

// 2. The recipient's letter page (letter.ts's markup and styles), with the real arrival scene on top.
const pageShot = layer('background:var(--parchment)');
const sceneHost = h('div', { class: 'l-scene-canvas' });
const sCloud = spriteEl(CLOUD_SMALL, CLOUD_PAL, 5); sCloud.classList.add('l-cloud');
const sceneBox = h('div', { class: 'l-scene', style: 'height:300px' }, sceneHost, sCloud, h('h1', { class: 'pixel l-title' }, 'A PIGEON JUST', h('br'), 'LANDED!'));
const text = h('div', { class: 'l-text' });
text.textContent = 'Dear Viewer,\n\nThanks for watching!\n\nHugs,\nKatie';
const article = h('article', { class: 'l-letter', hidden: true }, text);
const bow = spriteEl(BOW, BOW_PAL, 5); bow.classList.add('l-bow');
const ribbon = h('button', { type: 'button', class: 'l-roll' }, h('span', { class: 'l-band' }), bow);
const untieHint = h('p', { class: 'l-untie pixel' }, 'TAP THE RIBBON TO UNTIE');
const rider = spriteEl(PIGEON_STAND, PIGEON, 4); rider.classList.add('l-perch');
const paper = h('div', { class: 'l-paper' }, rider, ribbon, article);
const meta = h('div', { class: 'l-meta pixel' });
const reply = h('a', { class: 'game-btn l-reply' }, 'SEND A BIRD BACK ▶');
const page = h('div', { class: 'letter-page' }, sceneBox, h('main', { class: 'l-main' }, meta, paper,
  h('div', { class: 'l-row' }, untieHint, h('button', { type: 'button', class: 'chip-btn l-sound' }, '♪')), reply));
pageShot.append(page);
const arrive = new Scene(sceneHost, { kind: 'arrival', carrier: 'pigeon', sky: 'day', unit: 5 });
const chunky = (t: number) => Math.floor(t * 12) / 12;

// 3. End card.
const endShot = layer('background:linear-gradient(#5C94FC 0 25%, #6AA0FC 25% 50%, #7BACFC 50% 75%, #8DB8FC 75%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px');
const endBird = h('canvas', { width: 22 * 8, height: 14 * 8, style: 'image-rendering:pixelated' }) as HTMLCanvasElement;
const cloud = h('canvas', { width: 16 * 6, height: 7 * 6, style: 'position:absolute;top:22%;left:12%;image-rendering:pixelated' }) as HTMLCanvasElement;
drawSprite(cloud.getContext('2d')!, CLOUD, CLOUD_PAL, 0, 0, 6);
endShot.append(cloud, endBird,
  h('div', { class: 'pixel', style: 'font-size:40px;color:#FFD46B;text-shadow:5px 5px 0 #2E2A40' }, 'FLAPPY MAIL'),
  h('div', { class: 'pixel', style: 'font-size:13px;color:#fff;text-shadow:2px 2px 0 #2E2A40' }, 'letters by 8-bit carrier pigeon'),
  h('div', { class: 'pixel', style: 'margin-top:18px;font-size:16px;padding:14px 18px;background:#E4574A;color:#fff;border:4px solid #2E2A40;box-shadow:6px 6px 0 #2E2A40' }, 'flappymail.net'));

// Tap marker: a circle lands on a target, presses with a ripple.
const tap = h('div', { style: 'position:fixed;z-index:9;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #2E2A40;box-shadow:0 0 0 3px rgba(255,255,255,.85);pointer-events:none;opacity:0' });
const ring = h('div', { style: 'position:fixed;z-index:8;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #FFD46B;pointer-events:none;opacity:0' });
document.body.append(ring, tap);
// Draws the marker for a press at `press` on `el` (it shows 0.3s before and lifts 0.22s after); true while pressed.
function tapOn(el: HTMLElement, t: number, press: number, dx = 0) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2 + dx, y = r.top + r.height / 2;
  const tapIn = clamp01((t - press + 0.3) / 0.12), pressed = t >= press && t < press + 0.22;
  tap.style.left = ring.style.left = x + 'px'; tap.style.top = ring.style.top = y + 'px';
  tap.style.opacity = String(tapIn * (1 - clamp01((t - press - 0.22) / 0.12)));
  tap.style.transform = `scale(${pressed ? 0.78 : 1.2 - 0.2 * tapIn})`;
  tap.style.background = pressed ? 'rgba(255,212,107,.85)' : 'rgba(255,255,255,.55)';
  const rk = clamp01((t - press) / 0.4);
  ring.style.opacity = String(t >= press && rk < 1 ? 1 - rk : 0);
  ring.style.transform = `scale(${0.8 + rk * 1.4})`;
  if (at(t, press)) events.push(['click', t]);
  return pressed;
}

// CSS animations (the bow slipping off, the letter unrolling, the perched pigeon breathing) follow the film clock, not the wall clock.
const animStart = new WeakMap<Animation, number>();
function syncAnimations(t: number) {
  for (const a of document.getAnimations()) {
    if (!animStart.has(a)) animStart.set(a, t);
    a.pause();
    a.currentTime = (t - animStart.get(a)!) * 1000;
  }
}

// ---------- the flight ----------
let mine: { plan: Plan; cum: number[] };
let sfAt: [number, number] = [0, 0];

function tripLabel(hours: number) {
  const d = Math.floor(hours / 24), hh = Math.round(hours - d * 24);
  return d ? `${d} DAY${d === 1 ? '' : 'S'}, ${hh} HR${hh === 1 ? '' : 'S'}` : `${Math.max(1, hh)} HR${hh === 1 ? '' : 'S'}`;
}

async function setup() {
  const cities = await loadCities();
  const byName = (n: string, cc: string) => cities.find(c => c.name === n && c.cc === cc)!;
  const slc = byName('Salt Lake City', 'US'), sf = byName('San Francisco', 'US');
  const p = pigeonPlan(lonlat(slc), lonlat(sf), Date.UTC(2026, 9, 26, 22, 0)); // from the east, so the route comes in on a diagonal
  mine = { plan: p, cum: routeLengths(p.route) };
  sfAt = [sf.lon, sf.lat];
  const miles = mine.cum[mine.cum.length - 1];
  meta.append(`FROM KATIE · BY SIR PICKLES`, h('br'), `SALT LAKE CITY → SAN FRANCISCO`, h('br'), `${tripLabel((p.arrivesAt - p.departedAt) / 3_600_000)} · ${fmt(Math.round(miles))} MILES`);
  if (!map.ready) await new Promise<void>(r => { const t = setInterval(() => { if (map.ready) { clearInterval(t); r(); } }, 20); });
  map.centerOn(sf.lon, sf.lat + 0.5, 6);
  await new Promise<void>(r => { const id = setInterval(() => { clearInterval(id); r(); }, 800); });
  await document.fonts.load('16px "Press Start 2P"'); await document.fonts.load('20px VT323');
  (window as any).__info.arrives = new Date(p.arrivesAt).toISOString();
  (window as any).__info.state = [4, 2, 1].map(hr => positionAt(p, p.arrivesAt - hr * 3_600_000, mine.cum).state);
}

function myBird(sim: number): Bird {
  const p = positionAt(mine.plan, sim, mine.cum);
  return { id: 'mine', name: 'Sir Pickles', from: 'Salt Lake City', to: 'San Francisco', mine: true, kind: 'pigeon',
    lon: p.lonlat[0], lat: p.lonlat[1], plon: 2 * p.lonlat[0] - p.heading[0], plat: 2 * p.lonlat[1] - p.heading[1], asleep: p.state === 'sleeping', route: { pts: mine.plan.route, f: p.f } };
}

// ---------- one frame ----------
function frame(i: number) {
  const t = i / FPS;
  for (const [el, span, first, last] of [[mapShot, T.map, true, false], [pageShot, T.page, false, false], [endShot, T.end, false, true]] as const) {
    el.style.opacity = String(shown(t, span, first, last));
    el.style.visibility = t >= span[0] - 0.01 && t <= span[1] + 0.01 ? 'visible' : 'hidden';
  }
  tap.style.opacity = ring.style.opacity = '0';

  // 1. the last stretch of the flight, then the notification
  if (t <= T.map[1]) {
    const sim = lerp(mine.plan.arrivesAt - 4 * 3_600_000, mine.plan.arrivesAt - 60_000, ease(t / NOTIFY));
    const me = myBird(sim);
    map.setNow(new Date(sim));
    map.setBirds([me]);
    map.select('mine');
    map.centerOn((me.lon + sfAt[0]) / 2 - 0.6, (me.lat + sfAt[1]) / 2, 6); // a little west, room for the city tag
    const [dx, dy] = map.project(sfAt[0], sfAt[1]);
    dest.style.left = dx + 'px'; dest.style.top = dy + 'px';
    const k = ease((t - NOTIFY) / 0.25);
    note.style.transform = `translateY(${lerp(-160, 0, k)}px)`;
    if (at(t, NOTIFY)) events.push(['ding', t]);
    if (t > NOTIFY + 0.3) note.style.filter = tapOn(note, t, TAP_NOTE) ? 'brightness(.9)' : '';
  }

  // 2. the letter page: the pigeon lands, the ribbon comes undone, the letter unrolls
  if (t >= T.page[0] && t <= T.page[1]) {
    arrive.seek(chunky((t - T.page[0]) * SCENE_SPEED));
    if (at(t, LANDED)) events.push(['arrive', t]);
    if (t > UNTIE - 0.35 && t < UNTIE + 0.4) tapOn(ribbon, t, UNTIE, 40);
    if (t >= UNTIE && !paper.classList.contains('untying')) { paper.classList.add('untying'); untieHint.style.visibility = 'hidden'; }
    if (at(t, UNTIE)) events.push(['untie', t]);
    if (t >= OPEN && article.hidden) { ribbon.remove(); article.hidden = false; article.classList.add('open'); }
    // Scroll the reply button into view if the open letter pushed it off screen.
    const over = Math.max(0, page.scrollHeight - innerHeight + 16);
    page.style.transform = `translateY(${-over * ease((t - 8.9) / 0.4)}px)`;
    if (t > TAP_REPLY - 0.35 && t < T.page[1]) reply.style.transform = tapOn(reply, t, TAP_REPLY) ? 'translateY(6px)' : '';
  }

  // 3. end card: the logo pigeon flaps
  if (t >= T.end[0]) {
    if (at(t, T.end[0] + 0.3)) events.push(['send', t]);
    const ctx = endBird.getContext('2d')!;
    ctx.clearRect(0, 0, endBird.width, endBird.height);
    drawSprite(ctx, PIGEON_FLAP[Math.floor(t * 8) % 4], PIGEON, 0, Math.round(Math.sin(t * 6) * 4) + 8, 8);
  }
  syncAnimations(t);
  step(1000 / FPS);
}

(window as any).__frame = frame;
(window as any).__events = events;
(window as any).__info = { FPS, LENGTH, frames: Math.round(LENGTH * FPS) };
// Loading waits on timers too, so keep the fake clock ticking (setInterval isn't faked) until it's done.
const pump = setInterval(() => step(16), 16);
setup().then(() => { clearInterval(pump); frame(0); (window as any).__ready = true; });
