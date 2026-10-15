// Module-graph smoke test — evaluates the UI modules under a stubbed DOM.
// Regression net for eval-time import cycles (the `extends EaselView` TDZ):
// every subclass base must come from a module that has finished initializing.
import { describe, it, expect, beforeAll } from 'vitest';

const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 0 }) : (k === 'canvas' ? null : () => {})), set: () => true });
const elStub = () => new Proxy({
  style: {}, dataset: {}, children: [],
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
}, {
  get(t, k) {
    if (k in t) return (t as any)[k];
    if (k === 'getContext') return ctxStub;
    if (k === 'appendChild' || k === 'append' || k === 'insertBefore') return (c: any) => c;
    if (k === 'querySelector' || k === 'querySelectorAll') return () => null;
    return () => {};
  },
  set(t, k, v) { (t as any)[k] = v; return true; },
});

beforeAll(() => {
  (globalThis as any).document = {
    getElementById: () => null,
    createElement: () => elStub(),
    addEventListener: () => {}, removeEventListener: () => {},
    body: elStub(), documentElement: elStub(), hidden: false, visibilityState: 'visible',
  };
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  (globalThis as any).Image = class { set src(_v: string) {} };
  (globalThis as any).requestAnimationFrame = () => 0;
  (globalThis as any).cancelAnimationFrame = () => {};
  (globalThis as any).window = globalThis;
});

describe('module graph eval', () => {
  it('initializes easel-first (worst case for `extends EaselView`)', async () => {
    const easel = await import('../src/app/ui/easel.ts');
    const bio = await import('../src/app/ui/bio.ts');       // extends EaselView
    const easels = await import('../src/app/ui/easels.ts'); // extends EaselView/FrmCell
    const browser = await import('../src/app/ui/browser.ts'); // extends ModalView
    const studio = await import('../src/app/ui/studio.ts');
    expect(typeof easel.EaselView).toBe('function');
    expect(typeof bio.BioView).toBe('function');
    expect(typeof easels.SorterEasel).toBe('function');
    expect(typeof easels.CostumeEasel).toBe('function');
    expect(typeof browser.BrowserView).toBe('function');
    expect(typeof studio.StudioView).toBe('function');
  });
});
