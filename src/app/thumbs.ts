import { Reader } from '../format/binary.ts';
import { ChunkyFile } from '../format/chunky.ts';
import { parseMbmp } from '../format/content.ts';
import { miscTick } from './boot.ts';
import { B } from './res.ts';
import { lib, pal, player } from './state.ts';
// roll call thumbnails: TMTH/PRTH (TFC tmpl cno) -> GOKD -> MBMP, from actor.3th / prop.3th
export const rcTmplThumbs = new Map();
export const brwsTmpls = { actor: [], prop: [], scene: [] }; // selector grids: {cno, name, mbmp} in .3th order
export const bkthCaths = new Map(); // bkgd cno -> Map(chid -> mbmp): camera-angle thumbs, social palette
// spletter easel thumbs (easels.cht kctgTfth/kctgTsth/kctgMtth): the THD body is
// bo+i16+ctg+i32 — TFTH/MTTH carry a content tag, TSTH carries '....' + the tdts
export const spltThumbs = { font: [], shape: [], mtrl: [] }; // {tag,mbmp} | {tdts,mbmp}
export const contentName = (ctg, cno) => // display name from whichever content file holds the chunk
  lib.content.find((cf) => cf.has(ctg, cno))?.get(ctg, cno)?.name || '';
export function scanThumbFile(th, packPal = null) { // one .3th -> browser grids + easel thumbs (builtin data/ + asset packs); packPal = pack's 768-byte RGB palette (expansion thumbs index their own social palette)
  const pm = (cno) => { const m = parseMbmp(th.data('MBMP', cno)); if (packPal) (m as any).pal = packPal; return m; };
  for (const [ctg, kind] of [['TMTH', 'actor'], ['PRTH', 'prop'], ['BKTH', 'scene']]) {
    for (const t of th.ofType(ctg)) {
      const d = th.data(ctg, t.cno);
      const gk = t.kids.find((k) => k.ctg === 'GOKD');
      const mk = gk && th.get('GOKD', gk.cno).kids.find((k) => k.ctg === 'MBMP');
      if (mk && ctg === 'BKTH') { // BRWC browses the BKTH's CATH kids (chid = icam)
        const m = new Map();
        for (const k of t.kids) if (k.ctg === 'CATH') {
          const g2 = th.get('CATH', k.cno)?.kids.find((x) => x.ctg === 'GOKD');
          const m2 = g2 && th.get('GOKD', g2.cno).kids.find((x) => x.ctg === 'MBMP');
          if (m2) m.set(k.chid, pm(m2.cno));
        }
        bkthCaths.set(t.cno, m);
      }
      if (mk) {
        // TMTH/PRTH map via TFC @8; BKTH cno is the BKGD cno directly
        const cno = ctg === 'BKTH' ? t.cno : new DataView(d.buffer, d.byteOffset).getUint32(8, true);
        const mbmp = pm(mk.cno);
        if (ctg !== 'BKTH') rcTmplThumbs.set(cno, mbmp); // roll call only needs tmpl thumbs
        brwsTmpls[kind].push({ cno, name: contentName(ctg === 'BKTH' ? 'BKGD' : 'TMPL', cno), mbmp });
      }
    }
  }
  for (const [ctg, kind] of [['TFTH', 'font'], ['TSTH', 'shape'], ['MTTH', 'mtrl']]) {
    for (const t of th.ofType(ctg)) {
      const r = new Reader(th.data(ctg, t.cno)); r.bo(); r.i16();
      const ctg2 = r.ctg(), cno = r.i32();
      const gk = t.kids.find((k) => k.ctg === 'GOKD');
      const mk = gk && th.get('GOKD', gk.cno).kids.find((k) => k.ctg === 'MBMP');
      spltThumbs[kind].push(kind === 'shape'
        ? { tdts: cno, mbmp: mk ? pm(mk.cno) : null }
        : { tag: { sid: 2, ctg: ctg2, cno }, mbmp: mk ? pm(mk.cno) : null });
    }
  }
}
export async function loadBuiltinThumbs() {
for (const file of ['actor.3th', 'prop.3th', 'bkgds.3th', 'actresl.3th', 'mtrl.3th']) {
  try { scanThumbFile(new ChunkyFile(await (await fetch(`${B}data/${file}`)).arrayBuffer())); }
  catch (e) { console.warn(`${file}:`, e.message); }
  miscTick(`loading ${file}`);
}
}

export const rcThumbCache = new Map(); // tmpl cno (or 'a'+arid for TDT) -> 38x70 canvas
export function rcThumbFor(cno, actor) {
  const key = actor?.tmpl?.isTdt ? 'a' + actor.data.arid : cno;
  if (!rcThumbCache.has(key)) {
    const c = document.createElement('canvas'); c.width = 38; c.height = 70;
    const m = rcTmplThumbs.get(cno);
    if (m) {
      const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
      const P = m.pal || pal; // pack thumbs carry their own palette
      const x = src.getContext('2d'), im = x.createImageData(m.width, m.height);
      for (let i = 0; i < m.pixels.length; i++) {
        const p = m.pixels[i];
        if (p < 0) continue; // transparent run pixel
        im.data[i * 4] = P[p * 3]; im.data[i * 4 + 1] = P[p * 3 + 1]; im.data[i * 4 + 2] = P[p * 3 + 2]; im.data[i * 4 + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      // original centers the bitmap in the 38x70 frame and clips (BRWR::_FSetThumFrame) — crop, don't stretch
      const sw = Math.min(38, m.width), sh = Math.min(70, m.height);
      c.getContext('2d').drawImage(src,
        Math.max(0, (m.width - 38) >> 1), Math.max(0, (m.height - 70) >> 1), sw, sh,
        Math.max(0, (38 - m.width) >> 1), Math.max(0, (70 - m.height) >> 1), sw, sh);
    } else if (actor?.tmpl?.isTdt) {
      // TDT actors have no MBMP — original draws their name as a text gob (TGOB)
      const ctx = c.getContext('2d');
      const txt = (actor.data.name || actor.tmpl.text || actor.tmpl.name || '').trim();
      let size = 20, lines = [];
      for (; size > 6; size--) { // shrink until it fits the 34px-wide cell
        ctx.font = `bold ${size}px "Comic Sans MS", cursive, sans-serif`;
        const words = txt.split(/\s+/).filter(Boolean);
        lines = []; let cur = '', fits = true;
        for (const w of words) {
          if (ctx.measureText(w).width > 34) { fits = false; break; }
          const t = cur ? cur + ' ' + w : w;
          if (cur && ctx.measureText(t).width > 34) { lines.push(cur); cur = w; } else cur = t;
        }
        if (cur) lines.push(cur);
        if (fits && lines.length * (size + 2) <= 66) break;
      }
      ctx.font = `bold ${size}px "Comic Sans MS", cursive, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#222';
      lines.forEach((l, i) => ctx.fillText(l, 19, 35 + (i - (lines.length - 1) / 2) * (size + 2)));
    }
    rcThumbCache.set(key, c);
  }
  return rcThumbCache.get(key);
}
// roll call lists: actors on the left strip (x=3), props on the right (x=594) — pos3.chh/browser.cht
export const rcLists = [
  { x: 3, prefix: 'rcact', up: 'rcaup', dn: 'rcadwn', filter: (a) => !a.tmpl.isProp, off: 0, sel: -1, key: '', cells: [], arrows: [] },
  { x: 594, prefix: 'rcp', up: 'rcpup', dn: 'rcpdwn', filter: (a) => a.tmpl.isProp, off: 0, sel: -1, key: '', cells: [], arrows: [] },
];
export function rcActs(L) { return player ? [...player.actors.values()].filter(L.filter) : []; }


export function mbmpCanvas(m, w, h) { // draw an MBMP scaled into wxh — all baked thumbs index the social palette
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
  const P = m.pal || pal; // asset-pack thumbs carry their own palette (e.g. NICK3D.CHK GLCR)
  const x = src.getContext('2d'), im = x.createImageData(m.width, m.height);
  for (let i = 0; i < m.pixels.length; i++) {
    const p = m.pixels[i];
    if (p < 0) continue;
    im.data[i * 4] = P[p * 3]; im.data[i * 4 + 1] = P[p * 3 + 1]; im.data[i * 4 + 2] = P[p * 3 + 2];
    im.data[i * 4 + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}