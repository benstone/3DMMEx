// Kauai chunky file (CHN2) reader. See kauai/SRC/CHUNK.CPP.
import { Reader, ctgToStr, strToCtg, readStn, Writer, writeStn } from './binary.js';
import { decodeKCDC, decodeKCD2 } from './kcdc.js';

const FCRP_PACKED = 0x04;
const FCRP_FOREST = 0x10;
const CB_CRPBG = 32;
const CB_CRPSM = 20;

export class ChunkyFile {
  constructor(buffer, name = '') {
    this.name = name;
    this.bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.chunks = new Map();
    this._cache = new Map();
    this._parse();
  }

  static key(ctg, cno) { return `${ctg}:${cno}`; }

  _parse() {
    const r = new Reader(this.bytes);
    const magic = String.fromCharCode(...this.bytes.subarray(0, 4));
    if (magic !== 'CHN2' && magic !== '2NHC') throw new Error(`${this.name}: not a chunky file`);
    r.seek(4);
    this.creator = r.ctg();
    this.dverCur = r.i16();
    this.dverBack = r.i16();
    r.bo();
    this.osk = r.i16();
    const fpMac = r.i32();
    const fpIndex = r.i32();
    const cbIndex = r.i32();
    if (fpIndex <= 0 || fpIndex + cbIndex > this.bytes.length) throw new Error('bad chunky index');
    // index is a GG of CRPs
    const gg = readGG(this.bytes.subarray(fpIndex, fpIndex + cbIndex));
    for (const e of gg.entries) {
      if (!e) continue;
      const er = new Reader(e.fixed, 0, gg.le);
      const ctg = er.ctg();
      const cno = er.u32();
      const fp = er.i32();
      let cb, ckid, grfcrp;
      if (gg.cbFixed === CB_CRPBG) {
        cb = er.i32();
        ckid = er.i32();
        er.i32(); // ccrpRef
        er.i32(); // rti
        grfcrp = er.u32();
      } else if (gg.cbFixed === CB_CRPSM) {
        const lu = er.u32();
        grfcrp = lu & 0xff;
        cb = lu >>> 8;
        ckid = er.u16();
        er.u16();
      } else {
        throw new Error(`unknown CRP size ${gg.cbFixed}`);
      }
      const vr = new Reader(e.variable, 0, gg.le);
      const kids = [];
      for (let i = 0; i < ckid; i++) {
        kids.push({ ctg: vr.ctg(), cno: vr.u32(), chid: vr.u32() });
      }
      let name = '';
      if (vr.remaining > 0) name = readStn(e.variable, vr.pos).str;
      const chunk = { ctg, cno, fp, cb, grfcrp, packed: !!(grfcrp & FCRP_PACKED), forest: !!(grfcrp & FCRP_FOREST), kids, name };
      this.chunks.set(ChunkyFile.key(ctg, cno), chunk);
    }
  }

  has(ctg, cno) { return this.chunks.has(ChunkyFile.key(ctg, cno)); }
  get(ctg, cno) { return this.chunks.get(ChunkyFile.key(ctg, cno)); }

  *ofType(ctg) {
    for (const c of this.chunks.values()) if (c.ctg === ctg) yield c;
  }

  /** Decompressed chunk data as Uint8Array */
  data(ctg, cno) {
    const k = ChunkyFile.key(ctg, cno);
    if (this._cache.has(k)) return this._cache.get(k);
    const c = this.chunks.get(k);
    if (!c) throw new Error(`${this.name}: missing chunk ${ctg} ${cno}`);
    let raw = this.bytes.subarray(c.fp, c.fp + c.cb);
    if (c.packed) raw = unpack(raw);
    this._cache.set(k, raw);
    return raw;
  }

  /** Find a child chunk of (ctg,cno) of type kidCtg with the given chid */
  kid(ctg, cno, kidCtg, chid = 0) {
    const c = this.get(ctg, cno);
    if (!c) return null;
    return c.kids.find((k) => k.ctg === kidCtg && k.chid === chid) || null;
  }

  kidsOf(ctg, cno, kidCtg) {
    const c = this.get(ctg, cno);
    if (!c) return [];
    return kidCtg ? c.kids.filter((k) => k.ctg === kidCtg) : c.kids;
  }

  /**
   * Copy a chunk subtree from srcCf into this file with fresh CNOs (the
   * runtime half of CFL::FClone/FAdoptChild — used when the scene sorter
   * appends another movie's scenes). Returns the new chunk record or null.
   */
  adopt(srcCf, ctg, cno) {
    const src = srcCf.get(ctg, cno);
    if (!src) return null;
    let max = -1;
    for (const k of this.chunks.keys()) max = Math.max(max, +k.split(':')[1]);
    let next = max + 1;
    const copy = (s) => {
      const nc = { ctg: s.ctg, cno: next++, fp: 0, cb: 0, kids: [], name: s.name };
      this.chunks.set(ChunkyFile.key(nc.ctg, nc.cno), nc);
      this._cache.set(ChunkyFile.key(nc.ctg, nc.cno), srcCf.data(s.ctg, s.cno).slice());
      for (const k of s.kids) {
        const sk = srcCf.get(k.ctg, k.cno);
        if (sk) { const n = copy(sk); nc.kids.push({ ctg: n.ctg, cno: n.cno, chid: k.chid }); }
      }
      return nc;
    };
    return copy(src);
  }
}

export function unpack(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const cfmt = ctgToStr(dv.getUint32(0, false));
  const cb = dv.getUint32(4, false);
  const payload = raw.subarray(8);
  if (cfmt === 'KCDC') return decodeKCDC(payload, cb);
  if (cfmt === 'KCD2') return decodeKCD2(payload, cb);
  throw new Error(`unknown codec ${cfmt}`);
}

/** Generic group (GG): fixed + variable entries. */
export function readGG(bytes) {
  const r = new Reader(bytes);
  r.bo();
  const le = r.le;
  r.i16(); // osk
  const ilocMac = r.i32();
  const bvMac = r.i32();
  r.i32(); // clocFree
  const cbFixed = r.i32();
  const dataOff = 20;
  const locOff = dataOff + bvMac;
  const entries = [];
  for (let i = 0; i < ilocMac; i++) {
    r.seek(locOff + i * 8);
    const bv = r.i32();
    const cb = r.i32();
    if (cb === 0) { entries.push(null); continue; }
    const start = dataOff + bv;
    entries.push({
      fixed: bytes.subarray(start, start + cbFixed),
      variable: bytes.subarray(start + cbFixed, start + cb),
    });
  }
  return { le, cbFixed, entries };
}

/** Generic list (GL): array of fixed size entries. */
export function readGL(bytes) {
  const r = new Reader(bytes);
  r.bo();
  r.i16();
  const cbEntry = r.i32();
  const ivMac = r.i32();
  const entries = [];
  for (let i = 0; i < ivMac; i++) entries.push(bytes.subarray(12 + i * cbEntry, 12 + (i + 1) * cbEntry));
  return { le: r.le, cbEntry, entries };
}

/** Allocated list (AL): like a GL but with free entries. */
export function readAL(bytes) {
  const r = new Reader(bytes);
  r.bo();
  r.i16();
  const cbEntry = r.i32();
  const ivMac = r.i32();
  r.i32(); // cvFree
  const entries = [];
  for (let i = 0; i < ivMac; i++) entries.push(bytes.subarray(16 + i * cbEntry, 16 + (i + 1) * cbEntry));
  return { le: r.le, cbEntry, entries };
}

// ---- writing (CFL::FSaveACopy / _FWriteIndex semantics) ----------------------
const KOSK = 0x0303;

/** Serialize a GL chunk body: bo,osk,cbEntry,ivMac + entries. */
export function buildGL(entries) {
  const w = new Writer();
  w.bo().u16(KOSK).i32(entries[0]?.length ?? 0).i32(entries.length);
  for (const e of entries) w.bytes(e);
  return w.out();
}

/** Serialize a GG: bo,osk,ilocMac,bvMac,clocFree,cbFixed + packed data + loc table. */
export function buildGG(cbFixed, entries) {
  const w = new Writer();
  const data = new Writer(), loc = new Writer();
  for (const e of entries) {
    loc.i32(data.len).i32(cbFixed + (e.variable?.length ?? 0));
    data.bytes(e.fixed).bytes(e.variable || new Uint8Array(0));
  }
  w.bo().u16(KOSK).i32(entries.length).i32(data.len).i32(0).i32(cbFixed);
  w.bytes(data.out()).bytes(loc.out());
  return w.out();
}

/** Serialize a GST: bo,osk,cbEntry,ibstMac,bstMac,cbstFree + strings + entries. */
export function buildGST(cbEntry, entries) {
  const w = new Writer(), strs = new Writer(), ents = new Writer();
  for (const e of entries) {
    ents.i32(strs.len);
    strs.u8(Math.min(e.str.length, 255));
    for (let i = 0; i < Math.min(e.str.length, 255); i++) strs.u8(e.str.charCodeAt(i) & 0xff);
    strs.u8(0);
    const extra = e.extra || new Uint8Array(0);
    ents.bytes(extra.subarray(0, cbEntry - 4));
    if (extra.length < cbEntry - 4) ents.pad(cbEntry - 4 - extra.length);
  }
  w.bo().u16(KOSK).i32(cbEntry).i32(entries.length).i32(strs.len).i32(-1); // cbstFree klwNil
  return w.bytes(strs.out()).bytes(ents.out()).out();
}

/**
 * Write a complete CHN2 file.
 * chunks: [{ctg, cno, data:Uint8Array, kids:[{ctg,cno,chid}], name, loner}]
 * opts: {creator, dverCur, dverBack, osk}
 */
export function writeChunkyFile(chunks, opts = {}) {
  const { creator = 'SOC ', dverCur = 5, dverBack = 4, osk = KOSK } = opts;
  const body = new Writer();
  const crps = [];
  body.pad(128); // CFP header
  for (const c of chunks) {
    const fp = body.len, cb = c.data.length;
    body.bytes(c.data);
    const variable = new Writer();
    for (const k of c.kids || []) variable.ctg(k.ctg).u32(k.cno).u32(k.chid);
    if (c.name) variable.bytes(writeStn(c.name));
    const fixed = new Writer();
    fixed.ctg(c.ctg).u32(c.cno).i32(fp).i32(cb).i32((c.kids || []).length)
      .i32(1).i32(0).u32(c.loner ? 0x02 : 0); // ccrpRef, rti, grfcrp
    crps.push({ fixed: fixed.out(), variable: variable.out() });
  }
  const index = buildGG(32, crps);
  const fpIndex = body.len;
  body.bytes(index);
  const fpMac = body.len;
  const out = body.out();
  const dv = new DataView(out.buffer);
  dv.setUint32(0, strToCtg('CHN2'), true);
  dv.setUint32(4, strToCtg(creator), true);
  dv.setInt16(8, dverCur, true); dv.setInt16(10, dverBack, true);
  dv.setUint16(12, 0x0001, true); dv.setInt16(14, osk, true);
  dv.setInt32(16, fpMac, true); dv.setInt32(20, fpIndex, true);
  dv.setInt32(24, index.length, true);
  dv.setInt32(28, fpMac, true); dv.setInt32(32, 0, true); // fpMap, cbMap
  return out;
}

/** String table (GST/AST): strings + extra data per entry. */
export function readGST(bytes) {
  const r = new Reader(bytes);
  r.bo();
  const osk = r.i16();
  const cbEntry = r.i32();
  const ibstMac = r.i32();
  const bstMac = r.i32();
  r.i32(); // cbstFree
  const strOff = 20;
  const entOff = strOff + bstMac;
  const entries = [];
  for (let i = 0; i < ibstMac; i++) {
    const e = entOff + i * cbEntry;
    const bst = r.seek(e).i32();
    const extra = bytes.subarray(e + 4, e + cbEntry);
    if (bst < 0) { entries.push(null); continue; }
    let str;
    const p = strOff + bst;
    if (osk === 0x0303 || osk === 0x0101) {
      const cch = bytes[p];
      str = String.fromCharCode(...bytes.subarray(p + 1, p + 1 + cch));
    } else {
      const dv = new DataView(bytes.buffer, bytes.byteOffset + p);
      const cch = dv.getUint16(0, r.le);
      str = '';
      for (let j = 0; j < cch; j++) str += String.fromCharCode(dv.getUint16(2 + j * 2, r.le));
    }
    entries.push({ str, extra });
  }
  return { le: r.le, cbEntry, entries };
}
