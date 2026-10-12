import fs from 'node:fs';
import { ChunkyFile } from '../src/format/chunky.js';
const [, , file, filter] = process.argv;
const cf = new ChunkyFile(fs.readFileSync(file), file);
console.log('creator', cf.creator, 'ver', cf.dverCur, cf.dverBack, 'chunks', cf.chunks.size);
const counts = {};
let fail = 0, packed = 0;
for (const c of cf.chunks.values()) {
  counts[c.ctg] = (counts[c.ctg] || 0) + 1;
  if (c.packed) { packed++; try { cf.data(c.ctg, c.cno); } catch (e) { if (fail++ < 5) console.log('FAIL', c.ctg, c.cno, e.message); } }
}
console.log(counts, 'packed', packed, 'fail', fail);
if (filter) for (const c of cf.chunks.values()) if (c.ctg === filter) console.log(c.ctg, c.cno, c.cb, c.packed ? 'P' : '', JSON.stringify(c.name), c.kids.map(k => `${k.ctg}:${k.cno}/${k.chid}`).join(' '));
