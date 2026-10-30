// Build-time geography for the travel engine:
//  1. rasterize Natural Earth land (world-atlas land-10m, public domain) onto a 0.1° grid,
//  2. keep only the world ocean (flood fill from the Pacific, so lakes and the Caspian don't count),
//  3. flag every GeoNames city within 50 km of that ocean as coastal,
//  4. write a coarse 0.5° sea-routing grid for bottles, with canals and narrow straits forced open.
// Outputs: public/data/cities.json and shared/ocean-grid.ts. Run: node scripts/build-geo.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

// ---------- 1. land raster, 0.1° ----------
const F = 10; // cells per degree
const FW = 360 * F, FH = 180 * F;
const land = new Uint8Array(FW * FH);
const topo = require('world-atlas/land-10m.json');
const geom = feature(topo, topo.objects.land);
const polys = geom.features ? geom.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
  : geom.geometry.type === 'Polygon' ? [geom.geometry.coordinates] : geom.geometry.coordinates;

for (const poly of polys) {
  const rings = poly.map(ring => {
    // unwrap longitudes so rings crossing the antimeridian stay continuous
    const pts = [];
    let prev = NaN, off = 0;
    for (const [lon, lat] of ring) {
      let x = lon;
      if (!isNaN(prev)) { if (x + off - prev > 180) off -= 360; else if (x + off - prev < -180) off += 360; }
      x += off; prev = x; pts.push([x, lat]);
    }
    const drift = pts[pts.length - 1][0] - pts[0][0];
    if (Math.abs(drift) > 180) { const pole = pts[0][1] < 0 ? -90 : 90; pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole], pts[0]); }
    return pts;
  });
  let y0 = 90, y1 = -90;
  for (const r of rings) for (const [, lat] of r) { if (lat < y0) y0 = lat; if (lat > y1) y1 = lat; }
  const rA = Math.max(0, Math.floor((90 - y1) * F)), rB = Math.min(FH - 1, Math.ceil((90 - y0) * F));
  const xs = [];
  for (let r = rA; r <= rB; r++) {
    const lat = 90 - (r + 0.5) / F;
    xs.length = 0;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      if ((ay > lat) !== (by > lat)) xs.push(ax + ((lat - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const cA = Math.ceil((xs[q] + 180) * F - 0.5), cB = Math.ceil((xs[q + 1] + 180) * F - 0.5) - 1;
      for (let c = cA; c <= cB; c++) land[r * FW + (((c % FW) + FW) % FW)] = 1;
    }
  }
}

// Canals and straits too narrow for the grids. [lon, lat] polylines.
const CHANNELS = {
  panama: [[-80.0, 9.6], [-79.9, 9.3], [-79.6, 9.0], [-79.5, 8.6]],
  suez: [[32.3, 31.6], [32.3, 31.2], [32.35, 30.5], [32.55, 29.9], [32.6, 29.6], [33.0, 28.9], [33.6, 27.9], [34.0, 27.4]],
  gibraltar: [[-6.4, 35.9], [-5.6, 35.95], [-4.8, 36.1]],
  bosporus: [[25.8, 39.9], [26.4, 40.2], [26.7, 40.45], [27.6, 40.7], [28.9, 40.95], [29.05, 41.2], [29.15, 41.6]],
  dover: [[0.8, 50.4], [1.5, 51.0], [2.2, 51.4]],
  oresund: [[12.8, 55.2], [12.65, 55.7], [12.6, 56.2]],
  singapore: [[103.3, 1.2], [103.8, 1.2], [104.5, 1.35]],
  hormuz: [[55.8, 25.9], [56.4, 26.5], [56.8, 26.8]],
  babElMandeb: [[43.0, 12.2], [43.4, 12.6], [43.6, 13.0]],
};
function stampLines(setCell, step) {
  for (const line of Object.values(CHANNELS)) for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step) * 2 + 1;
    for (let k = 0; k <= n; k++) setCell(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
  }
}
stampLines((lon, lat) => { const r = Math.floor((90 - lat) * F), c = Math.floor((lon + 180) * F); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) land[(r + dr) * FW + c + dc] = 0; }, 0.1);

// ---------- 2. world ocean only ----------
function flood(isWater, W, H, seedLon, seedLat, per) {
  const out = new Uint8Array(W * H);
  const start = Math.floor((90 - seedLat) * per) * W + Math.floor((seedLon + 180) * per);
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop(), r = (i / W) | 0, c = i % W;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr; if (rr < 0 || rr >= H) continue;
      const j = rr * W + (((c + dc) % W) + W) % W;
      if (!out[j] && isWater(j)) { out[j] = 1; stack.push(j); }
    }
  }
  return out;
}
const ocean = flood(i => !land[i], FW, FH, -150, 0, F);

// ---------- 3. cities ----------
const admin1 = new Map();
for (const line of fs.readFileSync(new URL('data/raw/admin1CodesASCII.txt', root), 'utf8').split('\n')) {
  const p = line.split('\t'); if (p.length > 2) admin1.set(p[0], p[2]);
}
const R = 6371;
const hav = (lat1, lon1, lat2, lon2) => {
  const t = Math.PI / 180, dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
function nearOcean(lat, lon, km) {
  const dr = Math.ceil((km / 111) * F) + 1, dc = Math.ceil((km / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)))) * F) + 1;
  const r0 = Math.floor((90 - lat) * F), c0 = Math.floor((lon + 180) * F);
  for (let r = Math.max(0, r0 - dr); r <= Math.min(FH - 1, r0 + dr); r++) for (let c = c0 - Math.min(dc, FW / 2); c <= c0 + Math.min(dc, FW / 2); c++) {
    const cc = ((c % FW) + FW) % FW;
    if (ocean[r * FW + cc] && hav(lat, lon, 90 - (r + 0.5) / F, (cc + 0.5) / F - 180) <= km) return true;
  }
  return false;
}
const rows = [];
for (const line of fs.readFileSync(new URL('data/raw/cities15000.txt', root), 'utf8').split('\n')) {
  const p = line.split('\t');
  if (p.length < 15) continue;
  const lat = +p[4], lon = +p[5];
  rows.push([+p[0], p[1], p[2] !== p[1] ? p[2] : 0, p[8], admin1.get(p[8] + '.' + p[10]) ?? '', Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, +p[14], nearOcean(lat, lon, 50) ? 1 : 0]);
}
rows.sort((a, b) => b[7] - a[7]); // biggest first, so autocomplete ranks them first
fs.mkdirSync(new URL('public/data/', root), { recursive: true });
fs.writeFileSync(new URL('public/data/cities.json', root), JSON.stringify({ fields: ['id', 'name', 'ascii', 'cc', 'admin1', 'lat', 'lon', 'pop', 'coastal'], rows }));

// ---------- 4. coarse sea-routing grid, 0.5° ----------
const C = 2; // cells per degree
const CW = 360 * C, CH = 180 * C, k = F / C;
const coarse = new Uint8Array(CW * CH);
for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
  let n = 0;
  for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) n += ocean[(r * k + y) * FW + c * k + x];
  coarse[r * CW + c] = n >= (k * k) / 2 ? 1 : 0;
}
// two cells wide, so diagonal steps along a channel stay 4-connected
stampLines((lon, lat) => { const i = Math.floor((90 - lat) * C) * CW + Math.floor((lon + 180) * C); coarse[i] = 1; coarse[i + 1] = 1; }, 0.25);
const sea = flood(i => coarse[i] === 1, CW, CH, -150, 0, C);
const bits = new Uint8Array(Math.ceil((CW * CH) / 8));
let seaCells = 0;
for (let i = 0; i < CW * CH; i++) if (sea[i]) { bits[i >> 3] |= 1 << (i & 7); seaCells++; }
fs.writeFileSync(new URL('shared/ocean-grid.ts', root),
  `// Generated by scripts/build-geo.mjs from Natural Earth land (public domain). Do not edit.\n` +
  `// ${CW}x${CH} cells at ${1 / C}°, row 0 at 90°N, column 0 at 180°W. Bit set = navigable world ocean.\n` +
  `export const OCEAN_W = ${CW}, OCEAN_H = ${CH}, OCEAN_PER_DEG = ${C};\n` +
  `export const OCEAN_BITS = '${Buffer.from(bits).toString('base64')}';\n`);

const find = n => rows.find(r => r[1] === n || r[2] === n);
console.log('cities', rows.length, 'coastal', rows.filter(r => r[8]).length, 'sea cells', seaCells);
for (const n of ['San Francisco', 'London', 'Tokyo', 'Denver', 'Los Angeles', 'New York City', 'Chicago', 'Lisbon', 'Paris', 'Istanbul', 'Odesa', 'Baku'])
  { const r = find(n); console.log(n.padEnd(14), r ? (r[8] ? 'coastal' : '-') : 'missing'); }
