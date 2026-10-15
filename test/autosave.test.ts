// Autosave smoke: docMark -> docFlush -> docDB/localStorage -> open() restore.
import { test, expect, beforeAll } from 'vitest';
import { movieFile, contentLibrary } from './helpers.ts';

const ctxStub = () => new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 0 }) : () => {}), set: () => true });
const elStub = () => new Proxy({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }, {
  get(t, k) {
    if (k in t) return (t as any)[k];
    if (k === 'getContext') return ctxStub;
    if (k === 'appendChild' || k === 'append' || k === 'insertBefore') return (c: any) => c;
    return () => {};
  },
  set(t, k, v) { (t as any)[k] = v; return true; },
});

const ls = new Map<string, string>();

beforeAll(() => {
  (globalThis as any).document = {
    getElementById: () => null, createElement: () => elStub(),
    addEventListener: () => {}, removeEventListener: () => {},
    body: elStub(), documentElement: elStub(), hidden: false, visibilityState: 'visible',
  };
  (globalThis as any).localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => ls.set(k, v), removeItem: (k: string) => ls.delete(k) };
  (globalThis as any).Image = class { set src(_v: string) {} };
  (globalThis as any).requestAnimationFrame = () => 0;
  (globalThis as any).cancelAnimationFrame = () => {};
  (globalThis as any).window = globalThis;
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
  (globalThis as any).confirm = () => true;
  (globalThis as any).indexedDB = undefined; // exercise the localStorage mirror path
});

test('docFlush writes a restorable record; get()+bytes reopen', async () => {
  const state = await import('../src/app/state.ts');
  const doc = await import('../src/app/doc.ts');
  const { MoviePlayer } = await import('../src/engine/player.ts');
  state.setLib(contentLibrary());
  state.setSounds(new Proxy({}, { get: () => () => {} }));
  state.setRenderer(new Proxy({}, { get: () => () => {}, set: () => true }));
  state.setPlayer(new MoviePlayer(movieFile(), state.lib));

  doc.docMark();
  await doc.docFlush();

  const rec = await doc.docDB.get();
  expect(rec?.bytes?.length).toBeGreaterThan(100);
  expect(rec?.name).toBeTruthy();

  // restore path: open() the saved bytes into a fresh player
  const ok = doc.open(rec.bytes, rec.name, false);
  expect(ok).toBe(true);
  expect(state.player.movie.scenes.length).toBe(3);
});

test('edited movie (scene/actor/tbox inserts) serializes, flushes, restores', async () => {
  const state = await import('../src/app/state.ts');
  const doc = await import('../src/app/doc.ts');
  const { insActr, editBkgd } = await import('../src/app/edit/movie.ts');
  const { insTbox } = await import('../src/app/edit/tbox.ts');

  state.player.loadScene(0);
  const tmpl = state.lib.content.map((cf) => [...cf.ofType('TMPL')]).flat()[0];
  const bkgd = state.lib.content.map((cf) => [...cf.ofType('BKGD')]).flat()[0];
  expect(tmpl && bkgd).toBeTruthy();

  editBkgd(bkgd.cno, 'test scene');
  insActr({ sid: 2, ctg: 'TMPL', cno: tmpl.cno }, 'test actor', 0, { x: 0, y: 0, z: 0 });
  insTbox(true);

  doc.docMark();
  await doc.docFlush();
  const rec = await doc.docDB.get();
  expect(rec?.bytes?.length).toBeGreaterThan(100);

  const ok = doc.open(rec.bytes, rec.name, false);
  expect(ok).toBe(true);
});
