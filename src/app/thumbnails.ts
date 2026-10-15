import { Reader } from '../format/binary.ts';
import { ChunkyFile } from '../format/chunky.ts';
import { parseMbmp } from '../format/content.ts';
import { bootSequence } from './bootstrap.ts';
import { baseUrl } from './resources.ts';
import { appState } from './appState.ts';
export class Thumbnails {
// roll call thumbnails: TMTH/PRTH (TFC template cno) -> GOKD -> MBMP, from actor.3th / prop.3th
rollCallTemplateThumbs = new Map();
browserTemplates = { actor: [], prop: [], scene: [] }; // selector grids: {cno, name, mbmp} in .3th order
backgroundThumbCatalogs = new Map(); // bkgd cno -> Map(chid -> mbmp): camera-angle thumbs, social palette
// spletter easel thumbs (easels.cht kctgTfth/kctgTsth/kctgMtth): the THD body is
// bo+i16+ctg+i32 — TFTH/MTTH carry a content tag, TSTH carries '....' + the tdts
spletterThumbs = { font: [], shape: [], mtrl: [] }; // {tag,mbmp} | {tdts,mbmp}
contentName = (ctg, cno) => // display name from whichever content file holds the chunk
  appState.contentLibrary.content.find((chunkyFile) => chunkyFile.has(ctg, cno))?.get(ctg, cno)?.name || '';
scanThumbnailFile = (th, packPal = null) => { // one .3th -> browser grids + easel thumbs (builtin data/ + asset packs); packPal = pack's 768-byte RGB palette (expansion thumbs index their own social palette)
  const pm = (cno) => { const m = parseMbmp(th.data('MBMP', cno)); if (packPal) (m as any).palette = packPal; return m; };
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
        this.backgroundThumbCatalogs.set(t.cno, m);
      }
      if (mk) {
        // TMTH/PRTH map via TFC @8; BKTH cno is the BKGD cno directly
        const cno = ctg === 'BKTH' ? t.cno : new DataView(d.buffer, d.byteOffset).getUint32(8, true);
        const mbmp = pm(mk.cno);
        if (ctg !== 'BKTH') this.rollCallTemplateThumbs.set(cno, mbmp); // roll call only needs template thumbs
        this.browserTemplates[kind].push({ cno, name: this.contentName(ctg === 'BKTH' ? 'BKGD' : 'TMPL', cno), mbmp });
      }
    }
  }
  for (const [ctg, kind] of [['TFTH', 'font'], ['TSTH', 'shape'], ['MTTH', 'mtrl']]) {
    for (const t of th.ofType(ctg)) {
      const r = new Reader(th.data(ctg, t.cno)); r.bo(); r.i16();
      const ctg2 = r.ctg(), cno = r.i32();
      const gk = t.kids.find((k) => k.ctg === 'GOKD');
      const mk = gk && th.get('GOKD', gk.cno).kids.find((k) => k.ctg === 'MBMP');
      this.spletterThumbs[kind].push(kind === 'shape'
        ? { tdts: cno, mbmp: mk ? pm(mk.cno) : null }
        : { tag: { sid: 2, ctg: ctg2, cno }, mbmp: mk ? pm(mk.cno) : null });
    }
  }
}
loadBuiltinThumbnails = async () => {
for (const file of ['actor.3th', 'prop.3th', 'bkgds.3th', 'actresl.3th', 'mtrl.3th']) {
  try { this.scanThumbnailFile(new ChunkyFile(await (await fetch(`${baseUrl}data/${file}`)).arrayBuffer())); }
  catch (e) { console.warn(`${file}:`, e.message); }
  bootSequence.advanceMiscTick(`loading ${file}`);
}
}

rollCallThumbCache = new Map(); // template cno (or 'a'+arid for TDT) -> 38x70 canvas
rollCallThumbFor = (cno, actor) => {
  const key = actor?.template?.isTdt ? 'a' + actor.data.arid : cno;
  if (!this.rollCallThumbCache.has(key)) {
    const c = document.createElement('canvas'); c.width = 38; c.height = 70;
    const m = this.rollCallTemplateThumbs.get(cno);
    if (m) {
      const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
      const P = m.palette || appState.socialPalette; // pack thumbs carry their own palette
      const x = src.getContext('2d'), image = x.createImageData(m.width, m.height);
      for (let i = 0; i < m.pixels.length; i++) {
        const p = m.pixels[i];
        if (p < 0) continue; // transparent run pixel
        image.data[i * 4] = P[p * 3]; image.data[i * 4 + 1] = P[p * 3 + 1]; image.data[i * 4 + 2] = P[p * 3 + 2]; image.data[i * 4 + 3] = 255;
      }
      x.putImageData(image, 0, 0);
      // original centers the bitmap in the 38x70 frame and clips (BRWR::_FSetThumFrame) — crop, don't stretch
      const sw = Math.min(38, m.width), sh = Math.min(70, m.height);
      c.getContext('2d').drawImage(src,
        Math.max(0, (m.width - 38) >> 1), Math.max(0, (m.height - 70) >> 1), sw, sh,
        Math.max(0, (38 - m.width) >> 1), Math.max(0, (70 - m.height) >> 1), sw, sh);
    } else if (actor?.template?.isTdt) {
      // TDT actors have no MBMP — original draws their name as a text gob (TGOB)
      const ctx = c.getContext('2d');
      const txt = (actor.data.name || actor.template.text || actor.template.name || '').trim();
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
    this.rollCallThumbCache.set(key, c);
  }
  return this.rollCallThumbCache.get(key);
}
// roll call lists: actors on the left strip (x=3), props on the right (x=594) — pos3.chh/browser.cht
rollCallLists = [
  { x: 3, cellPrefix: 'rcact', upFace: 'rcaup', downFace: 'rcadwn', filter: (a) => !a.template.isProp, offset: 0, selected: -1, syncKey: '', cells: [], arrows: [] },
  { x: 594, cellPrefix: 'rcp', upFace: 'rcpup', downFace: 'rcpdwn', filter: (a) => a.template.isProp, offset: 0, selected: -1, syncKey: '', cells: [], arrows: [] },
];
rollCallActors = (L) => { return appState.moviePlayer ? [...appState.moviePlayer.actors.values()].filter(L.filter) : []; }


mbmpToCanvas = (m, w, h) => { // draw an MBMP scaled into wxh — all baked thumbs index the social palette
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
  const P = m.palette || appState.socialPalette; // asset-pack thumbs carry their own palette (e.g. NICK3D.CHK GLCR)
  const x = src.getContext('2d'), image = x.createImageData(m.width, m.height);
  for (let i = 0; i < m.pixels.length; i++) {
    const p = m.pixels[i];
    if (p < 0) continue;
    image.data[i * 4] = P[p * 3]; image.data[i * 4 + 1] = P[p * 3 + 1]; image.data[i * 4 + 2] = P[p * 3 + 2];
    image.data[i * 4 + 3] = 255;
  }
  x.putImageData(image, 0, 0);
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}}

export const thumbnails = new Thumbnails();
