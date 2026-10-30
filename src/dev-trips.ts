// Dev-only trip planner (/dev/trips.html, not part of the production build).
// Pick two real cities and see exactly what the travel engine would store: the pigeon's
// fly/sleep plan, the bottle's sea route, and where the carrier would be at any moment.
import './style.css';
import './home.css';
import { MapView } from './map/mapview';
import { h, fmt } from './ui';
import { loadCities, searchCities, findCity } from './city-search';
import { City, cityLabel, countryLabel, lonlat } from '../shared/cities';
import { pigeonPlan, bottlePlan, positionAt, rollLoss, LOSS_TEXT, Plan } from '../shared/travel';
import { solarHour } from '../shared/sun';
import { clock, durationLabel } from './sky';

const app = document.getElementById('app')!;
const mapEl = h('div', { class: 'map' });
app.append(mapEl);
const map = new MapView(mapEl);
map.setView(-40, 30, 0);
map.insets = { top: 0, bottom: 0, left: 412, right: 0 };

const style = document.createElement('style');
style.textContent = `
.dev { position:absolute; left:16px; top:16px; bottom:16px; width:380px; max-width:calc(100% - 32px); overflow-y:auto; z-index:20; padding:14px; display:flex; flex-direction:column; gap:12px; }
.dev h1 { margin:0; font-family:var(--f-pixel); font-size:12px; color:var(--mustard); font-weight:normal; line-height:1.6 }
.dev label { font-family:var(--f-pixel); font-size:8px; color:var(--amber); display:block; margin-bottom:4px }
.dev input { width:100%; min-height:40px; font-family:var(--f-body); font-size:22px; padding:4px 10px; background:var(--plum); color:var(--cream); border:3px solid var(--mustard); border-radius:0 }
.dev .field { position:relative }
.dev ul { list-style:none; margin:2px 0 0; padding:0; position:absolute; left:0; right:0; z-index:5; background:var(--panel); border:3px solid var(--mustard) }
.dev li { padding:6px 10px; font-size:20px; cursor:pointer } .dev li:hover { background:var(--plum) }
.dev li small { font-family:var(--f-pixel); font-size:7px; color:var(--amber) }
.dev .card[hidden] { display:none }
.dev .card { background:var(--plum); border:2px solid var(--brick); padding:10px; font-size:20px; line-height:1.25 }
.dev .card b { font-family:var(--f-pixel); font-size:9px; color:var(--mustard); font-weight:normal }
.dev .timeline { display:flex; height:18px; border:2px solid var(--mustard); margin:8px 0 4px }
.dev .timeline i { display:block; height:100% } .dev .timeline .flying { background:#E4574A } .dev .timeline .sleeping { background:#3D1530 } .dev .timeline .drifting { background:#5EC7C2 }
.dev input[type=range] { padding:0; min-height:28px; accent-color:#FFD46B; background:none; border:0 }
.dev .muted { color:var(--muted); font-size:18px }
.dev button { align-self:flex-start }
`;
document.head.append(style);

const fromIn = h('input', { id: 'from', value: 'San Francisco, US', autocomplete: 'off' }) as HTMLInputElement;
const toIn = h('input', { id: 'to', value: 'New York City, US', autocomplete: 'off' }) as HTMLInputElement;
const whenIn = h('input', { id: 'when', type: 'datetime-local' }) as HTMLInputElement;
const scrub = h('input', { type: 'range', min: '0', max: '1000', value: '300', 'aria-label': 'Moment in the trip' }) as HTMLInputElement;
const pigeonCard = h('div', { class: 'card' });
const bottleCard = h('div', { class: 'card' });
const nowCard = h('div', { class: 'card' });
const lossOut = h('div', { class: 'muted' });
const d = new Date(); d.setSeconds(0, 0);
whenIn.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const field = (label: string, input: HTMLInputElement) => {
  const list = h('ul', { hidden: true });
  input.addEventListener('input', async () => {
    const all = await loadCities();
    list.innerHTML = '';
    const hits = searchCities(all, input.value);
    hits.forEach(c => list.append(h('li', { onmousedown: (e: Event) => { e.preventDefault(); input.value = cityLabel(c); list.hidden = true; run(); } },
      cityLabel(c), ' ', h('small', {}, `${c.admin1} · ${fmt(c.pop)}${c.coastal ? ' · COASTAL' : ''}`))));
    list.hidden = !hits.length;
  });
  input.addEventListener('blur', () => { list.hidden = true; });
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, list);
};

app.append(h('aside', { class: 'dev frame' },
  h('h1', {}, 'TRIP PLANNER', h('br'), h('span', { style: 'font-size:8px;color:#B9A6C8' }, 'DEV ONLY · NOT A REAL LETTER')),
  field('FROM', fromIn), field('TO', toIn),
  h('div', {}, h('label', { for: 'when' }, 'DEPARTS (YOUR TIME)'), whenIn),
  pigeonCard, bottleCard,
  h('div', {}, h('label', {}, 'SCRUB THROUGH THE PIGEON TRIP'), scrub), nowCard,
  h('button', { type: 'button', class: 'hud-btn', onclick: () => roll() }, 'ROLL THE 16%'), lossOut));

let pigeon: Plan | null = null, bottle: Plan | null = null, A: City | undefined, B: City | undefined;

const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function run() {
  const all = await loadCities();
  A = findCity(all, fromIn.value); B = findCity(all, toIn.value);
  if (!A || !B) { pigeonCard.textContent = 'Pick two cities.'; return; }
  const t0 = new Date(whenIn.value).getTime() || Date.now();
  pigeon = pigeonPlan(lonlat(A), lonlat(B), t0);
  const s = performance.now();
  bottle = A.coastal && B.coastal ? bottlePlan(lonlat(A), lonlat(B), t0) : null;
  const ms = performance.now() - s;
  const dur = pigeon.arrivesAt - t0;
  pigeonCard.innerHTML = '';
  pigeonCard.append(h('b', {}, 'BY PIGEON'), h('br'),
    `${fmt(pigeon.miles)} miles · ${durationLabel(dur / 3_600_000, 'words')}`, h('br'),
    h('span', { class: 'muted' }, `Lands ${fmtDate(pigeon.arrivesAt)} · ${pigeon.segments.filter(x => x.state === 'sleeping').length} nights asleep`),
    h('div', { class: 'timeline', title: 'red: flying, plum: asleep' }, ...pigeon.segments.map(x => h('i', { class: x.state, style: `width:${((x.t1 - x.t0) / dur) * 100}%` }))));
  // The bottle is an easter egg: never mentioned unless both cities share a coastline.
  bottleCard.innerHTML = '';
  bottleCard.hidden = !bottle;
  if (bottle) bottleCard.append(h('b', {}, 'BY BOTTLE (EASTER EGG)'), h('br'),
    `Washes in! ${fmt(bottle.miles)} sea miles · about ${Math.round((bottle.arrivesAt - t0) / 86_400_000)} days`, h('br'),
    h('span', { class: 'muted' }, `Route: ${bottle.route.length} legs, found in ${ms.toFixed(1)} ms`));
  const pts = [...pigeon.route, ...(bottle?.route ?? [])];
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const span = Math.max(Math.max(...lons) - Math.min(...lons), (Math.max(...lats) - Math.min(...lats)) * 1.6, 2);
  map.centerOn((Math.max(...lons) + Math.min(...lons)) / 2, (Math.max(...lats) + Math.min(...lats)) / 2, Math.log2((360 / span) * (map.view.W - 420) / 256 * 0.8));
  scrubTo();
}

function scrubTo() {
  if (!pigeon || !A) return;
  const t = pigeon.departedAt + ((pigeon.arrivesAt - pigeon.departedAt) * +scrub.value) / 1000;
  const p = positionAt(pigeon, t);
  map.previews = [{ pts: pigeon.route, f: p.f }, ...(bottle ? [{ pts: bottle.route, f: positionAt(bottle, t).f }] : [])];
  const [lon, lat] = p.lonlat;
  nowCard.innerHTML = '';
  nowCard.append(h('b', {}, p.state.toUpperCase()), h('br'),
    `${fmtDate(t)} (yours) · ${clock(solarHour(lon, t))} where the pigeon is`, h('br'),
    h('span', { class: 'muted' }, `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'} · ${fmt(p.milesLeft)} mi to go · ${countryLabel(A.cc)} → ${countryLabel(B!.cc)}`));
}

function roll() {
  if (!pigeon) return;
  const r = rollLoss(pigeon);
  lossOut.textContent = r.lost
    ? `Lost! The pigeon ${LOSS_TEXT[r.reason!]} on ${fmtDate(r.lostAt!)}, ${Math.round(((r.lostAt! - pigeon.departedAt) / (pigeon.arrivesAt - pigeon.departedAt)) * 100)}% of the way. (Only the server rolls this for real.)`
    : 'Made it. (84% of rolls do.)';
}

scrub.addEventListener('input', scrubTo);
whenIn.addEventListener('change', run);
run();
