// The travel engine. The whole trip is computed once, at send time, and stored.
// The map, the compose page and the server all derive position and state from the
// stored plan with positionAt(), so nothing runs during the trip except the email scheduler.
import { LonLat, routeLengths, pointAlong } from './geo';
import { isDaylight } from './sun';
import { seaRoute } from './sea-route';

export type Carrier = 'pigeon' | 'bottle';
export type State = 'flying' | 'sleeping' | 'drifting';
// t0/t1 are epoch ms; f0/f1 are fractions of the route's length.
export type Segment = { t0: number; t1: number; f0: number; f1: number; state: State };
export type Plan = {
  carrier: Carrier;
  route: LonLat[]; // great-circle legs; a pigeon's route is [origin, destination] (or a loop for a same-city letter)
  miles: number;
  departedAt: number;
  arrivesAt: number;
  segments: Segment[];
};

export const PIGEON_MPH = 50;
export const BOTTLE_MPH = 2;
const STEP_MS = 10 * 60 * 1000; // plans are built in 10-minute steps

// Dev-only time warp: `warp` = 3600 turns one trip-hour into one real second.
// Callers must pass 1 in production (enforced where the server reads its config).
export type PlanOpts = { warp?: number };

function squash(segments: Segment[], departedAt: number, warp: number) {
  if (warp === 1) return segments;
  const w = (t: number) => departedAt + (t - departedAt) / warp;
  return segments.map(s => ({ ...s, t0: w(s.t0), t1: w(s.t1) }));
}

// A letter across town (same city on both ends) still gets a real flight: a short loop out and back.
export const TOWN_LOOP_MILES = 2.5; // how far out the loop goes; the trip is about twice this
export function townLoop(at: LonLat): LonLat[] {
  const dLat = TOWN_LOOP_MILES / 69.05; // miles per degree of latitude
  return [at, [at[0] + dLat * 0.7 / Math.max(0.2, Math.cos(at[1] * Math.PI / 180)), at[1] + dLat * 0.7], at];
}

export function pigeonPlan(from: LonLat, to: LonLat, departedAt: number, opts: PlanOpts = {}): Plan {
  const same = Math.abs(from[0] - to[0]) < 1e-6 && Math.abs(from[1] - to[1]) < 1e-6;
  const route: LonLat[] = same ? townLoop(from) : [from, to];
  const cum = routeLengths(route);
  const miles = cum[cum.length - 1];
  const segments: Segment[] = [];
  let t = departedAt, flown = 0;
  const stepMiles = (PIGEON_MPH * STEP_MS) / 3_600_000;
  while (flown < miles) {
    const here = pointAlong(route, cum, flown);
    const flying = isDaylight(here[0], t);
    let dt = STEP_MS, f0 = flown / miles;
    if (flying) {
      const go = Math.min(stepMiles, miles - flown);
      dt = (go / PIGEON_MPH) * 3_600_000;
      flown += go;
    }
    const state: State = flying ? 'flying' : 'sleeping';
    const last = segments[segments.length - 1];
    if (last && last.state === state) { last.t1 = t + dt; last.f1 = flown / miles; }
    else segments.push({ t0: t, t1: t + dt, f0, f1: flown / miles, state });
    t += dt;
  }
  const warp = opts.warp ?? 1;
  const segs = squash(segments, departedAt, warp);
  return { carrier: 'pigeon', route, miles, departedAt, arrivesAt: segs[segs.length - 1]?.t1 ?? departedAt, segments: segs };
}

// Bottles drift at 2 mph day and night over water only. Returns null when there's no sea route.
export function bottlePlan(from: LonLat, to: LonLat, departedAt: number, opts: PlanOpts = {}): Plan | null {
  const sea = seaRoute(from, to);
  return sea ? bottlePlanAlong(sea.route, sea.miles, departedAt, opts) : null;
}

// Same, for a sea route that was already worked out (the server caches them).
export function bottlePlanAlong(route: LonLat[], miles: number, departedAt: number, opts: PlanOpts = {}): Plan {
  const dur = (miles / BOTTLE_MPH) * 3_600_000;
  const segs = squash([{ t0: departedAt, t1: departedAt + dur, f0: 0, f1: 1, state: 'drifting' }], departedAt, opts.warp ?? 1);
  return { carrier: 'bottle', route, miles, departedAt, arrivesAt: segs[0].t1, segments: segs };
}

export type Position = {
  lonlat: LonLat;
  heading: LonLat; // a point slightly further along the route, for facing direction
  f: number; // fraction of the route covered
  state: State | 'landed';
  milesLeft: number;
};

// The one position function the map and the server share.
export function positionAt(plan: Plan, now: number, cum = routeLengths(plan.route)): Position {
  let f: number, state: Position['state'];
  if (now >= plan.arrivesAt) { f = 1; state = 'landed'; }
  else if (now <= plan.departedAt) { f = 0; state = plan.segments[0]?.state ?? 'flying'; }
  else {
    let lo = 0, hi = plan.segments.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (plan.segments[mid].t1 <= now) lo = mid + 1; else hi = mid; }
    const s = plan.segments[lo];
    // clamped, so a plan that only covers a window around now (the public map) never overshoots
    const k = s.t1 > s.t0 ? Math.min(1, Math.max(0, (now - s.t0) / (s.t1 - s.t0))) : 1;
    f = s.f0 + (s.f1 - s.f0) * k;
    state = s.state;
  }
  const total = cum[cum.length - 1];
  return {
    lonlat: pointAlong(plan.route, cum, f * total),
    heading: pointAlong(plan.route, cum, Math.min(total, f * total + Math.max(1, total * 0.002))),
    f, state, milesLeft: Math.max(0, total * (1 - f)),
  };
}

// ---------- the 16% loss ----------
export const LOSS_CHANCE = 0.16;
export const LOSS_REASONS: Record<Carrier, string[]> = {
  pigeon: ['storm', 'sandwich', 'flock', 'dodo'],
  bottle: ['whale', 'net', 'sink'],
};
export const LOSS_TEXT: Record<string, string> = {
  storm: 'got caught in a storm',
  sandwich: 'got distracted by a dropped sandwich',
  flock: 'ran off with a flock heading the wrong way',
  dodo: 'stopped to chat with a dodo and lost track of time',
  whale: 'was swallowed by a curious whale',
  net: 'got scooped up in a fishing net',
  sink: 'sank in a storm',
};

// Cryptographic random number in [0, 1). Works in browsers, Node and Workers.
export function cryptoRandom(): number {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return u[0] / 2 ** 32;
}

export type Loss = { lost: boolean; lostAt: number | null; reason: string | null };

// Server only. Never send the result to a client before lostAt.
export function rollLoss(plan: Plan, opts: { force?: boolean; rand?: () => number } = {}): Loss {
  const rand = opts.rand ?? cryptoRandom;
  const lost = opts.force || rand() < LOSS_CHANCE;
  if (!lost) return { lost: false, lostAt: null, reason: null };
  const span = plan.arrivesAt - plan.departedAt;
  const reasons = LOSS_REASONS[plan.carrier];
  return {
    lost: true,
    lostAt: Math.round(plan.departedAt + span * (0.15 + 0.7 * rand())),
    reason: reasons[Math.floor(rand() * reasons.length)],
  };
}

