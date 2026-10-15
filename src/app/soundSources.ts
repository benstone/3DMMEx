import { ChunkyFile } from '../format/chunky.ts';
import { decodeWavAdpcm } from '../format/wav.ts';
import { parseMsnd, STY } from '../format/content.ts';
import { appState } from './appState.ts';
import { AssetBrowserView } from './ui/assetBrowser.ts';

/** IndexedDB wrapper for user-imported/recorded sounds (survives reloads). */
class UserSoundDatabase {
  _db = null;
  /** Open (and lazily create) the 'snds' object store — resolves null on error. */
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      const rq = indexedDB.open('mms', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('snds', { autoIncrement: true });
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  }
  /** All stored records as [{key, ...value}] — resolves [] on error. */
  async all() {
    const db = await this.open(); if (!db) return [];
    return new Promise((res) => {
      const out = [], cur = db.transaction('snds').objectStore('snds').openCursor();
      cur.onsuccess = () => { if (cur.result) { out.push({ key: cur.result.key, ...cur.result.value }); cur.result.continue(); } else res(out); };
      cur.onerror = () => res(out);
    });
  }
  /** Insert a record — resolves the new auto-increment key, or null. */
  async add(rec) {
    const db = await this.open(); if (!db) return null;
    return new Promise((res) => {
      const tx = db.transaction('snds', 'readwrite');
      const rq = tx.objectStore('snds').add(rec);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    });
  }
}

/** Sound pickers' data source: built-in MSNDs classified by sty
 *  (fx/speech/midi — the three picker categories) plus imported/recorded
 *  user sounds persisted in IndexedDB. */
class SoundSources {
  soundItems = null; // {fx,music,speech} lists — built once, lazy
  userSounds: any[] = []; // imported/recorded: {kind:'fx'|'speech'|'music', name, buf, midi, key}
  database = new UserSoundDatabase();

  /** Display name for a sound tag list — the first resolvable tag's name
   *  (user sounds by key, content sounds by MSND name). */
  soundName = (tags) => {
    for (const t of tags) {
      if (t.sid === 'usr') return this.userSounds.find((u) => u.key === t.cno)?.name || 'sound';
      const m = appState.contentLibrary.msnd(t);
      if (m && !m.invalid) return m.name || `sound ${t.cno}`;
    }
    return 'sound';
  };

  /** Picker item lists — builtin MSNDs classified by style, plus imported
   *  user sounds appended per kind. Cached; user sounds merge on each call. */
  getSoundItems = () => {
    if (!this.soundItems) {
      this.soundItems = { fx: [], music: [], speech: [] };
      const KIND = { [STY.Speech]: 'speech', [STY.Midi]: 'music', [STY.Sfx]: 'fx' };
      const seen = new Set(); // all content files (builtin + asset packs); first chunkyFile wins a cno, matching resolve()
      for (const chunkyFile of appState.contentLibrary.content) for (const m of chunkyFile.ofType('MSND')) {
        if (seen.has(m.cno)) continue;
        seen.add(m.cno);
        let sty = STY.Sfx;
        try { const p = parseMsnd(chunkyFile, m.cno); if (p.invalid) continue; sty = p.sty; } catch { /* malformed -> fx */ }
        this.soundItems[KIND[sty] || 'fx'].push({ cno: m.cno, name: m.name });
      }
    }
    return { fx: [...this.soundItems.fx, ...this.userSounds.filter((u) => u.kind === 'fx')],
      speech: [...this.soundItems.speech, ...this.userSounds.filter((u) => u.kind === 'speech')],
      music: [...this.soundItems.music, ...this.userSounds.filter((u) => u.kind === 'music')] };
  };

  /** Decode standard audio bytes to an AudioBuffer via the live context
   *  (works while suspended) — null on failure. */
  decodeAudioBytes = async (bytes) => {
    try { return await appState.soundQueue.ensure().decodeAudioData(new Uint8Array(bytes).slice().buffer); } catch { return null; }
  };

  /** Wav bytes -> AudioBuffer — tries the MS-ADPCM decoder first, then the
   *  browser's standard decoder. */
  wavToBuffer = async (wd) => {
    const pcm = decodeWavAdpcm(wd);
    if (pcm) {
      const b = appState.soundQueue.ctx.createBuffer(pcm.channels, pcm.frames, pcm.rate);
      pcm.out.forEach((ch, i) => b.copyToChannel(ch, i));
      return b;
    }
    return this.decodeAudioBytes(wd);
  };

  /** Load persisted user sounds from IndexedDB — called during boot; audio
   *  bytes decode lazily on preview/import. */
  loadUserSounds = async () => {
    for (const r of (await this.database.all()) as any[])
      this.userSounds.push({ user: true, kind: r.kind, name: r.name, buf: null, bytes: r.bytes, midi: !!r.midi, key: r.key }); // buf decoded lazily on preview
  };

  /** Persist an imported/recorded sound — decodes its buffer now, stores the
   *  raw bytes in IndexedDB, appends to the picker list. */
  addUserSound = async (kind, it) => {
    if (!it.buf && it.bytes && !it.midi) it.buf = await this.wavToBuffer(it.bytes);
    const key = await this.database.add({ kind, name: it.name, bytes: it.bytes, mime: it.mime, midi: !!it.midi });
    this.userSounds.push({ user: true, kind, name: it.name, buf: it.buf, midi: !!it.midi, key });
  };

  /** Play a picker item — selecting a sound in the browser previews it. */
  previewSoundItem = async (it) => {
    if (!it.buf && it.bytes && !it.midi) it.buf = await this.wavToBuffer(it.bytes);
    appState.soundQueue.preview(it);
  };

  /** The import-button path: parse a picked file into candidate sounds —
   *  chunky files yield each embedded WAVE/MIDS, anything else is one raw
   *  sound — then show the import picker. */
  importSoundFile = async (kind, file) => {
    appState.soundQueue.ensure();
    const bytes = await file.arrayBuffer();
    const u8 = new Uint8Array(bytes);
    const magic = String.fromCharCode(...u8.subarray(0, 4));
    const cands = [];
    if (magic === 'CHN2' || magic === '2NHC') { // movie/content file: list its MSND sounds
      try {
        const chunkyFile = new ChunkyFile(bytes);
        for (const m of chunkyFile.ofType('MSND')) {
          const kids = chunkyFile.kidsOf('MSND', m.cno);
          const wav = kids.find((k) => k.ctg === 'WAVE'), mid = kids.find((k) => k.ctg === 'MIDS');
          if (wav) cands.push({ name: m.name || file.name, bytes: chunkyFile.data('WAVE', wav.cno).slice(), mime: 'audio/wav' });
          else if (mid) cands.push({ name: m.name || file.name, bytes: chunkyFile.data('MIDS', mid.cno).slice(), mime: 'audio/mids', midi: true });
        }
      } catch (e) { console.warn('[import] chunky parse:', e.message); }
    } else {
      const midi = /\.(mid|midi|rmi)$/i.test(file.name);
      cands.push({ name: file.name.replace(/\.[^.]+$/, ''), bytes: u8, mime: file.type || 'audio/*', midi });
    }
    if (cands.length) AssetBrowserView.show(kind, cands);
    else console.warn(`[import] no sounds found in ${file.name}`);
  };

  /** Open the file picker for imports — each picked file runs through
   *  `importSoundFile`. */
  importSoundFiles = (kind) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.accept = kind === 'music' ? 'audio/*,.mid,.midi,.3mm,.3cn,.chn,.cfl' : 'audio/*,.3mm,.3cn,.chn,.cfl';
    inp.onchange = async () => { for (const f of inp.files) await this.importSoundFile(kind, f); };
    inp.click();
  };
}

export const soundSources = new SoundSources();
// compat exports for the __mms debug surface
