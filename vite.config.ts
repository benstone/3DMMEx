// base './' keeps built asset URLs relative so the SPA works under any
// mount point (e.g. a GitHub Pages project site at /<user>.github.io/<repo>/)
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

const EXP_DIR = resolve('expansions'); // dev: ?packs=/expansions/<dir> tests local packs
const MIME = { '.json': 'application/json', '.png': 'image/png', '.cur': 'application/octet-stream' };

export default {
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // never inline runtime blobs — data/ textures live in public/
    rollupOptions: {
      input: { main: resolve('index.html') },
      output: {
        manualChunks(id) { // split heavy deps into cacheable chunks
          if (!id.includes('node_modules')) return;
          if (id.includes('three')) return 'three';
          if (id.includes('spessasynth')) return 'synth';
          return 'vendor';
        },
      },
    },
  },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  plugins: [
  // ANALYZE=1 npx vite build -> dist/stats.html treemap (rollup-plugin-visualizer)
  ...(process.env.ANALYZE ? [visualizer({ filename: 'dist/stats.html', template: 'treemap', gzipSize: true })] : []),
  {
    name: 'serve-expansions',
    configureServer(server) {
      server.middlewares.use('/expansions', (req, res, next) => {
        const f = resolve(EXP_DIR, decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, ''));
        if (!f.startsWith(EXP_DIR + sep)) return next(); // stay inside expansions/
        try { if (!statSync(f).isFile()) return next(); } catch { return next(); }
        res.setHeader('Content-Type', MIME[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream');
        createReadStream(f).pipe(res);
      });
    },
  }],
};
