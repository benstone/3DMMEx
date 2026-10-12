// Little helpers for reading Kauai/BRender data structures.

export const FIX = 1 / 65536;

export function ctgToStr(v) {
  return String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
}

export function strToCtg(s) {
  s = (s + '    ').slice(0, 4);
  return ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
}

export class Reader {
  constructor(bytes, offset = 0, littleEndian = true) {
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = offset;
    this.le = littleEndian;
  }
  get length() { return this.bytes.length; }
  get remaining() { return this.bytes.length - this.pos; }
  seek(p) { this.pos = p; return this; }
  skip(n) { this.pos += n; return this; }
  u8() { return this.dv.getUint8(this.pos++); }
  i8() { return this.dv.getInt8(this.pos++); }
  u16() { const v = this.dv.getUint16(this.pos, this.le); this.pos += 2; return v; }
  i16() { const v = this.dv.getInt16(this.pos, this.le); this.pos += 2; return v; }
  u32() { const v = this.dv.getUint32(this.pos, this.le); this.pos += 4; return v; }
  i32() { const v = this.dv.getInt32(this.pos, this.le); this.pos += 4; return v; }
  /** BRender scalar (16.16 fixed) */
  brs() { return this.i32() * FIX; }
  /** BRender angle (16 bit, 0x10000 == 2pi) */
  bra() { return (this.u16() / 65536) * Math.PI * 2; }
  /** BRender unsigned fraction (16 bit) */
  bruf() { return this.u16() / 65536; }
  ctg() { return ctgToStr(this.u32()); }
  /** BMAT34: 4 rows x 3 columns, row 3 is translation */
  bmat34() {
    const m = new Array(12);
    for (let i = 0; i < 12; i++) m[i] = this.brs();
    return m;
  }
  bmat23() {
    const m = new Array(6);
    for (let i = 0; i < 6; i++) m[i] = this.brs();
    return m;
  }
  sub(n) { const b = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  /** byte-order marker check, returns true when data must be byte swapped */
  bo() {
    const v = this.dv.getUint16(this.pos, true);
    this.pos += 2;
    if (v === 0x0001) { this.le = true; return; }
    if (v === 0x0100) { this.le = false; return; }
    throw new Error(`bad byte order marker 0x${v.toString(16)}`);
  }
  /** Kauai TAG: sid, (pcrf), ctg, cno */
  tag() {
    const sid = this.i32();
    this.skip(4);
    const ctg = this.ctg();
    const cno = this.u32();
    return { sid, ctg, cno };
  }
}

// ---- writing (inverse of the above) ----------------------------------------

export class Writer {
  constructor() { this.parts = []; this.len = 0; }
  _raw(n, fn) { const b = new Uint8Array(n); fn(new DataView(b.buffer)); this.parts.push(b); this.len += n; return this; }
  u8(v) { return this._raw(1, (d) => d.setUint8(0, v)); }
  i8(v) { return this._raw(1, (d) => d.setInt8(0, v)); }
  u16(v) { return this._raw(2, (d) => d.setUint16(0, v, true)); }
  i16(v) { return this._raw(2, (d) => d.setInt16(0, v, true)); }
  u32(v) { return this._raw(4, (d) => d.setUint32(0, v >>> 0, true)); }
  i32(v) { return this._raw(4, (d) => d.setInt32(0, v | 0, true)); }
  brs(v) { return this.i32(Math.round(v / FIX)); }
  bra(v) { return this.u16(Math.round((v / (Math.PI * 2)) * 65536) & 0xffff); }
  ctg(s) { return this.u32(strToCtg(s)); }
  bo() { return this.u16(0x0001); } // kboCur, little-endian
  tag(t) { return this.i32(t.sid | 0).i32(0).ctg(t.ctg).u32(t.cno); }
  bytes(b) { this.parts.push(b); this.len += b.length; return this; }
  pad(n) { return this._raw(n, () => {}); }
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
