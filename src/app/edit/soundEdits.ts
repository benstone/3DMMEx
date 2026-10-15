import { SEVT, AET } from '../../format/movie.ts';
import { WIT } from '../../engine/player.ts';
import { STY } from '../../format/content.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { appState } from '../appState.ts';
import { editHistory } from '../editHistory.ts';
import { textboxEdits } from './textboxEdits.ts';
// Sound editing — the sounder/looper/matcher tools, scene pause events, the
// listener easel's query/set/remove, and scene chopping (forward/back).
/** Sound and scene-length edits — all undoable via `editHistory`. */
export class SoundEdits {
  /** Picker kind -> sound style id. */
  SOUND_STYLES = { fx: STY.Sfx, speech: STY.Speech, music: STY.Midi };
  /** Resolve a picker item into the tool's sound tag — user items get a
   *  'usr' tag, builtin items resolve their MSND's style/volume. */
  soundTagFor = (kind, it) => {
  if (it.user || it.buf != null) return { tag: { sid: 'usr', ctg: 'MSND', cno: it.key }, sty: this.SOUND_STYLES[kind], vlm: 1, name: it.name };
  const tag = { sid: 2, ctg: 'MSND', cno: it.cno };
  const msnd = appState.contentLibrary.msnd(tag);
  return { tag, sty: msnd?.sty ?? this.SOUND_STYLES[kind], vlm: msnd?.vlm ?? 1, name: it.name };
};
  /** Load the picked sound into the sound tool — arming Play-Once unless
   *  Looping or (non-midi) motion-match is already armed. */
  setSoundTag = (kind, it) => {
  appState.editorTools.soundTag = it ? this.soundTagFor(kind, it) : null;
  if (!it) return;
  // arm play-once unless looping is armed, or motion-match is armed and the
  // pick isn't midi (midi can't motion-match)
  if (appState.editorTools.tool === 'looper' || (appState.editorTools.tool === 'matcher' && appState.editorTools.soundTag.sty !== STY.Midi)) return;
  appState.editorTools.toolButtons['3sing']?.onclick();
}
  /** Snapshot an actor's event list + build a restore function — the
   *  snapshot/reval pattern all actor-edit ops share. */
  actorEvents = (a) => {
  const evs0 = structuredClone(a.data.events);
  const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
  return [evs0, reval];
};
  /** Sounder tool on an actor — records a sound event with the tool tag's
   *  loop/queue/motion-match flags. */
  addActorSound = (a, fLoop, fQueue, fMM) => {
  const t = appState.editorTools.soundTag;
  if (!t) return;
  const [evs0, reval] = this.actorEvents(a);
  editHistory.executeOperation({ do: () => { a.fSetSnd(t.tag, fLoop, fQueue, fMM, t.vlm, t.sty); playbackLoop.drawFrame(); }, undo: () => reval(evs0) });
}
  /** Snapshot the scene's frame events + build an in-place restore
   *  function. */
  sceneEvents = () => {
  const s = appState.moviePlayer.scene, evs0 = structuredClone(s.frameEvents);
  const reval = (evs) => { const c = structuredClone(evs); s.frameEvents.length = 0; s.frameEvents.push(...c); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
  return [evs0, reval];
};
  /** Sounder tool on the background — a same-style PlaySnd at this frame
   *  either queues onto the existing event's chain or replaces it. */
  addBackgroundSound = (fLoop, fQueue) => {
  const t = appState.editorTools.soundTag;
  if (!t || !appState.moviePlayer.scene) return;
  const s = appState.moviePlayer.scene, nfrm = appState.moviePlayer.frame;
  const [evs0, reval] = this.sceneEvents();
  const apply = () => {
    let hit = -1;
    for (let i = s.frameEvents.length - 1; i >= 0; i--) {
      const e = s.frameEvents[i];
      if (e.nfrm < nfrm) break;
      if (e.nfrm === nfrm && e.sevt === SEVT.PlaySnd && e.data.sty === t.sty) { hit = i; break; }
    }
    if (hit >= 0 && fQueue) s.frameEvents[hit].data.tags.push({ ...t.tag }); // queue onto the chain
    else { // replace in place (keeps event order within the frame)
      const ev = { sevt: SEVT.PlaySnd, nfrm, data: { vlm: t.vlm, sty: t.sty, fLoop, tags: [{ ...t.tag }] } };
      if (hit >= 0) s.frameEvents.splice(hit, 1, ev); else s.frameEvents.push(ev);
      s.frameEvents.sort((x, y) => x.nfrm - y.nfrm);
    }
    appState.soundQueue.play({ scope: 'scene', data: { vlm: t.vlm, sty: t.sty, fLoop, tags: [{ ...t.tag }] } }); // only the new sound plays — queued ones wait
  };
  editHistory.executeOperation({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
  /** Pause-until-sound toggle — `on` inserts/replaces a Pause event at this
   *  frame, `off` removes any pause there. */
  editPause = (on) => {
  const s = appState.moviePlayer.scene, nfrm = appState.moviePlayer.frame;
  if (!s) return;
  const [evs0, reval] = this.sceneEvents();
  const apply = () => {
    const i = s.frameEvents.findIndex((e) => e.sevt === SEVT.Pause && e.nfrm === nfrm);
    if (on) {
      const ev = { sevt: SEVT.Pause, nfrm, data: { wit: WIT.UntilSnd, dts: 0 } };
      if (i >= 0) s.frameEvents[i] = ev; else { s.frameEvents.push(ev); s.frameEvents.sort((x, y) => x.nfrm - y.nfrm); }
    } else if (i >= 0) s.frameEvents.splice(i, 1); // clearing removes any pause here
    appState.editorTools.pauseSound = on;
  };
  editHistory.executeOperation({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
  // --- scene-side listener-easel ops -----------------------------------------
  /** The PlaySnd event of style `sty` at the current frame, or null —
   *  listener easel's query. */
  querySceneSound = (sty) => {
  if (!appState.moviePlayer.scene) return null;
  for (const e of appState.moviePlayer.scene.frameEvents)
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty)
      return { tags: e.data.tags.slice(), vlm: e.data.vlm, fLoop: e.data.fLoop };
  return null;
};
  /** Listener easel volume slider — retargets the style's PlaySnd volume at
   *  the current frame. */
  setSceneVolume = (sty, vlm) => {
  if (!appState.moviePlayer.scene) return;
  for (const e of appState.moviePlayer.scene.frameEvents)
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) e.data.vlm = vlm;
};
  /** Remove the style's PlaySnd at the current frame. */
  removeSceneSound = (sty) => {
  const s = appState.moviePlayer.scene;
  if (!s) return;
  for (let i = s.frameEvents.length - 1; i >= 0; i--) {
    const e = s.frameEvents[i];
    if (e.nfrm < appState.moviePlayer.frame) break;
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) { s.frameEvents.splice(i, 1); return; }
  }
};

  /** Scene chop — `fwd` truncates the scene at the current frame; `!fwd`
   *  drops everything before it, collapsing on-stage actors' pre-current
   *  state into fresh Add+Actn events at the frame. */
  sceneChop = (fwd) => {
  const s = appState.moviePlayer.scene, i = appState.moviePlayer.sceneIndex, f = appState.moviePlayer.frame;
  if (fwd ? f >= s.nfrmLast : f <= s.nfrmFirst) return;
  const before = structuredClone(s), after = structuredClone(s);
  if (fwd) {
    after.nfrmLast = f;
    after.frameEvents = after.frameEvents.filter((e) => e.nfrm <= f);
    for (const [c, a] of [...after.actors]) {
      a.events = a.events.filter((e) => e.nfrm <= f);
      if (a.nfrmFirst > f) after.actors.delete(c); else a.nfrmLast = Math.min(a.nfrmLast, f);
    }
    for (const [c, t] of [...after.textboxes]) {
      if (t.nfrmFirst > f) after.textboxes.delete(c); else t.nfrmMax = Math.min(t.nfrmMax, f + 1);
    }
  } else {
    after.nfrmFirst = f;
    after.thumb = null; // the stored thumbnail shows the old first frame — let the sorter re-render
    const hasSev = (l, c) => l.some((e) => e.sevt === SEVT.AddActr && e.data === c);
    // preserve the background + camera live at the chop frame — the original
    // keeps the current background and the most recent camera change; without
    // this the chopped scene snaps back to camera 0 (or a missing background)
    // and every actor looks deleted
    const lastSev = (sevt) => {
      let hit = null;
      for (const e of after.startEvents) if (e.sevt === sevt) hit = e;
      for (const e of after.frameEvents) if (e.sevt === sevt && e.nfrm <= f) hit = e;
      return hit;
    };
    const bkgd = lastSev(SEVT.SetBkgd), cam = lastSev(SEVT.ChngCamera);
    after.frameEvents = after.frameEvents.filter((e) => e.nfrm >= f);
    if (bkgd && !after.startEvents.includes(bkgd)) after.frameEvents.push({ sevt: SEVT.SetBkgd, nfrm: f, data: bkgd.data });
    if (cam && !after.startEvents.includes(cam)) after.frameEvents.push({ sevt: SEVT.ChngCamera, nfrm: f, data: cam.data });
    for (const [c, a] of [...after.actors]) {
      if (a.nfrmLast < f) { after.actors.delete(c); continue; }
      a.nfrmFirst = Math.max(a.nfrmFirst, f);
      const rt = appState.moviePlayer.actors.get(c);
      if (rt?.onStage) { // collapse pre-current state into events at f (like the original's back-chop)
        const nrtel = { irpt: 0, dwrOffset: 0, dnfrm: 0 };
        // rebase the route on the current interpolated point — the new first
        // node keeps the leftover segment length; later events renumber
        const irpt = Math.min(rt.rtel?.irpt || 0, a.route.length - 1);
        const head = { x: rt.xyz.x, y: rt.xyz.y, z: rt.xyz.z, dwr: Math.max(0, (a.route[irpt]?.dwr || 0) - (rt.rtel?.dwrOffset || 0)) };
        const rot = a.events.find((e) => e.aet === AET.Add)?.data || {};
        const kept = a.events.filter((e) => e.nfrm > f);
        // state events before f replay at f so costume/size/step/freeze survive;
        // Add/Actn/Rem are re-synthesized, Snd/Move/Tweak/rotations are baked in
        const moved = a.events.filter((e) => e.nfrm <= f && [AET.Cost, AET.Pull, AET.Size, AET.Step, AET.Freeze].includes(e.aet))
          .map((e) => ({ ...e, nfrm: f, rtel: { ...nrtel } }));
        a.route = [head, ...a.route.slice(irpt + 1)];
        for (const e of kept) if (e.rtel) e.rtel = { ...e.rtel, irpt: Math.max(0, (e.rtel.irpt || 0) - irpt) };
        a.events = [
          { aet: AET.Add, nfrm: f, rtel: { ...nrtel }, data: { x: rt.dxyzSubRte.x, y: rt.dxyzSubRte.y, z: rt.dxyzSubRte.z, xa: rot.xa || 0, ya: rot.ya || 0, za: rot.za || 0 } },
          ...moved,
          ...(rt.xfrm ? [{ aet: rt.useCur ? AET.RotH : AET.RotF, nfrm: f, rtel: { ...nrtel }, data: (rt.useCur ? rt.xfrm.cur : rt.xfrm.fwd).slice() }] : []),
          { aet: AET.Actn, nfrm: f, rtel: { ...nrtel }, data: { anid: rt.anid || 0, celn: rt.celn || 0 } },
          ...kept];
      } else {
        a.events = a.events.filter((e) => e.nfrm >= f);
        if (!a.events.length) after.actors.delete(c);
      }
    }
    // every surviving actor needs an AddActr — the original keeps actors in
    // the scene list through a chop, so one that re-Adds later must stay present
    for (const c of after.actors.keys())
      if (!hasSev(after.startEvents, c) && !hasSev(after.frameEvents, c))
        after.frameEvents.push({ sevt: SEVT.AddActr, nfrm: f, data: c });
    for (const [c, t] of [...after.textboxes]) { // visible textboxes get their start shifted to cur
      if (t.nfrmMax <= f) { after.textboxes.delete(c); continue; }
      if (t.nfrmFirst < f) { t.nfrmFirst = f; if (!after.frameEvents.some((e) => e.sevt === SEVT.AddTbox && e.data === c)) after.frameEvents.push({ sevt: SEVT.AddTbox, nfrm: f, data: c }); }
    }
    after.frameEvents.sort((a, b) => a.nfrm - b.nfrm);
  }
  const swap = (dst) => { appState.moviePlayer.movie.scenes[i] = structuredClone(dst); appState.moviePlayer.loadScene(i); appState.moviePlayer.gotoFrame(f); appState.setSelectedChildId(-1); textboxEdits.setSelectedTextbox(-1); textboxEdits.setFocusedTextbox(-1); appState.textboxSelections.clear(); };
  editHistory.executeOperation({ do: () => swap(after), undo: () => swap(before) });
}
}

export const soundEdits = new SoundEdits();
