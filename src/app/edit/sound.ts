import { SEVT, AET } from '../../format/movie.ts';
import { WIT } from '../../engine/player.ts';
import { STY } from '../../format/content.ts';
import { draw } from '../loop.ts';
import { lib, ed, player, sounds, setSelChid, selTbSels } from '../state.ts';
import { opExec } from '../undo.ts';
import { setTbSel, setTbFocus } from './tbox.ts';
// --- sound editing (movie.cpp toolSounder/Looper/Matcher + scene.cpp FAddSnd/
// FPauseCore + actrsnd.cpp FSetSndCore) ----------------------------------------
export const SND_STY = { fx: STY.Sfx, speech: STY.Speech, music: STY.Midi };
export const sndTagFor = (kind, it) => { // browser pick -> MVU _tagTool + resolved sty/vlm
  if (it.user || it.buf != null) return { tag: { sid: 'usr', ctg: 'MSND', cno: it.key }, sty: SND_STY[kind], vlm: 1, name: it.name };
  const tag = { sid: 2, ctg: 'MSND', cno: it.cno };
  const msnd = lib.msnd(tag);
  return { tag, sty: msnd?.sty ?? SND_STY[kind], vlm: msnd?.vlm ?? 1, name: it.name };
};
export function setSndTag(kind, it) { // MVU::SetTagTool — browser OK loads the tool sound
  ed.sndTag = it ? sndTagFor(kind, it) : null;
  if (!it) return;
  // _ApplySelection: arm PlayOnce unless Looping is armed, or AttachToCell is
  // armed and the pick isn't midi (midi can't motion-match)
  if (ed.tool === 'looper' || (ed.tool === 'matcher' && ed.sndTag.sty !== STY.Midi)) return;
  ed.toolBtns['3sing']?.onclick();
}
export const actorEvs = (a) => { // snapshot -> reval pattern used by all actor-edit ops
  const evs0 = structuredClone(a.data.events);
  const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
  return [evs0, reval];
};
export function addActrSnd(a, fLoop, fQueue, fMM) { // MVIE::FAddActrSnd -> ACTR::FSetSndCore
  const t = ed.sndTag;
  if (!t) return;
  const [evs0, reval] = actorEvs(a);
  opExec({ do: () => { a.fSetSnd(t.tag, fLoop, fQueue, fMM, t.vlm, t.sty); draw(); }, undo: () => reval(evs0) });
}
export const sceneEvs = () => { // snapshot/restore the scene's frameEvents in place
  const s = player.scene, evs0 = structuredClone(s.frameEvents);
  const reval = (evs) => { const c = structuredClone(evs); s.frameEvents.length = 0; s.frameEvents.push(...c); player.gotoFrame(player.frame); draw(); };
  return [evs0, reval];
};
export function addBkgdSnd(fLoop, fQueue) { // MVIE::FAddBkgdSnd -> SCEN::FAddSndCore:
  const t = ed.sndTag;                       // same-sty PlaySnd this frame -> queue or replace
  if (!t || !player.scene) return;
  const s = player.scene, nfrm = player.frame;
  const [evs0, reval] = sceneEvs();
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
    sounds.play({ scope: 'scene', data: { vlm: t.vlm, sty: t.sty, fLoop, tags: [{ ...t.tag }] } }); // FAddSndCore enqueues the new sounds only
  };
  opExec({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
export function editPause(on) { // cidPauseForSound/cidClearPause -> SCEN::FPauseCore:
  const s = player.scene, nfrm = player.frame;   // pause event at this frame -> replace/remove/insert
  if (!s) return;
  const [evs0, reval] = sceneEvs();
  const apply = () => {
    const i = s.frameEvents.findIndex((e) => e.sevt === SEVT.Pause && e.nfrm === nfrm);
    if (on) {
      const ev = { sevt: SEVT.Pause, nfrm, data: { wit: WIT.UntilSnd, dts: 0 } };
      if (i >= 0) s.frameEvents[i] = ev; else { s.frameEvents.push(ev); s.frameEvents.sort((x, y) => x.nfrm - y.nfrm); }
    } else if (i >= 0) s.frameEvents.splice(i, 1); // witNil -> remove any pause here
    ed.pauseSnd = on;
  };
  opExec({ do: () => { apply(); reval(s.frameEvents); }, undo: () => reval(evs0) });
}
// SCEN::FQuerySnd/SetSndVlmCore/RemSndCore — scene-side listener-easel ops
export const queryScenSnd = (sty) => {
  if (!player.scene) return null;
  for (const e of player.scene.frameEvents)
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty)
      return { tags: e.data.tags.slice(), vlm: e.data.vlm, fLoop: e.data.fLoop };
  return null;
};
export const setScenVlm = (sty, vlm) => {
  if (!player.scene) return;
  for (const e of player.scene.frameEvents)
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) e.data.vlm = vlm;
};
export const remScenSnd = (sty) => { // RemSndCore removes the sty's PlaySnd at this frame
  const s = player.scene;
  if (!s) return;
  for (let i = s.frameEvents.length - 1; i >= 0; i--) {
    const e = s.frameEvents[i];
    if (e.nfrm < player.frame) break;
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) { s.frameEvents.splice(i, 1); return; }
  }
};

export function sceneChop(fwd) { // SCEN::FChop (p3rmfw: truncate at cur) / FChopBack (p3rmbk: drop before cur)
  const s = player.scene, i = player.sceneIndex, f = player.frame;
  if (fwd ? f >= s.nfrmLast : f <= s.nfrmFirst) return;
  const before = structuredClone(s), after = structuredClone(s);
  if (fwd) {
    after.nfrmLast = f;
    after.frameEvents = after.frameEvents.filter((e) => e.nfrm <= f);
    for (const [c, a] of [...after.actors]) {
      a.events = a.events.filter((e) => e.nfrm <= f);
      if (a.nfrmFirst > f) after.actors.delete(c); else a.nfrmLast = Math.min(a.nfrmLast, f);
    }
    for (const [c, t] of [...after.tboxes]) {
      if (t.nfrmFirst > f) after.tboxes.delete(c); else t.nfrmMax = Math.min(t.nfrmMax, f + 1);
    }
  } else {
    after.nfrmFirst = f;
    const hasSev = (l, c) => l.some((e) => e.sevt === SEVT.AddActr && e.data === c);
    const present = new Set([...player.actors].filter(([, a]) => a.onStage).map(([c]) => c));
    const reAdd = new Set([...after.actors.keys()].filter((c) => present.has(c) && !hasSev(after.startEvents, c)));
    after.frameEvents = after.frameEvents.filter((e) => e.nfrm >= f);
    for (const [c, a] of [...after.actors]) {
      if (a.nfrmLast < f) { after.actors.delete(c); continue; }
      a.nfrmFirst = Math.max(a.nfrmFirst, f);
      a.events = a.events.filter((e) => e.nfrm > f);
      const rt = player.actors.get(c), rot = s.actors.get(c).events.find((e) => e.aet === AET.Add)?.data || {};
      if (rt?.onStage) { // collapse pre-cur state into Add+Actn at f (FChopBackCore)
        const p0 = a.route[0] || { x: 0, y: 0, z: 0 }, su = rt.dxyzSubRte;
        a.events.unshift(
          { aet: AET.Add, nfrm: f, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 },
            data: { x: su.x + rt.xyz.x - p0.x, y: su.y + rt.xyz.y - p0.y, z: su.z + rt.xyz.z - p0.z, xa: rot.xa || 0, ya: rot.ya || 0, za: rot.za || 0 } },
          { aet: AET.Actn, nfrm: f, rtel: { irpt: 0, dwrOffset: 0, dnfrm: 0 }, data: { anid: rt.anid || 0, celn: rt.celn || 0 } });
      } else if (!a.events.length) after.actors.delete(c);
    }
    for (const c of reAdd) if (after.actors.has(c) && !hasSev(after.frameEvents, c)) after.frameEvents.push({ sevt: SEVT.AddActr, nfrm: f, data: c });
    for (const [c, t] of [...after.tboxes]) { // SCEN: visible tboxes get start shifted to cur
      if (t.nfrmMax <= f) { after.tboxes.delete(c); continue; }
      if (t.nfrmFirst < f) { t.nfrmFirst = f; if (!after.frameEvents.some((e) => e.sevt === SEVT.AddTbox && e.data === c)) after.frameEvents.push({ sevt: SEVT.AddTbox, nfrm: f, data: c }); }
    }
    after.frameEvents.sort((a, b) => a.nfrm - b.nfrm);
  }
  const swap = (dst) => { player.movie.scenes[i] = structuredClone(dst); player.loadScene(i); player.gotoFrame(f); setSelChid(-1); setTbSel(-1); setTbFocus(-1); selTbSels.clear(); };
  opExec({ do: () => swap(after), undo: () => swap(before) });
}
