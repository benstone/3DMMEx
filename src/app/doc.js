import { insTbox, pickTbox, selTbox } from './edit/tbox.js';
import { importSndFile, getSndItems, userSnds, wavToBuf } from './sndsrc.js';
import { pal, sounds, player, lib, setPlayer, renderer, selTbChid, focusTbChid, tbSel, tbAttach, pendPlace, selChid, ed, setSelChid, setPendPlace, setSelTbChid, setFocusTbChid, setTbSelVal, setTbAttach, setTbSnap, selTbSels } from './state.js';
import { spltThumbs, brwsTmpls } from './thumbs.js';
import { showRecorder } from './ui/easels.js';
import { callout, guideTip } from './ui/tips.js';
import { MoviePlayer } from '../engine/player.js';
import { ChunkyFile } from '../format/chunky.js';
import { serializeMovie } from '../format/movie.js';
import { setPlaying, draw } from './loop.js';
import { say, B } from './res.js';
import { hist, histClear } from './undo.js';
import { t } from './i18n.js';
export let saveHandle = null; // FileSystemFileHandle for cidSave (FGetFniSave result)
export function open(buffer, name, cacheDoc = true) {
  setPlaying(false);
  sounds.stopAll();
  // MVU::FCloseDoc keep-changes check: unsaved ops prompt before replacing
  if (player && (hist.undos.length || hist.redos.length) && !confirm(t('doc.discard'))) return false;
  let p;
  try { p = new MoviePlayer(new ChunkyFile(buffer, name), lib); }
  catch (e) { // _FLoadMovie restore: a failed load leaves the old movie open
    say(e.message);
    return false;
  }
  setPlayer(p);
  saveHandle = null;
  window.player = player; window.sounds = sounds; window.renderer = renderer;
  window.__mms = { importSndFile, showRecorder, userSnds, getSndItems, ed, // debug/test hooks
    insTbox, pickTbox, selTbox, get selTbChid() { return selTbChid; }, get focusTbChid() { return focusTbChid; }, get tbSel() { return tbSel; }, get tbAttach() { return tbAttach; },
    get pendPlace() { return pendPlace; }, get selChid() { return selChid; }, spltThumbs, player: () => player, brwsTmpls, lib, pal,
    docDB, docFlush, get docDirty() { return docDirty; }, set docDirty(v) { docDirty = v; },
    get movieBytes() { return movieBytes; }, callout };
  player.onSnd = (ev) => sounds.play(ev);
  player.onSndStop = () => sounds.stopLoops();
  player.sndPlaying = () => sounds.playing(); // witUntilSnd polls the queue
  sounds.userSnd = async (key) => { // resolve 'usr' tags (imported/recorded sounds)
    const u = userSnds.find((x) => x.key === key);
    if (u && !u.buf && u.bytes && !u.midi) u.buf = await wavToBuf(u.bytes);
    else if (u && !u.buf && u.bytes && u.midi) { // user midi -> synth-render it lazily
      u.buf = await sounds._midiBuffer({ cf: { data: () => u.bytes }, cno: key });
    }
    return u;
  };
  player.onTransStart = () => renderer.snapshot(player);
  // every scene/frame change updates DOC_POS — a refresh lands where the user was
  const _loadScene = p.loadScene.bind(p), _gotoFrame = p.gotoFrame.bind(p);
  p.loadScene = (i) => { _loadScene(i); posSave(); ed.syncToolState?.(); };
  p.gotoFrame = (n) => { _gotoFrame(n); posSave(); };
  player.loadScene(0);
  histClear(); setSelChid(-1); setPendPlace(null);
  setSelTbChid(-1); setFocusTbChid(-1); setTbSelVal(null); setTbAttach(null); setTbSnap(null); selTbSels.clear(); // stale tbox refs die with the movie
  if (player.warnings.length) console.warn(player.warnings);
  draw();
  if (cacheDoc) docMark(); // a newly loaded movie becomes the working doc (debounced — the caller may still reposition the scene)
  return true;
}
// --- portfolio commands (cidNew/cidOpen/cidSave/cidSaveAs, MVIE::FSave*) ------
export const movieBytes = () => serializeMovie(player.movie, {
  rtmpl: (cno) => lib._rtmpl.get(cno) || null,
  userSnd: (key) => userSnds.find((u) => u.key === key) || null,
});
export function newMovie() { // cidNew -> FLoadMovie(nil): PmvieNew(nil) = NO scenes (_iscen ivNil)
  open(serializeMovie({ name: t('doc.untitled'), scenes: [] }), t('doc.untitled') + '.3mm'); // idsEngineDefaultTitle
  setTimeout(guideTip, 450); // a sceneless doc gets the CO guide tip, on boot or via New
}
// --- working-doc autosave (the original's autosave doc: startup loads pfniUserDoc,
// else a blank doc — we keep the serialized .3MM in IndexedDB) ------------------
export const docDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      let rq;
      try { rq = indexedDB.open('mmsdoc', 1); } catch { return res(null); } // blocked context
      rq.onupgradeneeded = () => rq.result.createObjectStore('doc');
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  },
  async put(rec) {
    const db = await this.open(); if (!db) return;
    await new Promise((res) => {
      try { // a leftover/empty mmsdoc db may lack the store — treat as unwritable
        const tx = db.transaction('doc', 'readwrite');
        tx.objectStore('doc').put(rec, 'autosave');
        tx.oncomplete = tx.onerror = tx.onabort = res;
      } catch { res(); }
    });
  },
  async get() { // newer of the IDB record and the localStorage mirror wins
    const db = await this.open();
    const idb = db ? await new Promise((res) => {
      try {
        const rq = db.transaction('doc').objectStore('doc').get('autosave');
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      } catch { res(null); }
    }) : null;
    const ls = lsGet();
    if (idb && ls) return idb.t >= ls.t ? idb : ls;
    return idb || ls;
  },
};
// synchronous localStorage mirror — lands even when the pagehide/async-IDB
// write is killed, and covers contexts where indexedDB is unavailable
export const DOC_LS = 'mmsdoc.autosave';
export const DOC_POS = 'mmsdoc.pos'; // {scene, frame} — refreshed on every navigation
export const posSave = () => { try { localStorage.setItem(DOC_POS, JSON.stringify({ scene: player.sceneIndex, frame: player.frame, t: Date.now() })); } catch { /* quota */ } };
export const posGet = () => { try { return JSON.parse(localStorage.getItem(DOC_POS) || 'null'); } catch { return null; } };
export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const lsPut = (rec) => { try { localStorage.setItem(DOC_LS, JSON.stringify({ ...rec, bytes: b64(rec.bytes) })); return true; } catch { return false; } };
export const lsGet = () => { try { const r = JSON.parse(localStorage.getItem(DOC_LS) || 'null'); return r ? { ...r, bytes: unb64(r.bytes) } : null; } catch { return null; } };
export let docDirty = false, docFlushing = false, docWarned = false, docTimer = null;
export function docMark() { // an edit happened — flush soon; the leave handlers are a backstop
  docDirty = true;
  clearTimeout(docTimer); docTimer = setTimeout(docFlush, 1200);
}
export async function docFlush() {
  if (!docDirty || docFlushing || !player) return;
  docFlushing = true;
  try {
    const rec = { bytes: movieBytes(), name: player.movie.name || t('doc.untitled'),
      scene: player.sceneIndex, frame: player.frame, t: Date.now() };
    docDirty = false;
    lsPut(rec);           // sync — always lands before any await
    await docDB.put(rec); // IDB for durability / movies over the LS quota
  } catch (e) {
    docDirty = true; console.warn('[autosave]', e);
    if (!docWarned) { docWarned = true; say(t('doc.autosaveFailed', { err: e.message })); } // surface it once, not every 3s
  }
  docFlushing = false;
}
setInterval(docFlush, 3000);
addEventListener('pagehide', docFlush);
addEventListener('beforeunload', docFlush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') docFlush(); });
// hard reload (Cmd/Ctrl+Shift+R, Shift+F5) -> wipe the working doc before the
// page is torn down; the leave-flush must not write it back (docDirty = false)
addEventListener('keydown', (e) => {
  if (!e.shiftKey || !((e.metaKey || e.ctrlKey) && e.code === 'KeyR' || e.key === 'F5')) return;
  docDirty = false;
  try {
    localStorage.removeItem(DOC_LS); localStorage.removeItem(DOC_POS);
    docDB._db?.close(); // unblock deleteDatabase
    indexedDB.deleteDatabase('mmsdoc');
  } catch { /* blocked */ }
}, true);
export function openMovieFile() { // cidOpen -> file picker (FGetFniOpen); any .3MM is accepted, open() validates CHN2
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.onchange = async () => { const f = inp.files[0]; if (f) open(await f.arrayBuffer(), f.name); };
  inp.click();
}
export async function saveMovie(saveAs = false) { // MVIE::FSave / FGetFniSave
  const name = `${player.movie.name || t('doc.untitled')}.3mm`;
  try {
    if (!saveAs && saveHandle) {
      const ws = await saveHandle.createWritable();
      await ws.write(movieBytes()); await ws.close();
    } else if (window.showSaveFilePicker) {
      saveHandle = await showSaveFilePicker({ suggestedName: name,
        types: [{ description: '3D Movie Maker movie', accept: { 'application/octet-stream': ['.3mm'] } }] });
      const ws = await saveHandle.createWritable();
      await ws.write(movieBytes()); await ws.close();
    } else { // no file-system access — download is the browser's save dialog
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([movieBytes()]));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      saveHandle = null;
    }
    say(t('doc.saved', { name: saveHandle?.name || name }));
  } catch (e) { if (e.name !== 'AbortError') say(t('doc.saveFailed', { err: e.message })); }
}
export let lastMovieUrl = null; // URL the open movie came from (for cast hand-off)
export async function openUrl(urlOrName, cacheDoc = true) { // ?3mm= — returns null on success, else a friendly error
  let url;
  try { url = /^[\w.-]+$/.test(urlOrName) ? `${B}movies/${urlOrName}` : new URL(urlOrName, location.href).href; }
  catch { return `that doesn't look like a movie link`; }
  let buf;
  try {
    const res = await fetch(url);
    if (res.status === 404) return `couldn't find that movie — the link may have moved or been deleted`;
    if (!res.ok) return `the movie link didn't work (server said ${res.status})`;
    const ct = res.headers.get('content-type') || '';
    buf = await res.arrayBuffer();
    // SPA fallback serves index.html for missing files — same thing as a 404
    if (ct.includes('text/html')) return `couldn't find that movie — the link may have moved or been deleted`;
  } catch { return `couldn't reach that movie — check the link and your connection`; }
  const magic = buf.byteLength >= 4 ? String.fromCharCode(...new Uint8Array(buf, 0, 4)) : '';
  if (magic !== 'CHN2' && magic !== '2NHC') return `that file isn't a 3D Movie Maker movie`;
  const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || 'movie.3mm';
  const ok = open(buf, name, cacheDoc);
  if (ok) lastMovieUrl = url;
  return ok ? null : `couldn't load that movie`;
}
