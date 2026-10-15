// Retained-mode element tree for the 640x480 canvas UI.
// Coordinate space is always virtual 640x480 pixels — no units, no %.
export class Element {
  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.pickable = true;   // participates in hit-testing
    this.opacity = 1;
    this.cursor = null;     // css cursor string while hovering
    this.root = null;
    this._root = null;      // opaque back-ref for view-owned anonymous elements
    /** @type {any} */ this._pop = null; // popup group this element belongs to (studio)
  }
  add(el) { el.parent = this; el.root = this.root; this.children.push(el); for (const c of el.children) c.root = this.root; return el; }
  remove(el) { const i = this.children.indexOf(el); if (i >= 0) { el.parent = el.root = null; this.children.splice(i, 1); } return el; }
  clear() { for (const c of this.children) { c.parent = c.root = null; } this.children.length = 0; }
  contains(px, py) { return px >= this.x && py >= this.y && px < this.x + this.w && py < this.y + this.h; }

  /** Deepest visible pickable element under (px,py), coords in this element's
      PARENT space (children are positioned locally, matching paintTree's
      translate). pickable=false only exempts *this* element — children still test. */
  hitTest(px, py) {
    if (!this.visible) return null;
    const lx = px - this.x, ly = py - this.y; // into this element's local space
    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(lx, ly);
      if (hit) return hit;
    }
    if (this.pickable && lx >= 0 && ly >= 0 && lx < this.w && ly < this.h) return this;
    return null;
  }

  /** Mark this element's rect dirty for the next repaint. */
  dirty() { const [ax, ay] = this.abs(); this.root?.invalidate(ax, ay, this.w, this.h); }

  /** dirty() with an optional explicit rect (virtual coords, canvas-space). */
  invalidate(x, y, w, h) {
    if (x === undefined) this.dirty();
    else this.root?.invalidate(x, y, w, h);
  }

  /** Per-frame hook (dt ms) — only called on elements in the active tree. */
  frame(dt) {} // eslint-disable-line no-unused-vars

  /** Paint. ctx is already transformed to this element's local space. */
  draw(ctx) {} // eslint-disable-line no-unused-vars

  /** Recursive paint — clip applied, children sorted in add order. */
  paintTree(ctx) {
    if (!this.visible || this.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.opacity < 1) ctx.globalAlpha *= this.opacity;
    this.draw(ctx);
    for (const c of this.children) c.paintTree(ctx);
    ctx.restore();
  }

  /** Local -> absolute offset (walk parents). */
  abs() { let x = this.x, y = this.y, p = this.parent; while (p) { x += p.x; y += p.y; p = p.parent; } return [x, y]; }

  // Pointer event hooks — subclass overrides. Returning true stops propagation.
  onPointerDown(e) {} // eslint-disable-line no-unused-vars
  onPointerMove(e) {} // eslint-disable-line no-unused-vars
  onPointerUp(e) {} // eslint-disable-line no-unused-vars
  onPointerEnter() {}
  onPointerLeave() {}
  onClick(e) {} // eslint-disable-line no-unused-vars
}
