// Same as modulegraph.test.ts but studio-first — the other eval order that
// can surface a mid-init binding in the browser/easel/modal layer.
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
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  (globalThis as any).Image = class { set src(_v: string) {} };
  (globalThis as any).requestAnimationFrame = () => 0;
  (globalThis as any).cancelAnimationFrame = () => {};
  (globalThis as any).window = globalThis;
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
});

describe('module graph eval (studio-first)', () => {
  it('initializes studio-first', async () => {
    const studio = await import('../src/app/ui/studio.ts');
    const easels = await import('../src/app/ui/easels.ts');
    const browser = await import('../src/app/ui/browser.ts');
    const easel = await import('../src/app/ui/easel.ts');
    expect(typeof studio.StudioView).toBe('function');
    expect(typeof easels.SorterEasel).toBe('function');
    expect(typeof easel.EaselView).toBe('function');
    expect(typeof browser.ModalView).toBe('function');
  });
});
