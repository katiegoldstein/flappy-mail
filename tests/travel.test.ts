import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseCities, lonlat, bottleAvailable, City } from '../shared/cities';
import { pigeonPlan, bottlePlan, positionAt, rollLoss, Plan } from '../shared/travel';
import { solarHour } from '../shared/sun';
import { distanceMiles, routeLengths, pointAlong, LonLat } from '../shared/geo';

const cities = parseCities(JSON.parse(fs.readFileSync(new URL('../public/data/cities.json', import.meta.url), 'utf8')));
const city = (name: string, cc: string) => {
  const c = cities.find(x => (x.name === name || x.ascii === name) && x.cc === cc);
  if (!c) throw new Error('no city ' + name);
  return c;
};
const SF = city('San Francisco', 'US'), NYC = city('New York City', 'US'), LDN = city('London', 'GB');
const LA = city('Los Angeles', 'US'), TOKYO = city('Tokyo', 'JP'), DENVER = city('Denver', 'US');

const DAY = 86_400_000;
const days = (p: Plan) => (p.arrivesAt - p.departedAt) / DAY;
// Departures spread across the whole day, so the estimate holds whenever someone sends.
const departures = Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 9, 26, i * 3, 17));

function checkPigeon(a: City, b: City, min: number, max: number) {
  for (const t of departures) {
    const plan = pigeonPlan(lonlat(a), lonlat(b), t);
    expect(days(plan)).toBeGreaterThanOrEqual(min);
    expect(days(plan)).toBeLessThanOrEqual(max);
    const cum = routeLengths(plan.route);
    for (const s of plan.segments) {
      // every flying stretch starts in daylight where the pigeon is; every nap starts at night
      const here = pointAlong(plan.route, cum, s.f0 * plan.miles);
      const h = solarHour(here[0], s.t0);
      if (s.state === 'flying') expect(h >= 7 && h < 19).toBe(true);
      else { expect(h >= 19 || h < 7).toBe(true); expect(s.f1).toBe(s.f0); }
    }
    expect(plan.segments.some(s => s.state === 'sleeping')).toBe(true);
  }
}

describe('pigeons', () => {
  it('SF to NYC takes about 4 to 5 days', () => checkPigeon(SF, NYC, 4, 5));
  it('SF to London takes about 9 days', () => checkPigeon(SF, LDN, 8.4, 9.6));

  it('a letter across town flies a short loop and lands back in the same city', () => {
    const noon = Date.UTC(2026, 9, 26, 20); // midday in SF
    const p = pigeonPlan(lonlat(SF), lonlat(SF), noon);
    expect(p.miles).toBeGreaterThan(2);
    expect(p.miles).toBeLessThan(6); // out about 2.5 miles and back
    expect((p.arrivesAt - noon) / 60_000).toBeLessThan(10);
    const end = positionAt(p, p.arrivesAt + 1);
    expect(distanceMiles(end.lonlat, lonlat(SF))).toBeLessThan(0.1);
  });

  it('flies about 600 miles a day', () => {
    const plan = pigeonPlan(lonlat(SF), lonlat(NYC), departures[0]);
    const flyingHours = plan.segments.filter(s => s.state === 'flying').reduce((n, s) => n + (s.t1 - s.t0), 0) / 3_600_000;
    expect(plan.miles / flyingHours).toBeCloseTo(50, 1);
  });

  it('is visibly asleep at night and lands at the end', () => {
    const plan = pigeonPlan(lonlat(SF), lonlat(NYC), Date.UTC(2026, 9, 26, 17, 0)); // 9am in SF
    const nap = plan.segments.find(s => s.state === 'sleeping')!;
    const p = positionAt(plan, (nap.t0 + nap.t1) / 2);
    expect(p.state).toBe('sleeping');
    expect(positionAt(plan, nap.t0 + 1).lonlat).toEqual(positionAt(plan, nap.t1 - 1).lonlat);
    expect(positionAt(plan, plan.departedAt).f).toBe(0);
    const end = positionAt(plan, plan.arrivesAt + 1);
    expect(end.state).toBe('landed');
    expect(distanceMiles(end.lonlat, lonlat(NYC))).toBeLessThan(0.5);
  });

  it('time warp squeezes the same trip into seconds', () => {
    const real = pigeonPlan(lonlat(SF), lonlat(NYC), departures[0]);
    const fast = pigeonPlan(lonlat(SF), lonlat(NYC), departures[0], { warp: 3600 });
    expect((fast.arrivesAt - fast.departedAt) * 3600).toBeCloseTo(real.arrivesAt - real.departedAt, -2);
    expect(fast.segments.length).toBe(real.segments.length);
  });
});

describe('bottles', () => {
  it('SF to LA by bottle takes about a week', () => {
    const plan = bottlePlan(lonlat(SF), lonlat(LA), departures[0])!;
    expect(plan).not.toBeNull();
    expect(days(plan)).toBeGreaterThan(5);
    expect(days(plan)).toBeLessThan(10);
    expect(plan.segments.every(s => s.state === 'drifting')).toBe(true);
  });

  it('SF to NYC by bottle goes through the Panama Canal', () => {
    const plan = bottlePlan(lonlat(SF), lonlat(NYC), departures[0])!;
    expect(plan).not.toBeNull();
    const canal: LonLat = [-79.7, 9.1];
    const cum = routeLengths(plan.route);
    let closest = Infinity;
    for (let m = 0; m <= plan.miles; m += 5) closest = Math.min(closest, distanceMiles(pointAlong(plan.route, cum, m), canal));
    expect(closest).toBeLessThan(40);
    // around 6,000 sea miles at 2 mph: a few months, not the 10,000+ miles around Cape Horn
    expect(plan.miles).toBeGreaterThan(5000);
    expect(plan.miles).toBeLessThan(7500);
  });

  it('only washes in when both cities share a coastline', () => {
    expect(bottleAvailable(SF, DENVER)).toBe(false);
    expect(bottleAvailable(SF, LDN)).toBe(false);
    expect(bottleAvailable(SF, TOKYO)).toBe(true);
    expect(bottleAvailable(SF, LA)).toBe(true);
  });

  it('SF to Tokyo takes a few months', () => {
    const plan = bottlePlan(lonlat(SF), lonlat(TOKYO), departures[0])!;
    expect(days(plan)).toBeGreaterThan(90);
    expect(days(plan)).toBeLessThan(150);
  });
});

describe('the 16% loss', () => {
  const plan = pigeonPlan(lonlat(SF), lonlat(NYC), departures[0]);

  it('loses about 16% of letters, at a random point 15–85% of the way', () => {
    let lost = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = rollLoss(plan);
      if (!r.lost) { expect(r.lostAt).toBeNull(); continue; }
      lost++;
      const k = (r.lostAt! - plan.departedAt) / (plan.arrivesAt - plan.departedAt);
      expect(k).toBeGreaterThanOrEqual(0.15);
      expect(k).toBeLessThanOrEqual(0.85);
      expect(['storm', 'sandwich', 'flock', 'dodo']).toContain(r.reason);
    }
    expect(lost / n).toBeGreaterThan(0.145);
    expect(lost / n).toBeLessThan(0.175);
  });

  it('can be forced in dev, and bottles get bottle reasons', () => {
    const b = bottlePlan(lonlat(SF), lonlat(LA), departures[0])!;
    const r = rollLoss(b, { force: true });
    expect(r.lost).toBe(true);
    expect(['whale', 'net', 'sink']).toContain(r.reason);
  });
});
