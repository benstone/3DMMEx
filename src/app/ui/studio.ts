import { SEVT, AET } from '../../format/movie.ts';
import { textboxEdits } from '../edit/textboxEdits.ts';
import { appState, useUiState, useEditState } from '../appState.ts';
import { elementById } from '../resources.ts';
import { CURSORS, cur } from './cursorManager.ts';
import { uiSounds } from './uiSounds.ts';
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
import { OptionsEasel } from './optionsEasel.ts';
import { streamer } from '../stream.ts';
import { ListenerEasel, ActionBrowser, SpletterEasel, CostumeEasel, SorterEasel, WordsDialog } from './easels.ts';
import { localizer } from '../localization.ts';
import { View, uiRoot, UI_WIDTH, UI_HEIGHT } from './root.ts';
import { Element } from './element.ts';
import { ImageElement, StudioButton, TextLink, MovieScreen } from './widgets.ts';
import { textureCache } from './textureCache.ts';
// Studio editor chrome — the 640x480 editor frame (backdrops, transport bar,
// tab covers, secondary tool rows, popups, roll calls) surrounding the 3D view.
// All coordinates are fixed positions matching the original editor layout.
export const STUDIO_IMGS = ([ // [texture, x, y, w, h] in logical 640x480 space
  ['back1', 0, 0, 640, 100], ['back2', 0, 97, 48, 314], ['back3', 592, 97, 48, 313], ['back4', 0, 406, 640, 74],
  ['vsld', 331, 414, 29, 45], ['name', 28, 464, 300, 16],
] as [string,number,number,number,number][]);
// Studio element ids that carry a tooltip — each maps to 'tip.<id>' in lang/*.json.
export const TIP_IDS = new Set([
  'frmRWEnd', 'frmRW', 'frmFW', 'frmFWEnd', 'scnRWEnd', 'scnRW', 'scnFW', 'scnFWEnd', 'play', 'undo', 'ccp', 'port', 'book', 'map', '1back', '1view', 'p3rmbk', 'p3rmfw', '1scen', '2actr', '2prop', '2splt', '2comp', '2cont', '2acts', '2cost', '2rot', '2xy', '2zero', '2tran', '2soon', '2bio', '3horn', '3mike', '3note', '3sing', '3loop', '3ear', '3rpt', '1note', '4new', '4ins', '4font', '4bold', '4size', '4colr', '4back', '4scrl', 'p3cut', 'p3copy', 'p3cppt', 'p3past', 'p3rmac']);

export const STUDIO_BTNS = ([ // [id, upFace, downFace, x, y, w, h] — the bottom transport/chrome strip
  ['frmRWEnd', 'frwe', 'frwes', 108, 414, 22, 17], ['frmRW', 'frw', 'frws', 130, 414, 22, 17],
  ['frmFW', 'ffw', 'ffws', 240, 414, 22, 17], ['frmFWEnd', 'ffwe', 'ffwes', 262, 414, 22, 17],
  ['scnRWEnd', 'srwe', 'srwes', 108, 439, 22, 17], ['scnRW', 'srw', 'srws', 130, 439, 22, 17],
  ['scnFW', 'sfw', 'sfws', 240, 439, 22, 17], ['scnFWEnd', 'sfwe', 'sfwes', 262, 439, 22, 17],
  ['play', 'play', 'plays', 301, 414, 26, 45],
  ['undo', 'undo', 'undos', 371, 411, 49, 52], ['ccp', 'ccp', 'ccps', 424, 411, 49, 52],
  ['port', 'port', 'ports', 481, 411, 49, 52], ['book', 'book', 'bookc', 534, 411, 49, 52],
  ['map', 'map', 'mapc', 587, 411, 49, 52],
] as [string,string,string,number,number,number,number][]);
export const STUDIO_TEXT_LAYOUT = ([ // [id, x, y, w, h] — text fields drawn over the baked chrome
  ['stfnum', 56, 413, 40, 18], ['stsnum', 56, 440, 40, 17], ['stname', 30, 464, 296, 16],
] as [string,number,number,number,number][]);

/** Text field drawn on the studio chrome (frame/scene counters, movie name). */
class StudioText extends Element {
  constructor(id, x, y, w, h, { size = 13, color = '#333', align = 'center' } = {}) {
    super(x, y, w, h);
    this.id = id; this.text = ''; this.size = size; this.color = color; this.align = align;
    this.pickable = false;
  }
  /** Set the text (DOM-style alias for .text) — repaints on change. */
  set textContent(v) { if (v !== this.text) { this.text = v; this.dirty(); } }
  /** The field's text. */
  get textContent() { return this.text; }
  /** Paint the field text. */
  draw(ctx) {
    if (!this.text) return;
    ctx.fillStyle = this.color;
    ctx.font = `bold ${this.size}px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = this.align; ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.w / 2, this.h / 2, this.w - 2);
  }
}

/** Track slider with a separate thumb element — used for frame, scene, and volume.
 *  `get()`/`set(fraction)` connect it to the underlying state; `sync()` repositions the thumb. */
class StudioSlider extends Element {
  constructor(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) {
    super(x, y, w, h);
    this.axis = axis; this.min = min; this.span = span; this.get = get; this.set = set;
    this.thumb = new ImageElement(img, tx, ty, tw, th); this.thumb.pickable = false;
    this.tx = tx; this.ty = ty;
  }
  /** Reposition the thumb along the track from the current `get()` value. */
  sync() {
    const p = this.min + this.get() * this.span;
    if (this.axis === 'x') this.thumb.x = p; else this.thumb.y = p;
    this.thumb.dirty();
  }
  /** Start the drag and set from the pointer. */
  onPointerDown(p) { this._drag = true; this._move(p); }
  /** Track the drag. */
  onPointerMove(p) { if (this._drag) this._move(p); }
  /** End the drag. */
  onPointerUp() { this._drag = false; }
  /** Cancel the drag when the pointer slides off. */
  onPointerLeave() { this._drag = false; }
  /** Map a view-space point to the 0..1 value and push it through `set`. */
  _move(p) {
    const v = this.axis === 'x' ? p.x : p.y;
    this.set(Math.max(0, Math.min(1, (v - this.min) / this.span)));
  }
}

/** The 3D stage — a MovieScreen blit that also owns the editor's pointer handling. */
class View3D extends MovieScreen {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = true; }
}

/** The editor's root view: stage, bottom chrome, tab covers/tool rows, popups,
 *  and roll calls. Mounted under the view stack for the whole session — easels
 *  and browsers draw over it in the shared modal slot. Instantiated once via
 *  `studioHost.initialize()`. */
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
  const PAINT_CHANGES = { textboxPaintText: 'fore', textboxFont: 'font', textboxSize: 'dyp', textboxStyle: 'grfont' }; // armed paint tool -> the change a text-selection drag applies
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
    // Any click not on the sooner/later buttons closes the session,
    // re-arms the compose tool, and the click then proceeds normally
    if (scrubSession) { endSoonerLater(); appState.editorTools.toolButtons?.['2comp']?.onclick(); }
    const [px, py] = appState.setLastViewPoint(viewPixelPos(rawEvent));
    if (appState.textboxAttachment) { // a new textbox attached to the mouse is dropped where this click lands
      const { textbox, moved } = appState.textboxAttachment; appState.setTextboxAttachment(null); view.cursor = null;
      if (moved) textboxEdits.textboxOperation(textbox, () => {}); // commit the mouse-tracked rect as one undo op
      playbackLoop.drawFrame();
      return;
    }
    textboxEdits.endTextboxSnapshot(); // any view click commits the pending text-edit burst
    const textboxHit = textboxEdits.pickTextbox(px, py);
    if (textboxHit && (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || appState.editorTools.tool === 'nuke')) { // textbox tools claim clicks that land on a box
      const lx = px - textboxHit.l, ly = py - textboxHit.t, w = textboxHit.r - textboxHit.l, h = textboxHit.b - textboxHit.t;
      if (appState.editorTools.tool === 'nuke') { uiSounds.play('remwbox'); textboxEdits.removeTextbox(textboxHit); return; } // nuke deletes the clicked box outright
      if (textboxEdits.inTextboxBorder(lx, ly, w, h)) { // border band: select + start a move/resize drag (works for every tool)
        if ((appState.editorTools.tool === 'textboxStory' || appState.editorTools.tool === 'textboxCredit') && appState.selectedTextboxId !== textboxEdits.textboxIdOf(textboxHit)) { // scroll-type tools only accept the already-selected box
          textboxEdits.setSelectedTextbox(-1); playbackLoop.drawFrame(); return; // deselect instead
        }
        textboxEdits.setSelectedTextbox(textboxEdits.textboxIdOf(textboxHit)); appState.setSelectedChildId(-1);
        for (const list of thumbnails.rollCallLists) list.selected = -1;
        dragSession = { kind: 'textboxResize', textbox: textboxHit, anchor: textboxEdits.textboxAnchor(lx, ly, w, h), originalBounds: { l: textboxHit.l, t: textboxHit.t, r: textboxHit.r, b: textboxHit.b }, grabX: px, grabY: py };
        playbackLoop.drawFrame();
        return;
      }
      // interior click: fill/type tools apply to the clicked box; the rest focus it and start a caret/selection drag
      if (appState.editorTools.tool === 'textboxFill') { textboxEdits.textboxOperation(textboxHit, () => { textboxHit.rtxt.acrBack = appState.textboxPaint.acr; textboxHit.rtxt._layout = null; }); return; } // apply armed fill color
      if (appState.editorTools.tool === 'textboxStory' || appState.editorTools.tool === 'textboxCredit') { const fs = appState.editorTools.tool === 'textboxStory'; textboxEdits.textboxOperation(textboxHit, () => { textboxHit.fStory = fs; }); return; } // set scroll type on any box, selected or not
      textboxEdits.setFocusedTextbox(textboxEdits.textboxIdOf(textboxHit)); appState.setSelectedChildId(-1);
      const cp = hitTestTextbox(textboxHit, appState.sceneRenderer.ovCtx, appState.sceneRenderer.palColors, px, py); // interior: caret + text selection dragSession
      appState.setTextboxSelection({ anchor: cp, other: cp });
      dragSession = { kind: 'textboxEdit', textbox: textboxHit, paint: PAINT_CHANGES[appState.editorTools.tool] || null };
      playbackLoop.drawFrame();
      return;
    }
    if (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) { // text mode skips actor picking entirely: a miss just deselects the box
      if (appState.selectedTextboxId >= 0) { textboxEdits.setSelectedTextbox(-1); playbackLoop.drawFrame(); }
      return;
    }
    const [nx, ny] = viewNdc(rawEvent);
    if (appState.pendingPlacement) {
      const p = appState.sceneRenderer.groundPoint(nx, ny, 0);
      if (p) (appState.pendingPlacement.tdt ? movieEdits.insert3dText : movieEdits.placeActor)(appState.pendingPlacement.tdt ?? appState.pendingPlacement, { x: p.x, y: 0, z: p.z });
      appState.setPendingPlacement(null); view.cursor = null; playbackLoop.drawFrame();
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
    if (SOUND_TOOLS[appState.editorTools.tool]) { // sound-attach tools:
      const toolSound = appState.editorTools.tool === 'looper' ? 'sloop' : appState.editorTools.tool === 'matcher' ? 'sact' : 'splay';
      if (!a) {                 // no actor under the cursor -> scene sound; hit -> actor sound
        if (appState.editorTools.tool === 'matcher') { if (appState.editorTools.soundTag) console.warn('[sound] motion-match needs an actor'); }
        else if (appState.editorTools.soundTag) { uiSounds.play(toolSound); soundEdits.addBackgroundSound(appState.editorTools.tool === 'looper', e.metaKey || e.ctrlKey); } // cmd/ctrl queues instead of replacing
      } else if (a.onStage && appState.editorTools.soundTag) { uiSounds.play(toolSound); soundEdits.addActorSound(a, appState.editorTools.tool === 'looper', e.metaKey || e.ctrlKey, appState.editorTools.tool === 'matcher'); }
      return;
    }
    if (appState.editorTools.tool === 'listener') { ListenerEasel.show(a || null); return; } // listener opens its easel on click
    if (!a || !a.onStage) return;
    if (appState.editorTools.tool === 'action') { ActionBrowser.show(); return; } // action tool opens the action browser on click
    if (appState.editorTools.tool === 'costume') { (a.template.isTdt ? SpletterEasel.show : CostumeEasel.show)(a); return; } // 3D-text actors get the spletter, others the costume easel
    if (appState.editorTools.tool === 'cut') { uiSounds.play('cut'); movieEdits.cutSelectedActor(e.shiftKey); return; } // shift cuts all of the actor's subroutes
    if (appState.editorTools.tool === 'nuke') { uiSounds.play('remactr'); movieEdits.nukeSelectedActor(); return; }         // remove the actor entirely
    if (appState.editorTools.tool === 'rotnorm') { // normalize-rotation tool: undoable event rewrite
      uiSounds.play('cbackr');
      const eventsBefore = structuredClone(a.data.events);
      a.fNormalizeRot();
      const eventsAfter = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(eventsBefore); // rewind; the undo op's do() does the real apply
      const applyEvents = (events) => { a.data.events = a.events = structuredClone(events); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);
      editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (ROT_AXIS[appState.editorTools.tool]) { // rotate tools start a drag-rotation session on the clicked actor
      uiSounds.loop('rotate'); // the rotate drone loops until the drag ends
      rotation = { actor: a, lastX: rawEvent.x, lastY: rawEvent.y, axis: ROT_AXIS[appState.editorTools.tool], eventsBefore: structuredClone(a.data.events) };
      return;
    }
    if (appState.editorTools.tool === 'sizenorm') { // normalize-size tool: undoable event rewrite
      uiSounds.play('cbacks');
      const eventsBefore = structuredClone(a.data.events);
      a.fNormalizeSize();
      const eventsAfter = structuredClone(a.data.events);
      a.data.events = a.events = structuredClone(eventsBefore); // rewind; executeOperation.do does the real apply
      const applyEvents = (events) => { a.data.events = a.events = structuredClone(events); a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);
      editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (XFM_TOOL[appState.editorTools.tool]) { // squash/stretch and resize start a transform drag on the clicked actor
      transformDrag = { actor: a, lastX: rawEvent.x, lastY: rawEvent.y, kind: XFM_TOOL[appState.editorTools.tool], lastSound: 0, eventsBefore: structuredClone(a.data.events) };
      return;
    }
    if (appState.editorTools.tool === 'sooner') { // sooner/later: press grabs the actor; the scrub buttons appear on release
      uiSounds.play('sfreeze');
      pendingScrubActor = a;
      return;
    }
    if (appState.editorTools.tool !== 'compose' && appState.editorTools.tool !== 'record') return;
    uiSounds.play('select'); // grabbing an actor with the select/move tool
    const wp = { x: a.xyz.x + a.dxyzRte.x, y: a.xyz.y + a.dxyzRte.y, z: a.xyz.z + a.dxyzRte.z };
    const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, wp) : appState.sceneRenderer.groundPoint(nx, ny, wp.y);
    if (!pt) return;
    if (appState.editorTools.tool === 'record') { // route-recording tool: mousedown begins a record session
      playbackLoop.setPlaying(false); // recording drives the clock itself
      recording = { actor: a, worldPoint: wp, grabPoint: { x: pt.x, y: pt.y, z: pt.z }, current: { ...wp }, startOffset: { ...a.dxyzRte },
        started: false, ticks: 0, lastEventTick: 0, rawDelta: { x: 0, y: 0, z: 0 }, frozen: e.shiftKey, // shift records a frozen (unanimated) route
        startFrame: appState.moviePlayer.frame, routeBefore: structuredClone(a.data.route), eventsBefore: structuredClone(a.data.events), lastFrameBefore: appState.moviePlayer.scene.nfrmLast } as any;
      const evt = (aet, data) => a.addDoAev(aet, data); // insert an action event at the record cursor and execute it
      const begin = () => { // recording starts by asserting the actor's current action,
        a.setActionCore(a.anid, a.celn, recording.frozen);     // then truncates the route at the cursor
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
      recording.timer = setInterval(() => { // one recording tick per frame
        recording.ticks++;
        if (!recording.started) return;
        uiSounds.play('recframe'); // the recording metronome ticks once per advanced frame
        const s = appState.moviePlayer.scene, last = a.route[a.rtel.irpt]; // record tip — NOT route end (tail subroute may follow)
        const curl = { x: recording.current.x - recording.startOffset.x, y: recording.current.y - recording.startOffset.y, z: recording.current.z - recording.startOffset.z }; // route-local cursor
        const dl = { x: curl.x - last.x, y: curl.y - last.y, z: curl.z - last.z }; // cumulative displacement to cursor (dxrWld)
        const d = { x: (recording.rawDelta.x + 2 * dl.x) / 3, y: (recording.rawDelta.y + 2 * dl.y) / 3, z: (recording.rawDelta.z + 2 * dl.z) / 3 }; // smoothed
        recording.rawDelta = dl;
        if (a.frozen !== recording.frozen) evt(AET.Freeze, recording.frozen); // unfreeze while recording so cels cycle
        const dwrCur = Math.max(0.5, a._celDwr(a.anid, a.celn) * a.xfrm.scaleStep); // one recorded route step, cel-scaled
        const dwrMouse = Math.hypot(d.x, d.y, d.z);
        if (dwrMouse < dwrCur) { // pause: frames only advance after ~5 ticks held
          if (recording.ticks - recording.lastEventTick < 5) return;
          if (a.dwrStep !== 0) evt(AET.Step, 0); // step length zero = paused in place
        } else {
          if (a.dwrStep !== DWR_NIL) evt(AET.Step, DWR_NIL); // resume at template step
          const k = dwrCur / dwrMouse; // truncate to exactly one step distance; excess is dropped
          const np = { x: last.x + d.x * k, y: last.y + d.y * k, z: last.z + d.z * k };
          if (appState.editorTools.ground && last.y + a.dxyzRte.y >= 0 && np.y + a.dxyzRte.y < 0) np.y = -a.dxyzRte.y; // ground-on: the recorded point can't dip below the floor
          last.dwr = dwrCur;
          a.route.splice(a.rtel.irpt + 1, 0, { ...np, dwr: 0 }); // insert after tip, before retained tail
          const irptIns = a.rtel.irpt + 1; // shift event route references past the inserted point
          for (const e2 of a.events) {
            if (e2.rtel.irpt >= irptIns) e2.rtel.irpt++;
            else if (e2.rtel.irpt === irptIns - 1 && irptIns < a.route.length - 1 && e2.rtel.dwrOffset >= dwrCur) { e2.rtel.dwrOffset -= dwrCur; e2.rtel.irpt++; }
          }
          recording.lastEventTick = recording.ticks;
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
    if (dragSession?.kind === 'textboxResize') { // box move/resize: update per anchor, clamped to the stage
      const { textbox, anchor, originalBounds, grabX, grabY } = dragSession, [px, py] = appState.lastViewPoint;
      const dx = px - grabX, dy = py - grabY, rc0 = originalBounds;
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
    if (dragSession?.kind === 'textboxEdit') { // caret drag: extend the text selection to the cursor position
      const [px, py] = appState.lastViewPoint;
      appState.textboxSelection.other = hitTestTextbox(dragSession.textbox, appState.sceneRenderer.ovCtx, appState.sceneRenderer.palColors, px, py);
      playbackLoop.drawFrame();
      return;
    }
    if (recording) {
      const [nx, ny] = viewNdc(rawEvent);
      const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, recording.worldPoint) : appState.sceneRenderer.groundPoint(nx, ny, recording.worldPoint.y);
      if (!pt) return;
      recording.current = { x: recording.worldPoint.x + pt.x - recording.grabPoint.x, y: recording.worldPoint.y + pt.y - recording.grabPoint.y, z: recording.worldPoint.z + pt.z - recording.grabPoint.z };
      if (!recording.started) { // recording arms after ~2 units of movement or ~5 ticks held
        const distance = Math.hypot(recording.current.x - recording.worldPoint.x, recording.current.y - recording.worldPoint.y, recording.current.z - recording.worldPoint.z);
        if (distance >= 2 || recording.ticks >= 5) { recording.started = true; recording.begin(); }
      }
      return;
    }
    if (rotation) { // rotate drag: combined x+y pixel delta drives the axis angle
      const angle = -((rawEvent.x - rotation.lastX) + (rawEvent.y - rotation.lastY)) * 0.001 * 2 * Math.PI;
      rotation.lastX = rawEvent.x; rotation.lastY = rawEvent.y;
      if (angle) { const delta = { x: 0, y: 0, z: 0 }; delta[rotation.axis] = rotation.axis === 'y' ? -angle : angle; // X/Z positive, Y negated
        rotation.actor.fRotate(delta.x, delta.y, delta.z, e.metaKey || e.ctrlKey); playbackLoop.drawFrame(); } // cmd = free rotate, else heading-relative
      return;
    }
    if (transformDrag) { // squash/stretch or resize drag: scale factor = 1 + (dx+dy)*0.001
      const delta = (rawEvent.x - transformDrag.lastX) + (rawEvent.y - transformDrag.lastY);
      transformDrag.lastX = rawEvent.x; transformDrag.lastY = rawEvent.y;
      if (delta && performance.now() - transformDrag.lastSound > 150) { // rate-limited grow/shrink/squash/stretch chirps
        transformDrag.lastSound = performance.now();
        uiSounds.play(transformDrag.kind === 'sqsh' ? (delta < 0 ? 'squash' : 'stretch') : (delta > 0 ? 'grow' : 'shrink'));
      }
      if (transformDrag.kind === 'sqsh') { const brs = 1 + -delta * 0.001; if (brs) transformDrag.actor.fPull(brs, 1 / brs, brs); } // squash: no-op at factor 0
      else transformDrag.actor.fScale(1 + delta * 0.001);
      playbackLoop.drawFrame();
      return;
    }
    if (!dragSession) return;
    const [nx, ny] = viewNdc(rawEvent);
    const pt = appState.editorTools.xy ? appState.sceneRenderer.viewPlanePoint(nx, ny, dragSession.worldPoint) : appState.sceneRenderer.groundPoint(nx, ny, dragSession.worldPoint.y);
    if (!pt) return;
    const target = { x: dragSession.start.x + pt.x - dragSession.grabPoint.x, y: dragSession.start.y + pt.y - dragSession.grabPoint.y, z: dragSession.start.z + pt.z - dragSession.grabPoint.z };
    if (appState.editorTools.ground) target.y = dragSession.start.y; // ground-on: the actor stays on the floor
    dragSession.current = target;
    dragSession.actor.dxyzSubRte = { ...target }; dragSession.actor._updateXyzRte(); dragSession.actor._positionBody();
    playbackLoop.drawFrame();
  };
  const endDrag = (rawEvent) => {
    const e = rawEvent?.src;
    if (dragSession?.kind === 'textboxResize') { // box move/resize: commit the rc change as one undo op
      const { textbox, originalBounds: rc0 } = dragSession; dragSession = null;
      const rc1 = { l: textbox.l, t: textbox.t, r: textbox.r, b: textbox.b };
      if (JSON.stringify(rc0) !== JSON.stringify(rc1)) {
        const set = (rc) => { Object.assign(textbox, rc); textbox.rtxt._layout = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
        editHistory.executeOperation({ do: () => set({ ...rc1 }), undo: () => set({ ...rc0 }) });
      }
      return;
    }
    if (dragSession?.kind === 'textboxEdit') { // mouseup: paint tools apply their change to the dragged selection
      const { textbox, paint } = dragSession; dragSession = null;
      if (paint && appState.textboxSelection && appState.textboxSelection.anchor !== appState.textboxSelection.other) {
        const [a, b] = appState.textboxSelection.anchor < appState.textboxSelection.other ? [appState.textboxSelection.anchor, appState.textboxSelection.other] : [appState.textboxSelection.other, appState.textboxSelection.anchor];
        textboxEdits.applyTextChangeOp(textbox, a, b, textboxPaintChange(textbox, paint));
      }
      playbackLoop.drawFrame();
      return;
    }
    if (recording) {
      clearInterval(recording.timer);
      const { actor, started, startFrame, routeBefore, eventsBefore, lastFrameBefore } = recording;
      if (started) { recording.evt(AET.Freeze, true); recording.evt(AET.Step, 0); } // park the actor at the recorded route tip
      recording = null;
      if (!started) return; // click without a drag = just a selection
      const routeAfter = structuredClone(actor.data.route), eventsAfter = structuredClone(actor.data.events);
      const lastFrameAfter = appState.moviePlayer.scene.nfrmLast, endFrame = appState.moviePlayer.frame;
      const applyRoute = (route, events, lastFrame, frame) => { actor.data.route = actor.route = route; actor.data.events = actor.events = events;
        actor.nfrmCur = null; appState.moviePlayer.scene.nfrmLast = lastFrame; appState.moviePlayer.gotoFrame(Math.min(frame, lastFrame)); playbackLoop.drawFrame(); };
      editHistory.executeOperation({ do: () => applyRoute(structuredClone(routeAfter), structuredClone(eventsAfter), lastFrameAfter, endFrame),
               undo: () => applyRoute(structuredClone(routeBefore), structuredClone(eventsBefore), lastFrameBefore, startFrame) });
      return;
    }
    if (rotation) { // rotation events were merged live; commit as one undoable op
      uiSounds.stop(); // end the rotate drone
      const { actor, eventsBefore } = rotation, eventsAfter = structuredClone(actor.data.events);
      const applyEvents = (events) => { actor.data.events = actor.events = structuredClone(events); actor.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      rotation = null;
      if (JSON.stringify(eventsBefore) !== JSON.stringify(eventsAfter)) editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (transformDrag) { // squash/stretch or scale drag — merged Pull/Size events, one undo op
      const { actor, eventsBefore } = transformDrag, eventsAfter = structuredClone(actor.data.events);
      const applyEvents = (events) => { actor.data.events = actor.events = structuredClone(events); actor.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      transformDrag = null;
      if (JSON.stringify(eventsBefore) !== JSON.stringify(eventsAfter)) editHistory.executeOperation({ do: () => applyEvents(eventsAfter), undo: () => applyEvents(eventsBefore) });
      return;
    }
    if (pendingScrubActor) { // sooner/later grab released: snapshot for undo, then show the scrub buttons
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
    uiSounds.play(fShift ? 'moveall' : fCmd ? 'move1' : 'move'); // subroute / tweak / plain move
    // Compose-drag commit: cmd anchors a Tweak event at this route spot only,
    // shift translates the subroute's Add event, plain inserts a cumulative Move
    // at the cursor — "move the actor just from this frame on".
    actor.dxyzSubRte = { ...start }; actor._updateXyzRte(); // revert live preview; the op re-applies
    if (fShift) { // shift: translate the whole subroute via its Add event
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
    if (fCmd) { // cmd: absolute route-local position anchored at the current route spot
      const tweakPoint = { x: actor.xyz.x + delta.x, y: actor.xyz.y + delta.y, z: actor.xyz.z + delta.z };
      editHistory.executeOperation({ do: () => { actor.addDoAev(AET.Tweak, tweakPoint); playbackLoop.drawFrame(); }, undo: () => applyEvents(eventsBefore) });
    } else { // plain: cumulative offset event at the cursor
      editHistory.executeOperation({ do: () => { actor.addDoAev(AET.Move, delta); playbackLoop.drawFrame(); }, undo: () => applyEvents(eventsBefore) });
    }
  };
  view.onPointerUp = endDrag;
  // Armed tools show their cursor only while hovering an actor; the cut and
  // nuke cursors have fixed (8,10)/(11,3) hotspots baked into their .cur art.
  const TOOL_CURSORS = { cut: cur('cutactor', 8, 10), nuke: cur('nukscen', 11, 3),
    costume: cur('costume', 0, 6), rotx: cur('rotatex', 8, 15),
    roty: cur('rotatey', 14, 7), rotz: cur('rotatez', 10, 15),
    rotnorm: cur('normaliz'),
    action: cur('actions2', 0, 5), // the action browser's wand
    sqsh: cur('squashst', 7, 7), size: cur('sizevenl', 7, 8),
    sizenorm: cur('normaliz'),
    sooner: cur('squashst', 7, 7), // sooner/later reuses the squash/stretch cursor art
    compose: cur('repositi', 8, 1), record: cur('repositi', 8, 1), // select/move + route recording
    sounder: cur('cur00003', 7, 12), looper: cur('cur00002', 5, 10),
    matcher: cur('cur00001', 3, 12), listener: cur('listen', 4, 4),
    textboxSelect: cur('repositi', 8, 1),
    textboxPaintText: cur('fontextc', 0, 3), textboxFont: cur('fontextc', 0, 3),
    textboxSize: cur('fontextc', 0, 3), textboxStyle: cur('fontextc', 0, 3),
    textboxFill: cur('textback', 2, 15), textboxStory: cur('textback', 2, 15),
    textboxCredit: cur('textback', 2, 15) };
  const viewCursor = view.onPointerMove;
  view.onPointerMove = (rawEvent) => { // tool cursors first, then the dragSession machinery
    const e = rawEvent.src || rawEvent;
    const [px, py] = appState.setLastViewPoint(viewPixelPos(rawEvent));
    if (!dragSession && !recording && !rotation && !transformDrag) {
      if (appState.textboxAttachment) { view.cursor = CURSORS.textboxCreate; viewCursor(rawEvent); return; }
      const cur = TOOL_CURSORS[appState.editorTools.tool];
      if (textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || (appState.editorTools.tool === 'nuke' && textboxEdits.pickTextbox(px, py))) { // textbox tools pick their cursor by hover position
        const textbox = textboxEdits.pickTextbox(px, py);
        if (!textbox) { view.cursor = appState.editorTools.tool === 'textboxSelect' ? TOOL_CURSORS.textboxSelect : (cur ?? null); viewCursor(rawEvent); return; }
        if (appState.editorTools.tool === 'nuke') { view.cursor = TOOL_CURSORS.nuke; viewCursor(rawEvent); return; }
        const lx = px - textbox.l, ly = py - textbox.t, w = textbox.r - textbox.l, h = textbox.b - textbox.t;
        if (appState.editorTools.tool === 'textboxSelect') { // border anchor cursors; ibeam over the text
          if (textboxEdits.inTextboxBorder(lx, ly, w, h)) {
            view.cursor = textboxEdits.TEXTBOX_ANCHOR_CURSORS[textboxEdits.textboxAnchor(lx, ly, w, h)];
          } else view.cursor = CURSORS.ibeam;
          viewCursor(rawEvent); return;
        }
        view.cursor = cur ?? null; // paint/fill/scroll tools show their cursor over the box
        viewCursor(rawEvent); return;
      }
      if (cur === undefined) { view.cursor = null; viewCursor(rawEvent); return; }
      if (appState.playing) { view.cursor = null; viewCursor(rawEvent); return; }
      const [nx, ny] = viewNdc(rawEvent);
      const a = appState.sceneRenderer.pickActor(nx, ny);
      // Sound-attach tools show their cursor anywhere on the view once a tool
      // sound is loaded; the listener always shows (and auditions on hover)
      if (SOUND_TOOLS[appState.editorTools.tool]) { view.cursor = appState.editorTools.soundTag ? cur : null; viewCursor(rawEvent); return; }
      if (appState.editorTools.tool === 'listener') {
        view.cursor = cur;
        if (a !== hoveredEarActor) { // hover changed actor -> audition that side's frame sounds
          hoveredEarActor = a || null;
          appState.soundQueue.stopAll();
          if (a && a.onStage) a.replaySnd();
          else appState.moviePlayer._replaySnd();
        }
        viewCursor(rawEvent); return;
      }
      view.cursor = a ? cur : null;
    }
    viewCursor(rawEvent);
  };
  /** Pointer left the stage — clear any armed-tool cursor (a live session
   *  keeps its own cursor until pointerup). */
  view.onPointerLeave = () => { if (TOOL_CURSORS[appState.editorTools.tool] !== undefined || textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) view.cursor = null; };
  /** First user click anywhere marks the player as user-interacted, which lets
   *  sound playback resume (browsers gate audio behind a gesture). */
  document.addEventListener('pointerdown', () => { if (appState.moviePlayer) appState.moviePlayer.clk = true; }, true);
  /** Text-editing key handler — while a textbox tool is armed and a box has
   *  focus, typing edits the box's text (keystrokes merge into one undo op via
   *  the textbox snapshot). */
  document.addEventListener('keydown', (e) => {
    const textbox = textboxEdits.focusedTextbox(); // keys go to the focused box — the last interior-clicked one
    if (!textbox || !appState.textboxSelection || !textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool] || appState.playing || modalSlot.view) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return;
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
  /** Escape key: drops a mouse-attached textbox, collapses a text selection,
   *  cancels a pending placement, or disarms the current tool. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (appState.textboxAttachment) { // drop the mouse-attached box at its current spot
      const { textbox, moved } = appState.textboxAttachment; appState.setTextboxAttachment(null); view.cursor = null;
      if (moved) textboxEdits.textboxOperation(textbox, () => {});
      playbackLoop.drawFrame();
      return;
    }
    if (appState.textboxSelection && appState.focusedTextboxId >= 0) { appState.setTextboxSelection({ anchor: appState.textboxSelection.other, other: appState.textboxSelection.other }); playbackLoop.drawFrame(); } // collapse to a caret before disarming
    if (appState.pendingPlacement) { appState.setPendingPlacement(null); view.cursor = null; return; }
    if (TOOL_CURSORS[appState.editorTools.tool] !== undefined || textboxEdits.TEXTBOX_TOOLS[appState.editorTools.tool]) { // disarm an armed tool — selecting another tool is the other way out
      textboxEdits.endTextboxSnapshot();
      appState.editorTools.tool = 'none'; view.cursor = null; endSoonerLater(); hoveredEarActor = undefined;
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      for (const o of cameraPopupCells) o.syncFace?.();
    }
  });
  for (const [n, x, y, w, h] of STUDIO_IMGS) V.add(new ImageElement(n, x, y, w, h));
  V.add(view); // stage blit stays under the roll calls so their thumbs draw over it
  for (const [id, x, y, w, h] of STUDIO_TEXT_LAYOUT) { const text = new StudioText(id, x, y, w, h); V.add(text); namedElements[id] = text; }
  { // the exit strip slot — a web page can't quit, so it shows the app
    // version plus a settings link instead
    const ver = new StudioText('stver', 584, 466, 51, 14, { size: 9, color: '#555' });
    ver.textContent = localizer.translate('ui.version', { version });
    V.add(ver);
    V.add(new TextLink(localizer.translate('ui.settings'), 470, 466, 108, 14, () => OptionsEasel.show(), { size: 9, align: 'right' }));
  }
  { // the movie-name field doubles as the rename control — clicking swaps in a
    // DOM input floated over the canvas (real text entry stays DOM until the
    // canvas gets an IME-capable input element)
    const nameEl = namedElements.stname;
    nameEl.pickable = true; nameEl.cursor = CURSORS.ibeam;
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
  /** Denominator for the scene-scrub slider: last scene index, clamped to 1. */
  const lastSceneIndex = () => Math.max(1, appState.moviePlayer.movie.scenes.length - 1);
  /** Denominator for the frame-scrub slider: frame span of the current scene, clamped to 1. */
  const frameSpan = () => Math.max(1, appState.moviePlayer.scene.nfrmLast - appState.moviePlayer.scene.nfrmFirst);
  /** Create a chrome slider (track rect + thumb), add it to the view, and register it for sync. */
  const makeSlider = (x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) => {
    const s = new StudioSlider(x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set);
    V.add(s.thumb); V.add(s);
    stSliders.push(s);
    return s;
  };
  makeSlider(151, 410, 89, 26, 'fthm', 151, 412, 13, 20, 'x', 151, 76,
    () => (appState.moviePlayer.scene ? (appState.moviePlayer.frame - appState.moviePlayer.scene.nfrmFirst) / frameSpan() : 0),
    (f) => { if (!appState.moviePlayer.scene) return; playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst + Math.round(f * frameSpan())); playbackLoop.drawFrame(); });
  makeSlider(151, 434, 89, 26, 'stmb', 151, 437, 13, 20, 'x', 151, 76,
    () => Math.max(0, appState.moviePlayer.sceneIndex) / lastSceneIndex(),
    (f) => { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.max(0, Math.min(lastSceneIndex(), Math.round(f * lastSceneIndex())))); playbackLoop.drawFrame(); });
  makeSlider(331, 414, 29, 45, 'volthmb', 335, 428, 12, 6, 'y', 417, 32,
    () => 1 - appState.soundQueue.volume,
    (f) => { appState.soundQueue.setVolume(1 - f); localStorage.setItem('vol3dmm', String(appState.soundQueue.volume)); studioHost.sync(); });
  appState.soundQueue.setVolume(parseFloat(localStorage.getItem('vol3dmm') || '1'));
  (V as any)._stSliders = stSliders;
  const ACTIONS = {
    frmRWEnd: () => { if (!appState.moviePlayer.scene) return; uiSounds.play('gofrstf'); playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst); playbackLoop.drawFrame(); },
    frmRW: () => { if (!appState.moviePlayer.scene) return; uiSounds.play('goprevf'); playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame - 1); playbackLoop.drawFrame(); },
    frmFW: () => { if (!appState.moviePlayer.scene) return; uiSounds.play('gonextf'); playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame + 1); playbackLoop.drawFrame(); },
    frmFWEnd: () => { if (!appState.moviePlayer.scene) return; uiSounds.play('golastf'); playbackLoop.setPlaying(false); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmLast); playbackLoop.drawFrame(); },
    scnRWEnd: () => { uiSounds.play('gofrsts'); playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(0); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnRW: () => { uiSounds.play('goprevs'); playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.max(0, appState.moviePlayer.sceneIndex - 1)); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnFW: () => { uiSounds.play('gonexts'); playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.min(appState.moviePlayer.movie.scenes.length - 1, appState.moviePlayer.sceneIndex + 1)); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    scnFWEnd: () => { uiSounds.play('golasts'); playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(appState.moviePlayer.movie.scenes.length - 1); appState.setSelectedTextboxId(-1); appState.setFocusedTextboxId(-1); appState.setTextboxSelection(null); appState.setTextboxAttachment(null); appState.textboxSelections.clear(); playbackLoop.drawFrame(); },
    play: () => { appState.soundQueue.ensure(); uiSounds.play(appState.playing ? 'stop' : 'play'); playbackLoop.setPlaying(!appState.playing); },
    undo: () => { const b = namedElements.stb_undo; if (!b.enabled) return; uiSounds.play(editHistory.mode === 'u' ? 'undo' : 'redo'); (editHistory.mode === 'u' ? editHistory.undo : editHistory.redo)(); playbackLoop.drawFrame(); },
    ccp: () => toggleCameraPopup(),
    port: () => togglePortalPopup(),
    book: () => streamer.pick(),
    map: () => { uiSounds.play('sectool'); window.open('https://github.com/permpkin/3dmm-web', '_blank'); },
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
  // Popup groups registered on the view get outside-click dismissal: a pointer
  // down outside any of a group's elements closes it.
  (V as any).openPopups = [];
  const openPopups = (V as any).openPopups;

  // Cut/copy/paste popup — a 246x52 strip at (224,354) with five 49x52 cells.
  // The tool cells are radio-style: clicking one clears other tools and arms it.
  const cameraPopupBg = new Element(224, 354, 246, 52);
  cameraPopupBg.pickable = false; cameraPopupBg.visible = false;
  cameraPopupBg.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, 246, 52); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, 245, 51); };
    V.add(cameraPopupBg);
const cameraPopupCells = [];
  const cameraPopup = ({ name: 'cameraControls', elements: [cameraPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, x, tool] of ([ // cut/copy/copy-route/paste/nuke cells — copy-route & paste unimplemented
    ['p3cut', 24, 'cut'],   // arms a persistent cut tool
    ['p3copy', 73, null], ['p3cppt', 122, null], ['p3past', 171, null],
    ['p3rmac', 220, 'nuke'], // arms the nuke tool
  ] as [string,number,any][])) {
    const b = new StudioButton(bmp, bmp + 'c', 224 + x - 24, 354, 49, 52, null, TIP_IDS.has(bmp) ? bmp : null); // cells are positioned on a 24px grid offset
    b.visible = false; b.popup = cameraPopup;
    cameraPopupCells.push(b); cameraPopup.elements.push(b);
    if (!tool) { b.alpha = 0.35; b.enabled = false; V.add(b); continue; } // unimplemented cells show dimmed
    b.toolId = tool; // pressed face (bmp+'c') also shows while the tool stays armed
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 'c' : ''}`; b.dirty(); };
    b.clickSound = 'sectool';
    b.onclick = () => { // cell click: clear any armed actor tool, arm ours, close the popup
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      for (const o of cameraPopupCells) o.syncFace?.();
      setCameraPopup(false);
    };
    V.add(b);
  }
  /** Show or hide the cut/copy/paste popup, syncing its toggle button face and
   *  the outside-click dismissal list. */
  const setCameraPopup = (open) => {
    if (open && !cameraPopupBg.visible) uiSounds.play('dropdn'); // the popup drop-down sound
    cameraPopupBg.visible = open;
    for (const b of cameraPopupCells) { b.visible = open; b.syncFace?.(); }
    const b = namedElements.stb_ccp; if (b) { b.classList.toggle('on', open); b.syncFace(); }
    const i = openPopups.indexOf(cameraPopup);
    if (open && i < 0) openPopups.push(cameraPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
  };
  cameraPopup.toggle = namedElements.stb_ccp;
  /** Toggle the cut/copy/paste popup (the bottom chrome "ccp" button). */
  const toggleCameraPopup = () => setCameraPopup(!cameraPopupBg.visible);

  // Portfolio popup — a 112x208 drop-down at (477,198) with four 112x52
  // cells: new / open / save / save-as.
  const portalPopupBg = new ImageElement('p1par', 477, 198, 112, 208);
  portalPopupBg.visible = false; portalPopupBg.pickable = false;
    V.add(portalPopupBg);
const portalPopupCells = [];
  const portalPopup = ({ name: 'portal', elements: [portalPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [up, dn, y, snd, fn] of ([
    ['p1new', 'p1news', 198, 'fnew', () => movieDocument.newMovie()],        // new movie
    ['p1open', 'p1openc', 250, 'pfopen', () => movieDocument.openMovieFile()], // open movie file
    ['p1save', 'p1saves', 302, 'fsave', () => movieDocument.saveMovie()],     // save movie
    ['p1svas', 'p1svass', 354, 'fsaveas', () => movieDocument.saveMovie(true)], // save movie as
  ] as [string,string,number,string,() => void][])) {
    const b = new StudioButton(up, dn, 477, y, 112, 52, () => { setPortalPopup(false); fn(); }); // close the popup, then run the command
    b.clickSound = snd;
    b.visible = false; b.popup = portalPopup;
    portalPopupCells.push(b); portalPopup.elements.push(b);
    V.add(b);
  }
  /** Show or hide the portfolio popup, syncing the briefcase button face. */
  const setPortalPopup = (open) => {
    if (open && !portalPopupBg.visible) uiSounds.play('dropdn');
    portalPopupBg.visible = open;
    for (const b of portalPopupCells) b.visible = open;
    const b = namedElements.stb_port; if (b) { b.classList.toggle('on', open); b.syncFace(); } // selected face while open
    const i = openPopups.indexOf(portalPopup);
    if (open && i < 0) openPopups.push(portalPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
  };
  portalPopup.toggle = namedElements.stb_port;
  const togglePortalPopup = () => setPortalPopup(!portalPopupBg.visible);
  // The open portfolio popup eats keys — no other key handling while it's up.
  document.addEventListener('keydown', (e) => {
    if (portalPopupBg.visible) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Rotate popup — a 46x176 strip at (270,97) with four 46x44 cells
  // (rotate X/Y/Z + normalize), stacked vertically.
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
    b.clickSound = 'sectool';
    b.onclick = () => { // cell click: deselect the old tool, arm ours, select the rotate toggle, close
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      const rb = rotateToggleButton(); if (rb) { rb.classList.add('on'); rb.syncFace(); }
      for (const o of cameraPopupCells) o.syncFace?.();
      setRotatePopup(false);
    };
    V.add(b);
  }
  /** The '2rot' toolbar button that toggles the rotate popup. */
  const rotateToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'actors')?.secondaryButtons?.['2rot'];
  /** Show or hide the rotate popup, syncing the toggle's selected face. */
  const setRotatePopup = (open) => {
    if (open && !rotatePopupBg.visible) uiSounds.play('dropdn');
    rotatePopupBg.visible = open;
    for (const b of rotatePopupCells) { b.visible = open; b.syncFace(); }
    const rb = rotateToggleButton(); if (rb && open) { rb.classList.add('on'); rb.syncFace(); }
    const i = openPopups.indexOf(rotatePopup);
    if (open && i < 0) openPopups.push(rotatePopup); else if (!open && i >= 0) openPopups.splice(i, 1);
    if (!open && rb && !ROT_AXIS[appState.editorTools.tool] && appState.editorTools.tool !== 'rotnorm') { rb.classList.remove('on'); rb.syncFace(); }
  };
  /** Whether the rotate popup is currently open. */
  const isRotatePopupOpen = () => rotatePopupBg.visible;

  // Transform popup — a 46x132 strip at (437,97) with three 46x44 cells
  // (resize, squash/stretch, normalize).
  // cell order: resize, squash/stretch, normalize
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
    b.clickSound = 'sectool';
    b.onclick = () => { // cell click: deselect the old tool, arm ours, select the transform toggle, close
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      appState.editorTools.tool = tool;
      const tb2 = transitionToggleButton(); if (tb2) { tb2.classList.add('on'); tb2.syncFace(); }
      for (const o of cameraPopupCells) o.syncFace?.();
      setTransitionPopup(false);
    };
    V.add(b);
  }
  /** The '2tran' toolbar button that toggles the transform popup. */
  const transitionToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'actors')?.secondaryButtons?.['2tran'];
  /** Show or hide the transform popup, syncing the toggle's selected face. */
  const setTransitionPopup = (open) => {
    if (open && !transitionPopupBg.visible) uiSounds.play('dropdn');
    transitionPopupBg.visible = open;
    for (const b of transitionPopupCells) { b.visible = open; b.syncFace(); }
    const tb2 = transitionToggleButton(); if (tb2 && open) { tb2.classList.add('on'); tb2.syncFace(); }
    const i = openPopups.indexOf(transitionPopup);
    if (open && i < 0) openPopups.push(transitionPopup); else if (!open && i >= 0) openPopups.splice(i, 1);
    if (!open && tb2 && !XFM_TOOL[appState.editorTools.tool] && appState.editorTools.tool !== 'sizenorm') { tb2.classList.remove('on'); tb2.syncFace(); }
  };
  /** Whether the transform popup is currently open. */
  const isTransitionPopupOpen = () => transitionPopupBg.visible;

  // Sooner/later — a floating earlier/later button pair at (247,376)/(320,376)
  // that appears after grabbing an actor with the sooner tool. Holding a button
  // shifts the actor's events one frame per repeat, accelerating as it repeats.
  let scrubSession = null; // {actor, eventsBefore, startFrame} — session state while the buttons are open
  const scrubSessionElements = [];
  for (const [bmp, x, direction] of ([['2sbtn', 247, -1], ['2lbtn', 320, 1]] as [string,number,number][])) {
    const b = new StudioButton(bmp, bmp + 's', x, 376, 73, 30, null);
    b.visible = false;
    let repeatTimer = null, delay = 800;
    const stop = () => { clearTimeout(repeatTimer); repeatTimer = null; delay = 800; b.classList.remove('down'); b.faceOverride = bmp; b.dirty(); };
    const tick = () => { if (!scrubSession) { stop(); return; } scrubSessionTick(direction); if (scrubSession) { delay = Math.max(400, delay - 100); repeatTimer = setTimeout(tick, delay); } }; // repeat accelerates from 800ms to 400ms
    (b as any).onPointerDown = (p) => { // returns true so the view's outside-click handler doesn't end the session
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
  /** Open the sooner/later session for an actor — snapshots its events so the
   *  whole scrub is one undoable op. */
  const startSoonerLater = (a) => {
    endSoonerLater();
    scrubSession = { actor: a, eventsBefore: structuredClone(a.data.events), startFrame: appState.moviePlayer.frame };
    for (const b of scrubSessionElements) b.visible = true;
  };
  /** Shift the scrubbed actor's event timing one frame in `direction` (-1/1)
   *  and seek with it. Ends the session if the seek would leave the scene. */
  const scrubSessionTick = (direction) => {
    if (!scrubSession) return;
    const target = appState.moviePlayer.frame + direction;
    if (target < appState.moviePlayer.scene.nfrmFirst || target > appState.moviePlayer.scene.nfrmLast) { // out of scene bounds -> end and revert to compose
      endSoonerLater(); appState.editorTools.toolButtons?.['2comp']?.onclick(); return;
    }
    uiSounds.play(direction > 0 ? 'systepf' : 'systepb'); // each scrub step ticks
    scrubSession.actor.fSoonerLater(direction);
    appState.moviePlayer.gotoFrame(target); // the view follows the shifted events
    playbackLoop.drawFrame();
  };
  /** Close the sooner/later buttons and commit the session as one undo op. */
  function endSoonerLater() {
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
  // Scroll-type popup — a 46x88 strip at (480,100) with two cells:
  // credits scroll and story scroll.
  const scrollPopupBg = new ImageElement('p7par', 480, 100, 46, 88);
  scrollPopupBg.visible = false; scrollPopupBg.pickable = false;
    V.add(scrollPopupBg);
const scrollPopupCells = [];
  const scrollPopup = ({ name: 'scroll', elements: [scrollPopupBg], toggle: null } as {name:string,elements:any[],toggle:any});
  for (const [bmp, y, tool, snd] of ([['p7scrl', 100, 'textboxCredit', 'wscron'], ['p7nscr', 144, 'textboxStory', 'wscroff']] as [string,number,string,string][])) {
    const b = new StudioButton(bmp, bmp + 's', 480, y, 46, 44, null);
    b.visible = false; b.popup = scrollPopup;
    scrollPopupCells.push(b); scrollPopup.elements.push(b);
    b.syncFace = () => { b.faceOverride = `${bmp}${appState.editorTools.tool === tool || b.isDown ? 's' : ''}`; b.dirty(); };
    b.clickSound = snd; // scroll-on / scroll-off arm sounds
    b.onclick = () => { // cell click: arm the scroll tool, close the popup, keep 4scrl selected
      textboxEdits.endTextboxSnapshot();
      appState.editorTools.tool = tool;
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      const sb = scrollToggleButton(); if (sb) { sb.classList.add('on'); sb.syncFace(); }
      setScrollPopup(false); playbackLoop.drawFrame();
    };
    V.add(b);
  }
  /** The '4scrl' toolbar button that toggles the scroll-type popup. */
  const scrollToggleButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'words')?.secondaryButtons?.['4scrl'];
  /** Show or hide the scroll-type popup, syncing the toggle's selected face. */
  const setScrollPopup = (open) => {
    if (open && !scrollPopupBg.visible) uiSounds.play('dropdn');
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
  // Attribute popups — vertical cell strips for text color/background/size/
  // style/font. A pick stores the value in textboxPaint and arms the matching
  // tool; clicking a textbox while armed applies it.
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
  /** Highlight whichever words-tab button corresponds to the armed textbox
   *  tool (selected faces on the secondary row + the scroll-popup cells). */
  const syncTextboxFaces = () => {
    const w = TOOLBAR_DEFS.find((tab) => tab.id === 'words'); if (!w) return;
    for (const [bmp, b] of Object.entries<any>(w.secondaryButtons)) { b.classList.toggle('on', TOOL_TEXTBOX_FACE[appState.editorTools.tool] === bmp); b.syncFace(); }
    for (const b of scrollPopupCells) b.syncFace();
  };
  appState.editorTools.syncTextboxFaces = syncTextboxFaces;
  const textPopup = { element: null, cells: [], kind: null, pageIndex: 0 };
  const textPopupGroup = ({ name: 'textPopup', elements: [], toggle: null } as {name:string,elements:any[],toggle:any});
  /** The words-tab button that opened the current attribute popup. */
  const textPopupButton = () => TOOLBAR_DEFS.find((tab) => tab.id === 'words')?.secondaryButtons?.[TEXT_POPUP_BUTTONS[textPopup.kind]];
  /** Arm a textbox paint tool and immediately apply the armed value to the
   *  textbox under the last view point, if any. */
  const PAINT_TOOL_SOUNDS = { textboxPaintText: 'wcolor', textboxFill: 'wbgclr', textboxFont: 'wfont', textboxSize: 'wsize', textboxStyle: 'wstyle' };
  function armTextboxPaint(tool) {
    uiSounds.play(PAINT_TOOL_SOUNDS[tool] || 'sectool');
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
      this.item = item; this.action = action; this.hover = false; this.cursor = CURSORS.pointer;
    }
    /** Paint the frame + the item's swatch/sample. */
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
    /** Press — the 'h' face is a press state, not hover. */
    onPointerDown() { this.hover = true; this.dirty(); }
    /** Release the press. */
    onPointerUp() { this.hover = false; this.dirty(); }
    /** Cancel the press when the pointer slides off. */
    onPointerLeave() { this.hover = false; this.dirty(); }
    /** Pick this cell's item. */
    onClick() { this.action(this.item); }
  }
  /** Open (or toggle) one of the attribute popups — 'fore', 'back', 'size',
   *  'style', or 'font' — from `TEXT_POPUP_DEFS`. */
  function showTextPopup(kind) {
    if (textPopup.kind === kind) { closeTextPopup(); return; }
    uiSounds.play('dropdn');
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
  /** Rebuild the visible cells of the open attribute popup for the current
   *  page, including the paging arrows when items overflow one page. */
  function buildTextPopupCells() {
    for (const b of textPopup.cells) V.remove(b);
    textPopup.cells = [];
    textPopupGroup.elements = textPopup.element ? [textPopup.element] : [];
    const def = TEXT_POPUP_DEFS[textPopup.kind];
    def.items.slice(textPopup.pageIndex * def.itemsPerPage, textPopup.pageIndex * def.itemsPerPage + def.itemsPerPage).forEach((item, i) => {
      const b = new ToolPopupCell(def, item, i, textPopupPick);
      b.popup = textPopupGroup; b.clickSound = 'pselect';
      V.add(b);
      textPopup.cells.push(b); textPopupGroup.elements.push(b);
    });
    const pages = Math.ceil(def.items.length / def.itemsPerPage);
    if (pages > 1) { // page arrows along the bottom strip
      for (const [bmp, dn] of ([['d8dn', 1], ['d8up', -1]] as [string,number][])) {
        const b = new StudioButton(bmp, bmp + 's', def.x + (dn > 0 ? 0 : def.w / 2), def.y + def.itemsPerPage * def.rowHeight, def.w / 2, 21,
          () => { textPopup.pageIndex = Math.max(0, Math.min(textPopup.pageIndex + dn, pages - 1)); buildTextPopupCells(); });
        b.popup = textPopupGroup; b.clickSound = dn > 0 ? 'pagedn' : 'pageup';
        V.add(b);
        textPopup.cells.push(b); textPopupGroup.elements.push(b);
      }
    }
  }
  /** Handle an attribute-popup cell pick: store the chosen value into
   *  `textboxPaint`, close the popup, and arm the matching tool. */
  function textPopupPick(item) {
    const kind = textPopup.kind;
    if (kind === 'fore' || kind === 'back') appState.textboxPaint.acr = item.iscr === 0 ? -1 : ((0xfe000000 | item.iscr) | 0);
    else if (kind === 'size') appState.textboxPaint.dyp = item.dyp;
    else if (kind === 'style') appState.textboxPaint.grfont = (appState.textboxPaint.grfont & ~item.mask) | (item.grfont & item.mask);
    else if (kind === 'font') appState.textboxPaint.font = item.name;
    closeTextPopup();
    armTextboxPaint(TEXT_POPUP_TOOLS[kind]);
  }
  /** Close the open attribute popup (if any) and un-highlight its button. */
  function closeTextPopup() {
    if (!textPopup.element) return;
    V.remove(textPopup.element); textPopup.element = null;
    for (const b of textPopup.cells) V.remove(b);
    textPopup.cells = []; textPopup.kind = null;
    textPopupGroup.elements = [];
    const i = openPopups.indexOf(textPopupGroup); if (i >= 0) openPopups.splice(i, 1);
    const w = TOOLBAR_DEFS.find((tab) => tab.id === 'words');
    if (w) for (const bmp of ['4font', '4bold', '4size', '4colr', '4back']) {
      const b = w.secondaryButtons[bmp];
      if (b && TOOL_TEXTBOX_FACE[appState.editorTools.tool] !== bmp) { b.classList.remove('on'); b.syncFace(); }
    }
  }

  // Roll calls — the two 4-cell actor/prop strips beside the stage:
  // cells at (list.x, 98+i*74) with a 38x70 thumb inset at (2,2),
  // and paging arrows at y=394.
  class RollCallCell extends Element {
    constructor(list, i) {
      super(list.x, 98 + i * 74, 42, 74);
      this.list = list; this.i = i; this.cursor = CURSORS.pointer;
    }
    /** Paint the cell's frame + the actor's thumbnail. */
    draw(ctx) {
      const list = this.list, acts = thumbnails.rollCallActors(list), a = acts[list.offset + this.i];
      const st = !a ? '' : list.offset + this.i === list.selected ? 's' : 'e';
      if (st) {
        const image = textureCache.image(`${list.cellPrefix}${this.i + 1}${st}`, () => this.dirty());
        if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
        ctx.drawImage(thumbnails.rollCallThumbFor(a.data.tagTmpl?.cno, a), 2, 2, 38, 70);
      }
    }
    /** Click — select the cell's actor/prop in the editor. */
    onClick() { const a = thumbnails.rollCallActors(this.list)[this.list.offset + this.i]; if (a) { uiSounds.play('select'); this.list.selected = this.list.offset + this.i; appState.setSelectedChildId(movieEdits.childIdOf(a)); studioHost.syncRollCall(); playbackLoop.drawFrame(); } }
  }
  class RollCallArrow extends Element {
    constructor(list, img, x, w, scroll) {
      super(x, 394, w, 17);
      this.img = img; this.scroll = scroll; this.cursor = CURSORS.pointer; this.list = list;
      this.enabled = false; this._dn = false;
    }
    /** Paint the arrow — disabled ('d'), pressed ('c'), or normal face. */
    draw(ctx) {
      const image = textureCache.image(`${this.img}${this.enabled ? (this._dn ? 'c' : '') : 'd'}`, () => this.dirty());
      if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
    }
    /** Press — show the pressed face when the arrow is enabled. */
    onPointerDown() { if (this.enabled) { this._dn = true; this.dirty(); } }
    /** Release the press. */
    onPointerUp() { this._dn = false; this.dirty(); }
    /** Cancel the press when the pointer slides off. */
    onPointerLeave() { this._dn = false; this.dirty(); }
    /** Click — page the strip and drop the cell selection. */
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
    up.clickSound = 'pageup'; dn.clickSound = 'pagedn';
    up.list = dn.list = list;
    V.add(up); V.add(dn);
    list.arrows.push(up, dn);
  }

  // --- top tool bar ----------------------------------------------------------
  // Four cover tabs at y0-43 sit over per-section 62x40 insert buttons;
  // opening a cover reveals them plus the section's secondary tool row at y47.
  // Exactly one cover is open at a time.
  const TOOLBAR_DEFS: any[] = [ // per-tab layout: insert buttons + secondary row buttons
    { id: 'scenes', cov: 'covr1', cx: 0,   row: '1par', def: null, door: 5, dx: 375,
      ins: [['1back', 18, 'bkgd']],
      sec: [['1view', 199, 0, 'cam'], ['p3rmbk', 256, 0, () => { uiSounds.play('rembfr'); soundEdits.sceneChop(false); }],
            ['p3rmfw', 315, 0, () => { uiSounds.play('remaftr'); soundEdits.sceneChop(true); }], ['1scen', 390, 0, () => SorterEasel.show()]] },
    { id: 'actors', cov: 'covr2', cx: 100, row: '2par', def: '2comp', door: 6, dx: 374,
      ins: [['2actr', 114, 'actor'], ['2prop', 180, 'prop'], ['2splt', 246, () => SpletterEasel.show(null)]],
      sec: [['2comp', 41], ['2acts', 98, 0, undefined, ['2act01', '2act02', '2act03', '2act04', '2act05', '2act06']],
            ['2cont', 155], ['2cost', 211], ['2rot', 268, 50, () => setRotatePopup(!isRotatePopupOpen())],
            ['2xy', 325, 36, 'tog:xy'], ['2zero', 392, 36, 'tog:ground'], ['2tran', 435, 50, () => setTransitionPopup(!isTransitionPopupOpen())],
            ['2soon', 492], ['2bio', 549, 50, () => talentBook.show()]] },
    { id: 'sounds', cov: 'covr3', cx: 323, row: '3par', def: '3ear', door: 7, dx: 354,
      ins: [['3horn', 334, 'fx'], ['3mike', 400, 'speech'], ['3note', 466, 'music']],
      sec: [['3sing', 176], ['3loop', 234], ['3ear', 292], ['3rpt', 370], ['1note', 428, 36, 'tog:pause']] },
    { id: 'words',  cov: 'covr4', cx: 543, row: '4par', def: '4ins', door: 8, dx: 403,
      ins: [['4new', 560, () => WordsDialog.show()]],
      sec: [['4ins', 112], ['4font', 170, 0, () => showTextPopup('font')], ['4bold', 228, 0, () => showTextPopup('style')],
            ['4size', 286, 0, () => showTextPopup('size')], ['4colr', 344, 0, () => showTextPopup('fore')],
            ['4back', 419, 0, () => showTextPopup('back')], ['4scrl', 477, 0, () => setScrollPopup(!scrollPopupBg.visible)]] },
  ];
  const TB_DOWN = { p3rmbk: 'p3rmbkc', p3rmfw: 'p3rmfwc', '2cost': '2costc', '2acts': '2acts' }; // buttons whose pressed face isn't just up+'s'
  const animBtns = []; // secondary buttons whose default face cycles through animation cells
  setInterval(() => { for (const b of animBtns) { // advance unselected animated tool faces every 160ms
    if (b.isOn || b.isDown) continue;
    b.animIndex = (b.animIndex + 1) % b.animFaces.length; b.syncFace();
  } }, 160);
  /** Create a chrome button with an optional tooltip id, registering a plain
   *  up/down `syncFace`. */
  const makeToolbarButton = (up, x, y, w, h, onclick) => {
    const dn = TB_DOWN[up] || up + 's';
    const b = new StudioButton(up, dn, x, y, w, h, onclick, TIP_IDS.has(up) ? up : null);
    b.clickSound = 'sectool'; // the secondary-tool click
    b.syncFace = () => { b.faceOverride = null; b.dirty(); };
    return b;
  };
  for (const tab of TOOLBAR_DEFS) {
    // Insert buttons — created first so the cover image can sit over them.
    tab.insBtns = tab.ins.map(([bmp, x, act]) => {
      const b = makeToolbarButton(bmp, x, 1, 62, 40, // string act -> asset browser; fn -> its own surface (words dialog / spletter easel)
        typeof act === 'function' ? act : act ? () => AssetBrowserView.show(act) : () => {});
      V.add(b);
      return b;
    });
    // Secondary tool row — a strip at y47 plus its buttons, all children of rowEl.
    tab.rowEl = new Element(0, 0, UI_WIDTH, UI_HEIGHT);
    tab.rowEl.pickable = false; tab.rowEl.visible = false;
    V.add(tab.rowEl);
    tab.rowEl.add(new ImageElement(tab.row, 0, 47, 640, 51));
    tab.secondaryButtons = {};
    for (const [bmp, x, w, act, anim] of (tab.sec as any[])) { // act: 'tog:key' toggle | browser kind | command fn | none = radio tool; anim = cycling default faces
      const b = makeToolbarButton(bmp, x, 48, w || 50, 48, null);
      if (anim) { // animated default face (cycles through cells); on/down shows the base face
        b.animFaces = anim; b.animIndex = 0;
        b.syncFace = () => { b.faceOverride = b.isOn || b.isDown ? bmp : b.animFaces[b.animIndex]; b.dirty(); };
        b.syncFace(); animBtns.push(b);
      }
      if (typeof act === 'string' && act.startsWith('tog:')) {
        if (act === 'tog:pause') { // pause-sound toggle: two faces by state, not a tool
          b.syncFace = () => { b.faceOverride = appState.editorTools.pauseSound ? '1notes' : '1note';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => { uiSounds.play('rswitch'); soundEdits.editPause(!appState.editorTools.pauseSound); };
          b.clickSound = null; // state-dependent sound plays inside onclick
        } else {
          const key = act.slice(4); // toggle faces: 'xy'/'ground' state keys on editorTools
          b.syncFace = () => { const on = appState.editorTools[key];
            b.faceOverride = on === (key === 'ground') ? bmp : bmp + 's';
            b.dim = b.isDown; b.dirty(); };
          b.onclick = () => { appState.editorTools[key] = !appState.editorTools[key]; uiSounds.play(appState.editorTools[key] ? 'stateon' : 'stateoff'); b.syncFace(); };
          b.clickSound = null;
        }
        b.syncFace();
      } else if (typeof act === 'string') b.onclick = () => AssetBrowserView.show(act);
      else if (typeof act === 'function') b.onclick = () => { act(); playbackLoop.drawFrame(); };
      else b.onclick = () => { textboxEdits.endTextboxSnapshot(); for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); } // radio-style: arming one tool clears the rest
        b.classList.add('on'); b.syncFace();
        appState.editorTools.tool = { '2comp': 'compose', '2cont': 'record', '2acts': 'action', '2cost': 'costume', '2soon': 'sooner',
          '3sing': 'sounder', '3loop': 'looper', '3rpt': 'matcher', '3ear': 'listener', '4ins': 'textboxSelect' }[bmp] || 'none';
        for (const o of cameraPopupCells) o.syncFace?.(); setRotatePopup(false); setTransitionPopup(false); setScrollPopup(false); closeTextPopup(); endSoonerLater(); hoveredEarActor = undefined; view.cursor = null; }; // picking a tool disarms everything else and closes popups
      tab.rowEl.add(b);
      tab.secondaryButtons[bmp] = b;
      if (!act) (appState.editorTools.toolButtons ||= {})[bmp] = b; // registered for programmatic tool select (e.g. action apply arms 2cont)
    }
    if (tab.def) { tab.secondaryButtons[tab.def].classList.add('on'); }
    // Doors: a door bitmap covers the tail of each secondary row until clicked;
    // once opened it stays open for the session.
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
    tab.doorZone.onclick = () => { if (!appState.moviePlayer?.scene) return; uiSounds.play('cover'); tab.all = true; paintDoor(); }; // doors stay shut while tools are locked
    paintDoor(); tab.paintDoor = paintDoor;
    // Cover tab — drawn on top of the insert buttons; open = hidden.
    tab.covEl = new ImageElement(`${tab.cov}c`, tab.cx, 0, tab.cov === 'covr1' ? 99 : tab.cov === 'covr2' ? 223 : tab.cov === 'covr3' ? 220 : 98, 43);
    tab.covEl.pickable = true; tab.covEl.cursor = CURSORS.pointer;
    V.add(tab.covEl);
    tab.covEl.onClick = () => { if (!tab.locked) { uiSounds.play('cover'); setCover(tab.id); } }; // locked (no scene) covers show a disabled face and ignore clicks
  }
  /** Open one cover tab ('scenes'/'actors'/'sounds'/'words') and close the
   *  others, showing its secondary tool row. Each tab arms its default tool —
   *  so switching tabs always exits text mode and never leaves a textbox tool
   *  stuck armed. */
  function setCover(id) {
    for (const tab of TOOLBAR_DEFS) { tab.covEl.visible = tab.id !== id; tab.rowEl.visible = tab.id === id; }
    // open-cover script arms the tab's default tool — scenes=none,
    // actors=compose, sounds=listener, words=textboxSelect
    closeTextPopup(); setScrollPopup(false); setRotatePopup(false); setTransitionPopup(false); endSoonerLater(); hoveredEarActor = undefined;
    const tab = TOOLBAR_DEFS.find((t) => t.id === id);
    if (tab?.def) appState.editorTools.toolButtons?.[tab.def]?.onclick();
    else { // no default tool -> nil tool, no face selected
      textboxEdits.endTextboxSnapshot(); appState.editorTools.tool = 'none'; view.cursor = null;
      for (const tab of TOOLBAR_DEFS) for (const o of Object.values<any>(tab.secondaryButtons || {})) { o.classList.remove('on'); o.syncFace?.(); }
      for (const o of cameraPopupCells) o.syncFace?.();
    }
    V.invalidate();
  }
  // Tool-state sync — a sceneless movie keeps the scrollbar strip and the
  // undo/ccp buttons covered by lids and locks the actor/sound/words covers
  // (disabled face, inert clicks). The scenes cover stays open — Scene Choices
  // is the way out — and book/map/portfolio stay usable. The first scene lifts
  // the lids and unlocks the covers; removing the last scene re-covers them.
  const stripLids = [];
  for (const [bmp, x, y, w, h] of ([['door0', 0, 47, 640, 51], ['covr5c', 0, 410, 362, 56], ['covr7c', 364, 410, 110, 56]] as [string,number,number,number,number][])) { // lid bitmaps over the disabled strips
    const image = new ImageElement(bmp, x, y, w, h);
    image.visible = false; image.pickable = false;
    V.add(image);
    stripLids.push(image);
  }
  /** Reflect "movie has a scene" into the chrome: lids over the scrollbar and
   *  undo/ccp strips, locked cover faces, and doors/rows hidden while locked.
   *  Called whenever scenes are added or removed. */
  appState.editorTools.syncToolState = () => {
    const noScene = !appState.moviePlayer?.scene;
    for (const image of stripLids) { image.visible = noScene; image.dirty(); }
    for (const tab of TOOLBAR_DEFS) {
      if (tab.id === 'scenes') continue;
      tab.locked = noScene;
      tab.covEl.name = `${tab.cov}${noScene ? 'd' : 'c'}`;
      tab.covEl.cursor = noScene ? CURSORS.arrow : CURSORS.pointer;
      tab.covEl.dirty();
    }
    if (noScene) {
      for (const tab of TOOLBAR_DEFS) { tab.all = false; tab.paintDoor(); tab.rowEl.visible = false; } // doors closed; no secondary row while tools are locked
      setCover('scenes'); // also resets the armed tool to none
      TOOLBAR_DEFS[0].rowEl.visible = false; // settings cover stays open but its tool row stays hidden
    } else { // scene added: restore the open cover's row + open its doors
      const open = TOOLBAR_DEFS.find((tab) => !tab.covEl.visible);
      if (open) { open.rowEl.visible = true; if (!open.all) { open.all = true; open.paintDoor(); } }
    }
    V.invalidate();
  };
  appState.editorTools.openCover = setCover;
  rotatePopup.toggle = rotateToggleButton(); transitionPopup.toggle = transitionToggleButton(); scrollPopup.toggle = scrollToggleButton(); // toggles must resolve after the toolbar is built
  /** View-level outside-click dismissal: a pointerdown that hits none of an
   *  open popup's elements (or its toggle button) closes it. */
  V.onPointerDown = (rawEvent) => {
    const hit = V.hitTest(rawEvent.x, rawEvent.y);
    for (const popup of [...openPopups]) {
      if (hit && (popup.elements.includes(hit) || hit === popup.toggle)) continue;
      ({ cameraControls: () => setCameraPopup(false), portal: () => setPortalPopup(false), rotate: () => setRotatePopup(false),
        transition: () => setTransitionPopup(false), scroll: () => setScrollPopup(false), textPopup: () => closeTextPopup() })[popup.name]?.();
    }
    if (scrubSession && !scrubSessionElements.includes(hit)) { endSoonerLater(); appState.editorTools.toolButtons?.['2comp']?.onclick(); }
  };
  setCover('scenes');

  // --- store→render wiring ---------------------------------------------------
  // Store subscriptions repaint just the affected elements instead of relying on
  // callers remembering to sync chrome. StudioView lives for the whole session —
  // no unsubscribe needed.
  useUiState.subscribe((s) => s.playing, (p) => {
    const pb = namedElements.stb_play; if (pb) { pb.classList.toggle('on', p); pb.syncFace?.(); }
  });
  useEditState.subscribe((s) => s.selectedChildId, () => {
    studioHost.syncRollCall(); // key-deduplicated — repaints only on real change
  });
  }
}
/** Owns the mounted StudioView and the chrome sync helpers other modules call.
 *  `studioHost.initialize()` runs once during boot; `sync()`/`syncRollCall()`
 *  repaint the counters, sliders, and roll calls after state changes. */
class StudioHost {
  view: StudioView | null = null;
  /** Look up a named studio element by id (e.g. 'stb_undo', 'stfnum'). */
  elementById = (id) => this.view?.namedElements?.[id];
  /** Create and mount the StudioView under the view stack. Called once at boot. */
  initialize = () => { this.view = new StudioView(); };
  /** Reflect player state into the studio bar — counters, sliders, the
   *  sound-indicator thumb, and the roll calls. Called on every UI update. */
  sync = () => {
  if (!this.view?.children.length) return;
  const namedElements = this.view.namedElements;
  namedElements.stfnum.textContent = appState.moviePlayer.scene ? appState.moviePlayer.frame - appState.moviePlayer.scene.nfrmFirst + 1 : '–';
  namedElements.stsnum.textContent = appState.moviePlayer.sceneIndex >= 0 ? appState.moviePlayer.sceneIndex + 1 : '–';
  const nm = namedElements.stname;
  if (!elementById('stnameInp')) nm.textContent = appState.moviePlayer.movie.name || localizer.translate('doc.untitled');
  for (const s of (this.view as any)._stSliders || []) s.sync();
  { // the frame thumb shows the speaker face while a sound event lands
    // exactly on the current frame (a scene PlaySnd event or an actor Snd event)
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
  /** Repaint the actor + prop roll calls: 4 cells each with paging arrows
   *  (scrolls 1 per click, no wraparound), key-deduplicated. */
  syncRollCall = () => {
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
