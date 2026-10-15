// Autosave smoke: movieDocument.markDocumentDirty -> movieDocument.flushDocument -> movieDocument.documentDatabase/localStorage -> movieDocument.openMovie() restore.
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

test('movieDocument.flushDocument writes a restorable record; get()+bytes reopen', async () => {
  const state = await import('../src/app/appState.ts');
  const doc = await import('../src/app/movieDocument.ts');
  const { MoviePlayer } = await import('../src/engine/player.ts');
  state.appState.setContentLibrary(contentLibrary());
  state.appState.setSoundQueue(new Proxy({}, { get: () => () => {} }));
  state.appState.setSceneRenderer(new Proxy({}, { get: () => () => {}, set: () => true }));
  state.appState.setMoviePlayer(new MoviePlayer(movieFile(), state.appState.contentLibrary));

  doc.movieDocument.markDocumentDirty();
  await doc.movieDocument.flushDocument();

  const rec = await doc.movieDocument.documentDatabase.get();
  expect(rec?.bytes?.length).toBeGreaterThan(100);
  expect(rec?.name).toBeTruthy();

  // restore path: open() the saved bytes into a fresh appState.moviePlayer
  const ok = doc.movieDocument.openMovie(rec.bytes, rec.name, false);
  expect(ok).toBe(true);
  expect(state.appState.moviePlayer.movie.scenes.length).toBe(3);
});

test('edited movie (scene/actor/tbox inserts) serializes, flushes, restores', async () => {
  const state = await import('../src/app/appState.ts');
  const doc = await import('../src/app/movieDocument.ts');
  const { movieEdits } = await import('../src/app/edit/movieEdits.ts');
  const { textboxEdits } = await import('../src/app/edit/textboxEdits.ts');

  state.appState.moviePlayer.loadScene(0);
  const template = state.appState.contentLibrary.content.map((chunkyFile) => [...chunkyFile.ofType('TMPL')]).flat()[0];
  const bkgd = state.appState.contentLibrary.content.map((chunkyFile) => [...chunkyFile.ofType('BKGD')]).flat()[0];
  expect(template && bkgd).toBeTruthy();

  movieEdits.editBackground(bkgd.cno, 'test scene');
  movieEdits.insertActor({ sid: 2, ctg: 'TMPL', cno: template.cno }, 'test actor', 0, { x: 0, y: 0, z: 0 });
  textboxEdits.insertTextbox(true);

  doc.movieDocument.markDocumentDirty();
  await doc.movieDocument.flushDocument();
  const rec = await doc.movieDocument.documentDatabase.get();
  expect(rec?.bytes?.length).toBeGreaterThan(100);

  const ok = doc.movieDocument.openMovie(rec.bytes, rec.name, false);
  expect(ok).toBe(true);
});
