import fs from 'node:fs';
import { ChunkyFile } from '../src/format/chunky.js';
import { Library, CONTENT_FILES } from '../src/engine/library.js';
import { MoviePlayer } from '../src/engine/player.js';
const lib = new Library(CONTENT_FILES.map((n) => new ChunkyFile(fs.readFileSync('public/data/' + n), n)));
const p = new MoviePlayer(new ChunkyFile(fs.readFileSync(process.argv[2]), 'movie'), lib);
p.loadScene(0);
let n = 0;
do {
  if (n++ % 60 === 0) console.log(p.sceneIndex, p.frame, p.bkgd?.name, 'cam', p.icam, p.visibleActors.map((a) => `${a.tmpl.name}@${a.rootMatrix.slice(9).map((v) => v.toFixed(1))} ${a.anid}/${a.celn} parts${a.parts.filter((x) => x.model).length}/${a.parts.length}`).join(' | '));
} while (p.step());
console.log('frames', n, p.warnings);
