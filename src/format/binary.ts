// Little helpers for reading Kauai/BRender binary data structures.

/** Scale factor converting a 16.16 fixed-point integer to a float. */
export const FIX = 1 / 65536;

/** Decode a big-endian 4-char chunk-type tag (e.g. 'TMPL') from its u32. */
export function ctgToStr(v) {
  return String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
}

/** Encode a 4-char string as a big-endian chunk-type u32 (space-padded). */
export function strToCtg(s) {
  s = (s + '    ').slice(0, 4);
  return ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
}

/** Sequential byte reader over a Uint8Array — primitive ints, fixed-point
 *  scalars/angles, chunk tags, matrices, and subarray slices. The byte order
 *  flips after a `bo()` marker read. */
export class Reader {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(bytes, offset = 0, littleEndian = true) {
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = offset;
    this.le = littleEndian;
  }
  /** Total length of the backing byte array. */
  get length() { return this.bytes.length; }
  /** Bytes left after the cursor. */
  get remaining() { return this.bytes.length - this.pos; }
  /** Move the cursor to absolute position `p` (chainable). */
  seek(p) { this.pos = p; return this; }
  /** Advance the cursor `n` bytes (chainable). */
  skip(n) { this.pos += n; return this; }
  // Primitive readers — each returns the value and advances the cursor.
  /** Read a uint8. */ u8() { return this.dv.getUint8(this.pos++); }
  /** Read an int8. */ i8() { return this.dv.getInt8(this.pos++); }
  /** Read a uint16 in the stream's endianness. */ u16() { const v = this.dv.getUint16(this.pos, this.le); this.pos += 2; return v; }
  /** Read an int16 in the stream's endianness. */ i16() { const v = this.dv.getInt16(this.pos, this.le); this.pos += 2; return v; }
  /** Read a uint32 in the stream's endianness. */ u32() { const v = this.dv.getUint32(this.pos, this.le); this.pos += 4; return v; }
  /** Read an int32 in the stream's endianness. */ i32() { const v = this.dv.getInt32(this.pos, this.le); this.pos += 4; return v; }
  /** 16.16 fixed-point scalar -> float. */
  brs() { return this.i32() * FIX; }
  /** 16-bit angle -> radians (0x10000 == 2pi). */
  bra() { return (this.u16() / 65536) * Math.PI * 2; }
  /** 16-bit unsigned fraction -> 0..1. */
  bruf() { return this.u16() / 65536; }
  /** 4-char chunk-type tag -> string. */
  ctg() { return ctgToStr(this.u32()); }
  /** 4x3 affine matrix — 12 fixed-point scalars, row 3 is translation. */
  bmat34() {
    const m = new Array(12);
    for (let i = 0; i < 12; i++) m[i] = this.brs();
    return m;
  }
  /** 2x3 affine matrix — 6 fixed-point scalars. */
  bmat23() {
    const m = new Array(6);
    for (let i = 0; i < 6; i++) m[i] = this.brs();
    return m;
  }
  /** Slice `n` bytes off at the cursor and advance. */
  sub(n) { const b = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  /** Read the byte-order marker and set endianness — throws on a bad marker. */
  bo() {
    const v = this.dv.getUint16(this.pos, true);
    this.pos += 2;
    if (v === 0x0001) { this.le = true; return; }
    if (v === 0x0100) { this.le = false; return; }
    throw new Error(`bad byte order marker 0x${v.toString(16)}`);
  }
  /** Chunk reference: sid, (skipped pcrf field), ctg, cno. */
  tag() {
    const sid = this.i32();
    this.skip(4);
    const ctg = this.ctg();
    const cno = this.u32();
    return { sid, ctg, cno };
  }
}

// ---- writing (inverse of the above) ----------------------------------------

/** Little-endian byte writer — accumulates parts, `out()` concatenates.
 *  Mirrors Reader: primitives, fixed-point scalars/angles, tags. */
export class Writer {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor() { this.parts = []; this.len = 0; }
  /** Append `n` bytes produced by `fn(DataView)` (chainable). */
  _raw(n, fn) { const b = new Uint8Array(n); fn(new DataView(b.buffer)); this.parts.push(b); this.len += n; return this; }
  // Primitive writers — little-endian, chainable.
  /** Write a uint8. */ u8(v) { return this._raw(1, (d) => d.setUint8(0, v)); }
  /** Write an int8. */ i8(v) { return this._raw(1, (d) => d.setInt8(0, v)); }
  /** Write a uint16. */ u16(v) { return this._raw(2, (d) => d.setUint16(0, v, true)); }
  /** Write an int16. */ i16(v) { return this._raw(2, (d) => d.setInt16(0, v, true)); }
  /** Write a uint32. */ u32(v) { return this._raw(4, (d) => d.setUint32(0, v >>> 0, true)); }
  /** Write an int32. */ i32(v) { return this._raw(4, (d) => d.setInt32(0, v | 0, true)); }
  /** Float -> 16.16 fixed-point. */
  brs(v) { return this.i32(Math.round(v / FIX)); }
  /** Radians -> 16-bit angle. */
  bra(v) { return this.u16(Math.round((v / (Math.PI * 2)) * 65536) & 0xffff); }
  /** 4-char string -> chunk-type u32. */
  ctg(s) { return this.u32(strToCtg(s)); }
  /** Byte-order marker — little-endian. */
  bo() { return this.u16(0x0001); }
  /** Chunk reference {sid, ctg, cno} — sid, zero pcrf, ctg, cno. */
  tag(t) { return this.i32(t.sid | 0).i32(0).ctg(t.ctg).u32(t.cno); }
  /** Append raw bytes (chainable). */
  bytes(b) { this.parts.push(b); this.len += b.length; return this; }
  /** Append `n` zero bytes (chainable). */
  pad(n) { return this._raw(n, () => {}); }
  /** Concatenate all parts into one Uint8Array. */
  out() {
    const b = new Uint8Array(this.len);
    let p = 0;
    for (const c of this.parts) { b.set(c, p); p += c.length; }
    return b;
  }
}

/** Encode a Kauai STN (osk + cch + latin1 chars + NUL). */
export function writeStn(str) {
  const w = new Writer();
  w.u16(0x0303).u8(Math.min(str.length, 255));
  for (let i = 0; i < Math.min(str.length, 255); i++) w.u8(str.charCodeAt(i) & 0xff);
  w.u8(0);
  return w.out();
}

/** Read a Kauai STN (osk-prefixed pascal string) from bytes. */
export function readStn(bytes, off = 0) {
  if (bytes.length - off < 3) return { str: '', size: 0 };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const osk = dv.getUint16(off, true);
  // single byte win/mac
  if (osk === 0x0303 || osk === 0x0101 || osk === 0x0301 || osk === 0x0103) {
    const cch = bytes[off + 2];
    let s = '';
    for (let i = 0; i < cch; i++) s += String.fromCharCode(bytes[off + 3 + i]);
    return { str: s, size: 3 + cch + 1 };
  }
  // unicode
  const le = osk === 0x0505 || osk === 0x0405;
  const cch = dv.getUint16(off + 2, le);
  let s = '';
  for (let i = 0; i < cch; i++) s += String.fromCharCode(dv.getUint16(off + 4 + i * 2, le));
  return { str: s, size: 4 + (cch + 1) * 2 };
}
