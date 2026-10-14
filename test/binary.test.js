import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Reader, Writer, ctgToStr, strToCtg, readStn, writeStn, FIX } from '../src/format/binary.js';

test('ctg <-> str roundtrip', () => {
  for (const s of ['MVIE', 'GST ', 'SCEN', 'TDT ', 'MSND']) {
    assert.equal(ctgToStr(strToCtg(s)), s);
  }
});

test('strToCtg pads short strings and truncates long ones', () => {
  assert.equal(ctgToStr(strToCtg('AB')), 'AB  ');
  assert.equal(ctgToStr(strToCtg('ABCDE')), 'ABCD');
});

test('Writer -> Reader roundtrip of all primitives', () => {
  const w = new Writer();
  w.u8(0xab).i8(-5).u16(0xbeef).i16(-1234).u32(0xdeadbeef).i32(-65536)
    .brs(1.5).brs(-0.25).bra(Math.PI).brs(0).ctg('MVIE').u32(7).pad(3);
  const r = new Reader(w.out());
  assert.equal(r.u8(), 0xab);
  assert.equal(r.i8(), -5);
  assert.equal(r.u16(), 0xbeef);
  assert.equal(r.i16(), -1234);
  assert.equal(r.u32(), 0xdeadbeef);
  assert.equal(r.i32(), -65536);
  assert.equal(r.brs(), Math.round(1.5 / FIX) * FIX);
  assert.equal(r.brs(), Math.round(-0.25 / FIX) * FIX);
  assert.ok(Math.abs(r.bra() - Math.PI) < 0.0001);
  assert.equal(r.brs(), 0);
  assert.equal(r.ctg(), 'MVIE');
  assert.equal(r.u32(), 7);
  assert.equal(r.remaining, 3);
});

test('tag roundtrip keeps sid/ctg/cno', () => {
  const w = new Writer();
  w.tag({ sid: 2, ctg: 'TMPL', cno: 8252 });
  const t = new Reader(w.out()).tag();
  assert.deepEqual(t, { sid: 2, ctg: 'TMPL', cno: 8252 });
});

test('Reader.bo selects endianness and rejects bad markers', () => {
  const le = new Uint8Array([0x01, 0x00, 0x34, 0x12]);
  const r = new Reader(le);
  r.bo();
  assert.equal(r.le, true);
  assert.equal(r.u16(), 0x1234);

  const r2 = new Reader(new Uint8Array([0x00, 0x01, 0x12, 0x34])); // LE u16 = 0x0100 -> big-endian data
  r2.bo();
  assert.equal(r2.le, false);
  assert.equal(r2.u16(), 0x1234);

  assert.throws(() => new Reader(new Uint8Array([0xff, 0xff])).bo(), /bad byte order marker/);
});

test('Reader.sub and seek', () => {
  const r = new Reader(new Uint8Array([1, 2, 3, 4, 5, 6]));
  assert.deepEqual([...r.sub(2)], [1, 2]);
  r.seek(4);
  assert.equal(r.u8(), 5);
  assert.equal(r.pos, 5);
  r.skip(1);
  assert.equal(r.pos, 6);
  assert.equal(r.remaining, 0);
});

test('writeStn/readStn roundtrip incl. empty and >255 truncation', () => {
  for (const str of ['', 'hello', 'MY-Street Background']) {
    const { str: s, size } = readStn(writeStn(str));
    assert.equal(s, str);
    assert.equal(size, 3 + str.length + 1);
  }
  const long = 'x'.repeat(300);
  const { str: s2 } = readStn(writeStn(long));
  assert.equal(s2, 'x'.repeat(255));
});

test('readStn unicode branch', () => {
  const w = new Writer();
  w.u16(0x0505).u16(2).u16('h'.charCodeAt(0)).u16('i'.charCodeAt(0)).u16(0);
  const { str, size } = readStn(w.out());
  assert.equal(str, 'hi');
  assert.equal(size, 4 + 3 * 2);
});

test('readStn on too-short input', () => {
  assert.deepEqual(readStn(new Uint8Array([1, 2])), { str: '', size: 0 });
});
