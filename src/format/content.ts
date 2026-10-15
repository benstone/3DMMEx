// Parsers for the movie content chunks: actor/prop templates, actions,
// models, materials, backgrounds, cameras, bitmaps, textboxes, 3D fonts and
// sounds. Chunk layouts match the original file formats.
import { Reader, readStn } from './binary.ts';
import { readGL, readGG } from './chunky.ts';
import * as M from '../engine/mat34.ts';

/** Read a GL's entries as i16 lists — used for parent/index arrays. */
const shorts = (gl) => gl.entries.map((e) => new Reader(e, 0, gl.le).i16());

/** Parse a TMPL chunk — part parent/ibset tables, costume material lists,
 *  rest orientation, and flags. A TDT kid means it's 3D text and gets a
 *  runtime-built template instead. */
export function parseTemplate(chunkyFile, cno, contentLibrary = null) {
  const r = new Reader(chunkyFile.data('TMPL', cno));
  r.bo(); r.i16();
  const xaRest = r.bra(), yaRest = r.bra(), zaRest = r.bra();
  r.i16();
  const grftmpl = r.u32();
  const kid = (ctg, chid = 0) => chunkyFile.kid('TMPL', cno, ctg, chid);
  const tdt = kid('TDT ');
  if (tdt) return buildTdtTemplate(chunkyFile, cno, chunkyFile.get('TMPL', cno).name, [xaRest, yaRest, zaRest], grftmpl, tdt, contentLibrary);
  const glpi = kid('GLPI'), glbs = kid('GLBS'), ggcm = kid('GGCM');
  const parents = shorts(readGL(chunkyFile.data('GLPI', glpi.cno)));
  const ibsets = shorts(readGL(chunkyFile.data('GLBS', glbs.cno)));
  const cmids = [];
  if (ggcm) {
    const gg = readGG(chunkyFile.data('GGCM', ggcm.cno));
    for (const e of gg.entries) {
      const vr = new Reader(e.variable, 0, gg.le);
      const list = [];
      while (vr.remaining >= 4) list.push(vr.i32());
      cmids.push(list);
    }
  }
  const cbset = ibsets.reduce((a, b) => Math.max(a, b), -1) + 1;
  return {
    chunkyFile, cno, name: chunkyFile.get('TMPL', cno).name,
    rest: [xaRest, yaRest, zaRest], grftmpl,
    isTdt: !!(grftmpl & 2), isProp: !!(grftmpl & 4),
    parents, ibsets, cbset, cmids,
    _actions: new Map(), _models: new Map(), _cmtls: new Map(),
  };
}

/** Action `anid` of a template — parsed on first use and cached; 3D-text
 *  templates synthesize theirs. */
export function templateAction(template, anid) {
  if (template._actions.has(anid)) return template._actions.get(anid);
  if (template.isTdt) {
    const actn = tdtBuildAction(template, anid);
    template._actions.set(anid, actn);
    return actn;
  }
  const { chunkyFile, cno } = template;
  const k = chunkyFile.kid('TMPL', cno, 'ACTN', anid);
  let actn = null;
  if (k) {
    const r = new Reader(chunkyFile.data('ACTN', k.cno));
    r.bo(); r.i16();
    const grfactn = r.u32();
    const ggcl = chunkyFile.kid('ACTN', k.cno, 'GGCL', 0);
    const glxf = chunkyFile.kid('ACTN', k.cno, 'GLXF', 0);
    const gl = readGL(chunkyFile.data('GLXF', glxf.cno));
    const matrices = gl.entries.map((e) => new Reader(e, 0, gl.le).bmat34());
    const gg = readGG(chunkyFile.data('GGCL', ggcl.cno));
    const cels = gg.entries.map((e) => {
      const fr = new Reader(e.fixed, 0, gg.le);
      const chidSnd = fr.i32();
      const dwr = fr.brs();
      const vr = new Reader(e.variable, 0, gg.le);
      const cps = [];
      while (vr.remaining >= 4) cps.push({ chidModl: vr.i16(), imat34: vr.i16() });
      return { chidSnd, dwr, cps };
    });
    actn = { anid, name: chunkyFile.get('ACTN', k.cno).name, grfactn, cels, matrices };
  }
  template._actions.set(anid, actn);
  return actn;
}

/** Part model `chid` of a template — parsed on first use and cached; 3D-text
 *  parts resolve to a font glyph model. */
export function templateModel(template, chid) {
  if (template._models.has(chid)) return template._models.get(chid);
  let m;
  if (template.isTdt) {
    const tdf = template.contentLibrary ? template.contentLibrary.tdf(template.tagTdf) : null;
    m = tdf ? tdfModel(tdf, template.text.charCodeAt(chid)) : null;
    template._models.set(chid, m);
    return m;
  }
  const k = template.chunkyFile.kid('TMPL', template.cno, 'BMDL', chid);
  m = k ? parseModel(template.chunkyFile, k.cno) : null;
  template._models.set(chid, m);
  return m;
}

// Default 3D-text material — flat dark gray, index-mapped
const TDT_MTRL = { id: 'tdt-default', color: [0, 0, 0], ka: 0.10, kd: 0.60, ks: 0.60, indexBase: 15, indexRange: 15, power: 50, tmap: null, txxf: null };

/** Costume material list `cmid` of a template — parsed on first use and
 *  cached; 3D-text gets a single default-material costume. */
export function templateCmtl(template, cmid) {
  if (template._cmtls.has(cmid)) return template._cmtls.get(cmid);
  let c;
  if (template.isTdt) {
    c = cmid === 0 ? { ibset: 0, parts: template.text.split('').map(() => ({ mtrl: TDT_MTRL, model: null })) } : null;
    template._cmtls.set(cmid, c);
    return c;
  }
  const k = template.chunkyFile.kid('TMPL', template.cno, 'CMTL', cmid);
  c = k ? parseCmtl(template.chunkyFile, k.cno) : null;
  template._cmtls.set(cmid, c);
  return c;
}

 // --- 3-D fonts (TDF) and 3-D text actors (TDT) -----------------------------

/** Parse a TDF chunk — per-glyph width/height metrics and max height. */
export function parseTdf(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('TDF ', cno));
  r.bo(); r.i16();
  const cch = r.i32();
  const dyrMax = r.brs();
  const dxr = [], dyr = [];
  for (let i = 0; i < cch; i++) dxr.push(r.brs());
  for (let i = 0; i < cch; i++) dyr.push(r.brs());
  return { chunkyFile, cno, name: chunkyFile.get('TDF ', cno).name, cch, dyrMax, dxr, dyr };
}

/** Glyph model for a character — the font's model kid whose child id equals the char code. */
export function tdfModel(tdf, chCode) {
  const c = tdf.chunkyFile.get('TDF ', tdf.cno);
  const k = c.kids.find((kid) => kid.ctg === 'BMDL' && kid.chid === chCode);
  return k ? parseModel(tdf.chunkyFile, k.cno) : null;
}

/** 3-D text shape ids — the layout warps offered by the spletter easel. */
export const TDTS = { Normal: 0, ArchPositive: 1, CircleY: 2, LargeMiddle: 3, ArchNegative: 4, ArchZ: 5, CircleZ: 6, Vertical: 7, GrowRight: 8, GrowLeft: 9 };
// Cel counts per 3D-text action id
const TDT_CCEL = [1, 12, 12, 12, 12, 12, 12, 12, 24, 24, 24, 24, 24, 24, 12, 12];
const TDT_DWR = 5.0, TDT_DWR_WALK = 1.0;

/** Build a template for a TMPL whose TDT kid marks it as 3D text — reads the
 *  shape id + font tag, then delegates to `makeTdtTemplate`. */
function buildTdtTemplate(chunkyFile, cno, name, rest, grftmpl, tdtKid, contentLibrary) {
  const r = new Reader(chunkyFile.data('TDT ', tdtKid.cno));
  r.bo(); r.i16();
  const tdts = r.i32();
  const tagTdf = r.tag();
  return makeTdtTemplate(contentLibrary, name, tdts, tagTdf, { chunkyFile, cno, rest, grftmpl });
}

/** Build a 3D-text template at runtime (spletter easel) rather than parsing a
 *  TMPL chunk — models/actions/materials resolve through `contentLibrary` like
 *  parsed templates; chunkyFile/cno stay null until `Library.addTemplate`
 *  registers it. */
export function makeTdtTemplate(contentLibrary, text, tdts, tagTdf, over: any = {}) {
  if (!text.length) text = ' ';
  const cch = text.length;
  return {
    chunkyFile: null, cno: -1, rest: [0, 0, 0], grftmpl: 2, ...over,
    name: text,
    isTdt: true, isProp: !!(over.grftmpl & 4),
    tdts, tagTdf, text, contentLibrary,
    parents: new Array(cch).fill(-1),
    ibsets: new Array(cch).fill(0),
    cbset: 1, cmids: [[0]],
    _actions: new Map(), _models: new Map(), _cmtls: new Map(),
  };
}

/** Multiply `m` on the left by transform `t` (pre-multiply). */
const preMul = (m, t) => M.mul(t, m);
/** Multiply `m` on the right by transform `t` (post-multiply). */
const postMul = (m, t) => M.mul(m, t);
/** Shear matrix on the Y axis. */
const shearY = (sx, sz) => [1, sx, 0, 0, 1, 0, 0, sz, 1, 0, 0, 0];
/** Shear matrix on the Z axis. */
const shearZ = (sx, sy) => [1, 0, sx, 0, 1, sy, 0, 0, 1, 0, 0, 0];

/** Warp a glyph matrix by the text shape — arches, circles, growth, vertical. */
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

/** Warp a glyph matrix by the text action — spin, wave, walk, hop, stretch,
 *  etc. `ich`/`icel`/`ccel` identify the glyph and cel within the action. */
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

/** Synthesize a 3D-text action — per-cel glyph matrices after shape+action
 *  warps, plus the part assignments binding each glyph model to a matrix. */
function tdtBuildAction(template, tda) {
  if (tda < 0 || tda > 15 || !template.contentLibrary) return null;
  const tdf = template.contentLibrary.tdf(template.tagTdf);
  if (!tdf) return null;
  const text = template.text;
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
      m = tdtApplyShape(m, template.tdts, xrCharCenter, dxrTotal2, yrChar + dyrC, tdf.dyrMax, dyrTotal);
      m = tdtApplyAction(m, tda, ich, ccel, icel, xrCharCenter, dxrTotal2);
      if (template.tdts === TDTS.CircleZ) m = postMul(m, M.translate(0, dxrTotal / (2 * Math.PI) + tdf.dyrMax, 0));
      matrices.push(m);
      cps.push({ chidModl: ich, imat34: icel * cch + ich });
      xrChar += dxrC;
      yrChar += dyrC;
    }
    cels.push({ chidSnd: 0, dwr: tda === 13 ? TDT_DWR_WALK : TDT_DWR, cps });
  }
  // static + rotate-with-path action flags
  return { anid: tda, name: `tda${tda}`, grfactn: 8 | 2, cels, matrices };
}

const modelCache = new WeakMap(); // file -> cno -> model (parse once)
/** Parse a BMDL chunk — vertex positions/UVs, triangle indices, smoothing groups. */
export function parseModel(chunkyFile, cno) {
  let cache = modelCache.get(chunkyFile);
  if (!cache) modelCache.set(chunkyFile, (cache = new Map()));
  if (cache.has(cno)) return cache.get(cno);
  const r = new Reader(chunkyFile.data('BMDL', cno));
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

/** Parse a CMTL chunk — a costume material list: per-part material + optional
 *  replacement model, targeted at one ibset. */
export function parseCmtl(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('CMTL', cno));
  r.bo(); r.i16();
  const ibset = r.i32();
  const kids = chunkyFile.kidsOf('CMTL', cno);
  let cbprt = 0;
  for (const k of kids) cbprt = Math.max(cbprt, k.chid + 1);
  const parts = [];
  for (let i = 0; i < cbprt; i++) {
    const km = kids.find((k) => k.ctg === 'MTRL' && k.chid === i);
    const kb = kids.find((k) => k.ctg === 'BMDL' && k.chid === i);
    parts.push({
      mtrl: km ? parseMtrl(chunkyFile, km.cno) : null,
      model: kb ? parseModel(chunkyFile, kb.cno) : null,
    });
  }
  return { cno, ibset, parts };
}

const mtrlCache = new WeakMap(); // file -> cno -> material (parse once)
/** Parse an MTRL chunk — color, ambient/diffuse/specular, index range, power,
 *  plus texture map + transform when present. */
export function parseMtrl(chunkyFile, cno) {
  let cache = mtrlCache.get(chunkyFile);
  if (!cache) mtrlCache.set(chunkyFile, (cache = new Map()));
  if (cache.has(cno)) return cache.get(cno);
  const r = new Reader(chunkyFile.data('MTRL', cno));
  r.bo(); r.i16();
  const brc = r.u32();
  const ka = r.bruf(), kd = r.bruf(), ks = r.bruf();
  const indexBase = r.u8(), indexRange = r.u8();
  const power = r.brs();
  const m = {
    id: `${chunkyFile.name}:${cno}`,
    color: [(brc >> 16) & 255, (brc >> 8) & 255, brc & 255],
    ka, kd, ks, indexBase, indexRange, power, tmap: null, txxf: null,
  };
  const kt = chunkyFile.kid('MTRL', cno, 'TMAP', 0);
  if (kt) {
    m.tmap = parseTmap(chunkyFile.data('TMAP', kt.cno));
    m.tmap.id = `${chunkyFile.name}:TMAP:${kt.cno}`;
    const kx = chunkyFile.kid('MTRL', cno, 'TXXF', 0);
    if (kx) {
      const xr = new Reader(chunkyFile.data('TXXF', kx.cno));
      xr.bo(); xr.i16();
      m.txxf = xr.bmat23();
    }
  }
  cache.set(cno, m);
  return m;
}

/** Parse a TMAP chunk body — an indexed texture map (8-bit palette indexes). */
export function parseTmap(bytes) {
  const r = new Reader(bytes);
  r.bo(); r.i16();
  const cbRow = r.i16();
  const type = r.u8(), grftmap = r.u8();
  r.i16(); r.i16();
  const dxp = r.i16(), dyp = r.i16();
  return { cbRow, type, grftmap, width: dxp, height: dyp, pixels: bytes.subarray(20, 20 + cbRow * dyp) };
}

/** Parse a BKGD chunk — palette, lights, and the camera chunk-number table. */
export function parseBkgd(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('BKGD', cno));
  r.bo(); r.i16();
  const indexBase = r.u8();
  const bkgd = { chunkyFile, cno, name: chunkyFile.get('BKGD', cno).name, indexBase, palette: null, lights: [], cameras: [] };
  const kc = chunkyFile.kid('BKGD', cno, 'GLCR', 0);
  if (kc) {
    const gl = readGL(chunkyFile.data('GLCR', kc.cno));
    bkgd.palette = gl.entries.map((e) => [e[2], e[1], e[0]]); // CLR is b,g,r,0
  }
  const kl = chunkyFile.kid('BKGD', cno, 'GLLT', 0);
  if (kl) {
    const gl = readGL(chunkyFile.data('GLLT', kl.cno));
    bkgd.lights = gl.entries.map((e) => {
      const lr = new Reader(e, 0, gl.le);
      return { matrix: lr.bmat34(), intensity: lr.brs(), type: lr.i32() };
    });
  }
  for (const k of chunkyFile.kidsOf('BKGD', cno, 'CAM ')) bkgd.cameras[k.chid] = k.cno;
  return bkgd;
}

/** Parse a CAM  chunk — clip planes, FOV, position, orientation matrix, and
 *  the background image + Z-buffer fills. */
export function parseCamera(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('CAM ', cno));
  r.bo(); r.i16();
  const hither = r.brs(), yon = r.brs(), fov = r.bra();
  r.i16();
  const apos = [r.brs(), r.brs(), r.brs()];
  const matrix = r.bmat34();
  const extraApos = [];
  while (r.remaining >= 12) extraApos.push([r.brs(), r.brs(), r.brs()]);
  const km = chunkyFile.kid('CAM ', cno, 'MBMP', 0);
  const kz = chunkyFile.kid('CAM ', cno, 'ZBMP', 0);
  return {
    cno, hither, yon, fov, apos, extraApos, matrix,
    rgb: km ? parseMbmp(chunkyFile.data('MBMP', km.cno)) : null,
    z: kz ? parseZbmp(chunkyFile.data('ZBMP', kz.cno)) : null,
  };
}

/** Decode an MBMP bitmap — RLE rows of palette indexes; -1 = transparent. */
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

/** Parse a ZBMP chunk — a 16-bit Z-buffer image used as a camera fill. */
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

/** Rich-text style-change ids recorded in a textbox's property list —
 *  character properties in 1-4, paragraph properties in 128+. */
export const SPRM = {
  Style: 1, Font: 2, Fore: 3, Back: 4,
  Horz: 128, Vert: 129, After: 130, Object: 192,
};

/** Parse a TBOX chunk — frame span, screen rect, child id, story flag, and
 *  its rich-text document (the RTXT kid matching `chid`). */
export function parseTbox(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('TBOX', cno));
  r.bo(); r.i16();
  const nfrmFirst = r.i32(), nfrmMax = r.i32();
  const xpLeft = r.i32(), xpRight = r.i32(), ypTop = r.i32(), ypBottom = r.i32();
  const chid = r.i32();
  const fStory = r.i32() !== 0;
  let rtxt = null;
  for (const k of chunkyFile.kidsOf('TBOX', cno, 'RTXT')) {
    if (k.chid === chid || !rtxt) rtxt = parseRtxt(chunkyFile, k.cno);
    if (k.chid === chid) break;
  }
  return { cno, nfrmFirst, nfrmMax, l: xpLeft, t: ypTop, r: xpRight, b: ypBottom, fStory, rtxt };
}

/** Parse an RTXT chunk — the textbox's document: default metrics, background
 *  color, base font, text (TEXT kid), property list (GLMP), font table (AGPA). */
export function parseRtxt(chunkyFile, cno) {
  const bytes = chunkyFile.data('RTXT', cno);
  const r = new Reader(bytes);
  r.bo(); r.i16(); // oskFont
  const dxpDef = r.i32(), dypFont = r.i32();
  const acrBack = r.u32();
  const font = readStn(bytes, r.pos).str;
  const doc = { font, dxpDef, dypFont, acrBack, text: '', mpes: [], fonts: [] };
  for (const k of chunkyFile.kidsOf('RTXT', cno)) {
    if (k.ctg === 'TEXT') {
      const d = chunkyFile.data('TEXT', k.cno);
      const tr = new Reader(d);
      const osk = tr.u16();
      if (osk === 0x0303 || osk === 0x0101 || osk === 0x0301 || osk === 0x0103) {
        doc.text = String.fromCharCode(...d.subarray(2));
      } else {
        const dv = new DataView(d.buffer, d.byteOffset + 2);
        for (let i = 0; i < dv.byteLength / 2; i++) doc.text += String.fromCharCode(dv.getUint16(i * 2, osk === 0x0505 || osk === 0x0405));
      }
    } else if (k.ctg === 'GLMP') {
      const gl = readGL(chunkyFile.data('GLMP', k.cno));
      doc.mpes = gl.entries.map((e) => {
        const er = new Reader(e, 0, gl.le);
        const spcp = er.u32();
        return { sprm: spcp >>> 24, cp: spcp & 0xffffff, lw: er.i32() };
      });
    } else if (k.ctg === 'AGPA') {
      const gg = readGG(chunkyFile.data('AGPA', k.cno));
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

/** Sound style ids — which mixing channel a sound queues on. */
export const STY = { Nil: 0, Unused: 1, Sfx: 2, Speech: 3, Midi: 4 };

/** Parse an MSND chunk — style, default volume, invalid flag, and the
 *  WAVE/MIDS kid chunk numbers holding the actual audio. */
export function parseMsnd(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('MSND', cno));
  r.bo(); r.i16();
  const sty = r.i32();
  const vlm = r.brs();
  const invalid = r.i32() !== 0;
  let wavCno = null, midiCno = null;
  for (const k of chunkyFile.kidsOf('MSND', cno)) {
    if (k.ctg === 'WAVE') wavCno = k.cno;
    else if (k.ctg === 'MIDS') midiCno = k.cno;
  }
  return { chunkyFile, cno, name: chunkyFile.get('MSND', cno).name, sty, vlm, invalid, wavCno, midiCno };
}
