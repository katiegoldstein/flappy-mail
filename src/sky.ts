// Page helpers around the shared solar-time rule (shared/sun.ts), which the server uses too.
import { DAY_START, DAY_END, solarHour as solarAt, isDaylight } from '../shared/sun';
export { DAY_START, DAY_END };

export const solarHour = (lon: number, at: Date) => solarAt(lon, at.getTime());
export const isNightAt = (lon: number, at: Date) => !isDaylight(lon, at.getTime());

export function clock(h: number): string {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

// Wall-clock hour at a place, for display (the sky still follows sun time). There's no time-zone
// table, so: the zone is longitude / 15. A place in this device's own zone shows this device's clock
// exactly; elsewhere, this device's daylight saving is applied only to places on its side of the equator.
export function clockHourAt(lon: number, lat: number, at: Date): number {
  const jan = new Date(at.getFullYear(), 0, 1).getTimezoneOffset(), jul = new Date(at.getFullYear(), 6, 1).getTimezoneOffset();
  const std = -Math.max(jan, jul) / 60, zone = Math.round(lon / 15);
  if (zone === std) return at.getHours() + at.getMinutes() / 60;
  const dstNow = (Math.max(jan, jul) - at.getTimezoneOffset()) / 60;
  const sameSide = jul < jan ? lat > 25 : lat < -25;
  const h = at.getUTCHours() + at.getUTCMinutes() / 60 + zone + (dstNow > 0 && sameSide ? dstNow : 0);
  return ((h % 24) + 24) % 24;
}

export type SkyKind = 'day' | 'dusk' | 'night';
export function skyFor(h: number): SkyKind {
  if (h >= 8 && h < 17.5) return 'day';
  if ((h >= 5.5 && h < 8) || (h >= 17.5 && h < 20.5)) return 'dusk';
  return 'night';
}

// Rough remaining time for a pigeon: 50 mph while it's daylight where it is, asleep otherwise.
// Step 2 replaces this with the stored segment plan and the shared position function.
export function hoursToLand(milesLeft: number, solarNow: number): number {
  let t = 0, h = solarNow, left = milesLeft;
  while (left > 0 && t < 24 * 400) {
    const day = h >= DAY_START && h < DAY_END;
    const step = 1 / 6; // 10-minute steps, like the real plan
    if (day) left -= 50 * step;
    t += step;
    h = (h + step) % 24;
  }
  return t;
}

export function durationLabel(hours: number, style: 'hud' | 'words' = 'hud'): string {
  const d = Math.floor(hours / 24), hh = Math.floor(hours % 24), mm = Math.round((hours * 60) % 60);
  if (style === 'words') return d ? `${d} day${d === 1 ? '' : 's'}, ${hh} hour${hh === 1 ? '' : 's'}` : `${hh} hour${hh === 1 ? '' : 's'}, ${mm} min`;
  if (d) return `${d}D ${hh}H`;
  return `${hh}H ${String(mm).padStart(2, '0')}M`;
}
