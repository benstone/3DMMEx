import { ChunkyFile, readGL } from '../format/chunky.ts';
import { bootView } from './ui/bootView.ts';
import { packTextures } from './resources.ts';
import { appState } from './appState.ts';
import { thumbnails } from './thumbnails.ts';
import { localizer } from './localization.ts';

// --- asset packs (?packs=) ---------------------------------------------------
// Files are routed by extension: .3cn/.chk register a content library (actors,
// props, backgrounds, materials, sounds; .chk files are the expansion's merge
// patches — a 256-entry GLCR inside one is the pack's social palette for its
// thumbnails), .3th/.nth append browser thumbnails, .png/.cur override UI
// textures/cursors by basename. Pack chunks are purely additive (builtin
// content wins cno collisions).
class ExpansionPacks {
  // ?packs=url[,url...] — each entry is an assets.json URL (or a directory
  // ending in assets.json). Fetch manifests up front; the files are applied
  // below once the content library + thumbnail structures exist.
  manifestsPromise = Promise.all(((new URLSearchParams(location.search).get('packs') || '').match(/[^,]+/g) || [])
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

  packNotes: string[] = []; // user-visible results, toasted after boot

  /** Fetch every pack's files and merge them into the content library,
   *  thumbnails, and sound lists — collecting a user-visible note per pack. */
  applyAll = async () => {
    for (const pack of await this.manifestsPromise) {
      const dir = pack ? new URL(pack.url).pathname.replace(/\/[^/]*$/, '').split('/').pop() : null;
      if (!pack) { this.packNotes.push(localizer.translate('pack.failedGeneric')); continue; }
      bootView.captionEl.textContent = localizer.translate('boot.pack');
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
            const chunkyFile = new ChunkyFile(new Uint8Array(await it.blob.arrayBuffer()), it.base);
            if (it.ext === '3cn' || it.ext === 'chk') {
              cfs.push(chunkyFile);
              if (!packPal) { // first 256-entry GLCR = the pack's social palette (CLR is b,g,r,0)
                const gl = [...chunkyFile.ofType('GLCR')].map((c) => { try { return readGL(chunkyFile.data('GLCR', c.cno)); } catch { return null; } })
                  .find((g) => g && g.entries.length === 256);
                if (gl) { packPal = new Uint8Array(768); gl.entries.forEach((e, i) => { packPal[i * 3] = e[2]; packPal[i * 3 + 1] = e[1]; packPal[i * 3 + 2] = e[0]; }); }
              }
            } else ths.push(chunkyFile);
          } else if (it.ext === 'png' || it.ext === 'cur') {
            packTextures.set(it.base, URL.createObjectURL(it.blob));
          } else { console.warn(`pack: skipped ${it.base}`); continue; }
          loaded++;
        }
        appState.contentLibrary.content.push(...cfs); // before the .3th scan so chunk names resolve
        for (const th of ths) thumbnails.scanThumbnailFile(th, packPal);
        this.packNotes.push(localizer.translate('pack.loaded', { name: dir || localizer.translate('pack.unnamed'), loaded, total: pack.files.length }));
      } catch (e) { console.warn(`pack ${pack.url}:`, e.message); this.packNotes.push(localizer.translate('pack.failed', { name: dir || localizer.translate('pack.unnamed') })); }
    }
  };
}

export const expansionPacks = new ExpansionPacks();
