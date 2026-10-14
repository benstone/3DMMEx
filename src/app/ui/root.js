// UiRoot — the single 640x480 UI canvas. Views are pushed/popped with optional
// animate in/out; repaints are clipped to the union of dirty rects.
// Virtual coords: everything works in 640x480 space regardless of the
// stretched CSS size — client->virtual mapping happens here.
import { Element } from './element.js';
import { Animator, EASE } from './anim.js';

export const UI_W = 640, UI_H = 480;

export class View extends Element {
  constructor() { super(0, 0, UI_W, UI_H); this.interactive = true; } // interactive: canvas takes pointer-events
  onEnter() {}   // pushed / uncovered
  onExit() {}    // popped / covered
}

export class UiRoot extends Element {
  constructor(canvas) {
    super(0, 0, UI_W, UI_H);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; // pixel-perfect scaling of the bitmap art
    this.root = this;
    this.stack = [];            // View objects, top = last
    this.leaving = [];          // views animating out (still painted, not hit-tested)
    this.toast = new Toast();   // say() overlay — always on top
    this.toast._ui = this;
    this.dirtyRects = [];
    this.dirtyAll = false;
    this.hover = null;
    this.captured = null;       // element holding pointer capture
    this.anim = new Animator(() => this.invalidate());
    this._raf = 0;
    canvas.width = UI_W; canvas.height = UI_H;
    canvas.style.pointerEvents = 'none'; // passive until a view asks for input
    this._bindInput();
  }

  get topView() { return this.stack[this.stack.length - 1] || null; }

  _rebuild() { this.children = [...this.stack, ...this.leaving, this.toast]; }

  /** Push a view. anim: 'fade'|'none' */
  push(view, anim = 'fade') {
    this.topView?.onExit();
    view.root = this; view.parent = this;
    this.stack.push(view);
    this._rebuild();
    this.invalidate();
    if (anim === 'fade') { view.opacity = 0; this.anim.tween(view, { opacity: 1 }, { dur: 220 }); }
    this._syncInput();
    view.onEnter();
  }

  /** Pop the top view (and remove it). anim: 'fade'|'none' */
  pop(anim = 'fade') {
    const v = this.stack.pop();
    if (!v) return;
    this._rebuild();
    const drop = () => {
      const i = this.leaving.indexOf(v); if (i >= 0) this.leaving.splice(i, 1);
      v.parent = v.root = null; this._rebuild(); this.invalidate();
    };
    if (anim === 'fade') { this.leaving.push(v); this._rebuild(); this.anim.tween(v, { opacity: 0 }, { dur: 200, done: drop }); }
    else { v.parent = v.root = null; }
    this.topView?.onEnter();
    this.invalidate();
    this._syncInput();
  }

  /** Replace the whole stack with one view (e.g. boot -> studio). */
  replace(view, anim = 'fade') {
    const old = this.stack.splice(0);
    this.leaving.push(...old);
    this.stack.push(view); view.root = this; view.parent = this;
    this._rebuild();
    this.invalidate();
    const drop = () => {
      for (const v of old) { const i = this.leaving.indexOf(v); if (i >= 0) this.leaving.splice(i, 1); v.parent = v.root = null; }
      this._rebuild(); this.invalidate();
    };
    if (anim === 'fade') { view.opacity = 0; this.anim.tween(view, { opacity: 1 }, { dur: 220, done: drop }); }
    else drop();
    this.topView?.onEnter();
    this._syncInput();
  }

  _syncInput() {
    const on = !!this.stack.length;
    this.canvas.style.pointerEvents = on && this.topView?.interactive !== false ? 'auto' : 'none';
    this.canvas.style.display = on ? '' : 'none';
    if (!on) { this.hover = null; this.captured = null; this.canvas.style.cursor = ''; }
    else this.start();
  }

  // --- dirty-region repaint -------------------------------------------------
  invalidate(x, y, w, h) {
    if (x === undefined) this.dirtyAll = true;
    else {
      if (x >= UI_W || y >= UI_H || x + w <= 0 || y + h <= 0) return; // fully outside
      this.dirtyRects.push([Math.max(0, x), Math.max(0, y), Math.min(UI_W, x + w), Math.min(UI_H, y + h)]);
    }
    this.start();
  }

  start() {
    if (this._raf) return;
    const step = (now) => {
      this.anim.tick(now);
      this._walkFrame(this, now);
      if (this.dirtyAll || this.dirtyRects.length || this.anim.active) this.repaint();
      this._raf = this.stack.length || this.anim.active || this.leaving.length
        ? requestAnimationFrame(step) : 0;
    };
    this._raf = requestAnimationFrame(step);
  }

  _walkFrame(el, now) {
    if (!el.visible) return;
    el.frame(now);
    for (const c of el.children) this._walkFrame(c, now);
  }

  repaint() {
    const { ctx } = this;
    ctx.save();
    if (!this.dirtyAll && this.dirtyRects.length) {
      // union of dirty rects -> one clip (per-rect would need N redraws)
      const u = this.dirtyRects.reduce(([ax, ay, ab, at], [x, y, b, t2]) =>
        [Math.min(ax, x), Math.min(ay, y), Math.max(ab, b), Math.max(at, t2)]);
      ctx.beginPath(); ctx.rect(u[0], u[1], u[2] - u[0], u[3] - u[1]); ctx.clip();
    }
    ctx.clearRect(0, 0, UI_W, UI_H);
    for (const v of this.children) v.paintTree(ctx);
    ctx.restore();
    this.dirtyAll = false; this.dirtyRects.length = 0;
  }

  // --- input -----------------------------------------------------------------
  _toVirtual(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * UI_W, y: (e.clientY - r.top) / r.height * UI_H, src: e };
  }

  _bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      const p = this._toVirtual(e);
      const hit = this.topView?.hitTest(p.x, p.y);
      this.captured = hit;
      if (hit) { c.setPointerCapture?.(e.pointerId); this._walkUp(hit, 'onPointerDown', p); }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this._toVirtual(e);
      if (this.captured) { this._walkUp(this.captured, 'onPointerMove', p); return; }
      const hit = this.topView?.hitTest(p.x, p.y) || null;
      if (hit !== this.hover) { this.hover?.onPointerLeave(); hit?.onPointerEnter(); this.hover = hit; }
      let cur = null, el = hit;
      while (el && !cur) { cur = el.cursor; el = el.parent; }
      c.style.cursor = cur || '';
      if (hit) this._walkUp(hit, 'onPointerMove', p);
    });
    const up = (e) => {
      const p = this._toVirtual(e);
      const hit = this.captured;
      if (hit) { this._walkUp(hit, 'onPointerUp', p); }
      const over = this.topView?.hitTest(p.x, p.y);
      if (hit && hit === over) this._walkUp(hit, 'onClick', p);
      this.captured = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.hover?.onPointerLeave(); this.hover = null; });
  }

  /** Dispatch to el then bubble up ancestors until one returns true. */
  _walkUp(el, method, p) {
    for (let e = el; e; e = e.parent) if (e[method]?.(p)) break;
  }

  /** PushErc-style notice — transient toast bottom-left. */
  say(msg) { this.toast.say(msg); this.invalidate(); this.start(); }
}

class Toast extends Element {
  constructor() { super(6, 452, 340, 22); this.pickable = false; this.msg = ''; /** @type {any} */ this._tm = 0; /** @type {any} */ this._ui = null; }
  say(msg) {
    this.msg = msg;
    this.visible = true; this.opacity = 1;
    clearTimeout(this._tm);
    this._tm = /** @type {any} */ (setTimeout(() => {
      const ui = this._ui;
      ui?.anim.tween(this, { opacity: 0 }, { dur: 300, done: () => { this.visible = false; } });
    }), 3000);
  }
  draw(ctx) {
    if (!this.msg) return;
    ctx.font = "bold 12px 'Comic Sans MS', cursive, sans-serif";
    const w = Math.min(this.w, ctx.measureText(this.msg).width + 16);
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    ctx.beginPath(); ctx.roundRect(0, 0, w, this.h, 4); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(this.msg, 8, this.h / 2, w - 16);
  }
}

// Singleton — created at module eval so boot can push its view immediately.
export const ui = new UiRoot(document.getElementById('ui') ?? Object.assign(document.createElement('canvas'), { id: 'ui' }));
if (!ui.canvas.parentNode) document.getElementById('stage')?.appendChild(ui.canvas);
import { setSayImpl } from '../res.js';
setSayImpl((msg) => ui.say(msg));
