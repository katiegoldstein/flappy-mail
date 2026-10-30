// Bottle routing: A* over a 0.5° world-ocean grid (built from Natural Earth by scripts/build-geo.mjs),
// with the Panama and Suez canals and narrow straits open. Bottles launch from the sender's
// nearest coast and wash up on the recipient's nearest coast.
import { OCEAN_BITS, OCEAN_W as W, OCEAN_H as H, OCEAN_PER_DEG as P } from './ocean-grid';
import { LonLat, distanceMiles, gcPoint } from './geo';

let bits: Uint8Array | null = null;
function grid() {
  if (!bits) {
    const bin = atob(OCEAN_BITS);
    bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  }
  return bits;
}
const isSea = (i: number) => (grid()[i >> 3] >> (i & 7)) & 1;
const cellCenter = (i: number): LonLat => [((i % W) + 0.5) / P - 180, 90 - (((i / W) | 0) + 0.5) / P];
const cellOf = ([lon, lat]: LonLat) => {
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) * P)));
  const c = ((Math.floor((lon + 180) * P) % W) + W) % W;
  return r * W + c;
};

// Is this point on the open (navigable) ocean? 0.5° resolution, so only a rough answer near coasts.
export const isSeaAt = (p: LonLat) => isSea(cellOf(p)) === 1;

// Nearest navigable sea cell to a point, searching outward up to maxMiles.
export function nearestSea(p: LonLat, maxMiles = 220): number | null {
  const c0 = cellOf(p), r0 = (c0 / W) | 0, col0 = c0 % W;
  let best: number | null = null, bestD = Infinity;
  const reach = Math.ceil((maxMiles / 69) * P) + 1;
  for (let ring = 0; ring <= reach; ring++) {
    for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring * 2; dc <= ring * 2; dc++) {
      if (Math.max(Math.abs(dr), Math.ceil(Math.abs(dc) / 2)) !== ring) continue;
      const r = r0 + dr; if (r < 0 || r >= H) continue;
      const i = r * W + (((col0 + dc) % W) + W) % W;
      if (!isSea(i)) continue;
      const d = distanceMiles(p, cellCenter(i));
      if (d < bestD && d <= maxMiles) { bestD = d; best = i; }
    }
    if (best !== null && ring >= 2) break;
  }
  return best;
}

// Binary min-heap keyed by f-score.
class Heap {
  k: number[] = []; v: number[] = [];
  push(key: number, val: number) {
    const { k, v } = this; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const { k, v } = this; const top = v[0]; const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= k.length) break; if (c + 1 < k.length && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  get size() { return this.k.length; }
}

// Slightly greedy A*: a touch less than the shortest route, several times faster (Workers have tight CPU limits).
const HEURISTIC_WEIGHT = 1.4;
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function astar(from: number, to: number): number[] | null {
  const N = W * H;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const goal = cellCenter(to);
  const heap = new Heap();
  g[from] = 0;
  heap.push(distanceMiles(cellCenter(from), goal), from);
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    if (i === to) break;
    closed[i] = 1;
    const r = (i / W) | 0, c = i % W, here = cellCenter(i);
    for (const [dr, dc] of DIRS) {
      const rr = r + dr; if (rr < 0 || rr >= H) continue;
      const j = rr * W + (((c + dc) % W) + W) % W;
      if (closed[j] || !isSea(j)) continue;
      // no squeezing diagonally between two land corners
      if (dr && dc && (!isSea(r * W + (((c + dc) % W) + W) % W) && !isSea(rr * W + c))) continue;
      const ng = g[i] + distanceMiles(here, cellCenter(j));
      if (ng < g[j]) { g[j] = ng; came[j] = i; heap.push(ng + HEURISTIC_WEIGHT * distanceMiles(cellCenter(j), goal), j); }
    }
  }
  if (came[to] < 0 && from !== to) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(came[path[path.length - 1]]);
  return path.reverse();
}

// Does the great-circle hop between two sea points stay on water? (sampled every ~10 miles)
function clearLine(a: LonLat, b: LonLat): boolean {
  const n = Math.max(2, Math.ceil(distanceMiles(a, b) / 10));
  for (let k = 1; k < n; k++) if (!isSea(cellOf(gcPoint(a, b, k / n)))) return false;
  return true;
}

export type SeaRoute = { route: LonLat[]; miles: number };

export function seaRoute(from: LonLat, to: LonLat): SeaRoute | null {
  const s = nearestSea(from), t = nearestSea(to);
  if (s === null || t === null) return null;
  const cells = astar(s, t);
  if (!cells) return null;
  // String-pull the grid path into a few long straight legs.
  const pts = cells.map(cellCenter);
  const out: LonLat[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  const route = out.map(([lon, lat]) => [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100] as LonLat);
  let miles = 0;
  for (let k = 1; k < route.length; k++) miles += distanceMiles(route[k - 1], route[k]);
  return { route, miles };
}
