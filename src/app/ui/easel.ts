// Easel shell — the canvas-hosted modal dialogs ("easels"). An
// easel is a View pushed onto the uiRoot stack; it shares the modalSlot.view
// slot so AssetBrowserView.show()/modalSlot.close()/Escape treat easels and
// book browsers uniformly. Real <input> elements stay DOM overlays (text entry
// needs the OS caret/IME) — EaselView.overlayElement() floats them over the
// canvas at logical 640x480 coords; they're removed when the view leaves.
import { View, uiRoot } from './root.ts';
import { Element } from './element.ts';
import { ImageElement, StudioButton } from './widgets.ts';
import { textureCache } from './textureCache.ts';
import { elementById } from '../resources.ts';
import { ModalView, modalSlot } from './modal.ts';
import { CURSORS } from './cursorManager.ts';
import { uiSounds } from './uiSounds.ts';

/** Blits an offscreen canvas (GL preview, baked thumb) into its rect. */
export class CanvasEl extends Element {
  /** `cv` is any canvas — drawn stretched into the element's rect. */
  constructor(cv, x, y, w, h) { super(x, y, w, h); this.cv = cv; this.pickable = false; }
  /** Stretch the backing canvas into the rect. */
  draw(ctx) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.cv, 0, 0, this.w, this.h); }
}

/** Offscreen GL preview canvas — a canvas that never enters the DOM. */
export const offscreenCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// --- shared easel widgets ----------------------------------------------------

/** Auto-repeat scroll arrow (e3up/e3down): pressed face + accelerating repeat. */
export class ScrollButton extends Element {
  /** `up` is the face's texture-name base ('c' suffix = pressed); `onStep`
   *  runs once per step. */
  constructor(up, x, y, w, h, onStep) {
    super(x, y, w, h);
    this.cursor = CURSORS.pointer; this.faceName = up; this.onStep = onStep; this.pressed = false;
    /** @type {any} */ this.repeatTimer = null;
  }
  /** Paint the face (pressed variant while held). */
  draw(ctx) {
    const image = textureCache.image(`${this.faceName}${this.pressed ? 'c' : ''}`, () => this.dirty());
    if (textureCache.isReady(image)) ctx.drawImage(image, 0, 0, this.w, this.h);
  }
  /** Press — steps once, then auto-repeats with accelerating delay. Each
   *  step plays `stepSound` when set (the gadget page-up/down sounds). */
  onPointerDown() {
    this.pressed = true; this.dirty(); this.step();
    let del = 250;
    const go = () => { this.step(); del = Math.max(80, del - 20); this.repeatTimer = setTimeout(go, del); };
    this.repeatTimer = setTimeout(go, del);
    return true;
  }
  /** Run one step — plays the step sound then calls onStep. */
  step() { if (this.stepSound) uiSounds.play(this.stepSound); this.onStep(); }
  /** Release — drops the face and stops the repeat. */
  onPointerUp() { this.release(); }
  /** Cancel the repeat when the pointer slides off. */
  onPointerLeave() { this.release(); }
  /** End the press — drops the face and stops the repeat. */
  release() { this.pressed = false; this.dirty(); clearTimeout(this.repeatTimer); }
}

/** Recorder thermometer — a colored fill that tracks recording progress. */
export class Thermometer extends Element {
  constructor(x, y, w, h) {
    super(x, y, w, h); this.pickable = false; this.f = 0;
  }
  /** Paint the track + progress fill. */
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
    this.cursor = CURSORS.pointer; this.label = label; this.action = onClick; this.pressed = false;
  }
  /** Paint the plate face + centered label. */
  draw(ctx) {
    const image = textureCache.image(`e4audit${this.pressed ? 'c' : ''}`, () => this.dirty());
    if (textureCache.isReady(image)) ctx.drawImage(image, 0, 0, this.w, this.h);
    ctx.fillStyle = '#222'; ctx.font = "bold 9px 'Comic Sans MS', cursive, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.label, this.w / 2, this.h / 2, this.w - 6);
  }
  /** Show the pressed face. */
  onPointerDown() { this.pressed = true; this.dirty(); }
  /** Release the pressed face. */
  onPointerUp() { this.pressed = false; this.dirty(); }
  /** Cancel the press when the pointer slides off. */
  onPointerLeave() { this.pressed = false; this.dirty(); }
  /** Audition the sound. */
  onClick() { this.action?.(); }
}

/** e4vol listener slider — track with a travelling thumb; commit on release.
 * vlm 0..1 maps to yp 100..0; dragging below the line (yp>100) means silent. */
export class ListenerSlider extends Element {
  constructor(x, y, w, h, vlm, onCommit) {
    super(x, y, w, h);
    this.cursor = CURSORS.pointer;
    this.yp = 100 - Math.round(vlm * 101); // volume 0..1 maps to thumb y 100..0
    this.onCommit = onCommit;
    this.th = new ImageElement('e4vol1', 5, this.yp, 21, 11); // the thumb tracks yp
    this.th.pickable = false;
    this.add(this.th);
  }
  /** Volume for the thumb position — below the line means silent (-1). */
  vlm() { return this.yp > 100 ? -1 : Math.max(0, (101 - this.yp) / 101); }
  /** Move the thumb to a view-space point, clamped to the track. */
  move(p) {
    this.yp = Math.max(0, Math.min(108, p.y - (this.abs()[1]))); // p is view-space
    this.th.y = this.yp; this.th.dirty();
  }
  /** Start the drag and jump the thumb to the pointer. */
  onPointerDown(p) { this._drag = true; this.move(p); return true; }
  /** Track the drag. */
  onPointerMove(p) { if (this._drag) this.move(p); }
  /** Release — commits the volume. */
  onPointerUp() { if (this._drag) { this._drag = false; this.onCommit(this.vlm()); } }
  /** Cancel the drag (no commit) when the pointer slides off. */
  onPointerLeave() { this._drag = false; }
}

/** Framed pick cell — d1frm/frame5 face with hover+selected states and a
 * drawInner(ctx) hook for the content (thumb, name). */
export class FramedCell extends Element {
  /** `face` is the texture-name base ('h' suffix = hover/selected variant);
   *  `onClick` gets the cell. */
  constructor(face, x, y, w, h, onClick) {
    super(x, y, w, h);
    this.cursor = CURSORS.pointer; this.face = face; this.action = onClick;
    this.hover = false; this.selected = false;
  }
  /** Paint the frame face (hover/selected variant) then the inner content. */
  draw(ctx) {
    const image = textureCache.image(`${this.face}${this.selected || this.hover ? 'h' : ''}`, () => this.dirty());
    if (textureCache.isReady(image)) ctx.drawImage(image, 0, 0, this.w, this.h);
    this.drawInner(ctx);
  }
  /** Content hook — subclasses draw the thumb/name inside the frame. */
  drawInner(ctx) {} // eslint-disable-line no-unused-vars
  /** Press — the sunken face is a press state, not hover. */
  onPointerDown() { this.hover = true; this.dirty(); }
  /** Release the press. */
  onPointerUp() { this.hover = false; this.dirty(); }
  /** Cancel the press when the pointer slides off. */
  onPointerLeave() { this.hover = false; this.dirty(); }
  /** Fire the pick action with this cell. */
  onClick() { this.action?.(this); }
}

export class EaselView extends ModalView { // modal semantics live in ModalView (modal.ts)
  /** Easels play the slide-open sound when pushed onto the modal slot. */
  openSound = 'ezlopen';
  /** Float a DOM element over the UI canvas at logical 640x480 coords. */
  static overlayElement(el, x, y, w, h) {
    el.style.position = 'absolute';
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
    el.style.zIndex = '57'; // above #uiRoot (55), below optModal (60)
    elementById('studio').appendChild(el);
    return el;
  }
  /** Add an ImageElement and return it. */
  makeImage(n, x, y, w, h) { const image = new ImageElement(n, x, y, w, h); this.add(image); return image; }
  /** Add a StudioButton and return it — face names ending 'okay'/'can'
   *  ('cancel') automatically adopt the ok/cancel click sounds. */
  makeButton(up, dn, x, y, w, h, act, tip = null) {
    const b = new StudioButton(up, dn, x, y, w, h, act, tip);
    if (/okay$/.test(up)) b.clickSound = 'ok'; else if (/can$|cancel$/.test(up)) b.clickSound = 'cancel';
    this.add(b); return b;
  }
  /** Create a DOM text input floated over the canvas at logical coords —
   *  auto-registered for hide/pop with the view. */
  domInput(x, y, w, h, cls = 'spltInp') {
    const inp = document.createElement('input');
    inp.className = cls;
    return this.addDom(EaselView.overlayElement(inp, x, y, w, h));
  }
}
