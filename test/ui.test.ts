// Element tree invariants for the retained-mode canvas UI.
import { describe, it, expect, vi } from 'vitest';
import { Element } from '../src/app/ui/element.ts';

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
