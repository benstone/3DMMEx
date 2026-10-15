import { SEVT, AET } from '../../format/movie.ts';
import { makeTdtTemplate } from '../../format/content.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { appState } from '../appState.ts';
import { editHistory } from '../editHistory.ts';
// --- editor state (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse) -
// PtboxSelected (border chrome) | TBXG key focus + its cp sel: appState.selectedTextboxId/appState.focusedTextboxId/appState.textboxSelection,
// TBOX::AttachToMouse {textbox, moved}: appState.textboxAttachment, pending text-edit undo burst: appState.textboxSnapshot — all in app/state.js
export class MovieEdits {
  childIdOf = (a) => { for (const [c, x] of appState.moviePlayer.actors) if (x === a) return c; return -1; };
  selectedActor = () => (appState.selectedChildId >= 0 && appState.moviePlayer ? appState.moviePlayer.actors.get(appState.selectedChildId) : null);
  syncSelectionBox = () => { appState.sceneRenderer.selActor = this.selectedActor(); } // 3D bbox drawn in-scene (BODY::_PrepareToRender)

// --- undoable movie mutations (all edits go through executeOperation) -------------------
  editBackground = (cno, name) => { // MVIE::FSetBkgdCore: fill empty scene, else insert new scene after
  const s = appState.moviePlayer.scene, tag = { sid: 2, ctg: 'BKGD', cno };
  const empty = s && s.startEvents.length === 1 && s.nfrmLast - s.nfrmFirst === 0 && // SCEN::FIsEmpty
    s.frameEvents.every((e) => e.sevt === SEVT.ChngCamera || e.sevt === SEVT.PlaySnd);
  if (empty) {
    const sev = s.startEvents.find((e) => e.sevt === SEVT.SetBkgd);
    if (!sev) return;
    const old = sev.data;
    editHistory.executeOperation({ do: () => { sev.data = tag; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); },
             undo: () => { sev.data = old; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); } });
  } else {
    const i = appState.moviePlayer.sceneIndex, scenes = appState.moviePlayer.movie.scenes;
    const at = s ? i + 1 : 0; // sceneless movie — the backdrop pick creates scene 1
    const set = (ins) => {
      if (ins) scenes.splice(at, 0, { // FNewScenInsCore: blank 1-frame scene + SetBkgd
        name, nfrmFirst: 1, nfrmLast: 1, trans: 0,
        startEvents: [{ sevt: SEVT.SetBkgd, nfrm: 1, data: tag }], frameEvents: [], actors: new Map(), textboxes: new Map(),
      }); else scenes.splice(at, 1);
      playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(ins ? at : Math.min(i, scenes.length - 1));
    };
    editHistory.executeOperation({ do: () => set(true), undo: () => set(false) });
  }
}
  editCamera = (icam) => { // kidBrwsCamera pick -> rewrite the effective ChngCamera event
  const s = appState.moviePlayer.scene;
  if (!s) return;
  let sev = s.startEvents.find((e) => e.sevt === SEVT.ChngCamera);
  for (const e of s.frameEvents) if (e.sevt === SEVT.ChngCamera && e.nfrm <= appState.moviePlayer.frame) sev = e;
  if (!sev) s.startEvents.push(sev = { sevt: SEVT.ChngCamera, nfrm: s.nfrmFirst, data: 0 });
  const old = sev.data;
  editHistory.executeOperation({ do: () => { sev.data = icam; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); },
           undo: () => { sev.data = old; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); } });
}
  removeActorCore = (s, chid) => { // SCEN::RemActrCore — drop the actor record + its AddActr events
  for (const l of [s.startEvents, s.frameEvents])
    for (let i = l.length - 1; i >= 0; i--)
      if (l[i].sevt === SEVT.AddActr && l[i].data === chid) l.splice(i, 1);
  s.actors.delete(chid);
  appState.moviePlayer.actors.delete(chid);
}

  restoreActor = (s, chid, snap, f0) => { // restore record + scene events, rebuild runtime, re-seek
  s.actors.set(chid, structuredClone(snap.actorRec));
  s.startEvents.length = 0; s.startEvents.push(...structuredClone(snap.startEvents));
  s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(snap.frameEvents));
  appState.moviePlayer.loadScene(appState.moviePlayer.sceneIndex);
  appState.moviePlayer.gotoFrame(f0);
  playbackLoop.drawFrame();
}

  cutSelectedActor = (fAll) => { // MVU::_ClearSel (movie.cpp) — cut the actor "from this frame on"
  const a = this.selectedActor();
  if (!a || !a.onStage) return;
  const s = appState.moviePlayer.scene, chid = this.childIdOf(a), f0 = appState.moviePlayer.frame;
  const snap = { actorRec: structuredClone(s.actors.get(chid)),
    startEvents: structuredClone(s.startEvents), frameEvents: structuredClone(s.frameEvents) };
  editHistory.executeOperation({
    do: () => {
      const a2 = appState.moviePlayer.actors.get(chid); // re-resolve — undo rebuilds the runtime map
      if (!a2) return;
      const snd0 = a2.onSound; a2.onSound = null; // _ClearSel disables scene appState.soundQueue during the delete
      const alive = a2.fDelete(fAll);         // ACTR::FDelete — rewind a frame, delete forward
      a2.onSound = snd0;
      if (!alive) this.removeActorCore(s, chid);       // no events left — remove the actor record
      else a2.remFromStageCore();             // Rem event hides it from this frame on
      appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);         // rebuild visibleActors — Rem/removal must drop it now
      playbackLoop.drawFrame();
    },
    undo: () => this.restoreActor(s, chid, snap, f0),
  });
}

  nukeSelectedActor = () => { // toolActorNuke -> MVIE::FRemActr — delete the actor entirely
  const a = this.selectedActor();
  if (!a) return;
  const s = appState.moviePlayer.scene, chid = this.childIdOf(a), f0 = appState.moviePlayer.frame;
  const snap = { actorRec: structuredClone(s.actors.get(chid)),
    startEvents: structuredClone(s.startEvents), frameEvents: structuredClone(s.frameEvents) };
  editHistory.executeOperation({ do: () => { this.removeActorCore(s, chid); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); },
           undo: () => this.restoreActor(s, chid, snap, f0) });
}

  insertActor = (tagTmpl, name, anid, p, after?) => { // MVIE::FInsActr — AddActr+Add+Actn at cur frame
  const s = appState.moviePlayer.scene, nfrm = appState.moviePlayer.frame;
  if (!s) return;
  const chid = s.actors.size ? Math.max(...s.actors.keys()) + 1 : 0;
  const arid = s.actors.size ? Math.max(...[...s.actors.values()].map((a) => a.arid)) + 1 : 0;
  const mk = () => ({ cno: chid, arid, nfrmFirst: nfrm, nfrmLast: s.nfrmLast,
    dxyzFullRte: { x: 0, y: 0, z: 0 }, tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }],
    events: [
      { aet: AET.Add, nfrm, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 }, data: { x: p.x, y: p.y, z: p.z, xa: 0, ya: 0, za: 0 } },
      { aet: AET.Actn, nfrm, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 }, data: { anid, celn: 0 } },
    ], name });
  const add = () => {
    s.actors.set(chid, mk());
    (nfrm === s.nfrmFirst ? s.startEvents : s.frameEvents).push({ sevt: SEVT.AddActr, nfrm, data: chid });
    s.frameEvents.sort((a, b) => a.nfrm - b.nfrm);
    playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(appState.moviePlayer.sceneIndex); appState.moviePlayer.gotoFrame(nfrm); appState.setSelectedChildId(chid);
    after?.(chid);
  };
  const rem = () => {
    s.actors.delete(chid);
    for (const l of [s.startEvents, s.frameEvents]) { const j = l.findIndex((e) => e.sevt === SEVT.AddActr && e.data === chid); if (j >= 0) l.splice(j, 1); }
    appState.setSelectedChildId(-1); appState.moviePlayer.loadScene(appState.moviePlayer.sceneIndex); appState.moviePlayer.gotoFrame(Math.min(nfrm, s.nfrmLast));
  };
  editHistory.executeOperation({ do: add, undo: rem });
}
  placeActor = (item, p) => { // actor/prop pick -> click stage -> AddActr at cur frame
  const tagTmpl = { sid: 2, ctg: 'TMPL', cno: item.cno };
  let anid = 0;
  try { const t = appState.contentLibrary.template(tagTmpl); anid = t.chunkyFile.kidsOf('TMPL', t.cno, 'ACTN')[0]?.chid ?? 0; } catch { /* template w/o actions */ }
  this.insertActor(tagTmpl, item.name || '', anid, p);
}
  insert3dText = (state, p) => { // MVIE::FInsTdt: runtime TDT + easel costume (PtdtNew -> autosave CRF -> FInsActr)
  const template = makeTdtTemplate(appState.contentLibrary, state.text, state.tdts, state.tagTdf);
  this.insertActor(appState.contentLibrary.addTmpl(template), state.text, 0, p,
    (chid) => { if (state.tagMtrl) appState.moviePlayer.actors.get(chid)?.setCostumeCore(0, state.tagMtrl, 0, false); });
}
}

export const movieEdits = new MovieEdits();
