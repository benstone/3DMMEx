import { SEVT, AET } from '../../format/movie.ts';
import { WIT } from '../../engine/player.ts';
import { STY } from '../../format/content.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { appState } from '../appState.ts';
import { editHistory } from '../editHistory.ts';
import { textboxEdits } from './textboxEdits.ts';
// --- sound editing (movie.cpp toolSounder/Looper/Matcher + scene.cpp FAddSnd/
// FPauseCore + actrsnd.cpp FSetSndCore) ----------------------------------------
export class SoundEdits {
  SOUND_STYLES = { fx: STY.Sfx, speech: STY.Speech, music: STY.Midi };
  soundTagFor = (kind, it) => { // browser pick -> MVU _tagTool + resolved sty/vlm
  if (it.user || it.buf != null) return { tag: { sid: 'usr', ctg: 'MSND', cno: it.key }, sty: this.SOUND_STYLES[kind], vlm: 1, name: it.name };
  const tag = { sid: 2, ctg: 'MSND', cno: it.cno };
  const msnd = appState.contentLibrary.msnd(tag);
  return { tag, sty: msnd?.sty ?? this.SOUND_STYLES[kind], vlm: msnd?.vlm ?? 1, name: it.name };
};
  setSoundTag = (kind, it) => { // MVU::SetTagTool — browser OK loads the tool sound
  appState.editorTools.soundTag = it ? this.soundTagFor(kind, it) : null;
  if (!it) return;
  // _ApplySelection: arm PlayOnce unless Looping is armed, or AttachToCell is
  // armed and the pick isn't midi (midi can't motion-match)
  if (appState.editorTools.tool === 'looper' || (appState.editorTools.tool === 'matcher' && appState.editorTools.soundTag.sty !== STY.Midi)) return;
  appState.editorTools.toolBtns['3sing']?.onclick();
}
  actorEvents = (a) => { // snapshot -> reval pattern used by all actor-edit ops
  const evs0 = structuredClone(a.data.events);
  const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
  return [evs0, reval];
};
  addActorSound = (a, fLoop, fQueue, fMM) => { // MVIE::FAddActrSnd -> ACTR::FSetSndCore
  const t = appState.editorTools.soundTag;
  if (!t) return;
  const [evs0, reval] = this.actorEvents(a);
  editHistory.executeOperation({ do: () => { a.fSetSnd(t.tag, fLoop, fQueue, fMM, t.vlm, t.sty); playbackLoop.drawFrame(); }, undo: () => reval(evs0) });
}
  sceneEvents = () => { // snapshot/restore the scene's frameEvents in place
  const s = appState.moviePlayer.scene, evs0 = structuredClone(s.frameEvents);
  const reval = (evs) => { const c = structuredClone(evs); s.frameEvents.length = 0; s.frameEvents.push(...c); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
  return [evs0, reval];
};
  addBackgroundSound = (fLoop, fQueue) => { // MVIE::FAddBkgdSnd -> SCEN::FAddSndCore:
  const t = appState.editorTools.soundTag;                       // same-sty PlaySnd this frame -> queue or replace
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
    appState.soundQueue.play({ scope: 'scene', data: { vlm: t.vlm, sty: t.sty, fLoop, tags: [{ ...t.tag }] } }); // FAddSndCore enqueues the new appState.soundQueue only
  };
  editHistory.executeOperation({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
  editPause = (on) => { // cidPauseForSound/cidClearPause -> SCEN::FPauseCore:
  const s = appState.moviePlayer.scene, nfrm = appState.moviePlayer.frame;   // pause event at this frame -> replace/remove/insert
  if (!s) return;
  const [evs0, reval] = this.sceneEvents();
  const apply = () => {
    const i = s.frameEvents.findIndex((e) => e.sevt === SEVT.Pause && e.nfrm === nfrm);
    if (on) {
      const ev = { sevt: SEVT.Pause, nfrm, data: { wit: WIT.UntilSnd, dts: 0 } };
      if (i >= 0) s.frameEvents[i] = ev; else { s.frameEvents.push(ev); s.frameEvents.sort((x, y) => x.nfrm - y.nfrm); }
    } else if (i >= 0) s.frameEvents.splice(i, 1); // witNil -> remove any pause here
    appState.editorTools.pauseSound = on;
  };
  editHistory.executeOperation({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
// SCEN::FQuerySnd/SetSndVlmCore/RemSndCore — scene-side listener-easel ops
  querySceneSound = (sty) => {
  if (!appState.moviePlayer.scene) return null;
  for (const e of appState.moviePlayer.scene.frameEvents)
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty)
      return { tags: e.data.tags.slice(), vlm: e.data.vlm, fLoop: e.data.fLoop };
  return null;
};
  setSceneVolume = (sty, vlm) => {
  if (!appState.moviePlayer.scene) return;
  for (const e of appState.moviePlayer.scene.frameEvents)
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) e.data.vlm = vlm;
};
  removeSceneSound = (sty) => { // RemSndCore removes the sty's PlaySnd at this frame
  const s = appState.moviePlayer.scene;
  if (!s) return;
  for (let i = s.frameEvents.length - 1; i >= 0; i--) {
    const e = s.frameEvents[i];
    if (e.nfrm < appState.moviePlayer.frame) break;
    if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) { s.frameEvents.splice(i, 1); return; }
  }
};

  sceneChop = (fwd) => { // SCEN::FChop (p3rmfw: truncate at cur) / FChopBack (p3rmbk: drop before cur)
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
    const hasSev = (l, c) => l.some((e) => e.sevt === SEVT.AddActr && e.data === c);
    const present = new Set([...appState.moviePlayer.actors].filter(([, a]) => a.onStage).map(([c]) => c));
    const reAdd = new Set([...after.actors.keys()].filter((c) => present.has(c) && !hasSev(after.startEvents, c)));
    after.frameEvents = after.frameEvents.filter((e) => e.nfrm >= f);
    for (const [c, a] of [...after.actors]) {
      if (a.nfrmLast < f) { after.actors.delete(c); continue; }
      a.nfrmFirst = Math.max(a.nfrmFirst, f);
      a.events = a.events.filter((e) => e.nfrm > f);
      const rt = appState.moviePlayer.actors.get(c), rot = s.actors.get(c).events.find((e) => e.aet === AET.Add)?.data || {};
      if (rt?.onStage) { // collapse pre-cur state into Add+Actn at f (FChopBackCore)
        const p0 = a.route[0] || { x: 0, y: 0, z: 0 }, su = rt.dxyzSubRte;
        a.events.unshift(
          { aet: AET.Add, nfrm: f, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 },
            data: { x: su.x + rt.xyz.x - p0.x, y: su.y + rt.xyz.y - p0.y, z: su.z + rt.xyz.z - p0.z, xa: rot.xa || 0, ya: rot.ya || 0, za: rot.za || 0 } },
          { aet: AET.Actn, nfrm: f, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 }, data: { anid: rt.anid || 0, celn: rt.celn || 0 } });
      } else if (!a.events.length) after.actors.delete(c);
    }
    for (const c of reAdd) if (after.actors.has(c) && !hasSev(after.frameEvents, c)) after.frameEvents.push({ sevt: SEVT.AddActr, nfrm: f, data: c });
    for (const [c, t] of [...after.textboxes]) { // SCEN: visible textboxes get start shifted to cur
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
