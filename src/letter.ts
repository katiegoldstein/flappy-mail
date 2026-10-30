// The recipient's letter page (/l/<letter_token>): arrival scene, then a rolled letter tied with a ribbon.
// Tapping the ribbon unties it and the letter unfurls, words already on it.
import './style.css';
import './letter.css';
import { h, fmt, soundButton, tapForSoundHint, credits } from './ui';
import { Scene } from './cutscene';
import { initAudio, sfx } from './audio';
import { spriteEl, drawSprite, gridSize, CLOUD_SMALL, CLOUD_PAL, PIGEON, PIGEON_STAND, BOTTLE_SIDE, BOTTLE_PAL, BOW, BOW_PAL, Grid } from './sprites';
import { solarHour, skyFor } from './sky';

type Letter = {
  carrier: 'pigeon' | 'bottle'; carrierName: string; body: string; from: string; to: string;
  fromCity: { name: string; cc: string }; toCity: { name: string; cc: string; lon: number };
  miles: number; tripHours: number; arrivedAt: number;
};

const token = location.pathname.match(/^\/l\/([\w-]{20,})$/)?.[1] ?? new URLSearchParams(location.search).get('l');
const app = document.getElementById('app')!;
const phone = matchMedia('(max-width: 720px)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
initAudio({ music: true });

function tripLabel(hours: number) {
  const days = hours / 24;
  if (days >= 60) return `${Math.round(days / 30)} MONTHS`;
  const d = Math.floor(days), hh = Math.round(hours - d * 24);
  return d ? `${d} DAY${d === 1 ? '' : 'S'}, ${hh} HR${hh === 1 ? '' : 'S'}` : `${Math.max(1, hh)} HR${hh === 1 ? '' : 'S'}`;
}

function notFound() {
  document.title = 'Letter not found · Flappy Mail';
  app.append(h('div', { class: 'letter-page' }, h('main', { class: 'l-main' },
    h('div', { class: 'l-meta pixel' }, 'HMM. NO LETTER HERE.'),
    h('p', { class: 'l-about' }, "We couldn't find that letter. Check that the link from your email was copied in full."),
    h('a', { class: 'game-btn l-reply', href: '/' }, 'SEE THE BIRDS ▶'))));
}

// The pigeon perched on top of the letter: it breathes (CSS) and blinks now and then.
function perchedPigeon(scale: number) {
  const { w, h: ht } = gridSize(PIGEON_STAND);
  const c = document.createElement('canvas');
  c.width = w; c.height = ht;
  c.style.width = w * scale + 'px'; c.style.height = ht * scale + 'px';
  c.className = 'px l-perch';
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d')!;
  const blink: Grid = PIGEON_STAND.map(r => r.replace('e', 'B'));
  const draw = (g: Grid) => { ctx.clearRect(0, 0, w, ht); drawSprite(ctx, g, PIGEON, 0, 0, 1); };
  draw(PIGEON_STAND);
  if (!reduce) setInterval(() => { draw(blink); setTimeout(() => draw(PIGEON_STAND), 160); }, 3800);
  return c;
}

async function load(): Promise<Letter | null> {
  if (!token) return null;
  try {
    const r = await fetch('/api/letter/' + encodeURIComponent(token));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

(async () => {
  const L = await load();
  if (!L) return notFound();
  const bottle = L.carrier === 'bottle';
  document.title = `A letter from ${L.from} · Flappy Mail`;

  const sceneHost = h('div', { class: 'l-scene-canvas' });
  const cloud = spriteEl(CLOUD_SMALL, CLOUD_PAL, 5); cloud.classList.add('l-cloud');
  const scene = h('div', { class: 'l-scene' }, sceneHost, cloud,
    h('h1', { class: 'pixel l-title' }, bottle ? 'A BOTTLE JUST' : 'A PIGEON JUST', h('br'), bottle ? 'WASHED UP!' : 'LANDED!'));
  // The letter is plain text: it's set with textContent, never parsed as HTML, and links aren't made clickable.
  const text = h('div', { class: 'l-text' });
  text.textContent = L.body;
  const article = h('article', { class: 'l-letter', 'aria-label': `Letter from ${L.from}`, hidden: true }, text);
  const bow = spriteEl(BOW, BOW_PAL, phone ? 5 : 6); bow.classList.add('l-bow');
  const ribbon = h('button', { type: 'button', class: 'l-roll', 'aria-label': 'Untie the ribbon and open the letter' }, h('span', { class: 'l-band' }), bow);
  const untieHint = h('p', { class: 'l-untie pixel', 'aria-hidden': 'true' }, 'TAP THE RIBBON TO UNTIE');
  const rider = bottle ? spriteEl(BOTTLE_SIDE, BOTTLE_PAL, phone ? 4 : 5) : perchedPigeon(phone ? 4 : 5);
  rider.classList.add(bottle ? 'l-perch-bottle' : 'l-perch');
  const soundBtn = soundButton('chip-btn l-sound');
  const paper = h('div', { class: 'l-paper' }, rider, ribbon, article);
  const main = h('main', { class: 'l-main' },
    h('div', { class: 'l-meta pixel' }, `FROM ${L.from.toUpperCase()} · BY ${L.carrierName.toUpperCase()}`, h('br'),
      `${L.fromCity.name.toUpperCase()} → ${L.toCity.name.toUpperCase()}`, h('br'), `${tripLabel(L.tripHours)} · ${fmt(L.miles)} MILES`),
    paper,
    h('div', { class: 'l-row' }, untieHint, soundBtn),
    h('a', { class: 'game-btn l-reply', href: '/send?reply=' + encodeURIComponent(token!) }, bottle ? 'SEND A BOTTLE BACK ▶' : 'SEND A BIRD BACK ▶'),
    h('p', { class: 'l-about' }, 'Flappy Mail sends letters by 8-bit carrier pigeon. ', h('a', { href: '/' }, 'See every bird in the air.')),
    credits());
  app.append(h('div', { class: 'letter-page' }, scene, main));

  // The sky matches the time of day where the letter landed.
  const s = new Scene(sceneHost, { kind: 'arrival', carrier: L.carrier, sky: skyFor(solarHour(L.toCity.lon, new Date())), unit: phone ? 5 : 6 });
  if (reduce) s.seek(10); else s.play();
  setTimeout(() => sfx('arrive'), reduce ? 0 : 3000);

  // Untie: the bow slips off, the band falls away, then the letter unfurls.
  let opened = false;
  ribbon.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    sfx('untie');
    paper.classList.add('untying');
    untieHint.style.visibility = 'hidden';
    setTimeout(() => {
      ribbon.remove();
      article.hidden = false;
      article.classList.add('open');
      article.setAttribute('tabindex', '-1');
      article.focus({ preventScroll: true });
    }, reduce ? 0 : 650);
  });
  tapForSoundHint(soundBtn);
})();
