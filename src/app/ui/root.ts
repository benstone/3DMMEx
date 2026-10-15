// UiRoot — the single 640x480 UI canvas. Views are pushed/popped with optional
// animate in/out; repaints are clipped to the union of dirty rects.
// Virtual coords: everything works in 640x480 space regardless of the
// stretched CSS size — client->virtual mapping happens here.
import { Element } from './element.ts';
import { Animator, EASE } from './animator.ts';
import { appState, useUiState } from '../appState.ts';

/** Virtual canvas size — every element works in this space; the canvas is
 *  CSS-stretched to fill the stage. */
export const UI_WIDTH = 640, UI_HEIGHT = 480;

/** A full-canvas screen — pushed onto `uiRoot.stack`; `interactive` means the
 *  canvas takes pointer events while the view is on top. `onEnter`/`onExit`
 *  fire on push/pop and cover/uncover. */
export class View extends Element {
  constructor() { super(0, 0, UI_WIDTH, UI_HEIGHT); this.interactive = true; }
  /** Lifecycle — pushed onto the stack or uncovered by a pop. */
  onEnter() {}
  /** Lifecycle — popped or covered by a push. */
  onExit() {}
}

/** The canvas-UI root — owns the view stack, dirty-rect repaint loop, tween
 *  animator, toast overlay, and pointer routing (capture, hover, bubbling).
 *  Created as the `uiRoot` singleton at module eval. */
export class UiRoot extends Element {
  /** Bind to the `#ui` canvas — installs listeners and the repaint loop. */
  constructor(canvas) {
    super(0, 0, UI_WIDTH, UI_HEIGHT);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; // pixel-perfect scaling of the bitmap art
    this.root = this;
    this.stack = [];            // View objects, top = last
    this.leaving = [];          // popped views fading out — painted ON TOP of the stack
    this.leavingUnder = [];     // replaced views fading out — painted UNDER the stack
    this.toast = new Toast();   // toastHost.show() overlay — always on top
    this.toast._ui = this;
    this.toast.root = this;
    this.tips = new Element(0, 0, UI_WIDTH, UI_HEIGHT); // showCallout balloons — above views, under toast
    this.tips.pickable = false;
    this.tips.root = this;
    this.dirtyRects = [];
    this.dirtyAll = false;
    this.hover = null;
    this.captured = null;       // element holding pointer capture
    this.anim = new Animator(() => this.invalidate());
    this._raf = 0;
    canvas.width = UI_WIDTH; canvas.height = UI_HEIGHT;
    canvas.style.pointerEvents = 'none'; // passive until a view asks for input
    this._bindInput();
  }

  /** The top view — receives pointer input. */
  get topView() { return this.stack[this.stack.length - 1] || null; }

  /** Reassemble the element children from the view layers — leaving-under,
   *  stack, leaving-over, tips, toast — and publish stack depth to the store. */
  _rebuild() {
    this.children = [...this.leavingUnder, ...this.stack, ...this.leaving, this.tips, this.toast];
    // publish the stack into useUiState — view transitions / "is a dialog open"
    // (stackDepth > 1) become plain store selectors (see docs/uiRoot-framework.md)
    const u = useUiState.getState();
    if (u.topView !== this.topView || u.stackDepth !== this.stack.length)
      useUiState.setState({ topView: this.topView, stackDepth: this.stack.length });
  }

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

  /** Replace the whole stack with one view (e.g. boot -> studio). Old views
   *  fade out UNDER the incoming view so it never renders behind them. */
  replace(view, anim = 'fade') {
    const old = this.stack.splice(0);
    this.leavingUnder.push(...old);
    this.stack.push(view); view.root = this; view.parent = this;
    this._rebuild();
    this.invalidate();
    const drop = () => {
      for (const v of old) { const i = this.leavingUnder.indexOf(v); if (i >= 0) this.leavingUnder.splice(i, 1); v.parent = v.root = null; }
      this._rebuild(); this.invalidate();
    };
    if (anim === 'fade') { view.opacity = 0; this.anim.tween(view, { opacity: 1 }, { dur: 220, done: drop }); }
    else drop();
    this.topView?.onEnter();
    this._syncInput();
  }

  /** Enable/disable canvas pointer events and visibility per the stack —
   *  empty stack means the canvas is passive. */
  _syncInput() {
    const on = !!this.stack.length;
    this.canvas.style.pointerEvents = on && this.topView?.interactive !== false ? 'auto' : 'none';
    this.canvas.style.display = on ? '' : 'none';
    if (!on) { this.hover = null; this.captured = null; this.canvas.style.cursor = ''; }
    else this.start();
  }

  // --- dirty-region repaint -------------------------------------------------
  /** Queue a repaint — a rect in virtual coords, or the whole canvas when
   *  called bare. */
  invalidate(x?, y?, w?, h?) {
    if (x === undefined) this.dirtyAll = true;
    else {
      if (x >= UI_WIDTH || y >= UI_HEIGHT || x + w <= 0 || y + h <= 0) return; // fully outside
      this.dirtyRects.push([Math.max(0, x), Math.max(0, y), Math.min(UI_WIDTH, x + w), Math.min(UI_HEIGHT, y + h)]);
    }
    this.start();
  }

  /** Ensure the RAF loop is running — it ticks the animator, walks frame()
   *  hooks, repaints dirty regions, and stops itself when idle. */
  start() {
    if (this._raf) return;
    const step = (now) => {
      this.anim.tick(now);
      this._walkFrame(this, now);
      if (this.dirtyAll || this.dirtyRects.length || this.anim.active) this.repaint();
      this._raf = this.stack.length || this.anim.active || this.leaving.length || this.leavingUnder.length
        ? requestAnimationFrame(step) : 0;
    };
    this._raf = requestAnimationFrame(step);
  }

  /** Run the per-frame hook down the visible subtree. */
  _walkFrame(el, now) {
    if (!el.visible) return;
    el.frame(now);
    for (const c of el.children) this._walkFrame(c, now);
  }

  /** Redraw — clipped to the union of dirty rects when not a full repaint. */
  repaint() {
    const { ctx } = this;
    ctx.save();
    if (!this.dirtyAll && this.dirtyRects.length) {
      // union of dirty rects -> one clip (per-rect would need N redraws)
      const u = this.dirtyRects.reduce(([ax, ay, ab, at], [x, y, b, t2]) =>
        [Math.min(ax, x), Math.min(ay, y), Math.max(ab, b), Math.max(at, t2)]);
      ctx.beginPath(); ctx.rect(u[0], u[1], u[2] - u[0], u[3] - u[1]); ctx.clip();
    }
    ctx.clearRect(0, 0, UI_WIDTH, UI_HEIGHT);
    for (const v of this.children) v.paintTree(ctx);
    ctx.restore();
    this.dirtyAll = false; this.dirtyRects.length = 0;
  }

  // --- input -----------------------------------------------------------------
  /** Map a DOM pointer event to virtual 640x480 coords. */
  _toVirtual(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * UI_WIDTH, y: (e.clientY - r.top) / r.height * UI_HEIGHT, src: e };
  }

  /** Install the pointer handlers — capture on down, hover + cursor on move,
   *  click on up-over-same-element. */
  _bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') e.preventDefault(); // no compat-mouse / dbl-tap-zoom side effects
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

  /** Show a transient toast notice, bottom-left. */
  showToast(msg) { this.toast.showToast(msg); this.invalidate(); this.start(); }
}

/** The toast pill — bottom-left, auto-fades after ~3s. */
class Toast extends Element {
  constructor() { super(6, 452, 340, 22); this.pickable = false; this.msg = ''; /** @type {any} */ this._tm = 0; /** @type {any} */ this._ui = null; }
  /** Show a message — re-arms the fade timer. */
  showToast(msg) {
    this.msg = msg;
    this.visible = true; this.opacity = 1;
    clearTimeout(this._tm);
    this._tm = (setTimeout(() => {
      const uiRoot = this._ui;
      uiRoot?.anim.tween(this, { opacity: 0 }, { dur: 300, done: () => { this.visible = false; } });
    }), 3000 as any);
  }
  /** Draw the pill + text. */
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
export const uiRoot = new UiRoot(document.getElementById('ui') ?? Object.assign(document.createElement('canvas'), { id: 'ui' }));
if (!uiRoot.canvas.parentNode) document.getElementById('stage')?.appendChild(uiRoot.canvas);
import { toastHost } from '../resources.ts';
toastHost.setHandler((msg) => uiRoot.showToast(msg));
