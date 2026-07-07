import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    fs: {
      allow: ['..'],
    },
  },
});
