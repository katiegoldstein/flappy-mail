// Home: the live map. Also the sender's tracking view (/?t=<token>).
import './style.css';
import './home.css';
import { MapView, Bird, Theme, REGION_Z, CLOSE_Z } from './map/mapview';
import { h, prefs, params, demo, logo, fmt, soundButton, tapForSoundHint, credits } from './ui';
import { LonLat, routeLengths, pointAlong } from '../shared/geo';
import { Plan, Segment, positionAt } from '../shared/travel';
import type { LossReason } from './cutscene';
import { spriteEl, PIGEON, PIGEON_FLY_UP, PIGEON_REST, CLOUD_SMALL, CLOUD_PAL, BOTTLE, BOTTLE_PAL } from './sprites';
import { clock, clockHourAt, durationLabel, skyFor } from './sky';
import { playCutscene } from './cutscene';
import { initAudio, sfx } from './audio';

const isPhone = () => matchMedia('(max-width: 720px)').matches;

// ---------- data ----------
// Only real birds: every bird on the map is a real letter in transit, from GET /api/flights.
// Positions are computed here from each stored plan with the same function the server uses.
type Flight = {
  id: string; name: string; kind: 'pigeon' | 'bottle'; from: string; to: string;
  route: LonLat[]; plan: Segment[]; departedAt: number; arrivesAt: number;
  mine?: boolean; stoppedAt?: number | null; cum?: number[];
};
type Track = {
  id: string; carrier: 'pigeon' | 'bottle'; name: string; recipientName: string;
  from: { name: string; cc: string }; to: { name: string; cc: string };
  route: LonLat[]; plan: Segment[]; miles: number; departedAt: number; arrivesAt: number;
  status: 'in_transit' | 'delivered' | 'lost'; stoppedAt: number | null; lossText: string | null; lossReason: LossReason | null; log: string | null;
  lossScene: { sea: boolean; hour: number } | null;
};
// Trips that already ended, for the departures board (carrier names and cities only).
type PastTrip = { name: string; kind: 'pigeon' | 'bottle'; from: string; to: string; outcome: 'landed' | 'lost'; endedAt: number };
let recent: PastTrip[] = [];
let flights: Flight[] = [];
let birds: Bird[] = [];
let cap = 1000;
const trackToken = params.get('t');
const mode: 'public' | 'track' = trackToken ? 'track' : 'public';
let track: Track | null = null;
let trackMissing = false;
let mineId: string | null = null;

const planOf = (f: Flight): Plan => ({ carrier: f.kind, route: f.route, miles: (f.cum ??= routeLengths(f.route))[f.cum.length - 1], departedAt: f.departedAt, arrivesAt: f.arrivesAt, segments: f.plan });
const atOf = (f: Flight) => Math.min(Date.now(), f.stoppedAt ?? Infinity);

async function loadData() {
  try {
    const r = await fetch('/api/flights');
    if (r.ok) { const d = await r.json(); flights = d.birds ?? []; recent = d.recent ?? []; cap = d.counts?.cap ?? 1000; }
  } catch { /* keep the last list */ }
  if (trackToken) {
    try {
      const r = await fetch('/api/track/' + encodeURIComponent(trackToken));
      if (r.ok) track = await r.json(); else if (r.status === 404) trackMissing = true;
    } catch { /* offline */ }
  }
  if (track) {
    mineId = track.id;
    flights = flights.filter(f => f.id !== track!.id);
    const stoppedAt = track.status === 'lost' ? track.stoppedAt : track.status === 'delivered' ? track.arrivesAt : null;
    flights.unshift({ id: track.id, name: track.name, kind: track.carrier, from: track.from.name, to: track.to.name, route: track.route, plan: track.plan, departedAt: track.departedAt, arrivesAt: track.arrivesAt, mine: true, stoppedAt });
  }
  refreshBirds();
}

// Recompute every bird's position from its plan (once a second, so birds glide).
function refreshBirds() {
  const now = Date.now();
  birds = flights.filter(f => f.mine || now < f.arrivesAt).map(f => {
    const p = positionAt(planOf(f), atOf(f), f.cum);
    return {
      id: f.id, name: f.name, kind: f.kind, from: f.from, to: f.to,
      lon: p.lonlat[0], lat: p.lonlat[1], plon: 2 * p.lonlat[0] - p.heading[0], plat: 2 * p.lonlat[1] - p.heading[1],
      asleep: p.state === 'sleeping', mine: f.mine, stopped: f.stoppedAt != null && now >= f.stoppedAt,
      route: { pts: f.route, f: p.f },
    };
  });
  map.setBirds(birds);
}

function tripOf(b: Bird) {
  const f = flights.find(x => x.id === b.id)!;
  const plan = planOf(f), at = atOf(f), p = positionAt(plan, at, f.cum);
  return { miles: plan.miles, pct: p.f, flown: plan.miles - p.milesLeft, left: p.milesLeft, departedAt: f.departedAt, landsInH: Math.max(0, (f.arrivesAt - Date.now()) / 3_600_000), arrivesAt: f.arrivesAt };
}

function agoLabel(t: number) {
  const m = (Date.now() - t) / 60000;
  if (m < 2) return 'JUST NOW';
  if (m < 120) return `${Math.round(m)} MIN AGO`;
  if (m < 48 * 60) return `${Math.round(m / 60)} HRS AGO`;
  return `${Math.round(m / 1440)} DAYS AGO`;
}
const fmtWhen = (t: number) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase();

// ---------- page ----------
const app = document.getElementById('app')!;
const mapEl = h('div', { class: 'map' });
if (mode === 'track') mapEl.style.visibility = 'hidden'; // shown once it's centered on the sender's bird, not the whole world first
app.append(mapEl);
const map = new MapView(mapEl);
if (import.meta.env.DEV) (window as unknown as { __map: MapView }).__map = map; // dev-only handle for timing checks

let theme: Theme = (params.get('theme') as Theme) || (prefs.get('theme', 'light') as Theme);
const setTheme = (t: Theme, save = true) => {
  theme = t;
  if (save) prefs.set('theme', t);
  map.setTheme(t);
  document.body.dataset.theme = t;
  themeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
};

// top bar
const search = h('input', { id: 'find', type: 'search', placeholder: 'Find a pigeon by name', autocomplete: 'off', 'aria-controls': 'find-results' }) as HTMLInputElement;
const results = h('ul', { id: 'find-results', class: 'find-results', role: 'listbox', hidden: true });
const coop = h('div', { class: 'coop-chip' });
const themeBtns = (['light', 'dark'] as Theme[]).map(t => {
  const b = h('button', { type: 'button', 'data-t': t, onclick: () => setTheme(t) }, t.toUpperCase());
  return b;
});
const sound = soundButton('hud-btn icon');
const sendTop = h('a', { class: 'hud-btn send send-top', href: '/send' }, 'SEND A LETTER ▶');
const header = h('header', { class: 'topbar' },
  h('a', { class: 'brand', href: '/' }, logo(2), h('span', {}, 'FLAPPY MAIL')),
  h('div', { class: 'find' }, h('label', { for: 'find', class: 'sr-only' }, 'Find a pigeon by name'), search, results),
  h('div', { class: 'spacer' }),
  h('div', { class: 'theme-toggle', role: 'group', 'aria-label': 'Map theme' }, ...themeBtns),
  sound,
  sendTop,
);
app.append(header);

// zoom controls
const levelBars = (['close', 'region', 'world'] as const).map(l => h('i', { 'data-l': l }));
const levelName = h('div', { class: 'level-name' });
const zoomBox = h('div', { class: 'zoom' },
  h('button', { type: 'button', class: 'hud-btn icon', 'aria-label': 'Zoom in', onclick: () => stepZoom(1) }, '+'),
  h('button', { type: 'button', class: 'hud-btn icon', 'aria-label': 'Zoom out', onclick: () => stepZoom(-1) }, '−'),
  h('div', { class: 'levels', 'aria-hidden': 'true' }, ...levelBars),
  levelName,
);
app.append(zoomBox);

function stepZoom(dir: number) {
  const z = map.view.z;
  const stops = [map.minZ, REGION_Z, CLOSE_Z];
  const next = dir > 0 ? stops.find(s => s > z + 0.05) : [...stops].reverse().find(s => s < z - 0.05);
  if (next === undefined) return;
  unfollow();
  map.zoomBy(next - z);
}

// footer
const stats = h('div', { class: 'stats' });
const boardBtn = h('button', { type: 'button', class: 'hud-btn board-btn', 'aria-expanded': 'false', 'aria-controls': 'board', onclick: () => toggleBoard() }, 'DEPARTURES BOARD ▲');
const sendBottom = h('a', { class: 'hud-btn send send-bottom', href: sendTop.getAttribute('href')! }, 'SEND A LETTER ▶');
const footer = h('footer', { class: 'bottombar' }, coop, stats, h('div', { class: 'spacer' }), boardBtn, sendBottom);
app.append(footer);

// floating cards
const hint = h('div', { class: 'hint frame' });
app.append(hint);
const panel = h('aside', { class: 'panel frame sheet', hidden: true });
app.append(panel);
const board = h('section', { id: 'board', class: 'board frame sheet', 'aria-label': 'Departures board', hidden: true });
app.append(board);
swipeSheet(panel);
swipeSheet(board);
const backBtn = h('button', { type: 'button', class: 'hud-btn gold back-btn', hidden: true, onclick: () => follow() }, 'BACK TO MY PIGEON');
app.append(backBtn);

// ---------- rendering of UI ----------
function counts() {
  const inAir = birds.filter(b => !b.stopped);
  const pigeons = inAir.filter(b => b.kind === 'pigeon');
  const asleep = pigeons.filter(b => b.asleep).length;
  return { pigeons: pigeons.length, asleep, flying: pigeons.length - asleep, bottles: inAir.length - pigeons.length, free: Math.max(0, cap - pigeons.length) };
}

let lastHintKey = '';
function renderChrome() {
  const c = counts();
  coop.innerHTML = '';
  coop.append(h('span', { class: 'long' }, `${fmt(c.pigeons)} / ${fmt(cap)} IN THE AIR`), h('span', { class: 'short' }, `${fmt(c.pigeons)}/${fmt(cap)} IN AIR`));
  stats.innerHTML = '';
  for (const [k, short, v] of [['FLYING', 'FLY', c.flying], ['SLEEPING', 'ZZZ', c.asleep], ['AT SEA', 'SEA', c.bottles], ['FREE', 'FREE', c.free]] as const) {
    stats.append(h('div', { class: 'stat' }, h('span', { class: 'long' }, k), h('span', { class: 'short' }, short), ' ', h('b', {}, fmt(v))));
  }
  // Rebuild the card only when its content changes: replacing its buttons every second ate taps.
  const hasMine = birds.some(b => b.id === mineId);
  const hintKey = [trackMissing, c.pigeons, c.bottles, hasMine].join('|');
  if (hintKey === lastHintKey) return;
  lastHintKey = hintKey;
  hint.innerHTML = '';
  if (trackMissing) {
    hint.append(h('div', { class: 'pixel hint-title' }, "WE CAN'T FIND THAT PIGEON"), h('p', {}, 'Check the tracking link in your email. It has to be copied in full.'),
      h('a', { class: 'hud-btn send phone-only', href: sendTop.getAttribute('href')! }, 'SEND A LETTER ▶'));
  } else if (!c.pigeons && !c.bottles) {
    hint.append(h('div', { class: 'pixel hint-title' }, 'QUIET SKIES'), h('p', {}, 'Be the first to send a pigeon.'), h('a', { class: 'hud-btn send', href: sendTop.getAttribute('href')! }, 'SEND A LETTER ▶'));
  } else {
    hint.append(h('div', { class: 'pixel hint-title' }, `${fmt(c.pigeons)} PIGEON${c.pigeons === 1 ? '' : 'S'} IN THE AIR${c.bottles ? ` · ${c.bottles} AT SEA` : ''}`), h('p', {}, 'Zoom in to see them up close. Tap any pigeon to meet it.'),
      h('div', { class: 'hint-btns phone-only' },
        h('a', { class: 'hud-btn send', href: sendTop.getAttribute('href')! }, 'SEND A LETTER ▶'),
        hasMine ? h('button', { type: 'button', class: 'hud-btn gold', onclick: () => follow() }, 'MY PIGEON') : null));
  }
}

function renderLevel() {
  const l = map.level;
  levelBars.forEach(b => b.classList.toggle('on', b.dataset.l === l));
  levelName.textContent = { world: 'WORLD', region: 'REGION', close: 'CLOSE-UP' }[l];
  // On phones this card holds the only send button, so it stays up (shrunk to the button when zoomed in).
  const open = !map.selected && board.hidden;
  hint.hidden = !(trackMissing || birds.length === 0 || (l === 'world' && open) || (isPhone() && open));
  hint.classList.toggle('compact', isPhone() && !trackMissing && birds.length > 0);
  const mine = birds.find(b => b.id === mineId);
  if (mine) {
    const [x, y] = map.project(mine.lon, mine.lat);
    const off = x < map.insets.left || x > map.view.W - map.insets.right || y < map.insets.top || y > map.view.H - map.insets.bottom;
    backBtn.hidden = !(off || l !== 'close') || !panel.hidden && isPhone() && panel.classList.contains('open') || isPhone() && !hint.hidden && hint.classList.contains('compact');
    backBtn.style.bottom = map.insets.bottom + 16 + 'px'; // float just above the footer or bottom sheet
  }
}

const photo = (b: Bird) => {
  const box = h('div', { class: 'photo', 'aria-hidden': 'true' });
  const cl = spriteEl(CLOUD_SMALL, CLOUD_PAL, 4); cl.style.cssText += ';position:absolute;left:20px;top:16px';
  const bird = b.kind === 'bottle' ? spriteEl(BOTTLE, BOTTLE_PAL, 6) : spriteEl(b.asleep || b.stopped ? PIGEON_REST : PIGEON_FLY_UP, PIGEON, 4);
  bird.style.cssText += ';position:absolute;left:130px;top:' + (b.kind === 'bottle' ? 26 : 18) + 'px';
  box.append(cl, bird, h('div', { class: b.kind === 'bottle' ? 'photo-sea' : 'photo-grass' }));
  if (b.asleep) box.classList.add('night');
  return box;
};

const statusOf = (b: Bird) => b.stopped ? 'LANDED' : b.kind === 'bottle' ? 'DRIFTING' : b.asleep ? 'SLEEPING' : 'FLYING';

// Phones: a swipe up anywhere on a peeking sheet opens it, so its content can scroll;
// a swipe down while scrolled to the top lowers it again.
function swipeSheet(sheet: HTMLElement) {
  let y0 = 0, top0 = 0;
  sheet.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; top0 = sheet.scrollTop; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!isPhone()) return;
    const dy = e.touches[0].clientY - y0;
    if (!sheet.classList.contains('open') && dy < -16) { sheet.classList.add('open'); layout(); }
    else if (sheet.classList.contains('open') && top0 <= 0 && sheet.scrollTop <= 0 && dy > 60 && sheet !== board) { sheet.classList.remove('open'); layout(); }
  }, { passive: true });
}

function sheetHandle(label: string) {
  const handle = h('button', { type: 'button', class: 'sheet-handle', 'aria-label': label }, h('i'));
  let y0 = 0, dragging = false;
  handle.addEventListener('pointerdown', e => { y0 = e.clientY; dragging = true; try { handle.setPointerCapture(e.pointerId); } catch { /* fine without */ } });
  handle.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - y0;
    const sheet = handle.closest('.sheet') as HTMLElement;
    if (dy < -24) sheet.classList.add('open');
    else if (dy > 24) { if (sheet.classList.contains('open')) sheet.classList.remove('open'); else if (sheet === board) toggleBoard(false); else select(null); }
    else sheet.classList.toggle('open');
    layout();
  });
  return handle;
}

function renderPanel() {
  const b = birds.find(x => x.id === map.selected);
  panel.innerHTML = '';
  panel.className = 'panel frame sheet' + (panel.classList.contains('open') ? ' open' : '');
  if (!b) { panel.hidden = true; return; }
  panel.hidden = false;
  const t = tripOf(b);
  const lt = clock(clockHourAt(b.lon, b.lat, new Date()));
  if (b.mine) return renderMine(b, t, lt);
  panel.setAttribute('aria-label', 'Selected pigeon');
  panel.append(
    sheetHandle('Show more about this pigeon'),
    h('div', { class: 'panel-head' },
      h('div', {}, h('div', { class: 'pixel name' }, b.name.toUpperCase()), h('div', { class: 'pixel pid' }, (b.kind === 'bottle' ? 'BOTTLE ' : 'PIGEON ') + b.id)),
      h('button', { type: 'button', class: 'hud-btn icon close', 'aria-label': 'Close', onclick: () => select(null) }, 'X')),
    photo(b),
    h('div', { class: 'panel-body' },
      h('div', { class: 'pixel route-cities' }, `${b.from.toUpperCase()} → ${b.to.toUpperCase()}`),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(t.pct * 100)} percent of the way` }, h('i', { style: `width:${Math.round(t.pct * 100)}%` })),
      h('div', { class: 'miles' }, h('span', {}, `${fmt(t.flown)} mi ${b.kind === 'bottle' ? 'drifted' : 'flown'}`), h('span', {}, `${fmt(t.left)} mi to go`)),
      h('div', { class: 'grid2' }, ...[
        ['SPEED', b.kind === 'bottle' ? '2 MPH' : b.asleep ? '0 MPH' : '50 MPH'],
        [b.kind === 'bottle' ? 'DEPTH' : 'ALTITUDE', b.kind === 'bottle' ? 'SEA LEVEL' : b.asleep ? 'PERCHED' : '900 FT'],
        ['STATUS', statusOf(b)], ['LOCAL TIME', lt],
        ['DEPARTED', agoLabel(t.departedAt)], ['LANDS IN', durationLabel(t.landsInH)],
      ].map(([k, v]) => h('div', { class: 'stat-box' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)))),
      h('button', { type: 'button', class: 'hud-btn gold follow', 'aria-pressed': 'false', onclick: () => (following ? unfollow() : follow(b.id)) }, `FOLLOW ${b.name.toUpperCase()}`),
      h('p', { class: 'note' }, 'Only countries are shown. Letters and people stay private.'),
    ),
  );
}

function renderMine(b: Bird, t: ReturnType<typeof tripOf>, lt: string) {
  const T = track!;
  const state = T.status === 'lost' ? 'lost' : T.status === 'delivered' ? 'delivered' : b.asleep ? 'sleeping' : 'flying';
  const bottle = T.carrier === 'bottle';
  panel.setAttribute('aria-label', bottle ? 'Your bottle' : 'Your pigeon');
  panel.classList.add('mine');
  const N = b.name, NU = N.toUpperCase(), who = T.recipientName, where = T.to.name;
  const head = h('div', { class: 'mine-head' + (state === 'lost' ? ' lost' : '') },
    h('div', { class: 'pixel small' }, state === 'lost' ? 'LOST IN THE MAIL' : state === 'delivered' ? 'DELIVERED!' : bottle ? 'YOUR BOTTLE' : 'YOUR PIGEON'),
    h('div', { class: 'pixel name' }, NU));
  const body = h('div', { class: 'panel-body' });
  panel.append(sheetHandle(bottle ? 'Show more about your bottle' : 'Show more about your pigeon'), head, body);
  if (state === 'lost') {
    body.append(
      h('p', { class: 'lead' }, `Uh oh. ${N} ${T.lossText}, and your letter to ${who} didn't make it.`),
      h('p', { class: 'note' }, `${who} was never told a letter was coming. You can send it again with a fresh ${bottle ? 'bottle' : 'pigeon'}. It's a brand-new trip.`),
      h('a', { class: 'hud-btn send big', href: '/send?resend=' + encodeURIComponent(trackToken!) }, 'SEND ANOTHER BIRD ▶'),
    );
    return;
  }
  if (state === 'delivered') {
    const days = (T.arrivesAt - T.departedAt) / 86_400_000;
    body.append(
      h('p', { class: 'lead' }, bottle ? `${N} washed up on the beach in ${where}. ${who} has your letter.` : `${N} landed on ${who}'s windowsill in ${where}. Your letter is in their hands.`),
      h('div', { class: 'bar thick', role: 'img', 'aria-label': '100 percent of the way' }, h('i', { style: 'width:100%' })),
      h('div', { class: 'grid2' }, ...[['TRIP', days >= 1 ? `${Math.floor(days)}D ${Math.round((days % 1) * 24)}H` : durationLabel(days * 24)], ['MILES', fmt(t.miles)], ['LANDED', fmtWhen(T.arrivesAt)], ['STATUS', 'DELIVERED']]
        .map(([k, v]) => h('div', { class: 'stat-box big' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)))),
      h('a', { class: 'hud-btn send big', href: '/send' }, 'SEND ANOTHER LETTER ▶'),
    );
    return;
  }
  body.append(
    h('p', { class: 'lead' }, `Carrying your letter to ${who} in ${where}.`),
    h('div', { class: 'bar thick', role: 'img', 'aria-label': `${Math.round(t.pct * 100)} percent of the way` }, h('i', { style: `width:${Math.round(t.pct * 100)}%` })),
    h('div', { class: 'grid2' }, ...[['MILES LEFT', fmt(t.left)], ['LANDS IN', durationLabel(t.landsInH)], ['LOCAL TIME', lt], ['STATUS', bottle ? 'DRIFTING' : state.toUpperCase()]]
      .map(([k, v]) => h('div', { class: 'stat-box big' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)))),
    ...(T.log ? [h('div', { class: 'log' }, h('span', { class: 'pixel' }, `${NU}'S LOG ▸`), h('br'), T.log)] : []),
    h('p', { class: 'note' }, `Only you see this panel. Everyone else sees ${N} as a ${bottle ? 'bottle drifting' : 'pigeon flying'} ${b.from} → ${b.to}.`),
  );
}

function renderBoard() {
  board.innerHTML = '';
  const rows = birds.filter(b => !b.stopped).sort((a, b) => tripOf(b).departedAt - tripOf(a).departedAt).slice(0, 40);
  const open = (b: Bird) => { toggleBoard(false); select(b.id, true); };
  const live = rows.map(b => h('tr', { tabindex: '0', onclick: () => open(b), onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') open(b); } },
    h('td', { class: 'nm' }, b.name), h('td', {}, `${b.from} → ${b.to}`), h('td', { class: 'st ' + statusOf(b).toLowerCase() }, statusOf(b)), h('td', {}, durationLabel(tripOf(b).landsInH))));
  const past = recent.map(p => {
    const st = p.outcome === 'lost' ? 'LOST' : p.kind === 'bottle' ? 'WASHED UP' : 'LANDED';
    return h('tr', { class: 'past' }, h('td', { class: 'nm' }, p.name), h('td', {}, `${p.from} → ${p.to}`), h('td', { class: 'st ' + p.outcome }, st), h('td', {}, agoLabel(p.endedAt)));
  });
  const divider = (label: string) => h('tr', { class: 'divider' }, h('td', { class: 'pixel', colspan: '4' }, label));
  board.append(
    sheetHandle('Expand departures board'),
    h('div', { class: 'board-head' }, h('h2', { class: 'pixel' }, 'DEPARTURES'), h('button', { type: 'button', class: 'hud-btn icon', 'aria-label': 'Close departures board', onclick: () => toggleBoard(false) }, 'X')),
    live.length || past.length
      ? h('div', { class: 'board-scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ...['PIGEON', 'ROUTE', 'STATUS', 'WHEN'].map(t => h('th', { class: 'pixel' }, t)))),
        h('tbody', {},
          ...(live.length ? live : [h('tr', { class: 'empty' }, h('td', { colspan: '4' }, 'No pigeons in the air right now.'))]),
          ...(past.length ? [divider('EARLIER'), ...past] : []))))
      : h('p', { class: 'note' }, 'No pigeons have flown yet.'),
    h('div', { class: 'board-foot' }, credits()),
  );
}

function toggleBoard(open = board.hidden) {
  board.hidden = !open;
  board.classList.toggle('open', open);
  boardBtn.setAttribute('aria-expanded', String(open));
  boardBtn.textContent = open ? 'DEPARTURES BOARD ▼' : 'DEPARTURES BOARD ▲';
  if (open) renderBoard();
  layout();
}

// ---------- selection + follow ----------
let following = false;
function select(id: string | null, fly = false) {
  map.select(id);
  panel.classList.remove('open');
  renderPanel();
  layout();
  const b = birds.find(x => x.id === id);
  if (b && fly) map.centerOn(b.lon, b.lat, Math.max(map.view.z, REGION_Z));
}

function follow(id = mineId ?? map.selected) {
  const b = birds.find(x => x.id === id);
  if (!b) return;
  if (map.selected !== b.id) select(b.id);
  following = true;
  const [lon, lat] = followPoint(b);
  map.centerOn(lon, lat, CLOSE_Z);
  paintFollow();
  // On phones the bottom sheet may still be sliding up; center again once it has settled.
  setTimeout(() => { if (!following || map.selected !== b.id) return; layout(); const [x, y] = followPoint(b); map.centerOn(x, y, map.view.z); }, 260);
}

// Where the map centers while following: the bird plus a little of the route ahead, like the mockup's close-up
// (a point ~60 miles further along; on phones, the bird itself). The same point every second, so the map never jumps.
function followPoint(b: Bird): LonLat {
  const f = flights.find(x => x.id === b.id);
  if (!f || !b.route || isPhone()) return [b.lon, b.lat];
  const cum = (f.cum ??= routeLengths(f.route)), total = cum[cum.length - 1];
  return pointAlong(f.route, cum, Math.min(total, b.route.f * total + 60));
}

// Following keeps the map centered on the bird; pressing the button again, or dragging the map, stops it.
function unfollow() {
  if (!following) return;
  following = false;
  paintFollow();
}

function paintFollow() {
  const fb = panel.querySelector('.follow');
  const b = birds.find(x => x.id === map.selected);
  if (!fb || !b) return;
  fb.setAttribute('aria-pressed', String(following));
  fb.textContent = following ? `UNFOLLOW ${b.name.toUpperCase()}` : `FOLLOW ${b.name.toUpperCase()}`;
}

// search
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  results.innerHTML = '';
  const hits = q ? birds.filter(b => b.name.toLowerCase().includes(q)).slice(0, 6) : [];
  results.hidden = !q;
  if (q && !hits.length) results.append(h('li', { class: 'empty' }, 'No pigeon by that name in the air.'));
  hits.forEach(b => results.append(h('li', { role: 'option', tabindex: '0', onclick: () => pick(b), onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') pick(b); } }, h('b', {}, b.name), ` ${b.from} → ${b.to}`)));
});
search.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = results.querySelector('li[role=option]') as HTMLElement | null; first?.click(); } if (e.key === 'Escape') { results.hidden = true; } });
function pick(b: Bird) { results.hidden = true; search.value = b.name; select(b.id, true); }

map.onSelect = b => { following = false; if (b) sfx('flap'); select(b ? b.id : null); };
map.onUserMove = () => unfollow();
map.onViewChange = () => { renderLevel(); };

// ---------- layout: tell the map which parts of the screen are covered ----------
function layout() {
  const phone = isPhone();
  const hb = header.getBoundingClientRect(), fb = footer.getBoundingClientRect();
  let bottom = innerHeight - fb.top, left = 0;
  if (!panel.hidden) {
    if (phone) bottom = Math.max(bottom, innerHeight - panel.getBoundingClientRect().top);
    else left = panel.getBoundingClientRect().right;
  }
  if (!board.hidden) bottom = Math.max(bottom, innerHeight - board.getBoundingClientRect().top);
  map.insets = { top: hb.bottom, bottom, left, right: phone ? 60 : 76 };
  document.body.classList.toggle('panel-open', !panel.hidden);
  renderLevel();
}
addEventListener('resize', () => layout());

// ---------- boot ----------
(async () => {
  setTheme(theme, false);
  await loadData();
  renderChrome();
  layout();
  const mine = birds.find(b => b.id === mineId);
  if (mode === 'track' && mine) {
    select(mine.id);
    if (!isPhone()) panel.classList.add('open');
    layout();
    follow(mine.id);
    // A lost letter: play the loss scene once, the first time the sender comes back.
    const seenKey = 'seen-loss-' + mine.id;
    const T = track as Track | null;
    if (T?.status === 'lost' && prefs.get(seenKey, '') !== '1') {
      prefs.set(seenKey, '1');
      const t = tripOf(mine);
      const ls = T.lossScene;
      playCutscene({ kind: 'loss', carrier: mine.kind, sky: ls ? skyFor(ls.hour) : 'day', terrain: ls?.sea ? 'ocean' : (mine.id.charCodeAt(4) % 2 ? 'fields' : 'mountains'), name: mine.name, reason: T.lossReason ?? undefined, milesLeft: t.left, pct: Math.round(t.pct * 100), day: Math.max(1, Math.ceil((Date.now() - t.departedAt) / 86_400_000)), clock: clock(clockHourAt(mine.lon, mine.lat, new Date())) });
    }
  } else {
    map.setView(10, 18, 0);
    if (demo === 'board') toggleBoard(true);
  }
  mapEl.style.visibility = '';
  initAudio({ music: true });
  tapForSoundHint(sound);
  // Glide every second; fetch fresh flights (and the sender's log) every minute.
  setInterval(() => {
    refreshBirds();
    renderChrome();
    const sel = birds.find(b => b.id === map.selected);
    if (sel && following) { const [lon, lat] = followPoint(sel); map.centerOn(lon, lat, map.view.z); }
  }, 1000);
  setInterval(async () => {
    await loadData();
    renderChrome();
    if (map.selected) { const open = panel.classList.contains('open'); renderPanel(); if (open) panel.classList.add('open'); paintFollow(); }
  }, 60000);
})();
