import { defineConfig, Plugin } from 'vite';
import { resolve } from 'node:path';

// In development, /l/<token> (the recipient's letter link) serves the letter page, like the Worker does in production.
const letterLinks: Plugin = {
  name: 'letter-links',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = req.url?.split('?')[0] ?? '';
      if (/^\/l\/[\w-]{20,}$/.test(path)) req.url = '/letter.html';
      // Clean URLs like production: /send serves send.html.
      else if (path === '/send') req.url = '/send.html' + (req.url!.includes('?') ? req.url!.slice(req.url!.indexOf('?')) : '');
      next();
    });
  },
};

export default defineConfig({
  plugins: [letterLinks],
  // In development the API runs in `wrangler dev` on port 8787.
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/dev/outbox': 'http://127.0.0.1:8787', '/dev/tick': 'http://127.0.0.1:8787', '/block': 'http://127.0.0.1:8787' } },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        send: resolve(__dirname, 'send.html'),
        letter: resolve(__dirname, 'letter.html'),
        notfound: resolve(__dirname, '404.html'),
        // review.html, scene.html, film.html, film-receive.html and dev/ are development tools and aren't part of the production build.
      },
    },
  },
});
