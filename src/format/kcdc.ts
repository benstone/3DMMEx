// KCDC / KCD2 chunk decompressors — the LZ77-family codec used for packed
// chunks inside .3CN/.3MM files. Bit-level format: literal bytes or
// (offset,length) back-references with variable-width offset classes.

const TAIL = 6;
const MAX_LEN_BITS = 11;
const DIB_BITS = [6, 9, 12, 20];
const DIB_MIN = [0x01, 0x41, 0x0241, 0x1241];

/** LSB-first bit reader over a padded copy of the compressed payload. */
class BitReader {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(src) {
    // pad so 32-bit windows near the end are always readable
    this.src = new Uint8Array(src.length + 8);
    this.src.set(src);
    this.p = 1; // skip flag byte
    this.ibit = 0;
  }
  /** 32-bit little-endian window starting at the current byte. */
  get cur() {
    const s = this.src, p = this.p;
    return (s[p] | (s[p + 1] << 8) | (s[p + 2] << 16) | (s[p + 3] << 24)) >>> 0;
  }
  /** Bit `i` past the cursor without advancing. */
  bit(i) {
    return (this.cur >>> (this.ibit + i)) & 1;
  }
  /** Up to 32 bits starting `off` bits past the cursor — reads two 32-bit
   *  windows to avoid overflow. Does not advance. */
  bits(off, n) {
    const start = this.ibit + off;
    const byte = this.p + (start >> 3);
    const sh = start & 7;
    const s = this.src;
    let lo = (s[byte] | (s[byte + 1] << 8) | (s[byte + 2] << 16) | (s[byte + 3] << 24)) >>> 0;
    let v = lo >>> sh;
    if (sh && n > 32 - sh) v = (v | (s[byte + 4] << (32 - sh))) >>> 0;
    return n >= 32 ? v >>> 0 : (v & ((1 << n) - 1)) >>> 0;
  }
  /** Advance the cursor `n` bits. */
  skip(n) {
    this.ibit += n;
    this.p += this.ibit >> 3;
    this.ibit &= 7;
  }
  /** Gamma-style run length — count leading 1 bits, then that many payload
   *  bits give the low part. Returns -1 on a malformed stream. */
  readLogLength() {
    let cbit = 0;
    while (this.bit(cbit)) {
      if (++cbit > MAX_LEN_BITS) return -1;
    }
    const cb = (1 << cbit) + this.bits(cbit + 1, cbit);
    this.skip(cbit + cbit + 1);
    return cb;
  }
  /** Back-reference distance — a 1-3 bit class prefix then a variable-width
   *  offset within the class. */
  readOffset() {
    for (let k = 0; k < 4; k++) {
      if (k === 3 || !this.bit(k)) {
        const pre = k === 3 ? 4 : k + 1;
        const dib = this.bits(pre, DIB_BITS[k]);
        this.skip(pre + DIB_BITS[k]);
        return { k, dib };
      }
    }
  }
}

/** Validate the codec's 0xff sentinel tail and flag byte. */
function checkTail(src) {
  if (src.length <= TAIL + 1) throw new Error('compressed stream too short');
  for (let i = 1; i <= TAIL; i++) if (src[src.length - i] !== 0xff) throw new Error('bad compressed tail');
  if (src[0] !== 0) throw new Error('unknown codec flag byte');
}

/** Decompress a KCDC stream into `cbDst` bytes. */
export function decodeKCDC(src, cbDst) {
  checkTail(src);
  const dst = new Uint8Array(cbDst);
  const r = new BitReader(src);
  let d = 0;
  for (;;) {
    if (!r.bit(0)) {
      dst[d++] = r.bits(1, 8);
      r.skip(9);
      continue;
    }
    r.skip(1);
    let cb = 1;
    let k;
    for (k = 0; k < 3 && r.bit(k); k++);
    const pre = k === 3 ? 3 : k + 1;
    let dib = r.bits(pre, DIB_BITS[k]);
    if (k === 3) {
      if (dib === (1 << DIB_BITS[3]) - 1) break;
      cb++;
    }
    dib += DIB_MIN[k];
    r.skip(pre + DIB_BITS[k]);
    const len = r.readLogLength();
    if (len < 0) throw new Error('KCDC bad length');
    cb += len;
    if (d + cb > cbDst || dib > d) throw new Error('KCDC overflow');
    for (let s = d - dib; cb-- > 0;) dst[d++] = dst[s++];
  }
  return d === cbDst ? dst : dst.subarray(0, d);
}

/** Decompress a KCD2 stream into `cbDst` bytes — same scheme with run-length
 *  prefixes on literal runs. */
export function decodeKCD2(src, cbDst) {
  checkTail(src);
  const dst = new Uint8Array(cbDst);
  const r = new BitReader(src);
  let d = 0;
  for (;;) {
    let cb = r.readLogLength();
    if (cb < 0) break;
    if (!r.bit(0)) {
      // literal run
      r.skip(1);
      let ibit = r.ibit;
      let low = 0;
      if (ibit === 0) ibit = 8;
      else {
        low = r.src[r.p] >> ibit;
        r.p++;
      }
      r.ibit = 0;
      if (d + cb > cbDst) throw new Error('KCD2 overflow');
      for (let i = 0; i < cb - 1; i++) dst[d++] = r.src[r.p++];
      const highBits = r.src[r.p] & ((1 << ibit) - 1);
      dst[d++] = (low | (highBits << (8 - ibit))) & 0xff;
      r.ibit = ibit;
      r.p += r.ibit >> 3;
      r.ibit &= 7;
    } else {
      r.skip(1);
      cb++;
      let k;
      for (k = 0; k < 3 && r.bit(k); k++);
      const pre = k === 3 ? 3 : k + 1;
      const dib = r.bits(pre, DIB_BITS[k]) + DIB_MIN[k];
      r.skip(pre + DIB_BITS[k]);
      if (k === 3) cb++;
      if (d + cb > cbDst || dib > d) throw new Error('KCD2 overflow');
      for (let s = d - dib; cb-- > 0;) dst[d++] = dst[s++];
    }
  }
  return d === cbDst ? dst : dst.subarray(0, d);
}
