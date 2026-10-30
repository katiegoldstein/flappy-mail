// Spherical geometry shared by the map, the compose page and the server.
export type LonLat = [number, number];

export const EARTH_MILES = 3958.8;
const RAD = Math.PI / 180;

export function distanceMiles(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD, dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Point a fraction f of the way along the great circle from a to b.
export function gcPoint(a: LonLat, b: LonLat, f: number): LonLat {
  const [l1, p1, l2, p2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD];
  const v1 = [Math.cos(p1) * Math.cos(l1), Math.cos(p1) * Math.sin(l1), Math.sin(p1)];
  const v2 = [Math.cos(p2) * Math.cos(l2), Math.cos(p2) * Math.sin(l2), Math.sin(p2)];
  const d = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])));
  if (d < 1e-12) return [a[0], a[1]];
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * v1[0] + B * v2[0], y = A * v1[1] + B * v2[1], z = A * v1[2] + B * v2[2];
  return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
}

// A route is a polyline whose legs are great circles. A pigeon's route has two points.
export function routeLengths(route: LonLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + distanceMiles(route[i - 1], route[i]));
  return cum;
}

export function pointAlong(route: LonLat[], cum: number[], miles: number): LonLat {
  const total = cum[cum.length - 1];
  if (miles <= 0) return route[0];
  if (miles >= total) return route[route.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= miles) lo = mid; else hi = mid; }
  const leg = cum[hi] - cum[lo];
  return gcPoint(route[lo], route[hi], leg > 0 ? (miles - cum[lo]) / leg : 0);
}
