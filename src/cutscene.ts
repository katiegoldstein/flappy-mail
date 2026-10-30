// Side-scroller cutscenes: departure, loss (one gentle vignette per reason) and arrival.
// The scene is drawn on a canvas in chunky units; the HUD and dialogue box are HTML on top.
import './cutscene.css';
import {
  Grid, drawSprite, gridSize, PIGEON, PIGEON_FLAP, PIGEON_STAND, MINI_FLY,
  BOTTLE, BOTTLE_SIDE, BOTTLE_PAL, LETTER_ROLL, LETTER_ROLL_PAL, SUN, CLOUD, CLOUD_PAL, SANDWICH, SANDWICH_PAL,
  STORM_CLOUD, STORM_PAL, DODO, DODO_PAL, WHALE, WHALE_PAL, NET, NET_PAL, BOAT, BOAT_PAL, BUSH, BUSH_PAL,
} from './sprites';
import { h, soundButton, fmt } from './ui';
import { sfx } from './audio';
import type { SkyKind } from './sky';

export type SceneKind = 'departure' | 'loss' | 'arrival' | 'arrival-still';
export type LossReason = 'storm' | 'sandwich' | 'flock' | 'dodo' | 'whale' | 'net' | 'sink';
// What the pigeon flies over: a city skyline (departures), fields, mountains, or open ocean.
export type Terrain = 'city' | 'fields' | 'mountains' | 'ocean';

export type SceneOpts = {
  kind: SceneKind; carrier: 'pigeon' | 'bottle'; sky: SkyKind; reason?: LossReason;
  unit?: number; // fixed pixel size (the letter page's small scene)
  terrain?: Terrain;
};

const SKIES = {
  dusk: { bands: ['#FFDA70', '#FFC85C', '#F9AE48', '#F09238'], sun: '#FFF1B0', back: '#D9693A', front: '#A3161F', frontHi: '#C2272F', ground: '#C98A3A', groundDark: '#8E5A22', base: '#3D1530', sea: '#C2272F', seaHi: '#F9AE48' },
  day: { bands: ['#5C94FC', '#6AA0FC', '#7BACFC', '#8DB8FC'], sun: '#FFF6C8', back: '#7FBF6A', front: '#3E8E41', frontHi: '#58A85A', ground: '#C84C0C', groundDark: '#5A2006', base: '#2E2A40', sea: '#3D6FD8', seaHi: '#B9E3F7' },
  night: { bands: ['#1D1240', '#24164F', '#2C1B5E', '#36226E'], sun: '#F3EED8', back: '#3A2A70', front: '#24184A', frontHi: '#33245F', ground: '#4A3A6A', groundDark: '#2A2048', base: '#120A24', sea: '#24184A', seaHi: '#5E5670' },
};

const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * ease(t);

// A pixel crescent moon for night skies.
const MOON = ['....MMMM', '..MMMMM.', '.MMMMM..', 'MMMMM...', 'MMMMM...', 'MMMMM...', 'MMMMM...', '.MMMMM..', '..MMMMM.', '....MMMM'];

// Scene durations in seconds.
export const DURATION: Record<SceneKind, number> = { departure: 8, loss: 8, arrival: 6, 'arrival-still': 0 };

export class Scene {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  W = 0; H = 0; U = 8; dpr = 1;
  t = 0;
  opts: SceneOpts;
  private raf = 0;
  private lastFlap = -1;
  private t0 = 0;

  constructor(host: HTMLElement, opts: SceneOpts) {
    this.opts = opts;
    this.canvas.className = 'scene-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => this.resize(host));
    ro.observe(host);
    this.resize(host);
  }

  resize(host: HTMLElement) {
    const r = host.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = Math.round(r.width); this.H = Math.round(r.height);
    this.U = this.opts.unit ?? (this.W > this.H ? Math.max(4, Math.round(this.W / 160)) : Math.max(4, Math.round(this.W / 65)));
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    this.draw();
  }

  play(at = 0) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.t0 = performance.now() - at * 1000;
    let last = 0;
    const loop = (now: number) => {
      // step at ~12 fps for a chunky, game-like feel
      if (now - last > 80) { last = now; this.t = reduce ? Math.max(this.t, (now - this.t0) / 1000) : (now - this.t0) / 1000; this.draw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  seek(t: number) { this.t = t; this.draw(); }
  stop() { cancelAnimationFrame(this.raf); }

  get portrait() { return this.H > this.W; }
  get skyH() { return Math.round(this.H * (this.portrait ? 0.6 : 430 / 640) / this.U) * this.U; }

  sprite(rows: Grid, pal: Record<string, string>, x: number, y: number, s = this.U, flip = false) {
    drawSprite(this.ctx, rows, pal, Math.round(x), Math.round(y), s, flip);
  }

  draw() {
    const { ctx, W, H } = this;
    if (!W) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const k = this.opts;
    const S = SKIES[k.sky];
    ctx.fillStyle = S.base;
    ctx.fillRect(0, 0, W, H);
    this.sky(S);
    const needsGround = k.reason === 'sandwich' || k.reason === 'dodo'; // these vignettes happen on the ground
    const atSea = k.carrier === 'bottle' || k.reason === 'whale' || k.reason === 'net' || k.reason === 'sink' || (k.terrain === 'ocean' && !needsGround);
    if (k.kind === 'arrival' || k.kind === 'arrival-still') return k.carrier === 'bottle' ? this.beach(S) : this.windowsill(S);
    if (atSea) this.sea(S, k.kind === 'departure' ? 0 : 1);
    else this.land(S, k.kind === 'departure' && this.t < 3.6 ? 0 : 1, k.terrain === 'ocean' ? 'fields' : k.terrain ?? (k.kind === 'departure' ? 'city' : 'mountains'));
    if (k.kind === 'departure') return k.carrier === 'bottle' ? this.departBottle(S) : this.departPigeon();
    if (k.kind === 'loss') return this.loss(k.reason ?? (k.carrier === 'bottle' ? 'whale' : 'sandwich'), S);
  }

  // ---------- layers ----------
  sky(S: typeof SKIES.day) {
    const { ctx, W, U } = this;
    const skyH = this.skyH;
    const hs = [0.33, 0.26, 0.23, 0.18];
    let y = 0;
    S.bands.forEach((c, i) => { const bh = i === 3 ? skyH - y : Math.round((skyH * hs[i]) / U) * U; ctx.fillStyle = c; ctx.fillRect(0, y, W, bh); y += bh; });
    if (this.opts.sky === 'night') {
      ctx.fillStyle = '#FFF6C8';
      for (let i = 0; i < 46; i++) { const sx = (i * 137) % W, sy = ((i * 71) % (skyH * 0.7)) + U * 2; if ((i + Math.floor(this.t * 2)) % 9) ctx.fillRect(sx, sy, U / 2, U / 2); }
    }
    const sunS = Math.round(U * 1.25);
    const sx = this.portrait ? W * 0.62 : W * 0.67, sy = skyH * (this.portrait ? 0.14 : 0.35);
    if (this.opts.sky === 'night') this.sprite(MOON, { M: S.sun }, sx, sy, sunS);
    else this.sprite(SUN, { S: S.sun }, sx, sy, sunS);
    if (this.opts.sky === 'day') {
      const drift = (this.t * U * 2) % (W + 200);
      this.sprite(CLOUD, CLOUD_PAL, ((W * 0.1 - drift) % (W + 200) + W + 200) % (W + 200) - 100, skyH * 0.12, Math.round(U * 0.75));
      this.sprite(CLOUD, CLOUD_PAL, ((W * 0.55 - drift * 0.6) % (W + 200) + W + 200) % (W + 200) - 100, skyH * 0.28, Math.round(U * 0.5));
    }
  }

  land(S: typeof SKIES.day, speed: number, terrain: Exclude<Terrain, 'ocean'> = 'mountains') {
    const { ctx, W, U } = this;
    const skyH = this.skyH, kk = skyH / 430;
    const off = this.t * speed;
    const cols = Math.ceil(W / U) + 1;
    const b0 = Math.floor(off * 4), f0 = Math.floor(off * 12);
    for (let c = 0; c < cols; c++) {
      const i = c + b0;
      let hb = (150 + 55 * Math.sin(i * 0.07) + 35 * Math.sin(i * 0.19 + 1)) * kk;
      hb = Math.round(hb / U) * U;
      ctx.fillStyle = S.back; ctx.fillRect(c * U, skyH - hb, U, hb);
    }
    if (terrain === 'city') this.skyline(S, off * 8);
    else if (terrain === 'fields') this.fields(S, off * 16);
    else for (let c = 0; c < cols; c++) {
      const i = c + f0;
      let hf = (92 + 48 * Math.sin(i * 0.11 + 2) + 28 * Math.sin(i * 0.31)) * kk;
      hf = Math.round(hf / U) * U;
      ctx.fillStyle = Math.sin(i * 0.11 + 2) > 0.2 && i % 3 === 0 ? S.frontHi : S.front;
      ctx.fillRect(c * U, skyH - hf, U, hf);
    }
    this.ground(S, off * 24);
  }

  // A pixel city: blocky towers with lit windows (lights on at night and dusk).
  skyline(S: typeof SKIES.day, scroll: number) {
    const { ctx, W, U } = this;
    const skyH = this.skyH, kk = skyH / 430;
    const lit = this.opts.sky === 'night' ? '#FFD46B' : this.opts.sky === 'dusk' ? '#FFE9A8' : '#B9E3F7';
    const shift = Math.floor(scroll) * U;
    let i = Math.floor(shift / (U * 8)) - 1;
    for (let x = i * U * 8 - shift; x < W; i++) {
      const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1; // steady pseudo-random per building
      const bw = (4 + Math.floor(r * 5)) * U, bh = Math.round(((60 + r * 150) * kk) / U) * U;
      ctx.fillStyle = r > 0.6 ? S.frontHi : S.front;
      ctx.fillRect(x, skyH - bh, bw, bh);
      if (r > 0.75) ctx.fillRect(x + Math.floor(bw / 2) - U / 2, skyH - bh - U * 3, U, U * 3); // antenna
      ctx.fillStyle = lit;
      for (let wy = skyH - bh + U * 2; wy < skyH - U * 2; wy += U * 3)
        for (let wx = x + U; wx < x + bw - U; wx += U * 2)
          if ((Math.floor(wx / U) * 7 + Math.floor(wy / U) * 3 + i) % 5 !== 0) ctx.fillRect(wx, wy, U / 2 + 1, U);
      x += bw + U * (r > 0.5 ? 1 : 2);
    }
  }

  // Farmland: striped crop rows in front of the hills, with a few bushes.
  fields(S: typeof SKIES.day, scroll: number) {
    const { ctx, W, U } = this;
    const skyH = this.skyH, top = skyH - Math.round((skyH * 0.16) / U) * U;
    ctx.fillStyle = S.front; ctx.fillRect(0, top, W, skyH - top);
    ctx.fillStyle = S.frontHi;
    const off = Math.floor(scroll) * U % (U * 6);
    for (let y = top + U; y < skyH; y += U * 2) for (let x = -off; x < W; x += U * 6) ctx.fillRect(x, y, U * 3, U / 2 + 1);
    for (let k = 0; k < 4; k++) {
      const bx = ((k * 377 - Math.floor(scroll) * U * 1.5) % (W + U * 40) + W + U * 40) % (W + U * 40) - U * 20;
      this.sprite(BUSH, BUSH_PAL, bx, top - U * 4, Math.max(2, Math.round(U * 0.75)));
    }
  }

  ground(S: typeof SKIES.day, scroll: number) {
    const { ctx, W, U } = this;
    const y = this.skyH, gh = U * 5;
    ctx.fillStyle = S.groundDark; ctx.fillRect(0, y, W, U / 2);
    ctx.fillStyle = S.ground; ctx.fillRect(0, y + U / 2, W, gh);
    ctx.fillStyle = S.groundDark;
    const sx = Math.round(scroll) % (U * 4);
    for (let x = -sx; x < W; x += U * 4) { ctx.fillRect(x, y + U / 2, U / 2, gh / 2); ctx.fillRect(x + U * 2, y + U / 2 + gh / 2, U / 2, gh / 2); }
    ctx.fillRect(0, y + U / 2 + gh / 2, W, U / 2);
    if (this.portrait) { // deeper soil under the portrait crop, so the ground meets the dialogue box
      ctx.fillRect(0, y + U / 2 + gh, W, this.H);
      ctx.fillStyle = S.ground;
      for (let yy = y + gh + U * 3; yy < this.H; yy += U * 4) for (let x = -sx + ((yy / U) % 8) * U; x < W; x += U * 8) ctx.fillRect(x, yy, U * 2, U);
    }
  }

  sea(S: typeof SKIES.day, speed: number) {
    const { ctx, W, U } = this;
    const y = this.skyH - U * 6, hh = this.H - y;
    ctx.fillStyle = S.sea; ctx.fillRect(0, y, W, hh);
    ctx.fillStyle = S.seaHi;
    const off = Math.floor(this.t * (2 + speed * 6)) * U;
    for (let row = 0; row < 6; row++) {
      const yy = y + row * U * 3 + U;
      const shift = (off * (row % 2 ? 1 : 0.6) + row * U * 5) % (U * 12);
      for (let x = -shift; x < W; x += U * 12) { ctx.fillRect(x, yy, U * 3, U / 2); ctx.fillRect(x + U, yy - U / 2, U, U / 2); }
    }
  }

  speedLines(x: number, y: number) {
    const { ctx, U } = this;
    const j = Math.floor(this.t * 10) % 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.8; ctx.fillRect(x - U * 12 - j * U, y + U * 3, U * 8, U * 0.75);
    ctx.globalAlpha = 0.6; ctx.fillRect(x - U * 16.5 - ((j + 1) % 3) * U, y + U * 5.25, U * 11, U * 0.75);
    ctx.globalAlpha = 0.8; ctx.fillRect(x - U * 10.5 - ((j + 2) % 3) * U, y + U * 7.5, U * 6, U * 0.75);
    ctx.globalAlpha = 1;
  }

  pigeonHome() { return { x: this.portrait ? this.W / 2 - this.U * 9 : this.W * (360 / 1280), y: this.portrait ? this.skyH * 0.42 : this.H * (250 / 640) }; }

  flyingPigeon(x: number, y: number, flip = false) {
    this.speedLines(flip ? x + this.U * 36 : x, y);
    const fi = Math.floor(this.t * 8) % 4;
    if (fi === 2 && this.lastFlap !== Math.floor(this.t * 2)) { this.lastFlap = Math.floor(this.t * 2); sfx('flap'); } // one flap sound per wingbeat
    const frame = PIGEON_FLAP[fi];
    this.sprite(frame, PIGEON, x, y + Math.round(Math.sin(this.t * 4) * this.U * 0.5), this.U, flip);
  }

  // ---------- departures ----------
  departPigeon() {
    const { U, t } = this;
    const home = this.pigeonHome();
    const groundY = this.skyH;
    const standH = gridSize(PIGEON_STAND).h * U;
    const sx = home.x + U * 3, sy = groundY - standH + U;
    if (t < 1.8) { // rolling up the letter
      this.sprite(PIGEON_STAND, PIGEON, sx, sy);
      const roll = Math.min(1, t / 1.6);
      this.ctx.fillStyle = '#F6E7C1';
      const lw = Math.round(lerp(U * 10, U * 8, roll)), lh = Math.round(lerp(U * 7, U * 5, roll));
      if (roll < 1) {
        this.ctx.fillStyle = '#2E2A40'; this.ctx.fillRect(sx + U * 14, groundY - lh - U, lw + U, lh + U);
        this.ctx.fillStyle = '#FFF8E4'; this.ctx.fillRect(sx + U * 14.5, groundY - lh - U / 2, lw, lh);
        this.ctx.fillStyle = '#C9A86B'; for (let ly = U * 1.5; ly < lh - U; ly += U * 1.5) this.ctx.fillRect(sx + U * 15.5, groundY - lh - U / 2 + ly, lw - U * 2, U / 2);
      }
      else this.sprite(LETTER_ROLL, LETTER_ROLL_PAL, sx + U * 14, groundY - U * 5);
    } else if (t < 3.6) { // tied on tight, to the leg
      const hop = (Math.floor(t * 6) % 2) * U;
      this.sprite(PIGEON_STAND, PIGEON, sx, sy - hop);
      this.sprite(LETTER_ROLL, LETTER_ROLL_PAL, sx + U * 4, sy + U * 11 - hop, Math.round(U * 0.75));
    } else { // take off
      const up = ease((t - 3.6) / 1.2);
      this.flyingPigeon(lerp(sx, home.x, up), lerp(sy, home.y, up));
    }
  }

  departBottle(S: typeof SKIES.day) {
    const { U, t, W } = this;
    const waterY = this.skyH - U * 6;
    // a strip of sand on the left
    this.ctx.fillStyle = '#F4E07A'; this.ctx.fillRect(0, waterY - U, W * (this.portrait ? 0.35 : 0.22), this.H - waterY + U);
    this.ctx.fillStyle = '#C98A3A'; this.ctx.fillRect(0, waterY - U, W * (this.portrait ? 0.35 : 0.22), U / 2);
    const bx0 = W * (this.portrait ? 0.08 : 0.08), by0 = waterY - U * 11;
    if (t < 2.4) {
      this.sprite(BOTTLE, BOTTLE_PAL, bx0, by0);
      if (t < 1.4) this.sprite(LETTER_ROLL, LETTER_ROLL_PAL, bx0 + U * 1.5, by0 - U * 6 + ease(t / 1.4) * U * 6, U * 0.75);
    } else {
      const p = Math.min(1, (t - 2.4) / 1.4);
      const x = lerp(bx0, W * (this.portrait ? 0.5 : 0.45), p) + Math.max(0, t - 3.8) * U * 3;
      const y = p < 1 ? by0 - Math.sin(p * Math.PI) * U * 14 + p * U * 9 : waterY + U * 2 + Math.round(Math.sin(t * 3)) * U;
      if (p < 1) this.sprite(BOTTLE, BOTTLE_PAL, x, y);
      else this.sprite(BOTTLE_SIDE, BOTTLE_PAL, x, y);
      if (p >= 1 && t < 4.4) { this.ctx.fillStyle = '#FFFFFF'; for (let i = 0; i < 4; i++) this.ctx.fillRect(x + i * U * 4 - U * 2, waterY - U * (2 + (i % 2) * 2) * (4.4 - t), U, U); }
    }
    void S;
  }

  // ---------- loss vignettes ----------
  loss(reason: LossReason, S: typeof SKIES.day) {
    const { U, t, W, ctx } = this;
    const home = this.pigeonHome();
    const groundY = this.skyH;
    if (reason === 'sandwich' || reason === 'dodo') {
      const thing = reason === 'sandwich' ? SANDWICH : DODO, pal = reason === 'sandwich' ? SANDWICH_PAL : DODO_PAL;
      const ts = gridSize(thing);
      const tx = W * (this.portrait ? 0.58 : 0.62), ty = groundY - ts.h * U + U;
      if (reason === 'dodo' && t > 2.2 && Math.floor(t * 3) % 2) this.sprite(DODO, pal, tx, ty - U); else this.sprite(thing, pal, tx, ty);
      if (t < 2) this.flyingPigeon(home.x, home.y);
      else if (t < 3.6) { const p = (t - 2) / 1.6; this.flyingPigeon(lerp(home.x, tx - U * 16, p), lerp(home.y, groundY - U * 12, p)); }
      else this.sprite(PIGEON_STAND, PIGEON, tx - U * 11, groundY - gridSize(PIGEON_STAND).h * U + U);
      if (t > 3.8 && reason === 'sandwich') { ctx.fillStyle = '#FFFFFF'; ctx.font = `${U * 2}px "Press Start 2P"`; ctx.fillText('nom', tx - U * 12, groundY - U * 17 - (Math.floor(t * 3) % 2) * U); }
      if (t > 3.8 && reason === 'dodo') { ctx.fillStyle = '#FFFFFF'; ctx.font = `${U * 2}px "Press Start 2P"`; ctx.fillText('...', tx - U * 8, groundY - U * 18); ctx.fillText('!', tx + U * 6, groundY - U * 18 - (Math.floor(t * 2) % 2) * U); }
      return;
    }
    if (reason === 'storm') {
      const cx = lerp(W + U * 10, W * (this.portrait ? 0.3 : 0.45), (t - 0.4) / 2.2);
      if (t > 2.4) { ctx.fillStyle = '#B9E3F7'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + Math.floor(t * 30) * U) % W, ((i * 53 + Math.floor(t * 40) * U) % groundY), U / 2, U * 1.5); }
      if (t < 2.6) this.flyingPigeon(home.x, home.y);
      else { const p = (t - 2.6) / 2.8; const x = lerp(home.x, -U * 30, p), y = home.y + Math.sin(p * 12) * U * 3; this.sprite(PIGEON_FLAP[Math.floor(t * 14) % 4], PIGEON, x, y, U, true); }
      this.sprite(STORM_CLOUD, STORM_PAL, cx, this.skyH * 0.12, U);
      return;
    }
    if (reason === 'flock') {
      for (let i = 0; i < 6; i++) {
        const fx = W + U * 6 - (t - 1) * U * 30 + (i % 3) * U * 14, fy = home.y - U * 6 + (i >> 1) * U * 5 + (i % 2) * U * 2;
        this.sprite(MINI_FLY, PIGEON, fx, fy, Math.round(U * 1.5), true);
      }
      if (t < 2.8) this.flyingPigeon(home.x, home.y);
      else { const p = (t - 2.8) / 3; this.flyingPigeon(lerp(home.x, -U * 30, p), home.y - p * U * 4, true); }
      return;
    }
    // bottle losses
    const waterY = this.skyH - U * 6;
    const bx = W * (this.portrait ? 0.32 : 0.36);
    const bob = Math.round(Math.sin(t * 3)) * U;
    if (reason === 'whale') {
      const rise = ease((t - 1.5) / 1.5), sink = ease((t - 4.2) / 1.5);
      const wy = waterY + U * 3 - rise * U * 9 + sink * U * 12;
      if (t < 3.4) this.sprite(BOTTLE_SIDE, BOTTLE_PAL, bx, waterY + U * 2 + bob);
      this.sprite(WHALE, WHALE_PAL, bx - U * 10, wy);
      // the water line hides the rest of the whale
      ctx.fillStyle = S.sea; ctx.fillRect(0, waterY + U * 3, W, this.H);
      ctx.fillStyle = S.seaHi; for (let x = -((Math.floor(t * 6) * U) % (U * 12)); x < W; x += U * 12) ctx.fillRect(x, waterY + U * 3, U * 4, U / 2);
      if (t > 3.4 && t < 4.6) { ctx.fillStyle = '#FFFFFF'; ctx.font = `${U * 2}px "Press Start 2P"`; ctx.fillText('gulp!', bx + U * 4, waterY - U * 10); }
      return;
    }
    if (reason === 'net') {
      const boatX = lerp(W + U * 4, bx + U * 6, (t - 0.8) / 2);
      this.sprite(BOAT, BOAT_PAL, boatX, waterY - U * 7 + bob);
      const lift = ease((t - 3) / 1.6);
      const ny = waterY - lift * U * 6;
      if (t > 2.8) { ctx.strokeStyle = '#F6E7C1'; ctx.lineWidth = U / 2; ctx.beginPath(); ctx.moveTo(boatX + U * 9.5, waterY - U * 11); ctx.lineTo(bx + U * 6, ny); ctx.stroke(); this.sprite(NET, NET_PAL, bx - U, ny, U); }
      this.sprite(BOTTLE_SIDE, BOTTLE_PAL, bx, (t > 3 ? ny + U * 2 : waterY + U * 2 + bob));
      return;
    }
    // sink: storm, then the bottle slips under
    this.sprite(STORM_CLOUD, STORM_PAL, lerp(W, bx - U * 4, (t - 0.3) / 2), this.skyH * 0.1, U);
    if (t > 2) { ctx.fillStyle = '#B9E3F7'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + Math.floor(t * 30) * U) % W, ((i * 53 + Math.floor(t * 40) * U) % waterY), U / 2, U * 1.5); }
    const sink = ease((t - 3) / 2.5);
    this.sprite(BOTTLE, BOTTLE_PAL, bx, waterY + U * 2 + bob * 2 + sink * U * 16);
    ctx.fillStyle = SKIES[this.opts.sky].sea;
    ctx.globalAlpha = sink * 0.9; ctx.fillRect(bx - U, waterY + U * 6, U * 12, U * 20); ctx.globalAlpha = 1;
  }

  // ---------- arrivals ----------
  windowsill(S: typeof SKIES.day) {
    const { U, ctx, W, t } = this;
    const sillY = this.portrait ? Math.round(this.H * 0.72) : Math.round(this.H * 0.68);
    // a house wall with a window, the pigeon lands on the sill
    ctx.fillStyle = '#F6E7C1'; ctx.fillRect(0, sillY + U * 3, W, this.H);
    ctx.fillStyle = '#E9D7A6'; for (let x = 0; x < W; x += U * 5) ctx.fillRect(x, sillY + U * 3, U / 2, this.H);
    ctx.fillStyle = '#2E2A40'; ctx.fillRect(0, sillY - U / 2, W, U * 3.5);
    ctx.fillStyle = '#A0522D'; ctx.fillRect(0, sillY, W, U * 2.5);
    ctx.fillStyle = '#D07A45'; ctx.fillRect(0, sillY, W, U / 2);
    this.sprite(BUSH, BUSH_PAL, W * 0.05, sillY - U * 5, U);
    const standH = gridSize(PIGEON_STAND).h * U;
    const lx = W / 2 - U * 4, ly = sillY - standH + U / 2;
    const done = this.opts.kind === 'arrival-still' || t > 3;
    if (done) {
      this.sprite(PIGEON_STAND, PIGEON, lx, ly);
      this.sprite(LETTER_ROLL, LETTER_ROLL_PAL, lx + U * 10, sillY - U * 5);
    } else {
      const p = ease(t / 3);
      this.flyingPigeon(lerp(-U * 20, lx - U * 4, p), lerp(this.H * 0.1, ly - U * 2, p));
    }
    void S;
  }

  beach(S: typeof SKIES.day) {
    const { U, ctx, W, t } = this;
    const sandY = Math.round(this.H * (this.portrait ? 0.7 : 0.66));
    ctx.fillStyle = S.sea; ctx.fillRect(0, this.skyH - U * 6, W, this.H);
    ctx.fillStyle = S.seaHi; for (let x = (Math.floor(t * 4) * U) % (U * 10) - U * 10; x < W; x += U * 10) ctx.fillRect(x, sandY - U * 2, U * 4, U / 2);
    ctx.fillStyle = '#F4E07A'; ctx.fillRect(0, sandY, W, this.H);
    ctx.fillStyle = '#C98A3A'; for (let x = 0; x < W; x += U * 6) ctx.fillRect(x + ((x / U) % 3) * U, sandY + U * 3, U, U / 2);
    const done = this.opts.kind === 'arrival-still' || t > 3;
    const p = done ? 1 : ease(t / 3);
    this.sprite(BOTTLE_SIDE, BOTTLE_PAL, lerp(W * 0.9, W / 2 - U * 7, p), sandY - U * 4 + (done ? 0 : Math.round(Math.sin(t * 4)) * U));
  }
}

// ---------- the overlay player ----------
export type CutsceneParams = SceneOpts & {
  name: string; dest?: string; milesLeft?: number; miles?: number; day?: number; clock?: string; eta?: string; pct?: number;
  lines?: string[]; onDone?: () => void;
  keep?: boolean; // leave the scene up when it ends (the page is about to navigate away)
};

export const LOSS_LINES: Record<LossReason, string> = {
  sandwich: 'Oh! Is that a dropped sandwich? I\'ll just be a minute…',
  storm: 'Whoa, what a wind! I\'m blown way, way off course…',
  flock: 'Hey, where\'s everyone going? Wait for me!',
  dodo: 'A dodo! I thought you were… Sure, I\'ve got time to chat.',
  whale: 'A curious whale swims up to say hello. And… gulp.',
  net: 'Scooped up in a fishing net. That\'s an odd catch!',
  sink: 'A big storm. The bottle bobs, and bobs… and sinks.',
};

export function departureLines(p: CutsceneParams) {
  if (p.carrier === 'bottle') return ['Corking your letter into a bottle…', `Splash! Off to ${p.dest}. See you in about ${p.eta}.`];
  return ['Rolling up your letter…', 'Letter tied on tight!', `Off to ${p.dest}. See you in about ${p.eta}.`];
}

export function playCutscene(p: CutsceneParams): Promise<void> {
  return new Promise(resolve => {
    const lines = p.lines ?? (p.kind === 'loss' ? [LOSS_LINES[p.reason ?? 'sandwich']] : p.kind === 'departure' ? departureLines(p) : [`Landed! A letter for you.`]);
    const overlay = h('div', { class: 'cutscene', role: 'dialog', 'aria-modal': 'true', 'aria-label': p.kind === 'loss' ? 'Lost in the mail' : p.kind === 'departure' ? 'Departure' : 'Arrival' });
    const stage = h('div', { class: 'stage' });
    overlay.append(stage);
    const scene = new Scene(stage, p);
    const pct = p.pct ?? (p.kind === 'departure' ? 1 : 60);
    const hud = h('div', { class: 'scene-hud' },
      h('div', { class: 'scene-bar', role: 'img', 'aria-label': `Trip progress ${pct} percent` }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'scene-boxes' },
        h('div', { class: 'pixel' }, p.kind === 'loss' ? `MILES LEFT ${fmt(p.milesLeft ?? 0)}` : `MILES ${fmt(p.miles ?? 0)}`),
        h('div', { class: 'pixel' }, `DAY ${p.day ?? 1}`),
        h('div', { class: 'pixel' }, p.clock ?? '06:40 PM')));
    const text = h('span', { class: 'say' });
    const caret = h('span', { class: 'caret' }, '▌');
    const speaker = p.kind === 'loss' && p.carrier === 'bottle' ? p.name.toUpperCase() : p.name.toUpperCase();
    const skip = h('button', { type: 'button', class: 'scene-skip pixel' }, 'SKIP ▶');
    const dialog = h('div', { class: 'scene-dialog' },
      h('div', { class: 'scene-text', 'aria-live': 'polite' }, h('span', { class: 'pixel who' }, `${speaker} ▸`), h('br'), text, caret),
      h('div', { class: 'scene-btns' }, soundButton('scene-sound pixel'), skip));
    stage.append(hud, dialog);
    const banner = h('div', { class: 'scene-banner pixel', hidden: true }, p.kind === 'loss' ? 'LOST IN THE MAIL' : '');
    stage.append(banner);
    document.body.append(overlay);
    skip.focus();
    scene.play();
    // Sound beats: the splash as a bottle hits the water, the sad sting when a carrier is lost.
    const beats: number[] = [];
    if (p.kind === 'departure' && p.carrier === 'bottle') beats.push(window.setTimeout(() => sfx('splash'), 3800));
    if (p.kind === 'loss') beats.push(window.setTimeout(() => sfx('loss'), 2600));

    const dur = DURATION[p.kind];
    let typed = 0, li = 0, alive = true;
    const per = (dur * 1000 * 0.8) / Math.max(1, lines.join(' ').length);
    const typeTick = () => {
      if (!alive) return;
      const line = lines[li];
      if (typed <= line.length) { text.textContent = line.slice(0, typed); typed++; setTimeout(typeTick, per); }
      else if (li < lines.length - 1) { setTimeout(() => { li++; typed = 0; typeTick(); }, 500); }
    };
    typeTick();
    const finish = () => {
      if (!alive) return;
      alive = false;
      beats.forEach(clearTimeout);
      if (!p.keep) { scene.stop(); overlay.remove(); }
      p.onDone?.();
      resolve();
    };
    const timer = setTimeout(() => {
      if (p.kind === 'loss') { banner.hidden = false; setTimeout(finish, 1800); } else finish();
    }, dur * 1000);
    skip.addEventListener('click', () => { clearTimeout(timer); finish(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { clearTimeout(timer); finish(); } });
  });
}
