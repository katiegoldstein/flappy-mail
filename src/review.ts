// Step 1 review board: every screen and state, side by side at desktop (1280) and phone (390) size.
import './style.css';
import { h, logo } from './ui';

type Item = { title: string; url: string; note?: string; dh?: number };
const sections: [string, string, Item[]][] = [
  ['Home: the live map', 'One map is the homepage, and it only ever shows real letters in transit. Locally, `npm run seed` sends a few hundred real letters so the full sky can be checked; `npm run db:reset` clears them.', [
    { title: 'World (today: quiet skies)', url: '/' },
    { title: 'Dark mode', url: '/?theme=dark' },
    { title: 'Departures board', url: '/?demo=board' },
  ]],
  ['Compose', 'Letter and addresses side by side on desktop; on phones the letter comes first and Send sticks to the bottom. This is the real, working form (step 3).', [
    { title: 'Write a letter', url: '/send', dh: 1000 },
  ]],
  ['Cutscenes', 'Each runs 5 to 10 seconds and can be skipped. The sky matches the carrier\'s local time. These loop here.', [
    { title: 'Departure, dusk', url: '/scene.html?kind=departure&sky=dusk', dh: 720 },
    { title: 'Departure, day', url: '/scene.html?kind=departure&sky=day', dh: 720 },
    { title: 'Departure, night (city skyline)', url: '/scene.html?kind=departure&sky=night', dh: 720 },
    { title: 'Departure by bottle', url: '/scene.html?kind=departure&carrier=bottle&sky=day', dh: 720 },
    { title: 'Lost: dropped sandwich', url: '/scene.html?kind=loss&reason=sandwich', dh: 720 },
    { title: 'Lost: caught in a storm (over the ocean)', url: '/scene.html?kind=loss&reason=storm&sky=dusk&terrain=ocean', dh: 720 },
    { title: 'Lost: wrong-way flock (fields)', url: '/scene.html?kind=loss&reason=flock&terrain=fields', dh: 720 },
    { title: 'Lost: chatting with a dodo', url: '/scene.html?kind=loss&reason=dodo', dh: 720 },
    { title: 'Lost (bottle): curious whale', url: '/scene.html?kind=loss&carrier=bottle&reason=whale', dh: 720 },
    { title: 'Lost (bottle): fishing net', url: '/scene.html?kind=loss&carrier=bottle&reason=net', dh: 720 },
    { title: 'Lost (bottle): sank in a storm', url: '/scene.html?kind=loss&carrier=bottle&reason=sink&sky=dusk', dh: 720 },
  ]],
  ['Letter page (recipient)', 'Arrival scene, then the letter unrolls and types out. Opened from the arrival email (/l/<token>); send yourself a letter with TIME_WARP on to see one.', [
    { title: 'Missing or not-yet-landed letter', url: '/l/not-a-real-token-xxxxxxxxxx', dh: 1000 },
  ]],
];

const S = 0.42;
const frame = (url: string, w: number, hh: number, label: string) => {
  const box = h('div', { class: 'rv-frame', style: `width:${w * S}px;height:${hh * S}px` });
  const btn = h('button', { type: 'button', class: 'rv-load pixel' }, '▶ LOAD');
  const load = () => {
    btn.remove();
    box.append(h('iframe', { src: url, title: label, width: String(w), height: String(hh), style: `transform:scale(${S})` }));
  };
  btn.addEventListener('click', load);
  box.append(btn);
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); setTimeout(load, 100 + Math.random() * 400); } }, { rootMargin: '200px' }).observe(box);
  return box;
};

const style = document.createElement('style');
style.textContent = `
body{background:#2A0F24;color:#FFE9A8;overflow:auto}
.rv{max-width:1240px;margin:0 auto;padding:24px 20px 80px}
.rv-head{display:flex;align-items:center;gap:14px;border-bottom:4px solid #FFD46B;padding-bottom:16px}
.rv-head h1{font-family:var(--f-pixel);font-size:16px;color:#FFD46B;text-shadow:2px 2px 0 #8E1B1B;margin:0;line-height:1.5}
.rv-intro{font-size:22px;line-height:1.2;max-width:900px}
.rv h2{font-family:var(--f-pixel);font-size:13px;color:#FFD46B;margin:40px 0 6px;font-weight:normal}
.rv-sec p{font-size:20px;margin:0 0 14px;color:#B9A6C8}
.rv-card{background:#3D1530;border:3px solid #8E1B1B;padding:14px;margin:0 0 18px}
.rv-card h3{font-family:var(--f-pixel);font-size:10px;margin:0 0 6px;font-weight:normal;color:#FFE9A8}
.rv-card .n{font-size:19px;color:#F7C46A;margin:0 0 10px}
.rv-row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.rv-col{display:flex;flex-direction:column;gap:6px}
.rv-col span{font-family:var(--f-pixel);font-size:7px;color:#B9A6C8}
.rv-col a{color:#FFD46B;font-size:18px}
.rv-frame{position:relative;overflow:hidden;border:3px solid #FFD46B;background:#120A24}
.rv-frame iframe{border:0;transform-origin:0 0;position:absolute;left:0;top:0;pointer-events:auto}
.rv-load{position:absolute;inset:0;margin:auto;width:120px;height:44px;background:#FFD46B;color:#3D1530;border:3px solid #14101F;font-size:9px}
`;
document.head.append(style);

const app = document.getElementById('app')!;
const root = h('div', { class: 'rv' },
  h('div', { class: 'rv-head' }, logo(3), h('h1', {}, 'FLAPPY MAIL', h('br'), 'STEP 1 · STATIC SCREENS')),
  h('p', { class: 'rv-intro' }, 'Every screen at desktop (1280 wide) and phone (390 wide) size. Open any of them full size to click around.'));
for (const [title, intro, items] of sections) {
  const sec = h('section', { class: 'rv-sec' }, h('h2', {}, title.toUpperCase()), h('p', {}, intro));
  for (const it of items) {
    sec.append(h('div', { class: 'rv-card' },
      h('h3', {}, it.title.toUpperCase()),
      it.note ? h('p', { class: 'n' }, it.note) : null,
      h('div', { class: 'rv-row' },
        h('div', { class: 'rv-col' }, h('span', {}, 'DESKTOP 1280'), frame(it.url, 1280, it.dh ?? 800, it.title + ' desktop'), h('a', { href: it.url, target: '_blank' }, 'Open full size ↗')),
        h('div', { class: 'rv-col' }, h('span', {}, 'PHONE 390'), frame(it.url, 390, 844, it.title + ' phone')))));
  }
  root.append(sec);
}
app.append(root);
