import { defineConfig } from 'tsup';

// Root aggregator: builds each package/app via its own tsup config.
// This file exists only so pnpm has a single tsup entry; the per-package
// configs are the source of truth (entry points, dts, etc.).
export default defineConfig({
  entry: [],
  outDir: 'dist',
  clean: false,
});
