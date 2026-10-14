// Easel shell — the canvas counterpart of the old ui-dom brwsShell(). An easel
// is a View pushed onto the UiRoot stack; it shares the brwsView slot in
// browser.js so showBrowser()/closeBrowser()/Escape all treat easels and book
// browsers uniformly. Real <input> elements stay DOM overlays (text entry needs
// the OS caret/IME) — domOverlay() floats them over the canvas at logical
// 640x480 coords; they're removed when the view leaves the stack.
import { View, ui } from './root.js';
import { Element } from './element.js';
import { Img, StBtn } from './widgets.js';
import { $ } from '../res.js';
import { setBrwsView, closeBrowser } from './browser.js';

/** Blits an offscreen canvas (GL preview, baked thumb) into its rect. */
export class CvEl extends Element {
  constructor(cv, x, y, w, h) { super(x, y, w, h); this.cv = cv; this.pickable = false; }
  draw(ctx) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.cv, 0, 0, this.w, this.h); }
}

/** Offscreen GL preview canvas — a canvas that never enters the DOM. */
export const offCv = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Float a DOM element over the UI canvas at logical 640x480 coords. */
export function domOverlay(el, x, y, w, h) {
  el.style.position = 'absolute';
  el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
  el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  el.style.zIndex = '57'; // above #ui (55), below optModal (60)
  $('studio').appendChild(el);
  return el;
}

export class EaselView extends View {
  constructor() { super(); this._onEsc = null; this._dom = []; }
  // onExit fires for BOTH covered (push on top) and popped — only tear the DOM
  // inputs down when we're actually leaving the stack; otherwise just hide them
  // and onEnter restores when we're uncovered again.
  onExit() {
    const gone = !ui.stack.includes(this);
    for (const el of this._dom) gone ? el.remove() : (el.style.display = 'none');
    if (gone) this._dom.length = 0;
  }
  onEnter() { for (const el of this._dom) el.style.display = ''; }
  addDom(el) { this._dom.push(el); return el; }
  mkImg(n, x, y, w, h) { const im = new Img(n, x, y, w, h); this.add(im); return im; }
  mkBtn(up, dn, x, y, w, h, act, tip = null) { const b = new StBtn(up, dn, x, y, w, h, act, tip); this.add(b); return b; }
  domInp(x, y, w, h, cls = 'spltInp') {
    const inp = document.createElement('input');
    inp.className = cls;
    return this.addDom(domOverlay(inp, x, y, w, h));
  }
}

/** Open an easel view (closes whatever browser/easel is up, then pushes). */
export function showEasel(view) { closeBrowser(); setBrwsView(view); ui.push(view, 'none'); }
