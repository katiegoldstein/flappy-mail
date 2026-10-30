// Small shared helpers: element builder, remembered prefs, the logo, the sound toggle.
import { PIGEON, PIGEON_FLY_UP, spriteEl } from './sprites';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Attrs = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// localStorage can throw (private windows, blocked storage); prefs are a convenience only.
export const prefs = {
  get(key: string, fallback: string): string {
    try { return localStorage.getItem('fm.' + key) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem('fm.' + key, value); } catch { /* ignore */ }
  },
};

export const params = new URLSearchParams(location.search);
export const demo = params.get('demo');

export function logo(scale = 2) {
  return spriteEl(PIGEON_FLY_UP, PIGEON, scale, 'Flappy Mail');
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Sound: off by default (phones only allow it after a tap anyway), remembered. While it's off we show a "tap for sound" hint.
const soundListeners: ((on: boolean) => void)[] = [];
export function soundOn() { return prefs.get('sound', 'off') === 'on'; }
export function setSound(on: boolean) { prefs.set('sound', on ? 'on' : 'off'); soundListeners.forEach(f => f(on)); }
export function onSound(f: (on: boolean) => void) { soundListeners.push(f); }

export function soundButton(cls: string, variant: 'icon' | 'text' = 'icon'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls }) as HTMLButtonElement;
  const paint = (on: boolean) => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    b.textContent = variant === 'text' ? (on ? 'SOUND: ON' : 'SOUND: OFF') : on ? '♪' : '×';
  };
  paint(soundOn());
  onSound(paint);
  b.addEventListener('click', () => setSound(!soundOn()));
  return b;
}

let hinted = false;
export function tapForSoundHint(anchor: HTMLElement) {
  if (hinted || soundOn()) return;
  hinted = true;
  const hint = h('div', { class: 'sound-hint', 'aria-hidden': 'true' }, 'TAP FOR SOUND');
  document.body.append(hint);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    hint.style.left = Math.max(8, Math.min(innerWidth - hint.offsetWidth - 8, r.left + r.width / 2 - hint.offsetWidth / 2)) + scrollX + 'px';
    hint.style.top = r.bottom + 8 + scrollY + 'px';
  };
  requestAnimationFrame(place);
  addEventListener('resize', place);
  // Tapping the hint turns sound on; it goes away once sound is on, or when the visitor taps anything else.
  hint.addEventListener('click', () => setSound(true));
  const done = () => { hint.remove(); removeEventListener('pointerdown', away); removeEventListener('resize', place); };
  const away = (e: Event) => { if (!hint.contains(e.target as Node) && !anchor.contains(e.target as Node)) done(); };
  addEventListener('pointerdown', away);
  onSound(on => { if (on) done(); });
}

export function demoFlag() {
  if (demo) document.body.append(h('div', { class: 'demo-flag' }, 'PREVIEW · SAMPLE DATA'));
}

// Data credits (GeoNames is CC BY 4.0 and asks for attribution).
export const credits = () => h('p', { class: 'credits' }, 'Map: ', h('a', { href: 'https://www.naturalearthdata.com/', rel: 'noopener' }, 'Natural Earth'),
  '. Cities: ', h('a', { href: 'https://www.geonames.org/', rel: 'noopener' }, 'GeoNames'), ' (', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', rel: 'noopener' }, 'CC BY 4.0'), ').');
