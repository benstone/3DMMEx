import { SEVT, AET } from '../../format/movie.js';
import { tbOp, tbSnapEnd, pickTbox, TBX_TOOL, remTbox, inTboxBorder, tbChidOf, setTbSel, tbAnchor, setTbFocus, TBX_MINW, TBX_MINH, applyChpOp, TB_ANCHOR_CURS, TB_ANCHOR_HOT, focusTbox, tbDelText, tbInsText, TCTH_ISCR, TBTH_ISCR, TZTH_DYP, TYTH_STYLES, TB_FONTS, applyChpSel } from '../edit/tbox.js';
import { playing, ed, tbPaint, player, setLastViewPt, tbAttach, setTbAttach, selTbChid, setSelChid, renderer, setTbSelVal, pendPlace, setPendPlace, lastViewPt, tbSel, sounds, focusTbChid, setSelTbChid, setFocusTbChid, selTbSels, useUi, useEd } from '../state.js';
import { $, curUrl } from '../res.js';
import { DWR_NIL } from '../../engine/actor.js';
import { FPS } from '../../engine/player.js';
import { hitTbox } from '../../render/textbox.js';
import { docMark, newMovie, openMovieFile, saveMovie } from '../doc.js';
import { insTdt, placeActor, chidOf, cutSelActor, nukeSelActor, syncSelBox } from '../edit/movie.js';
import { addBkgdSnd, addActrSnd, sceneChop, editPause } from '../edit/sound.js';
import { draw, setPlaying } from '../loop.js';
import { version } from '../../../package.json';
import { rcLists, rcActs, rcThumbFor } from '../thumbs.js';
import { opExec, hist, histUndo, histRedo, syncUndoBtn } from '../undo.js';
import { showBio } from './bio.js';
import { brwsView, showBrowser } from './browser.js';
import { showOptsDlg } from './optdlg.js';
import { showListenerEasel, showActionBrowser, showSpletter, showCostumeEasel, showSceneSorter } from './easels.js';
import { t } from '../i18n.js';
import { View, ui, UI_W, UI_H } from './root.js';
import { Element } from './element.js';
import { Img, StBtn, TextLink, MovieScreen } from './widgets.js';
import { texImg, imgReady } from './img.js';
// --- studio editor chrome (canvas port of ui-dom/studio.js) -------------------
// Positions lifted from 3DMMEx studio.cht / pos3.chh: bitmap lands at (gob - preg).
export const STUDIO_IMGS = /** @type {[string,number,number,number,number][]} */ ([ // [name, x, y, w, h] in the original 640x480 screen space
  ['back1', 0, 0, 640, 100], ['back2', 0, 97, 48, 314], ['back3', 592, 97, 48, 313], ['back4', 0, 406, 640, 74],
  ['vsld', 331, 414, 29, 45], ['name', 28, 464, 300, 16],
]);
// stb id or tool bmp ids -> 'tip.<id>' in lang/*.json (verbatim from src/help/tooltips.cht ktt* topics)
export const TIP_IDS = new Set([
  'frmRWEnd', 'frmRW', 'frmFW', 'frmFWEnd', 'scnRWEnd', 'scnRW', 'scnFW', 'scnFWEnd', 'play', 'undo', 'ccp', 'port', 'book', 'map', '1back', '1view', 'p3rmbk', 'p3rmfw', '1scen', '2actr', '2prop', '2splt', '2comp', '2cont', '2acts', '2cost', '2rot', '2xy', '2zero', '2tran', '2soon', '2bio', '3horn', '3mike', '3note', '3sing', '3loop', '3ear', '3rpt', '1note', '4new', '4ins', '4font', '4bold', '4size', '4colr', '4back', '4scrl', 'p3cut', 'p3copy', 'p3cppt', 'p3past', 'p3rmac']);

export const STUDIO_BTNS = /** @type {[string,string,string,number,number,number,number][]} */ ([ // [id, up, down/selected, x, y, w, h]
  ['frmRWEnd', 'frwe', 'frwes', 108, 414, 22, 17], ['frmRW', 'frw', 'frws', 130, 414, 22, 17],
  ['frmFW', 'ffw', 'ffws', 240, 414, 22, 17], ['frmFWEnd', 'ffwe', 'ffwes', 262, 414, 22, 17],
  ['scnRWEnd', 'srwe', 'srwes', 108, 439, 22, 17], ['scnRW', 'srw', 'srws', 130, 439, 22, 17],
  ['scnFW', 'sfw', 'sfws', 240, 439, 22, 17], ['scnFWEnd', 'sfwe', 'sfwes', 262, 439, 22, 17],
  ['play', 'play', 'plays', 301, 414, 26, 45],
  ['undo', 'undo', 'undos', 371, 411, 49, 52], ['ccp', 'ccp', 'ccps', 424, 411, 49, 52],
  ['port', 'port', 'ports', 481, 411, 49, 52], ['book', 'book', 'bookc', 534, 411, 49, 52],
  ['map', 'map', 'mapc', 587, 411, 49, 52],
]);
export const STUDIO_TXT = /** @type {[string,number,number,number,number][]} */ ([ // [id, x, y, w, h] text overlays drawn on the baked fields
  ['stfnum', 56, 413, 40, 18], ['stsnum', 56, 440, 40, 17], ['stname', 30, 464, 296, 16],
]);

/** Simple text field element — the old .stTxt/.stVer divs. */
class StTxt extends Element {
  constructor(id, x, y, w, h, { size = 13, color = '#333', align = 'center' } = {}) {
    super(x, y, w, h);
    this.id = id; this.text = ''; this.size = size; this.color = color; this.align = align;
    this.pickable = false;
  }
  set textContent(v) { if (v !== this.text) { this.text = v; this.dirty(); } }
  get textContent() { return this.text; }
  draw(ctx) {
    if (!this.text) return;
    ctx.fillStyle = this.color;
    ctx.font = `bold ${this.size}px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = this.align; ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.w / 2, this.h / 2, this.w - 2);
  }
}

/** Frame/scene/volume slider — track overlay + a separate thumb image element. */
class StSlider extends Element {
  constructor(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) {
    super(x, y, w, h);
    this.axis = axis; this.min = min; this.span = span; this.get = get; this.set = set;
    this.thumb = new Img(img, tx, ty, tw, th); this.thumb.pickable = false;
    this.tx = tx; this.ty = ty;
  }
  sync() { // reposition thumb along the axis like syncStudio did via style.left/top
    const p = this.min + this.get() * this.span;
    if (this.axis === 'x') this.thumb.x = p; else this.thumb.y = p;
    this.thumb.dirty();
  }
  onPointerDown(p) { this._move(p); }
  onPointerMove(p) { this._move(p); }
  _move(p) {
    const v = this.axis === 'x' ? p.x : p.y;
    this.set(Math.max(0, Math.min(1, (v - this.min) / this.span)));
  }
}

/** The 3D stage — MovieScreen blit + all editor pointer machinery. */
class View3D extends MovieScreen {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = true; }
}

export let studioView = null; // the mounted StudioView instance
export const studioEl = /** @returns {any} */ (id) => studioView?._els?.[id];

export class StudioView extends View {
  constructor() {
    super();
    /** @type {Record<string, any>} */
    const els = this._els = {};
  const V = this;
  const glv = $('view'); if (glv) glv.style.display = 'none'; // GL canvas lives offscreen; MovieScreen blits it
  // The studio sits UNDER whatever is on the stack (boot view pops to reveal it;
  // theatre/embed replace() discards it).
  if (!ui.stack.includes(V)) { ui.stack.unshift(V); V.root = ui; V.parent = ui; ui._rebuild(); }
  const view = new View3D(48, 100, 544, 306);
  ed.view = view;
  const viewPx = (e) => [e.x - 48, e.y - 100];
  const viewNdc = (e) => [(e.x - 48) / 544 * 2 - 1, 1 - (e.y - 100) / 306 * 2];
  let drag = null, rec = null, rot = null, xform = null, slPend = null, earHover = undefined;
  const ROT_AXIS = { rotx: 'x', roty: 'y', rotz: 'z' }; // tool -> fRotate axis arg
  const XFM_TOOL = { sqsh: 'sqsh', size: 'size' }; // transform-popup drag tools
  const SND_TOOL = { sounder: 1, looper: 1, matcher: 1 }; // actor/scene sound attach tools
  const PAINT_CHP = { tbPaintText: 'fore', tbFont: 'font', tbSize: 'dyp', tbStyle: 'grfont' }; // TBXG drag-apply tools
  const tbFontIdx = (tb, name) => { // sprmFont mpe indexes the doc's AGPA list (1-based); _onnDef -> lw 0
    const doc = tb.rtxt;
    if (name === doc.font) return 0;
    let i = doc.fonts.indexOf(name);
    if (i < 0) { doc.fonts.push(name); i = doc.fonts.length - 1; }
    return i + 1;
  };
  const tbPaintChg = (tb, k) => (k === 'fore' ? { fore: 1, acr: tbPaint.acr }
    : k === 'font' ? { font: 1, fontIdx: tbFontIdx(tb, tbPaint.font) }
    : k === 'dyp' ? { dyp: tbPaint.dyp }
    : { grfont: tbPaint.grfont, mask: 3 });
  view.onPointerDown = (e0) => {
    const e = e0.src || e0;
    if (e.button !== 0 || !player || playing) return;
    // sooner/later buttons' track-mouse: any click not on the buttons closes the
    // session, switches back to compose, and the click proceeds normally
    if (sl) { endSoonerLater(); ed.toolBtns?.['2comp']?.onclick(); }
    const [px, py] = setLastViewPt(viewPx(e0));
    if (tbAttach) { // AttachToMouse: the click drops the new tbox (TBXB::FCmdTrackMouse)
      const { tb, moved } = tbAttach; setTbAttach(null); view.cursor = '';
      if (moved) tbOp(tb, () => {}); // commit the mouse-tracked rect as one undo op
      draw();
      return;
    }
    tbSnapEnd(); // any view click commits the pending text-edit burst
    const tbHit = pickTbox(px, py);
    if (tbHit && (TBX_TOOL[ed.tool] || ed.tool === 'nuke')) { // tbox tools own the click (cidTboxClicked)
      const lx = px - tbHit.l, ly = py - tbHit.t, w = tbHit.r - tbHit.l, h = tbHit.b - tbHit.t;
      if (ed.tool === 'nuke') { remTbox(tbHit); return; } // TBXG+TBXB toolActorNuke -> FRemTbox
      if (inTboxBorder(lx, ly, w, h)) { // TBXB band: select + move/resize drag (works for every tool)
        if ((ed.tool === 'tbStory' || ed.tool === 'tbCredit') && selTbChid !== tbChidOf(tbHit)) { // TBXB::FPtIn declines non-selected boxes for the type tools
          setTbSel(-1); draw(); return; // bubbles to MVU -> SelectTbox(pvNil)
        }
        setTbSel(tbChidOf(tbHit)); setSelChid(-1);
        for (const L of rcLists) L.sel = -1;
        drag = { kind: 'tbRc', tb: tbHit, anchor: tbAnchor(lx, ly, w, h), rc0: { l: tbHit.l, t: tbHit.t, r: tbHit.r, b: tbHit.b }, px0: px, py0: py };
        draw();
        return;
      }
      // interior (TBXG): fill/type tools hit the clicked box; the rest focus it + start a caret/text drag
      if (ed.tool === 'tbFill') { tbOp(tbHit, () => { tbHit.rtxt.acrBack = tbPaint.acr; tbHit.rtxt._layout = null; }); return; } // FSetAcrBack(AcrPaint)
      if (ed.tool === 'tbStory' || ed.tool === 'tbCredit') { const fs = ed.tool === 'tbStory'; tbOp(tbHit, () => { tbHit.fStory = fs; }); return; } // FSetType — any box, selected or not
      setTbFocus(tbChidOf(tbHit)); setSelChid(-1);
      const cp = hitTbox(tbHit, renderer.ovCtx, renderer.palColors, px, py); // interior: caret + text selection drag
      setTbSelVal({ anchor: cp, other: cp });
      drag = { kind: 'tbTxt', tb: tbHit, paint: PAINT_CHP[ed.tool] || null };
      draw();
      return;
    }
    if (TBX_TOOL[ed.tool]) { // text mode skips actor picking entirely: a miss just SelectTbox(pvNil)
      if (selTbChid >= 0) { setTbSel(-1); draw(); }
      return;
    }
    const [nx, ny] = viewNdc(e0);
    if (pendPlace) {
      const p = renderer.groundPoint(nx, ny, 0);
      if (p) (pendPlace.tdt ? insTdt : placeActor)(pendPlace.tdt ?? pendPlace, { x: p.x, y: 0, z: p.z });
      setPendPlace(null); view.cursor = ''; draw();
      return;
    }
    const a = renderer.pickActor(nx, ny);
    setSelChid(a ? chidOf(a) : -1);
    for (const L of rcLists) { // keep the roll-call highlight in sync w/ the view pick
      const i2 = a ? rcActs(L).indexOf(a) : -1;
      L.sel = i2;
      if (i2 >= 0) { const n = rcActs(L).length; if (i2 < L.off) L.off = i2; else if (i2 > L.off + 3) L.off = Math.min(i2 - 3, Math.max(0, n - 4)); }
    }
    draw();
    if (SND_TOOL[ed.tool]) { // toolSounder/Looper/Matcher mousedown (movie.cpp):
      if (!a) {                 // PactrFromPt miss -> scene sound; hit -> actor sound
        if (ed.tool === 'matcher') { if (ed.sndTag) console.warn('[snd] motion-match needs an actor'); } // ercSocBadSceneSound
        else if (ed.sndTag) addBkgdSnd(ed.tool === 'looper', e.metaKey || e.ctrlKey); // cmd = fQueue
      } else if (a.onStage && ed.sndTag) addActrSnd(a, ed.tool === 'looper', e.metaKey || e.ctrlKey, ed.tool === 'matcher');
      return;
    }
    if (ed.tool === 'listener') { showListenerEasel(a || null); return; } // toolListener -> StartListenerEasel
    if (!a || !a.onStage) return;
    if (ed.tool === 'action') { showActionBrowser(); return; } // toolAction: click actor -> StartActionBrowser
    if (ed.tool === 'costume') { (a.tmpl.isTdt ? showSpletter : showCostumeEasel)(a); return; } // toolActorEasel: TDT->ESLT else ESLA (FCmdActorEaselOpen)
    if (ed.tool === 'cut') { cutSelActor(e.shiftKey); return; } // toolCutObject -> FDoClip -> _ClearSel (shift = all subroutes)
    if (ed.tool === 'nuke') { nukeSelActor(); return; }         // toolActorNuke -> FRemActr
    if (ed.tool === 'rotnorm') { // toolNormalizeRot -> FNormalize(fnormRotate)
      const evs0 = structuredClone(a.data.events);
      a.fNormalizeRot();
      const evs1 = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(evs0); // rewind; opExec.do does the real apply
      const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      a.nfrmCur = null; player.gotoFrame(player.frame);
      opExec({ do: () => reval(evs1), undo: () => reval(evs0) });
      return;
    }
    if (ROT_AXIS[ed.tool]) { // toolRotateX/Y/Z: drag rotates the clicked actor
      rot = { a, lx: e0.x, ly: e0.y, axis: ROT_AXIS[ed.tool], evs0: structuredClone(a.data.events) };
      return;
    }
    if (ed.tool === 'sizenorm') { // toolNormalizeSize -> FNormalize(fnormSize)
      const evs0 = structuredClone(a.data.events);
      a.fNormalizeSize();
      const evs1 = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(evs0); // rewind; opExec.do does the real apply
      const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      a.nfrmCur = null; player.gotoFrame(player.frame);
      opExec({ do: () => reval(evs1), undo: () => reval(evs0) });
      return;
    }
    if (XFM_TOOL[ed.tool]) { // toolSquashStretch/toolResize: drag squashes or scales the actor
      xform = { a, lx: e0.x, ly: e0.y, kind: XFM_TOOL[ed.tool], evs0: structuredClone(a.data.events) };
      return;
    }
    if (ed.tool === 'sooner') { // toolSoonerLater: grab -> sooner/later buttons appear on release
      slPend = a;
      return;
    }
    if (ed.tool !== 'compose' && ed.tool !== 'record') return;
    const wp = { x: a.xyz.x + a.dxyzRte.x, y: a.xyz.y + a.dxyzRte.y, z: a.xyz.z + a.dxyzRte.z };
    const pt = ed.xy ? renderer.viewPlanePoint(nx, ny, wp) : renderer.groundPoint(nx, ny, wp.y);
    if (!pt) return;
    if (ed.tool === 'record') { // toolRecordSameAction (FBeginRecord/FRecordMove/FEndRecord, actor.cpp)
      setPlaying(false); // recording drives the clock itself
      const R = /** @type {any} */ (rec = { a, wp, p0: { x: pt.x, y: pt.y, z: pt.z }, cur: { ...wp }, s: { ...a.dxyzRte },
        started: false, ticks: 0, ti: 0, raw: { x: 0, y: 0, z: 0 }, frozen: e.shiftKey, // fmafFreeze: shift records frozen
        f0: player.frame, route0: structuredClone(a.data.route), events0: structuredClone(a.data.events), nfrmLast0: player.scene.nfrmLast });
      const evt = (aet, data) => a.addDoAev(aet, data); // _FAddDoAev: insert at cursor + execute
      const begin = () => { // toolRecordSameAction mousedown asserts the action (FSetAction),
        a.setActionCore(a.anid, a.celn, R.frozen);     // then FBeginRecord + DeleteFwdCore(fFalse)
        const pts = a.route.slice(0, Math.max(0, a.rtel.irpt) + 1);
        if (a.rtel.dwrOffset > 0 && a.rtel.irpt >= 0 && pts.length) { // mid-segment: keep partial segment + split point
          const tt = pts[pts.length - 1];
          pts[pts.length - 1] = { ...tt, dwr: Math.max(0.01, Math.hypot(a.xyz.x - tt.x, a.xyz.y - tt.y, a.xyz.z - tt.z)) };
          pts.push({ ...a.xyz, dwr: 0 });
        } else if (pts.length) pts[pts.length - 1] = { ...pts[pts.length - 1], dwr: 0 };
        const newBase = pts.length;
        let iaevDelLim = a.events.length, irptDelLim = a.route.length; // delete up to the next Add (subroute bound)
        for (let i = a.iaevCur; i < a.events.length; i++) if (a.events[i].aet === AET.Add) { iaevDelLim = i; irptDelLim = a.events[i].rtel.irpt; break; }
        const tail = a.route.slice(irptDelLim);
        a.events.splice(a.iaevCur, iaevDelLim - a.iaevCur);
        for (let i = a.iaevCur; i < a.events.length; i++) a.events[i].rtel.irpt += newBase - irptDelLim; // retained events keep shifted rtels
        a.data.route = a.route = pts.concat(tail);
        a.rtel = { irpt: newBase - 1, dwrOffset: 0, dnfrm: 0 };
      };
      R.begin = begin; R.evt = evt;
      R.tick = setInterval(() => { // FRecordMove once per frame tick
        R.ticks++;
        if (!R.started) return;
        const s = player.scene, last = a.route[a.rtel.irpt]; // record tip — NOT route end (tail subroute may follow)
        const curl = { x: R.cur.x - R.s.x, y: R.cur.y - R.s.y, z: R.cur.z - R.s.z }; // route-local cursor
        const dl = { x: curl.x - last.x, y: curl.y - last.y, z: curl.z - last.z }; // cumulative displacement to cursor (dxrWld)
        const d = { x: (R.raw.x + 2 * dl.x) / 3, y: (R.raw.y + 2 * dl.y) / 3, z: (R.raw.z + 2 * dl.z) / 3 }; // smoothed
        R.raw = dl;
        if (a.frozen !== R.frozen) evt(AET.Freeze, R.frozen); // FRecordMove: unfreeze while recording so cels cycle
        const dwrCur = Math.max(0.5, a._celDwr(a.anid, a.celn) * a.xfrm.scaleStep); // _FGetDwrRecord
        const dwrMouse = Math.hypot(d.x, d.y, d.z);
        if (dwrMouse < dwrCur) { // pause: frames only advance after ~0.75s (kdtsThreshRte)
          if (R.ticks - R.ti < 5) return;
          if (a.dwrStep !== 0) evt(AET.Step, 0); // FSetStep(rZero)
        } else {
          if (a.dwrStep !== DWR_NIL) evt(AET.Step, DWR_NIL); // resume at template step
          const k = dwrCur / dwrMouse; // truncate to exactly one step distance; excess is dropped
          const np = { x: last.x + d.x * k, y: last.y + d.y * k, z: last.z + d.z * k };
          if (ed.ground && last.y + a.dxyzRte.y >= 0 && np.y + a.dxyzRte.y < 0) np.y = -a.dxyzRte.y; // fmafGround
          last.dwr = dwrCur;
          a.route.splice(a.rtel.irpt + 1, 0, { ...np, dwr: 0 }); // insert after tip, before retained tail
          const irptIns = a.rtel.irpt + 1; // _AdjustAevForRteIns: shift event rtels past the new point
          for (const e2 of a.events) {
            if (e2.rtel.irpt >= irptIns) e2.rtel.irpt++;
            else if (e2.rtel.irpt === irptIns - 1 && irptIns < a.route.length - 1 && e2.rtel.dwrOffset >= dwrCur) { e2.rtel.dwrOffset -= dwrCur; e2.rtel.irpt++; }
          }
          R.ti = R.ticks;
        }
        if (player.frame >= s.nfrmLast) s.nfrmLast = player.frame + 1; // scene grows as it records
        player.gotoFrame(player.frame + 1);
        draw();
      }, 1000 / FPS);
      return;
    }
    drag = { a, wp, base: { ...a.dxyzSubRte }, p0: { x: pt.x, y: pt.y, z: pt.z }, cur: { ...a.dxyzSubRte },
      shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey };
  };
  view.onPointerMove = (e0) => {
    const e = e0.src || e0;
    setLastViewPt(viewPx(e0));
    if (tbAttach) { // AttachToMouse: the box's TL follows the cursor (hidden), bounds-clamped
      const [px, py] = lastViewPt, tb = tbAttach.tb;
      const w = tb.r - tb.l, h = tb.b - tb.t;
      tb.l = Math.max(0, Math.min(px, 544 - w)); tb.t = Math.max(0, Math.min(py, 306 - h));
      tb.r = tb.l + w; tb.b = tb.t + h;
      tbAttach.moved = true;
      draw();
      return;
    }
    if (drag?.kind === 'tbRc') { // TBXB::FCmdTrackMouse: move/resize per anchor, workspace-bounded
      const { tb, anchor, rc0, px0, py0 } = drag, [px, py] = lastViewPt;
      const dx = px - px0, dy = py - py0;
      const rc = { ...rc0 };
      if (anchor === 'move') {
        rc.l = Math.max(0, Math.min(rc0.l + dx, 544 - (rc0.r - rc0.l))); rc.t = Math.max(0, Math.min(rc0.t + dy, 306 - (rc0.b - rc0.t)));
        rc.r = rc.l + (rc0.r - rc0.l); rc.b = rc.t + (rc0.b - rc0.t);
      } else {
        if (anchor.includes('left')) rc.l = Math.max(0, Math.min(rc0.l + dx, rc0.r - TBX_MINW));
        if (anchor.includes('right')) rc.r = Math.min(544, Math.max(rc0.r + dx, rc0.l + TBX_MINW));
        if (anchor.includes('up')) rc.t = Math.max(0, Math.min(rc0.t + dy, rc0.b - TBX_MINH));
        if (anchor.includes('down')) rc.b = Math.min(306, Math.max(rc0.b + dy, rc0.t + TBX_MINH));
      }
      Object.assign(tb, rc);
      tb.rtxt._layout = null;
      draw();
      return;
    }
    if (drag?.kind === 'tbTxt') { // TBXG_PAR::FCmdTrackMouse: drag extends the cp selection
      const [px, py] = lastViewPt;
      tbSel.other = hitTbox(drag.tb, renderer.ovCtx, renderer.palColors, px, py);
      draw();
      return;
    }
    if (rec) {
      const [nx, ny] = viewNdc(e0);
      const pt = ed.xy ? renderer.viewPlanePoint(nx, ny, rec.wp) : renderer.groundPoint(nx, ny, rec.wp.y);
      if (!pt) return;
      rec.cur = { x: rec.wp.x + pt.x - rec.p0.x, y: rec.wp.y + pt.y - rec.p0.y, z: rec.wp.z + pt.z - rec.p0.z };
      if (!rec.started) { // FIsRecordValid: needs 2.0u of movement or ~0.75s held (kdwrThreshRte/kdtsThreshRte)
        const mv = Math.hypot(rec.cur.x - rec.wp.x, rec.cur.y - rec.wp.y, rec.cur.z - rec.wp.z);
        if (mv >= 2 || rec.ticks >= 5) { rec.started = true; rec.begin(); }
      }
      return;
    }
    if (rot) { // MVU::_MouseDrag toolRotateX/Y/Z: brs = (dxrMouse+dyrMouse) * -0.001, AdjustCursor re-anchors
      const ang = -((e0.x - rot.lx) + (e0.y - rot.ly)) * 0.001 * 2 * Math.PI;
      rot.lx = e0.x; rot.ly = e0.y;
      if (ang) { const r = { x: 0, y: 0, z: 0 }; r[rot.axis] = rot.axis === 'y' ? -ang : ang; // X/Z positive, Y negated
        rot.a.fRotate(r.x, r.y, r.z, e.metaKey || e.ctrlKey); draw(); } // cmd = aetRotF, else aetRotH
      return;
    }
    if (xform) { // MVU::_MouseDrag toolResize/toolSquashStretch: brs = ±(dx+dy)*0.001 + 1
      const d = (e0.x - xform.lx) + (e0.y - xform.ly);
      xform.lx = e0.x; xform.ly = e0.y;
      if (xform.kind === 'sqsh') { const brs = 1 + -d * 0.001; if (brs) xform.a.fPull(brs, 1 / brs, brs); } // FSquashStretchActr: no-op at brs 0
      else xform.a.fScale(1 + d * 0.001);
      draw();
      return;
    }
    if (!drag) return;
    const [nx, ny] = viewNdc(e0);
    const pt = ed.xy ? renderer.viewPlanePoint(nx, ny, drag.wp) : renderer.groundPoint(nx, ny, drag.wp.y);
    if (!pt) return;
    const s = { x: drag.base.x + pt.x - drag.p0.x, y: drag.base.y + pt.y - drag.p0.y, z: drag.base.z + pt.z - drag.p0.z };
    if (ed.ground) s.y = drag.base.y; // fRGround: actor stays on the ground
    drag.cur = s;
    drag.a.dxyzSubRte = { ...s }; drag.a._updateXyzRte(); drag.a._positionBody();
    draw();
  };
  const endDrag = (e0) => {
    const e = e0?.src;
    if (drag?.kind === 'tbRc') { // box move/resize: commit the rc change as one undo op
      const { tb, rc0 } = drag; drag = null;
      const rc1 = { l: tb.l, t: tb.t, r: tb.r, b: tb.b };
      if (JSON.stringify(rc0) !== JSON.stringify(rc1)) {
        const set = (rc) => { Object.assign(tb, rc); tb.rtxt._layout = null; player.gotoFrame(player.frame); draw(); };
        opExec({ do: () => set({ ...rc1 }), undo: () => set({ ...rc0 }) });
      }
      return;
    }
    if (drag?.kind === 'tbTxt') { // TBXG mouseup: paint tools apply their chp to the drag selection
      const { tb, paint } = drag; drag = null;
      if (paint && tbSel && tbSel.anchor !== tbSel.other) {
        const [a, b] = tbSel.anchor < tbSel.other ? [tbSel.anchor, tbSel.other] : [tbSel.other, tbSel.anchor];
        applyChpOp(tb, a, b, tbPaintChg(tb, paint));
      }
      draw();
      return;
    }
    if (rec) {
      clearInterval(rec.tick);
      const { a, started, f0, route0, events0, nfrmLast0 } = rec;
      if (started) { rec.evt(AET.Freeze, true); rec.evt(AET.Step, 0); } // FEndRecord: park the actor at the recorded tip
      rec = null;
      if (!started) return; // click without drag = just a selection
      const route1 = structuredClone(a.data.route), events1 = structuredClone(a.data.events);
      const nfrmLast1 = player.scene.nfrmLast, f1 = player.frame;
      const set = (rt, ev, nl, fr) => { a.data.route = a.route = rt; a.data.events = a.events = ev;
        a.nfrmCur = null; player.scene.nfrmLast = nl; player.gotoFrame(Math.min(fr, nl)); draw(); };
      opExec({ do: () => set(structuredClone(route1), structuredClone(events1), nfrmLast1, f1),
               undo: () => set(structuredClone(route0), structuredClone(events0), nfrmLast0, f0) });
      return;
    }
    if (rot) { // rotation events were merged live; commit as one undoable op
      const { a, evs0 } = rot, evs1 = structuredClone(a.data.events);
      const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      rot = null;
      if (JSON.stringify(evs0) !== JSON.stringify(evs1)) opExec({ do: () => reval(evs1), undo: () => reval(evs0) });
      return;
    }
    if (xform) { // squash/stretch or scale drag — merged Pull/Size events, one undo op
      const { a, evs0 } = xform, evs1 = structuredClone(a.data.events);
      const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      xform = null;
      if (JSON.stringify(evs0) !== JSON.stringify(evs1)) opExec({ do: () => reval(evs1), undo: () => reval(evs0) });
      return;
    }
    if (slPend) { // toolSoonerLater mouseup: undo snapshot then open the sooner/later buttons
      if (slPend.onStage) startSoonerLater(slPend);
      slPend = null;
      return;
    }
    if (!drag) return;
    const { a, base, cur } = drag;
    const fShift = e?.shiftKey ?? drag.shift, fCmd = e ? (e.metaKey || e.ctrlKey) : drag.cmd;
    drag = null;
    if (base.x === cur.x && base.y === cur.y && base.z === cur.z) return;
    const d = { x: cur.x - base.x, y: cur.y - base.y, z: cur.z - base.z };
    // MVU::_MouseDrag toolCompose (movie.cpp): cmd -> FTweakRoute (nudge at this
    // route spot only), shift -> fmafEntireSubrte (translate the Add event),
    // plain -> aetMove at the cursor = "move actor just from this frame on".
    a.dxyzSubRte = { ...base }; a._updateXyzRte(); // revert live preview; the op re-applies
    if (fShift) { // fmafEntireSubrte: adjust the Add event's offset directly
      const ev = a.events[a.iaevAddCur];
      if (!ev || ev.aet !== AET.Add) { a.dxyzSubRte = { ...cur }; a._updateXyzRte(); a._positionBody(); draw(); return; }
      const e02 = { ...ev.data };
      const set = (ed2, s) => { Object.assign(ev.data, ed2); a.dxyzSubRte = { ...s }; a._updateXyzRte(); a._positionBody(); };
      opExec({ do: () => set({ ...e02, x: e02.x + d.x, y: e02.y + d.y, z: e02.z + d.z }, cur), undo: () => set(e02, base) });
      draw();
      return;
    }
    const evs0 = structuredClone(a.data.events);
    const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
    if (fCmd) { // FTweakRoute: absolute route-local position anchored at this rtel
      const tt = { x: a.xyz.x + d.x, y: a.xyz.y + d.y, z: a.xyz.z + d.z };
      opExec({ do: () => { a.addDoAev(AET.Tweak, tt); draw(); }, undo: () => reval(evs0) });
    } else { // aetMove: cumulative offset event at the cursor (BUG1870 merge-add)
      opExec({ do: () => { a.addDoAev(AET.Move, d); draw(); }, undo: () => reval(evs0) });
    }
  };
  view.onPointerUp = endDrag;
  // FCmdMouseMove: armed tools show their cursor only while hovering an actor
  // (PactrFromPt), else the default cursor. cutactor/nukscen .cur hotspots (8,10)/(11,3).
  const TOOL_CURS = { cut: `url(${curUrl('cutactor')}) 8 10, auto`, nuke: `url(${curUrl('nukscen')}) 11 3, auto`,
    costume: `url(${curUrl('costume')}) 0 6, auto`, rotx: `url(${curUrl('rotatex')}) 8 15, auto`,
    roty: `url(${curUrl('rotatey')}) 14 7, auto`, rotz: `url(${curUrl('rotatez')}) 10 15, auto`,
    rotnorm: `url(${curUrl('normaliz')}) 0 0, auto`,
    sqsh: `url(${curUrl('squashst')}) 7 7, auto`, size: `url(${curUrl('sizevenl')}) 7 8, auto`,
    sizenorm: `url(${curUrl('normaliz')}) 0 0, auto`,
    sooner: `url(${curUrl('squashst')}) 7 7, auto`, // kcrsSoonerLater shares squashst.cur in the original
    sounder: `url(${curUrl('cur00003')}) 7 12, auto`, looper: `url(${curUrl('cur00002')}) 5 10, auto`,
    matcher: `url(${curUrl('cur00001')}) 3 12, auto`, listener: `url(${curUrl('listen')}) 4 4, auto`,
    tbPaintText: `url(${curUrl('fontextc')}) 0 3, auto`, tbFont: `url(${curUrl('fontextc')}) 0 3, auto`,
    tbSize: `url(${curUrl('fontextc')}) 0 3, auto`, tbStyle: `url(${curUrl('fontextc')}) 0 3, auto`,
    tbFill: `url(${curUrl('textback')}) 2 15, auto`, tbStory: `url(${curUrl('textback')}) 2 15, auto`,
    tbCredit: `url(${curUrl('textback')}) 2 15, auto` };
  const viewCursor = view.onPointerMove;
  view.onPointerMove = (e0) => { // tool cursors first, then the drag machinery
    const e = e0.src || e0;
    const [px, py] = setLastViewPt(viewPx(e0));
    if (!drag && !rec && !rot && !xform) {
      if (tbAttach) { view.cursor = 'none'; viewCursor(e0); return; }
      const cur = TOOL_CURS[ed.tool];
      if (TBX_TOOL[ed.tool] || (ed.tool === 'nuke' && pickTbox(px, py))) { // tbox tools cursor per TBXG/TBXB FCmdMouseMove
        const tb = pickTbox(px, py);
        if (!tb) { view.cursor = ed.tool === 'tboxSel' ? `url(${curUrl('repositi')}) 8 1, auto` : (cur || ''); viewCursor(e0); return; }
        if (ed.tool === 'nuke') { view.cursor = TOOL_CURS.nuke; viewCursor(e0); return; }
        const lx = px - tb.l, ly = py - tb.t, w = tb.r - tb.l, h = tb.b - tb.t;
        if (ed.tool === 'tboxSel') { // border anchor cursors; ibeam over the text
          if (inTboxBorder(lx, ly, w, h)) {
            const c = TB_ANCHOR_CURS[tbAnchor(lx, ly, w, h)];
            view.cursor = `url(${curUrl(`${c}`)}) ${TB_ANCHOR_HOT[c]}, auto`;
          } else view.cursor = `url(${curUrl('ibeam')}) 5 3, auto`;
          viewCursor(e0); return;
        }
        view.cursor = cur || ''; // paint/fill/type tools show their cursor over the box
        viewCursor(e0); return;
      }
      if (cur === undefined) { view.cursor = ''; viewCursor(e0); return; }
      if (playing) { view.cursor = ''; viewCursor(e0); return; }
      const [nx, ny] = viewNdc(e0);
      const a = renderer.pickActor(nx, ny);
      // FCmdMouseMove: sound-attach tools need a loaded tool sound, but show their
      // cursor anywhere on the view; the listener always shows (and auditions)
      if (SND_TOOL[ed.tool]) { view.cursor = ed.sndTag ? cur : ''; viewCursor(e0); return; }
      if (ed.tool === 'listener') {
        view.cursor = cur;
        if (a !== earHover) { // _pactrListener hover change -> replay that side's frame sounds
          earHover = a || null;
          sounds.stopAll();
          if (a && a.onStage) a.replaySnd();
          else player._replaySnd();
        }
        viewCursor(e0); return;
      }
      view.cursor = a ? cur : '';
    }
    viewCursor(e0);
  };
  view.onPointerLeave = () => { if (TOOL_CURS[ed.tool] !== undefined || TBX_TOOL[ed.tool]) view.cursor = ''; };
  document.addEventListener('pointerdown', () => { if (player) player.clk = true; }, true); // witUntilClick resume
  // TBXG text mode: while a tbox tool is armed and a box is selected, typing
  // edits the doc (keystrokes merge into one undo op via tbSnap)
  document.addEventListener('keydown', (e) => {
    const tb = focusTbox(); // keys go to the TBXG with focus — the last interior-clicked box
    if (!tb || !tbSel || !TBX_TOOL[ed.tool] || playing || brwsView) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(/** @type {HTMLElement} */ (e.target).tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const doc = tb.rtxt;
    const a = Math.min(tbSel.anchor, tbSel.other), b = Math.max(tbSel.anchor, tbSel.other);
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const [x, y] = b > a ? [a, b]
        : e.key === 'Backspace' ? [Math.max(0, a - 1), a] : [a, Math.min(doc.text.length, a + 1)];
      tbSel.other = tbSel.anchor = tbDelText(tb, x, y);
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (b > a) tbDelText(tb, a, b);
      tbSel.other = tbSel.anchor = tbInsText(tb, a, '\r');
      draw();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) tbSel.other = Math.max(0, Math.min(doc.text.length, tbSel.other + d));
      else tbSel.other = tbSel.anchor = b > a ? (d < 0 ? a : b) : Math.max(0, Math.min(doc.text.length, a + d));
      draw();
    } else if (e.key.length === 1) {
      e.preventDefault();
      if (b > a) tbDelText(tb, a, b);
      tbSel.other = tbSel.anchor = tbInsText(tb, a, e.key);
      draw();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (tbAttach) { // drop the attached box at its current spot
      const { tb, moved } = tbAttach; setTbAttach(null); view.cursor = '';
      if (moved) tbOp(tb, () => {});
      draw();
      return;
    }
    if (tbSel && focusTbChid >= 0) { setTbSelVal({ anchor: tbSel.other, other: tbSel.other }); draw(); } // collapse sel to caret, then still disarm
    if (pendPlace) { setPendPlace(null); view.cursor = ''; return; }
    if (TOOL_CURS[ed.tool] !== undefined || TBX_TOOL[ed.tool]) { // disarm an armed tool (the original has no Esc; selecting another tool is the canonical disarm)
      tbSnapEnd();
      ed.tool = 'none'; view.cursor = ''; endSoonerLater(); earHover = undefined;
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      for (const o of ccpCells) o._sync?.();
    }
  });
  for (const [n, x, y, w, h] of STUDIO_IMGS) V.add(new Img(n, x, y, w, h));
  V.add(view); // the stage blit goes under the chrome it overlaps? no — chrome is outside its rect; keep it under roll calls so thumbs stay crisp
  for (const [id, x, y, w, h] of STUDIO_TXT) { const d = new StTxt(id, x, y, w, h); V.add(d); els[id] = d; }
  { // the original's EXIT strip (kidExit, quits the app) — a web page can't quit,
    // so its slot shows the app version instead
    const ver = new StTxt('stver', 584, 466, 51, 14, { size: 9, color: '#555' });
    ver.textContent = t('ui.version', { version });
    V.add(ver);
    V.add(new TextLink(t('ui.settings'), 470, 466, 108, 14, () => showOptsDlg(), { size: 9, align: 'right' }));
  }
  { // the original's kidName is display-only (title comes from the saved file's
    // leaf name) — here the bar doubles as the rename field: click to edit via a
    // DOM input floated over the canvas (real text entry stays DOM until the
    // canvas gets an IME-capable input element)
    const nameEl = els.stname;
    nameEl.pickable = true; nameEl.cursor = 'text';
    nameEl.onClick = () => {
      const nm = $('stnameInp'); if (nm) return;
      const inp = document.createElement('input');
      inp.id = 'stnameInp'; inp.className = 'stNameInp'; inp.value = player.movie.name || ''; inp.maxLength = 64;
      inp.style.cssText = 'position:absolute;left:4.6875%;top:96.66%;width:46.25%;height:3.33%;z-index:56;';
      $('studio').appendChild(inp);
      inp.focus(); inp.select();
      let done = false;
      const commit = (ok) => {
        if (done) return; done = true;
        if (ok && inp.value.trim()) { player.movie.name = inp.value.trim(); docMark(); }
        inp.remove();
        syncStudio();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); e.stopPropagation(); };
      inp.onblur = () => commit(true);
      inp.onclick = (e) => e.stopPropagation();
    };
  }
  const stSliders = [];
  const nScenes = () => Math.max(1, player.movie.scenes.length - 1);
  const fSpan = () => Math.max(1, player.scene.nfrmLast - player.scene.nfrmFirst);
  const mkSlider = (x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) => {
    const s = new StSlider(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set);
    V.add(s.thumb); V.add(s);
    stSliders.push(s);
    return s;
  };
  mkSlider(151, 410, 89, 26, 'fthm', 151, 412, 13, 20, 'x', 151, 76,
    () => (player.scene ? (player.frame - player.scene.nfrmFirst) / fSpan() : 0),
    (f) => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmFirst + Math.round(f * fSpan())); draw(); });
  mkSlider(151, 434, 89, 26, 'stmb', 151, 437, 13, 20, 'x', 151, 76,
    () => Math.max(0, player.sceneIndex) / nScenes(),
    (f) => { setPlaying(false); player.loadScene(Math.max(0, Math.min(nScenes(), Math.round(f * nScenes())))); draw(); });
  mkSlider(331, 414, 29, 45, 'volthmb', 335, 428, 12, 6, 'y', 417, 32,
    () => 1 - sounds.volume,
    (f) => { sounds.setVolume(1 - f); localStorage.setItem('vol3dmm', String(sounds.volume)); syncStudio(); });
  sounds.setVolume(parseFloat(localStorage.getItem('vol3dmm') || '1'));
  /** @type {any} */ (V)._stSliders = stSliders;
  const ACTIONS = {
    frmRWEnd: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmFirst); draw(); },
    frmRW: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.frame - 1); draw(); },
    frmFW: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.frame + 1); draw(); },
    frmFWEnd: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmLast); draw(); },
    scnRWEnd: () => { setPlaying(false); player.loadScene(0); setSelTbChid(-1); setFocusTbChid(-1); setTbSelVal(null); setTbAttach(null); selTbSels.clear(); draw(); },
    scnRW: () => { setPlaying(false); player.loadScene(Math.max(0, player.sceneIndex - 1)); setSelTbChid(-1); setFocusTbChid(-1); setTbSelVal(null); setTbAttach(null); selTbSels.clear(); draw(); },
    scnFW: () => { setPlaying(false); player.loadScene(Math.min(player.movie.scenes.length - 1, player.sceneIndex + 1)); setSelTbChid(-1); setFocusTbChid(-1); setTbSelVal(null); setTbAttach(null); selTbSels.clear(); draw(); },
    scnFWEnd: () => { setPlaying(false); player.loadScene(player.movie.scenes.length - 1); setSelTbChid(-1); setFocusTbChid(-1); setTbSelVal(null); setTbAttach(null); selTbSels.clear(); draw(); },
    play: () => { sounds.ensure(); setPlaying(!playing); },
    undo: () => { const b = els.stb_undo; if (!b._en) return; (hist.mode === 'u' ? histUndo : histRedo)(); draw(); },
    ccp: () => toggleCcp(), // kidCutCopyPaste dropdown (popups.cht)
    port: () => togglePort(), // kidPortfolio briefcase (studio.cht)
    book: () => { const u = new URL(location.href); u.searchParams.set('mode', 'theatre'); window.open(u.href, '_blank'); },
    map: () => window.open('https://github.com/permpkin/3dmm-web', '_blank'),
  };
  for (const [id, up, dn, x, y, w, h] of STUDIO_BTNS) {
    const b = new StBtn(up, dn, x, y, w, h, ACTIONS[id] ? () => ACTIONS[id]() : null, TIP_IDS.has(id) ? id : null);
    b._sync = () => { b.faceOverride = null; b.dirty(); };
    V.add(b); els['stb_' + id] = b;
  }
  { // undo uses state faces (undo/undos=redo/undod), not the generic up/down pair
    const b = els.stb_undo;
    b._sync = () => { syncUndoBtn(); b.dim = b.isDown && b._en; b.dirty(); };
    b._sync();
  }

  // --- popups ---------------------------------------------------------------
  // popup groups: elements with _pop set get outside-click-closes via the view
  /** @type {any} */ (V)._pops = [];
  const openPops = /** @type {any} */ (V)._pops;

  // cut/copy/paste popup (popups.cht kidCutCopyPaste): bg rect (224,354)-(470,406),
  // cells at child-x 24/73/122/171/220 (49x52 each, absolute 248+49k). Cells are
  // radio-commands: clicking one clears the active tool (chttActor = chttNone).
  const ccpBg = new Element(224, 354, 246, 52);
  ccpBg.pickable = false; ccpBg.visible = false;
  ccpBg.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, 246, 52); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, 245, 51); };
    V.add(ccpBg);
const ccpCells = [];
  const ccpPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'ccp', els: [ccpBg], toggle: null });
  for (const [bmp, x, tool] of /** @type {[string,number,any][]} */ ([ // pos3.chh kxpCCP* — copy/copyRoute/paste pending
    ['p3cut', 24, 'cut'],   // cidCutTool -> SetTool(toolCutObject) — arms a persistent cut tool
    ['p3copy', 73, null], ['p3cppt', 122, null], ['p3past', 171, null],
    ['p3rmac', 220, 'nuke'], // cidActorNuke -> SetTool(toolActorNuke)
  ])) {
    const b = new StBtn(bmp, bmp + 'c', 224 + x - 24, 354, 49, 52, null, TIP_IDS.has(bmp) ? bmp : null); // REP_MBMPREG kxpregCCP*=24
    b.visible = false; b._pop = ccpPop;
    ccpCells.push(b); ccpPop.els.push(b);
    if (!tool) { b.alpha = 0.35; b._en = false; continue; }
    b._tool = tool; // pressed face (bmp+'c') also shows while the tool stays armed
    b._sync = () => { b.faceOverride = `${bmp}${ed.tool === tool || b.isDown ? 'c' : ''}`; b.dirty(); };
    b.onclick = () => { // CCP cell script: clear the actor tool (chttActor=chttNone), arm ours, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      for (const o of ccpCells) o._sync?.();
      setCcp(false);
    };
    V.add(b);
  }
  const setCcp = (open) => { // kstOpen/kstClosed on kidCCPBackground
    ccpBg.visible = open;
    for (const b of ccpCells) { b.visible = open; b._sync?.(); }
    const b = els.stb_ccp; if (b) { b.classList.toggle('on', open); b._sync(); }
    const i = openPops.indexOf(ccpPop);
    if (open && i < 0) openPops.push(ccpPop); else if (!open && i >= 0) openPops.splice(i, 1);
  };
  ccpPop.toggle = els.stb_ccp;
  const toggleCcp = () => setCcp(!ccpBg.visible);

  // portfolio popup (popups.cht kidPortsBackground): open rect (477,198)-(589,406);
  // children at child-y 52/104/156/208 with preg 52 -> 112x52 cells at y 198/250/302/354
  const portBg = new Img('p1par', 477, 198, 112, 208);
  portBg.visible = false; portBg.pickable = false;
    V.add(portBg);
const portCells = [];
  const portPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'port', els: [portBg], toggle: null });
  for (const [up, dn, y, fn] of /** @type {[string,string,number,() => void][]} */ ([
    ['p1new', 'p1news', 198, () => newMovie()],        // kidPortsNew -> cidNew
    ['p1open', 'p1openc', 250, () => openMovieFile()], // kidPortsPortfolio -> cidOpen
    ['p1save', 'p1saves', 302, () => saveMovie()],     // kidPortsSave -> cidSave
    ['p1svas', 'p1svass', 354, () => saveMovie(true)], // kidPortsSaveAs -> cidSaveAs
  ])) {
    const b = new StBtn(up, dn, 477, y, 112, 52, () => { setPort(false); fn(); }); // child script: kstClosed, then EnqueueCid
    b.visible = false; b._pop = portPop;
    portCells.push(b); portPop.els.push(b);
    V.add(b);
  }
  const setPort = (open) => { // kstOpen/kstClosed on kidPortsBackground
    portBg.visible = open;
    for (const b of portCells) b.visible = open;
    const b = els.stb_port; if (b) { b.classList.toggle('on', open); b._sync(); } // ChangeStateGob(kidPortfolio, kstSelected/Default)
    const i = openPops.indexOf(portPop);
    if (open && i < 0) openPops.push(portPop); else if (!open && i >= 0) openPops.splice(i, 1);
  };
  portPop.toggle = els.stb_port;
  const togglePort = () => setPort(!portBg.visible);
  // kchidScript2 -> Return(fTrue): popup eats keys while open
  document.addEventListener('keydown', (e) => {
    if (portBg.visible) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // rotate popup (popups.cht kidRotatePopup): p5par bg gobpos (293,271) preg (23,174)
  // -> tl (270,97) 46x176; cells child-x 46 preg (46,21) -> tl (270, 97/141/185/229) 46x44
  const rotBg = new Img('p5par', 270, 97, 46, 176);
  rotBg.visible = false; rotBg.pickable = false;
    V.add(rotBg);
const rotCells = [];
  const rotPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'rot', els: [rotBg], toggle: null });
  for (const [bmp, y, tool] of /** @type {[string,number,string][]} */ ([['p5rotx', 97, 'rotx'], ['p5roty', 141, 'roty'], ['p5rotz', 185, 'rotz'], ['p5norm', 229, 'rotnorm']])) {
    const b = new StBtn(bmp, bmp + 's', 270, y, 46, 44, null);
    b.visible = false; b._pop = rotPop;
    rotCells.push(b); rotPop.els.push(b);
    b._sync = () => { b.faceOverride = `${bmp}${ed.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsRotate, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      const rb = rotBtn(); if (rb) { rb.classList.add('on'); rb._sync(); }
      for (const o of ccpCells) o._sync?.();
      setRot(false);
    };
    V.add(b);
  }
  const rotBtn = () => TB.find((tt) => tt.id === 'actors')?.secBtns?.['2rot'];
  const setRot = (open) => {
    rotBg.visible = open;
    for (const b of rotCells) { b.visible = open; b._sync(); }
    const rb = rotBtn(); if (rb && open) { rb.classList.add('on'); rb._sync(); }
    const i = openPops.indexOf(rotPop);
    if (open && i < 0) openPops.push(rotPop); else if (!open && i >= 0) openPops.splice(i, 1);
    if (!open && rb && !ROT_AXIS[ed.tool] && ed.tool !== 'rotnorm') { rb.classList.remove('on'); rb._sync(); }
  };
  const rotOpen = () => rotBg.visible;

  // transform popup (popups.cht kidTransformBackground): p4par bg gobpos (460,227)
  // preg (23,130) -> tl (437,97) 46x132; cells p4shrk/p4sqsh/p4norm preg (0,42)
  // -> tl (437, 97/141/185) 46x44 — order per pos3.chh is Shrink, Squash, Norm
  const trnBg = new Img('p4par', 437, 97, 46, 132);
  trnBg.visible = false; trnBg.pickable = false;
    V.add(trnBg);
const trnCells = [];
  const trnPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'trn', els: [trnBg], toggle: null });
  for (const [bmp, y, tool] of /** @type {[string,number,string][]} */ ([['p4shrk', 97, 'size'], ['p4sqsh', 141, 'sqsh'], ['p4norm', 185, 'sizenorm']])) {
    const b = new StBtn(bmp, bmp + 's', 437, y, 46, 44, null);
    b.visible = false; b._pop = trnPop;
    trnCells.push(b); trnPop.els.push(b);
    b._sync = () => { b.faceOverride = `${bmp}${ed.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsTransform, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      const tb2 = trnBtn(); if (tb2) { tb2.classList.add('on'); tb2._sync(); }
      for (const o of ccpCells) o._sync?.();
      setTrn(false);
    };
    V.add(b);
  }
  const trnBtn = () => TB.find((tt) => tt.id === 'actors')?.secBtns?.['2tran'];
  const setTrn = (open) => {
    trnBg.visible = open;
    for (const b of trnCells) { b.visible = open; b._sync(); }
    const tb2 = trnBtn(); if (tb2 && open) { tb2.classList.add('on'); tb2._sync(); }
    const i = openPops.indexOf(trnPop);
    if (open && i < 0) openPops.push(trnPop); else if (!open && i >= 0) openPops.splice(i, 1);
    if (!open && tb2 && !XFM_TOOL[ed.tool] && ed.tool !== 'sizenorm') { tb2.classList.remove('on'); tb2._sync(); }
  };
  const trnOpen = () => trnBg.visible;

  // sooner/later (STDIO::StartSoonerLater): floating 2sbtn/2lbtn pair at
  // (247,376)/(320,376) appears after grabbing an actor; holding a button repeats
  // FSoonerLaterActr(Nfrm-+1) per tick, accelerating (klwSLDelay 24->12 cells)
  let sl = null; // {a, events0, frame0} — session state while the buttons are open
  const slEls = [];
  for (const [bmp, x, dn] of /** @type {[string,number,number][]} */ ([['2sbtn', 247, -1], ['2lbtn', 320, 1]])) {
    const b = new StBtn(bmp, bmp + 's', x, 376, 73, 30, null);
    b.visible = false;
    let rep = null, delay = 800;
    const stop = () => { clearTimeout(rep); rep = null; delay = 800; b.classList.remove('down'); b.faceOverride = bmp; b.dirty(); };
    const tick = () => { if (!sl) { stop(); return; } slTick(dn); if (sl) { delay = Math.max(400, delay - 100); rep = setTimeout(tick, delay); } }; // klwSLDelayMax->Min accel
    /** @type {any} */ (b).onPointerDown = (p) => { // returns true: the view's track-mouse would end the session
      if (!sl) { stop(); return true; }
      b.classList.add('down'); b.faceOverride = `${bmp}s`; b.dirty();
      slTick(dn);
      rep = setTimeout(tick, delay);
      return true;
    };
    b.onPointerUp = b.onPointerLeave = stop;
    slEls.push(b);
    V.add(b);
  }
  const startSoonerLater = (a) => {
    endSoonerLater();
    sl = { a, events0: structuredClone(a.data.events), frame0: player.frame };
    for (const b of slEls) b.visible = true;
  };
  const slTick = (dn) => { // FCmdSooner/FCmdLater -> FSoonerLaterActr(Nfrm-+1)
    if (!sl) return;
    const target = player.frame + dn;
    if (target < player.scene.nfrmFirst || target > player.scene.nfrmLast) { // FGotoFrm fails -> revert to compose
      endSoonerLater(); ed.toolBtns?.['2comp']?.onclick(); return;
    }
    sl.a.fSoonerLater(dn);
    player.gotoFrame(target); // original seeks the scene +-1 too
    draw();
  };
  function endSoonerLater() { // STDIO::EndSoonerLater: close buttons; whole session is one undo op
    if (!sl) return;
    const { a, events0, frame0 } = sl;
    sl = null;
    for (const b of slEls) b.visible = false;
    const events1 = structuredClone(a.data.events), frame1 = player.frame;
    if (JSON.stringify(events0) === JSON.stringify(events1) && frame0 === frame1) return;
    const set = (evs, fr) => { a.data.events = a.events = structuredClone(evs);
      a.data.nfrmFirst = evs[0].nfrm; a.data.nfrmLast = evs[evs.length - 1].nfrm;
      a.nfrmCur = null; player.gotoFrame(fr); draw(); };
    opExec({ do: () => set(events1, frame1), undo: () => set(events0, frame0) });
  }

  // --- words-tab popups ------------------------------------------------------
  // scroll-type popup (popups.cht kidScrollBackground): p7par (480,100) 46x88,
  // p7scrl (credits) -> chttTboxScroll/toolTboxCredit, p7nscr (story) -> toolTboxStory
  const scrlBg = new Img('p7par', 480, 100, 46, 88);
  scrlBg.visible = false; scrlBg.pickable = false;
    V.add(scrlBg);
const scrlCells = [];
  const scrlPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'scrl', els: [scrlBg], toggle: null });
  for (const [bmp, y, tool] of /** @type {[string,number,string][]} */ ([['p7scrl', 100, 'tbCredit'], ['p7nscr', 144, 'tbStory']])) {
    const b = new StBtn(bmp, bmp + 's', 480, y, 46, 44, null);
    b.visible = false; b._pop = scrlPop;
    scrlCells.push(b); scrlPop.els.push(b);
    b._sync = () => { b.faceOverride = `${bmp}${ed.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: SetTool, close the popup, keep 4scrl selected
      tbSnapEnd();
      ed.tool = tool;
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      const sb = scrlBtn(); if (sb) { sb.classList.add('on'); sb._sync(); }
      setScrl(false); draw();
    };
    V.add(b);
  }
  const scrlBtn = () => TB.find((tt) => tt.id === 'words')?.secBtns?.['4scrl'];
  const setScrl = (open) => {
    scrlBg.visible = open;
    for (const b of scrlCells) { b.visible = open; b._sync(); }
    const sb = scrlBtn();
    if (sb) { // selected while open OR while a scroll-type tool is armed
      sb.classList.toggle('on', open || ed.tool === 'tbStory' || ed.tool === 'tbCredit');
      sb._sync();
    }
    const i = openPops.indexOf(scrlPop);
    if (open && i < 0) openPops.push(scrlPop); else if (!open && i >= 0) openPops.splice(i, 1);
  };
  // attribute popups (popdn.cht kidText* popdowns): vertical d8frm cell strips.
  // A pick stores the paint value (_acrPaint/_onnText/_dypFont/_grfontStyle) and
  // arms the tool; armed while the cursor is over a tbox applies whole-doc.
  const TBPOP_DEF = {
    fore:  { x: 346, y: 100, w: 102, fh: 22, page: 8, items: TCTH_ISCR.map((iscr) => ({ iscr })) },
    back:  { x: 421, y: 100, w: 170, fh: 22, page: 8, items: TBTH_ISCR.map((iscr) => ({ iscr })) },
    size:  { x: 288, y: 100, w: 160, fh: 40, page: 7, items: TZTH_DYP.map((dyp) => ({ dyp })) },
    style: { x: 230, y: 100, w: 160, fh: 22, page: 4, items: TYTH_STYLES.map((s) => ({ ...s })) },
    font:  { x: 172, y: 100, w: 160, fh: 22, page: 8, items: TB_FONTS.map((name) => ({ name })) },
  };
  const TBPOP_TOOL = { fore: 'tbPaintText', back: 'tbFill', size: 'tbSize', style: 'tbStyle', font: 'tbFont' };
  const TBPOP_BTN = { fore: '4colr', back: '4back', size: '4size', style: '4bold', font: '4font' };
  const TOOL_TBFACE = { tboxSel: '4ins', tbPaintText: '4colr', tbFill: '4back', tbFont: '4font', tbSize: '4size', tbStyle: '4bold', tbStory: '4scrl', tbCredit: '4scrl' };
  const syncTbFaces = () => {
    const w = TB.find((tt) => tt.id === 'words'); if (!w) return;
    for (const [bmp, b] of Object.entries(w.secBtns)) { b.classList.toggle('on', TOOL_TBFACE[ed.tool] === bmp); b._sync(); }
    for (const b of scrlCells) b._sync();
  };
  ed.syncTbFaces = syncTbFaces;
  const tpop = { el: null, cells: [], kind: null, pg: 0 };
  const tpopPop = /** @type {{name:string,els:any[],toggle:any}} */ ({ name: 'tpop', els: [], toggle: null });
  const tpopBtn = () => TB.find((tt) => tt.id === 'words')?.secBtns?.[TBPOP_BTN[tpop.kind]];
  function armTbPaint(tool) { // MVU::SetTool(lwMode<0, ptbox): FSetAcrText et al apply to the box under the cursor
    tbSnapEnd();
    ed.tool = tool;
    syncTbFaces();
    const tb = lastViewPt ? pickTbox(lastViewPt[0], lastViewPt[1]) : null;
    const key = PAINT_CHP[tool];
    if (tb && key) applyChpSel(tb, tbPaintChg(tb, key));
    draw();
  }
  class TpopCell extends Element {
    constructor(d, it, i, act) {
      super(d.x, d.y + i * d.fh, it.iscr !== undefined ? 102 : d.w, d.fh);
      this.it = it; this.act = act; this.hover = false; this.cursor = 'pointer';
    }
    draw(ctx) {
      const im = texImg(this.hover ? 'd8frmh' : 'd8frm', () => this.dirty());
      if (imgReady(im)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, this.w, this.h); }
      const it = this.it;
      if (it.iscr !== undefined) { // Tcth/Tbth swatch inside the 4px frame; iscr 0 = clear
        const x0 = this.w * 0.04, x1 = this.w * 0.96, y0 = this.h * 0.18, y1 = this.h * 0.82;
        if (it.iscr === 0) { // repeating 45deg hatch #888/#ccc 2px
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
          ctx.fillStyle = '#ccc'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          ctx.strokeStyle = '#888';
          for (let d2 = -this.h; d2 < this.w + this.h; d2 += 4) { ctx.beginPath(); ctx.moveTo(x0 + d2, y1); ctx.lineTo(x0 + d2 + (y1 - y0), y0); ctx.stroke(); }
          ctx.restore();
        } else { const c = renderer.palColors[it.iscr]; ctx.fillStyle = `rgb(${c.join(',')})`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      } else {
        const x0 = this.w * 0.05;
        ctx.fillStyle = '#222'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        if (it.name !== undefined) { ctx.font = `12px '${it.name}',sans-serif`; ctx.fillText(it.name, x0, this.h / 2, this.w * 0.93); }
        else if (it.dyp !== undefined) { ctx.font = `${it.dyp}px "Comic Sans MS",sans-serif`; ctx.fillText('Abcg', x0, this.h / 2, this.w * 0.93); }
        else { ctx.font = `${it.grfont & 1 ? 'bold ' : ''}${it.grfont & 2 ? 'italic ' : ''}14px "Comic Sans MS",sans-serif`; ctx.fillText('Ab', x0, this.h / 2, this.w * 0.93); }
      }
    }
    onPointerEnter() { this.hover = true; this.dirty(); }
    onPointerLeave() { this.hover = false; this.dirty(); }
    onClick() { this.act(this.it); }
  }
  function showTextPop(kind) {
    if (tpop.kind === kind) { closeTextPop(); return; }
    closeTextPop();
    const d = TBPOP_DEF[kind];
    tpop.kind = kind; tpop.pg = 0;
    const rows = Math.min(d.items.length, d.page);
    const el = tpop.el = new Element(d.x, d.y, d.w, rows * d.fh + (d.items.length > d.page ? 21 : 0));
    el.pickable = false;
    el.draw = (ctx) => { ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, el.w, el.h); };
    el._pop = tpopPop;
    tpopPop.els.push(el);
    V.add(el);
    const b0 = tpopBtn(); if (b0) { b0.classList.add('on'); b0._sync(); }
    if (!openPops.includes(tpopPop)) openPops.push(tpopPop);
    buildTpopCells();
  }
  function buildTpopCells() {
    for (const b of tpop.cells) V.remove(b);
    tpop.cells = [];
    tpopPop.els = tpop.el ? [tpop.el] : [];
    const d = TBPOP_DEF[tpop.kind];
    d.items.slice(tpop.pg * d.page, tpop.pg * d.page + d.page).forEach((it, i) => {
      const b = new TpopCell(d, it, i, tpopPick);
      b._pop = tpopPop;
      V.add(b);
      tpop.cells.push(b); tpopPop.els.push(b);
    });
    const pages = Math.ceil(d.items.length / d.page);
    if (pages > 1) { // bottom-strip d8dn/d8up page arrows
      for (const [bmp, dn] of /** @type {[string,number][]} */ ([['d8dn', 1], ['d8up', -1]])) {
        const b = new StBtn(bmp, bmp + 's', d.x + (dn > 0 ? 0 : d.w / 2), d.y + d.page * d.fh, d.w / 2, 21,
          () => { tpop.pg = Math.max(0, Math.min(tpop.pg + dn, pages - 1)); buildTpopCells(); });
        b._pop = tpopPop;
        V.add(b);
        tpop.cells.push(b); tpopPop.els.push(b);
      }
    }
  }
  function tpopPick(it) { // cidTextSet*/cidTextBkgdColor: store the value, arm the tool
    const kind = tpop.kind;
    if (kind === 'fore' || kind === 'back') tbPaint.acr = it.iscr === 0 ? -1 : ((0xfe000000 | it.iscr) | 0);
    else if (kind === 'size') tbPaint.dyp = it.dyp;
    else if (kind === 'style') tbPaint.grfont = (tbPaint.grfont & ~it.mask) | (it.grfont & it.mask);
    else if (kind === 'font') tbPaint.font = it.name;
    closeTextPop();
    armTbPaint(TBPOP_TOOL[kind]);
  }
  function closeTextPop() {
    if (!tpop.el) return;
    V.remove(tpop.el); tpop.el = null;
    for (const b of tpop.cells) V.remove(b);
    tpop.cells = []; tpop.kind = null;
    tpopPop.els = [];
    const i = openPops.indexOf(tpopPop); if (i >= 0) openPops.splice(i, 1);
    const w = TB.find((tt) => tt.id === 'words');
    if (w) for (const bmp of ['4font', '4bold', '4size', '4colr', '4back']) {
      const b = w.secBtns[bmp];
      if (b && TOOL_TBFACE[ed.tool] !== bmp) { b.classList.remove('on'); b._sync(); }
    }
  }

  // roll calls (browser.cht kidRollCallActor/Prop; pos3.chh)
  // cells at (L.x,98+i*74), thumb inside at (2,2) 38x70, page arrows at y=394
  class RcCell extends Element {
    constructor(L, i) {
      super(L.x, 98 + i * 74, 42, 74);
      this.L = L; this.i = i; this.cursor = 'pointer';
    }
    draw(ctx) {
      const L = this.L, acts = rcActs(L), a = acts[L.off + this.i];
      const st = !a ? '' : L.off + this.i === L.sel ? 's' : 'e';
      if (st) {
        const im = texImg(`${L.prefix}${this.i + 1}${st}`, () => this.dirty());
        if (imgReady(im)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, this.w, this.h); }
        ctx.drawImage(rcThumbFor(a.data.tagTmpl?.cno, a), 2, 2, 38, 70);
      }
    }
    onClick() { const a = rcActs(this.L)[this.L.off + this.i]; if (a) { this.L.sel = this.L.off + this.i; setSelChid(chidOf(a)); syncRollCall(); draw(); } }
  }
  class RcArrow extends Element {
    constructor(L, img, x, w, scroll) {
      super(x, 394, w, 17);
      this.img = img; this.scroll = scroll; this.cursor = 'pointer'; this.L = L;
      this._en = false; this._dn = false;
    }
    draw(ctx) {
      const im = texImg(`${this.img}${this._en ? (this._dn ? 'c' : '') : 'd'}`, () => this.dirty());
      if (imgReady(im)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, this.w, this.h); }
    }
    onPointerDown() { if (this._en) { this._dn = true; this.dirty(); } }
    onPointerUp() { this._dn = false; this.dirty(); }
    onPointerLeave() { this._dn = false; this.dirty(); }
    onClick() { if (this._en) { this.scroll(); this.L.sel = -1; syncRollCall(); } }
  }
  for (const L of rcLists) {
    L.cells = []; L.arrows = [];
    for (let i = 0; i < 4; i++) {
      const cell = new RcCell(L, i);
      cell.L = L;
      V.add(cell);
      L.cells.push(cell);
    }
    const up = new RcArrow(L, L.up, L.x, 21, () => L.off--);
    const dn = new RcArrow(L, L.dn, L.x + 20, 20, () => L.off++);
    up.L = dn.L = L;
    V.add(up); V.add(dn);
    L.arrows.push(up, dn);
  }

  // --- top tool bar ----------------------------------------------------------
  // studio.cht covers (covr1-4) at y0-43 sit over per-section 62x40 insert buttons
  // (y1-41); opening a cover flips it away (transparent rep) revealing them.
  // sectools.cht secondary rows: Npar strip at (0,47) + tool buttons inside it.
  // Exactly one cover open at a time (kidBackground->idPriOpen).
  const TB = [ // [bmp, x, w?, action?] — actions 'scene'/'actor'/'prop' open a browser
    { id: 'scenes', cov: 'covr1', cx: 0,   row: '1par', def: null, door: 5, dx: 375,
      ins: [['1back', 18, 'bkgd']],
      sec: [['1view', 199, 0, 'cam'], ['p3rmbk', 256, 0, () => sceneChop(false)],
            ['p3rmfw', 315, 0, () => sceneChop(true)], ['1scen', 390, 0, () => showSceneSorter()]] },
    { id: 'actors', cov: 'covr2', cx: 100, row: '2par', def: '2comp', door: 6, dx: 374,
      ins: [['2actr', 114, 'actor'], ['2prop', 180, 'prop'], ['2splt', 246, 'splt']],
      sec: [['2comp', 41], ['2acts', 98, 0, undefined, ['2act01', '2act02', '2act03', '2act04', '2act05', '2act06']],
            ['2cont', 155], ['2cost', 211], ['2rot', 268, 50, () => setRot(!rotOpen())],
            ['2xy', 325, 36, 'tog:xy'], ['2zero', 392, 36, 'tog:ground'], ['2tran', 435, 50, () => setTrn(!trnOpen())],
            ['2soon', 492], ['2bio', 549, 50, () => showBio()]] },
    { id: 'sounds', cov: 'covr3', cx: 323, row: '3par', def: '3ear', door: 7, dx: 354,
      ins: [['3horn', 334, 'fx'], ['3mike', 400, 'speech'], ['3note', 466, 'music']],
      sec: [['3sing', 176], ['3loop', 234], ['3ear', 292], ['3rpt', 370], ['1note', 428, 36, 'tog:pause']] },
    { id: 'words',  cov: 'covr4', cx: 543, row: '4par', def: '4ins', door: 8, dx: 403,
      ins: [['4new', 560, 'words']],
      sec: [['4ins', 112], ['4font', 170, 0, () => showTextPop('font')], ['4bold', 228, 0, () => showTextPop('style')],
            ['4size', 286, 0, () => showTextPop('size')], ['4colr', 344, 0, () => showTextPop('fore')],
            ['4back', 419, 0, () => showTextPop('back')], ['4scrl', 477, 0, () => setScrl(!scrlBg.visible)]] },
  ];
  const TB_DOWN = { p3rmbk: 'p3rmbkc', p3rmfw: 'p3rmfwc', '2cost': '2costc', '2acts': '2acts' }; // non-'s' down bmps
  const animBtns = []; // buttons whose default face is a cycling REP_ANIM cell sequence
  setInterval(() => { for (const b of animBtns) { // advance unselected animated tool faces
    if (b.isOn || b.isDown) continue;
    b._ai = (b._ai + 1) % b._anim.length; b._sync();
  } }, 160);
  const mkTbBtn = (up, x, y, w, h, onclick) => {
    const dn = TB_DOWN[up] || up + 's';
    const b = new StBtn(up, dn, x, y, w, h, onclick, TIP_IDS.has(up) ? up : null);
    b._sync = () => { b.faceOverride = null; b.dirty(); };
    return b;
  };
  for (const tt of TB) {
    // insert buttons — created first so the cover image can cover them
    tt.insBtns = tt.ins.map(([bmp, x, act]) => {
      const b = mkTbBtn(bmp, x, 1, 62, 40, act ? () => showBrowser(act) : () => {});
      V.add(b);
      return b;
    });
    // secondary tool row (Npar bg at y47 + buttons at abs coords, children of rowEl)
    tt.rowEl = new Element(0, 0, UI_W, UI_H);
    tt.rowEl.pickable = false; tt.rowEl.visible = false;
    V.add(tt.rowEl);
    tt.rowEl.add(new Img(tt.row, 0, 47, 640, 51));
    tt.secBtns = {};
    for (const [bmp, x, w, act, anim] of /** @type {any[]} */ (tt.sec)) { // act: 'tog:key' toggle | string = browser | fn = command | none = radio tool; anim = cycling default-face cells
      const b = mkTbBtn(bmp, x, 48, w || 50, 48, null);
      if (anim) { // REP_ANIM default state (e.g. kidActorsActionBrowser: 2act01-06); on/down face is bmp
        b._anim = anim; b._ai = 0;
        b._sync = () => { b.faceOverride = b.isOn || b.isDown ? bmp : b._anim[b._ai]; b.dirty(); };
        b._sync(); animBtns.push(b);
      }
      if (typeof act === 'string' && act.startsWith('tog:')) {
        if (act === 'tog:pause') { // kidPausesSound: open/closed faces by fpseDown, not a tool
          b._sync = () => { b.faceOverride = ed.pauseSnd ? '1notes' : '1note';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => editPause(!ed.pauseSnd);
        } else {
          const key = act.slice(4); // faces per sectools.cht: xy on='2xys'/XZ off='2xy'; ground on='2zero'/off='2zeros'
          b._sync = () => { const on = ed[key];
            b.faceOverride = on === (key === 'ground') ? bmp : bmp + 's';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => { ed[key] = !ed[key]; b._sync(); };
        }
        b._sync();
      } else if (typeof act === 'string') b.onclick = () => showBrowser(act);
      else if (typeof act === 'function') b.onclick = () => { act(); draw(); };
      else b.onclick = () => { tbSnapEnd(); for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
        b.classList.add('on'); b._sync();
        ed.tool = { '2comp': 'compose', '2cont': 'record', '2acts': 'action', '2cost': 'costume', '2soon': 'sooner',
          '3sing': 'sounder', '3loop': 'looper', '3rpt': 'matcher', '3ear': 'listener', '4ins': 'tboxSel' }[bmp] || 'none';
        for (const o of ccpCells) o._sync?.(); setRot(false); setTrn(false); setScrl(false); closeTextPop(); endSoonerLater(); earHover = undefined; view.cursor = ''; }; // picking a tool disarms armed tools/popups
      tt.rowEl.add(b);
      tt.secBtns[bmp] = b;
      if (!act) (ed.toolBtns ||= {})[bmp] = b; // programmatic tool select (e.g. action apply arms 2cont)
    }
    if (tt.def) { tt.secBtns[tt.def].classList.add('on'); }
    // doors (sectools.cht kidDoors): a door bitmap covers the row's tail until clicked;
    // fAll*Doors persists for the session — opening the doors reveals the whole row
    tt.doorEl = new Img('', 0, 47, 640, 51);
    tt.doorEl.pickable = false;
    tt.rowEl.add(tt.doorEl);
    tt.doorZone = new StBtn('', '', tt.dx, 47, 640 - tt.dx, 51, null); // invisible zone
    tt.doorZone.draw = () => {}; // transparent — just hit area
    tt.rowEl.add(tt.doorZone);
    const paintDoor = () => {
      tt.doorEl.name = `door${tt.all ? tt.door - 4 : tt.door}`; // door5-8 -> door1-4
      tt.doorEl.dirty();
      tt.doorZone.visible = !tt.all;
    };
    tt.doorZone.onclick = () => { if (!player?.scene) return; tt.all = true; paintDoor(); }; // doors stay shut until tools are enabled
    paintDoor(); tt.paintDoor = paintDoor;
    // cover tab — on top of the insert buttons; open = hidden (covr*o is transparent)
    tt.covEl = new Img(`${tt.cov}c`, tt.cx, 0, tt.cov === 'covr1' ? 99 : tt.cov === 'covr2' ? 223 : tt.cov === 'covr3' ? 220 : 98, 43);
    tt.covEl.pickable = true; tt.covEl.cursor = 'pointer';
    V.add(tt.covEl);
    tt.covEl.onClick = () => { if (!tt.locked) setCover(tt.id); }; // kstDisabled face is inert
  }
  function setCover(id) { // exactly one cover open — the others stay covered
    for (const tt of TB) { tt.covEl.visible = tt.id !== id; tt.rowEl.visible = tt.id === id; }
    // original: cover-open CreateChildGob's the secondary-tools background, whose
    // CREATE script arms the tab's default tool — scenes=chttNone(toolDefault),
    // actors=compose, sounds=listener, words=tboxMove — so every tab switch
    // exits text mode; you can never get stuck in an armed tbox tool
    closeTextPop(); setScrl(false); setRot(false); setTrn(false); endSoonerLater(); earHover = undefined;
    const tt = TB.find((t) => t.id === id);
    if (tt?.def) ed.toolBtns?.[tt.def]?.onclick();
    else { // chttNone -> toolDefault: nil tool, no face selected
      tbSnapEnd(); ed.tool = 'none'; view.cursor = '';
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      for (const o of ccpCells) o._sync?.();
    }
    V.invalidate();
  }
  // STDIO::_SetToolStates -> kchidResetTools/kchidEnableSceneTools: a sceneless
  // movie keeps the scrollbar strip + undo/ccp covered by their lids (covr5c/
  // covr7c bitmaps) and locks the actor/sound/text covers (covr*d face, inert
  // clicks); the settings cover stays open — Scene Choices is the way out — and
  // book/map/portfolio stay usable (kidBooksCover open). The first scene lifts
  // the lids and unlocks the covers; nuking the last scene re-covers them.
  const stripLids = [];
  for (const [bmp, x, y, w, h] of /** @type {[string,number,number,number,number][]} */ ([['door0', 0, 47, 640, 51], ['covr5c', 0, 410, 362, 56], ['covr7c', 364, 410, 110, 56]])) { // kidDoors kstDefault face (door0.bmp) + gob pos + preg -> drawn rects
    const im = new Img(bmp, x, y, w, h);
    im.visible = false; im.pickable = false;
    V.add(im);
    stripLids.push(im);
  }
  ed.syncToolState = () => {
    const noScene = !player?.scene;
    for (const im of stripLids) { im.visible = noScene; im.dirty(); }
    for (const tt of TB) {
      if (tt.id === 'scenes') continue;
      tt.locked = noScene;
      tt.covEl.name = `${tt.cov}${noScene ? 'd' : 'c'}`;
      tt.covEl.cursor = noScene ? 'default' : 'pointer';
      tt.covEl.dirty();
    }
    if (noScene) {
      for (const tt of TB) { tt.all = false; tt.paintDoor(); tt.rowEl.visible = false; } // kidDoors -> kstDefault; no secondary row while tools are locked
      setCover('scenes'); // resets the armed tool too (chttNone)
      TB[0].rowEl.visible = false; // settings cover stays open but its tool row stays hidden
    } else { // kchidEnableSceneTools: restore the open cover's row + open its doors
      const open = TB.find((tt) => !tt.covEl.visible);
      if (open) { open.rowEl.visible = true; if (!open.all) { open.all = true; open.paintDoor(); } }
    }
    V.invalidate();
  };
  ed.openCover = setCover;
  rotPop.toggle = rotBtn(); trnPop.toggle = trnBtn(); scrlPop.toggle = scrlBtn(); // toggles need the built TB bar
  // outside-click closes popups — view-level catch-all (was document pointerdown)
  V.onPointerDown = (e0) => {
    const hit = studioView.hitTest(e0.x, e0.y);
    for (const pop of [...openPops]) {
      if (hit && (pop.els.includes(hit) || hit === pop.toggle)) continue;
      ({ ccp: () => setCcp(false), port: () => setPort(false), rot: () => setRot(false),
        trn: () => setTrn(false), scrl: () => setScrl(false), tpop: () => closeTextPop() })[pop.name]?.();
    }
    if (sl && !slEls.includes(hit)) { endSoonerLater(); ed.toolBtns?.['2comp']?.onclick(); }
  };
  setCover('scenes');

  // --- store→render wiring ---------------------------------------------------
  // Selectors repaint just the affected elements instead of relying on callers
  // remembering to sync chrome (interface-overhaul Phase 2/4). StudioView lives
  // for the whole session — no unsubscribe needed.
  useUi.subscribe((s) => s.playing, (p) => {
    const pb = els.stb_play; if (pb) { pb.classList.toggle('on', p); pb._sync?.(); }
  });
  useEd.subscribe((s) => s.selChid, () => {
    syncRollCall(); // key-dedup'd — repaints only on real change
  });
  }
}
export function initStudio() { studioView = new StudioView(); }
export function syncStudio() { // reflect player state into the studio bar (called from updateUi)
  if (!studioView?.children.length) return;
  const els = studioView._els;
  els.stfnum.textContent = player.scene ? player.frame - player.scene.nfrmFirst + 1 : '–';
  els.stsnum.textContent = player.sceneIndex >= 0 ? player.sceneIndex + 1 : '–';
  const nm = els.stname;
  if (!$('stnameInp')) nm.textContent = player.movie.name || t('doc.untitled');
  for (const s of /** @type {any} */ (studioView)._stSliders || []) s.sync();
  { // SSCB::SetSndFrame — the frame thumb shows the speaker face (fthms) while a
    // sound event lands exactly on the current frame (SEVT.PlaySnd or actor Snd)
    let snd = false;
    if (player.scene && player.frame !== null) {
      for (const e of player.scene.frameEvents || []) if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd) { snd = true; break; }
      if (!snd) for (const a of player.actors.values())
        for (const ev of a.events || []) if (ev.nfrm === player.frame && ev.aet === AET.Snd) { snd = true; break; }
    }
    const fth = /** @type {any} */ (studioView)._stSliders?.[0]?.thumb;
    if (fth && fth.name !== `fthm${snd ? 's' : ''}`) { fth.name = `fthm${snd ? 's' : ''}`; fth.dirty(); }
  }
  syncRollCall();
}
export function syncRollCall() { // actor + prop roll calls: 4 cells each + page arrows (scrolls 1/click, no wrap)
  for (const L of rcLists) {
    const acts = rcActs(L);
    L.off = Math.max(0, Math.min(L.off, Math.max(0, acts.length - 4)));
    if (L.sel >= acts.length) L.sel = -1;
    const key = `${player?.sceneIndex}|${L.off}|${L.sel}|${acts.map((a) => a.data.arid).join(',')}`;
    if (key === L.key) continue;
    L.key = key;
    for (const cell of L.cells) cell.dirty();
    L.arrows[0]._en = acts.length > 4 && L.off > 0;
    L.arrows[1]._en = acts.length > 4 && L.off < acts.length - 4;
    for (const ar of L.arrows) ar.dirty();
  }
  syncSelBox();
}
