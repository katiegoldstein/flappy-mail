// Compose: write the letter, address it, meet your pigeon, send.
import './style.css';
import './compose.css';
import { h, prefs, params, fmt, soundButton, tapForSoundHint, credits } from './ui';
import { spriteEl, animatedSpriteEl, PIGEON, PIGEON_FLAP, PIGEON_FLY_UP, BOTTLE, BOTTLE_PAL, CLOUD, CLOUD_PAL, BUSH, BUSH_PAL } from './sprites';
import { skyFor, clock } from './sky';
import { playCutscene } from './cutscene';
import { initAudio, sfx } from './audio';
import { prepareHumanCheck, humanToken } from './turnstile';

const MAX = 1000;
type CityRef = { id: number; label: string };
type Estimate = { pigeon: { miles: number; text: string }; bottle?: { miles: number; text: string }; originHour: number };

async function api<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; message?: string; field?: string } }> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: 'network', message: 'The coop is unreachable. Check your connection and try again.' }));
  return { ok: r.ok, status: r.status, data };
}

// ---------- build the page ----------
const app = document.getElementById('app')!;
const clouds = [
  ['left:6%;top:120px', 6], ['right:8%;top:70px', 6], ['left:34%;top:18px', 4], ['right:30%;top:140px', 4], ['left:2%;top:420px', 6], ['right:3%;top:560px', 4], ['left:58%;top:760px', 4],
].map(([st, s]) => { const c = spriteEl(CLOUD, CLOUD_PAL, s as number); c.classList.add('cloud'); c.style.cssText += ';' + st; return c; });

const sound = soundButton('chip-btn sound', 'text');
const freeChip = h('div', { class: 'free-chip pixel' }, '… OF 1,000 PIGEONS FREE');
const header = h('header', { class: 'c-header' },
  h('a', { class: 'c-brand', href: '/' }, spriteEl(PIGEON_FLY_UP, PIGEON, 4, 'Flappy Mail home'), h('span', { class: 'pixel' }, 'FLAPPY MAIL')),
  h('div', { class: 'c-tools' }, freeChip, sound));

const counter = h('div', { class: 'counter pixel', 'aria-live': 'polite' });
const letter = h('textarea', { id: 'letter', rows: '14', maxlength: String(MAX), placeholder: 'Dear …', spellcheck: 'true' }) as HTMLTextAreaElement;
// On phones the letter grows with its text instead of scrolling inside itself, so a swipe always scrolls the page.
const growLetter = () => {
  if (!matchMedia('(max-width: 720px)').matches) { letter.rows = 14; letter.style.height = ''; return; }
  letter.rows = 6; // starts short on phones and grows as you write
  letter.style.height = 'auto';
  letter.style.height = letter.scrollHeight + 8 + 'px';
};
letter.addEventListener('input', growLetter);
addEventListener('resize', growLetter);
requestAnimationFrame(growLetter);

const field = (id: string, label: string, type = 'text', auto = 'off', extra?: HTMLElement) => {
  const input = h('input', { id, type, autocomplete: auto, maxlength: type === 'email' ? '254' : '40' }) as HTMLInputElement;
  const row = h('div', { class: 'field' }, h('label', { for: id, class: 'pixel' }, label), extra ? h('div', { class: 'with-btn' }, input, extra) : input);
  return { input, row };
};
const autoBtn = h('button', { type: 'button', class: 'chip-btn teal', title: 'Use my location' }, 'AUTO');
const F = {
  fname: field('fname', 'YOUR NAME', 'text', 'given-name'), femail: field('femail', 'YOUR EMAIL', 'email', 'email'),
  fcity: field('fcity', 'YOUR CITY', 'text', 'off', autoBtn),
  tname: field('tname', 'THEIR NAME'), temail: field('temail', 'THEIR EMAIL', 'email', 'off'), tcity: field('tcity', 'THEIR CITY'),
};
const city: { from: CityRef | null; to: CityRef | null } = { from: null, to: null };

// City autocomplete against the server's GeoNames list. Only a pick from the list counts.
function combo(inp: HTMLInputElement, which: 'from' | 'to') {
  const list = h('ul', { class: 'city-list', role: 'listbox', id: inp.id + '-list', hidden: true });
  inp.setAttribute('role', 'combobox');
  inp.setAttribute('aria-autocomplete', 'list');
  inp.setAttribute('aria-controls', list.id);
  inp.setAttribute('aria-expanded', 'false');
  inp.parentElement!.append(list);
  inp.parentElement!.classList.add('combo');
  let seq = 0, timer = 0;
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const choose = (c: CityRef) => { inp.value = c.label; city[which] = c; close(); citiesChanged(which, true); };
  inp.addEventListener('input', () => {
    if (city[which] && inp.value !== city[which]!.label) { city[which] = null; citiesChanged(which, false); }
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = inp.value.trim(), my = ++seq;
      if (q.length < 2) { close(); return; }
      const r = await api<{ cities: (CityRef & { admin1: string; cc: string })[] }>('/api/cities?q=' + encodeURIComponent(q));
      if (my !== seq) return;
      list.innerHTML = '';
      (r.data.cities ?? []).forEach(c => list.append(h('li', { role: 'option', tabindex: '-1', onmousedown: (e: Event) => { e.preventDefault(); choose(c); }, onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); choose(c); inp.focus(); } } },
        c.label.replace(/, \w+$/, ''), h('span', {}, ` ${c.admin1 ? c.admin1 + ', ' : ''}${c.cc === 'GB' ? 'UK' : c.cc}`))));
      list.hidden = !r.data.cities?.length;
      inp.setAttribute('aria-expanded', String(!list.hidden));
    }, 150);
  });
  inp.addEventListener('blur', () => setTimeout(close, 100));
  inp.addEventListener('keydown', e => {
    const opts = [...list.querySelectorAll('li')] as HTMLElement[];
    if (e.key === 'ArrowDown' && opts.length) { e.preventDefault(); opts[0].focus(); }
    if (e.key === 'Escape') close();
  });
  list.addEventListener('keydown', e => {
    const opts = [...list.querySelectorAll('li')] as HTMLElement[];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(opts.length - 1, i + 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? inp : opts[i - 1]).focus(); }
  });
  return choose;
}

// carrier picker: the pigeon card; the bottle card exists but stays hidden (an easter egg)
let carrier: 'pigeon' | 'bottle' = 'pigeon';
let pigeonName = '', bottleName = '';
const pigeonNameEl = h('div', { class: 'pixel carrier-name' }, '…');
const reroll = async (which: 'pigeon' | 'bottle') => {
  sfx('click');
  const cur = which === 'pigeon' ? pigeonName : bottleName;
  const r = await api<{ name: string }>(`/api/name?carrier=${which}&not=${encodeURIComponent(cur)}`);
  if (r.ok) { if (which === 'pigeon') pigeonName = r.data.name; else bottleName = r.data.name; paintCarrier(); saveDraft(); }
};
const pigeonCard = h('label', { class: 'carrier pigeon-card chosen' },
  h('input', { type: 'radio', name: 'carrier', value: 'pigeon', checked: true, class: 'sr-only' }),
  animatedSpriteEl(PIGEON_FLAP, PIGEON, 3, 160),
  h('div', { class: 'carrier-text' }, h('div', { class: 'pixel small' }, 'YOUR PIGEON'), pigeonNameEl),
  h('button', { type: 'button', class: 'chip-btn', 'aria-label': 'Pick a different pigeon name', onclick: (e: Event) => { e.preventDefault(); reroll('pigeon'); } }, 'NEW NAME'));
const bottleNameEl = h('div', { class: 'pixel carrier-name' });
const bottleCard = h('label', { class: 'carrier bottle-card', hidden: true },
  h('input', { type: 'radio', name: 'carrier', value: 'bottle', class: 'sr-only' }),
  spriteEl(BOTTLE, BOTTLE_PAL, 3),
  h('div', { class: 'carrier-text' }, h('div', { class: 'pixel small' }, 'OR A BOTTLE'), bottleNameEl),
  h('button', { type: 'button', class: 'chip-btn', 'aria-label': 'Pick a different bottle name', onclick: (e: Event) => { e.preventDefault(); reroll('bottle'); } }, 'NEW NAME'));
const psst = h('p', { class: 'psst', hidden: true, 'aria-live': 'polite' }, 'Psst. These two cities share a coastline.');
const picker = h('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Carrier' }, pigeonCard, psst, bottleCard);
picker.addEventListener('change', e => { carrier = (e.target as HTMLInputElement).value as 'pigeon' | 'bottle'; paintCarrier(); paintEta(); paintSend(); });

const eta = h('div', { class: 'eta' });
const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
const sendBtn = h('button', { type: 'button', class: 'game-btn send' }, 'SEND BY PIGEON ▶') as HTMLButtonElement;
const human = h('div', { class: 'human-check' }); // Turnstile's widget lives here; it's invisible unless Cloudflare needs a click
const sendBar = h('div', { class: 'send-bar' }, err, human, sendBtn);

const resendOf = params.get('resend');
const replyTo = params.get('reply');
const banner = h('div', { class: 'banner pixel', hidden: true });
const main = h('main', { class: 'c-main' },
  h('section', { class: 'letter-panel' },
    h('div', { class: 'letter-head' }, h('h1', { class: 'pixel' }, 'WRITE A LETTER'), counter),
    h('label', { for: 'letter', class: 'sr-only' }, 'Your letter'),
    letter,
    h('p', { class: 'hint' }, 'Plain text only. Your letter is only sent when the bird lands.')),
  h('section', { class: 'side' },
    h('div', { class: 'day-panel addr' }, h('h2', { class: 'pixel' }, 'FROM'), F.fname.row, F.femail.row, F.fcity.row),
    h('div', { class: 'day-panel addr' }, h('h2', { class: 'pixel' }, 'TO'), F.tname.row, F.temail.row, F.tcity.row),
    picker, eta, sendBar));

const ground = h('div', { class: 'ground' }, h('div', { class: 'tufts' }), h('div', { class: 'grass' }), h('div', { class: 'dirt' }, credits()));
const bush = spriteEl(BUSH, BUSH_PAL, 6); bush.classList.add('bush');
app.append(h('div', { class: 'compose' }, ...clouds, header, banner, main, ground, bush));

const chooseFrom = combo(F.fcity.input, 'from');
combo(F.tcity.input, 'to');

// ---------- the draft (kept in this browser only, so nothing is lost) ----------
type Draft = { body: string; fname: string; femail: string; tname: string; temail: string; from: CityRef | null; to: CityRef | null; pigeon: string };
const draftKey = 'draft';
function saveDraft() {
  if (resendOf || replyTo) return;
  const d: Draft = { body: letter.value, fname: F.fname.input.value, femail: F.femail.input.value, tname: F.tname.input.value, temail: F.temail.input.value, from: city.from, to: city.to, pigeon: pigeonName };
  prefs.set(draftKey, JSON.stringify(d));
}
function fill(d: Partial<Draft>) {
  if (d.body !== undefined) { letter.value = d.body; requestAnimationFrame(growLetter); }
  for (const k of ['fname', 'femail', 'tname', 'temail'] as const) if (d[k] !== undefined) F[k].input.value = d[k]!;
  if (d.from) { city.from = d.from; F.fcity.input.value = d.from.label; }
  if (d.to) { city.to = d.to; F.tcity.input.value = d.to.label; }
}

// ---------- estimates and the bottle easter egg ----------
let estimate: Estimate | null = null;
let estSeq = 0, bottleTimer = 0;

function hideBottle() {
  clearTimeout(bottleTimer);
  bottleCard.hidden = true; psst.hidden = true; bottleCard.classList.remove('wash-in');
  if (carrier === 'bottle') { carrier = 'pigeon'; (pigeonCard.querySelector('input') as HTMLInputElement).checked = true; }
  paintCarrier();
}

// picked = the person just chose this city from the list. The bottle only ever washes in then,
// after a short beat, and only when both cities are on the ocean coast.
async function citiesChanged(which: 'from' | 'to', picked: boolean) {
  saveDraft();
  estimate = null;
  if (!city.from || !city.to) { hideBottle(); paintEta(); return; }
  const my = ++estSeq;
  const r = await api<Estimate>('/api/estimate', { from: city.from.id, to: city.to.id });
  if (my !== estSeq) return;
  estimate = r.ok ? r.data : null;
  if (!r.ok) showError(r.data.message ?? 'Pick two different cities.', which === 'from' ? F.fcity.input : F.tcity.input);
  else clearError();
  if (!estimate?.bottle) hideBottle();
  else if (picked && bottleCard.hidden) {
    clearTimeout(bottleTimer);
    bottleTimer = window.setTimeout(async () => {
      if (!bottleName) { const n = await api<{ name: string }>('/api/name?carrier=bottle'); bottleName = n.data.name ?? 'Bottle No. 412'; }
      paintCarrier();
      bottleCard.hidden = false; psst.hidden = false;
      bottleCard.classList.add('wash-in');
      sfx('splash');
    }, 1200);
  }
  paintEta();
}

function paintCarrier() {
  pigeonNameEl.textContent = (pigeonName || '…').toUpperCase();
  bottleNameEl.textContent = bottleName.toUpperCase();
  pigeonCard.classList.toggle('chosen', carrier === 'pigeon');
  bottleCard.classList.toggle('chosen', carrier === 'bottle');
}

function paintEta() {
  eta.innerHTML = '';
  const e = estimate && (carrier === 'bottle' ? estimate.bottle : estimate.pigeon);
  if (!e) { eta.append(h('span', {}, 'Pick both cities to see how long the trip takes.')); return; }
  eta.append(h('div', { class: 'pixel' }, `ETA ≈ ${e.text.replace(/^about /, '').toUpperCase()}`),
    h('span', {}, carrier === 'bottle' ? `About ${fmt(e.miles)} miles by sea. Bottles drift at 2 mph, day and night.` : `${fmt(e.miles)} miles. Pigeons sleep at night.`));
}

// ---------- the coop ----------
let coop = { cap: 1000, free: 1000, nextFreeAt: null as number | null };
let tick = 0;
async function loadCoop() {
  const r = await api<typeof coop>('/api/coop');
  if (r.ok) coop = r.data;
  freeChip.textContent = `${fmt(coop.free)} OF ${fmt(coop.cap)} PIGEONS FREE`;
  paintSend();
}
function paintSend() {
  clearInterval(tick);
  const out = carrier === 'pigeon' && coop.free <= 0;
  sendBtn.classList.toggle('out', out);
  sendBtn.toggleAttribute('aria-disabled', out);
  if (!out) { sendBtn.textContent = carrier === 'bottle' ? 'SEND BY BOTTLE ▶' : 'SEND BY PIGEON ▶'; return; }
  const paint = () => {
    const left = Math.max(0, Math.round(((coop.nextFreeAt ?? Date.now()) - Date.now()) / 1000));
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    sendBtn.innerHTML = '';
    sendBtn.append('ALL PIGEONS ARE OUT', h('span', { class: 'sub' }, left > 0 ? `Next pigeon home in ${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s. Your draft is saved.` : 'A pigeon is landing now…'));
    if (left <= 0) { clearInterval(tick); setTimeout(loadCoop, 2000); }
  };
  paint();
  tick = window.setInterval(paint, 1000);
}

// ---------- errors ----------
function showError(msg: string, focus?: HTMLElement) {
  err.textContent = msg; err.hidden = false;
  focus?.focus();
}
function clearError() { err.hidden = true; }

// ---------- send ----------
let sending = false;
sendBtn.addEventListener('click', async () => {
  if (sending || sendBtn.classList.contains('out')) return;
  clearError();
  if (!letter.value.trim()) return showError('Your letter is empty.', letter);
  for (const k of ['fname', 'femail'] as const) if (!F[k].input.value.trim()) return showError('Add your name and email.', F[k].input);
  if (!city.from) return showError('Pick your city from the list.', F.fcity.input);
  for (const k of ['tname', 'temail'] as const) if (!F[k].input.value.trim()) return showError('Add their name and email.', F[k].input);
  if (!city.to) return showError('Pick their city from the list.', F.tcity.input);
  sending = true;
  sfx('send');
  sendBtn.textContent = carrier === 'bottle' ? 'CORKING…' : 'TYING ON YOUR LETTER…';
  const name = carrier === 'bottle' ? bottleName : pigeonName;
  const turnstileToken = await humanToken(() => { sendBtn.textContent = 'TICK THE BOX ABOVE TO SEND'; });
  sendBtn.textContent = carrier === 'bottle' ? 'CORKING…' : 'TYING ON YOUR LETTER…';
  const r = await api<{ trackingToken: string; carrierName: string; miles: number; eta: string; name?: string }>('/api/letters', {
    body: letter.value, senderName: F.fname.input.value, senderEmail: F.femail.input.value,
    recipientName: F.tname.input.value, recipientEmail: F.temail.input.value,
    from: city.from.id, to: city.to.id, carrier, carrierName: name, resendOf: resendOf ?? undefined, replyTo: replyTo ?? undefined, turnstileToken: turnstileToken ?? undefined,
  });
  sending = false;
  if (!r.ok) {
    paintSend();
    if (r.data.error === 'name_taken' && r.data.name) {
      if (carrier === 'bottle') bottleName = r.data.name; else pigeonName = r.data.name;
      paintCarrier();
    }
    if (r.data.error === 'coop_full') { await loadCoop(); }
    const fieldMap: Record<string, HTMLElement> = { body: letter, senderName: F.fname.input, senderEmail: F.femail.input, recipientName: F.tname.input, recipientEmail: F.temail.input, from: F.fcity.input, to: F.tcity.input };
    return showError(r.data.message ?? 'Something went wrong. Try again?', r.data.field ? fieldMap[r.data.field] : undefined);
  }
  prefs.set(draftKey, '{}');
  // The sky matches the time of day where the carrier takes off.
  const localH = estimate?.originHour ?? new Date().getHours() + new Date().getMinutes() / 60;
  await playCutscene({
    kind: 'departure', carrier, sky: skyFor(localH), name: r.data.carrierName, dest: city.to.label.replace(/, \w+$/, ''),
    miles: r.data.miles, day: 1, pct: 1, eta: r.data.eta.replace(/^about /, ''),
    clock: clock(new Date().getHours() + new Date().getMinutes() / 60), // the sender's own clock
    keep: true, // stay on the last frame while the map loads, so the form doesn't flash back
  });
  location.href = '/?t=' + encodeURIComponent(r.data.trackingToken);
});

// ---------- boot ----------
[letter, F.fname.input, F.femail.input, F.tname.input, F.temail.input].forEach(el => el.addEventListener('input', () => { counter.textContent = `${letter.value.length} / ${MAX}`; saveDraft(); }));
autoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  autoBtn.textContent = '…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const r = await api<{ city: CityRef | null }>(`/api/geo?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
    autoBtn.textContent = 'AUTO';
    if (r.data.city) chooseFrom(r.data.city);
  }, () => { autoBtn.textContent = 'AUTO'; showError("We couldn't get your location. Type your city instead.", F.fcity.input); }, { timeout: 8000 });
});

(async () => {
  let d: Partial<Draft> = {};
  if (resendOf) {
    const r = await api<{ body: string; senderName: string; senderEmail: string; recipientName: string; recipientEmail: string; from: CityRef; to: CityRef }>(`/api/track/${encodeURIComponent(resendOf)}/draft`);
    if (r.ok) {
      d = { body: r.data.body, fname: r.data.senderName, femail: r.data.senderEmail, tname: r.data.recipientName, temail: r.data.recipientEmail, from: r.data.from, to: r.data.to };
      banner.textContent = 'SENDING AGAIN · A brand-new pigeon will carry the same letter.';
      banner.hidden = false;
    }
  } else if (replyTo) {
    // "Send a bird back": the route reversed, both names and emails filled in.
    const r = await api<{ senderName: string; senderEmail: string; recipientName: string; recipientEmail: string; from: CityRef; to: CityRef }>(`/api/letter/${encodeURIComponent(replyTo)}/reply`);
    if (r.ok) {
      const first = r.data.recipientName.trim().split(/\s+/)[0];
      d = { body: `Dear ${first},\n\n`, fname: r.data.senderName, femail: r.data.senderEmail, tname: r.data.recipientName, temail: r.data.recipientEmail, from: r.data.from, to: r.data.to };
      banner.textContent = `REPLY · Sending a bird back to ${first} in ${r.data.to.label.replace(/, \w+$/, '')}.`;
      banner.hidden = false;
    }
  } else {
    try { d = JSON.parse(prefs.get(draftKey, '{}')); } catch { d = {}; }
  }
  fill(d);
  counter.textContent = `${letter.value.length} / ${MAX}`;
  pigeonName = d.pigeon ?? '';
  if (!pigeonName) await reroll('pigeon'); else paintCarrier();
  // The sender's city starts blank (no guess from their connection); AUTO fills it on request.
  await loadCoop();
  // Prefilled cities get an estimate, but never the bottle: that only washes in after a pick.
  if (city.from && city.to) citiesChanged('to', false); else paintEta();
  setInterval(loadCoop, 30000);
})();

initAudio({ music: true });
prepareHumanCheck(human);
tapForSoundHint(sound);
