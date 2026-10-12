import fs from 'node:fs';
import { ChunkyFile } from '../src/format/chunky.js';
import { parseMovie, SEVT, AET } from '../src/format/movie.js';
const cf = new ChunkyFile(fs.readFileSync(process.argv[2]), 'movie');
const mv = parseMovie(cf);
const sevtN = Object.fromEntries(Object.entries(SEVT).map(([k, v]) => [v, k]));
const aetN = Object.fromEntries(Object.entries(AET).map(([k, v]) => [v, k]));
console.log('movie', mv.name, 'scenes', mv.scenes.length);
for (const s of mv.scenes) {
  console.log('scene', s.cno, s.name, s.nfrmFirst, s.nfrmLast, 'trans', s.trans);
  for (const e of s.startEvents) console.log('  start', sevtN[e.sevt], JSON.stringify(e.data));
  for (const e of s.frameEvents.slice(0, 8)) console.log('  frm', e.nfrm, sevtN[e.sevt], e.data instanceof Uint8Array ? e.data.length : JSON.stringify(e.data));
  for (const [chid, a] of s.actors) {
    console.log('  actor', chid, a.arid, a.nfrmFirst, a.nfrmLast, JSON.stringify(a.tagTmpl), 'rpts', a.route.length, 'evs', a.events.length);
    for (const e of a.events.slice(0, 6)) console.log('    ', aetN[e.aet], e.nfrm, JSON.stringify(e.rtel), e.data instanceof Uint8Array ? '' : JSON.stringify(e.data)?.slice(0, 100));
  }
}
