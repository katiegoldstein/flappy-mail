// Client-side city search over the bundled GeoNames list (used by compose in step 3, and the dev planner).
import { City, CityFile, parseCities, cityLabel } from '../shared/cities';

let cities: Promise<City[]> | null = null;
export function loadCities(): Promise<City[]> {
  if (!cities) cities = fetch('/data/cities.json').then(r => r.json() as Promise<CityFile>).then(parseCities);
  return cities;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Prefix match on the name, biggest cities first. "Portland, US" narrows by country.
export function searchCities(all: City[], query: string, limit = 8): City[] {
  const [namePart, ccPart] = query.split(',').map(s => fold(s.trim()));
  if (!namePart || namePart.length < 2) return [];
  const out: City[] = [];
  for (const c of all) { // already sorted by population
    if (ccPart && !fold(c.cc).startsWith(ccPart) && !(ccPart === 'uk' && c.cc === 'GB')) continue;
    if (fold(c.name).startsWith(namePart) || fold(c.ascii).startsWith(namePart)) { out.push(c); if (out.length >= limit) break; }
  }
  return out;
}

export function findCity(all: City[], label: string): City | undefined {
  const l = fold(label.trim());
  return all.find(c => fold(cityLabel(c)) === l) ?? searchCities(all, label, 1)[0];
}
