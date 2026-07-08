import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  base: '/voidfall/',
  publicDir: 'public',
  resolve: { extensions: ['.ts', '.js', '.mjs', '.json'] },
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
