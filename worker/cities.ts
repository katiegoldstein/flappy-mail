// The city list on the server: autocomplete, lookups by id, and "nearest city" for
// the sender's location guess and the pigeon's log.
import file from '../public/data/cities.json';
import { City, CityFile, parseCities, cityLabel } from '../shared/cities';
import { distanceMiles, LonLat } from '../shared/geo';

// Parsed once per Worker instance, at startup.
export const CITIES: City[] = parseCities(file as CityFile);
const byId = new Map(CITIES.map(c => [c.id, c]));
export const cityById = (id: number) => byId.get(id);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const keys = CITIES.map(c => [fold(c.name), fold(c.ascii)]);

// Prefix search, biggest cities first (the list is sorted by population). "Portland, US" narrows by country.
export function searchCities(query: string, limit = 8): City[] {
  const [namePart, ccPart] = query.split(',').map(s => fold(s.trim()));
  if (!namePart || namePart.length < 2) return [];
  const out: City[] = [];
  for (let i = 0; i < CITIES.length && out.length < limit; i++) {
    const c = CITIES[i];
    if (ccPart && !fold(c.cc).startsWith(ccPart) && !(ccPart === 'uk' && c.cc === 'GB')) continue;
    if (keys[i][0].startsWith(namePart) || keys[i][1].startsWith(namePart)) out.push(c);
  }
  return out;
}

// Nearest city with at least minPop people. A coarse linear scan is fine for one call per request.
export function nearestCity(p: LonLat, minPop = 0): { city: City; miles: number } | null {
  let best: City | null = null, bestD = Infinity;
  for (const c of CITIES) {
    if (c.pop < minPop) continue;
    if (Math.abs(c.lat - p[1]) > 8) continue;
    const d = distanceMiles(p, [c.lon, c.lat]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { city: best, miles: bestD } : null;
}

export const cityJson = (c: City) => ({ id: c.id, label: cityLabel(c), name: c.name, cc: c.cc, admin1: c.admin1 });

// The sender's likely city: the biggest place within 30 miles (so "San Francisco", not a neighborhood).
export function likelyCity(p: LonLat): City | null {
  let best: City | null = null;
  for (const c of CITIES) { // sorted biggest first, so the first hit wins
    if (Math.abs(c.lat - p[1]) > 0.5) continue;
    if (distanceMiles(p, [c.lon, c.lat]) <= 30) { best = c; break; }
  }
  return best ?? nearestCity(p)?.city ?? null;
}
