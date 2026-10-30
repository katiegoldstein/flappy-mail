// Cloudflare Turnstile, the invisible "are you a person?" check on the send form.
// It runs only when the person presses Send, and only shows anything if Cloudflare needs them to click.
type TS = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: TS } }

let siteKey: string | null | undefined;
let widget: string | null = null;
let pending: ((t: string | null) => void) | null = null;
let loading: Promise<boolean> | null = null;

function load(): Promise<boolean> {
  if (!loading) loading = (async () => {
    siteKey = (await fetch('/api/config').then(r => r.json()).catch(() => ({}))).turnstileSiteKey ?? null;
    if (!siteKey) return false;
    await new Promise<void>((ok, bad) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = () => ok(); s.onerror = () => bad();
      document.head.append(s);
    }).catch(() => undefined);
    return !!window.turnstile;
  })();
  return loading;
}

// Start loading early, so pressing Send is quick.
export function prepareHumanCheck(host: HTMLElement) {
  load().then(ok => {
    if (!ok || widget || !window.turnstile) return;
    widget = window.turnstile.render(host, {
      sitekey: siteKey, execution: 'execute', appearance: 'interaction-only', size: 'flexible',
      callback: (t: string) => { pending?.(t); pending = null; },
      'error-callback': () => { pending?.(null); pending = null; },
      'expired-callback': () => { pending?.(null); pending = null; },
    });
  });
}

// A fresh one-time token for each send (null if the check couldn't run).
// If Cloudflare wants a click, onAsk runs so the page can say so; the person gets 2 minutes.
export async function humanToken(onAsk?: () => void): Promise<string | null> {
  if (!(await load()) || !widget || !window.turnstile) return null;
  window.turnstile.reset(widget);
  return new Promise(resolve => {
    pending = resolve;
    window.turnstile!.execute(widget!);
    setTimeout(() => { if (pending === resolve) onAsk?.(); }, 2500); // still waiting: Cloudflare is showing its checkbox
    setTimeout(() => { if (pending === resolve) { pending = null; resolve(null); } }, 120000);
  });
}
