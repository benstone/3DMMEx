// Resolves TAGs against the movie file and the 3DMM content files (.3CN).
import { ChunkyFile } from '../format/chunky.ts';
import { parseTemplate, parseMtrl, parseBkgd, parseCamera, parseTdf, parseMsnd } from '../format/content.ts';

export const CONTENT_FILES = ['TMPLS.3CN', 'BKGDS.3CN', 'MTRLS.3CN', 'TDFS.3CN', 'SNDS.3CN'];

export class Library {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(contentFiles) {
    this.content = contentFiles;
    this.movieFile = null;
    this._tmpl = new Map();
    this._bkgd = new Map();
    this._cam = new Map();
    this._tdf = new Map();
    this._msnd = new Map();
    this._rtmpl = new Map(); // runtime templates (FInsTdt's autosave-CRF write)
  }

  static async load(baseUrl, onProgress?) {
    const files = await Promise.all(CONTENT_FILES.map(async (n) => {
      const res = await fetch(`${baseUrl}/${n}`);
      if (!res.ok) throw new Error(`failed to load ${n}`);
      let buf;
      const rd = res.body?.getReader?.();
      if (onProgress && rd) { // streamed read so the boot bar can track real bytes
        const len = +res.headers.get('content-length') || 0;
        const parts = [];
        let got = 0;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          parts.push(value); got += value.length;
          onProgress(n, got, len);
        }
        buf = new Uint8Array(got);
        for (let o = 0, p = 0; p < parts.length; o += parts[p].length, p++) buf.set(parts[p], o);
      } else buf = new Uint8Array(await res.arrayBuffer());
      const magic = String.fromCharCode(...buf.subarray(0, 4));
      if (magic !== 'CHN2' && magic !== '2NHC')
        throw new Error(`${n} missing or invalid — copy the 3DMM .3CN content files into public/data/`);
      return new ChunkyFile(buf, n);
    }));
    return new Library(files);
  }

  setMovie(chunkyFile) {
    this.movieFile = chunkyFile;
    for (const m of [this._tmpl, this._bkgd, this._msnd]) for (const k of [...m.keys()]) if (k.startsWith('movie:')) m.delete(k);
    this._rtmpl.clear(); // runtime TDTs live in the movie's autosave CRF — a new movie gets a fresh one
  }

  /** Locate the chunky file holding a tag's chunk */
  resolve(tag) {
    if (tag.sid === 0 && this.movieFile?.has(tag.ctg, tag.cno)) return this.movieFile;
    for (const chunkyFile of this.content) if (chunkyFile.has(tag.ctg, tag.cno)) return chunkyFile;
    if (this.movieFile?.has(tag.ctg, tag.cno)) return this.movieFile;
    return null;
  }

  _cached(map, tag, fn) {
    const chunkyFile = this.resolve(tag);
    if (!chunkyFile) return null;
    const key = `${chunkyFile === this.movieFile ? 'movie' : chunkyFile.name}:${tag.cno}`;
    if (!map.has(key)) map.set(key, fn(chunkyFile, tag.cno));
    return map.get(key);
  }

  /** Register a runtime-built template; returns the tag that resolves to it */
  addTmpl(template) {
    const cno = 0x40000000 + this._rtmpl.size;
    template.cno = cno;
    this._rtmpl.set(cno, template);
    return { sid: 'rt', ctg: 'TMPL', cno };
  }

  template(tag) {
    const rt = this._rtmpl.get(tag.cno);
    if (rt) return rt;
    return this._cached(this._tmpl, tag, (chunkyFile, cno) => parseTemplate(chunkyFile, cno, this));
  }
  bkgd(tag) { return this._cached(this._bkgd, tag, parseBkgd); }
  mtrl(tag) { const chunkyFile = this.resolve(tag); return chunkyFile ? parseMtrl(chunkyFile, tag.cno) : null; }
  tdf(tag) { return this._cached(this._tdf, tag, parseTdf); }
  msnd(tag) { return this._cached(this._msnd, tag, parseMsnd); }

  camera(bkgd, icam) {
    const cno = bkgd.cameras[icam] ?? bkgd.cameras[0];
    const key = `${bkgd.chunkyFile.name}:${cno}`;
    if (!this._cam.has(key)) this._cam.set(key, parseCamera(bkgd.chunkyFile, cno));
    return this._cam.get(key);
  }
}
