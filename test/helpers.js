// Shared fixtures: read real 3DMM content from the repo for tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChunkyFile } from '../src/format/chunky.js';
import { Library, CONTENT_FILES } from '../src/engine/library.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const readFile = (rel) => new Uint8Array(fs.readFileSync(path.join(ROOT, rel)));

export const movieFile = (name = 'WHERE.3MM') =>
  new ChunkyFile(readFile(`public/movies/${name}`), name);

/**
 * Byte-swap a CHN2 file's container (CFP header + CRP index) into a '2NHC'
 * hybrid, matching real byte-swapped movies whose chunk payloads keep their
 * own bo-marked endianness. ctg tags are u32s so they swap too; stn name
 * strings self-describe their endianness and pass through.
 */
export function swapContainer(bytes) {
  const b = bytes.slice();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sw16 = (o) => dv.setUint16(o, dv.getUint16(o, true), false);
  const sw32 = (o) => dv.setUint32(o, dv.getUint32(o, true), false);
  b.set([0x32, 0x4e, 0x48, 0x43], 0); // 'CHN2' -> '2NHC'
  const gi = dv.getInt32(20, true); // fpIndex — read before the u32 swaps below
  for (const o of [8, 10, 12, 14]) sw16(o); // dverCur, dverBack, bo, osk
  for (const o of [16, 20, 24, 28, 32]) sw32(o); // fpMac, fpIndex, cbIndex, fpMap, cbMap
  sw16(gi); sw16(gi + 2); // index GG: bo, osk
  const ilocMac = dv.getInt32(gi + 4, true), bvMac = dv.getInt32(gi + 8, true);
  const cbFixed = dv.getInt32(gi + 16, true);
  for (const o of [4, 8, 12, 16]) sw32(gi + o); // ilocMac, bvMac, clocFree, cbFixed
  const locOff = gi + 20 + bvMac;
  for (let i = 0; i < ilocMac; i++) {
    const lo = locOff + i * 8;
    const bv = dv.getInt32(lo, true), cb = dv.getInt32(lo + 4, true);
    sw32(lo); sw32(lo + 4);
    if (!cb) continue;
    const e = gi + 20 + bv;
    let ckid;
    if (cbFixed === 32) { // CRPBG: ctg, cno, fp, cb, ckid, ccrpRef, rti, grfcrp
      ckid = dv.getInt32(e + 16, true);
      for (const o of [0, 4, 8, 12, 16, 20, 24, 28]) sw32(e + o);
    } else if (cbFixed === 20) { // CRPSM: ctg, cno, fp, lu(cb<<8|grfcrp), ckid u16, pad u16
      ckid = dv.getUint16(e + 16, true);
      for (const o of [0, 4, 8, 12]) sw32(e + o);
      sw16(e + 16); sw16(e + 18);
    } else {
      throw new Error(`unknown CRP size ${cbFixed}`);
    }
    let p = e + cbFixed;
    for (let k = 0; k < ckid; k++) { sw32(p); sw32(p + 4); sw32(p + 8); p += 12; } // kid ctg + cno + chid
  }
  return b;
}

/** A big-endian-container variant of the fixture movie (the old test.3mm role). */
export const movieFileBE = (name = 'WHERE.3MM') =>
  new ChunkyFile(swapContainer(readFile(`public/movies/${name}`)), `${name} (2NHC)`);

export const contentLibrary = () =>
  new Library(CONTENT_FILES.map((n) => new ChunkyFile(readFile(`public/data/${n}`), n)));
