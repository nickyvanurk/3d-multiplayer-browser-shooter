import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

// During the JS→TS migration our modules keep `.js` import specifiers (the
// nodenext convention), but the referenced files may already be `.ts`. Rollup
// only applies `resolve.extensions` to extensionless imports, so an explicit
// `./foo.js` that now lives as `./foo.ts` fails to resolve. Rewrite relative
// `.js` specifiers to `.ts` when the `.ts` file exists.
function resolveJsToTs() {
  return {
    name: 'resolve-js-to-ts',
    resolveId(source, importer) {
      if (
        importer &&
        (source.startsWith('./') || source.startsWith('../')) &&
        source.endsWith('.js')
      ) {
        const candidate = path.resolve(
          path.dirname(importer),
          source.slice(0, -3) + '.ts',
        );
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: '/voidfall/',
  publicDir: 'public',
  plugins: [resolveJsToTs()],
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
