// Local solar time from longitude (not political time zones). Pigeons fly 7:00 to 19:00 solar time.
export const DAY_START = 7, DAY_END = 19;

export function solarHour(lon: number, atMs: number): number {
  const d = new Date(atMs);
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

export function isDaylight(lon: number, atMs: number): boolean {
  const h = solarHour(lon, atMs);
  return h >= DAY_START && h < DAY_END;
}
