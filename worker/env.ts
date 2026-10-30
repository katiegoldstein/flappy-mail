// Worker bindings and config. Dev-only switches are read through devOnly() so they can't
// take effect in production, even if someone sets the variable there by mistake.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  SITE_URL: string;
  MAIL_FROM: string;
  COOP_CAP: string;
  TIME_WARP?: string;
  FORCE_LOSS?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  IP_SALT?: string;
  RATE_LIMITS?: string;
  DAILY_LETTER_CAP?: string;
}

export const isDev = (env: Env) => env.ENVIRONMENT === 'development' && !env.SITE_URL.includes('flappymail.net');

function devOnly(env: Env, value: string | undefined): string | undefined {
  return isDev(env) ? value : undefined;
}

// One trip-hour per real second at 3600. Always 1 in production.
export const timeWarp = (env: Env) => Math.max(1, Number(devOnly(env, env.TIME_WARP) ?? 1) || 1);
export const forceLoss = (env: Env) => devOnly(env, env.FORCE_LOSS) === '1';
export const coopCap = (env: Env) => Math.max(1, Number(env.COOP_CAP) || 1000);
// Rate limits are always on in production; a local load test can turn them off.
export const rateLimitsOn = (env: Env) => devOnly(env, env.RATE_LIMITS) !== 'off';
export const LIMIT_PER_IP = 5;
// Letters per day across the whole site. Each letter sends ~3 emails, so 30 keeps under Resend's free 100/day
// and stops anyone from burning the email allowance or the domain's reputation. Raise it after upgrading Resend.
export const dailyLetterCap = (env: Env) => Math.max(1, Number(env.DAILY_LETTER_CAP) || 30);
