// Dev-only promo film: the app's real map, sprites and cutscenes on a scripted timeline.
// /film.html?record=1 — a renderer calls window.__frame(i) for each frame (30 fps) and screenshots it.
// Not part of the production build (like scene.html).
import './style.css';
import './compose.css';
import { h, logo, params } from './ui';
import { Scene } from './cutscene';
import { MapView, Bird } from './map/mapview';
import { clock, clockHourAt } from './sky';
import { loadCities } from './city-search';
import { installRecordClock } from './record-clock';
import { drawSprite, PIGEON, PIGEON_FLAP, CLOUD, CLOUD_PAL } from './sprites';
import { pigeonPlan, positionAt, Plan } from '../shared/travel';
import { pigeonName } from '../shared/names';
import { lonlat, City } from '../shared/cities';
import { routeLengths } from '../shared/geo';

const step = params.get('record') ? installRecordClock() : (_ms: number) => {};
export const FPS = 30;

// ---------- timeline (seconds) ----------
const T = {
  letter: [0, 2.75], depart: [2.6, 6.1], map: [5.95, 10.6], zoom: [10.6, 13.2], arrive: [13.05, 15.85], end: [15.7, 17.9],
} as const;
const FADE = 0.15;
export const LENGTH = T.end[1];
const events: [string, number][] = [];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// Piecewise-linear map through [u, value] knots.
const knots = (u: number, ks: [number, number][]) => {
  for (let i = 1; i < ks.length; i++) if (u <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], (u - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]));
  return ks[ks.length - 1][1];
};
// Opacity of a shot: fades in at its start (unless it's first) and out at its end (unless it's last).
const shown = (t: number, [a, b]: readonly [number, number], first = false, last = false) =>
  Math.min(first ? 1 : clamp01((t - a) / FADE), last ? 1 : clamp01((b - t) / FADE));

// ---------- stage ----------
document.body.style.cssText = 'margin:0;overflow:hidden;background:#120A24';
const layer = (bg = '') => { const d = h('div', { style: `position:fixed;inset:0;overflow:hidden;${bg}` }); document.body.append(d); return d; };

// 1. Writing the letter (the compose page's own letter panel).
const letterShot = layer('background:var(--sky);display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 28px;box-sizing:border-box');
const typed = h('textarea', { id: 'letter', rows: '7', readonly: true, style: 'min-height:0;height:300px;font-size:30px;line-height:1.35' }) as HTMLTextAreaElement;
const counter = h('span', { class: 'counter pixel' }, '0 / 1000');
const sendBtn = h('button', { type: 'button', class: 'game-btn send', style: 'width:100%;font-size:18px;padding:22px 0' }, 'SEND BY PIGEON ▶');
letterShot.append(
  h('div', { style: 'display:flex;align-items:center;gap:14px' }, logo(4), h('span', { class: 'pixel', style: 'font-size:22px;color:#FFD46B;text-shadow:3px 3px 0 #2E2A40' }, 'FLAPPY MAIL')),
  h('section', { class: 'letter-panel', style: 'flex:none' }, h('div', { class: 'letter-head' }, h('h1', { class: 'pixel' }, 'WRITE A LETTER'), counter), typed),
  sendBtn);
const LETTER = 'Dear Claude,\n\nI love building with you!\n\nHugs,\nKatie';

// 2 and 5. The real cutscenes, scrubbed with seek() (stepped at 12 fps like the site).
const departHost = layer(), arriveHost = layer();
const depart = new Scene(departHost, { kind: 'departure', carrier: 'pigeon', sky: 'day', terrain: 'city' });
const arrive = new Scene(arriveHost, { kind: 'arrival', carrier: 'pigeon', sky: 'day' });
const chunky = (t: number) => Math.floor(t * 12) / 12;

// 3 and 4. The real map.
const mapShot = layer();
const mapEl = h('div', { class: 'map', style: 'position:absolute;inset:0' });
mapShot.append(mapEl);
const map = new MapView(mapEl);
map.otherTags = false; // only our pigeon is labelled
const chip = h('div', { class: 'pixel', style: 'position:absolute;left:18px;top:18px;font-size:13px;padding:10px 12px;background:#3D1530;color:#FFD46B;border:4px solid #FFD46B;box-shadow:4px 4px 0 #14101F' });
mapShot.append(chip);
// Where the letter is going: a city marker that appears once San Francisco is on screen.
const dest = h('div', { style: 'position:absolute;display:flex;flex-direction:column;align-items:flex-start;gap:6px;transform:translate(-10px,-10px)' },
  h('i', { style: 'display:block;width:14px;height:14px;background:#fff;border:3px solid #14101F' }),
  h('span', { class: 'pixel', style: 'font-size:12px;padding:6px 8px;background:#FFD46B;color:#3D1530;border:3px solid #14101F' }, 'SAN FRANCISCO'));
mapShot.append(dest);
let sfAt: [number, number] = [0, 0];

// 6. End card.
const endShot = layer('background:linear-gradient(#5C94FC 0 25%, #6AA0FC 25% 50%, #7BACFC 50% 75%, #8DB8FC 75%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px');
const endBird = h('canvas', { width: 22 * 8, height: 14 * 8, style: 'image-rendering:pixelated' }) as HTMLCanvasElement;
const cloud = h('canvas', { width: 16 * 6, height: 7 * 6, style: 'position:absolute;top:22%;left:12%;image-rendering:pixelated' }) as HTMLCanvasElement;
drawSprite(cloud.getContext('2d')!, CLOUD, CLOUD_PAL, 0, 0, 6);
endShot.append(cloud, endBird,
  h('div', { class: 'pixel', style: 'font-size:40px;color:#FFD46B;text-shadow:5px 5px 0 #2E2A40' }, 'FLAPPY MAIL'),
  h('div', { class: 'pixel', style: 'font-size:13px;color:#fff;text-shadow:2px 2px 0 #2E2A40' }, 'letters by 8-bit carrier pigeon'),
  h('div', { class: 'pixel', style: 'margin-top:18px;font-size:16px;padding:14px 18px;background:#E4574A;color:#fff;border:4px solid #2E2A40;box-shadow:6px 6px 0 #2E2A40' }, 'flappymail.net'));

// Tap marker: a circle lands on a button, presses with a ripple.
const tap = h('div', { style: 'position:fixed;z-index:9;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #2E2A40;box-shadow:0 0 0 3px rgba(255,255,255,.85);pointer-events:none' });
const ring = h('div', { style: 'position:fixed;z-index:8;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:4px solid #FFD46B;pointer-events:none' });
document.body.append(ring, tap);

// ---------- the flight ----------
let flock: { plan: Plan; cum: number[]; id: string; name: string; from: string; to: string }[] = [];
let mine: { plan: Plan; cum: number[] };
const DEP = Date.UTC(2026, 9, 27, 20, 30); // 3:30 PM in Tulsa
const MINE_ID = 'mine';

async function setup() {
  const cities = await loadCities();
  const byName = (n: string, cc: string) => cities.find(c => c.name === n && c.cc === cc)!;
  const tulsa = byName('Tulsa', 'US'), sf = byName('San Francisco', 'US');
  const p = pigeonPlan(lonlat(tulsa), lonlat(sf), DEP);
  mine = { plan: p, cum: routeLengths(p.route) };
  sfAt = [sf.lon, sf.lat];
  // A sky full of other birds, mostly over the US, on the same clock as ours (so they sleep at night too).
  const big = (cc: string, min: number) => cities.filter(c => c.cc === cc && c.pop >= min);
  const us = big('US', 250_000);
  const abroad = ['GB', 'IE', 'FR', 'DE', 'ES', 'PT', 'IT', 'NL', 'CA', 'MX', 'BR', 'AR', 'JP', 'KR', 'AU', 'NZ', 'SG', 'ZA', 'KE', 'IS', 'SE', 'NO'].flatMap(cc => big(cc, 400_000));
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (l: City[]) => l[Math.floor(rnd() * l.length)];
  const taken = new Set<string>(['Sir Pickles']);
  for (let i = 0; i < 260; i++) {
    const a = rnd() < 0.75 ? pick(us) : pick(abroad);
    let b = rnd() < 0.7 ? pick(us) : pick(abroad);
    while (b.id === a.id) b = pick(us);
    const span = pigeonPlan(lonlat(a), lonlat(b), DEP).arrivesAt - DEP;
    const plan = pigeonPlan(lonlat(a), lonlat(b), DEP - rnd() * span * 0.8);
    const name = pigeonName(taken); taken.add(name);
    flock.push({ plan, cum: routeLengths(plan.route), id: 'f' + i, name, from: a.name, to: b.name });
  }
  if (!map.ready) await new Promise<void>(r => { const t = setInterval(() => { if (map.ready) { clearInterval(t); r(); } }, 20); });
  // Draw the close-up once so the detailed map layer is loaded before the first frame.
  map.centerOn(tulsa.lon, tulsa.lat, 6);
  await new Promise<void>(r => { const id = setInterval(() => { clearInterval(id); r(); }, 800); });
  await document.fonts.load('16px "Press Start 2P"'); await document.fonts.load('20px VT323');
}

function birdsAt(sim: number): Bird[] {
  const bird = (plan: Plan, cum: number[], extra: Partial<Bird> & { id: string; name: string; from: string; to: string }): Bird | null => {
    if (sim >= plan.arrivesAt || sim <= plan.departedAt) return null;
    const p = positionAt(plan, sim, cum);
    return { kind: 'pigeon', lon: p.lonlat[0], lat: p.lonlat[1], plon: 2 * p.lonlat[0] - p.heading[0], plat: 2 * p.lonlat[1] - p.heading[1], asleep: p.state === 'sleeping', route: { pts: plan.route, f: p.f }, ...extra };
  };
  const out = flock.map(f => bird(f.plan, f.cum, { id: f.id, name: f.name, from: f.from, to: f.to })).filter(Boolean) as Bird[];
  const m = bird(mine.plan, mine.cum, { id: MINE_ID, name: 'Sir Pickles → San Francisco', from: 'Tulsa', to: 'San Francisco', mine: true });
  if (m) out.unshift(m);
  return out;
}

// ---------- one frame ----------
let typedSoFar = 0;
function frame(i: number) {
  const t = i / FPS;
  letterShot.style.opacity = String(shown(t, T.letter, true));
  departHost.style.opacity = String(shown(t, T.depart));
  mapShot.style.opacity = String(shown(t, [T.map[0], T.zoom[1]]));
  arriveHost.style.opacity = String(shown(t, T.arrive));
  endShot.style.opacity = String(shown(t, T.end, false, true));
  for (const [el, [a, b]] of [[letterShot, T.letter], [departHost, T.depart], [mapShot, [T.map[0], T.zoom[1]]], [arriveHost, T.arrive], [endShot, T.end]] as const)
    el.style.visibility = t >= a - 0.01 && t <= b + 0.01 ? 'visible' : 'hidden';

  // 1. letter: type, then tap SEND
  const n = Math.round(LETTER.length * clamp01((t - 0.35) / 1.65));
  if (n !== typedSoFar) { if (n > typedSoFar && LETTER[n - 1] !== ' ' && LETTER[n - 1] !== '\n' && n % 2 === 0) events.push(['blip', t]); typedSoFar = n; }
  typed.value = LETTER.slice(0, n);
  counter.textContent = `${n} / 1000`;
  const r = sendBtn.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const tapIn = clamp01((t - 2.1) / 0.12), pressed = t >= 2.4 && t < 2.62;
  tap.style.left = ring.style.left = tx + 'px'; tap.style.top = ring.style.top = ty + 'px';
  tap.style.opacity = String(t < 2.75 ? tapIn * (1 - clamp01((t - 2.62) / 0.12)) : 0);
  tap.style.transform = `scale(${pressed ? 0.78 : 1.2 - 0.2 * tapIn})`;
  tap.style.background = pressed ? 'rgba(255,212,107,.85)' : 'rgba(255,255,255,.55)';
  sendBtn.style.transform = pressed ? 'translateY(6px)' : '';
  const rk = clamp01((t - 2.4) / 0.4);
  ring.style.opacity = String(t >= 2.4 && t < T.letter[1] - FADE ? 1 - rk : 0);
  ring.style.transform = `scale(${0.8 + rk * 1.4})`;
  if (Math.abs(t - 2.4) < 0.5 / FPS) events.push(['send', t]);

  // 2. departure scene, a little faster than real time
  if (t >= T.depart[0] && t <= T.depart[1]) depart.seek(chunky(0.4 + (t - T.depart[0]) * 1.3));

  // 3. map time-lapse: dusk, the bird perches asleep, then wakes at dawn. 4. zoom out to the flock.
  if (t >= T.map[0] && t <= T.zoom[1]) {
    let simH: number, z: number, lon: number, lat: number;
    if (t <= T.zoom[0]) {
      const u = (t - T.map[0]) / (T.map[1] - T.map[0]);
      simH = knots(u, [[0, 1.0], [0.28, 4.0], [0.42, 7.5], [0.72, 10.5], [0.86, 16.6], [1, 18.0]]); // 4:30 PM, dusk, 11 PM–2 AM asleep, quickly to 9:30 AM
    } else {
      simH = 18.0 + (t - T.zoom[0]) * 0.8;
    }
    const sim = DEP + simH * 3_600_000;
    const birds = birdsAt(sim), me = birds.find(b => b.id === MINE_ID)!;
    if (t <= T.zoom[0]) { lon = me.lon; lat = me.lat; z = 6; }
    else { const k = ease((t - T.zoom[0]) / (T.zoom[1] - T.zoom[0] - 0.5)); lon = lerp(me.lon, -62, k); lat = lerp(me.lat, 33, k); z = lerp(6, 2.45, k); }
    map.setNow(new Date(sim));
    map.setBirds(birds);
    map.select(MINE_ID);
    map.centerOn(lon, lat + (z > 5 ? 0.6 : 0), z);
    const hr = clockHourAt(me.lon, me.lat, new Date(sim));
    const day = simH > 6 && hr < 12 ? 2 : 1; // the day turns over at midnight on the clock shown
    chip.textContent = `DAY ${day} · ${clock(hr)}`;
    chip.style.opacity = String(1 - clamp01((t - T.zoom[0]) / 0.4));
    const [dx, dy] = map.project(sfAt[0], sfAt[1]);
    const onScreen = dx > 10 && dx < innerWidth - 150 && dy > 10 && dy < innerHeight - 10;
    dest.style.left = dx + 'px'; dest.style.top = dy + 'px';
    dest.style.opacity = String(onScreen ? clamp01((t - T.zoom[0] - 0.6) / 0.3) : 0);
  }

  // 5. arrival on the windowsill
  if (t >= T.arrive[0] && t <= T.arrive[1]) arrive.seek(chunky((t - T.arrive[0]) * 1.7));

  // 6. end card: the logo pigeon flaps
  if (t >= T.end[0]) {
    const ctx = endBird.getContext('2d')!;
    ctx.clearRect(0, 0, endBird.width, endBird.height);
    drawSprite(ctx, PIGEON_FLAP[Math.floor(t * 8) % 4], PIGEON, 0, Math.round(Math.sin(t * 6) * 4) + 8, 8);
  }
  step(1000 / FPS);
}

(window as any).__frame = frame;
(window as any).__events = events;
(window as any).__info = { FPS, LENGTH, frames: Math.round(LENGTH * FPS) };
// Loading waits on timers too, so keep the fake clock ticking (setInterval isn't faked) until it's done.
const pump = setInterval(() => step(16), 16);
setup().then(() => { clearInterval(pump); frame(0); (window as any).__ready = true; });
