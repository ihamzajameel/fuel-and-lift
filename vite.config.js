import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * After the build, inject the list of emitted files (and a content hash used as
 * the cache version) into dist/sw.js so the service worker can precache the
 * whole app on install and work fully offline at the gym.
 */
function swPrecache() {
  let outDir;
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  return {
    name: 'sw-precache',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const files = walk(outDir).filter(
        (f) => !f.endsWith('sw.js') && !f.endsWith('.map') && !path.basename(f).startsWith('.')
      );
      const hash = createHash('sha1');
      const urls = files.map((f) => {
        hash.update(fs.readFileSync(f));
        return path.relative(outDir, f).split(path.sep).join('/');
      });
      urls.push('./');
      const version = hash.digest('hex').slice(0, 12);
      const src = fs
        .readFileSync(swPath, 'utf8')
        .replace("'__PRECACHE_MANIFEST__'", JSON.stringify(JSON.stringify(urls)))
        .replace('__CACHE_VERSION__', version);
      fs.writeFileSync(swPath, src);
      console.log(`[sw-precache] ${urls.length} files, cache version ${version}`);
    },
  };
}

export default defineConfig({
  // Relative base so the built app works from any folder or sub-path (GitHub Pages, Netlify, etc.)
  base: './',
  plugins: [react(), tailwindcss(), swPrecache()],
});
