// The live pixel map: a canvas renderer over the rasterized basemap, with the flock drawn on top.
// Three levels of bird detail (world, region, close-up) all draw the same list of birds.
import { CELL, View, Raster, rasterize, loadBasemap, landColorIndex, mx, my, lonOf, cellAt } from './basemap';
import { LABELS } from './labels';
import { isNightAt } from '../sky';
import { LonLat, routeLengths, pointAlong } from '../../shared/geo';
import {
  Grid, Pal, gridSize, drawSprite, PIGEON, MINI_FLY, MINI_FLY_DOWN, MINI_SLEEP, PIGEON_FLAP, PIGEON_REST,
  BOTTLE_SMALL, BOTTLE_PAL, LIFEBOAT, LIFEBOAT_PAL, TREE, TREE_PAL,
} from '../sprites';

export type Theme = 'light' | 'dark';
export type Level = 'world' | 'region' | 'close';

export type Bird = {
  id: string; name: string; kind: 'pigeon' | 'bottle';
  lon: number; lat: number; plon: number; plat: number; // current and a moment ago (for heading)
  from: string; to: string;
  asleep: boolean; mine?: boolean; stopped?: boolean;
  route?: { pts: LonLat[]; f: number }; // the stored route polyline and how far along it the bird is
};

const THEMES = {
  light: {
    sea: '#B9E3F7', sea2: '#A6D7F1', check: 36, night: 'rgba(30, 14, 70, 0.28)', cityText: '#2E2A40', cityShadow: '#FFFFFF',
    route: '#2E2A40', ahead: '#2E2A40', trail: '#2E2A40', ring: '#E4574A', coast: '#A2D3EE', border: '#FFFFFF',
    land: ['#EC4A98', '#5A6FC6', '#F4E07A', '#3FA36B', '#F07A2B', '#5EC7C2', '#8A52A8'], shadow: 'rgba(30,20,60,0.25)',
  },
  dark: {
    sea: '#1E2A4A', sea2: '#1B2644', check: 16, night: 'rgba(8, 4, 28, 0.5)', cityText: '#E8E4F5', cityShadow: '#14101F',
    route: '#FFD46B', ahead: '#FFFFFF', trail: '#FFD46B', ring: '#FFD46B', coast: '#2A3B63', border: '#9C98B8',
    land: ['#5B6B4E', '#6B6250', '#5E5670', '#4F6672', '#706055', '#58705E', '#665A6A'], shadow: '',
  },
};

const LEVEL_CFG = {
  world: { s: 1, bs: 1, trail: 2, trailGap: 3, tagFont: 7, cityFont: 7, zFont: 6, dotGap: 6, tier: 1 },
  region: { s: 2, bs: 2, trail: 3, trailGap: 8, tagFont: 7, cityFont: 8, zFont: 7, dotGap: 7, tier: 2 },
  close: { s: 3, bs: 4, trail: 4, trailGap: 16, tagFont: 8, cityFont: 10, zFont: 10, dotGap: 10, tier: 3 },
};

export const REGION_Z = 4.5, CLOSE_Z = 6, MAX_Z = 7.5;
export const levelOf = (z: number): Level => (z >= 5.8 ? 'close' : z >= 3.8 ? 'region' : 'world');

type Placed = { b: Bird; x: number; y: number; w: number; h: number; bx: number; by: number };

export class MapView {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  base: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: View = { cx: 0.5, cy: 0.45, z: 2, W: 800, H: 600 };
  theme: Theme = 'light';
  birds: Bird[] = [];
  selected: string | null = null;
  now = new Date();
  ready = false;
  raster: Raster | null = null;
  placed: Placed[] = [];
  previews: { pts: LonLat[]; f: number }[] = []; // routes drawn without a bird (dev trip planner)
  insets = { top: 0, bottom: 0, left: 0, right: 0 }; // UI chrome, so labels avoid it
  otherTags = true; // name tags on birds other than the selected one and the sender's own (the promo film turns them off)
  onSelect: (b: Bird | null) => void = () => {};
  onViewChange: (v: View) => void = () => {};
  onUserMove: () => void = () => {}; // the person dragged, pinched or scrolled the map
  private dpr = 1;
  private dirtyBase = true;
  // Where the cached basemap image was drawn, so drags and pinches can slide/scale it until they pause.
  private baseAt: { X0: number; Y0: number; S: number } | null = null;
  private lastMove = 0;
  private rebuildTimer = 0;
  private frame = 0;
  private spriteCache = new Map<string, HTMLCanvasElement>();

  constructor(el: HTMLElement) {
    this.el = el;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-canvas';
    this.canvas.setAttribute('role', 'img');
    el.append(this.canvas);
    this.base = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(el);
    this.bindInput();
    loadBasemap().then(() => { this.ready = true; this.dirtyBase = true; this.draw(); });
    document.fonts.load('8px "Press Start 2P"').then(() => { this.dirtyBase = true; });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = () => { this.frame++; this.draw(); };
    const loop = () => { tick(); setTimeout(() => requestAnimationFrame(loop), reduce ? 1000 : 120); };
    loop();
  }

  get minZ() { return Math.max(0, Math.log2(this.view.W / 256)); }
  get level(): Level { return levelOf(this.view.z); }

  resize() {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.view.W = Math.max(1, Math.round(r.width));
    this.view.H = Math.max(1, Math.round(r.height));
    for (const c of [this.canvas, this.base]) { c.width = this.view.W * this.dpr; c.height = this.view.H * this.dpr; }
    this.canvas.style.width = this.view.W + 'px';
    this.canvas.style.height = this.view.H + 'px';
    if (this.view.z < this.minZ) this.view.z = this.minZ;
    this.dirtyBase = true;
    this.kick();
  }

  setTheme(t: Theme) { this.theme = t; this.dirtyBase = true; this.kick(); }
  setBirds(b: Bird[]) { this.birds = b; this.kick(); }
  setNow(d: Date) { this.now = d; this.dirtyBase = true; this.kick(); }
  select(id: string | null) { this.selected = id; this.kick(); }

  // Redraw on the next frame (pans, pinches and zooms shouldn't wait for the animation tick).
  private pending = false;
  kick() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }

  setView(lon: number, lat: number, z: number) {
    this.view.cx = mx(lon);
    this.view.cy = my(lat);
    this.view.z = Math.max(this.minZ, Math.min(MAX_Z, z));
    this.clampView();
    this.dirtyBase = true;
    this.onViewChange(this.view);
  }

  // Center so a point sits in the middle of the uncovered part of the map (between panels).
  centerOn(lon: number, lat: number, z: number) {
    const S = 256 * Math.pow(2, Math.max(this.minZ, Math.min(MAX_Z, z)));
    const dx = (this.insets.left - this.insets.right) / 2, dy = (this.insets.top - this.insets.bottom) / 2;
    this.view.z = Math.log2(S / 256);
    this.view.cx = mx(lon) - dx / S;
    this.view.cy = my(lat) - dy / S;
    this.clampView();
    this.dirtyBase = true;
    this.onViewChange(this.view);
  }

  zoomBy(dz: number, ax = this.view.W / 2, ay = this.view.H / 2) {
    const v = this.view;
    const S0 = 256 * Math.pow(2, v.z);
    const wx = v.cx + (ax - v.W / 2) / S0, wy = v.cy + (ay - v.H / 2) / S0;
    v.z = Math.max(this.minZ, Math.min(MAX_Z, v.z + dz));
    const S1 = 256 * Math.pow(2, v.z);
    v.cx = wx - (ax - v.W / 2) / S1;
    v.cy = wy - (ay - v.H / 2) / S1;
    this.clampView();
    this.dirtyBase = true;
    this.onViewChange(v);
  }

  private clampView() {
    const v = this.view, S = 256 * Math.pow(2, v.z);
    v.cx = ((v.cx % 1) + 1) % 1;
    const half = v.H / 2 / S;
    v.cy = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, v.cy));
    this.kick();
  }

  private origin() {
    const v = this.view, S = 256 * Math.pow(2, v.z);
    return { S, X0: Math.round(v.cx * S - v.W / 2), Y0: Math.round(v.cy * S - v.H / 2) };
  }

  // world -> screen, choosing the copy of the world nearest the view
  project(lon: number, lat: number): [number, number] {
    const { S, X0, Y0 } = this.origin();
    let x = mx(lon) * S - X0;
    const y = my(lat) * S - Y0;
    const W = this.view.W;
    if (x < -W / 2) x += S * Math.ceil((-W / 2 - x) / S);
    if (x > W * 1.5) x -= S * Math.ceil((x - W * 1.5) / S);
    return [x, y];
  }

  private buildBase() {
    const T = THEMES[this.theme];
    const v = this.view;
    const { S, X0, Y0 } = this.origin();
    const R = rasterize({ ...v, cx: (X0 + v.W / 2) / S, cy: (Y0 + v.H / 2) / S });
    this.baseAt = { X0, Y0, S };
    this.raster = R;
    const ctx = this.base.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, v.W, v.H);
    const ox = R.col0 * CELL - X0, oy = R.row0 * CELL - Y0;
    const at = (r: number, c: number) => (r < 0 || c < 0 || r >= R.rows || c >= R.cols ? -1 : R.ids[r * R.cols + c]);
    // value per cell: -1 sea, -2 coast, -3 border, 0..6 land color
    const val = (r: number, c: number) => {
      const a = at(r, c);
      if (a < 0) return at(r, c + 1) >= 0 || at(r, c - 1) >= 0 || at(r + 1, c) >= 0 || at(r - 1, c) >= 0 ? -2 : -1;
      const right = c + 1 < R.cols ? at(r, c + 1) : a, down = r + 1 < R.rows ? at(r + 1, c) : a;
      return (right >= 0 && right !== a) || (down >= 0 && down !== a) ? -3 : landColorIndex(a);
    };
    const runs: [number, number, number, number][] = [];
    for (let r = 0; r < R.rows; r++) {
      let c = 0;
      while (c < R.cols) {
        const vv = val(r, c);
        let e = c;
        while (e + 1 < R.cols && val(r, e + 1) === vv) e++;
        if (vv !== -1) runs.push([r, c, e - c + 1, vv]);
        c = e + 1;
      }
    }
    for (const [r, c, n, vv] of runs) if (vv === -2) { ctx.fillStyle = T.coast; ctx.fillRect(ox + c * CELL, oy + r * CELL, n * CELL, CELL); }
    if (T.shadow) {
      ctx.fillStyle = T.shadow;
      for (const [r, c, n, vv] of runs) if (vv !== -2) ctx.fillRect(ox + c * CELL + 4, oy + r * CELL + 4, n * CELL, CELL);
    }
    for (const [r, c, n, vv] of runs) {
      if (vv === -2) continue;
      ctx.fillStyle = vv === -3 ? T.border : T.land[vv];
      ctx.fillRect(ox + c * CELL, oy + r * CELL, n * CELL, CELL);
    }
    // night: a stepped band where local solar time is outside 7:00-19:00
    ctx.fillStyle = T.night;
    let start = -1;
    for (let c = 0; c <= R.cols; c++) {
      const nx = ((R.col0 + c + 0.5) * CELL) / S;
      const n = c < R.cols && isNightAt(lonOf(((nx % 1) + 1) % 1), this.now);
      if (n && start < 0) start = c;
      if (!n && start >= 0) { ctx.fillRect(ox + start * CELL, 0, (c - start) * CELL, v.H); start = -1; }
    }
    // city labels, skipping any that would collide with each other or the UI chrome
    const cfg = LEVEL_CFG[this.level];
    ctx.font = `${cfg.cityFont}px "Press Start 2P"`;
    ctx.textBaseline = 'top';
    const boxes: number[][] = [];
    for (const [name, lon, lat, tier] of LABELS) {
      if (tier > cfg.tier) continue;
      const [x, y] = this.project(lon, lat);
      const tw = ctx.measureText(name).width;
      const box = [x - 6, y - 6, x + 14 + tw, y + cfg.cityFont + 4];
      if (box[0] < this.insets.left + 4 || box[2] > v.W - this.insets.right - 4 || box[1] < this.insets.top + 4 || box[3] > v.H - this.insets.bottom - 4) continue;
      if (boxes.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      boxes.push(box);
      ctx.fillStyle = '#14101F';
      ctx.fillRect(Math.round(x) - 5, Math.round(y) - 5, 10, 10);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      ctx.fillStyle = T.cityShadow;
      ctx.fillText(name, Math.round(x) + 9, Math.round(y) - 5);
      ctx.fillStyle = T.cityText;
      ctx.fillText(name, Math.round(x) + 7, Math.round(y) - 7);
    }
    this.el.style.backgroundColor = T.sea;
    this.el.style.backgroundImage = `conic-gradient(${T.sea2} 25%, transparent 0 50%, ${T.sea2} 0 75%, transparent 0)`;
    this.el.style.backgroundSize = `${T.check}px ${T.check}px`;
    this.el.style.backgroundPosition = `${-(X0 % T.check)}px ${-(Y0 % T.check)}px`;
  }

  private sprite(rows: Grid, pal: Pal, s: number, flip: boolean) {
    const key = rows.join('|') + s + flip + (pal === PIGEON ? 'p' : pal === BOTTLE_PAL ? 'b' : pal === LIFEBOAT_PAL ? 's' : 't');
    let c = this.spriteCache.get(key);
    if (!c) {
      const { w, h } = gridSize(rows);
      c = document.createElement('canvas');
      c.width = w * s; c.height = h * s;
      drawSprite(c.getContext('2d')!, rows, pal, 0, 0, s, flip);
      this.spriteCache.set(key, c);
    }
    return c;
  }

  draw() {
    const ctx = this.ctx, v = this.view, T = THEMES[this.theme];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.ready) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#FFD46B';
      ctx.textAlign = 'center';
      ctx.fillText('LOADING THE COOP…', v.W / 2, v.H / 2);
      ctx.textAlign = 'left';
      return;
    }
    const moving = performance.now() - this.lastMove < 140;
    if (this.dirtyBase && moving && this.baseAt) {
      // Mid-gesture: reuse the last basemap, shifted and scaled, and rebuild once the gesture pauses.
      const { S, X0, Y0 } = this.origin(), k = S / this.baseAt.S;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.drawImage(this.base, 0, 0, this.base.width, this.base.height, this.baseAt.X0 * k - X0, this.baseAt.Y0 * k - Y0, v.W * k, v.H * k);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const T0 = THEMES[this.theme];
      this.el.style.backgroundPosition = `${-(X0 % T0.check)}px ${-(Y0 % T0.check)}px`;
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => this.draw(), 160);
    } else {
      if (this.dirtyBase) { this.buildBase(); this.dirtyBase = false; }
      ctx.drawImage(this.base, 0, 0);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const level = this.level, cfg = LEVEL_CFG[level];
    const sel = this.birds.find(b => b.id === this.selected) || null;

    // selected route (and any dev previews): solid dots behind, hollow dots ahead
    if (sel?.route) this.drawRoute(ctx, sel.route, cfg.dotGap, T);
    for (const r of this.previews) this.drawRoute(ctx, r, cfg.dotGap, T);

    // birds
    const placed: Placed[] = [];
    const flapFrame = this.frame % 4;
    for (const b of this.birds) {
      const [x, y] = this.project(b.lon, b.lat);
      if (x < -40 || x > v.W + 40 || y < -40 || y > v.H + 40) continue;
      const [px, py] = this.project(b.plon, b.plat);
      let dx = x - px, dy = y - py;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const flip = dx < 0;
      let rows: Grid, pal = PIGEON, s = cfg.s;
      if (b.kind === 'bottle') { rows = BOTTLE_SMALL; pal = BOTTLE_PAL; s = cfg.bs; }
      else if (b.asleep || b.stopped) rows = level === 'close' ? PIGEON_REST : MINI_SLEEP;
      else if (level === 'close') rows = PIGEON_FLAP[(flapFrame + b.id.length) % 4];
      else rows = level === 'region' && (this.frame + b.id.charCodeAt(b.id.length - 1)) % 6 === 0 ? MINI_FLY_DOWN : MINI_FLY;
      const sp = this.sprite(rows, pal, s, flip);
      const fw = gridSize(level === 'close' && b.kind === 'pigeon' && !b.asleep ? PIGEON_FLAP[0] : rows);
      const w = fw.w * s, hh = Math.max(fw.h, gridSize(rows).h) * s;
      const bob = b.kind === 'bottle' ? Math.round(Math.sin((this.frame + b.id.length * 3) / 3) * Math.max(1, s / 2)) : 0;
      const bx = Math.round(x - w / 2), by = Math.round(y - hh / 2) + bob;
      // where it sleeps (close-up): a lifeboat over open water, a tree over land
      if (level === 'close' && b.kind === 'pigeon' && b.asleep && this.raster) {
        const { X0, Y0 } = this.origin();
        const onLand = cellAt(this.raster, x + X0, y + Y0) >= 0;
        const perch = onLand ? this.sprite(TREE, TREE_PAL, 3, false) : this.sprite(LIFEBOAT, LIFEBOAT_PAL, 3, flip);
        ctx.drawImage(perch, Math.round(x - perch.width / 2), by + hh - (onLand ? 9 : 6));
      }
      ctx.drawImage(sp, bx, by);
      if (b.asleep) {
        ctx.font = `${cfg.zFont}px "Press Start 2P"`;
        const zy = by - 4 - ((this.frame >> 2) % 2) * 3;
        ctx.fillStyle = '#14101F'; ctx.fillText('z', bx + w + 1, zy + 1);
        ctx.fillStyle = '#FFFFFF'; ctx.fillText('z', bx + w, zy);
      }
      placed.push({ b, x, y, w, h: hh, bx, by });
    }
    this.placed = placed;

    // selection ring + name tag, then name tags on other birds
    const tagBoxes: number[][] = [];
    // The selected bird, and the sender's own pigeon (which stays highlighted while they browse).
    const marked = placed.filter(p => p.b.id === this.selected || p.b.mine);
    for (const p of marked) {
      const isSel = p.b.id === this.selected;
      ctx.strokeStyle = isSel ? T.ring : '#FFD46B';
      ctx.lineWidth = 3;
      ctx.setLineDash(isSel ? [6, 4] : [2, 3]);
      ctx.strokeRect(p.bx - 6.5, p.by - 6.5, p.w + 13, p.h + 13);
      ctx.setLineDash([]);
      const text = p.b.mine ? (p.b.kind === 'bottle' ? 'YOUR BOTTLE · ' : 'YOUR PIGEON · ') + p.b.name.toUpperCase() : p.b.name.toUpperCase();
      let tx = p.bx + p.w + 12;
      const tw = this.measureTag(ctx, [text], 0, 0, 8, 3, 6, 4)[2];
      if (tx + tw > v.W - this.insets.right) tx = Math.max(this.insets.left + 4, p.bx - 12 - tw);
      tagBoxes.push(this.tag(ctx, [text], tx, p.by - 30, 8, '#FFD46B', '#3D1530', 3, 6, 4));
    }
    if (level !== 'world' && this.otherTags) {
      const others = placed.filter(p => p.b.id !== this.selected && !p.b.mine)
        .sort((a, b) => Math.hypot(a.x - v.W / 2, a.y - v.H / 2) - Math.hypot(b.x - v.W / 2, b.y - v.H / 2));
      let n = 0;
      for (const p of others) {
        if (level === 'region' && n >= 3) break;
        const lines = [p.b.name.toUpperCase(), p.b.from + ' → ' + p.b.to + (p.b.asleep ? ' · ASLEEP' : '')];
        const x = p.bx + p.w + 6, y = p.by - 26;
        const box = this.measureTag(ctx, lines, x, y, cfg.tagFont, 2, 5, 3);
        if (box[0] < this.insets.left || box[2] > v.W - this.insets.right || box[1] < this.insets.top || box[3] > v.H - this.insets.bottom) continue;
        if (tagBoxes.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
        tagBoxes.push(this.tag(ctx, lines, x, y, cfg.tagFont, '#E8E4F5', '#14101F', 2, 5, 3));
        n++;
      }
    }
    this.canvas.setAttribute('aria-label', this.describe());
  }

  private drawRoute(ctx: CanvasRenderingContext2D, route: { pts: LonLat[]; f: number }, dotGap: number, T: typeof THEMES.light) {
    const v = this.view, cum = routeLengths(route.pts), total = cum[cum.length - 1];
    const steps = Math.min(4000, Math.max(200, Math.round(total / 2)));
    let last: [number, number] | null = null;
    const done: [number, number][] = [], ahead: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const p = this.project(...pointAlong(route.pts, cum, f * total));
      if (p[0] < -20 || p[0] > v.W + 20 || p[1] < -20 || p[1] > v.H + 20) { last = null; continue; }
      const isDone = f <= route.f;
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < (isDone ? dotGap : dotGap * 2)) continue;
      (isDone ? done : ahead).push(p);
      last = p;
    }
    ctx.fillStyle = T.route;
    for (const [x, y] of done) ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.strokeStyle = T.ahead;
    ctx.lineWidth = 2;
    for (const [x, y] of ahead.slice(1)) ctx.strokeRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  }

  private measureTag(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, font: number, border: number, padX: number, padY: number) {
    ctx.font = `${font}px "Press Start 2P"`;
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const lh = Math.round(font * 1.6);
    return [x, y, x + tw + padX * 2 + border * 2, y + lh * lines.length + padY * 2 + border * 2 - (lh - font)];
  }

  private tag(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, font: number, bg: string, fg: string, border: number, padX: number, padY: number) {
    const box = this.measureTag(ctx, lines, x, y, font, border, padX, padY);
    const lh = Math.round(font * 1.6);
    ctx.fillStyle = '#14101F';
    ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(box[0] + border, box[1] + border, box[2] - box[0] - border * 2, box[3] - box[1] - border * 2);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + border + padX, y + border + padY + i * lh));
    return box;
  }

  describe() {
    const p = this.birds.filter(b => b.kind === 'pigeon').length, bt = this.birds.length - p;
    const asleep = this.birds.filter(b => b.asleep).length;
    return `Pixel map, ${this.level === 'close' ? 'close-up' : this.level} view. ${p} pigeons and ${bt} bottles in transit, ${asleep} asleep on the night side.`;
  }

  hit(x: number, y: number): Bird | null {
    let best: Placed | null = null, bd = Infinity;
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.y - y);
      const r = Math.max(14, Math.max(p.w, p.h) / 2 + 6);
      if (d < r && d < bd) { best = p; bd = d; }
    }
    return best ? best.b : null;
  }

  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch0 = 0;
    c.addEventListener('pointerdown', e => {
      try { c.setPointerCapture(e.pointerId); } catch { /* some browsers refuse; dragging still works */ }
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    c.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const nx = e.offsetX, ny = e.offsetY;
      if (pts.size === 1) {
        const S = 256 * Math.pow(2, this.view.z);
        this.view.cx -= (nx - p.x) / S;
        this.view.cy -= (ny - p.y) / S;
        moved += Math.abs(nx - p.x) + Math.abs(ny - p.y);
        this.lastMove = performance.now();
        if (moved >= 6) this.onUserMove();
        this.clampView();
        this.dirtyBase = true;
        this.onViewChange(this.view);
      } else if (pts.size === 2) {
        p.x = nx; p.y = ny;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0 && Math.abs(Math.log2(d / pinch0)) > 0.05) {
          this.zoomBy(Math.log2(d / pinch0), (a.x + b.x) / 2, (a.y + b.y) / 2);
          pinch0 = d;
          this.lastMove = performance.now();
          this.onUserMove();
        }
        moved += 10;
        return;
      }
      p.x = nx; p.y = ny;
    });
    const up = (e: PointerEvent) => {
      if (pts.size === 1 && moved < 6) this.onSelect(this.hit(e.offsetX, e.offsetY));
      pts.delete(e.pointerId);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    c.addEventListener('wheel', e => { e.preventDefault(); this.lastMove = performance.now(); this.onUserMove(); this.zoomBy(-e.deltaY / 400, e.offsetX, e.offsetY); }, { passive: false });
  }
}
