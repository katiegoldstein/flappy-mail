// Local development: the site (Vite, port 5173) and the API + database (wrangler dev, port 8787) together.
import { spawn } from 'node:child_process';
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  const out = d => process.stdout.write(d.toString().split('\n').filter(Boolean).map(l => `[${name}] ${l}\n`).join(''));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', code => { console.log(`[${name}] exited ${code}`); process.exit(code ?? 1); });
  return p;
};
const kids = [
  run('api', 'npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1']),
  run('site', 'npx', ['vite', '--port', '5173', '--strictPort']),
];
// The real scheduler runs every 5 minutes; locally it runs every 5 seconds so time-warped trips land promptly.
const tick = setInterval(() => fetch('http://127.0.0.1:8787/dev/tick').then(r => r.json()).then(r => {
  if (r.lost || r.arrivals || r.delivered) console.log(`[scheduler] ${JSON.stringify(r)}`);
}).catch(() => {}), 5000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearInterval(tick); kids.forEach(k => k.kill()); process.exit(0); });
