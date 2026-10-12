// base './' keeps built asset URLs relative so the SPA works under any
// mount point (e.g. a GitHub Pages project site at /<user>.github.io/<repo>/)
export default {
  base: './',
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
};
