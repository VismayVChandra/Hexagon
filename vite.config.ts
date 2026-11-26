import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Emits dist/sw.js from sw/sw.template.js with the list of built files so the
 * app shell is precached and the app opens offline after the first visit.
 */
function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'hexagon-precache-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split(sep).join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).map((f) => (f === 'index.html' ? './' : './' + f));
      const buildId = Date.now().toString(36);
      const template = readFileSync('sw/sw.template.js', 'utf8');
      const out = template
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache))
        .replace('__BUILD_ID__', JSON.stringify(buildId));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), precacheServiceWorker()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
