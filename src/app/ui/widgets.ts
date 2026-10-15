// Shared canvas UI widgets — texture-backed button, slider, image, text link,
// and the GL movie screen blit.
import { Element } from './element.ts';
import { textureCache } from './textureCache.ts';
import { elementById } from '../resources.ts';
import { localizer } from '../localization.ts';

/** Draws a texture by name, fit/contain/cover into its rect. */
export class ImageElement extends Element {
  constructor(name, x, y, w, h, fit = 'fill') { super(x, y, w, h); this.name = name; this.fit = fit; this.pickable = false; }
  /** Paint the texture fitted into the rect (cover centers + crops). */
  draw(ctx) {
    const image = textureCache.image(this.name, () => this.dirty());
    if (!textureCache.isReady(image)) return;
    ctx.imageSmoothingEnabled = false;
    if (this.fit === 'cover') {
      const s = Math.max(this.w / image.naturalWidth, this.h / image.naturalHeight);
      const w = image.naturalWidth * s, h = image.naturalHeight * s;
      ctx.drawImage(image, (this.w - w) / 2, (this.h - h) / 2, w, h);
    } else ctx.drawImage(image, 0, 0, this.w, this.h);
  }
}

/** Up/down-faced bitmap button. up may be a function (play/stop face). */
export class ImageButton extends Element {
  /** `upFace` may be a texture name or a zero-arg function returning one
   *  (play/stop toggles); `downFace` is the pressed texture. */
  constructor(upFace, downFace, x, y, w, h, onClick) {
    super(x, y, w, h);
    this.upFace = upFace; this.downFace = downFace; this.action = onClick;
    this.pressed = false; this.cursor = 'pointer';
  }
  /** The texture name to draw — the function face, or pressed->downFace. */
  face() { return typeof this.upFace === 'function' ? this.upFace() : (this.pressed && this.downFace ? this.downFace : this.upFace); }
  /** Re-read face() — call when the backing state changes. */
  sync() { this.dirty(); }
  /** Paint the current face texture. */
  draw(ctx) {
    const image = textureCache.image(this.face(), () => this.dirty());
    if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
  }
  /** Show the pressed face. */
  onPointerDown() { this.pressed = true; this.dirty(); }
  /** Release the pressed face. */
  onPointerUp() { if (this.pressed) { this.pressed = false; this.dirty(); } }
  /** Cancel the press when the pointer slides off. */
  onPointerLeave() { if (this.pressed) { this.pressed = false; this.dirty(); } }
  /** Fire the click action. */
  onClick() { this.action?.(); }
}

/** Text link (theatre 'settings') — bold Comic Sans, underline on hover. */
export class TextLink extends Element {
  constructor(text, x, y, w, h, onClick, { size = 10, color = '#3465a4', align = 'left' } = {}) {
    super(x, y, w, h);
    this.text = text; this.action = onClick;
    this.size = size; this.color = color; this.align = align;
    this.hover = false; this.cursor = 'pointer';
  }
  /** Paint the link text + hover underline. */
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
  /** Underline on hover. */
  onPointerEnter() { this.hover = true; this.dirty(); }
  /** Remove the underline. */
  onPointerLeave() { this.hover = false; this.dirty(); }
  /** Fire the click action. */
  onClick() { this.action?.(); }
}

/** Studio-style bitmap button — mirrors the old DOM stBtn idiom: `on`/`down`
    class flags, `syncFace()` face callback, `onclick` action, `enabled` gate, tip id. */
export class StudioButton extends Element {
  constructor(upFace, downFace, x, y, w, h, onclick, tipId = null) {
    super(x, y, w, h);
    this.upFace = upFace; this.downFace = downFace;
    this.onclick = onclick;
    this.tooltipId = tipId;
    this.cursor = 'pointer';
    this.enabled = true;            // disabled buttons draw the 'd' face when set
    this.dim = false;           // 'brightness(.6)' down-face filter
    this.alpha = 1;
    this.faceOverride = null;   // explicit texture name (undo/anim faces)
    /** @type {string|undefined} */ this.toolId = undefined; // armed-tool id the face follows
    /** @type {string[]|undefined} */ this.animFaces = undefined; /** @type {number} */ this.animIndex = 0; // cycling faces
    const cl = new Set();
    this.classList = { // minimal DOM classList shim so ported logic is verbatim
      add: (c) => cl.add(c), remove: (c) => cl.delete(c),
      contains: (c) => cl.has(c), toggle: (c, f) => { f === undefined ? (cl.has(c) ? cl.delete(c) : cl.add(c)) : (f ? cl.add(c) : cl.delete(c)); },
    };
    this.classSet = cl;
    this.syncFace = () => { this.dirty(); };
  }
  /** True while pressed. */
  get isDown() { return this.classSet.has('down'); }
  /** True while armed/on. */
  get isOn() { return this.classSet.has('on'); }
  /** The texture name to draw — explicit override, else down-face while
   *  pressed/armed, else the up face. */
  face() {
    if (this.faceOverride) return this.faceOverride;
    return this.isOn || this.isDown ? this.downFace : this.upFace;
  }
  /** Paint the face texture — dimmed/alpha'd per the flags. */
  draw(ctx) {
    const image = textureCache.image(this.face(), () => this.dirty());
    if (!textureCache.isReady(image)) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    if (this.dim && ctx.filter !== undefined) ctx.filter = 'brightness(.6)';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, this.w, this.h);
    ctx.restore();
  }
  /** Press — disabled buttons swallow the click (return true). */
  onPointerDown() {
    if (!this.enabled) return true;
    this.classSet.add('down'); this.syncFace(); this.dirty();
  }
  /** Release the press. */
  onPointerUp() { this.classSet.delete('down'); this.syncFace(); this.dirty(); }
  /** Cancel the press when the pointer slides off. */
  onPointerLeave() { if (this.isDown) { this.classSet.delete('down'); this.syncFace(); this.dirty(); } }
  /** Fire the click action when enabled. */
  onClick() { if (this.enabled) this.onclick?.(); }
}

/** Vertical drag slider (theatre volume). thumb = texture name. */
export class VerticalSlider extends Element {
  /** `thumb` is a texture name; `onChange(value 0..1)` fires while dragging
   *  and on `set(v, true)`. */
  constructor(x, y, w, h, thumb, onChange) {
    super(x, y, w, h);
    this.thumb = thumb; this.onChange = onChange;
    this.value = 1; this.dragging = false;
  }
  /** Set the value — `fire` reports it through onChange. */
  set(v, fire = false) { this.value = Math.max(0, Math.min(1, v)); if (fire) this.onChange?.(this.value); this.dirty(); }
  /** Thumb's [y, height] for the current value — height scales with the
   *  texture's aspect, defaults 12 before it decodes. */
  thumbPos() { const th = textureCache.image(this.thumb); const thH = textureCache.isReady(th) ? this.w * th.naturalHeight / th.naturalWidth : 12; return [this.value * (this.h - thH), thH]; }
  /** Paint the thumb at the value position. */
  draw(ctx) {
    const image = textureCache.image(this.thumb, () => this.dirty());
    if (!textureCache.isReady(image)) return;
    const [ty, thH] = this.thumbPos();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, ty, this.w, thH);
  }
  /** Map a view-space point to the slider value and fire onChange. */
  _setFrom(p) { const [, thH] = this.thumbPos(); this.set((p.y - this.y - thH / 2) / (this.h - thH), true); }
  /** Start the drag and jump the thumb to the pointer. */
  onPointerDown(p) { this.dragging = true; this._setFrom(p); return true; }
  /** Track the drag. */
  onPointerMove(p) { if (this.dragging) this._setFrom(p); }
  /** End the drag. */
  onPointerUp() { this.dragging = false; }
}

/** Plain text element — font/color/align options; html-less lines via '\n'. */
export class TextElement extends Element {
  constructor(text, x, y, w, h, { size = 12, color = '#222', align = 'center', bold = true, font = null } = {}) {
    super(x, y, w, h);
    this.text = text; this.size = size; this.color = color; this.align = align;
    this.bold = bold; this.font = font; this.pickable = false;
  }
  /** Set the text (DOM-style alias for .text) — repaints on change. */
  set textContent(v) { if (v !== this.text) { this.text = v; this.dirty(); } }
  /** The element's text. */
  get textContent() { return this.text; }
  /** Paint the wrapped/centered text lines. */
  draw(ctx) {
    if (!this.text) return;
    ctx.fillStyle = this.color;
    ctx.font = `${this.bold ? 'bold ' : ''}${this.size}px ${this.font || `'Comic Sans MS', cursive, sans-serif`}`;
    ctx.textAlign = this.align; ctx.textBaseline = 'middle';
    const tx = this.align === 'center' ? this.w / 2 : this.align === 'right' ? this.w : 0;
    const lines = String(this.text).split('\n');
    const lh = this.size * 1.2, y0 = this.h / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, tx, y0 + i * lh, this.w - 4));
  }
}

/** The 3D movie screen — blits the GL canvas into its rect each repaint. */
export class MovieScreen extends Element {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = false; this.playback = null; }
  /** Blit the GL canvas into the rect. */
  draw(ctx) {
    const v = elementById('view');
    if (!v) return;
    ctx.imageSmoothingEnabled = true; // 3D content upscales smoother than pixel art
    ctx.drawImage(v, 0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = false;
  }
  /** Per-frame — repaint so the blit always shows the freshest GL frame. */
  frame() { this.dirty(); }
}
