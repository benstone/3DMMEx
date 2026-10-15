import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Writer } from '../src/format/binary.ts';
import {
  ChunkyFile, readGL, readGG, readAL, readGST, buildGL, buildGG, buildGST,
  writeChunkyFile, unpack,
} from '../src/format/chunky.ts';
import { movieFile, readFile } from './helpers.ts';

test('buildGL/readGL roundtrip', () => {
  const entries = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];
  const gl = readGL(buildGL(entries));
  assert.equal(gl.le, true);
  assert.equal(gl.cbEntry, 4);
  assert.equal(gl.entries.length, 2);
  assert.deepEqual([...gl.entries[1]], [5, 6, 7, 8]);
});

test('buildGG/readGG roundtrip with fixed+variable parts', () => {
  const fixed = (n) => { const w = new Writer(); w.i32(n).i32(n * 2); return w.out(); };
  const entries = [
    { fixed: fixed(1), variable: new Uint8Array([9, 9, 9]) },
    { fixed: fixed(2), variable: new Uint8Array(0) },
    { fixed: fixed(3), variable: new Uint8Array([7]) },
  ];
  const gg = readGG(buildGG(8, entries));
  assert.equal(gg.cbFixed, 8);
  assert.equal(gg.entries.length, 3);
  const r = (e, off) => new DataView(e.fixed.buffer, e.fixed.byteOffset).getInt32(off, gg.le);
  assert.equal(r(gg.entries[0], 0), 1);
  assert.equal(r(gg.entries[1], 4), 4);
  assert.equal(r(gg.entries[2], 0), 3);
  assert.deepEqual([...gg.entries[0].variable], [9, 9, 9]);
  assert.deepEqual([...gg.entries[2].variable], [7]);
});

test('buildGST/readGST roundtrip', () => {
  const extra = (n) => { const w = new Writer(); w.i32(n).i32(0).u32(0).u32(0).u32(0).u32(0).u32(0); return w.out(); };
  const gst = readGST(buildGST(32, [
    { str: 'Patrick', extra: extra(0) },
    { str: 'Sasha the Dog', extra: extra(1) },
  ]));
  assert.equal(gst.cbEntry, 32);
  assert.equal(gst.entries[0].str, 'Patrick');
  assert.equal(gst.entries[1].str, 'Sasha the Dog');
  assert.equal(new DataView(gst.entries[1].extra.buffer, gst.entries[1].extra.byteOffset).getInt32(0, true), 1);
});

test('readAL skips its cvFree field', () => {
  const w = new Writer();
  w.bo().u16(0x0303).i32(4).i32(2).i32(0); // bo,osk,cbEntry,ivMac,cvFree
  w.bytes(new Uint8Array([1, 2, 3, 4])).bytes(new Uint8Array([5, 6, 7, 8]));
  const al = readAL(w.out());
  assert.equal(al.entries.length, 2);
  assert.deepEqual([...al.entries[0]], [1, 2, 3, 4]);
});

test('writeChunkyFile -> ChunkyFile roundtrip', () => {
  const data = new Uint8Array([1, 0, 3, 3, 2, 0, 2, 0]);
  const kidData = new Uint8Array([9, 8, 7, 6]);
  const bytes = writeChunkyFile([
    { ctg: 'CHLD', cno: 0, data: kidData, name: 'kid chunk' },
    { ctg: 'MVIE', cno: 1, data, kids: [{ ctg: 'CHLD', cno: 0, chid: 3 }], name: 'a movie', loner: true },
  ]);
  const cf = new ChunkyFile(bytes, 'rt');
  assert.equal(cf.creator, 'SOC ');
  assert.equal(cf.chunks.size, 2);
  assert.deepEqual([...cf.data('MVIE', 1)], [...data]);
  assert.deepEqual([...cf.data('CHLD', 0)], [...kidData]);
  assert.equal(cf.get('MVIE', 1).name, 'a movie');
  const k = cf.kid('MVIE', 1, 'CHLD', 3);
  assert.ok(k);
  assert.equal(k.cno, 0);
  assert.deepEqual(cf.kidsOf('MVIE', 1).length, 1);
  assert.equal([...cf.ofType('CHLD')].length, 1);
});

test('ChunkyFile rejects non-chunky input', () => {
  assert.throws(() => new ChunkyFile(new Uint8Array(64), 'bad'), /not a chunky file/);
});

test('ChunkyFile.adopt clones a subtree with fresh cnos', () => {
  const cf = movieFile();
  const mvie = cf.ofType('MVIE').next().value;
  const scenKid = mvie.kids.find((k) => k.ctg === 'SCEN');
  const before = cf.chunks.size;
  const copy = cf.adopt(cf, 'SCEN', scenKid.cno);
  assert.ok(copy);
  assert.notEqual(copy.cno, scenKid.cno);
  assert.ok(cf.chunks.size > before);
  // the adopted scene's data is byte-identical to the source
  assert.deepEqual(cf.data('SCEN', copy.cno), cf.data('SCEN', scenKid.cno));
  // kids were re-mapped to the new copies, not the originals
  assert.ok(copy.kids.every((k) => k.cno !== scenKid.cno));
});

test('unpack throws on unknown codec', () => {
  const w = new Uint8Array(16);
  new DataView(w.buffer).setUint32(0, 0x58434f44, false); // 'XCOD'
  new DataView(w.buffer).setUint32(4, 4, false);
  assert.throws(() => unpack(w), /unknown codec/);
});

test('real packed chunks decode from TMPLS.3CN (KCDC/KCD2)', () => {
  const cf = new ChunkyFile(readFile('public/data/TMPLS.3CN'), 'TMPLS.3CN');
  const packed = [...cf.chunks.values()].filter((c) => c.packed);
  assert.ok(packed.length > 0, 'expected packed chunks in TMPLS.3CN');
  for (const c of packed.slice(0, 25)) {
    const raw = cf.data(c.ctg, c.cno);
    assert.ok(raw.length > 0, `${c.ctg}:${c.cno} decoded to empty`);
  }
});
