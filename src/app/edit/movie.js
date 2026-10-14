import { SEVT, AET } from '../../format/movie.js';
import { makeTdtTemplate } from '../../format/content.js';
import { setPlaying, draw } from '../loop.js';
import { player, selChid, renderer, setSelChid, lib } from '../state.js';
import { opExec } from '../undo.js';
// --- editor state (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse) -
// PtboxSelected (border chrome) | TBXG key focus + its cp sel: selTbChid/focusTbChid/tbSel,
// TBOX::AttachToMouse {tb, moved}: tbAttach, pending text-edit undo burst: tbSnap — all in app/state.js
export const chidOf = (a) => { for (const [c, x] of player.actors) if (x === a) return c; return -1; };
export const selActor = () => (selChid >= 0 && player ? player.actors.get(selChid) : null);
export function syncSelBox() { renderer.selActor = selActor(); } // 3D bbox drawn in-scene (BODY::_PrepareToRender)

// --- undoable movie mutations (all edits go through opExec) -------------------
export function editBkgd(cno, name) { // MVIE::FSetBkgdCore: fill empty scene, else insert new scene after
  const s = player.scene, tag = { sid: 2, ctg: 'BKGD', cno };
  const empty = s && s.startEvents.length === 1 && s.nfrmLast - s.nfrmFirst === 0 && // SCEN::FIsEmpty
    s.frameEvents.every((e) => e.sevt === SEVT.ChngCamera || e.sevt === SEVT.PlaySnd);
  if (empty) {
    const sev = s.startEvents.find((e) => e.sevt === SEVT.SetBkgd);
    if (!sev) return;
    const old = sev.data;
    opExec({ do: () => { sev.data = tag; player.gotoFrame(player.frame); },
             undo: () => { sev.data = old; player.gotoFrame(player.frame); } });
  } else {
    const i = player.sceneIndex, scenes = player.movie.scenes;
    const at = s ? i + 1 : 0; // sceneless movie — the backdrop pick creates scene 1
    const set = (ins) => {
      if (ins) scenes.splice(at, 0, { // FNewScenInsCore: blank 1-frame scene + SetBkgd
        name, nfrmFirst: 1, nfrmLast: 1, trans: 0,
        startEvents: [{ sevt: SEVT.SetBkgd, nfrm: 1, data: tag }], frameEvents: [], actors: new Map(), tboxes: new Map(),
      }); else scenes.splice(at, 1);
      setPlaying(false); player.loadScene(ins ? at : Math.min(i, scenes.length - 1));
    };
    opExec({ do: () => set(true), undo: () => set(false) });
  }
}
export function editCam(icam) { // kidBrwsCamera pick -> rewrite the effective ChngCamera event
  const s = player.scene;
  if (!s) return;
  let sev = s.startEvents.find((e) => e.sevt === SEVT.ChngCamera);
  for (const e of s.frameEvents) if (e.sevt === SEVT.ChngCamera && e.nfrm <= player.frame) sev = e;
  if (!sev) s.startEvents.push(sev = { sevt: SEVT.ChngCamera, nfrm: s.nfrmFirst, data: 0 });
  const old = sev.data;
  opExec({ do: () => { sev.data = icam; player.gotoFrame(player.frame); },
           undo: () => { sev.data = old; player.gotoFrame(player.frame); } });
}
export function remActrCore(s, chid) { // SCEN::RemActrCore — drop the actor record + its AddActr events
  for (const l of [s.startEvents, s.frameEvents])
    for (let i = l.length - 1; i >= 0; i--)
      if (l[i].sevt === SEVT.AddActr && l[i].data === chid) l.splice(i, 1);
  s.actors.delete(chid);
  player.actors.delete(chid);
}

export function restoreActr(s, chid, snap, f0) { // restore record + scene events, rebuild runtime, re-seek
  s.actors.set(chid, structuredClone(snap.actorRec));
  s.startEvents.length = 0; s.startEvents.push(...structuredClone(snap.startEvents));
  s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(snap.frameEvents));
  player.loadScene(player.sceneIndex);
  player.gotoFrame(f0);
  draw();
}

export function cutSelActor(fAll) { // MVU::_ClearSel (movie.cpp) — cut the actor "from this frame on"
  const a = selActor();
  if (!a || !a.onStage) return;
  const s = player.scene, chid = chidOf(a), f0 = player.frame;
  const snap = { actorRec: structuredClone(s.actors.get(chid)),
    startEvents: structuredClone(s.startEvents), frameEvents: structuredClone(s.frameEvents) };
  opExec({
    do: () => {
      const a2 = player.actors.get(chid); // re-resolve — undo rebuilds the runtime map
      if (!a2) return;
      const snd0 = a2.onSnd; a2.onSnd = null; // _ClearSel disables scene sounds during the delete
      const alive = a2.fDelete(fAll);         // ACTR::FDelete — rewind a frame, delete forward
      a2.onSnd = snd0;
      if (!alive) remActrCore(s, chid);       // no events left — remove the actor record
      else a2.remFromStageCore();             // Rem event hides it from this frame on
      player.gotoFrame(player.frame);         // rebuild visibleActors — Rem/removal must drop it now
      draw();
    },
    undo: () => restoreActr(s, chid, snap, f0),
  });
}

export function nukeSelActor() { // toolActorNuke -> MVIE::FRemActr — delete the actor entirely
  const a = selActor();
  if (!a) return;
  const s = player.scene, chid = chidOf(a), f0 = player.frame;
  const snap = { actorRec: structuredClone(s.actors.get(chid)),
    startEvents: structuredClone(s.startEvents), frameEvents: structuredClone(s.frameEvents) };
  opExec({ do: () => { remActrCore(s, chid); player.gotoFrame(player.frame); draw(); },
           undo: () => restoreActr(s, chid, snap, f0) });
}

export function insActr(tagTmpl, name, anid, p, after) { // MVIE::FInsActr — AddActr+Add+Actn at cur frame
  const s = player.scene, nfrm = player.frame;
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
    setPlaying(false); player.loadScene(player.sceneIndex); player.gotoFrame(nfrm); setSelChid(chid);
    after?.(chid);
  };
  const rem = () => {
    s.actors.delete(chid);
    for (const l of [s.startEvents, s.frameEvents]) { const j = l.findIndex((e) => e.sevt === SEVT.AddActr && e.data === chid); if (j >= 0) l.splice(j, 1); }
    setSelChid(-1); player.loadScene(player.sceneIndex); player.gotoFrame(Math.min(nfrm, s.nfrmLast));
  };
  opExec({ do: add, undo: rem });
}
export function placeActor(item, p) { // actor/prop pick -> click stage -> AddActr at cur frame
  const tagTmpl = { sid: 2, ctg: 'TMPL', cno: item.cno };
  let anid = 0;
  try { const t = lib.template(tagTmpl); anid = t.cf.kidsOf('TMPL', t.cno, 'ACTN')[0]?.chid ?? 0; } catch { /* template w/o actions */ }
  insActr(tagTmpl, item.name || '', anid, p);
}
export function insTdt(state, p) { // MVIE::FInsTdt: runtime TDT + easel costume (PtdtNew -> autosave CRF -> FInsActr)
  const tmpl = makeTdtTemplate(lib, state.text, state.tdts, state.tagTdf);
  insActr(lib.addTmpl(tmpl), state.text, 0, p,
    (chid) => { if (state.tagMtrl) player.actors.get(chid)?.setCostumeCore(0, state.tagMtrl, 0, false); });
}
