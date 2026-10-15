// Global cursor state for the canvas UI. Elements declare a `cursor` spec —
// {name,x,y} picks a .cur asset with its authored hotspot, {css} requests a
// raw CSS keyword, null falls back to the default arrow. CursorManager owns
// the rendered canvas's cursor: hover resolution, a default, a forced
// override (hidden/wait), and change-avoidance so the DOM write only
// happens when the resolved cursor actually changes. .cur assets are decoded
// and re-rastered at the canvas's display scale so they track the 640x480
// logical zoom instead of rendering at native pixel size.
import { cursorUrl } from '../resources.ts';
import type { Element } from './element.ts';

/** A cursor request — `{name,x,y}` is a .cur asset + hotspot, `{css}` a raw
 *  CSS cursor keyword, and null means "use the default". */
export type CursorSpec = { name: string; x?: number; y?: number } | { css: string } | null;

/** Named cursors — the original's kcrs* set (hotspots read from the .cur
 *  files) plus the CSS fallbacks the app still uses. */
export const CURSORS = {
  arrow:       { name: 'default' },              // kcrsArrow — the studio default
  pointer:     { name: 'hotspot', x: 5, y: 0 },  // kcrsHand — interactive elements
  ibeam:       { name: 'ibeam', x: 5, y: 3 },    // kcrsIBeam — text fields and boxes
  textboxCreate: { name: 'creatbox', x: 4, y: 4 }, // kcrsTboxCreate — a textbox attached to the mouse
  action:      { name: 'actions2', x: 0, y: 5 }, // kcrsActionBrowser — the action tool wand
  wait:        { name: 'wait', x: 7, y: 7 },     // busy during long operations
  crosshair:   { css: 'crosshair' },             // pending actor/prop placement
  none:        { css: 'none' },                  // hidden
} as const;

/** Build a .cur spec with its authored hotspot — the form `Element.cursor`
 *  takes for tool cursors. */
export const cur = (name: string, x = 0, y = 0): CursorSpec => ({ name, x, y });

/** Decode a .cur (ICO-format) buffer into an RGBA canvas. Ships 1bpp and
 *  32bpp images; anything else returns null (caller falls back to url()). */
function decodeCur(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  if (dv.byteLength < 22 || dv.getUint16(2, true) !== 2) return null; // reserved,type=2,count
  const off = dv.getUint32(18, true); // first ICONDIRENTRY's image offset
  const bw = dv.getUint8(6), bh = dv.getUint8(7), hx = dv.getUint16(10, true), hy = dv.getUint16(12, true);
  const w = bw || 256, h = bh || 256;
  if (dv.getUint32(off, true) !== 40) return null; // BITMAPINFOHEADER only
  const bits = dv.getUint16(off + 14, true);
  const stride = Math.ceil(w / 32) * 4; // 1bpp rows are 4-byte aligned
  const px = new Uint8ClampedArray(w * h * 4);
  if (bits === 1) {
    const pal = off + 40;                       // 2-entry BGRA palette
    const xor = pal + 8, and = xor + stride * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const src = h - 1 - y;                    // DIB rows are bottom-up
      const aBit = (dv.getUint8(and + src * stride + (x >> 3)) >> (7 - (x & 7))) & 1;
      if (aBit) continue;                       // AND 1 → transparent (screen bits are skipped)
      const xBit = (dv.getUint8(xor + src * stride + (x >> 3)) >> (7 - (x & 7))) & 1;
      const c = pal + xBit * 4, i = (y * w + x) * 4;
      px[i] = dv.getUint8(c + 2); px[i + 1] = dv.getUint8(c + 1); px[i + 2] = dv.getUint8(c); px[i + 3] = 255;
    }
  } else if (bits === 32) {
    const xor = off + 40;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = xor + ((h - 1 - y) * w + x) * 4, i = (y * w + x) * 4;
      px[i] = dv.getUint8(s + 2); px[i + 1] = dv.getUint8(s + 1); px[i + 2] = dv.getUint8(s); px[i + 3] = dv.getUint8(s + 3);
    }
  } else return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
  return { c, w, h, hx, hy };
}

/** Re-encode an RGBA canvas as a .cur file (32bpp BGRA + zeroed AND mask) —
 *  the same format the raw assets use, so every browser that accepts the
 *  original `url(... .cur)` path accepts the scaled variant. */
function encodeCur(c: HTMLCanvasElement, hx: number, hy: number) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const andStride = Math.ceil(w / 32) * 4;
  const dib = 40 + w * h * 4 + andStride * h;
  const buf = new ArrayBuffer(22 + dib), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(2, 2, true); dv.setUint16(4, 1, true);            // ICONDIR: type=cursor, count=1
  dv.setUint8(6, w === 256 ? 0 : w); dv.setUint8(7, h === 256 ? 0 : h);
  dv.setUint16(10, hx, true); dv.setUint16(12, hy, true);        // embedded hotspot
  dv.setUint32(14, dib, true); dv.setUint32(18, 22, true);       // bytesInRes, image offset
  dv.setUint32(22, 40, true);                                    // BITMAPINFOHEADER.biSize
  dv.setUint32(26, w, true); dv.setUint32(30, h * 2, true);      // biWidth, biHeight (XOR+AND)
  dv.setUint16(34, 1, true); dv.setUint16(36, 32, true);         // biPlanes, biBitCount
  dv.setUint32(42, dib - 40, true);                              // biSizeImage
  let p = 62;
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) {   // BGRA rows, bottom-up
    const i = (y * w + x) * 4;
    u8[p++] = src[i + 2]; u8[p++] = src[i + 1]; u8[p++] = src[i]; u8[p++] = src[i + 3];
  }
  return buf; // AND mask stays zeroed — alpha carries the transparency
}

/** Owns the canvas cursor. `apply(el)` resolves the hovered element's cursor
 *  spec (walking parents like the pointer code), `set(spec)` writes a spec
 *  directly, `setOverride` forces a cursor over everything (e.g. `none`
 *  while a textbox rides the mouse), and `reset()` re-derives the default. */
export class CursorManager {
  canvas: HTMLCanvasElement | null = null;
  /** The fallback spec when no element declares a cursor. */
  defaultSpec: CursorSpec = CURSORS.arrow;
  /** Forced cursor — beats element cursors while set. */
  override: CursorSpec = null;
  /** The last CSS string written to the canvas — avoids redundant DOM writes. */
  applied = '';
  /** The spec currently applied — re-applied when a scaled raster lands. */
  lastSpec: CursorSpec = null;
  /** name → decoded image (or null on decode failure). */
  _decoded = new Map<string, Promise<any>>();
  /** name@scale → rasterized cursor entry {url: blob .cur URL, s: effective
   *  scale} ('' while pending). */
  _rasters = new Map<string, any>();
  /** The display scale the rasters were built at — canvas CSS px per logical px. */
  _rasterScale = 0;

  /** Bind the rendered canvas — call once at boot. */
  attach(canvas: HTMLCanvasElement) { this.canvas = canvas; }

  /** The canvas's logical→display scale (CSS px per virtual unit). */
  scale(): number {
    if (!this.canvas) return 1;
    const r = this.canvas.getBoundingClientRect();
    return r.width && this.canvas.width ? r.width / this.canvas.width : 1;
  }

  /** Decoded image for a cursor name — fetched + parsed once. */
  _decode(name: string) {
    let p = this._decoded.get(name);
    if (!p) {
      p = fetch(cursorUrl(name)).then((r) => r.ok ? r.arrayBuffer() : null).then((b) => b && decodeCur(b)).catch(() => null);
      this._decoded.set(name, p);
    }
    return p;
  }

  /** The scale-bucketed raster entry for a spec — kicks off the decode/raster,
   *  returns null until ready so the unscaled url() fills in meanwhile. */
  _raster(s: { name: string; x?: number; y?: number }, scale: number) {
    const key = `${s.name}@${scale}:${s.x ?? 0},${s.y ?? 0}`;
    let r = this._rasters.get(key);
    if (r !== undefined) return r || null;
    this._rasters.set(key, ''); // pending
    this._decode(s.name).then((img) => {
      if (img) {
        const es = Math.min(scale, 128 / Math.max(img.w, img.h)); // browsers cap cursor images at 128px
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.w * es));
        cv.height = Math.max(1, Math.round(img.h * es));
        const x = cv.getContext('2d');
        x.imageSmoothingEnabled = false; // pixelated — matches the logical-pixel UI
        x.drawImage(img.c, 0, 0, cv.width, cv.height);
        const ex = Math.round((s.x ?? 0) * es), ey = Math.round((s.y ?? 0) * es); // clamped scale → clamped hotspot
        this._rasters.set(key, { url: URL.createObjectURL(new Blob([encodeCur(cv, ex, ey)], { type: 'image/x-icon' })), x: ex, y: ey });
      }
      this.set(this.lastSpec); // raster landed (or failed) — re-derive the CSS
    });
    return null;
  }

  /** Resolve a spec to a CSS cursor value at the current display scale. */
  css(spec: CursorSpec): string {
    const s = spec ?? this.defaultSpec;
    if (!s) return '';
    if ('css' in s) return s.css;
    const scale = Math.max(0.25, Math.round(this.scale() * 8) / 8); // eighth steps keep the cache bounded
    if (scale !== this._rasterScale) { // display scale changed — drop stale blob URLs
      for (const r of this._rasters.values()) if (r?.url) URL.revokeObjectURL(r.url);
      this._rasters.clear(); this._rasterScale = scale;
    }
    const r = scale !== 1 ? this._raster(s, scale) : null;
    const raw = `url(${cursorUrl(s.name)}) ${s.x ?? 0} ${s.y ?? 0}`;
    if (r) return `url(${r.url}) ${r.x} ${r.y}, ${raw}, auto`;
    return `${raw}, auto`;
  }

  /** Set a forced override (or clear it with null). */
  setOverride(spec: CursorSpec) { this.override = spec; }

  /** Recompute the canvas cursor for the element under the pointer —
   *  walks up the parent chain for the first non-null `el.cursor`. */
  apply(el: Element | null) {
    let spec: CursorSpec = this.override, e: Element | null = el;
    while (!spec && e) { spec = e.cursor; e = e.parent; }
    this.set(spec);
  }

  /** Write the resolved CSS to the canvas (a no-op when unchanged). */
  set(spec: CursorSpec) {
    this.lastSpec = spec;
    const css = this.css(spec);
    if (css === this.applied) return;
    this.applied = css;
    if (this.canvas) this.canvas.style.cursor = css;
  }

  /** Drop element-derived state — pointer left the canvas or the stack emptied. */
  reset() { this.set(this.override); }
}

export const cursorManager = new CursorManager();
