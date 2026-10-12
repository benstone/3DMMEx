import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWavAdpcm } from '../src/format/wav.js';
import { parseMids } from '../src/format/mids.js';
import { ChunkyFile } from '../src/format/chunky.js';
import { movieFile, readFile } from './helpers.js';

test('decodeWavAdpcm returns null for non-ADPCM input', () => {
  assert.equal(decodeWavAdpcm(new Uint8Array(0)), null);
  assert.equal(decodeWavAdpcm(new Uint8Array(64)), null);
  // valid RIFF but PCM fmt tag (1), not ADPCM (2)
  const pcm = new Uint8Array(44);
  const dv = new DataView(pcm.buffer);
  const id = (o, s) => dv.setUint32(o, (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3));
  id(0, 'RIFF'); dv.setUint32(4, 36, true); id(8, 'WAVE'); id(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  assert.equal(decodeWavAdpcm(pcm), null);
});

test('decodeWavAdpcm decodes a real 3DMM WAVE chunk', () => {
  const cf = movieFile();
  const wave = cf.ofType('WAVE').next().value;
  const d = cf.data('WAVE', wave.cno);
  const res = decodeWavAdpcm(d);
  assert.ok(res, 'fixture WAVE should be ADPCM');
  assert.equal(res.rate, 11025); // embedded user-recorded sound; stock sounds are 22050
  assert.equal(res.channels, 1);
  assert.ok(res.frames > 0);
  assert.equal(res.out.length, 1);
  assert.ok(res.out[0] instanceof Float32Array);
  assert.ok(res.out[0].every((v) => v >= -1 && v <= 1));
});

test('parseMids handles varint deltas, running status and meta events', () => {
  // dt=0 note-on(90 40 7f), dt=5 running status(40 00), dt=0 program(c0 03), meta EOT
  const d = new Uint8Array([0x00, 0x90, 0x40, 0x7f, 0x05, 0x40, 0x00, 0x00, 0xc0, 0x03, 0x00, 0xff, 0x2f, 0x00]);
  const evs = parseMids(d);
  assert.equal(evs.length, 3);
  assert.deepEqual(evs[0], { ts: 0, msg: [0x90, 0x40, 0x7f] });
  assert.deepEqual(evs[1], { ts: 5, msg: [0x90, 0x40, 0x00] }); // running status reuses 0x90
  assert.deepEqual(evs[2], { ts: 5, msg: [0xc0, 0x03] });
});

test('parseMids parses real MIDS chunks from SNDS.3CN', () => {
  const cf = new ChunkyFile(readFile('public/data/SNDS.3CN'), 'SNDS.3CN');
  const mids = cf.ofType('MIDS').next().value;
  const evs = parseMids(cf.data('MIDS', mids.cno));
  assert.ok(evs.length > 0);
  for (let i = 1; i < evs.length; i++) assert.ok(evs[i].ts >= evs[i - 1].ts, 'timestamps must be non-decreasing');
});
