import test from 'node:test';
import assert from 'node:assert/strict';
import { MoviePlayer } from '../src/engine/player.js';
import { movieFile, contentLibrary } from './helpers.js';

// Integration: step the whole fixture movie headlessly against the real
// .3CN content files. Guards the Kauai scene-state semantics in player.js.
test('MoviePlayer steps through every scene to movie end', () => {
  const p = new MoviePlayer(movieFile(), contentLibrary());
  assert.equal(p.movie.scenes.length, 3);

  const seen = new Set();
  let steps = 0;
  p.loadScene(0);
  do {
    seen.add(p.sceneIndex);
    assert.ok(++steps < 10000, 'player should terminate');
  } while (p.step());

  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.ok(steps > 100, `suspiciously few frames: ${steps}`);
});

test('MoviePlayer resolves actor templates and stage presence', () => {
  const p = new MoviePlayer(movieFile(), contentLibrary());
  p.loadScene(1); // the scene with actors
  // Patrick is added at frame 30, Sasha enters via an AET.Add at frame 154
  p.gotoFrame(31);
  assert.deepEqual(p.visibleActors.map((a) => a.tmpl.name), ['Patrick']);
  p.gotoFrame(200);
  const names = p.visibleActors.map((a) => a.tmpl.name);
  assert.ok(names.includes('Patrick'), `expected Patrick on stage, got ${names}`);
  assert.ok(names.some((n) => /sasha|dog/i.test(n)), `expected Sasha on stage, got ${names}`);
  for (const a of p.visibleActors) assert.ok(a.rootMatrix.length === 12);
  // no unresolved content for this movie
  assert.deepEqual(p.warnings.filter((w) => /missing template/.test(w)), []);
});
