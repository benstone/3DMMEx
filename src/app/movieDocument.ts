import { textboxEdits } from './edit/textboxEdits.ts';
import { soundSources } from './soundSources.ts';
import { appState } from './appState.ts';
import { thumbnails } from './thumbnails.ts';
import { RecorderEasel } from './ui/easels.ts';
import { tooltips } from './ui/tooltips.ts';
import { uiRoot } from './ui/root.ts';
import { modalSlot } from './ui/modal.ts';
import { MoviePlayer } from '../engine/player.ts';
import { ChunkyFile } from '../format/chunky.ts';
import { serializeMovie } from '../format/movie.ts';
import { playbackLoop } from './playbackLoop.ts';
import { toastHost, baseUrl } from './resources.ts';
import { editHistory } from './editHistory.ts';
import { localizer } from './localization.ts';

export const toBase64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** IndexedDB wrapper for the autosave record — falls back to the
 *  localStorage mirror (get() returns the newer of the two). */
class AutosaveDatabase {
  _db = null;
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      let rq;
      try { rq = indexedDB.open('mmsdoc', 2); } catch { return res(null); } // blocked context
      // v2: a stale v1 db may exist without the 'doc' store (put/get then no-op
      // forever) — create it if missing instead of assuming the schema
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('doc')) d.createObjectStore('doc'); };
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  }
  async put(rec) {
    const db = await this.open(); if (!db) return;
    await new Promise<void>((res) => {
      try {
        const tx = db.transaction('doc', 'readwrite');
        tx.objectStore('doc').put(rec, 'autosave');
        tx.oncomplete = tx.onerror = tx.onabort = res;
      } catch (e) { console.warn('[autosave] idb put failed:', e.message); res(); }
    });
  }
  async get() { // newer of the IDB record and the localStorage mirror wins
    const db = await this.open();
    const idb = db ? await new Promise<any>((res) => {
      try {
        const rq = db.transaction('doc').objectStore('doc').get('autosave');
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      } catch (e) { console.warn('[autosave] idb get failed:', e.message); res(null); }
    }) : null;
    const ls = this._loadLocal();
    if (idb && ls) return idb.t >= ls.t ? idb : ls;
    return idb || ls;
  }
  _saveLocal(rec) { try { localStorage.setItem(DOC_AUTOSAVE_KEY, JSON.stringify({ ...rec, bytes: toBase64(rec.bytes) })); return true; } catch { return false; } }
  _loadLocal() { try { const r = JSON.parse(localStorage.getItem(DOC_AUTOSAVE_KEY) || 'null'); return r ? { ...r, bytes: fromBase64(r.bytes) } : null; } catch { return null; } }
}

// synchronous localStorage keys — the mirror lands even when the
// pagehide/async-IDB write is killed, and covers contexts without indexedDB
export const DOC_AUTOSAVE_KEY = 'mmsdoc.autosave';
export const DOC_POSITION_KEY = 'mmsdoc.pos'; // {scene, frame} — refreshed on every navigation

/** The working movie document: open/save portfolio commands plus the
 *  autosave loop (the original's pfniUserDoc — we keep the serialized .3MM
 *  in IndexedDB with a synchronous localStorage mirror). */
class MovieDocument {
  saveFileHandle = null;   // FileSystemFileHandle for cidSave (FGetFniSave result)
  lastMovieUrl = null;     // URL the open movie came from (for cast hand-off)
  documentDirty = false;
  documentFlushing = false;
  documentWarned = false;
  autosaveTimer = null;
  documentDatabase = new AutosaveDatabase();

  openMovie = (buffer, name, cacheDoc = true) => {
    playbackLoop.setPlaying(false);
    appState.soundQueue.stopAll();
    // MVU::FCloseDoc keep-changes check: unsaved ops prompt before replacing
    if (appState.moviePlayer && (editHistory.undos.length || editHistory.redos.length) && !confirm(localizer.translate('doc.discard'))) return false;
    let p;
    try { p = new MoviePlayer(new ChunkyFile(buffer, name), appState.contentLibrary); }
    catch (e) { // _FLoadMovie restore: a failed load leaves the old movie open
      toastHost.show(e.message);
      return false;
    }
    appState.setMoviePlayer(p);
    this.saveFileHandle = null;
    window.moviePlayer = appState.moviePlayer; window.soundQueue = appState.soundQueue; window.sceneRenderer = appState.sceneRenderer;
    window.__mms = { importSoundFile: soundSources.importSoundFile, showRecorder: RecorderEasel.show, userSounds: soundSources.userSounds, getSoundItems: soundSources.getSoundItems, editorTools: appState.editorTools, // debug/test hooks
      insertTextbox: textboxEdits.insertTextbox, pickTextbox: textboxEdits.pickTextbox, selectedTextbox: textboxEdits.selectedTextbox, get selectedTextboxId() { return appState.selectedTextboxId; }, get focusedTextboxId() { return appState.focusedTextboxId; }, get textboxSelection() { return appState.textboxSelection; }, get textboxAttachment() { return appState.textboxAttachment; },
      get pendingPlacement() { return appState.pendingPlacement; }, get selectedChildId() { return appState.selectedChildId; }, spletterThumbs: thumbnails.spletterThumbs, player: () => appState.moviePlayer, browserTemplates: thumbnails.browserTemplates, contentLibrary: appState.contentLibrary, socialPalette: appState.socialPalette,
      documentDatabase: this.documentDatabase, flushDocument: this.flushDocument, get documentDirty() { return movieDocument.documentDirty; }, set documentDirty(v) { movieDocument.documentDirty = v; },
      get movieBytes() { return movieDocument.movieBytes; }, showCallout: tooltips.showCallout, uiRoot, modalSlot };
    appState.moviePlayer.onSound = (ev) => appState.soundQueue.play(ev);
    appState.moviePlayer.onSoundStop = () => appState.soundQueue.stopLoops();
    appState.moviePlayer.isSoundPlaying = () => appState.soundQueue.playing(); // witUntilSnd polls the queue
    appState.soundQueue.userSnd = async (key) => { // resolve 'usr' tags (imported/recorded sounds)
      const u = soundSources.userSounds.find((x) => x.key === key);
      if (u && !u.buf && u.bytes && !u.midi) u.buf = await soundSources.wavToBuffer(u.bytes);
      else if (u && !u.buf && u.bytes && u.midi) { // user midi -> synth-render it lazily
        u.buf = await appState.soundQueue._midiBuffer({ chunkyFile: { data: () => u.bytes }, cno: key });
      }
      return u;
    };
    appState.moviePlayer.onTransStart = () => appState.sceneRenderer.snapshot(appState.moviePlayer);
    // every scene/frame change updates DOC_POSITION_KEY — a refresh lands where the user was
    const _loadScene = p.loadScene.bind(p), _gotoFrame = p.gotoFrame.bind(p);
    p.loadScene = (i) => { _loadScene(i); this.savePlaybackPosition(); appState.editorTools.syncToolState?.(); };
    p.gotoFrame = (n) => { _gotoFrame(n); this.savePlaybackPosition(); };
    appState.moviePlayer.loadScene(0);
    editHistory.clear(); appState.setSelectedChildId(-1); appState.setPendingPlacement(null);
    appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.setTextboxSnapshot(null); appState.textboxSelections.clear(); // stale tbox refs die with the movie
    if (appState.moviePlayer.warnings.length) console.warn(appState.moviePlayer.warnings);
    playbackLoop.drawFrame();
    if (cacheDoc) this.markDocumentDirty(); // a newly loaded movie becomes the working doc (debounced — the caller may still reposition the scene)
    return true;
  };

  // --- portfolio commands (cidNew/cidOpen/cidSave/cidSaveAs, MVIE::FSave*) ----
  movieBytes = () => serializeMovie(appState.moviePlayer.movie, {
    rtmpl: (cno) => appState.contentLibrary._rtmpl.get(cno) || null,
    userSnd: (key) => soundSources.userSounds.find((u) => u.key === key) || null,
  });

  newMovie = () => { // cidNew -> FLoadMovie(nil): PmvieNew(nil) = NO scenes (_iscen ivNil)
    this.openMovie(serializeMovie({ name: localizer.translate('doc.untitled'), scenes: [] }), localizer.translate('doc.untitled') + '.3mm'); // idsEngineDefaultTitle
    setTimeout(tooltips.showGuideTip, 450); // a sceneless doc gets the CO guide tip, on boot or via New
  };

  savePlaybackPosition = () => { try { localStorage.setItem(DOC_POSITION_KEY, JSON.stringify({ scene: appState.moviePlayer.sceneIndex, frame: appState.moviePlayer.frame, t: Date.now() })); } catch { /* quota */ } };
  savedPlaybackPosition = () => { try { return JSON.parse(localStorage.getItem(DOC_POSITION_KEY) || 'null'); } catch { return null; } };

  markDocumentDirty = () => { // an edit happened — flush soon; the leave handlers are a backstop
    this.documentDirty = true;
    clearTimeout(this.autosaveTimer); this.autosaveTimer = setTimeout(this.flushDocument, 1200);
  };

  flushDocument = async () => {
    if (!this.documentDirty || this.documentFlushing || !appState.moviePlayer) return;
    this.documentFlushing = true;
    try {
      const rec = { bytes: this.movieBytes(), name: appState.moviePlayer.movie.name || localizer.translate('doc.untitled'),
        scene: appState.moviePlayer.sceneIndex, frame: appState.moviePlayer.frame, t: Date.now() };
      this.documentDirty = false;
      if (!this.documentDatabase._saveLocal(rec)) console.warn('[autosave] localStorage mirror failed (quota or blocked storage)'); // sync — lands before any await
      await this.documentDatabase.put(rec); // IDB for durability / movies over the LS quota
    } catch (e) {
      this.documentDirty = true; console.warn('[autosave]', e);
      if (!this.documentWarned) { this.documentWarned = true; toastHost.show(localizer.translate('doc.autosaveFailed', { err: e.message })); } // surface it once, not every 3s
    } finally {
      this.documentFlushing = false; // must reset even if the error path itself throws
    }
  };

  /** setInterval + page/leave listeners — the autosave loop's wiring. */
  installAutosaveHooks = () => {
    setInterval(this.flushDocument, 3000);
    addEventListener('pagehide', this.flushDocument);
    addEventListener('beforeunload', this.flushDocument);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flushDocument(); });
    // hard reload (Cmd/Ctrl+Shift+R, Shift+F5) -> wipe the working doc before the
    // page is torn down; the leave-flush must not write it back (documentDirty = false)
    addEventListener('keydown', (e) => {
      if (!e.shiftKey || !((e.metaKey || e.ctrlKey) && e.code === 'KeyR' || e.key === 'F5')) return;
      this.documentDirty = false;
      try {
        localStorage.removeItem(DOC_AUTOSAVE_KEY); localStorage.removeItem(DOC_POSITION_KEY);
        this.documentDatabase._db?.close(); // unblock deleteDatabase
        indexedDB.deleteDatabase('mmsdoc');
      } catch { /* blocked */ }
    }, true);
  };

  openMovieFile = () => { // cidOpen -> file picker (FGetFniOpen); any .3MM is accepted, openMovie() validates CHN2
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => { const f = inp.files[0]; if (f) this.openMovie(await f.arrayBuffer(), f.name); };
    inp.click();
  };

  saveMovie = async (saveAs = false) => { // MVIE::FSave / FGetFniSave
    const name = `${appState.moviePlayer.movie.name || localizer.translate('doc.untitled')}.3mm`;
    try {
      if (!saveAs && this.saveFileHandle) {
        const ws = await this.saveFileHandle.createWritable();
        await ws.write(this.movieBytes()); await ws.close();
      } else if (window.showSaveFilePicker) {
        this.saveFileHandle = await showSaveFilePicker({ suggestedName: name,
          types: [{ description: '3D Movie Maker movie', accept: { 'application/octet-stream': ['.3mm'] } }] });
        const ws = await this.saveFileHandle.createWritable();
        await ws.write(this.movieBytes()); await ws.close();
      } else { // no file-system access — download is the browser's save dialog
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([this.movieBytes()]));
        a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        this.saveFileHandle = null;
      }
      toastHost.show(localizer.translate('doc.saved', { name: this.saveFileHandle?.name || name }));
    } catch (e) { if (e.name !== 'AbortError') toastHost.show(localizer.translate('doc.saveFailed', { err: e.message })); }
  };

  openMovieUrl = async (urlOrName, cacheDoc = true) => { // ?3mm= — returns null on success, else a friendly error
    let url;
    try { url = /^[\w.-]+$/.test(urlOrName) ? `${baseUrl}movies/${urlOrName}` : new URL(urlOrName, location.href).href; }
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
    const ok = this.openMovie(buf, name, cacheDoc);
    if (ok) this.lastMovieUrl = url;
    return ok ? null : `couldn't load that movie`;
  };
}

export const movieDocument = new MovieDocument();
movieDocument.installAutosaveHooks();
