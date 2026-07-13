import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: 'public',
  resolve: { extensions: ['.ts', '.js', '.mjs', '.json'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    // Forward API calls to the game server (server/src) so the dev client can
    // reach /api/players same-origin, mirroring the combined production deploy
    // where nginx routes /voidfall/api/* to the same server.
    proxy: {
      '/api': 'http://localhost:1337',
    },
    fs: {
      allow: ['..'],
    },
  },
});
