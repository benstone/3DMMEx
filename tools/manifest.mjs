// Regenerate public/manifest.json — the flat list of runtime assets the boot
// preloader warms (textures, cursors) plus the bundled sample movies the boot
// menu lists. Run after adding/removing files under public/.
import { readdirSync, writeFileSync } from 'node:fs';

const ls = (dir, ext) => {
  try {
    return readdirSync(new URL(`../public/${dir}`, import.meta.url))
      .filter((f) => f.toLowerCase().endsWith(ext)).sort();
  } catch { return []; } // dir may not exist (e.g. no bundled movies)
};

const manifest = {
  textures: ls('textures', '.png'),
  cur: ls('cur', '.cur'),
  movies: ls('movies', '.3mm'),
};
writeFileSync(new URL('../public/manifest.json', import.meta.url), JSON.stringify(manifest, null, 1) + '\n');
console.log(`manifest.json: ${manifest.textures.length} textures, ${manifest.cur.length} cursors, ${manifest.movies.length} movies`);
