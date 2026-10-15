import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ChunkyFile } from '../src/format/chunky.ts';
import { parseMovie, serializeMovie, SEVT, AET } from '../src/format/movie.ts';
import { movieFile, movieFileBE } from './helpers.ts';

// The fixture is WHERE.3MM (an original 'Where's Rover' movie). movieFileBE()
// byte-swaps its container into a '2NHC' file to cover the big-endian path.
test('parseMovie reads the fixture movie structure', () => {
  const mv = parseMovie(movieFile());
  assert.equal(mv.name, "Where's Rover");
  assert.equal(mv.scenes.length, 3);

  const [s0, s1, s2] = mv.scenes;
  assert.equal(s0.name, 'MY-Street Background');
  assert.equal(s0.nfrmFirst, 1);
  assert.equal(s0.nfrmLast, 18);
  assert.equal(s2.name, 'GE-Black Background');

  // scene 1 carries the actors, text boxes and frame events
  assert.equal(s1.actors.size, 2);
  assert.equal(s1.tboxes.size, 12);
  assert.ok(s1.frameEvents.length > 0);
  assert.ok(s1.startEvents.length > 0);

  const patrick = [...s1.actors.values()].find((a) => a.arid === 0);
  const sasha = [...s1.actors.values()].find((a) => a.arid === 1);
  assert.ok(patrick && sasha);
  assert.equal(patrick.name, 'Patrick');
  assert.equal(sasha.name, 'Sasha the Dog');
  assert.deepEqual(patrick.tagTmpl, { sid: 2, ctg: 'TMPL', cno: 8236 });
  assert.deepEqual(sasha.tagTmpl, { sid: 2, ctg: 'TMPL', cno: 8252 });
  assert.ok(patrick.route.length > 0);
  assert.ok(patrick.events.length > 0);
  assert.ok(patrick.events.every((e) => Object.values(AET).includes(e.aet)));

  assert.ok(mv.rollCall.size >= 2);
  assert.equal(mv.rollCall.get(0).name, 'Patrick');
  assert.equal(mv.rollCall.get(1).name, 'Sasha the Dog');
  assert.ok(mv.gstSource); // chid-1 GST carried across verbatim
});

test('parseMovie reads a byte-swapped (2NHC) container identically', () => {
  const le = parseMovie(movieFile());
  const be = parseMovie(movieFileBE());
  assert.equal(be.name, le.name);
  assert.equal(be.scenes.length, le.scenes.length);
  for (let i = 0; i < le.scenes.length; i++) {
    assert.equal(be.scenes[i].name, le.scenes[i].name);
    assert.equal(be.scenes[i].actors.size, le.scenes[i].actors.size);
    assert.equal(be.scenes[i].tboxes.size, le.scenes[i].tboxes.size);
    assert.equal(be.scenes[i].frameEvents.length, le.scenes[i].frameEvents.length);
  }
  assert.equal(be.rollCall.get(0).name, 'Patrick');
});

test('scene events decode into typed data', () => {
  const mv = parseMovie(movieFile());
  const s1 = mv.scenes[1];
  const adds = s1.startEvents.filter((e) => e.sevt === SEVT.AddActr);
  assert.deepEqual(adds.map((e) => e.data).sort(), [0, 1]);
  const snd = s1.frameEvents.find((e) => e.sevt === SEVT.PlaySnd);
  if (snd) {
    assert.equal(typeof snd.data.vlm, 'number');
    assert.ok(Array.isArray(snd.data.tags));
  }
});

test('serializeMovie -> parseMovie roundtrip preserves structure', () => {
  const cf = movieFile();
  const mv = parseMovie(cf);
  const cf2 = new ChunkyFile(serializeMovie(mv), 'roundtrip');
  const mv2 = parseMovie(cf2);

  assert.equal(mv2.name, mv.name);
  assert.equal(mv2.scenes.length, mv.scenes.length);
  for (let i = 0; i < mv.scenes.length; i++) {
    const [a, b] = [mv.scenes[i], mv2.scenes[i]];
    assert.equal(b.name, a.name);
    assert.equal(b.nfrmFirst, a.nfrmFirst);
    assert.equal(b.nfrmLast, a.nfrmLast);
    assert.equal(b.actors.size, a.actors.size);
    assert.equal(b.tboxes.size, a.tboxes.size);
    assert.equal(b.frameEvents.length, a.frameEvents.length);
    assert.equal(b.startEvents.length, a.startEvents.length);
    for (const [chid, actor] of a.actors) {
      const a2 = b.actors.get(chid);
      assert.ok(a2, `actor chid ${chid} lost in roundtrip`);
      assert.equal(a2.arid, actor.arid);
      assert.equal(a2.events.length, actor.events.length);
      assert.equal(a2.route.length, actor.route.length);
    }
  }
  // embedded media survives the copy
  assert.equal([...cf2.ofType('MSND')].length, [...cf.ofType('MSND')].length);
  assert.equal([...cf2.ofType('WAVE')].length, [...cf.ofType('WAVE')].length);
  const w0 = cf.ofType('WAVE').next().value;
  assert.deepEqual(cf2.data('WAVE', w0.cno), cf.data('WAVE', w0.cno));
});
