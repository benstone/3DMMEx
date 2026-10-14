import { ChunkyFile } from '../format/chunky.js';import { decodeWavAdpcm } from '../format/wav.js';import { lib, sounds } from './state.js';import { showBrowser } from './ui-dom/browsers.js';
export const sndName = (tags) => { // first resolvable tag's name for the name plate
  for (const t of tags) {
    if (t.sid === 'usr') return userSnds.find((u) => u.key === t.cno)?.name || 'sound';
    const m = lib.msnd(t);
    if (m && !m.invalid) return m.name || `sound ${t.cno}`;
  }
  return 'sound';
};

export let sndItems = null;
export const userSnds = []; // imported/recorded: {kind:'fx'|'speech'|'music', name, buf, midi, key}
export function getSndItems() { // MSNDs: WAVE kid = fx, MIDS kid = music; + user sounds tagged by browser
  if (!sndItems) {
    sndItems = { fx: [], music: [], speech: [] };
    const seen = new Set(); // all content files (builtin + asset packs); first cf wins a cno, matching resolve()
    for (const cf of lib.content) for (const m of cf.ofType('MSND')) {
      if (seen.has(m.cno)) continue;
      seen.add(m.cno);
      const kids = cf.kidsOf('MSND', m.cno).map((k) => k.ctg);
      sndItems[kids.includes('MIDS') ? 'music' : 'fx'].push({ cno: m.cno, name: m.name });
    }
  }
  return { fx: [...sndItems.fx, ...userSnds.filter((u) => u.kind === 'fx')],
    speech: [...sndItems.speech, ...userSnds.filter((u) => u.kind === 'speech')],
    music: [...sndItems.music, ...userSnds.filter((u) => u.kind === 'music')] };
}
// user sound persistence (imported + recorded audio survives reloads)
export const sndDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      const rq = indexedDB.open('mms', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('snds', { autoIncrement: true });
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  },
  async all() {
    const db = await this.open(); if (!db) return [];
    return new Promise((res) => {
      const out = [], cur = db.transaction('snds').objectStore('snds').openCursor();
      cur.onsuccess = () => { if (cur.result) { out.push({ key: cur.result.key, ...cur.result.value }); cur.result.continue(); } else res(out); };
      cur.onerror = () => res(out);
    });
  },
  async add(rec) {
    const db = await this.open(); if (!db) return null;
    return new Promise((res) => {
      const tx = db.transaction('snds', 'readwrite');
      const rq = tx.objectStore('snds').add(rec);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    });
  },
};
export async function decodeAudioBytes(bytes) { // -> AudioBuffer|null via the live ctx (works while suspended)
  try { return await sounds.ensure().decodeAudioData(new Uint8Array(bytes).slice().buffer); } catch { return null; }
}
export async function wavToBuf(wd) { // 3DMM ADPCM first, else standard wav decode
  const pcm = decodeWavAdpcm(wd);
  if (pcm) {
    const b = sounds.ctx.createBuffer(pcm.channels, pcm.frames, pcm.rate);
    pcm.out.forEach((ch, i) => b.copyToChannel(ch, i));
    return b;
  }
  return decodeAudioBytes(wd);
}
export async function loadUserSnds() {
  for (const r of await sndDB.all())
    userSnds.push({ user: true, kind: r.kind, name: r.name, buf: null, bytes: r.bytes, midi: !!r.midi, key: r.key }); // buf decoded lazily on preview
}
export async function addUserSnd(kind, it) {
  if (!it.buf && it.bytes && !it.midi) it.buf = await wavToBuf(it.bytes);
  const key = await sndDB.add({ kind, name: it.name, bytes: it.bytes, mime: it.mime, midi: !!it.midi });
  userSnds.push({ user: true, kind, name: it.name, buf: it.buf, midi: !!it.midi, key });
}
export async function previewItem(it) { // browser select = play it (built-in msnd or user/import item)
  if (!it.buf && it.bytes && !it.midi) it.buf = await wavToBuf(it.bytes);
  sounds.preview(it);
}
// the bag button (browser.cht kidBrowserImport): pick a file, list the sounds found inside,
// OK imports the picked sound into the browser's list (original's import browser)
export async function importSndFile(kind, file) {
  sounds.ensure();
  const bytes = await file.arrayBuffer();
  const u8 = new Uint8Array(bytes);
  const magic = String.fromCharCode(...u8.subarray(0, 4));
  const cands = [];
  if (magic === 'CHN2' || magic === '2NHC') { // movie/content file: list its MSND sounds
    try {
      const cf = new ChunkyFile(bytes);
      for (const m of cf.ofType('MSND')) {
        const kids = cf.kidsOf('MSND', m.cno);
        const wav = kids.find((k) => k.ctg === 'WAVE'), mid = kids.find((k) => k.ctg === 'MIDS');
        if (wav) cands.push({ name: m.name || file.name, bytes: cf.data('WAVE', wav.cno).slice(), mime: 'audio/wav' });
        else if (mid) cands.push({ name: m.name || file.name, bytes: cf.data('MIDS', mid.cno).slice(), mime: 'audio/mids', midi: true });
      }
    } catch (e) { console.warn('[import] chunky parse:', e.message); }
  } else {
    const midi = /\.(mid|midi|rmi)$/i.test(file.name);
    cands.push({ name: file.name.replace(/\.[^.]+$/, ''), bytes: u8, mime: file.type || 'audio/*', midi });
  }
  if (cands.length) showBrowser(kind, cands);
  else console.warn(`[import] no sounds found in ${file.name}`);
}
export function importSndFiles(kind) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.accept = kind === 'music' ? 'audio/*,.mid,.midi,.3mm,.3cn,.chn,.cfl' : 'audio/*,.3mm,.3cn,.chn,.cfl';
  inp.onchange = async () => { for (const f of inp.files) await importSndFile(kind, f); };
  inp.click();
}