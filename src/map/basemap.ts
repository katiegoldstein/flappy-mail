// Pixel basemap: rasterizes Natural Earth country shapes (world-atlas) onto an 8px grid
// in Web Mercator for any center and zoom, like the mockups' gen.mjs, but live in the browser.
import { feature, neighbors } from 'topojson-client';
import url110 from 'world-atlas/countries-110m.json?url';
import url50 from 'world-atlas/countries-50m.json?url';

export const CELL = 8;
const MAX_LAT = 85.0511;

export const mx = (lon: number) => (lon + 180) / 360;
export const my = (lat: number) => {
  const p = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / Math.PI) / 2;
};
export const lonOf = (x: number) => x * 360 - 180;
export const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

type Country = { key: string; rings: Float64Array[]; x0: number; x1: number; y0: number; y1: number };
type Layer = { countries: Country[]; index: number[] }; // index: country position -> global country number

export type View = { cx: number; cy: number; z: number; W: number; H: number }; // cx, cy normalized mercator

export type Raster = {
  col0: number; row0: number; cols: number; rows: number; S: number;
  ids: Int16Array; // global country number per cell, -1 for sea
};

let keys: string[] = [];
let colorOfKey: number[] = []; // 0..6 land color per global country
const layers: Record<'lo' | 'hi', Layer | null> = { lo: null, hi: null };

function buildLayer(topo: any): Layer {
  const fc = feature(topo, topo.objects.countries) as any;
  const countries: Country[] = [];
  const index: number[] = [];
  for (const f of fc.features) {
    const key = String(f.id ?? f.properties?.name);
    let k = keys.indexOf(key);
    if (k < 0) { k = keys.length; keys.push(key); }
    // Antarctica stays in the list (so indexes match the topology) but isn't drawn:
    // no letters go there, and it would eat half a phone screen.
    const polys = f.id === '010' ? [] : f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const rings: Float64Array[] = [];
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const poly of polys) for (const ring of poly) {
      // Unwrap longitudes so rings that cross the antimeridian stay continuous (x may leave 0..1).
      const pts: number[] = [];
      let prev = NaN, off = 0;
      for (const p of ring as number[][]) {
        let x = mx(p[0]);
        if (!isNaN(prev)) { if (x + off - prev > 0.5) off -= 1; else if (x + off - prev < -0.5) off += 1; }
        x += off;
        prev = x;
        pts.push(x, my(p[1]));
      }
      // A ring that wraps the whole globe (Antarctica) closes around the pole.
      const drift = pts[pts.length - 2] - pts[0];
      if (Math.abs(drift) > 0.5) {
        const pole = pts[1] > 0.5 ? 1 : 0;
        pts.push(pts[pts.length - 2], pole, pts[0], pole, pts[0], pts[1]);
      }
      const a = Float64Array.from(pts);
      for (let i = 0; i < a.length; i += 2) {
        const x = a[i], y = a[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      rings.push(a);
    }
    countries.push({ key, rings, x0, x1, y0, y1 });
    index.push(k);
  }
  return { countries, index };
}

// Neighbouring countries get different colors (greedy graph coloring over the 50m topology).
function colorCountries(topo: any, layer: Layer) {
  const nb = neighbors(topo.objects.countries.geometries) as number[][];
  const order = layer.countries.map((_, i) => i).sort((a, b) => nb[b].length - nb[a].length);
  const col: number[] = new Array(layer.countries.length).fill(-1);
  for (const i of order) {
    const taken = new Set(nb[i].map(j => col[j]));
    let hsh = 0;
    for (const ch of layer.countries[i].key) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    let c = hsh % 7;
    for (let t = 0; t < 7 && taken.has(c); t++) c = (c + 1) % 7;
    col[i] = c;
  }
  layer.countries.forEach((_, i) => { colorOfKey[layer.index[i]] = col[i]; });
}

let loading: Promise<void> | null = null;
export function loadBasemap(): Promise<void> {
  if (!loading) loading = (async () => {
    const [t110, t50] = await Promise.all([fetch(url110).then(r => r.json()), fetch(url50).then(r => r.json())]);
    layers.hi = buildLayer(t50);
    colorCountries(t50, layers.hi);
    layers.lo = buildLayer(t110);
    layers.lo.index.forEach(k => { if (colorOfKey[k] === undefined) colorOfKey[k] = k % 7; });
  })();
  return loading;
}

export const landColorIndex = (id: number) => colorOfKey[id] ?? 0;

// Scanline fill at cell centers, even-odd across all rings of a country. Wraps around the antimeridian.
export function rasterize(v: View): Raster {
  const layer = (v.z < 4 ? layers.lo : layers.hi)!;
  const S = 256 * Math.pow(2, v.z);
  const X0 = v.cx * S - v.W / 2, Y0 = v.cy * S - v.H / 2;
  const col0 = Math.floor(X0 / CELL), row0 = Math.floor(Y0 / CELL);
  const cols = Math.ceil((X0 + v.W) / CELL) - col0 + 1, rows = Math.ceil((Y0 + v.H) / CELL) - row0 + 1;
  const ids = new Int16Array(cols * rows).fill(-1);
  const k = S / CELL; // cells per normalized unit
  const vx0 = col0 / k, vx1 = (col0 + cols) / k, vy0 = row0 / k, vy1 = (row0 + rows) / k;
  const xs: number[] = [];
  layer.countries.forEach((c, ci) => {
    if (c.y1 < vy0 || c.y0 > vy1) return;
    const id = layer.index[ci];
    for (let shift = -2; shift <= 1; shift++) {
      if (c.x1 + shift < vx0 || c.x0 + shift > vx1) continue;
      const rA = Math.max(0, Math.floor(c.y0 * k - 0.5 - row0)), rB = Math.min(rows - 1, Math.ceil(c.y1 * k - 0.5 - row0));
      for (let r = rA; r <= rB; r++) {
        const y = (row0 + r + 0.5) / k;
        xs.length = 0;
        for (const ring of c.rings) {
          const n = ring.length;
          for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
            const ax = ring[j], ay = ring[j + 1], bx = ring[i], by = ring[i + 1];
            if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax) + shift);
          }
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        const base = r * cols;
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const cA = Math.max(0, Math.ceil(xs[q] * k - 0.5 - col0)), cB = Math.min(cols - 1, Math.ceil(xs[q + 1] * k - 0.5 - col0) - 1);
          for (let cc = cA; cc <= cB; cc++) ids[base + cc] = id;
        }
      }
    }
  });
  return { col0, row0, cols, rows, S, ids };
}

export function cellAt(R: Raster, wx: number, wy: number): number {
  const c = Math.floor(wx / CELL) - R.col0, r = Math.floor(wy / CELL) - R.row0;
  if (c < 0 || r < 0 || c >= R.cols || r >= R.rows) return -1;
  return R.ids[r * R.cols + c];
}
