export {}; // module marker — required for `declare global` below to apply

// Shared ambient types — referenced from JSDoc as `import('../types').X`
// (or `import('./types').X` inside src/). The codebase is checkJs+JSDoc, so
// these are the single home for cross-module shapes (decision 8).

/** A 4-char chunky-file tag ('MVIE', 'SCEN', 'GST ' …) */
export type Ctg = string;

/** Index record for one chunk in a CHN2 file (format/chunky.js). */
interface Chunk {
  ctg: Ctg;
  cno: number;           // chunk number — instance id under a ctg
  fp: number; cb: number; // payload offset+size in the file
  packed: boolean; forest: boolean;
  kids: { ctg: Ctg; cno: number; chid: number }[];
  name: string;
}

/** Decoded chunky container (format/chunky.js ChunkyFile). */
export interface ChunkyFileHandle {
  name: string;
  bytes: Uint8Array;
  chunks: Map<string, Chunk>;
  has(ctg: Ctg, cno: number): boolean;
  get(ctg: Ctg, cno: number): Chunk | undefined;
  data(ctg: Ctg, cno: number): Uint8Array;
  kid(ctg: Ctg, cno: number, kidCtg: Ctg, chid: number): Chunk | undefined;
  ofType(ctg: Ctg): Iterable<Chunk>;
}

/** Indexed-color bitmap decoded from an MBMP chunk (render/thumbs). */
export interface Mbmp {
  width: number; height: number;
  /** palette-indexed pixels; resolve through the owning GLCR */
  px: Uint8Array;
  regX: number; regY: number; // registration point
}

/** Browser-grid item shown by ui/browser.js BrowserCell. */
export interface BrwsItem {
  name?: string;
  mbmp?: Mbmp;          // pre-rendered thumbnail (from .NTH)
  s?: unknown;          // scene items carry the scene object
  i?: number;           // scene index
  [k: string]: unknown;
}

// Window globals the app installs at boot (doc.ts sets window.moviePlayer etc
// for console debugging; __mms is the test/automation hook; cast/chrome
// are the Google Cast SDK globals).
declare global {
  interface Window {
    moviePlayer?: any; soundQueue?: any; sceneRenderer?: any; contentLibrary?: any;
    __mms?: any; __onGCastApiAvailable?: (ok: boolean) => void;
    cast?: any; chrome?: any; showSaveFilePicker?: (opts?: any) => Promise<any>;
  }
  // bare-global form for sites that call it unqualified
  var showSaveFilePicker: ((opts?: any) => Promise<any>) | undefined;
}

/** The app's URL-parameter object (all optional). */
export interface UrlParams {
  lang?: string;                    // 'auto' | lang code
  '3mm'?: string;                   // movie URL or name to load
  mode?: 'edit' | 'theatre' | 'embed';
  scene?: string; frame?: string; play?: string;
  opts?: string;                    // comma-separated render flags
  menu?: string; packs?: string;    // comma-separated assets.json URLs
  sf?: string; castid?: string;     // sound bank / CAF receiver app id
}
