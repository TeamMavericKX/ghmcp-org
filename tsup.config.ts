import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'server-http': 'apps/server-http/src/index.ts',
    'server-stdio': 'apps/server-stdio/src/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  dts: true,
  shims: false,
  treeshake: true,
  banner: {
    js: "'use strict';",
  },
});
