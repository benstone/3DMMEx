// Shared canvas UI widgets — texture-backed button, slider, image, text link,
// and the GL movie screen blit.
import { Element } from './element.js';
import { texImg, imgReady } from './img.js';
import { $ } from '../res.js';
import { t } from '../i18n.js';

/** Draws a texture by name, fit/contain/cover into its rect. */
export class Img extends Element {
  constructor(name, x, y, w, h, fit = 'fill') { super(x, y, w, h); this.name = name; this.fit = fit; this.pickable = false; }
  draw(ctx) {
    const im = texImg(this.name, () => this.dirty());
    if (!imgReady(im)) return;
    ctx.imageSmoothingEnabled = false;
    if (this.fit === 'cover') {
      const s = Math.max(this.w / im.naturalWidth, this.h / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      ctx.drawImage(im, (this.w - w) / 2, (this.h - h) / 2, w, h);
    } else ctx.drawImage(im, 0, 0, this.w, this.h);
  }
}

/** Up/down-faced bitmap button. up may be a function (play/stop face). */
export class ImgButton extends Element {
  constructor(up, down, x, y, w, h, onClick) {
    super(x, y, w, h);
    this.up = up; this.down = down; this.act = onClick;
    this.pressed = false; this.cursor = 'pointer';
  }
  face() { return typeof this.up === 'function' ? this.up() : (this.pressed && this.down ? this.down : this.up); }
  sync() { this.dirty(); } // re-read face() — call when the backing state changes
  draw(ctx) {
    const im = texImg(this.face(), () => this.dirty());
    if (imgReady(im)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, this.w, this.h); }
  }
  onPointerDown() { this.pressed = true; this.dirty(); }
  onPointerUp() { if (this.pressed) { this.pressed = false; this.dirty(); } }
  onPointerLeave() { if (this.pressed) { this.pressed = false; this.dirty(); } }
  onClick() { this.act?.(); }
}

/** Text link (theatre 'settings') — bold Comic Sans, underline on hover. */
export class TextLink extends Element {
  constructor(text, x, y, w, h, onClick, { size = 10, color = '#3465a4', align = 'left' } = {}) {
    super(x, y, w, h);
    this.text = text; this.act = onClick;
    this.size = size; this.color = color; this.align = align;
    this.hover = false; this.cursor = 'pointer';
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.font = `bold ${this.size}px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = this.align; ctx.textBaseline = 'middle';
    const tx = this.align === 'center' ? this.w / 2 : this.align === 'right' ? this.w : 0;
    ctx.fillText(this.text, tx, this.h / 2);
    if (this.hover) {
      const m = ctx.measureText(this.text);
      const x0 = this.align === 'center' ? tx - m.width / 2 : this.align === 'right' ? tx - m.width : tx;
      ctx.fillRect(x0, this.h / 2 + this.size * 0.45, m.width, 1);
    }
  }
  onPointerEnter() { this.hover = true; this.dirty(); }
  onPointerLeave() { this.hover = false; this.dirty(); }
  onClick() { this.act?.(); }
}

/** Studio-style bitmap button — mirrors the old DOM stBtn idiom: `on`/`down`
    class flags, `_sync()` face callback, `onclick` action, `_en` gate, tip id. */
export class StBtn extends Element {
  constructor(up, dn, x, y, w, h, onclick, tipId = null) {
    super(x, y, w, h);
    this.up = up; this.dn = dn;
    this.onclick = onclick;
    this.tip = tipId;
    this.cursor = 'pointer';
    this._en = true;            // disabled buttons draw the 'd' face when set
    this.dim = false;           // 'brightness(.6)' down-face filter
    this.alpha = 1;
    this.faceOverride = null;   // explicit texture name (undo/anim faces)
    /** @type {string|undefined} */ this._tool = undefined; // armed-tool id the face follows
    /** @type {string[]|undefined} */ this._anim = undefined; /** @type {number} */ this._ai = 0; // cycling faces
    const cl = new Set();
    this.classList = { // minimal DOM classList shim so ported logic is verbatim
      add: (c) => cl.add(c), remove: (c) => cl.delete(c),
      contains: (c) => cl.has(c), toggle: (c, f) => { f === undefined ? (cl.has(c) ? cl.delete(c) : cl.add(c)) : (f ? cl.add(c) : cl.delete(c)); },
    };
    this._classes = cl;
    this._sync = () => { this.dirty(); };
  }
  get isDown() { return this._classes.has('down'); }
  get isOn() { return this._classes.has('on'); }
  face() {
    if (this.faceOverride) return this.faceOverride;
    return this.isOn || this.isDown ? this.dn : this.up;
  }
  draw(ctx) {
    const im = texImg(this.face(), () => this.dirty());
    if (!imgReady(im)) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    if (this.dim && ctx.filter !== undefined) ctx.filter = 'brightness(.6)';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, 0, 0, this.w, this.h);
    ctx.restore();
  }
  onPointerDown() {
    if (!this._en) return true;
    this._classes.add('down'); this._sync(); this.dirty();
  }
  onPointerUp() { this._classes.delete('down'); this._sync(); this.dirty(); }
  onPointerLeave() { if (this.isDown) { this._classes.delete('down'); this._sync(); this.dirty(); } }
  onClick() { if (this._en) this.onclick?.(); }
}

/** Vertical drag slider (theatre volume). thumb = texture name. */
export class VSlider extends Element {
  constructor(x, y, w, h, thumb, onChange) {
    super(x, y, w, h);
    this.thumb = thumb; this.onChange = onChange;
    this.value = 1; this.dragging = false;
  }
  set(v, fire = false) { this.value = Math.max(0, Math.min(1, v)); if (fire) this.onChange?.(this.value); this.dirty(); }
  thumbPos() { const th = texImg(this.thumb); const thH = imgReady(th) ? this.w * th.naturalHeight / th.naturalWidth : 12; return [this.value * (this.h - thH), thH]; }
  draw(ctx) {
    const im = texImg(this.thumb, () => this.dirty());
    if (!imgReady(im)) return;
    const [ty, thH] = this.thumbPos();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, 0, ty, this.w, thH);
  }
  _setFrom(p) { const [, thH] = this.thumbPos(); this.set((p.y - this.y - thH / 2) / (this.h - thH), true); }
  onPointerDown(p) { this.dragging = true; this._setFrom(p); return true; }
  onPointerMove(p) { if (this.dragging) this._setFrom(p); }
  onPointerUp() { this.dragging = false; }
}

/** The 3D movie screen — blits the GL canvas into its rect each repaint. */
export class MovieScreen extends Element {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = false; this.playback = null; }
  draw(ctx) {
    const v = $('view');
    if (!v) return;
    ctx.imageSmoothingEnabled = true; // 3D content upscales smoother than pixel art
    ctx.drawImage(v, 0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = false;
  }
  frame() { this.dirty(); } // always show the freshest GL frame while mounted
}
