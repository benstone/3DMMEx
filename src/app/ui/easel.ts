// Easel shell — the canvas counterpart of the old ui-dom brwsShell(). An easel
// is a View pushed onto the UiRoot stack; it shares the brwsView slot in
// browser.js so showBrowser()/closeBrowser()/Escape all treat easels and book
// browsers uniformly. Real <input> elements stay DOM overlays (text entry needs
// the OS caret/IME) — domOverlay() floats them over the canvas at logical
// 640x480 coords; they're removed when the view leaves the stack.
import { View, ui } from './root.ts';
import { Element } from './element.ts';
import { Img, StBtn } from './widgets.ts';
import { texImg, imgReady } from './img.ts';
import { $ } from '../res.ts';
import { ModalView, setModalView, closeModal } from './modal.ts';

/** Blits an offscreen canvas (GL preview, baked thumb) into its rect. */
export class CvEl extends Element {
  constructor(cv, x, y, w, h) { super(x, y, w, h); this.cv = cv; this.pickable = false; }
  draw(ctx) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.cv, 0, 0, this.w, this.h); }
}

/** Offscreen GL preview canvas — a canvas that never enters the DOM. */
export const offCv = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// --- shared easel widgets ----------------------------------------------------

/** Auto-repeat scroll arrow (e3up/e3down): pressed face + accelerating repeat. */
export class ScrollBtn extends Element {
  constructor(up, x, y, w, h, onStep) {
    super(x, y, w, h);
    this.cursor = 'pointer'; this.up = up; this.onStep = onStep; this.dn = false;
    /** @type {any} */ this.tm = null;
  }
  draw(ctx) {
    const im = texImg(`${this.up}${this.dn ? 'c' : ''}`, () => this.dirty());
    if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
  }
  onPointerDown() {
    this.dn = true; this.dirty(); this.onStep();
    let del = 250;
    const go = () => { this.onStep(); del = Math.max(80, del - 20); this.tm = setTimeout(go, del); };
    this.tm = setTimeout(go, del);
    return true;
  }
  onPointerUp() { this.release(); }
  onPointerLeave() { this.release(); }
  release() { this.dn = false; this.dirty(); clearTimeout(this.tm); }
}

/** Recorder thermometer — a colored fill that tracks recording progress. */
export class Therm extends Element {
  constructor(x, y, w, h) {
    super(x, y, w, h); this.pickable = false; this.f = 0;
  }
  draw(ctx) {
    ctx.fillStyle = '#cfe8ff'; ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#3465a4'; ctx.fillRect(0, 0, this.w * Math.min(1, this.f), this.h);
    ctx.strokeStyle = '#222'; ctx.strokeRect(0.5, 0.5, this.w - 1, this.h - 1);
  }
}

/** e4audit name plate — press face + centered label; click auditions. */
export class NamePlate extends Element {
  constructor(x, y, w, h, label, onClick) {
    super(x, y, w, h);
    this.cursor = 'pointer'; this.label = label; this.act = onClick; this.dn = false;
  }
  draw(ctx) {
    const im = texImg(`e4audit${this.dn ? 'c' : ''}`, () => this.dirty());
    if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
    ctx.fillStyle = '#222'; ctx.font = "bold 9px 'Comic Sans MS', cursive, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.label, this.w / 2, this.h / 2, this.w - 6);
  }
  onPointerDown() { this.dn = true; this.dirty(); }
  onPointerUp() { this.dn = false; this.dirty(); }
  onPointerLeave() { this.dn = false; this.dirty(); }
  onClick() { this.act?.(); }
}

/** e4vol listener slider — track with a travelling thumb; commit on release.
 * vlm 0..1 maps to yp 100..0; dragging below the line (yp>100) means silent. */
export class LisSlider extends Element {
  constructor(x, y, w, h, vlm, onCommit) {
    super(x, y, w, h);
    this.cursor = 'pointer';
    this.yp = 100 - Math.round(vlm * 101); // yPos = yNuke - vlm*FullDisplay/kvlmFull
    this.onCommit = onCommit;
    this.th = new Img('e4vol1', 5, this.yp, 21, 11); // MoveAbsGob(kxpSliderThumb=5, yPos)
    this.th.pickable = false;
    this.add(this.th);
  }
  vlm() { return this.yp > 100 ? -1 : Math.max(0, (101 - this.yp) / 101); }
  move(p) {
    this.yp = Math.max(0, Math.min(108, p.y - (this.abs()[1]))); // p is view-space
    this.th.y = this.yp; this.th.dirty();
  }
  onPointerDown(p) { this.move(p); return true; }
  onPointerMove(p) { this.move(p); }
  onPointerUp() { this.onCommit(this.vlm()); }
}

/** Framed pick cell — d1frm/frame5 face with hover+selected states and a
 * drawInner(ctx) hook for the content (thumb, name). */
export class FrmCell extends Element {
  constructor(face, x, y, w, h, onClick) {
    super(x, y, w, h);
    this.cursor = 'pointer'; this.face = face; this.act = onClick;
    this.hov = false; this.sel = false;
  }
  draw(ctx) {
    const im = texImg(`${this.face}${this.sel || this.hov ? 'h' : ''}`, () => this.dirty());
    if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
    this.drawInner(ctx);
  }
  drawInner(ctx) {} // eslint-disable-line no-unused-vars
  onPointerEnter() { this.hov = true; this.dirty(); }
  onPointerLeave() { this.hov = false; this.dirty(); }
  onClick() { this.act?.(this); }
}

/** Float a DOM element over the UI canvas at logical 640x480 coords. */
export function domOverlay(el, x, y, w, h) {
  el.style.position = 'absolute';
  el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
  el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  el.style.zIndex = '57'; // above #ui (55), below optModal (60)
  $('studio').appendChild(el);
  return el;
}

export class EaselView extends ModalView { // modal semantics live in ModalView (modal.ts)
  mkImg(n, x, y, w, h) { const im = new Img(n, x, y, w, h); this.add(im); return im; }
  mkBtn(up, dn, x, y, w, h, act, tip = null) { const b = new StBtn(up, dn, x, y, w, h, act, tip); this.add(b); return b; }
  domInp(x, y, w, h, cls = 'spltInp') {
    const inp = document.createElement('input');
    inp.className = cls;
    return this.addDom(domOverlay(inp, x, y, w, h));
  }
}

/** Open an easel view (closes whatever browser/easel is up, then pushes). */
export function showEasel(view) { closeModal(); setModalView(view); ui.push(view, 'none'); }
