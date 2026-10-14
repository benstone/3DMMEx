import { ChunkyFile, readGL } from '../format/chunky.js';
import { bootCap } from './boot.js';
import { packTex } from './res.js';
import { lib } from './state.js';
import { scanThumbFile } from './thumbs.js';
// ?packs=url[,url...] — each entry is an assets.json URL (or a directory ending
// in assets.json). Fetch manifests up front; the files are applied below once
// the content library + thumbnail structures exist.
export const packsP = Promise.all(((new URLSearchParams(location.search).get('packs') || '').match(/[^,]+/g) || [])
  .map(async (spec) => {
    const url = /\.json([?#]|$)/i.test(spec) ? spec : `${spec.replace(/\/*$/, '/')}assets.json`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status}`);
      const m = await r.json();
      const files = Array.isArray(m) ? m : m?.files;
      if (!Array.isArray(files)) throw new Error('no files array');
      return { url: new URL(url, location.href).href, files };
    } catch (e) { console.warn(`pack ${spec}: ${e.message}`); return null; }
  }));
// warm the UI bitmaps + cursors while the content files stream in (they'd
// otherwise lazy-load through <img>/css and pop in on first open)

// --- asset packs (?packs=) ---------------------------------------------------
// Files are routed by extension: .3cn/.chk register a content library (actors,
// props, backgrounds, materials, sounds; .chk files are the expansion's merge
// patches — a 256-entry GLCR inside one is the pack's social palette for its
// thumbnails), .3th/.nth append browser thumbnails, .png/.cur override UI
// textures/cursors by basename. Pack chunks are purely additive (builtin
// content wins cno collisions).
export const packNotes = []; // user-visible results, toasted after boot
export async function applyPacks() {
for (const pack of await packsP) {
  const dir = pack ? new URL(pack.url).pathname.replace(/\/[^/]*$/, '').split('/').pop() : null;
  if (!pack) { packNotes.push('asset pack failed to load'); continue; }
  bootCap.textContent = 'loading asset pack';
  try {
    const items = await Promise.all(pack.files.map(async (rel) => {
      try {
        const base = decodeURIComponent(String(rel).split('/').pop());
        const ext = (base.split('.').pop() || '').toLowerCase();
        const r = await fetch(new URL(rel, pack.url).href);
        if (!r.ok) throw new Error(`${r.status}`);
        return { base, ext, blob: await r.blob() };
      } catch (e) { console.warn(`pack ${rel}:`, e.message); return null; }
    }));
    const cfs = [], ths = [];
    let packPal = null, loaded = 0;
    for (const it of items) {
      if (!it) continue;
      if (it.ext === '3cn' || it.ext === 'chk' || it.ext === '3th' || it.ext === 'nth') {
        const cf = new ChunkyFile(new Uint8Array(await it.blob.arrayBuffer()), it.base);
        if (it.ext === '3cn' || it.ext === 'chk') {
          cfs.push(cf);
          if (!packPal) { // first 256-entry GLCR = the pack's social palette (CLR is b,g,r,0)
            const gl = [...cf.ofType('GLCR')].map((c) => { try { return readGL(cf.data('GLCR', c.cno)); } catch { return null; } })
              .find((g) => g && g.entries.length === 256);
            if (gl) { packPal = new Uint8Array(768); gl.entries.forEach((e, i) => { packPal[i * 3] = e[2]; packPal[i * 3 + 1] = e[1]; packPal[i * 3 + 2] = e[0]; }); }
          }
        } else ths.push(cf);
      } else if (it.ext === 'png' || it.ext === 'cur') {
        packTex.set(it.base, URL.createObjectURL(it.blob));
      } else { console.warn(`pack: skipped ${it.base}`); continue; }
      loaded++;
    }
    lib.content.push(...cfs); // before the .3th scan so chunk names resolve
    for (const th of ths) scanThumbFile(th, packPal);
    packNotes.push(`${dir || 'pack'}: ${loaded}/${pack.files.length} assets loaded`);
  } catch (e) { console.warn(`pack ${pack.url}:`, e.message); packNotes.push(`${dir || 'pack'} failed to load`); }
}
}
