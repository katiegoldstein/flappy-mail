// The bundled city list (GeoNames cities15000, CC-BY 4.0) with a precomputed coastal flag.
import type { LonLat } from './geo';
import { seaRoute } from './sea-route';

export type City = { id: number; name: string; ascii: string; cc: string; admin1: string; lat: number; lon: number; pop: number; coastal: boolean };
export type CityFile = { fields: string[]; rows: (string | number)[][] };

export function parseCities(file: CityFile): City[] {
  return file.rows.map(([id, name, ascii, cc, admin1, lat, lon, pop, coastal]) => ({
    id: id as number, name: name as string, ascii: (ascii || name) as string, cc: cc as string, admin1: admin1 as string,
    lat: lat as number, lon: lon as number, pop: pop as number, coastal: coastal === 1,
  }));
}

export const lonlat = (c: City): LonLat => [c.lon, c.lat];
// GeoNames uses ISO codes; people say UK, not GB.
export const countryLabel = (cc: string) => (cc === 'GB' ? 'UK' : cc);
export const cityLabel = (c: City) => `${c.name}, ${countryLabel(c.cc)}`;

// The bottle easter egg: both cities within 50 km of the world ocean, and a sea route between them.
export function bottleAvailable(a: City, b: City): boolean {
  return a.id !== b.id && a.coastal && b.coastal && seaRoute(lonlat(a), lonlat(b)) !== null;
}
