import { SEVT, AET } from '../../format/movie.ts';
import { textboxEdits } from '../edit/textboxEdits.ts';
import { appState, useUiState, useEditState } from '../appState.ts';
import { elementById, cursorUrl } from '../resources.ts';
import { DWR_NIL } from '../../engine/actor.ts';
import { FPS } from '../../engine/player.ts';
import { hitTestTextbox } from '../../render/textbox.ts';
import { movieDocument } from '../movieDocument.ts';
import { movieEdits } from '../edit/movieEdits.ts';
import { soundEdits } from '../edit/soundEdits.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { version } from '../../../package.json';
import { thumbnails } from '../thumbnails.ts';
import { editHistory } from '../editHistory.ts';
import { talentBook } from './talentBook.ts';
import { AssetBrowserView } from './assetBrowser.ts';
import { modalSlot } from './modal.ts';
import { optionsDialog } from './optionsDialog.ts';
import { ListenerEasel, ActionBrowser, SpletterEasel, CostumeEasel, SorterEasel, WordsDialog } from './easels.ts';
import { localizer } from '../localization.ts';
import { View, uiRoot, UI_WIDTH, UI_HEIGHT } from './root.ts';
import { Element } from './element.ts';
import { ImageElement, StudioButton, TextLink, MovieScreen } from './widgets.ts';
import { textureCache } from './textureCache.ts';
// --- studio editor chrome (canvas port of ui-dom/studio.js) -------------------
// Positions lifted from 3DMMEx studio.cht / pos3.chh: bitmap lands at (gob - preg).
export const STUDIO_IMGS = ([ // [name, x, y, w, h] in the original 640x480 screen space
  ['back1', 0, 0, 640, 100], ['back2', 0, 97, 48, 314], ['back3', 592, 97, 48, 313], ['back4', 0, 406, 640, 74],
  ['vsld', 331, 414, 29, 45], ['name', 28, 464, 300, 16],
] as [string,number,number,number,number][]);
// stb id or tool bmp ids -> 'tip.<id>' in lang/*.json (verbatim from src/help/tooltips.cht ktt* topics)
export const TIP_IDS = new Set([
  'frmRWEnd', 'frmRW', 'frmFW', 'frmFWEnd', 'scnRWEnd', 'scnRW', 'scnFW', 'scnFWEnd', 'play', 'undo', 'ccp', 'port', 'book', 'map', '1back', '1view', 'p3rmbk', 'p3rmfw', '1scen', '2actr', '2prop', '2splt', '2comp', '2cont', '2acts', '2cost', '2rot', '2xy', '2zero', '2tran', '2soon', '2bio', '3horn', '3mike', '3note', '3sing', '3loop', '3ear', '3rpt', '1note', '4new', '4ins', '4font', '4bold', '4size', '4colr', '4back', '4scrl', 'p3cut', 'p3copy', 'p3cppt', 'p3past', 'p3rmac']);

export const STUDIO_BTNS = ([ // [id, up, down/selected, x, y, w, h]
  ['frmRWEnd', 'frwe', 'frwes', 108, 414, 22, 17], ['frmRW', 'frw', 'frws', 130, 414, 22, 17],
  ['frmFW', 'ffw', 'ffws', 240, 414, 22, 17], ['frmFWEnd', 'ffwe', 'ffwes', 262, 414, 22, 17],
  ['scnRWEnd', 'srwe', 'srwes', 108, 439, 22, 17], ['scnRW', 'srw', 'srws', 130, 439, 22, 17],
  ['scnFW', 'sfw', 'sfws', 240, 439, 22, 17], ['scnFWEnd', 'sfwe', 'sfwes', 262, 439, 22, 17],
  ['play', 'play', 'plays', 301, 414, 26, 45],
  ['undo', 'undo', 'undos', 371, 411, 49, 52], ['ccp', 'ccp', 'ccps', 424, 411, 49, 52],
  ['port', 'port', 'ports', 481, 411, 49, 52], ['book', 'book', 'bookc', 534, 411, 49, 52],
  ['map', 'map', 'mapc', 587, 411, 49, 52],
] as [string,string,string,number,number,number,number][]);
export const STUDIO_TEXT_LAYOUT = ([ // [id, x, y, w, h] text overlays drawn on the baked fields
  ['stfnum', 56, 413, 40, 18], ['stsnum', 56, 440, 40, 17], ['stname', 30, 464, 296, 16],
] as [string,number,number,number,number][]);

/** Simple text field element — the old .stTxt/.stVer divs. */
class StudioText extends Element {
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
class StudioSlider extends Element {
  constructor(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) {
    super(x, y, w, h);
    this.axis = axis; this.min = min; this.span = span; this.get = get; this.set = set;
    this.thumb = new ImageElement(img, tx, ty, tw, th); this.thumb.pickable = false;
    this.tx = tx; this.ty = ty;
  }
  sync() { // reposition thumb along the axis like syncStudio did via style.left/top
    const p = this.min + this.get() * this.span;
    if (this.axis === 'x') this.thumb.x = p; else this.thumb.y = p;
    this.thumb.dirty();
  }
  onPointerDown(p) { this._drag = true; this._move(p); }
  onPointerMove(p) { if (this._drag) this._move(p); }
  onPointerUp() { this._drag = false; }
  onPointerLeave() { this._drag = false; }
  _move(p) {
    const v = this.axis === 'x' ? p.x : p.y;
    this.set(Math.max(0, Math.min(1, (v - this.min) / this.span)));
  }
}

/** The 3D stage — MovieScreen blit + all editor pointer machinery. */
class View3D extends MovieScreen {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = true; }
}

export class StudioView extends View {
  constructor() {
    super();
    /** @type {Record<string, any>} */
    const namedElements: Record<string, any> = this.namedElements = {};
  const V = this;
  const glv = elementById('view'); if (glv) glv.style.display = 'none'; // GL canvas lives offscreen; MovieScreen blits it
  // The studio sits UNDER whatever is on the stack (boot view pops to reveal it;
  // theatre/embed replace() discards it).
  if (!uiRoot.stack.includes(V)) { uiRoot.stack.unshift(V); V.root = uiRoot; V.parent = uiRoot; uiRoot._rebuild(); }
  const view = new View3D(48, 100, 544, 306);
  appState.editorTools.view = view;
  const viewPixelPos = (e) => [e.x - 48, e.y - 100];
  const viewNdc = (e) => [(e.x - 48) / 544 * 2 - 1, 1 - (e.y - 100) / 306 * 2];
  let dragSession = null, recording = null, rotation = null, transformDrag = null, pendingScrubActor = null, hoveredEarActor = undefined;
  const ROT_AXIS = { rotx: 'x', roty: 'y', rotz: 'z' }; // tool -> fRotate axis arg
  const XFM_TOOL = { sqsh: 'sqsh', size: 'size' }; // transform-popup dragSession tools
  const SOUND_TOOLS = { sounder: 1, looper: 1, matcher: 1 }; // actor/scene sound attach tools
  const PAINT_CHANGES = { textboxPaintText: 'fore', textboxFont: 'font', textboxSize: 'dyp', textboxStyle: 'grfont' }; // TBXG dragSession-apply tools
  const textboxFontIndex = (textbox, name) => { // sprmFont mpe indexes the doc's AGPA list (1-based); _onnDef -> lw 0
    const doc = textbox.rtxt;
    if (name === doc.font) return 0;
    let i = doc.fonts.indexOf(name);
    if (i < 0) { doc.fonts.push(name); i = doc.fonts.length - 1; }
    return i + 1;
  };
  const textboxPaintChange = (textbox, k) => (k === 'fore' ? { fore: 1, acr: appState.textboxPaint.acr }
    : k === 'font' ? { font: 1, fontIdx: textboxFontIndex(textbox, appState.textboxPaint.font) }
    : k === 'dyp' ? { dyp: appState.textboxPaint.dyp }
    : { grfont: appState.textboxPaint.grfont, mask: 3 });
  view.onPointerDown = (rawEvent) => {
    const e = rawEvent.src || rawEvent;
    if (e.button !== 0 || !appState.moviePlayer || appState.playing) return;
    // sooner/later buttons' track-mouse: any click not on the buttons closes the
    // session, switches back to compose, and the click proceeds normally
    if (scrubSession) { endSoonerLater(); appState.editorTools.toolBtns?.['2comp']?.onclick(); }
    const [px, py] = appState.setLastViewPoint(viewPixelPos(rawEvent));
    if (appState.textboxAttachment) { // AttachToMouse: the click drops the new tbox (TBXB::FCmdTrackMouse)
      const { textbox, moved } = appState.textboxAttachment; appState.setTextboxAttachment(null); view.cursor = '';
      if (moved) textboxEdits.textboxOperation(textbox, () => {}); // commit the mouse-tracked rect as one undo op
      playbackLoop.drawFrame();
      return;
    }
    textboxEdits.endTextboxSnapshot(); // any view click commits the pending text-edit burst
    const textboxHit = textboxEdits.pickTextbox(px, py);
    if (textboxHit && (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || appState.editorTools.tool === 'nuke')) { // tbox tools own the click (cidTboxClicked)
      const lx = px - textboxHit.l, ly = py - textboxHit.t, w = textboxHit.r - textboxHit.l, h = textboxHit.b - textboxHit.t;
      if (appState.editorTools.tool === 'nuke') { textboxEdits.removeTextbox(textboxHit); return; } // TBXG+TBXB toolActorNuke -> FRemTbox
      if (textboxEdits.inTextboxBorder(lx, ly, w, h)) { // TBXB band: select + move/resize dragSession (works for every tool)
        if ((appState.editorTools.tool === 'textboxStory' || appState.editorTools.tool === 'textboxCredit') && appState.selectedTextboxId !== textboxEdits.textboxIdOf(textboxHit)) { // TBXB::FPtIn declines non-selected boxes for the type tools
          textboxEdits.setSelectedTextbox(-1); playbackLoop.drawFrame(); return; // bubbles to MVU -> SelectTbox(pvNil)
        }
        textboxEdits.setSelectedTextbox(textboxEdits.textboxIdOf(textboxHit)); appState.setSelectedChildId(-1);
        for (const list of thumbnails.rollCallLists) list.selected = -1;
        dragSession = { kind: 'textboxResize', textbox: textboxHit, anchor: textboxEdits.textboxAnchor(lx, ly, w, h), originalBounds: { l: textboxHit.l, t: textboxHit.t, r: textboxHit.r, b: textboxHit.b }, grabX: px, grabY: py };
        playbackLoop.drawFrame();
        return;
      }
      // interior (TBXG): fill/type tools hit the clicked box; the rest focus it + start a caret/text dragSession
      if (appState.editorTools.tool === 'textboxFill') { textboxEdits.textboxOperation(textboxHit, () => { textboxHit.rtxt.acrBack = appState.textboxPaint.acr; textboxHit.rtxt._layout = null; }); return; } // FSetAcrBack(AcrPaint)
      if (appState.editorTools.tool === 'textboxStory' || appState.editorTools.tool === 'textboxCredit') { const fs = appState.editorTools.tool === 'textboxStory'; textboxEdits.textboxOperation(textboxHit, () => { textboxHit.fStory = fs; }); return; } // FSetType — any box, selected or not
      textboxEdits.setFocusedTextbox(textboxEdits.textboxIdOf(textboxHit)); appState.setSelectedChildId(-1);
      const cp = hitTestTextbox(textboxHit, appState.sceneRenderer.ovCtx, appState.sceneRenderer.palColors, px, py); // interior: caret + text selection dragSession
      appState.setTextboxSelection({ anchor: cp, other: cp });
      dragSession = { kind: 'textboxEdit', textbox: textboxHit, paint: PAINT_CHANGES[appState.editorTools.tool] || null };
      playbackLoop.drawFrame();
      return;
    }
    if (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) { // text mode skips actor picking entirely: a miss just SelectTbox(pvNil)
      if (appState.selectedTextboxId >= 0) { textboxEdits.setSelectedTextbox(-1); playbackLoop.drawFrame(); }
      return;
    }
    const [nx, ny] = viewNdc(rawEvent);
    if (appState.pendingPlacement) {
      const p = appState.sceneRenderer.groundPoint(nx, ny, 0);
      if (p) (appState.pendingPlacement.tdt ? movieEdits.insert3dText : movieEdits.placeActor)(appState.pendingPlacement.tdt ?? appState.pendingPlacement, { x: p.x, y: 0, z: p.z });
      appState.setPendingPlacement(null); view.cursor = ''; playbackLoop.drawFrame();
      return;
    }
    const a = appState.sceneRenderer.pickActor(nx, ny);
    appState.setSelectedChildId(a ? movieEdits.childIdOf(a) : -1);
    for (const list of thumbnails.rollCallLists) { // keep the roll-call highlight in sync w/ the view pick
      const i2 = a ? thumbnails.rollCallActors(list).indexOf(a) : -1;
      list.selected = i2;
      if (i2 >= 0) { const n = thumbnails.rollCallActors(list).length; if (i2 < list.offset) list.offset = i2; else if (i2 > list.offset + 3) list.offset = Math.min(i2 - 3, Math.max(0, n - 4)); }
    }
    playbackLoop.drawFrame();
    if (SOUND_TOOLS[appState.editorTools.tool]) { // toolSounder/Looper/Matcher mousedown (movie.cpp):
      if (!a) {                 // PactrFromPt miss -> scene sound; hit -> actor sound
        if (appState.editorTools.tool === 'matcher') { if (appState.editorTools.soundTag) console.warn('[sound] motion-match needs an actor'); } // ercSocBadSceneSound
        else if (appState.editorTools.soundTag) soundEdits.addBackgroundSound(appState.editorTools.tool === 'looper', e.metaKey || e.ctrlKey); // cmd = fQueue
      } else if (a.onStage && appState.editorTools.soundTag) soundEdits.addActorSound(a, appState.editorTools.tool === 'looper', e.metaKey || e.ctrlKey, appState.editorTools.tool === 'matcher');
      return;
    }
    if (appState.editorTools.tool === 'listener') { ListenerEasel.show(a || null); return; } // toolListener -> StartListenerEasel
    if (!a || !a.onStage) return;
    if (appState.editorTools.tool === 'action') { ActionBrowser.show(); return; } // toolAction: click actor -> StartActionBrowser
    if (appState.editorTools.tool === 'costume') { (a.template.isTdt ? SpletterEasel.show : CostumeEasel.show)(a); return; } // toolActorEasel: TDT->ESLT else ESLA (FCmdActorEaselOpen)
    if (appState.editorTools.tool === 'cut') { movieEdits.cutSelectedActor(e.shiftKey); return; } // toolCutObject -> FDoClip -> _ClearSel (shift = all subroutes)
    if (appState.editorTools.tool === 'nuke') { movieEdits.nukeSelectedActor(); return; }         // toolActorNuke -> FRemActr
    if (appState.editorTools.tool === 'rotnorm') { // toolNormalizeRot -> FNormalize(fnormRotate)
      const eventsBefore = structuredClone(a.data.events);
      a.fNormalizeRot();
      const eventsAfter = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(eventsBefore); // rewind; executeOperation.do does the real apply
      const applyEvents = (events) => { a.data.events = a.events = structuredClone(events); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);
      editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (ROT_AXIS[appState.editorTools.tool]) { // toolRotateX/Y/Z: dragSession rotates the clicked actor
      rotation = { actor: a, lastX: rawEvent.x, lastY: rawEvent.y, axis: ROT_AXIS[appState.editorTools.tool], eventsBefore: structuredClone(a.data.events) };
      return;
    }
    if (appState.editorTools.tool === 'sizenorm') { // toolNormalizeSize -> FNormalize(fnormSize)
      const eventsBefore = structuredClone(a.data.events);
      a.fNormalizeSize();
      const eventsAfter = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(eventsBefore); // rewind; executeOperation.do does the real apply
      const applyEvents = (events) => { a.data.events = a.events = structuredClone(events); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);
      editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (XFM_TOOL[appState.editorTools.tool]) { // toolSquashStretch/toolResize: dragSession squashes or scales the actor
      transformDrag = { actor: a, lastX: rawEvent.x, lastY: rawEvent.y, kind: XFM_TOOL[appState.editorTools.tool], eventsBefore: structuredClone(a.data.events) };
      return;
    }
    if (appState.editorTools.tool === 'sooner') { // toolSoonerLater: grab -> sooner/later buttons appear on release
      pendingScrubActor = a;
      return;
    }
    if (appState.editorTools.tool !== 'compose' && appState.editorTools.tool !== 'record') return;
    const wp = { x: a.xyz.x + a.dxyzRte.x, y: a.xyz.y + a.dxyzRte.y, z: a.xyz.z + a.dxyzRte.z };
    const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, wp) : appState.sceneRenderer.groundPoint(nx, ny, wp.y);
    if (!pt) return;
    if (appState.editorTools.tool === 'record') { // toolRecordSameAction (FBeginRecord/FRecordMove/FEndRecord, actor.cpp)
      playbackLoop.setPlaying(false); // recording drives the clock itself
      recording = { actor: a, worldPoint: wp, grabPoint: { x: pt.x, y: pt.y, z: pt.z }, current: { ...wp }, startOffset: { ...a.dxyzRte },
        started: false, ticks: 0, lastEventTick: 0, rawDelta: { x: 0, y: 0, z: 0 }, frozen: e.shiftKey, // fmafFreeze: shift records frozen
        startFrame: appState.moviePlayer.frame, routeBefore: structuredClone(a.data.route), eventsBefore: structuredClone(a.data.events), lastFrameBefore: appState.moviePlayer.scene.nfrmLast } as any;
      const evt = (aet, data) => a.addDoAev(aet, data); // _FAddDoAev: insert at cursor + execute
      const begin = () => { // toolRecordSameAction mousedown asserts the action (FSetAction),
        a.setActionCore(a.anid, a.celn, recording.frozen);     // then FBeginRecord + DeleteFwdCore(fFalse)
        const pts = a.route.slice(0, Math.max(0, a.rtel.irpt) + 1);
        if (a.rtel.dwrOffset > 0 && a.rtel.irpt >= 0 && pts.length) { // mid-segment: keep partial segment + split point
          const tab = pts[pts.length - 1];
          pts[pts.length - 1] = { ...tab, dwr: Math.max(0.01, Math.hypot(a.xyz.x - tab.x, a.xyz.y - tab.y, a.xyz.z - tab.z)) };
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
      recording.begin = begin; recording.evt = evt;
      recording.lastEventTickck = setInterval(() => { // FRecordMove once per frame tick
        recording.lastEventTickcks++;
        if (!recording.started) return;
        const s = appState.moviePlayer.scene, last = a.route[a.rtel.irpt]; // record tip — NOT route end (tail subroute may follow)
        const curl = { x: recording.current.x - recording.startOffset.x, y: recording.current.y - recording.startOffset.y, z: recording.current.z - recording.startOffset.z }; // route-local cursor
        const dl = { x: curl.x - last.x, y: curl.y - last.y, z: curl.z - last.z }; // cumulative displacement to cursor (dxrWld)
        const d = { x: (recording.rawDelta.x + 2 * dl.x) / 3, y: (recording.rawDelta.y + 2 * dl.y) / 3, z: (recording.rawDelta.z + 2 * dl.z) / 3 }; // smoothed
        recording.rawDelta = dl;
        if (a.frozen !== recording.frozen) evt(AET.Freeze, recording.frozen); // FRecordMove: unfreeze while recording so cels cycle
        const dwrCur = Math.max(0.5, a._celDwr(a.anid, a.celn) * a.xfrm.scaleStep); // _FGetDwrRecord
        const dwrMouse = Math.hypot(d.x, d.y, d.z);
        if (dwrMouse < dwrCur) { // pause: frames only advance after ~0.75s (kdtsThreshRte)
          if (recording.lastEventTickcks - recording.lastEventTick < 5) return;
          if (a.dwrStep !== 0) evt(AET.Step, 0); // FSetStep(rZero)
        } else {
          if (a.dwrStep !== DWR_NIL) evt(AET.Step, DWR_NIL); // resume at template step
          const k = dwrCur / dwrMouse; // truncate to exactly one step distance; excess is dropped
          const np = { x: last.x + d.x * k, y: last.y + d.y * k, z: last.z + d.z * k };
          if (appState.editorTools.ground && last.y + a.dxyzRte.y >= 0 && np.y + a.dxyzRte.y < 0) np.y = -a.dxyzRte.y; // fmafGround
          last.dwr = dwrCur;
          a.route.splice(a.rtel.irpt + 1, 0, { ...np, dwr: 0 }); // insert after tip, before retained tail
          const irptIns = a.rtel.irpt + 1; // _AdjustAevForRteIns: shift event rtels past the new point
          for (const e2 of a.events) {
            if (e2.rtel.irpt >= irptIns) e2.rtel.irpt++;
            else if (e2.rtel.irpt === irptIns - 1 && irptIns < a.route.length - 1 && e2.rtel.dwrOffset >= dwrCur) { e2.rtel.dwrOffset -= dwrCur; e2.rtel.irpt++; }
          }
          recording.lastEventTick = recording.lastEventTickcks;
        }
        if (appState.moviePlayer.frame >= s.nfrmLast) s.nfrmLast = appState.moviePlayer.frame + 1; // scene grows as it records
        appState.moviePlayer.gotoFrame(appState.moviePlayer.frame + 1);
        playbackLoop.drawFrame();
      }, 1000 / FPS);
      return;
    }
    dragSession = { actor: a, worldPoint: wp, start: { ...a.dxyzSubRte }, grabPoint: { x: pt.x, y: pt.y, z: pt.z }, current: { ...a.dxyzSubRte },
      shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey };
  };
  view.onPointerMove = (rawEvent) => {
    const e = rawEvent.src || rawEvent;
    appState.setLastViewPoint(viewPixelPos(rawEvent));
    if (appState.textboxAttachment) { // AttachToMouse: the box's TL follows the cursor (hidden), bounds-clamped
      const [px, py] = appState.lastViewPoint, textbox = appState.textboxAttachment.tb;
      const w = textbox.r - textbox.l, h = textbox.b - textbox.t;
      textbox.l = Math.max(0, Math.min(px, 544 - w)); textbox.t = Math.max(0, Math.min(py, 306 - h));
      textbox.r = textbox.l + w; textbox.b = textbox.t + h;
      appState.textboxAttachment.moved = true;
      playbackLoop.drawFrame();
      return;
    }
    if (dragSession?.kind === 'tbRc') { // TBXB::FCmdTrackMouse: move/resize per anchor, workspace-bounded
      const { textbox, anchor, rc0, px0, py0 } = dragSession, [px, py] = appState.lastViewPoint;
      const dx = px - px0, dy = py - py0;
      const rc = { ...rc0 };
      if (anchor === 'move') {
        rc.l = Math.max(0, Math.min(rc0.l + dx, 544 - (rc0.r - rc0.l))); rc.t = Math.max(0, Math.min(rc0.t + dy, 306 - (rc0.b - rc0.t)));
        rc.r = rc.l + (rc0.r - rc0.l); rc.b = rc.t + (rc0.b - rc0.t);
      } else {
        if (anchor.includes('left')) rc.l = Math.max(0, Math.min(rc0.l + dx, rc0.r - textboxEdits.TEXTBOX_MIN_WIDTH));
        if (anchor.includes('right')) rc.r = Math.min(544, Math.max(rc0.r + dx, rc0.l + textboxEdits.TEXTBOX_MIN_WIDTH));
        if (anchor.includes('up')) rc.t = Math.max(0, Math.min(rc0.t + dy, rc0.b - textboxEdits.TEXTBOX_MIN_HEIGHT));
        if (anchor.includes('down')) rc.b = Math.min(306, Math.max(rc0.b + dy, rc0.t + textboxEdits.TEXTBOX_MIN_HEIGHT));
      }
      Object.assign(textbox, rc);
      textbox.rtxt._layout = null;
      playbackLoop.drawFrame();
      return;
    }
    if (dragSession?.kind === 'tbTxt') { // TBXG_PAR::FCmdTrackMouse: dragSession extends the cp selection
      const [px, py] = appState.lastViewPoint;
      appState.textboxSelection.other = hitTestTextbox(dragSession.tb, appState.sceneRenderer.ovCtx, appState.sceneRenderer.palColors, px, py);
      playbackLoop.drawFrame();
      return;
    }
    if (recording) {
      const [nx, ny] = viewNdc(rawEvent);
      const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, recording.worldPoint) : appState.sceneRenderer.groundPoint(nx, ny, recording.worldPoint.y);
      if (!pt) return;
      recording.current = { x: recording.worldPoint.x + pt.x - recording.grabPoint.x, y: recording.worldPoint.y + pt.y - recording.grabPoint.y, z: recording.worldPoint.z + pt.z - recording.grabPoint.z };
      if (!recording.started) { // FIsRecordValid: needs 2.0u of movement or ~0.75s held (kdwrThreshRte/kdtsThreshRte)
        const distance = Math.hypot(recording.current.x - recording.worldPoint.x, recording.current.y - recording.worldPoint.y, recording.current.z - recording.worldPoint.z);
        if (distance >= 2 || recording.lastEventTickcks >= 5) { recording.started = true; recording.begin(); }
      }
      return;
    }
    if (rotation) { // MVU::_MouseDrag toolRotateX/Y/Z: brs = (dxrMouse+dyrMouse) * -0.001, AdjustCursor re-anchors
      const angle = -((rawEvent.x - rotation.lastX) + (rawEvent.y - rotation.lastY)) * 0.001 * 2 * Math.PI;
      rotation.lastX = rawEvent.x; rotation.lastY = rawEvent.y;
      if (angle) { const delta = { x: 0, y: 0, z: 0 }; delta[rotation.axis] = rotation.axis === 'y' ? -angle : angle; // X/Z positive, Y negated
        rotation.actor.fRotate(delta.x, delta.y, delta.z, e.metaKey || e.ctrlKey); playbackLoop.drawFrame(); } // cmd = aetRotF, else aetRotH
      return;
    }
    if (transformDrag) { // MVU::_MouseDrag toolResize/toolSquashStretch: brs = ±(dx+dy)*0.001 + 1
      const delta = (rawEvent.x - transformDrag.lastX) + (rawEvent.y - transformDrag.lastY);
      transformDrag.lastX = rawEvent.x; transformDrag.lastY = rawEvent.y;
      if (transformDrag.kind === 'sqsh') { const brs = 1 + -delta * 0.001; if (brs) transformDrag.actor.fPull(brs, 1 / brs, brs); } // FSquashStretchActr: no-op at brs 0
      else transformDrag.actor.fScale(1 + delta * 0.001);
      playbackLoop.drawFrame();
      return;
    }
    if (!dragSession) return;
    const [nx, ny] = viewNdc(rawEvent);
    const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, dragSession.worldPoint) : appState.sceneRenderer.groundPoint(nx, ny, dragSession.worldPoint.y);
    if (!pt) return;
    const target = { x: dragSession.start.x + pt.x - dragSession.grabPoint.x, y: dragSession.start.y + pt.y - dragSession.grabPoint.y, z: dragSession.start.z + pt.z - dragSession.grabPoint.z };
    if (appState.editorTools.ground) target.y = dragSession.start.y; // fRGround: actor stays on the ground
    dragSession.current = target;
    dragSession.actor.dxyzSubRte = { ...target }; dragSession.actor._updateXyzRte(); dragSession.actor._positionBody();
    playbackLoop.drawFrame();
  };
  const endDrag = (rawEvent) => {
    const e = rawEvent?.src;
    if (dragSession?.kind === 'tbRc') { // box move/resize: commit the rc change as one undo op
      const { textbox, rc0 } = dragSession; dragSession = null;
      const rc1 = { l: textbox.l, t: textbox.t, r: textbox.r, b: textbox.b };
      if (JSON.stringify(rc0) !== JSON.stringify(rc1)) {
        const set = (rc) => { Object.assign(textbox, rc); textbox.rtxt._layout = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
        editHistory.executeOperation({ do: () => set({ ...rc1 }), undo: () => set({ ...rc0 }) });
      }
      return;
    }
    if (dragSession?.kind === 'tbTxt') { // TBXG mouseup: paint tools apply their chp to the dragSession selection
      const { textbox, paint } = dragSession; dragSession = null;
      if (paint && appState.textboxSelection && appState.textboxSelection.anchor !== appState.textboxSelection.other) {
        const [a, b] = appState.textboxSelection.anchor < appState.textboxSelection.other ? [appState.textboxSelection.anchor, appState.textboxSelection.other] : [appState.textboxSelection.other, appState.textboxSelection.anchor];
        textboxEdits.applyTextChangeOp(textbox, a, b, textboxPaintChange(textbox, paint));
      }
      playbackLoop.drawFrame();
      return;
    }
    if (recording) {
      clearInterval(recording.lastEventTickck);
      const { actor, started, startFrame, routeBefore, eventsBefore, lastFrameBefore } = recording;
      if (started) { recording.evt(AET.Freeze, true); recording.evt(AET.Step, 0); } // FEndRecord: park the actor at the recorded tip
      recording = null;
      if (!started) return; // click without dragSession = just a selection
      const routeAfter = structuredClone(actor.data.route), eventsAfter = structuredClone(actor.data.events);
      const lastFrameAfter = appState.moviePlayer.scene.nfrmLast, endFrame = appState.moviePlayer.frame;
      const applyRoute = (route, events, lastFrame, frame) => { actor.data.route = actor.route = route; actor.data.events = actor.events = events;
        actor.nfrmCur = null; appState.moviePlayer.scene.nfrmLast = lastFrame; appState.moviePlayer.gotoFrame(Math.min(frame, lastFrame)); playbackLoop.drawFrame(); };
      editHistory.executeOperation({ do: () => applyRoute(structuredClone(routeAfter), structuredClone(eventsAfter), lastFrameAfter, endFrame),
               undo: () => applyRoute(structuredClone(routeBefore), structuredClone(eventsBefore), lastFrameBefore, startFrame) });
      return;
    }
    if (rotation) { // rotation events were merged live; commit as one undoable op
      const { actor, eventsBefore } = rotation, eventsAfter = structuredClone(actor.data.events);
      const applyEvents = (events) => { actor.data.events = actor.events = structuredClone(events); actor.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      rotation = null;
      if (JSON.stringify(eventsBefore) !== JSON.stringify(eventsAfter)) editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (transformDrag) { // squash/stretch or scale dragSession — merged Pull/Size events, one undo op
      const { actor, eventsBefore } = transformDrag, eventsAfter = structuredClone(actor.data.events);
      const applyEvents = (events) => { actor.data.events = actor.events = structuredClone(events); actor.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      transformDrag = null;
      if (JSON.stringify(eventsBefore) !== JSON.stringify(eventsAfter)) editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (pendingScrubActor) { // toolSoonerLater mouseup: undo snapshot then open the sooner/later buttons
      if (pendingScrubActor.onStage) startSoonerLater(pendingScrubActor);
      pendingScrubActor = null;
      return;
    }
    if (!dragSession) return;
    const { actor, start, current } = dragSession;
    const fShift = e?.shiftKey ?? dragSession.shift, fCmd = e ? (e.metaKey || e.ctrlKey) : dragSession.cmd;
    dragSession = null;
    if (start.x === current.x && start.y === current.y && start.z === current.z) return;
    const delta = { x: current.x - start.x, y: current.y - start.y, z: current.z - start.z };
    // MVU::_MouseDrag toolCompose (movie.cpp): cmd -> FTweakRoute (nudge at this
    // route spot only), shift -> fmafEntireSubrte (translate the Add event),
    // plain -> aetMove at the cursor = "move actor just from this frame on".
    actor.dxyzSubRte = { ...start }; actor._updateXyzRte(); // revert live preview; the op re-applies
    if (fShift) { // fmafEntireSubrte: adjust the Add event's offset directly
      const addEvent = actor.events[actor.iaevAddCur];
      if (!addEvent || addEvent.aet !== AET.Add) { actor.dxyzSubRte = { ...current }; actor._updateXyzRte(); actor._positionBody(); playbackLoop.drawFrame(); return; }
      const eventDataBefore = { ...addEvent.data };
      const applyEventData = (data, offset) => { Object.assign(addEvent.data, data); actor.dxyzSubRte = { ...offset }; actor._updateXyzRte(); actor._positionBody(); };
      editHistory.executeOperation({ do: () => applyEventData({ ...eventDataBefore, x: eventDataBefore.x + delta.x, y: eventDataBefore.y + delta.y, z: eventDataBefore.z + delta.z }, current), undo: () => applyEventData(eventDataBefore, start) });
      playbackLoop.drawFrame();
      return;
    }
    const eventsBefore = structuredClone(actor.data.events);
    const applyEvents = (events) => { actor.data.events = actor.events = structuredClone(events); actor.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
    if (fCmd) { // FTweakRoute: absolute route-local position anchored at this rtel
      const tweakPoint = { x: actor.xyz.x + delta.x, y: actor.xyz.y + delta.y, z: actor.xyz.z + delta.z };
      editHistory.executeOperation({ do: () => { actor.addDoAev(AET.Tweak, tweakPoint); playbackLoop.drawFrame(); }, undo: () => applyEvents(eventsBefore) });
    } else { // aetMove: cumulative offset event at the cursor (BUG1870 merge-add)
      editHistory.executeOperation({ do: () => { actor.addDoAev(AET.Move, delta); playbackLoop.drawFrame(); }, undo: () => applyEvents(eventsBefore) });
    }
  };
  view.onPointerUp = endDrag;
  // FCmdMouseMove: armed tools show their cursor only while hovering an actor
  // (PactrFromPt), else the default cursor. cutactor/nukscen .cur hotspots (8,10)/(11,3).
  const TOOL_CURSORS = { cut: `url(${cursorUrl('cutactor')}) 8 10, auto`, nuke: `url(${cursorUrl('nukscen')}) 11 3, auto`,
    costume: `url(${cursorUrl('costume')}) 0 6, auto`, rotx: `url(${cursorUrl('rotatex')}) 8 15, auto`,
    roty: `url(${cursorUrl('rotatey')}) 14 7, auto`, rotz: `url(${cursorUrl('rotatez')}) 10 15, auto`,
    rotnorm: `url(${cursorUrl('normaliz')}) 0 0, auto`,
    sqsh: `url(${cursorUrl('squashst')}) 7 7, auto`, size: `url(${cursorUrl('sizevenl')}) 7 8, auto`,
    sizenorm: `url(${cursorUrl('normaliz')}) 0 0, auto`,
    sooner: `url(${cursorUrl('squashst')}) 7 7, auto`, // kcrsSoonerLater shares squashst.cur in the original
    sounder: `url(${cursorUrl('cur00003')}) 7 12, auto`, looper: `url(${cursorUrl('cur00002')}) 5 10, auto`,
    matcher: `url(${cursorUrl('cur00001')}) 3 12, auto`, listener: `url(${cursorUrl('listen')}) 4 4, auto`,
    textboxPaintText: `url(${cursorUrl('fontextc')}) 0 3, auto`, textboxFont: `url(${cursorUrl('fontextc')}) 0 3, auto`,
    textboxSize: `url(${cursorUrl('fontextc')}) 0 3, auto`, textboxStyle: `url(${cursorUrl('fontextc')}) 0 3, auto`,
    textboxFill: `url(${cursorUrl('textback')}) 2 15, auto`, textboxStory: `url(${cursorUrl('textback')}) 2 15, auto`,
    textboxCredit: `url(${cursorUrl('textback')}) 2 15, auto` };
  const viewCursor = view.onPointerMove;
  view.onPointerMove = (rawEvent) => { // tool cursors first, then the dragSession machinery
    const e = rawEvent.src || rawEvent;
    const [px, py] = appState.setLastViewPoint(viewPixelPos(rawEvent));
    if (!dragSession && !recording && !rotation && !transformDrag) {
      if (appState.textboxAttachment) { view.cursor = 'none'; viewCursor(rawEvent); return; }
      const cur = TOOL_CURSORS[appState.editorTools.tool];
      if (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || (appState.editorTools.tool === 'nuke' && textboxEdits.pickTextbox(px, py))) { // tbox tools cursor per TBXG/TBXB FCmdMouseMove
        const textbox = textboxEdits.pickTextbox(px, py);
        if (!textbox) { view.cursor = appState.editorTools.tool === 'textboxSelect' ? `url(${cursorUrl('repositi')}) 8 1, auto` : (cur || ''); viewCursor(rawEvent); return; }
        if (appState.editorTools.tool === 'nuke') { view.cursor = TOOL_CURSORS.nuke; viewCursor(rawEvent); return; }
        const lx = px - textbox.l, ly = py - textbox.t, w = textbox.r - textbox.l, h = textbox.b - textbox.t;
        if (appState.editorTools.tool === 'textboxSelect') { // border anchor cursors; ibeam over the text
          if (textboxEdits.inTextboxBorder(lx, ly, w, h)) {
            const c = textboxEdits.TB_ANCHOR_CURS[textboxEdits.textboxAnchor(lx, ly, w, h)];
            view.cursor = `url(${cursorUrl(`${c}`)}) ${textboxEdits.TB_ANCHOR_HOT[c]}, auto`;
          } else view.cursor = `url(${cursorUrl('ibeam')}) 5 3, auto`;
          viewCursor(rawEvent); return;
        }
        view.cursor = cur || ''; // paint/fill/type tools show their cursor over the box
        viewCursor(rawEvent); return;
      }
      if (cur === undefined) { view.cursor = ''; viewCursor(rawEvent); return; }
      if (appState.playing) { view.cursor = ''; viewCursor(rawEvent); return; }
      const [nx, ny] = viewNdc(rawEvent);
      const a = appState.sceneRenderer.pickActor(nx, ny);
      // FCmdMouseMove: sound-attach tools need a loaded tool sound, but show their
      // cursor anywhere on the view; the listener always shows (and auditions)
      if (SOUND_TOOLS[appState.editorTools.tool]) { view.cursor = appState.editorTools.soundTag ? cur : ''; viewCursor(rawEvent); return; }
      if (appState.editorTools.tool === 'listener') {
        view.cursor = cur;
        if (a !== hoveredEarActor) { // _pactrListener hover change -> replay that side's frame appState.soundQueue
          hoveredEarActor = a || null;
          appState.soundQueue.stopAll();
          if (a && a.onStage) a.replaySnd();
          else appState.moviePlayer._replaySnd();
        }
        viewCursor(rawEvent); return;
      }
      view.cursor = a ? cur : '';
    }
    viewCursor(rawEvent);
  };
  view.onPointerLeave = () => { if (TOOL_CURSORS[appState.editorTools.tool] !== undefined || textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) view.cursor = ''; };
  document.addEventListener('pointerdown', () => { if (appState.moviePlayer) appState.moviePlayer.clk = true; }, true); // witUntilClick resume
  // TBXG text mode: while a tbox tool is armed and a box is selected, typing
  // edits the doc (keystrokes merge into one undo op via appState.textboxSnapshot)
  document.addEventListener('keydown', (e) => {
    const textbox = textboxEdits.focusedTextbox(); // keys go to the TBXG with focus — the last interior-clicked box
    if (!textbox || !appState.textboxSelection || !textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || appState.playing || modalSlot.view) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)elementById/.test((e.target as HTMLElement).tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const doc = textbox.rtxt;
    const a = Math.min(appState.textboxSelection.anchor, appState.textboxSelection.other), b = Math.max(appState.textboxSelection.anchor, appState.textboxSelection.other);
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const [x, y] = b > a ? [a, b]
        : e.key === 'Backspace' ? [Math.max(0, a - 1), a] : [a, Math.min(doc.text.length, a + 1)];
      appState.textboxSelection.other = appState.textboxSelection.anchor = textboxEdits.deleteTextboxText(textbox, x, y);
      playbackLoop.drawFrame();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (b > a) textboxEdits.deleteTextboxText(textbox, a, b);
      appState.textboxSelection.other = appState.textboxSelection.anchor = textboxEdits.insertTextboxText(textbox, a, '\r');
      playbackLoop.drawFrame();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) appState.textboxSelection.other = Math.max(0, Math.min(doc.text.length, appState.textboxSelection.other + d));
      else appState.textboxSelection.other = appState.textboxSelection.anchor = b > a ? (d < 0 ? a : b) : Math.max(0, Math.min(doc.text.length, a + d));
      playbackLoop.drawFrame();
    } else if (e.key.length === 1) {
      e.preventDefault();
      if (b > a) textboxEdits.deleteTextboxText(textbox, a, b);
      appState.textboxSelection.other = appState.textboxSelection.anchor = textboxEdits.insertTextboxText(textbox, a, e.key);
      playbackLoop.drawFrame();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (appState.textboxAttachment) { // drop the attached box at its current spot
      const { textbox, moved } = appState.textboxAttachment; appState.setTextboxAttachment(null); view.cursor = '';
      if (moved) textboxEdits.textboxOperation(textbox, () => {});
      playbackLoop.drawFrame();
      return;
    }
    if (appState.textboxSelection && appState.focusedTextboxId >= 0) { appState.setTextboxSelection({ anchor: appState.textboxSelection.other, other: appState.textboxSelection.other }); playbackLoop.drawFrame(); } // collapse sel to caret, then still disarm
    if (appState.pendingPlacement) { appState.setPendingPlacement(null); view.cursor = ''; return; }
    if (TOOL_CURSORS[appState.editorTools.tool] !== undefined || textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) { // disarm an armed tool (the original has no Esc; selecting another tool is the canonical disarm)
      textboxEdits.endTextboxSnapshot();
      appState.editorTools.tool = 'none'; view.cursor = ''; endSoonerLater(); hoveredEarActor = undefined;
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      for (const o of cameraPopupCells) o.syncFace?.();
    }
  });
  for (const [n, x, y, w, h] of STUDIO_IMGS) V.add(new ImageElement(n, x, y, w, h));
  V.add(view); // the stage blit goes under the chrome it overlaps? no — chrome is outside its rect; keep it under roll calls so thumbs stay crisp
  for (const [id, x, y, w, h] of STUDIO_TEXT_LAYOUT) { const text = new StudioText(id, x, y, w, h); V.add(text); namedElements[id] = text; }
  { // the original's EXIT strip (kidExit, quits the app) — a web page can't quit,
    // so its slot shows the app version instead
    const ver = new StudioText('stver', 584, 466, 51, 14, { size: 9, color: '#555' });
    ver.textContent = localizer.translate('ui.version', { version });
    V.add(ver);
    V.add(new TextLink(localizer.translate('ui.settings'), 470, 466, 108, 14, () => optionsDialog.show(), { size: 9, align: 'right' }));
  }
  { // the original's kidName is display-only (title comes from the saved file's
    // leaf name) — here the bar doubles as the rename field: click to edit via a
    // DOM input floated over the canvas (real text entry stays DOM until the
    // canvas gets an IME-capable input element)
    const nameEl = namedElements.stname;
    nameEl.pickable = true; nameEl.cursor = 'text';
    nameEl.onClick = () => {
      const nm = elementById('stnameInp'); if (nm) return;
      const inp = document.createElement('input');
      inp.id = 'stnameInp'; inp.className = 'stNameInp'; inp.value = appState.moviePlayer.movie.name || ''; inp.maxLength = 64;
      inp.style.cssText = 'position:absolute;left:4.6875%;top:96.66%;width:46.25%;height:3.33%;z-index:56;';
      elementById('studio').appendChild(inp);
      inp.focus(); inp.select();
      let done = false;
      const commit = (ok) => {
        if (done) return; done = true;
        if (ok && inp.value.trim()) { appState.moviePlayer.movie.name = inp.value.trim(); movieDocument.markDocumentDirty(); }
        inp.remove();
        studioHost.sync();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); e.stopPropagation(); };
      inp.onblur = () => commit(true);
      inp.onclick = (e) => e.stopPropagation();
    };
  }
  const stSliders = [];
  const nScenes = () => Math.max(1, appState.moviePlayer.movie.scenes.length - 1);
  const fSpan = () => Math.max(1, appState.moviePlayer.scene.nfrmLast - appState.moviePlayer.scene.nfrmFirst);
  const mkSlider = (x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) => {
    const s = new StudioSlider(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set);
    V.add(s.thumb); V.add(s);
    stSliders.push(s);
    return s;
  };
  mkSlider(151, 410, 89, 26, 'fthm', 151, 412, 13, 20, 'x', 151, 76,
    () => (appState.moviePlayer.scene ? (appState.moviePlayer.frame - appState.moviePlayer.scene.nfrmFirst) / fSpan() : 0),
    (f) => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst + Math.round(f * fSpan())); playbackLoop.drawFrame(); });
  mkSlider(151, 434, 89, 26, 'stmb', 151, 437, 13, 20, 'x', 151, 76,
    () => Math.max(0, appState.moviePlayer.sceneIndex) / nScenes(),
    (f) => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.max(0, Math.min(nScenes(), Math.round(f * nScenes())))); playbackLoop.drawFrame(); });
  mkSlider(331, 414, 29, 45, 'volthmb', 335, 428, 12, 6, 'y', 417, 32,
    () => 1 - appState.soundQueue.volume,
    (f) => { appState.soundQueue.setVolume(1 - f); localStorage.setItem('vol3dmm', String(appState.soundQueue.volume)); studioHost.sync(); });
  appState.soundQueue.setVolume(parseFloat(localStorage.getItem('vol3dmm') || '1'));
  (V as any)._stSliders = stSliders;
  const ACTIONS = {
    frmRWEnd: () => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst); playbackLoop.drawFrame(); },
    frmRW: () => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame - 1); playbackLoop.drawFrame(); },
    frmFW: () => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame + 1); playbackLoop.drawFrame(); },
    frmFWEnd: () => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmLast); playbackLoop.drawFrame(); },
    scnRWEnd: () => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(0); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnRW: () => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.max(0, appState.moviePlayer.sceneIndex - 1)); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnFW: () => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.min(appState.moviePlayer.movie.scenes.length - 1, appState.moviePlayer.sceneIndex + 1)); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnFWEnd: () => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(appState.moviePlayer.movie.scenes.length - 1); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    play: () => { appState.soundQueue.ensure(); playbackLoop.setPlaying(!appState.playing); },
    undo: () => { const b = namedElements.stb_undo; if (!b.enabled) return; (editHistory.mode === 'u' ? editHistory.undo : editHistory.redo)(); playbackLoop.drawFrame(); },
    cameraControls: () => toggleCameraPopup(), // kidCutCopyPaste dropdown (popups.cht)
    portal: () => togglePortalPopup(), // kidPortfolio briefcase (studio.cht)
    book: () => { const u = new URL(location.href); u.searchParams.set('mode', 'theatre'); window.open(u.href, '_blank'); },
    map: () => window.open('https://github.com/permpkin/3dmm-web', '_blank'),
  };
  for (const [id, up, dn, x, y, w, h] of STUDIO_BTNS) {
    const b = new StudioButton(up, dn, x, y, w, h, ACTIONS[id] ? () => ACTIONS[id]() : null, TIP_IDS.has(id) ? id : null);
    b.syncFace = () => { b.faceOverride = null; b.dirty(); };
    V.add(b); namedElements['stb_' + id] = b;
  }
  { // undo uses state faces (undo/undos=redo/undod), not the generic up/down pair
    const b = namedElements.stb_undo;
    b.syncFace = () => { editHistory.syncUndoButton(); b.dim = b.isDown && b.enabled; b.dirty(); };
    b.syncFace();
  }

  // --- popups ---------------------------------------------------------------
  // popup groups: elements with _pop set get outside-click-closes via the view
  (V as any).popupups = [];
  const openPopups = (V as any).popupups;

  // cut/copy/paste popup (popups.cht kidCutCopyPaste): bg rect (224,354)-(470,406),
  // cells at child-x 24/73/122/171/220 (49x52 each, absolute 248+49k). Cells are
  // radio-commands: clicking one clears the active tool (chttActor = chttNone).
  const cameraPopupBg = new Element(224, 354, 246, 52);
  cameraPopupBg.pickable = false; cameraPopupBg.visible = false;
  cameraPopupBg.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, 246, 52); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, 245, 51); };
    V.add(cameraPopupBg);
const cameraPopupCells = [];
  const cameraPopup = ({ name: 'cameraControls', elements: [cameraPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, x, tool] of ([ // pos3.chh kxpCCP* — copy/copyRoute/paste pending
    ['p3cut', 24, 'cut'],   // cidCutTool -> SetTool(toolCutObject) — arms a persistent cut tool
    ['p3copy', 73, null], ['p3cppt', 122, null], ['p3past', 171, null],
    ['p3rmac', 220, 'nuke'], // cidActorNuke -> SetTool(toolActorNuke)
  ] as [string,number,any][])) {
    const b = new StudioButton(bmp, bmp + 'c', 224 + x - 24, 354, 49, 52, null, TIP_IDS.has(bmp) ? bmp : null); // REP_MBMPREG kxpregCCP*=24
    b.visible = false; b.popup = cameraPopup;
    cameraPopupCells.push(b); cameraPopup.elements.push(b);
    if (!tool) { b.alpha = 0.35; b.enabled = false; continue; }
    b.toolId = tool; // pressed face (bmp+'c') also shows while the tool stays armed
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 'c' : ''}`; b.dirty(); };
    b.onclick = () => { // CCP cell script: clear the actor tool (chttActor=chttNone), arm ours, close
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      for (const o of cameraPopupCells) o.syncFace?.();
      setCameraPopup(false);
    };
    V.add(b);
  }
  const setCameraPopup = (open) => { // kstOpen/kstClosed on kidCCPBackground
    cameraPopupBg.visible = open;
    for (const b of cameraPopupCells) { b.visible = open; b.syncFace?.(); }
    const b = namedElements.stb_ccp; if (b) { b.classList.toggle('on', open); b.syncFace(); }
    const i = openPopups.indexOf(cameraPopup);
    if (open && i < 0) openPopups.push(cameraPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
  };
  cameraPopup.toggle = namedElements.stb_ccp;
  const toggleCameraPopup = () => setCameraPopup(!cameraPopupBg.visible);

  // portfolio popup (popups.cht kidPortsBackground): open rect (477,198)-(589,406);
  // children at child-y 52/104/156/208 with preg 52 -> 112x52 cells at y 198/250/302/354
  const portalPopupBg = new ImageElement('p1par', 477, 198, 112, 208);
  portalPopupBg.visible = false; portalPopupBg.pickable = false;
    V.add(portalPopupBg);
const portalPopupCells = [];
  const portalPopup = ({ name: 'portal', elements: [portalPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [up, dn, y, fn] of ([
    ['p1new', 'p1news', 198, () => movieDocument.newMovie()],        // kidPortsNew -> cidNew
    ['p1open', 'p1openc', 250, () => movieDocument.openMovieFile()], // kidPortsPortfolio -> cidOpen
    ['p1save', 'p1saves', 302, () => movieDocument.saveMovie()],     // kidPortsSave -> cidSave
    ['p1svas', 'p1svass', 354, () => movieDocument.saveMovie(true)], // kidPortsSaveAs -> cidSaveAs
  ] as [string,string,number,() => void][])) {
    const b = new StudioButton(up, dn, 477, y, 112, 52, () => { setPortalPopup(false); fn(); }); // child script: kstClosed, then EnqueueCid
    b.visible = false; b.popup = portalPopup;
    portalPopupCells.push(b); portalPopup.elements.push(b);
    V.add(b);
  }
  const setPortalPopup = (open) => { // kstOpen/kstClosed on kidPortsBackground
    portalPopupBg.visible = open;
    for (const b of portalPopupCells) b.visible = open;
    const b = namedElements.stb_port; if (b) { b.classList.toggle('on', open); b.syncFace(); } // ChangeStateGob(kidPortfolio, kstSelected/Default)
    const i = openPopups.indexOf(portalPopup);
    if (open && i < 0) openPopups.push(portalPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
  };
  portalPopup.toggle = namedElements.stb_port;
  const togglePortalPopup = () => setPortalPopup(!portalPopupBg.visible);
  // kchidScript2 -> Return(fTrue): popup eats keys while open
  document.addEventListener('keydown', (e) => {
    if (portalPopupBg.visible) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // rotate popup (popups.cht kidRotatePopup): p5par bg gobpos (293,271) preg (23,174)
  // -> tl (270,97) 46x176; cells child-x 46 preg (46,21) -> tl (270, 97/141/185/229) 46x44
  const rotatePopupBg = new ImageElement('p5par', 270, 97, 46, 176);
  rotatePopupBg.visible = false; rotatePopupBg.pickable = false;
    V.add(rotatePopupBg);
const rotatePopupCells = [];
  const rotatePopup = ({ name: 'rotate', elements: [rotatePopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, y, tool] of ([['p5rotx', 97, 'rotx'], ['p5roty', 141, 'roty'], ['p5rotz', 185, 'rotz'], ['p5norm', 229, 'rotnorm']] as [string,number,string][])) {
    const b = new StudioButton(bmp, bmp + 's', 270, y, 46, 44, null);
    b.visible = false; b.popup = rotatePopup;
    rotatePopupCells.push(b); rotatePopup.elements.push(b);
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsRotate, close
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      const rb = rotateToggleButton(); if (rb) { rb.classList.add('on'); rb.syncFace(); }
      for (const o of cameraPopupCells) o.syncFace?.();
      setRotatePopup(false);
    };
    V.add(b);
  }
  const rotateToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'actors')?.secBtns?.['2rot'];
  const setRotatePopup = (open) => {
    rotatePopupBg.visible = open;
    for (const b of rotatePopupCells) { b.visible = open; b.syncFace(); }
    const rb = rotateToggleButton(); if (rb && open) { rb.classList.add('on'); rb.syncFace(); }
    const i = openPopups.indexOf(rotatePopup);
    if (open && i < 0) openPopups.push(rotatePopup); else if (!open && i >= 0) openPopups.splice(i, 1);
    if (!open && rb && !ROT_AXIS[appState.editorTools.tool] && appState.editorTools.tool !== 'rotnorm') { rb.classList.remove('on'); rb.syncFace(); }
  };
  const rotOpen = () => rotatePopupBg.visible;

  // transform popup (popups.cht kidTransformBackground): p4par bg gobpos (460,227)
  // preg (23,130) -> tl (437,97) 46x132; cells p4shrk/p4sqsh/p4norm preg (0,42)
  // -> tl (437, 97/141/185) 46x44 — order per pos3.chh is Shrink, Squash, Norm
  const transitionPopupBg = new ImageElement('p4par', 437, 97, 46, 132);
  transitionPopupBg.visible = false; transitionPopupBg.pickable = false;
    V.add(transitionPopupBg);
const transitionPopupCells = [];
  const transitionPopup = ({ name: 'transition', elements: [transitionPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, y, tool] of ([['p4shrk', 97, 'size'], ['p4sqsh', 141, 'sqsh'], ['p4norm', 185, 'sizenorm']] as [string,number,string][])) {
    const b = new StudioButton(bmp, bmp + 's', 437, y, 46, 44, null);
    b.visible = false; b.popup = transitionPopup;
    transitionPopupCells.push(b); transitionPopup.elements.push(b);
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsTransform, close
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      const tb2 = transitionToggleButton(); if (tb2) { tb2.classList.add('on'); tb2.syncFace(); }
      for (const o of cameraPopupCells) o.syncFace?.();
      setTransitionPopup(false);
    };
    V.add(b);
  }
  const transitionToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'actors')?.secBtns?.['2tran'];
  const setTransitionPopup = (open) => {
    transitionPopupBg.visible = open;
    for (const b of transitionPopupCells) { b.visible = open; b.syncFace(); }
    const tb2 = transitionToggleButton(); if (tb2 && open) { tb2.classList.add('on'); tb2.syncFace(); }
    const i = openPopups.indexOf(transitionPopup);
    if (open && i < 0) openPopups.push(transitionPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
    if (!open && tb2 && !XFM_TOOL[appState.editorTools.tool] && appState.editorTools.tool !== 'sizenorm') { tb2.classList.remove('on'); tb2.syncFace(); }
  };
  const trnOpen = () => transitionPopupBg.visible;

  // sooner/later (STDIO::StartSoonerLater): floating 2sbtn/2lbtn pair at
  // (247,376)/(320,376) appears after grabbing an actor; holding a button repeats
  // FSoonerLaterActr(Nfrm-+1) per tick, accelerating (klwSLDelay 24->12 cells)
  let scrubSession = null; // {actor, eventsBefore, startFrame} — session state while the buttons are open
  const scrubSessionElements = [];
  for (const [bmp, x, direction] of ([['2sbtn', 247, -1], ['2lbtn', 320, 1]] as [string,number,number][])) {
    const b = new StudioButton(bmp, bmp + 's', x, 376, 73, 30, null);
    b.visible = false;
    let repeatTimer = null, delay = 800;
    const stop = () => { clearTimeout(repeatTimer); repeatTimer = null; delay = 800; b.classList.remove('down'); b.faceOverride = bmp; b.dirty(); };
    const tick = () => { if (!scrubSession) { stop(); return; } scrubSessionTick(direction); if (scrubSession) { delay = Math.max(400, delay - 100); repeatTimer = setTimeout(tick, delay); } }; // klwSLDelayMax->Min accel
    (b as any).onPointerDown = (p) => { // returns true: the view's track-mouse would end the session
      if (!scrubSession) { stop(); return true; }
      b.classList.add('down'); b.faceOverride = `${bmp}s`; b.dirty();
      scrubSessionTick(direction);
      repeatTimer = setTimeout(tick, delay);
      return true;
    };
    b.onPointerUp = b.onPointerLeave = stop;
    scrubSessionElements.push(b);
    V.add(b);
  }
  const startSoonerLater = (a) => {
    endSoonerLater();
    scrubSession = { actor: a, eventsBefore: structuredClone(a.data.events), startFrame: appState.moviePlayer.frame };
    for (const b of scrubSessionElements) b.visible = true;
  };
  const scrubSessionTick = (direction) => { // FCmdSooner/FCmdLater -> FSoonerLaterActr(Nfrm-+1)
    if (!scrubSession) return;
    const target = appState.moviePlayer.frame + direction;
    if (target < appState.moviePlayer.scene.nfrmFirst || target > appState.moviePlayer.scene.nfrmLast) { // FGotoFrm fails -> revert to compose
      endSoonerLater(); appState.editorTools.toolBtns?.['2comp']?.onclick(); return;
    }
    scrubSession.actor.fSoonerLater(direction);
    appState.moviePlayer.gotoFrame(target); // original seeks the scene +-1 too
    playbackLoop.drawFrame();
  };
  function endSoonerLater() { // STDIO::EndSoonerLater: close buttons; whole session is one undo op
    if (!scrubSession) return;
    const { actor, eventsBefore, startFrame } = scrubSession;
    scrubSession = null;
    for (const b of scrubSessionElements) b.visible = false;
    const eventsAfter = structuredClone(actor.data.events), endFrame = appState.moviePlayer.frame;
    if (JSON.stringify(eventsBefore) === JSON.stringify(eventsAfter) && startFrame === endFrame) return;
    const applyEvents = (events, frame) => { actor.data.events = actor.events = structuredClone(events);
      actor.data.nfrmFirst = events[0].nfrm; actor.data.nfrmLast = events[events.length - 1].nfrm;
      actor.nfrmCur = null; appState.moviePlayer.gotoFrame(frame); playbackLoop.drawFrame(); };
    editHistory.executeOperation({ do: () => applyEvents(eventsAfter, endFrame), undo: () => applyEvents(eventsBefore, startFrame) });
  }

  // --- words-tab popups ------------------------------------------------------
  // scroll-type popup (popups.cht kidScrollBackground): p7par (480,100) 46x88,
  // p7scrl (credits) -> chttTboxScroll/toolTboxCredit, p7nscr (story) -> toolTboxStory
  const scrollPopupBg = new ImageElement('p7par', 480, 100, 46, 88);
  scrollPopupBg.visible = false; scrollPopupBg.pickable = false;
    V.add(scrollPopupBg);
const scrollPopupCells = [];
  const scrollPopup = ({ name: 'scroll', elements: [scrollPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, y, tool] of ([['p7scrl', 100, 'textboxCredit'], ['p7nscr', 144, 'textboxStory']] as [string,number,string][])) {
    const b = new StudioButton(bmp, bmp + 's', 480, y, 46, 44, null);
    b.visible = false; b.popup = scrollPopup;
    scrollPopupCells.push(b); scrollPopup.elements.push(b);
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.onclick = () => { // cell script: SetTool, close the popup, keep 4scrl selected
      textboxEdits.endTextboxSnapshot();
      appState.editorTools.tool = tool;
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      const sb = scrollToggleButton(); if (sb) { sb.classList.add('on'); sb.syncFace(); }
      setScrollPopup(false); playbackLoop.drawFrame();
    };
    V.add(b);
  }
  const scrollToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'words')?.secBtns?.['4scrl'];
  const setScrollPopup = (open) => {
    scrollPopupBg.visible = open;
    for (const b of scrollPopupCells) { b.visible = open; b.syncFace(); }
    const sb = scrollToggleButton();
    if (sb) { // selected while open OR while a scroll-type tool is armed
      sb.classList.toggle('on', open || appState.editorTools.tool === 'textboxStory' || appState.editorTools.tool === 'textboxCredit');
      sb.syncFace();
    }
    const i = openPopups.indexOf(scrollPopup);
    if (open && i < 0) openPopups.push(scrollPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
  };
  // attribute popups (popdn.cht kidText* popdowns): vertical d8frm cell strips.
  // A pick stores the paint value (_acrPaint/_onnText/_dypFont/_grfontStyle) and
  // arms the tool; armed while the cursor is over a tbox applies whole-doc.
  const TEXT_POPUP_DEFS = {
    fore:  { x: 346, y: 100, w: 102, rowHeight: 22, itemsPerPage: 8, items: textboxEdits.TCTH_ISCR.map((iscr) => ({ iscr })) },
    back:  { x: 421, y: 100, w: 170, rowHeight: 22, itemsPerPage: 8, items: textboxEdits.TBTH_ISCR.map((iscr) => ({ iscr })) },
    size:  { x: 288, y: 100, w: 160, rowHeight: 40, itemsPerPage: 7, items: textboxEdits.TZTH_DYP.map((dyp) => ({ dyp })) },
    style: { x: 230, y: 100, w: 160, rowHeight: 22, itemsPerPage: 4, items: textboxEdits.TYTH_STYLES.map((s) => ({ ...s })) },
    font:  { x: 172, y: 100, w: 160, rowHeight: 22, itemsPerPage: 8, items: textboxEdits.TB_FONTS.map((name) => ({ name })) },
  };
  const TEXT_POPUP_TOOLS = { fore: 'textboxPaintText', back: 'textboxFill', size: 'textboxSize', style: 'textboxStyle', font: 'textboxFont' };
  const TEXT_POPUP_BUTTONS = { fore: '4colr', back: '4back', size: '4size', style: '4bold', font: '4font' };
  const TOOL_TEXTBOX_FACE = { textboxSelect: '4ins', textboxPaintText: '4colr', textboxFill: '4back', textboxFont: '4font', textboxSize: '4size', textboxStyle: '4bold', textboxStory: '4scrl', textboxCredit: '4scrl' };
  const syncTextboxFaces = () => {
    const w = TOOLBAR_DEFS.find((tab) => tab.id === 'words'); if (!w) return;
    for (const [bmp, b] of Object.entries<any>(w.secBtns)) { b.classList.toggle('on', TOOL_TEXTBOX_FACE[appState.editorTools.tool] === bmp); b.syncFace(); }
    for (const b of scrollPopupCells) b.syncFace();
  };
  appState.editorTools.syncTextboxFaces = syncTextboxFaces;
  const textPopup = { element: null, cells: [], kind: null, pageIndex: 0 };
  const textPopupGroup = ({ name: 'textPopup', elements: [], toggle: null } as {name:string,elements:any[],toggle:any});
  const textPopupButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'words')?.secBtns?.[TEXT_POPUP_BUTTONS[textPopup.kind]];
  function armTextboxPaint(tool) { // MVU::SetTool(lwMode<0, ptbox): FSetAcrText et al apply to the box under the cursor
    textboxEdits.endTextboxSnapshot();
    appState.editorTools.tool = tool;
    syncTextboxFaces();
    const textbox = appState.lastViewPoint ? textboxEdits.pickTextbox(appState.lastViewPoint[0], appState.lastViewPoint[1]) : null;
    const key = PAINT_CHANGES[tool];
    if (textbox && key) textboxEdits.applyTextChangeToSelection(textbox, textboxPaintChange(textbox, key));
    playbackLoop.drawFrame();
  }
  class ToolPopupCell extends Element {
    constructor(def, item, i, action) {
      super(def.x, def.y + i * def.rowHeight, item.iscr !== undefined ? 102 : def.w, def.rowHeight);
      this.item = item; this.action = action; this.hover = false; this.cursor = 'pointer';
    }
    draw(ctx) {
      const image = textureCache.image(this.hover ? 'd8frmh' : 'd8frm', () => this.dirty());
      if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
      const item = this.item;
      if (item.iscr !== undefined) { // Tcth/Tbth swatch inside the 4px frame; iscr 0 = clear
        const x0 = this.w * 0.04, x1 = this.w * 0.96, y0 = this.h * 0.18, y1 = this.h * 0.82;
        if (item.iscr === 0) { // repeating 45deg hatch #888/#ccc 2px
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
          ctx.fillStyle = '#ccc'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          ctx.strokeStyle = '#888';
          for (let d2 = -this.h; d2 < this.w + this.h; d2 += 4) { ctx.beginPath(); ctx.moveTo(x0 + d2, y1); ctx.lineTo(x0 + d2 + (y1 - y0), y0); ctx.stroke(); }
          ctx.restore();
        } else { const c = appState.sceneRenderer.palColors[item.iscr]; ctx.fillStyle = `rgb(${c.join(',')})`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      } else {
        const x0 = this.w * 0.05;
        ctx.fillStyle = '#222'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        if (item.name !== undefined) { ctx.font = `12px '${item.name}',sans-serif`; ctx.fillText(item.name, x0, this.h / 2, this.w * 0.93); }
        else if (item.dyp !== undefined) { ctx.font = `${item.dyp}px "Comic Sans MS",sans-serif`; ctx.fillText('Abcg', x0, this.h / 2, this.w * 0.93); }
        else { ctx.font = `${item.grfont & 1 ? 'bold ' : ''}${item.grfont & 2 ? 'italic ' : ''}14px "Comic Sans MS",sans-serif`; ctx.fillText('Ab', x0, this.h / 2, this.w * 0.93); }
      }
    }
    onPointerDown() { this.hover = true; this.dirty(); } // 'h' face is a press state, not hover
    onPointerUp() { this.hover = false; this.dirty(); }
    onPointerLeave() { this.hover = false; this.dirty(); }
    onClick() { this.action(this.item); }
  }
  function showTextPopup(kind) {
    if (textPopup.kind === kind) { closeTextPopup(); return; }
    closeTextPopup();
    const def = TEXT_POPUP_DEFS[kind];
    textPopup.kind = kind; textPopup.pageIndex = 0;
    const rows = Math.min(def.items.length, def.itemsPerPage);
    const el = textPopup.element = new Element(def.x, def.y, def.w, rows * def.rowHeight + (def.items.length > def.itemsPerPage ? 21 : 0));
    el.pickable = false;
    el.draw = (ctx) => { ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, el.w, el.h); };
    el.popup = textPopupGroup;
    textPopupGroup.elements.push(el);
    V.add(el);
    const b0 = textPopupButton(); if (b0) { b0.classList.add('on'); b0.syncFace(); }
    if (!openPopups.includes(textPopupGroup)) openPopups.push(textPopupGroup);
    buildTextPopupCells();
  }
  function buildTextPopupCells() {
    for (const b of textPopup.cells) V.remove(b);
    textPopup.cells = [];
    textPopupGroup.elements = textPopup.element ? [textPopup.element] : [];
    const def = TEXT_POPUP_DEFS[textPopup.kind];
    def.items.slice(textPopup.pageIndex * def.itemsPerPage, textPopup.pageIndex * def.itemsPerPage + def.itemsPerPage).forEach((item, i) => {
      const b = new ToolPopupCell(def, item, i, textPopupPick);
      b.popup = textPopupGroup;
      V.add(b);
      textPopup.cells.push(b); textPopupGroup.elements.push(b);
    });
    const pages = Math.ceil(def.items.length / def.itemsPerPage);
    if (pages > 1) { // bottom-strip d8dn/d8up page arrows
      for (const [bmp, dn] of ([['d8dn', 1], ['d8up', -1]] as [string,number][])) {
        const b = new StudioButton(bmp, bmp + 's', def.x + (dn > 0 ? 0 : def.w / 2), def.y + def.itemsPerPage * def.rowHeight, def.w / 2, 21,
          () => { textPopup.pageIndex = Math.max(0, Math.min(textPopup.pageIndex + dn, pages - 1)); buildTextPopupCells(); });
        b.popup = textPopupGroup;
        V.add(b);
        textPopup.cells.push(b); textPopupGroup.elements.push(b);
      }
    }
  }
  function textPopupPick(item) { // cidTextSet*/cidTextBkgdColor: store the value, arm the tool
    const kind = textPopup.kind;
    if (kind === 'fore' || kind === 'back') appState.textboxPaint.acr = item.iscr === 0 ? -1 : ((0xfe000000 | item.iscr) | 0);
    else if (kind === 'size') appState.textboxPaint.dyp = item.dyp;
    else if (kind === 'style') appState.textboxPaint.grfont = (appState.textboxPaint.grfont & ~item.mask) | (item.grfont & item.mask);
    else if (kind === 'font') appState.textboxPaint.font = item.name;
    closeTextPopup();
    armTextboxPaint(TEXT_POPUP_TOOLS[kind]);
  }
  function closeTextPopup() {
    if (!textPopup.element) return;
    V.remove(textPopup.element); textPopup.element = null;
    for (const b of textPopup.cells) V.remove(b);
    textPopup.cells = []; textPopup.kind = null;
    textPopupGroup.elements = [];
    const i = openPopups.indexOf(textPopupGroup); if (i >= 0) openPopups.splice(i, 1);
    const w = TOOLBAR_DEFS.find((tab) => tab.id === 'words');
    if (w) for (const bmp of ['4font', '4bold', '4size', '4colr', '4back']) {
      const b = w.secBtns[bmp];
      if (b && TOOL_TEXTBOX_FACE[appState.editorTools.tool] !== bmp) { b.classList.remove('on'); b.syncFace(); }
    }
  }

  // roll calls (browser.cht kidRollCallActor/Prop; pos3.chh)
  // cells at (list.x,98+i*74), thumb inside at (2,2) 38x70, page arrows at y=394
  class RollCallCell extends Element {
    constructor(list, i) {
      super(list.x, 98 + i * 74, 42, 74);
      this.list = list; this.i = i; this.cursor = 'pointer';
    }
    draw(ctx) {
      const list = this.list, acts = thumbnails.rollCallActors(list), a = acts[list.offset + this.i];
      const st = !a ? '' : list.offset + this.i === list.selected ? 's' : 'e';
      if (st) {
        const image = textureCache.image(`${list.cellPrefix}${this.i + 1}${st}`, () => this.dirty());
        if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
        ctx.drawImage(thumbnails.rollCallThumbFor(a.data.tagTmpl?.cno, a), 2, 2, 38, 70);
      }
    }
    onClick() { const a = thumbnails.rollCallActors(this.list)[this.list.offset + this.i]; if (a) { this.list.selected = this.list.offset + this.i; appState.setSelectedChildId(movieEdits.childIdOf(a)); studioHost.syncRollCall(); playbackLoop.drawFrame(); } }
  }
  class RollCallArrow extends Element {
    constructor(list, img, x, w, scroll) {
      super(x, 394, w, 17);
      this.img = img; this.scroll = scroll; this.cursor = 'pointer'; this.list = list;
      this.enabled = false; this._dn = false;
    }
    draw(ctx) {
      const image = textureCache.image(`${this.img}${this.enabled ? (this._dn ? 'c' : '') : 'd'}`, () => this.dirty());
      if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
    }
    onPointerDown() { if (this.enabled) { this._dn = true; this.dirty(); } }
    onPointerUp() { this._dn = false; this.dirty(); }
    onPointerLeave() { this._dn = false; this.dirty(); }
    onClick() { if (this.enabled) { this.scroll(); this.list.selected = -1; studioHost.syncRollCall(); } }
  }
  for (const list of thumbnails.rollCallLists) {
    list.cells = []; list.arrows = [];
    for (let i = 0; i < 4; i++) {
      const cell = new RollCallCell(list, i);
      cell.list = list;
      V.add(cell);
      list.cells.push(cell);
    }
    const up = new RollCallArrow(list, list.upFace, list.x, 21, () => list.offset--);
    const dn = new RollCallArrow(list, list.downFace, list.x + 20, 20, () => list.offset++);
    up.list = dn.list = list;
    V.add(up); V.add(dn);
    list.arrows.push(up, dn);
  }

  // --- top tool bar ----------------------------------------------------------
  // studio.cht covers (covr1-4) at y0-43 sit over per-section 62x40 insert buttons
  // (y1-41); opening a cover flips it away (transparent rep) revealing them.
  // sectools.cht secondary rows: Npar strip at (0,47) + tool buttons inside it.
  // Exactly one cover open at a time (kidBackground->idPriOpen).
  const TOOLBAR_DEFS: any[] = [ // [bmp, x, w?, action?] — actions 'scene'/'actor'/'prop' open a browser
    { id: 'scenes', cov: 'covr1', cx: 0,   row: '1par', def: null, door: 5, dx: 375,
      ins: [['1back', 18, 'bkgd']],
      sec: [['1view', 199, 0, 'cam'], ['p3rmbk', 256, 0, () => soundEdits.sceneChop(false)],
            ['p3rmfw', 315, 0, () => soundEdits.sceneChop(true)], ['1scen', 390, 0, () => SorterEasel.show()]] },
    { id: 'actors', cov: 'covr2', cx: 100, row: '2par', def: '2comp', door: 6, dx: 374,
      ins: [['2actr', 114, 'actor'], ['2prop', 180, 'prop'], ['2splt', 246, () => SpletterEasel.show(null)]],
      sec: [['2comp', 41], ['2acts', 98, 0, undefined, ['2act01', '2act02', '2act03', '2act04', '2act05', '2act06']],
            ['2cont', 155], ['2cost', 211], ['2rot', 268, 50, () => setRotatePopup(!rotOpen())],
            ['2xy', 325, 36, 'tog:xy'], ['2zero', 392, 36, 'tog:ground'], ['2tran', 435, 50, () => setTransitionPopup(!trnOpen())],
            ['2soon', 492], ['2bio', 549, 50, () => talentBook.show()]] },
    { id: 'appState.soundQueue', cov: 'covr3', cx: 323, row: '3par', def: '3ear', door: 7, dx: 354,
      ins: [['3horn', 334, 'fx'], ['3mike', 400, 'speech'], ['3note', 466, 'music']],
      sec: [['3sing', 176], ['3loop', 234], ['3ear', 292], ['3rpt', 370], ['1note', 428, 36, 'tog:pause']] },
    { id: 'words',  cov: 'covr4', cx: 543, row: '4par', def: '4ins', door: 8, dx: 403,
      ins: [['4new', 560, () => WordsDialog.show()]],
      sec: [['4ins', 112], ['4font', 170, 0, () => showTextPopup('font')], ['4bold', 228, 0, () => showTextPopup('style')],
            ['4size', 286, 0, () => showTextPopup('size')], ['4colr', 344, 0, () => showTextPopup('fore')],
            ['4back', 419, 0, () => showTextPopup('back')], ['4scrl', 477, 0, () => setScrollPopup(!scrollPopupBg.visible)]] },
  ];
  const TB_DOWN = { p3rmbk: 'p3rmbkc', p3rmfw: 'p3rmfwc', '2cost': '2costc', '2acts': '2acts' }; // non-'s' down bmps
  const animBtns = []; // buttons whose default face is a cycling REP_ANIM cell sequence
  setInterval(() => { for (const b of animBtns) { // advance unselected animated tool faces
    if (b.isOn || b.isDown) continue;
    b.animIndex = (b.animIndex + 1) % b.animFaces.length; b.syncFace();
  } }, 160);
  const makeToolbarButton = (up, x, y, w, h, onclick) => {
    const dn = TB_DOWN[up] || up + 's';
    const b = new StudioButton(up, dn, x, y, w, h, onclick, TIP_IDS.has(up) ? up : null);
    b.syncFace = () => { b.faceOverride = null; b.dirty(); };
    return b;
  };
  for (const tab of TOOLBAR_DEFS) {
    // insert buttons — created first so the cover image can cover them
    tab.insBtns = tab.ins.map(([bmp, x, act]) => {
      const b = makeToolbarButton(bmp, x, 1, 62, 40, // string act -> book browser; fn -> its own surface (words dlg / spletter easel)
        typeof act === 'function' ? act : act ? () => AssetBrowserView.show(act) : () => {});
      V.add(b);
      return b;
    });
    // secondary tool row (Npar bg at y47 + buttons at abs coords, children of rowEl)
    tab.rowEl = new Element(0, 0, UI_WIDTH, UI_HEIGHT);
    tab.rowEl.pickable = false; tab.rowEl.visible = false;
    V.add(tab.rowEl);
    tab.rowEl.add(new ImageElement(tab.row, 0, 47, 640, 51));
    tab.secBtns = {};
    for (const [bmp, x, w, act, anim] of (tab.sec as any[])) { // act: 'tog:key' toggle | string = browser | fn = command | none = radio tool; anim = cycling default-face cells
      const b = makeToolbarButton(bmp, x, 48, w || 50, 48, null);
      if (anim) { // REP_ANIM default state (e.g. kidActorsActionBrowser: 2act01-06); on/down face is bmp
        b.animFaces = anim; b.animIndex = 0;
        b.syncFace = () => { b.faceOverride = b.isOn || b.isDown ? bmp : b.animFaces[b.animIndex]; b.dirty(); };
        b.syncFace(); animBtns.push(b);
      }
      if (typeof act === 'string' && act.startsWith('tog:')) {
        if (act === 'tog:pause') { // kidPausesSound: open/closed faces by fpseDown, not a tool
          b.syncFace = () => { b.faceOverride = appState.editorTools.pauseSound ? '1notes' : '1note';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => soundEdits.editPause(!appState.editorTools.pauseSound);
        } else {
          const key = act.slice(4); // faces per sectools.cht: xy on='2xys'/XZ off='2xy'; ground on='2zero'/off='2zeros'
          b.syncFace = () => { const on = appState.editorTools[key];
            b.faceOverride = on === (key === 'ground') ? bmp : bmp + 's';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => { appState.editorTools[key] = !appState.editorTools[key]; b.syncFace(); };
        }
        b.syncFace();
      } else if (typeof act === 'string') b.onclick = () => AssetBrowserView.show(act);
      else if (typeof act === 'function') b.onclick = () => { act(); playbackLoop.drawFrame(); };
      else b.onclick = () => { textboxEdits.endTextboxSnapshot(); for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
        b.classList.add('on'); b.syncFace();
        appState.editorTools.tool = { '2comp': 'compose', '2cont': 'record', '2acts': 'action', '2cost': 'costume', '2soon': 'sooner',
          '3sing': 'sounder', '3loop': 'looper', '3rpt': 'matcher', '3ear': 'listener', '4ins': 'textboxSelect' }[bmp] || 'none';
        for (const o of cameraPopupCells) o.syncFace?.(); setRotatePopup(false); setTransitionPopup(false); setScrollPopup(false); closeTextPopup(); endSoonerLater(); hoveredEarActor = undefined; view.cursor = ''; }; // picking a tool disarms armed tools/popups
      tab.rowEl.add(b);
      tab.secBtns[bmp] = b;
      if (!act) (appState.editorTools.toolBtns ||= {})[bmp] = b; // programmatic tool select (e.g. action apply arms 2cont)
    }
    if (tab.def) { tab.secBtns[tab.def].classList.add('on'); }
    // doors (sectools.cht kidDoors): a door bitmap covers the row's tail until clicked;
    // fAll*Doors persists for the session — opening the doors reveals the whole row
    tab.doorEl = new ImageElement('', 0, 47, 640, 51);
    tab.doorEl.pickable = false;
    tab.rowEl.add(tab.doorEl);
    tab.doorZone = new StudioButton('', '', tab.dx, 47, 640 - tab.dx, 51, null); // invisible zone
    tab.doorZone.draw = () => {}; // transparent — just hit area
    tab.rowEl.add(tab.doorZone);
    const paintDoor = () => {
      tab.doorEl.name = `door${tab.all ? tab.door - 4 : tab.door}`; // door5-8 -> door1-4
      tab.doorEl.dirty();
      tab.doorZone.visible = !tab.all;
    };
    tab.doorZone.onclick = () => { if (!appState.moviePlayer?.scene) return; tab.all = true; paintDoor(); }; // doors stay shut until tools are enabled
    paintDoor(); tab.paintDoor = paintDoor;
    // cover tab — on top of the insert buttons; open = hidden (covr*o is transparent)
    tab.covEl = new ImageElement(`${tab.cov}c`, tab.cx, 0, tab.cov === 'covr1' ? 99 : tab.cov === 'covr2' ? 223 : tab.cov === 'covr3' ? 220 : 98, 43);
    tab.covEl.pickable = true; tab.covEl.cursor = 'pointer';
    V.add(tab.covEl);
    tab.covEl.onClick = () => { if (!tab.locked) setCover(tab.id); }; // kstDisabled face is inert
  }
  function setCover(id) { // exactly one cover open — the others stay covered
    for (const tab of TOOLBAR_DEFS) { tab.covEl.visible = tab.id !== id; tab.rowEl.visible = tab.id === id; }
    // original: cover-open CreateChildGob's the secondary-tools background, whose
    // CREATE script arms the tab's default tool — scenes=chttNone(toolDefault),
    // actors=compose, appState.soundQueue=listener, words=textboxMove — so every tab switch
    // exits text mode; you can never get stuck in an armed tbox tool
    closeTextPopup(); setScrollPopup(false); setRotatePopup(false); setTransitionPopup(false); endSoonerLater(); hoveredEarActor = undefined;
    const tab = TOOLBAR_DEFS.find((t) => t.id === id);
    if (tab?.def) appState.editorTools.toolBtns?.[tab.def]?.onclick();
    else { // chttNone -> toolDefault: nil tool, no face selected
      textboxEdits.endTextboxSnapshot(); appState.editorTools.tool = 'none'; view.cursor = '';
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secBtns || {})) { o.classList.remove('on'); o.syncFace?.(); }
      for (const o of cameraPopupCells) o.syncFace?.();
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
  for (const [bmp, x, y, w, h] of ([['door0', 0, 47, 640, 51], ['covr5c', 0, 410, 362, 56], ['covr7c', 364, 410, 110, 56]] as [string,number,number,number,number][])) { // kidDoors kstDefault face (door0.bmp) + gob pos + preg -> drawn rects
    const image = new ImageElement(bmp, x, y, w, h);
    image.visible = false; image.pickable = false;
    V.add(image);
    stripLids.push(image);
  }
  appState.editorTools.syncToolState = () => {
    const noScene = !appState.moviePlayer?.scene;
    for (const image of stripLids) { image.visible = noScene; image.dirty(); }
    for (const tab of TOOLBAR_DEFS) {
      if (tab.id === 'scenes') continue;
      tab.locked = noScene;
      tab.covEl.name = `${tab.cov}${noScene ? 'd' : 'c'}`;
      tab.covEl.cursor = noScene ? 'default' : 'pointer';
      tab.covEl.dirty();
    }
    if (noScene) {
      for (const tab of TOOLBAR_DEFS) { tab.all = false; tab.paintDoor(); tab.rowEl.visible = false; } // kidDoors -> kstDefault; no secondary row while tools are locked
      setCover('scenes'); // resets the armed tool too (chttNone)
      TOOLBAR_DEFS[0].rowEl.visible = false; // settings cover stays open but its tool row stays hidden
    } else { // kchidEnableSceneTools: restore the open cover's row + open its doors
      const open = TOOLBAR_DEFS.find((tab) => !tab.covEl.visible);
      if (open) { open.rowEl.visible = true; if (!open.all) { open.all = true; open.paintDoor(); } }
    }
    V.invalidate();
  };
  appState.editorTools.openCover = setCover;
  rotatePopup.toggle = rotateToggleButton(); transitionPopup.toggle = transitionToggleButton(); scrollPopup.toggle = scrollToggleButton(); // toggles need the built TOOLBAR_DEFS bar
  // outside-click closes popups — view-level catch-all (was document pointerdown)
  V.onPointerDown = (rawEvent) => {
    const hit = V.hitTest(rawEvent.x, rawEvent.y);
    for (const popup of [...openPopups]) {
      if (hit && (popup.elements.includes(hit) || hit === popup.toggle)) continue;
      ({ cameraControls: () => setCameraPopup(false), portal: () => setPortalPopup(false), rotate: () => setRotatePopup(false),
        transition: () => setTransitionPopup(false), scroll: () => setScrollPopup(false), textPopup: () => closeTextPopup() })[popup.name]?.();
    }
    if (scrubSession && !scrubSessionElements.includes(hit)) { endSoonerLater(); appState.editorTools.toolBtns?.['2comp']?.onclick(); }
  };
  setCover('scenes');

  // --- store→render wiring ---------------------------------------------------
  // Selectors repaint just the affected elements instead of relying on callers
  // remembering to sync chrome (interface-overhaul Phase 2/4). StudioView lives
  // for the whole session — no unsubscribe needed.
  useUiState.subscribe((s) => s.playing, (p) => {
    const pb = namedElements.stb_play; if (pb) { pb.classList.toggle('on', p); pb.syncFace?.(); }
  });
  useEditState.subscribe((s) => s.selectedChildId, () => {
    studioHost.syncRollCall(); // key-dedup'd — repaints only on real change
  });
  }
}
class StudioHost { // owns the mounted StudioView + chrome sync
  view: StudioView | null = null;
  elementById = (id) => this.view?.namedElements?.[id];
  initialize = () => { this.view = new StudioView(); };
  sync = () => { // reflect appState.moviePlayer state into the studio bar (called from updateUi)
  if (!this.view?.children.length) return;
  const namedElements = this.view.namedElements;
  namedElements.stfnum.textContent = appState.moviePlayer.scene ? appState.moviePlayer.frame - appState.moviePlayer.scene.nfrmFirst + 1 : '–';
  namedElements.stsnum.textContent = appState.moviePlayer.sceneIndex >= 0 ? appState.moviePlayer.sceneIndex + 1 : '–';
  const nm = namedElements.stname;
  if (!elementById('stnameInp')) nm.textContent = appState.moviePlayer.movie.name || localizer.translate('doc.untitled');
  for (const s of (this.view as any)._stSliders || []) s.sync();
  { // SSCB::SetSndFrame — the frame thumb shows the speaker face (fthms) while a
    // sound event lands exactly on the current frame (SEVT.PlaySnd or actor Snd)
    let sound = false;
    if (appState.moviePlayer.scene && appState.moviePlayer.frame !== null) {
      for (const e of appState.moviePlayer.scene.frameEvents || []) if (e.nfrm === appState.moviePlayer.frame && e.sevt === SEVT.PlaySnd) { sound = true; break; }
      if (!sound) for (const a of appState.moviePlayer.actors.values())
        for (const ev of a.events || []) if (ev.nfrm === appState.moviePlayer.frame && ev.aet === AET.Snd) { sound = true; break; }
    }
    const fth = (this.view as any)._stSliders?.[0]?.thumb;
    if (fth && fth.name !== `fthm${sound ? 's' : ''}`) { fth.name = `fthm${sound ? 's' : ''}`; fth.dirty(); }
  }
  this.syncRollCall();
  };
  syncRollCall = () => { // actor + prop roll calls: 4 cells each + page arrows (scrolls 1/click, no wrap)
  for (const list of thumbnails.rollCallLists) {
    const acts = thumbnails.rollCallActors(list);
    list.offset = Math.max(0, Math.min(list.offset, Math.max(0, acts.length - 4)));
    if (list.selected >= acts.length) list.selected = -1;
    const key = `${appState.moviePlayer?.sceneIndex}|${list.offset}|${list.selected}|${acts.map((a) => a.data.arid).join(',')}`;
    if (key === list.syncKey) continue;
    list.syncKey = key;
    for (const cell of list.cells) cell.dirty();
    list.arrows[0].enabled = acts.length > 4 && list.offset > 0;
    list.arrows[1].enabled = acts.length > 4 && list.offset < acts.length - 4;
    for (const ar of list.arrows) ar.dirty();
  }
  movieEdits.syncSelectionBox();
  };
}
export const studioHost = new StudioHost();
