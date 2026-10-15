// Parsers for 3DMM content chunks: templates, actions, models, materials,
// backgrounds, cameras and bitmaps. Struct layouts follow INC/*.H in the
// Microsoft 3D Movie Maker source.
import { Reader, readStn } from './binary.ts';
import { readGL, readGG } from './chunky.ts';
import * as M from '../engine/mat34.ts';

const shorts = (gl) => gl.entries.map((e) => new Reader(e, 0, gl.le).i16());

export function parseTemplate(cf, cno, lib = null) {
  const r = new Reader(cf.data('TMPL', cno));
  r.bo(); r.i16();
  const xaRest = r.bra(), yaRest = r.bra(), zaRest = r.bra();
  r.i16();
  const grftmpl = r.u32();
  const kid = (ctg, chid = 0) => cf.kid('TMPL', cno, ctg, chid);
  const tdt = kid('TDT ');
  if (tdt) return buildTdtTemplate(cf, cno, cf.get('TMPL', cno).name, [xaRest, yaRest, zaRest], grftmpl, tdt, lib);
  const glpi = kid('GLPI'), glbs = kid('GLBS'), ggcm = kid('GGCM');
  const parents = shorts(readGL(cf.data('GLPI', glpi.cno)));
  const ibsets = shorts(readGL(cf.data('GLBS', glbs.cno)));
  const cmids = [];
  if (ggcm) {
    const gg = readGG(cf.data('GGCM', ggcm.cno));
    for (const e of gg.entries) {
      const vr = new Reader(e.variable, 0, gg.le);
      const list = [];
      while (vr.remaining >= 4) list.push(vr.i32());
      cmids.push(list);
    }
  }
  const cbset = ibsets.reduce((a, b) => Math.max(a, b), -1) + 1;
  return {
    cf, cno, name: cf.get('TMPL', cno).name,
    rest: [xaRest, yaRest, zaRest], grftmpl,
    isTdt: !!(grftmpl & 2), isProp: !!(grftmpl & 4),
    parents, ibsets, cbset, cmids,
    _actions: new Map(), _models: new Map(), _cmtls: new Map(),
  };
}

export function templateAction(tmpl, anid) {
  if (tmpl._actions.has(anid)) return tmpl._actions.get(anid);
  if (tmpl.isTdt) {
    const actn = tdtBuildAction(tmpl, anid);
    tmpl._actions.set(anid, actn);
    return actn;
  }
  const { cf, cno } = tmpl;
  const k = cf.kid('TMPL', cno, 'ACTN', anid);
  let actn = null;
  if (k) {
    const r = new Reader(cf.data('ACTN', k.cno));
    r.bo(); r.i16();
    const grfactn = r.u32();
    const ggcl = cf.kid('ACTN', k.cno, 'GGCL', 0);
    const glxf = cf.kid('ACTN', k.cno, 'GLXF', 0);
    const gl = readGL(cf.data('GLXF', glxf.cno));
    const matrices = gl.entries.map((e) => new Reader(e, 0, gl.le).bmat34());
    const gg = readGG(cf.data('GGCL', ggcl.cno));
    const cels = gg.entries.map((e) => {
      const fr = new Reader(e.fixed, 0, gg.le);
      const chidSnd = fr.i32();
      const dwr = fr.brs();
      const vr = new Reader(e.variable, 0, gg.le);
      const cps = [];
      while (vr.remaining >= 4) cps.push({ chidModl: vr.i16(), imat34: vr.i16() });
      return { chidSnd, dwr, cps };
    });
    actn = { anid, name: cf.get('ACTN', k.cno).name, grfactn, cels, matrices };
  }
  tmpl._actions.set(anid, actn);
  return actn;
}

export function templateModel(tmpl, chid) {
  if (tmpl._models.has(chid)) return tmpl._models.get(chid);
  let m;
  if (tmpl.isTdt) {
    const tdf = tmpl.lib ? tmpl.lib.tdf(tmpl.tagTdf) : null;
    m = tdf ? tdfModel(tdf, tmpl.text.charCodeAt(chid)) : null;
    tmpl._models.set(chid, m);
    return m;
  }
  const k = tmpl.cf.kid('TMPL', tmpl.cno, 'BMDL', chid);
  m = k ? parseModel(tmpl.cf, k.cno) : null;
  tmpl._models.set(chid, m);
  return m;
}

// TDT default costume material (mtrl.cpp PmtrlNew defaults)
const TDT_MTRL = { id: 'tdt-default', color: [0, 0, 0], ka: 0.10, kd: 0.60, ks: 0.60, indexBase: 15, indexRange: 15, power: 50, tmap: null, txxf: null };

export function templateCmtl(tmpl, cmid) {
  if (tmpl._cmtls.has(cmid)) return tmpl._cmtls.get(cmid);
  let c;
  if (tmpl.isTdt) {
    c = cmid === 0 ? { ibset: 0, parts: tmpl.text.split('').map(() => ({ mtrl: TDT_MTRL, model: null })) } : null;
    tmpl._cmtls.set(cmid, c);
    return c;
  }
  const k = tmpl.cf.kid('TMPL', tmpl.cno, 'CMTL', cmid);
  c = k ? parseCmtl(tmpl.cf, k.cno) : null;
  tmpl._cmtls.set(cmid, c);
  return c;
}

// --- 3-D fonts (TDF) and 3-D text actors (TDT) -----------------------------

export function parseTdf(cf, cno) {
  const r = new Reader(cf.data('TDF ', cno));
  r.bo(); r.i16();
  const cch = r.i32();
  const dyrMax = r.brs();
  const dxr = [], dyr = [];
  for (let i = 0; i < cch; i++) dxr.push(r.brs());
  for (let i = 0; i < cch; i++) dyr.push(r.brs());
  return { cf, cno, name: cf.get('TDF ', cno).name, cch, dyrMax, dxr, dyr };
}

/** Model for a character: BMDL kid of the TDF with chid == char code. */
export function tdfModel(tdf, chCode) {
  const c = tdf.cf.get('TDF ', tdf.cno);
  const k = c.kids.find((kid) => kid.ctg === 'BMDL' && kid.chid === chCode);
  return k ? parseModel(tdf.cf, k.cno) : null;
}

// 3-D text shapes (inc/tdt.h)
export const TDTS = { Normal: 0, ArchPositive: 1, CircleY: 2, LargeMiddle: 3, ArchNegative: 4, ArchZ: 5, CircleZ: 6, Vertical: 7, GrowRight: 8, GrowLeft: 9 };
// 3-D text actions: cel counts per tda (tdt.cpp _CcelOfTda)
const TDT_CCEL = [1, 12, 12, 12, 12, 12, 12, 12, 24, 24, 24, 24, 24, 24, 12, 12];
const TDT_DWR = 5.0, TDT_DWR_WALK = 1.0;

function buildTdtTemplate(cf, cno, name, rest, grftmpl, tdtKid, lib) {
  const r = new Reader(cf.data('TDT ', tdtKid.cno));
  r.bo(); r.i16();
  const tdts = r.i32();
  const tagTdf = r.tag();
  return makeTdtTemplate(lib, name, tdts, tagTdf, { cf, cno, rest, grftmpl });
}

// TDT::PtdtNew — a TDT built at runtime (spletter easel) instead of parsed
// from a TMPL chunk. Models/actions/materials resolve through lib like parsed
// TDTs; cf/cno stay null until the template is registered (Library.addTmpl).
export function makeTdtTemplate(lib, text, tdts, tagTdf, over: any = {}) {
  if (!text.length) text = ' ';
  const cch = text.length;
  return {
    cf: null, cno: -1, rest: [0, 0, 0], grftmpl: 2, ...over,
    name: text,
    isTdt: true, isProp: !!(over.grftmpl & 4),
    tdts, tagTdf, text, lib,
    parents: new Array(cch).fill(-1),
    ibsets: new Array(cch).fill(0),
    cbset: 1, cmids: [[0]],
    _actions: new Map(), _models: new Map(), _cmtls: new Map(),
  };
}

const preMul = (m, t) => M.mul(t, m);
const postMul = (m, t) => M.mul(m, t);
const shearY = (sx, sz) => [1, sx, 0, 0, 1, 0, 0, sz, 1, 0, 0, 0];
const shearZ = (sx, sy) => [1, 0, sx, 0, 1, sy, 0, 0, 1, 0, 0, 0];

// tdt.cpp _ApplyShape
function tdtApplyShape(m, tdts, xrChar, dxrText, yrChar, dyrMax, dyrTotal) {
  const PI = Math.PI;
  const dxrTextQuarter = dxrText / 4;
  const xrFract = (xrChar + dxrText / 2) / dxrText;
  const rRadius = dxrText / (2 * PI);
  switch (tdts) {
    case TDTS.ArchPositive: m = postMul(m, M.translate(xrChar, dxrTextQuarter * Math.sin(PI * xrFract), 0)); break;
    case TDTS.CircleY: m = postMul(m, M.translate(0, 0, rRadius)); m = postMul(m, M.rotY(2 * PI * xrFract)); break;
    case TDTS.LargeMiddle: m = postMul(m, M.translate(xrChar, 0, 0)); m = postMul(m, M.scale(1, 1 + Math.sin(PI * xrFract), 1)); break;
    case TDTS.ArchNegative: m = postMul(m, M.translate(xrChar, dxrTextQuarter * (1 - Math.sin(PI * xrFract)), 0)); break;
    case TDTS.ArchZ: m = postMul(m, M.translate(xrChar, 0, dxrTextQuarter * Math.sin(PI * xrFract))); break;
    case TDTS.CircleZ: m = postMul(m, M.translate(0, rRadius, 0)); m = postMul(m, M.rotZ(-2 * PI * xrFract)); break;
    case TDTS.Vertical: m = postMul(m, M.translate(0, dyrTotal - yrChar, 0)); break;
    case TDTS.GrowRight: m = postMul(m, M.translate(xrChar, 0, 0)); m = postMul(m, M.scale(1, 1 + xrFract, 1)); break;
    case TDTS.GrowLeft: m = postMul(m, M.translate(xrChar, 0, 0)); m = postMul(m, M.scale(1, 1 + (1 - xrFract), 1)); break;
    default: m = postMul(m, M.translate(xrChar, 0, 0)); break;
  }
  return m;
}

// tdt.cpp _ApplyAction
function tdtApplyAction(m, tda, ich, ccel, icel, xrChar, dxrText) {
  const PI = Math.PI;
  const dxrTextHalf = dxrText / 2;
  const xrFract = (xrChar + dxrTextHalf) / dxrText;
  const rFractCel = icel / ccel;
  const rSwing = Math.sin(2 * PI * rFractCel);
  switch (tda) {
    case 1: m = preMul(m, M.rotX(rFractCel * 2 * PI)); break;
    case 2: m = preMul(m, M.rotY(rFractCel * 2 * PI)); break;
    case 3: m = preMul(m, M.rotZ(rFractCel * 2 * PI)); break;
    case 4: m = preMul(m, shearY(0.25 * rSwing, 0)); break;
    case 5: m = preMul(m, shearZ(0, 0.5 * rSwing)); break;
    case 6: m = preMul(m, shearY(0, 0.5 * rSwing)); break;
    case 7: { const s = 1 + 0.25 * rSwing; m = preMul(m, M.scale(s, s, s)); break; }
    case 8: m = postMul(m, M.rotX(rFractCel * 2 * PI)); break;
    case 9: m = postMul(m, M.rotY(-rFractCel * 2 * PI)); break;
    case 10: m = postMul(m, M.rotZ(rFractCel * 2 * PI)); break;
    case 11: { // wave
      let rTheta = (xrFract - rFractCel) * 3 * PI;
      if (rTheta < -2 * PI) rTheta += 3 * PI;
      rTheta = Math.max(0, Math.min(PI, rTheta));
      m = preMul(m, M.scale(1, 1 + Math.sin(rTheta), 1));
      break;
    }
    case 12: { // reveal
      let dxr;
      const half = ccel / 2;
      if (icel < half) {
        dxr = (icel / half) * (4 / 3);
        let rTheta = (xrFract - dxr) * 3 * PI + PI + PI / 2;
        rTheta = Math.max(PI / 2, Math.min(PI + PI / 2, rTheta));
        m = preMul(m, M.scale(1, 0.6 + 0.5 * Math.sin(rTheta), 1));
      } else {
        dxr = ((icel - half) / half) * (4 / 3);
        let rTheta = (xrFract - dxr) * 3 * PI + PI;
        rTheta = Math.max(-PI / 2, Math.min(PI / 2, rTheta));
        m = preMul(m, M.scale(1, 0.6 + 0.5 * Math.sin(rTheta), 1));
      }
      break;
    }
    case 13: { // walk
      const fOdd = ich % 2 !== 0;
      let dzr;
      if (fOdd) dzr = (icel < ccel / 2 ? ccel / 2 - icel : icel - ccel / 2) * TDT_DWR_WALK;
      else dzr = (icel < ccel / 2 ? icel : ccel - icel) * TDT_DWR_WALK;
      let rTheta = rFractCel * 2 * PI;
      if (fOdd) rTheta -= PI;
      rTheta = Math.max(0, Math.min(PI, rTheta));
      m = preMul(m, M.translate(0, Math.sin(rTheta), dzr));
      break;
    }
    case 14: { // hop
      let dyr = 0, yrScale = 1;
      if (icel < (ccel * 2) / 3) {
        const rTheta = (icel / ((ccel * 2) / 3)) * PI;
        dyr = Math.sin(rTheta);
      } else {
        const rTheta = ((icel - (ccel * 2) / 3) / (ccel / 3)) * PI + PI;
        yrScale = 1 + Math.sin(rTheta) / 2;
      }
      m = preMul(m, M.translate(0, dyr, 0));
      m = preMul(m, M.scale(1, yrScale, 1));
      break;
    }
    case 15: { // stretch
      const rTheta = rFractCel * 2 * PI + PI + PI / 2;
      const dyr = Math.sin(rTheta);
      m = preMul(m, M.scale(1.5 + dyr / 2, 1, 1));
      break;
    }
    default: break;
  }
  return m;
}

// tdt.cpp _Pglbmat34Build + _PggcelBuild + _PactnBuild
function tdtBuildAction(tmpl, tda) {
  if (tda < 0 || tda > 15 || !tmpl.lib) return null;
  const tdf = tmpl.lib.tdf(tmpl.tagTdf);
  if (!tdf) return null;
  const text = tmpl.text;
  const cch = text.length;
  const ccel = TDT_CCEL[tda];
  const dxrChar = (i) => tdf.dxr[text.charCodeAt(i)] || 0;
  const dyrChar = (i) => tdf.dyr[text.charCodeAt(i)] || 0;
  let dxrTotal = 0, dyrTotal = 0;
  for (let i = 0; i < cch; i++) { dxrTotal += dxrChar(i); dyrTotal += dyrChar(i); }
  if (dxrTotal <= 0) dxrTotal = 1e-6;
  const dxrHalf = dxrTotal / 2;
  const matrices = [], cels = [];
  for (let icel = 0; icel < ccel; icel++) {
    let xrChar = -dxrHalf, yrChar = 0;
    const cps = [];
    for (let ich = 0; ich < cch; ich++) {
      const dxrC = dxrChar(ich), dyrC = dyrChar(ich);
      let xrCharCenter = xrChar + dxrC / 2;
      let dxrTotal2 = dxrTotal;
      let m = M.identity();
      if (tda === 15) { // stretch scales the layout width first
        const dyr = Math.sin((icel / ccel) * 2 * Math.PI + Math.PI + Math.PI / 2);
        const rFractStretch = 1.5 + dyr / 2;
        xrCharCenter *= rFractStretch;
        dxrTotal2 = dxrTotal * rFractStretch;
      }
      m = tdtApplyShape(m, tmpl.tdts, xrCharCenter, dxrTotal2, yrChar + dyrC, tdf.dyrMax, dyrTotal);
      m = tdtApplyAction(m, tda, ich, ccel, icel, xrCharCenter, dxrTotal2);
      if (tmpl.tdts === TDTS.CircleZ) m = postMul(m, M.translate(0, dxrTotal / (2 * Math.PI) + tdf.dyrMax, 0));
      matrices.push(m);
      cps.push({ chidModl: ich, imat34: icel * cch + ich });
      xrChar += dxrC;
      yrChar += dyrC;
    }
    cels.push({ chidSnd: 0, dwr: tda === 13 ? TDT_DWR_WALK : TDT_DWR, cps });
  }
  // factnStatic | factnRotateY
  return { anid: tda, name: `tda${tda}`, grfactn: 8 | 2, cels, matrices };
}

const modelCache = new WeakMap();
export function parseModel(cf, cno) {
  let cache = modelCache.get(cf);
  if (!cache) modelCache.set(cf, (cache = new Map()));
  if (cache.has(cno)) return cache.get(cno);
  const r = new Reader(cf.data('BMDL', cno));
  r.bo(); r.i16();
  const cver = r.i16(), cfac = r.i16();
  r.brs(); // radius
  r.skip(24 + 12); // bounds, pivot
  const positions = new Float32Array(cver * 3);
  const uvs = new Float32Array(cver * 2);
  for (let i = 0; i < cver; i++) {
    const p = 48 + i * 32;
    r.seek(p);
    positions[i * 3] = r.brs(); positions[i * 3 + 1] = r.brs(); positions[i * 3 + 2] = r.brs();
    uvs[i * 2] = r.brs(); uvs[i * 2 + 1] = r.brs();
  }
  const faceOff = 48 + cver * 32;
  const indices = new Uint16Array(cfac * 3);
  const smoothing = new Uint16Array(cfac);
  for (let i = 0; i < cfac; i++) {
    r.seek(faceOff + i * 32);
    indices[i * 3] = r.u16(); indices[i * 3 + 1] = r.u16(); indices[i * 3 + 2] = r.u16();
    r.skip(6 + 4);
    smoothing[i] = r.u16();
  }
  const m = { cno, positions, uvs, indices, smoothing };
  cache.set(cno, m);
  return m;
}

export function parseCmtl(cf, cno) {
  const r = new Reader(cf.data('CMTL', cno));
  r.bo(); r.i16();
  const ibset = r.i32();
  const kids = cf.kidsOf('CMTL', cno);
  let cbprt = 0;
  for (const k of kids) cbprt = Math.max(cbprt, k.chid + 1);
  const parts = [];
  for (let i = 0; i < cbprt; i++) {
    const km = kids.find((k) => k.ctg === 'MTRL' && k.chid === i);
    const kb = kids.find((k) => k.ctg === 'BMDL' && k.chid === i);
    parts.push({
      mtrl: km ? parseMtrl(cf, km.cno) : null,
      model: kb ? parseModel(cf, kb.cno) : null,
    });
  }
  return { cno, ibset, parts };
}

const mtrlCache = new WeakMap();
export function parseMtrl(cf, cno) {
  let cache = mtrlCache.get(cf);
  if (!cache) mtrlCache.set(cf, (cache = new Map()));
  if (cache.has(cno)) return cache.get(cno);
  const r = new Reader(cf.data('MTRL', cno));
  r.bo(); r.i16();
  const brc = r.u32();
  const ka = r.bruf(), kd = r.bruf(), ks = r.bruf();
  const indexBase = r.u8(), indexRange = r.u8();
  const power = r.brs();
  const m = {
    id: `${cf.name}:${cno}`,
    color: [(brc >> 16) & 255, (brc >> 8) & 255, brc & 255],
    ka, kd, ks, indexBase, indexRange, power, tmap: null, txxf: null,
  };
  const kt = cf.kid('MTRL', cno, 'TMAP', 0);
  if (kt) {
    m.tmap = parseTmap(cf.data('TMAP', kt.cno));
    m.tmap.id = `${cf.name}:TMAP:${kt.cno}`;
    const kx = cf.kid('MTRL', cno, 'TXXF', 0);
    if (kx) {
      const xr = new Reader(cf.data('TXXF', kx.cno));
      xr.bo(); xr.i16();
      m.txxf = xr.bmat23();
    }
  }
  cache.set(cno, m);
  return m;
}

export function parseTmap(bytes) {
  const r = new Reader(bytes);
  r.bo(); r.i16();
  const cbRow = r.i16();
  const type = r.u8(), grftmap = r.u8();
  r.i16(); r.i16();
  const dxp = r.i16(), dyp = r.i16();
  return { cbRow, type, grftmap, width: dxp, height: dyp, pixels: bytes.subarray(20, 20 + cbRow * dyp) };
}

export function parseBkgd(cf, cno) {
  const r = new Reader(cf.data('BKGD', cno));
  r.bo(); r.i16();
  const indexBase = r.u8();
  const bkgd = { cf, cno, name: cf.get('BKGD', cno).name, indexBase, palette: null, lights: [], cameras: [] };
  const kc = cf.kid('BKGD', cno, 'GLCR', 0);
  if (kc) {
    const gl = readGL(cf.data('GLCR', kc.cno));
    bkgd.palette = gl.entries.map((e) => [e[2], e[1], e[0]]); // CLR is b,g,r,0
  }
  const kl = cf.kid('BKGD', cno, 'GLLT', 0);
  if (kl) {
    const gl = readGL(cf.data('GLLT', kl.cno));
    bkgd.lights = gl.entries.map((e) => {
      const lr = new Reader(e, 0, gl.le);
      return { matrix: lr.bmat34(), intensity: lr.brs(), type: lr.i32() };
    });
  }
  for (const k of cf.kidsOf('BKGD', cno, 'CAM ')) bkgd.cameras[k.chid] = k.cno;
  return bkgd;
}

export function parseCamera(cf, cno) {
  const r = new Reader(cf.data('CAM ', cno));
  r.bo(); r.i16();
  const hither = r.brs(), yon = r.brs(), fov = r.bra();
  r.i16();
  const apos = [r.brs(), r.brs(), r.brs()];
  const matrix = r.bmat34();
  const extraApos = [];
  while (r.remaining >= 12) extraApos.push([r.brs(), r.brs(), r.brs()]);
  const km = cf.kid('CAM ', cno, 'MBMP', 0);
  const kz = cf.kid('CAM ', cno, 'ZBMP', 0);
  return {
    cno, hither, yon, fov, apos, extraApos, matrix,
    rgb: km ? parseMbmp(cf.data('MBMP', km.cno)) : null,
    z: kz ? parseZbmp(cf.data('ZBMP', kz.cno)) : null,
  };
}

/** Decode a Kauai MBMP into an indexed bitmap; transparent = -1 (Int16Array). */
export function parseMbmp(bytes) {
  const r = new Reader(bytes);
  r.bo(); r.i16();
  const fMask = r.u8(), bFill = r.u8();
  r.i16();
  const left = r.i32(), top = r.i32(), right = r.i32(), bottom = r.i32();
  r.i32();
  const width = right - left, height = bottom - top;
  const pixels = new Int16Array(Math.max(0, width * height)).fill(-1);
  const rowLens = [];
  for (let y = 0; y < height; y++) rowLens.push(r.i16());
  let p = r.pos;
  for (let y = 0; y < height; y++) {
    const end = p + rowLens[y];
    let x = 0;
    let q = p;
    while (q < end) {
      x += bytes[q++]; // transparent run
      if (q >= end) break;
      const n = bytes[q++];
      for (let i = 0; i < n; i++) pixels[y * width + x + i] = fMask ? bFill : bytes[q + i];
      if (!fMask) q += n;
      x += n;
    }
    p = end;
  }
  return { left, top, width, height, pixels };
}

export function parseZbmp(bytes) {
  const r = new Reader(bytes);
  r.bo(); r.i16();
  const left = r.i16(), top = r.i16(), width = r.i16(), height = r.i16();
  const z = new Uint16Array(width * height);
  const dv = new DataView(bytes.buffer, bytes.byteOffset + 12);
  for (let i = 0; i < z.length; i++) z[i] = dv.getUint16(i * 2, true);
  return { left, top, width, height, z };
}

// --- text boxes (TBOX/RTXT) ------------------------------------------------

// rich-text style changes (kauai rtxt.h sprm*; chp sprms 1-4, pap sprms 128+)
export const SPRM = {
  Style: 1, Font: 2, Fore: 3, Back: 4,
  Horz: 128, Vert: 129, After: 130, Object: 192,
};

// TBOXH: bo,osk,nfrmFirst,nfrmMax,xpLeft,xpRight,ypTop,ypBottom,chid,fStory
export function parseTbox(cf, cno) {
  const r = new Reader(cf.data('TBOX', cno));
  r.bo(); r.i16();
  const nfrmFirst = r.i32(), nfrmMax = r.i32();
  const xpLeft = r.i32(), xpRight = r.i32(), ypTop = r.i32(), ypBottom = r.i32();
  const chid = r.i32();
  const fStory = r.i32() !== 0;
  let rtxt = null;
  for (const k of cf.kidsOf('TBOX', cno, 'RTXT')) {
    if (k.chid === chid || !rtxt) rtxt = parseRtxt(cf, k.cno);
    if (k.chid === chid) break;
  }
  return { cno, nfrmFirst, nfrmMax, l: xpLeft, t: ypTop, r: xpRight, b: ypBottom, fStory, rtxt };
}

// RTXT: doc props + font STN, with TEXT / GLMP (mpe GL) / AGPA (font names) kids
export function parseRtxt(cf, cno) {
  const bytes = cf.data('RTXT', cno);
  const r = new Reader(bytes);
  r.bo(); r.i16(); // oskFont
  const dxpDef = r.i32(), dypFont = r.i32();
  const acrBack = r.u32();
  const font = readStn(bytes, r.pos).str;
  const doc = { font, dxpDef, dypFont, acrBack, text: '', mpes: [], fonts: [] };
  for (const k of cf.kidsOf('RTXT', cno)) {
    if (k.ctg === 'TEXT') {
      const d = cf.data('TEXT', k.cno);
      const tr = new Reader(d);
      const osk = tr.u16();
      if (osk === 0x0303 || osk === 0x0101 || osk === 0x0301 || osk === 0x0103) {
        doc.text = String.fromCharCode(...d.subarray(2));
      } else {
        const dv = new DataView(d.buffer, d.byteOffset + 2);
        for (let i = 0; i < dv.byteLength / 2; i++) doc.text += String.fromCharCode(dv.getUint16(i * 2, osk === 0x0505 || osk === 0x0405));
      }
    } else if (k.ctg === 'GLMP') {
      const gl = readGL(cf.data('GLMP', k.cno));
      doc.mpes = gl.entries.map((e) => {
        const er = new Reader(e, 0, gl.le);
        const spcp = er.u32();
        return { sprm: spcp >>> 24, cp: spcp & 0xffffff, lw: er.i32() };
      });
    } else if (k.ctg === 'AGPA') {
      const gg = readGG(cf.data('AGPA', k.cno));
      doc.fonts = gg.entries.map((e) => {
        if (!e) return null;
        const er = new Reader(e.variable, 0, gg.le);
        er.i32(); er.i16();
        return readStn(e.variable, er.pos).str;
      });
    }
  }
  return doc;
}

// --- movie sounds (MSND) ----------------------------------------------------

export const STY = { Nil: 0, Unused: 1, Sfx: 2, Speech: 3, Midi: 4 };

// MSNDF: bo,osk,sty,vlmDefault,fInvalid + WAVE or MIDS kid
export function parseMsnd(cf, cno) {
  const r = new Reader(cf.data('MSND', cno));
  r.bo(); r.i16();
  const sty = r.i32();
  const vlm = r.brs();
  const invalid = r.i32() !== 0;
  let wavCno = null, midiCno = null;
  for (const k of cf.kidsOf('MSND', cno)) {
    if (k.ctg === 'WAVE') wavCno = k.cno;
    else if (k.ctg === 'MIDS') midiCno = k.cno;
  }
  return { cf, cno, name: cf.get('MSND', cno).name, sty, vlm, invalid, wavCno, midiCno };
}
