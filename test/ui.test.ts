// Element tree invariants for the retained-mode canvas UI.
import { describe, it, expect, vi } from 'vitest';
import { Element } from '../src/app/ui/element.ts';

// root.ts instantiates a singleton `ui` at eval — give it a minimal document.
const stubCtx = () => new Proxy({ canvas: {} }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
(globalThis as any).document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, getContext: stubCtx, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }) }),
  addEventListener() {},
};
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).Image = class { set src(_v: string) {} }; // tips.ts instantiates Image at eval

// Fake root with the UiRoot invalidation surface.
const mkRoot = () => { const r = new Element(0, 0, 640, 480); r.invalidate = vi.fn(); return r; };

describe('root propagation', () => {
  it('propagates to descendants added before the root was attached', () => {
    const view = new Element(0, 0, 640, 480);
    const a = view.add(new Element(10, 10, 20, 20));
    const b = a.add(new Element(0, 0, 5, 5));
    expect(a.root).toBeNull(); // detached at add time
    const root = mkRoot();
    view.root = root; // view mounts — whole subtree must re-root
    expect(a.root).toBe(root);
    expect(b.root).toBe(root);
  });

  it('dirty() routes an absolute-space rect to the owning root', () => {
    const root = mkRoot();
    const view = new Element(0, 0, 640, 480);
    const child = view.add(new Element(10, 20, 30, 40));
    view.root = root;
    child.dirty();
    expect(root.invalidate).toHaveBeenCalledWith(10, 20, 30, 40);
  });

  it('clear() unroots the whole subtree', () => {
    const root = mkRoot();
    const view = new Element(0, 0, 640, 480);
    const child = view.add(new Element(0, 0, 5, 5));
    const grand = child.add(new Element(0, 0, 2, 2));
    view.root = root;
    view.clear();
    expect(child.root).toBeNull();
    expect(grand.root).toBeNull();
    child.dirty();
    expect(root.invalidate).not.toHaveBeenCalled();
  });

  it('new children inherit the live root at add() time', () => {
    const root = mkRoot();
    const view = new Element(0, 0, 640, 480);
    view.root = root;
    const child = view.add(new Element(0, 0, 5, 5));
    expect(child.root).toBe(root);
    const grand = child.add(new Element(0, 0, 2, 2));
    expect(grand.root).toBe(root);
  });
});

describe('hitTest', () => {
  it('hits nested children using parent-local coordinates', () => {
    const view = new Element(0, 0, 640, 480);
    const group = view.add(new Element(100, 100, 200, 200));
    const inner = group.add(new Element(50, 50, 10, 10)); // absolute (150,150)
    expect(view.hitTest(155, 155)).toBe(inner);
    expect(view.hitTest(50, 50)).toBe(view); // outside inner -> view itself
  });

  it('last-added child wins on overlap; pickable=false skips self not children', () => {
    const view = new Element(0, 0, 640, 480);
    const a = view.add(new Element(0, 0, 10, 10));
    const b = view.add(new Element(0, 0, 10, 10));
    a.pickable = false;
    const inner = a.add(new Element(0, 0, 5, 5));
    expect(view.hitTest(3, 3)).toBe(b);      // b is last-added (topmost)
    b.pickable = false;
    expect(view.hitTest(3, 3)).toBe(inner);  // b skipped -> a's child still hittable
  });
});

describe('paint order', () => {
  it('tips layer paints after all views, even under a clipped dirty-rect repaint', async () => {
    const calls = [];
    const ctx = { save() {}, restore() {}, translate() {}, beginPath() {}, rect() {}, clip() {}, clearRect() {} };
    Object.assign(ctx, { set globalAlpha(v) {}, get globalAlpha() { return 1; } });
    const canvas = { getContext: () => ctx, style: {}, addEventListener() {}, width: 0, height: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }) };
    const { UiRoot, View } = await import('../src/app/ui/root.ts');
    const { Element } = await import('../src/app/ui/element.ts');
    const r = new UiRoot(canvas);
    const view = new View();
    const toolbar = view.add(new Element(0, 47, 640, 51));
    toolbar.draw = () => calls.push('toolbar');
    const balloon = new Element(300, 60, 120, 80); // overlaps the toolbar strip
    balloon.draw = () => calls.push('balloon');
    r.tips.add(balloon);
    r.push(view, 'none');
    calls.length = 0;
    r.repaint();
    expect(calls.indexOf('balloon')).toBeGreaterThan(calls.indexOf('toolbar'));
    // now a dirty-rect repaint triggered by the toolbar — balloon must still win inside it
    calls.length = 0;
    toolbar.dirty(); r.repaint();
    expect(calls.indexOf('balloon')).toBeGreaterThan(calls.indexOf('toolbar'));
  });
});

describe('balloon skins', () => {
  // Regression: COBLN[1] once had a 6-element tvz row — the destructure left
  // `r` undefined, every flex length went NaN, and the balloon silently drew
  // only its top strip (tip appeared "behind" the toolbar).
  it('every COBLN tile row is well-formed and covers the dest axis', async () => {
    const { COBLN, gortSegs } = await import('../src/app/ui/tips.ts');
    for (const [dir, c] of Object.entries(COBLN)) {
      const [, , , , , , , , thz, tvz] = c as any[];
      for (const row of [thz, tvz]) {
        expect(row.length, `dir ${dir} row length`).toBe(7);
        for (let D = 60; D <= 240; D += 45) {
          const segs = gortSegs(row, D);
          let d = 0;
          for (const [s, sl, dOff, dl] of segs) {
            expect(Number.isFinite(s), `dir ${dir} src`).toBe(true);
            expect(Number.isFinite(dl), `dir ${dir} dstLen`).toBe(true);
            expect(dOff, `dir ${dir} dst contiguity`).toBe(d);
            expect(sl, `dir ${dir} src len`).toBeGreaterThanOrEqual(0);
            d = dOff + dl;
          }
          expect(d, `dir ${dir} D=${D} coverage`).toBeGreaterThanOrEqual(D);
        }
      }
    }
  });
});
