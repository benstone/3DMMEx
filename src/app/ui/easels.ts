import * as M from '../../engine/mat34.ts';
import * as THREE from 'three';
import { Actor } from '../../engine/actor.ts';
import { FPS } from '../../engine/player.ts';
import { ChunkyFile } from '../../format/chunky.ts';
import { parseMbmp, STY, TDTS, makeTdtTemplate, templateCmtl } from '../../format/content.ts';
import { parseMovie } from '../../format/movie.ts';
import { toMatrix4 } from '../../render/renderer.ts';
import { movieDocument } from '../movieDocument.ts';
import { movieEdits } from '../edit/movieEdits.ts';
import { soundEdits } from '../edit/soundEdits.ts';
import { textboxEdits } from '../edit/textboxEdits.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { soundSources } from '../soundSources.ts';
import { appState } from '../appState.ts';
import { thumbnails } from '../thumbnails.ts';
import { editHistory } from '../editHistory.ts';
import { AssetBrowserView } from './assetBrowser.ts';
import { modalSlot } from './modal.ts';
import { EaselView, CanvasEl, offscreenCanvas, ScrollButton, Thermometer, NamePlate, ListenerSlider, FramedCell } from './easel.ts';
import { Element } from './element.ts';
import { StudioButton, TextElement } from './widgets.ts';
import { textureCache } from './textureCache.ts';
import { studioHost } from './studio.ts';
import { localizer } from '../localization.ts';

// --- scene sorter easel (easels.cht kidSSorter*; scnsort.cpp SCRT) -----------
// e3par panel at (20,65) 600x350; 6 frame cells 185x126 at (10+c*193,12+r*141);
// thumb rect (8,12)-(151,92); transition buttons at (156,11/33/55/77). Edits a
// working scene list (the CMVI); OK commits reorder/nuke/trans/appends, Esc or
// cancel discards. Sorter changes are not undoable (MVIE::ClearUndo on OK).
const SORTER_X = 20, SORTER_Y = 65; // panel origin in studio coords
const T4 = [0, 3, 1, 2]; // SCRT::_mplwtrans = {transCut, transDissolve, transFadeToBlack, transFadeToWhite}

class SorterCell extends Element { // frame + thumb + 4 transition cells
  constructor(easel, i) {
    const cx = SORTER_X + 10 + (i % 3) * 193, cy = SORTER_Y + 12 + (i / 3 | 0) * 141;
    super(cx, cy, 185, 126);
    this.easel = easel; this.i = i; this.cursor = 'pointer';
    /** @type {any} */ this._drag = null;
    this.transitionButtons = T4.map((tt, j) => {
      const b = new StudioButton(`e3trn${j + 1}`, `e3trn${j + 1}s`, cx + 156, cy + 11 + 22 * j, 20, 17,
        () => { const item = this.item(); if (item) { item.trans = T4[j]; easel.sync(); } }); // FCmdTransition
      easel.add(b);
      return b;
    });
  }
  item() { return this.easel.items[this.easel.topIndex + this.i]; }
  draw(ctx) {
    const item = this.item(), easel = this.easel;
    if (!item) { this.visible = false; for (const b of this.transitionButtons) b.visible = false; return; }
    this.visible = true;
    const fr = textureCache.image(easel.topIndex + this.i === easel.currentIndex ? 'e3frms' : 'e3frm', () => this.dirty());
    if (textureCache.isReady(fr)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, 0, 0, 185, 126); }
    ctx.drawImage(easel.thumbCv(item.scene), 8, 12, 143, 80);
    for (const [j, b] of this.transitionButtons.entries()) {
      b.visible = true;
      b.faceOverride = `e3trn${j + 1}${item.trans === T4[j] ? 's' : ''}`;
    }
  }
  onPointerDown() { this.easel.cellDown(this.i); }
  onPointerMove(p) { if (this._drag) this.easel.dragMove(this, p); }
  onPointerUp() { if (this._drag) this.easel.dragEnd(this); }
}

export class SorterEasel extends EaselView {
  static show = () => { if (appState.moviePlayer) modalSlot.open(new SorterEasel()); };
  constructor() {
    super();
    this.makeImage('e3par', SORTER_X, SORTER_Y, 600, 350);
    this.items = appState.moviePlayer.movie.scenes.map((scene) => ({ scene, trans: scene.trans, batch: null }));
    this.currentIndex = Math.max(0, appState.moviePlayer.sceneIndex);
    this.topIndex = Math.floor(this.currentIndex / 6) * 6;
    this.tool = 'hand';
    this.aridLim = null; // appended actors get arids above the current movie's max

    this.cells = [];
    for (let i = 0; i < 6; i++) { const c = new SorterCell(this, i); this.cells.push(c); this.add(c); }

    this.bar = this.makeImage('ssbar', 0, 0, 250, 140); // drop-position indicator
    this.bar.visible = false;

    // drag ghost (idSelFrame) — follows the pointer with the selected thumb
    const ghost = this.ghost = new Element(0, 0, 185, 126);
    ghost.pickable = false; ghost.visible = false;
    ghost.draw = (ctx) => {
      const fr = textureCache.image('e3frms', () => ghost.dirty());
      if (textureCache.isReady(fr)) ctx.drawImage(fr, 0, 0, 185, 126);
      if (this.items[this.currentIndex]) ctx.drawImage(this.thumbCv(this.items[this.currentIndex].scene), 8, 12, 143, 80);
    };
    this.add(ghost);

    this.hand = new StudioButton('e3hand', 'e3handc', SORTER_X + 25, SORTER_Y + 298, 50, 48, () => { this.tool = 'hand'; this.syncTools(); });
    this.nuke = new StudioButton('e3rmsn', 'e3rmsm', SORTER_X + 80, SORTER_Y + 298, 50, 48, () => { this.tool = 'nuke'; this.syncTools(); });
    this.add(this.hand); this.add(this.nuke);
    this.sup = new ScrollButton('e3up', SORTER_X + 580, SORTER_Y + 2, 17, 19, () => this.scroll(-3));
    this.sdn = new ScrollButton('e3down', SORTER_X + 580, SORTER_Y + 273, 17, 19, () => this.scroll(3));
    this.add(this.sup); this.add(this.sdn);

    this.makeButton('e3port', 'e3portc', SORTER_X + 135, SORTER_Y + 298, 50, 48, () => this.importMovie()); // kidSSorterOpen -> FCmdPortfolio
    this._onEsc = () => this.dismiss(); // cancel-button CHILD_SCRIPT maps Escape to cidSceneSortCancel
    this.makeButton('e3can', 'e3canc', SORTER_X + 465, SORTER_Y + 298, 50, 48, () => this.dismiss());   // cidSceneSortCancel
    this.makeButton('e3okay', 'e3okayc', SORTER_X + 515, SORTER_Y + 298, 50, 48, () => this.applySort()); // cidSceneSortOk -> FSetCmvi
    this.syncTools(); this.sync();
  }

  thumbCv(scene) {
    if (!scene._tcv) {
      const c = offscreenCanvas(143, 80);
      const x = c.getContext('2d');
      if (scene.thumb) { try { x.drawImage(thumbnails.mbmpToCanvas(parseMbmp(scene.thumb), 143, 80), 0, 0); } catch { x.fillStyle = '#111'; x.fillRect(0, 0, 143, 80); } }
      else { // no THUM stored — name placeholder (original renders via SCEN::PmbmpThumbnail)
        x.fillStyle = '#111'; x.fillRect(0, 0, 143, 80); x.fillStyle = '#ccc';
        x.font = '12px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText((scene.name || 'scene').slice(0, 20), 71, 40);
      }
      scene._tcv = c;
    }
    return scene._tcv;
  }

  sync() { // _FResetThumbnails + _EnableScroll
    this.sup.visible = this.topIndex > 0;
    this.sdn.visible = this.topIndex + 6 < this.items.length;
    for (const c of this.cells) c.dirty(); // playbackLoop.drawFrame() computes visibility/faces
    this.invalidate();
  }
  syncTools() {
    this.hand.faceOverride = `e3hand${this.tool === 'hand' || this.hand.isDown ? 'c' : ''}`; this.hand.dirty();
    this.nuke.faceOverride = `e3rmsn${this.tool === 'nuke' || this.nuke.isDown ? 'c' : ''}`; this.nuke.dirty();
  }
  scroll(d) { // FCmdScroll ±nxFrame
    this.topIndex = Math.max(0, Math.min(this.items.length - 1, this.topIndex + d));
    this.sync();
  }

  cellDown(i) {
    const cellIndex = this.topIndex + i;
    if (cellIndex >= this.items.length) return;
    if (this.tool === 'nuke') { // FCmdNuke: drop the scene, keep selection valid
      this.items.splice(cellIndex, 1);
      if (cellIndex < this.currentIndex) this.currentIndex--;
      if (this.currentIndex >= this.items.length) this.currentIndex = this.items.length - 1;
      if (this.topIndex >= this.items.length && this.topIndex > 0) this.topIndex -= 3;
      this.sync();
      return;
    }
    if (cellIndex !== this.currentIndex) { this.currentIndex = cellIndex; this.sync(); return; } // FCmdSelect on mouse-down
    this.dragStart(i); // mouse-down on the already-selected frame with hand -> drag
  }

  dragStart(i) {
    const cell = this.cells[i];
    this.ghost.visible = true;
    this.ghost.x = cell.x; this.ghost.y = cell.y; this.ghost.dirty();
    this.bar.visible = true; this.bar.dirty();
    cell._drag = { grabX: 0, grabY: 0, to: this.currentIndex, scrollTm: null };
  }
  dragMove(cell, m) {
    const dr = cell._drag; if (!dr) return;
    if (!dr.grabbed) { dr.grabX = m.x - cell.x; dr.grabY = m.y - cell.y; dr.grabbed = true; }
    const xn = Math.max(0, Math.min(405, m.x - SORTER_X - dr.grabX));  // xpFrameMax = dxpSSorter-dxpFrame+kdxpSSorterRight
    const yn = Math.max(0, Math.min(141, m.y - SORTER_Y - dr.grabY));  // ypFrameMax = dypSSorter-dypFrame
    this.ghost.x = SORTER_X + xn; this.ghost.y = SORTER_Y + yn; this.ghost.dirty();
    const col = xn < 10 ? 0 : Math.min(3, 1 + (((xn - 11) / 193) | 0)); // xFrame from easels.cht
    const row = (((yn + 70) / 141) | 0);                               // yFrame
    dr.to = Math.min(this.items.length, row * 3 + col);
    this.bar.x = SORTER_X + (xn < 10 ? 4 : 4 + 193 * (1 + (((xn - 11) / 193) | 0)));
    this.bar.y = SORTER_Y + 7 + 141 * row; this.bar.dirty();
    const my = m.y - SORTER_Y; // drag past the grid scrolls one row (kdtimDragScroll)
    clearTimeout(dr.scrollTm);
    if (my < 0 || my > 282) dr.scrollTm = setTimeout(() => {
      this.topIndex = Math.max(0, Math.min(this.items.length - 1, this.topIndex + (my < 0 ? -3 : 3))); this.sync();
    }, 200);
  }
  dragEnd(cell) {
    const dr = cell._drag; cell._drag = null; if (!dr) return;
    clearTimeout(dr.scrollTm); this.bar.visible = false; this.ghost.visible = false;
    const tt = Math.min(dr.to, this.items.length); // FCmdInsert: GL::Move(cur,to), ends at to-1 if to>cur
    if (tt !== this.currentIndex) { const item = this.items.splice(this.currentIndex, 1)[0]; const at = tt > this.currentIndex ? tt - 1 : tt; this.items.splice(at, 0, item); this.currentIndex = at; }
    this.sync();
  }

  importMovie() { // kidSSorterOpen -> FCmdPortfolio: append another movie's scenes
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const mv = parseMovie(new ChunkyFile(await f.arrayBuffer(), f.name));
        if (this.aridLim == null) this.aridLim = 1 + Math.max(0, ...appState.moviePlayer.movie.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid)));
        const batch = { srcCf: mv.chunkyFile, srcRoll: mv.rollCall, remap: new Map(), aridOff: this.aridLim };
        this.aridLim += 1 + Math.max(0, ...mv.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid))); // aridMin += aridLim
        for (const scene of mv.scenes) this.items.push({ scene, trans: scene.trans, batch });
        this.sync();
      } catch (err) { alert(`${f.name}: ${err.message}`); }
    };
    inp.click();
  }

  dismiss() { // FCmdDismiss exits via either button -> SetTool(toolDefault)
    appState.editorTools.tool = 'none';
    for (const b of Object.values<any>(appState.editorTools.toolBtns || {})) { b.classList.remove('on'); b.syncFace?.(); }
    modalSlot.close();
  }

  applySort() { // cidSceneSortOk -> FSetCmvi: commit the working list into the movie
    const mv = appState.moviePlayer.movie;
    for (const item of this.items) {
      item.scene.trans = item.trans;
      if (!item.batch) continue;
      const { srcCf, srcRoll, remap, aridOff } = item.batch;
      const fix = (tg) => { // merge embedded (sid 0) chunks into this movie's chunkyFile (FClone + tag rewrite)
        if (!tg || tg.sid !== 0) return;
        if (!remap.has(tg.cno)) {
          const c = mv.chunkyFile?.adopt(srcCf, tg.ctg, tg.cno);
          remap.set(tg.cno, c ? c.cno : -1);
        }
        if (remap.get(tg.cno) < 0) { tg.sid = -1; return; }
        tg.cno = remap.get(tg.cno);
      };
      const s = item.scene;
      for (const e of [...s.startEvents, ...s.frameEvents]) {
        if (e.data?.tags) for (const tg of e.data.tags) fix(tg);
        else if (e.data && typeof e.data === 'object' && 'ctg' in e.data) fix(e.data); // SetBkgd tag
      }
      for (const [, a] of s.actors) {
        fix(a.tagTmpl);
        for (const ev of a.events || []) if (ev.data?.tag) fix(ev.data.tag);
        const rc = srcRoll?.get(a.arid);
        a.arid += aridOff;
        if (rc && mv.rollCall) mv.rollCall.set(a.arid, { ...rc, tagTmpl: rc.tagTmpl?.sid === 0 ? (fix(rc.tagTmpl), rc.tagTmpl) : rc.tagTmpl });
      }
    }
    mv.scenes.length = 0;
    mv.scenes.push(...this.items.map((i) => i.scene)); // 0 scenes is legal — _iscen = ivNil
    appState.setSelectedChildId(-1); textboxEdits.setSelectedTextbox(-1); textboxEdits.setFocusedTextbox(-1); appState.textboxSelections.clear();
    editHistory.clear(); // MVIE::FSetCmvi's caller does ClearUndo — sorter changes aren't undoable
    movieDocument.markDocumentDirty();
    playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(Math.min(Math.max(0, this.currentIndex), mv.scenes.length - 1));
    this.dismiss(); playbackLoop.drawFrame();
  }
}

// record easel (easels.cht kidRecord*): e5par + length thermometer + name + mike/play/can/okay
export class RecorderEasel extends EaselView {
  static show = (kind) => modalSlot.open(new RecorderEasel(kind));
  constructor(kind) {
    super();
    this.kind = kind;
    this.makeImage('e5par', 202, 154, 236, 172);
    this.therm = new Thermometer(224, 184, 193, 22); // kidRecordSoundLength thermometer fill
    this.add(this.therm);
    this.nameInput = this.domInput(325, 229, 110, 21); // kidRecordSoundName (123,75)-(232,95)
    this.nameInput.maxLength = 40; this.nameInput.placeholder = localizer.translate('easel.soundName');
    this.stream = null; this.rec = null; this.chunks = []; this.recording = null;
    this.t0 = 0; this.raf = 0; this.stopP = null;
    this.mikeBtn = this.makeButton('e5mike', 'e5mikes', 213, 269, 50, 48, async () => {
      if (this.rec?.state === 'recording') { this.stopRec(); this.syncMike(); }
      else { appState.soundQueue.ensure(); await this.startRec(); this.syncMike(); }
    });
    this.makeButton('e5play', 'e5plays', 265, 269, 50, 48, () => { this.stopRec(); if (this.recording?.buf) appState.soundQueue.preview({ buf: this.recording.buf }); });
    this.makeButton('e5can', 'e5canc', 329, 269, 50, 48, () => this.done(false));
    this.makeButton('e5okay', 'e5okayc', 379, 269, 50, 48, () => this.done(true));
    setTimeout(() => this.nameInput.focus(), 0);
  }

  syncMike() { this.mikeBtn.faceOverride = `e5${this.rec?.state === 'recording' || this.mikeBtn.isDown ? 'mikes' : 'mike'}`; this.mikeBtn.dirty(); }
  stopTracks() { this.stream?.getTracks().forEach((tt) => tt.stop()); this.stream = null; }
  stopRec() { if (this.rec?.state === 'recording') this.rec.stop(); this.rec = null; }
  tick() {
    this.therm.f = ((performance.now() - this.t0) / 10000); this.therm.dirty();
    if (this.rec?.state === 'recording') this.raf = requestAnimationFrame(() => this.cycleTimer());
  }
  async startRec() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { console.warn('[record] unsupported'); return; }
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { console.warn('[record] mic denied:', e.message); return; }
    this.recording = null; this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => this.chunks.push(e.data);
    const mime = this.rec.mimeType || 'audio/webm'; // capture now — rec is nulled by stopRec before onstop fires
    const rec = this.rec;
    this.stopP = new Promise<void>((res) => {
      rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: mime }), bytes = await blob.arrayBuffer();
        this.recording = { buf: await soundSources.decodeAudioBytes(bytes), bytes, mime };
        this.therm.f = (this.recording.buf?.duration || 0) / 10; this.therm.dirty();
        this.stopTracks(); res();
      };
    });
    this.t0 = performance.now(); rec.start(); this.cycleTimer();
    setTimeout(() => { if (this.rec?.state === 'recording') this.stopRec(); }, 10000); // kdtsMaxRecord
  }
  async done(save) { // close easel -> back to the sound browser
    cancelAnimationFrame(this.raf); this.stopRec(); if (this.stopP) await this.stopP; this.stopTracks();
    if (save && this.recording) await soundSources.addUserSound(this.kind, { name: this.nameInput.value.trim() || `recording ${soundSources.userSounds.length + 1}`, buf: this.recording.buf, bytes: this.recording.bytes, mime: this.recording.mime });
    AssetBrowserView.show(this.kind);
  }
}

// listener easel (easels.cht kidListenBackgroundBkgd/Actor): per-sty volume
// sliders + nukes + name-plate audition for this frame's appState.soundQueue. Clicking an
// actor gives e4parmm (FX + Speech, MM variant when no plain sound of the sty
// exists); clicking empty space gives e4par (FX + Speech + Midi). Changes apply
// live; OK keeps them (the original ClearUndo's — easel edits aren't undoable),
// Cancel/Esc restores the open-time snapshot.
export class ListenerEasel extends EaselView {
  static show = (a) => { if (a || appState.moviePlayer?.scene) modalSlot.open(new ListenerEasel(a)); };
  constructor(a) {
    super();
    this.a = a;
    const s = appState.moviePlayer.scene;
    const evs0 = a ? structuredClone(a.data.events) : structuredClone(s.frameEvents);
    modalSlot.cleanup = () => this.restore(evs0); // Esc/cancel closes via modalSlot.close -> restores the snapshot
    const X = a ? 182 : 116, Y = 100; // e4parmm/e4par gob origins (pos3.chh)
    this.makeImage(a ? 'e4parmm' : 'e4par', X, Y, a ? 277 : 408, 236);
    // columns: sty, slider left/right, icon x, nuke x, name-plate x
    const cols = a
      ? [[STY.Sfx, 70, 120, 13, 98, 10], [STY.Speech, 201, 251, 144, 229, 141]]
      : [[STY.Sfx, 70, 120, 13, 101, 12], [STY.Speech, 201, 251, 144, 232, 143], [STY.Midi, 332, 382, 275, 363, 274]];
    for (const [sty, sl, sr, ix, nx, ex] of cols) this.buildCol(sty, X, Y, sl, sr, ix, nx, ex);
    this.makeButton('e4can', 'e4canc', X + (a ? 149 : 280), Y + 183, 50, 48, () => modalSlot.close());
    this.makeButton('e4okay', 'e4okayc', X + (a ? 199 : 330), Y + 183, 50, 48, () => { modalSlot.cleanup = null; modalSlot.close(); });
  }

  restore(evs0) {
    const a = this.a;
    if (a) { a.data.events = a.events = structuredClone(evs0); a.nfrmCur = null; }
    else { const s = appState.moviePlayer.scene; s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(evs0)); }
    appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame();
  }

  buildCol(sty, X, Y, sl, sr, ix, nx, ex) {
    const a = this.a;
    const q = a ? (a.fQuerySnd(sty, false) || (() => { const m = a.fQuerySnd(sty, true); return m && { ...m, mm: true }; })())
                : soundEdits.querySceneSound(sty);
    if (!q) return;
    const mm = !!q.mm, colEls = [];
    const audition = () => { // LSND::Play: stop running movie appState.soundQueue, play the tags
      if (q.vlm < 0) return;
      appState.soundQueue.stopAll();
      appState.soundQueue.play({ scope: a ? 'actor' : 'scene', arid: a?.data.arid, data: { tags: q.tags, sty, vlm: q.vlm, fLoop: q.fLoop } });
    };
    colEls.push(this.makeImage(mm ? 'e4mm' : q.tags.length > 1 ? 'e4queue' : q.fLoop ? 'e4loop' : 'e4snd', X + ix, Y + 117, 30, 30));
    const nm = new NamePlate(X + ex, Y + 150, 122, 20, soundSources.soundName(q.tags), audition); // e4audit name plate (click = audition)
    this.add(nm); colEls.push(nm);
    const sld = new ListenerSlider(X + sl, Y + 20, sr - sl, 118, q.vlm, (vlm) => {
      q.vlm = vlm; // below the nuke line -> vlmNil/silent
      if (a) a.fSetVlmSnd(sty, mm, vlm); else soundEdits.setSceneVolume(sty, vlm);
      audition(); // slider-up enqueues cidEaselPlay too
    });
    this.add(sld);
    colEls.push(sld, sld.th);
    colEls.push(this.makeButton('e4nuke', 'e4nukec', X + nx, Y + 123, 21, 20, () => { // kidListenNuke*: delete + hide the column
      if (a) a.fDeleteSndCore(sty, mm); else soundEdits.removeSceneSound(sty);
      for (const el of colEls) { el.visible = false; el.dirty?.(); }
      this.invalidate();
    }));
  }
}

// words create dialog (browser.cht kidBrwsTextCreate): book9 + story/scroll choices
export class WordsDialog extends EaselView {
  static show = () => modalSlot.open(new WordsDialog());
  constructor() {
    super();
    this.makeImage('book9', 132, 48, 376, 209);
    this.makeButton('e6stor', 'e6stors', 174, 97, 136, 78, () => { modalSlot.close(); textboxEdits.insertTextbox(true); });   // cidCreateTbox fFalse -> story box
    this.makeButton('e6scr1', 'e6scr1s', 329, 96, 136, 78, () => { modalSlot.close(); textboxEdits.insertTextbox(false); }); // cidCreateTbox fTrue -> credits box
    this.makeButton('cancel', 'cancelc', 430, 205, 50, 48, modalSlot.close);  // preg (0,48): bottom-left
  }
}

// spletter easel (easels.cht kidSplt*, easel.cpp ESLT): e1par + APE preview + text
// input + font/shape/texture popups + transmogrify/rotate. New TDTs place via
// appState.pendingPlacement (StartPlaceActor); editing an existing TDT swaps its template.
export const SPLETTER_PALETTES = { // popdn.cht + pos3.chh — coords relative to e1par at (61,57)
  font: { x: 97, y: 189, w: 144, h: 132, cellHeight: 23, frameInset: 3, itemsPerPage: 5, arrowY: 115 },
  shape: { x: 149, y: 129, w: 46, h: 194, cellHeight: 44, frameInset: 7, itemsPerPage: 4, arrowY: 176 },
  mtrl: { x: 197, y: 129, w: 78, h: 194, cellHeight: 44, frameInset: 7, itemsPerPage: 4, arrowY: 176 },
};
const SPLT_VIEWS = [M.identity(), M.rotY(Math.PI / 2), M.rotY(Math.PI), M.rotY(3 * Math.PI / 2), M.rotX(Math.PI / 2)]; // ChangeView's preset post-rotations

class PopupCell extends FramedCell { // popdn cell: mbmp thumb centered in the frame border
  constructor(x, y, w, h, def, item, onPick) {
    super('d1frm', x, y, w, h, onPick);
    this.def = def; this.item = item;
  }
  drawInner(ctx) {
    const { def, item } = this;
    if (!item.mbmp) return;
    const s = Math.min((def.w - 2 * def.frameInset) / item.mbmp.width, (def.cellHeight - 2 * def.frameInset) / item.mbmp.height);
    const cw = Math.max(1, Math.round(item.mbmp.width * s)), ch = Math.max(1, Math.round(item.mbmp.height * s));
    ctx.drawImage(thumbnails.mbmpToCanvas(item.mbmp, cw, ch), (this.w - cw) / 2, (this.h - ch) / 2);
  }
}

export class SpletterEasel extends EaselView {
  static show = (editA) => {
    const editing = editA?.template?.isTdt ? editA : null;
    if (!editing && !appState.moviePlayer) return;
    modalSlot.open(new SpletterEasel(editA));
  };
  constructor(editA) {
    super();
    this.editing = editA?.template?.isTdt ? editA : null;
    const editing = this.editing;
    this.state = { // ESLT's working copy — GetTdtInfo/FGetMaterial read it on OK
      text: editing ? editing.template.text : '3D Movie Maker', // vapp.GetStnProduct default
      tdts: editing ? editing.template.tdts : TDTS.Normal,
      tagTdf: editing ? editing.template.tagTdf : thumbnails.spletterThumbs.font[0]?.tag,
      tagMtrl: !editing ? null : (editing._cost[0]?.fCmtl ? null : editing._cost[0]?.tag ?? null),
      mtrlDirty: false, // FGetMaterial(ibset) only fires when the easel touched it
      iview: 0,         // APE::_iview — ChangeView cycles 5 preset orientations
    };
    this.makeImage('e1par', 61, 57, 518, 366);
    const pv = offscreenCanvas(492, 238); // APE preview canvas
    this.previewElement = new CanvasEl(pv, 74, 70, 492, 238);
    this.add(this.previewElement);
    this.nameInput = this.domInput(71, 379, 498, 34); // kidSpltEditBox — SNE with all text selected
    this.nameInput.maxLength = 50; this.nameInput.value = this.state.text; this.nameInput.placeholder = 'type 3D text';
    // APE preview: a live Actor over a rebuilt TDT (FChangeTdt -> PtdtDup+AdjustBody)
    const previewRenderer = this.previewRenderer = new THREE.WebGLRenderer({ canvas: pv });
    modalSlot.cleanup = () => previewRenderer.dispose();
    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(25, 492 / 238, 0.1, 10000);
    this.previewActor = null; this.meshes = [];
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.popup = null; // {kind, pageIndex, background, cells}
    // cidEaselFont/Shape/Texture -> FCmdStartPopup; transmogrify = SFL-shuffled
    // random shape+font+material; rotate = APE::ChangeView
    this.makeButton('e1font', 'e1fonts', 97, 322, 50, 48, () => this.showPopup('font'));
    this.makeButton('e1shap', 'e1shaps', 147, 322, 50, 48, () => this.showPopup('shape'));
    this.makeButton('e1text', 'e1texts', 197, 322, 50, 48, () => this.showPopup('mtrl'));
    this.makeButton('e1tran', 'e1trans', 247, 322, 50, 48, () => this.transmogrify()); // FCmdTransmogrify — _psfl->LwNext picks
    this.makeButton('e1rot', 'e1rots', 320, 322, 50, 48, () => { this.state.iview = (this.state.iview + 1) % 5; this.rebuild(); }); // APE::ChangeView
    this.makeButton('e1can', 'e1canc', 443, 322, 50, 48, modalSlot.close); // cidEaselCancel
    this.makeButton('e1okay', 'e1okayc', 493, 322, 50, 48, () => this.commit()); // cidEaselOk -> _FAcceptChanges
    this.nameInput.oninput = () => { this.state.text = this.nameInput.value; this.rebuild(); }; // FTextChanged -> FChangeTdt(stn)
    this.rebuild();
    setTimeout(() => { this.nameInput.focus(); this.nameInput.select(); }, 0); // SNE starts with all text selected
  }

  pose() {
    const { previewActor, meshes, previewScene, previewCamera, box3, tmpB, cV, sV } = this;
    const w = previewActor.partWorldMatrices();
    box3.makeEmpty();
    previewActor.parts.forEach((p, i) => {
      if (!p.model) { if (meshes[i]) meshes[i].visible = false; return; }
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; previewScene.add(m); }
      m.visible = true; m.material = appState.sceneRenderer._material(p.mtrl, 0);
      m.geometry = appState.sceneRenderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) {
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      previewCamera.position.set(cV.x, cV.y + r * 1.4, cV.z + r * 3.2); previewCamera.lookAt(cV);
    }
    this.previewRenderer.render(previewScene, previewCamera);
    this.previewElement.dirty();
  }

  rebuild() { // APE::FChangeTdt — rebuild template+body from the working state
    const spletter = this.state;
    for (const m of this.meshes) if (m) this.previewScene.remove(m);
    this.meshes = [];
    const template = makeTdtTemplate(appState.contentLibrary, spletter.text, spletter.tdts, spletter.tagTdf);
    this.previewActor = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: spletter.text, dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: null, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, template, appState.contentLibrary);
    this.previewActor._setActnCel(0, 0);
    if (spletter.tagMtrl) { // FSetTdtMtrl: one material on the TDT's single body part set
      const m = appState.contentLibrary.mtrl(spletter.tagMtrl);
      if (m) for (const p of this.previewActor.parts) p.mtrl = m;
    }
    this.previewActor.xfrm.cur = SPLT_VIEWS[spletter.iview]; // _matrixRotUpdate post-multiplies rest by xfrm.cur
    this.previewActor._positionBody();
    this.pose();
  }

  // --- popups (popdn.cht kidSpltsFont/Shape/Color): gray sizer panel + d1frm
  // cells + d1up/d1dn page arrows; click picks+closes, outside/Esc cancels ---
  closePopup() { if (!this.popup) return; this.remove(this.popup.background); for (const c of this.popup.cells) this.remove(c); this.popup = null; this.invalidate(); }
  popupPick(item) { // cidBrowserSelect+Ok: apply the pick and dismiss
    const spletter = this.state;
    if (this.popup.kind === 'font') { if (item.tag.cno !== spletter.tagTdf?.cno) spletter.tagTdf = item.tag; }
    else if (this.popup.kind === 'shape') spletter.tdts = item.tdts;
    else { spletter.tagMtrl = item.tag; spletter.mtrlDirty = true; }
    this.closePopup(); this.rebuild();
  }
  popupCells() {
    const popup = this.popup;
    for (const c of popup.cells) this.remove(c); popup.cells = [];
    const def = SPLETTER_PALETTES[popup.kind], items = thumbnails.spletterThumbs[popup.kind];
    const spletter = this.state;
    const currentIndex = popup.kind === 'font' ? items.findIndex((i) => i.tag.cno === spletter.tagTdf?.cno)
      : popup.kind === 'shape' ? items.findIndex((i) => i.tdts === spletter.tdts)
      : items.findIndex((i) => i.tag.cno === spletter.tagMtrl?.cno);
    items.slice(popup.pageIndex * def.itemsPerPage, popup.pageIndex * def.itemsPerPage + def.itemsPerPage).forEach((item, i) => {
      const cellIndex = popup.pageIndex * def.itemsPerPage + i;
      const b = new PopupCell(def.x, def.y + i * def.cellHeight, def.w, def.cellHeight, def, item, () => this.popupPick(item));
      b.selected = cellIndex === currentIndex;
      this.add(b);
      popup.cells.push(b);
    });
    const last = Math.ceil(items.length / def.itemsPerPage) - 1;
    for (const [skin, offset, targetPage] of ([['d1up', 0, 0], ['d1dn', def.w / 2, last]] as [string, number, number][])) { // up = first page, dn = last
      const b = new StudioButton(skin, skin + 's', def.x + offset, def.y + def.arrowY, def.w / 2, def.h - def.arrowY,
        () => { if (this.popup.pageIndex !== targetPage) { this.popup.pageIndex = targetPage; this.popupCells(); } });
      this.add(b);
      popup.cells.push(b);
    }
    this.invalidate();
  }
  showPopup(kind) {
    if (this.popup?.kind === kind) return this.closePopup();
    this.closePopup();
    if (!thumbnails.spletterThumbs[kind].length) return;
    const def = SPLETTER_PALETTES[kind];
    const background = new Element(def.x, def.y, def.w, def.h);
    background.pickable = false;
    background.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, def.w, def.h); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, def.w - 1, def.h - 1); };
    this.popup = { kind, pageIndex: 0, cells: [], background };
    this.add(background);
    this.popupCells();
  }
  onPointerDown(e) { // outside the popup -> cidBrowserCancel
    const hit = this.hitTest(e.x, e.y);
    if (this.popup && hit !== this.popup.background && !this.popup.cells.includes(hit)) this.closePopup();
  }

  transmogrify() { // FCmdTransmogrify — _psfl->LwNext picks
    const spletter = this.state;
    const rnd = (n, cur) => { let v = cur; while (n > 1 && v === cur) v = (Math.random() * n) | 0; return v; };
    spletter.tdts = rnd(10, spletter.tdts);
    const fi = thumbnails.spletterThumbs.font.findIndex((f) => f.tag.cno === spletter.tagTdf?.cno);
    if (thumbnails.spletterThumbs.font.length) spletter.tagTdf = thumbnails.spletterThumbs.font[rnd(thumbnails.spletterThumbs.font.length, fi)].tag;
    const mi = thumbnails.spletterThumbs.mtrl.findIndex((m) => m.tag.cno === spletter.tagMtrl?.cno);
    if (thumbnails.spletterThumbs.mtrl.length) { spletter.tagMtrl = thumbnails.spletterThumbs.mtrl[rnd(thumbnails.spletterThumbs.mtrl.length, mi)].tag; spletter.mtrlDirty = true; }
    this.rebuild();
  }

  commit() { // cidEaselOk -> _FAcceptChanges
    const spletter = this.state, editing = this.editing;
    const text = spletter.text;
    if (!/[^ ]/.test(text)) return modalSlot.close(); // all-space text treated as cancel
    if (editing) { // FChangeActrTdt + costume on the live actor
      const a = editing, chid = movieEdits.childIdOf(a), rec = a.data, oldTag = rec.tagTmpl, oldName = rec.name;
      const evs0 = structuredClone(rec.events);
      const changed = text !== a.template.text || spletter.tdts !== a.template.tdts ||
        spletter.tagTdf.cno !== a.template.tagTdf.cno || spletter.tagTdf.sid !== a.template.tagTdf.sid;
      const swap = (tag, name) => { // rebuild the actor from the (new) template tag
        rec.tagTmpl = tag; rec.name = name;
        appState.moviePlayer.loadScene(appState.moviePlayer.sceneIndex); appState.moviePlayer.gotoFrame(appState.moviePlayer.frame);
      };
      editHistory.executeOperation({ do: () => {
          if (changed) swap(appState.contentLibrary.addTmpl(makeTdtTemplate(appState.contentLibrary, text, spletter.tdts, spletter.tagTdf)), text);
          if (spletter.mtrlDirty && spletter.tagMtrl) appState.moviePlayer.actors.get(chid)?.setCostumeCore(0, spletter.tagMtrl, 0, false);
          playbackLoop.drawFrame();
        },
        undo: () => {
          swap(oldTag, oldName);
          const live = appState.moviePlayer.actors.get(chid);
          if (live) { live.data.events = live.events = structuredClone(evs0); live.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); }
          playbackLoop.drawFrame();
        } });
      modalSlot.close();
    } else { // new TDT: FInsTdt happens at the drop point (StartPlaceActor)
      appState.setPendingPlacement({ tdt: { text, tdts: spletter.tdts, tagTdf: spletter.tagTdf, tagMtrl: spletter.mtrlDirty ? spletter.tagMtrl : null } });
      if (appState.editorTools.view) appState.editorTools.view.cursor = 'crosshair';
      modalSlot.close(); playbackLoop.drawFrame();
    }
  }
}


// action browser (browser.cht kidBrwsAction + pos3.chh): book5 at (62,100), 2x10 ACTN
// name grid, live cel-cycling preview pane w/ cel fwd/back, OK applies an Actn event
class ActionCell extends FramedCell { // frame5 name cell
  constructor(x, y, onPick) {
    super('frame5', x, y, 138, 25, onPick);
    this.item = null; this.cellIndex = 0;
  }
  draw(ctx) {
    if (!this.item) { this.visible = false; return; }
    this.visible = true;
    super.draw(ctx);
  }
  drawInner(ctx) {
    ctx.fillStyle = '#222'; ctx.font = "10px 'Comic Sans MS', cursive, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.item.name, this.w / 2, this.h / 2, this.w - 8);
  }
}

export class ActionBrowser extends EaselView {
  static show = () => {
    if (!appState.moviePlayer) return;
    const a = movieEdits.selectedActor() || [...appState.moviePlayer.actors.values()].find((x) => x.onStage);
    if (!a) return; // original requires a selected actor
    appState.setSelectedChildId(movieEdits.childIdOf(a)); studioHost.syncRollCall();
    const template = a.template;
    const actions = template.chunkyFile.kidsOf('TMPL', template.cno, 'ACTN').map((k) => ({ anid: k.chid, name: template.chunkyFile.get('ACTN', k.cno).name || `action ${k.chid}` }));
    if (!actions.length) return;
    modalSlot.open(new ActionBrowser(a, actions));
  };
  constructor(a, actions) {
    super();
    this.a = a; this.actions = actions;
    const X = 62, Y = 100; // book5 origin — child gob positions are relative to it
    this.makeImage('book5', X, Y, 516, 372);
    this.pageIndexText = new TextElement('', X + 123, Y + 339, 64, 29, { size: 15 });
    this.add(this.num);
    // APE preview pane (312,12)-(496,282): small second appState.sceneRenderer posing the action
    const pcv = offscreenCanvas(184, 270);
    this.previewElement = new CanvasEl(pcv, X + 312, Y + 12, 184, 270);
    this.add(this.previewElement);
    const previewRenderer = this.previewRenderer = new THREE.WebGLRenderer({ canvas: pcv });
    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(25, 184 / 270, 0.1, 10000);
    this.previewActor = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, a.template, a.contentLibrary);
    this.previewActor._setDefaultCost();
    this.meshes = this.previewActor.parts.map(() => null); // lazily created — parts gain models on _setActnCel
    // celn cycles in the preview; celnStart is what OK applies (BRWA::_celnStart —
    // 0 until the user touches the cel buttons, which stop the cycling)
    this.anid = a.anid || actions[0].anid; this.celn = 0; this.ccel = 1; this.celnStart = 0; this.cycling = false;
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.pageIndex = 0; this.selectedIndex = -1;
    this.cells = [];
    const itemsPerPage = 20;
    for (let i = 0; i < itemsPerPage; i++) { // frame5 name cells at rel (15+143c, 32+28r)
      const c = i % 2, r = Math.floor(i / 2);
      const b = new ActionCell(X + 15 + c * 143, Y + 32 + r * 28, (cell) => this.pick(cell));
      b.cellIndex = i;
      this.add(b); this.cells.push(b);
    }
    this.cycleTimer = setInterval(() => { if (this.cycling) { this.celn = (this.celn + 1) % this.ccel; this.pose(); } }, 1000 / FPS); // APE cycles cels
    modalSlot.cleanup = () => { clearInterval(this.cycleTimer); previewRenderer.dispose(); };
    this.makeButton('fwd', 'fwdc', X + 204, Y + 320, 59, 46, () => { this.pageIndex = Math.min(this.pageCount() - 1, this.pageIndex + 1); this.render(); });
    this.makeButton('bback', 'bbackc', X + 54, Y + 320, 59, 46, () => { this.pageIndex = Math.max(0, this.pageIndex - 1); this.render(); });
    this.makeButton('b5celbk', 'b5celbks', X + 447, Y + 290, 27, 16, () => this.step(-1));
    this.makeButton('b5celfw', 'b5celfws', X + 475, Y + 290, 27, 16, () => this.step(1));
    this.makeButton('okay', 'okayc', X + 431, Y + 320, 50, 48, () => this.commit()); // gob pos is bottom-left (preg 0,48)
    this.makeButton('cancel', 'cancelc', X + 381, Y + 320, 50, 48, modalSlot.close);
    this.render();
    this.setAnid(this.anid);
  }

  pageCount() { return Math.max(1, Math.ceil(this.actions.length / 20)); }
  pose() {
    const { previewActor, meshes, previewScene, previewCamera, box3, tmpB, cV, sV } = this;
    previewActor._setActnCel(this.anid, this.celn); previewActor._positionBody();
    const w = previewActor.partWorldMatrices();
    box3.makeEmpty();
    previewActor.parts.forEach((p, i) => {
      if (!p.model) return;
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; m.material = appState.sceneRenderer._material(p.mtrl, 0); previewScene.add(m); }
      m.geometry = appState.sceneRenderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) { // ~APE::SetCustomView(0,-30,0) orbit framing
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      previewCamera.position.set(cV.x, cV.y + r * 2, cV.z + r * 3.6); previewCamera.lookAt(cV);
    }
    this.previewRenderer.render(previewScene, previewCamera);
    this.previewElement.dirty();
  }
  setAnid(an) {
    this.anid = an;
    const act = this.previewActor._actn(an);
    this.ccel = act ? act.cels.length : 1;
    this.celn = 0; this.celnStart = 0; this.cycling = true; this.pose();
  }
  step(d) {
    if (this.cycling) { this.cycling = false; this.celnStart = this.celn; }
    this.celnStart = (this.celnStart + d + this.ccel) % this.ccel;
    this.celn = this.celnStart; this.pose();
  }
  pick(b) {
    this.selectedIndex = this.pageIndex * 20 + b.cellIndex;
    for (const o of this.cells) { o.selected = o === b; o.dirty(); }
    this.setAnid(b.item.anid);
  }
  render() {
    this.pageIndexText.textContent = localizer.translate('ui.pageNum', { page: this.pageIndex + 1, total: this.pageCount() });
    this.cells.forEach((b, i) => { b.item = this.actions[this.pageIndex * 20 + i] || null; b.selected = this.pageIndex * 20 + i === this.selectedIndex; b.dirty(); });
    this.invalidate();
  }
  commit() { // FSetAction(anid, celnStart, fFalse): Actn+Freeze(+Step) inserted at cursor, executed now
    const a = this.a;
    if (this.selectedIndex >= 0) {
      const an = this.actions[this.selectedIndex].anid, cn = this.celnStart, d = a.data;
      const evs0 = structuredClone(d.events);
      const reval = () => { a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); };
      editHistory.executeOperation({ do: () => { a.setActionCore(an, cn, false); playbackLoop.drawFrame(); },
               undo: () => { d.events = a.events = structuredClone(evs0); reval(); } });
      // BRWA::_ApplySelection arms toolRecordSameAction after applying
      appState.editorTools.toolBtns?.['2cont']?.onclick();
    }
    modalSlot.close(); playbackLoop.drawFrame();
  }
}


// costume easel (easels.cht kidCost*, ESLA): e2par bg at (102,100) 436x347;
// preview (112,109)-(528,339); name edit (110,415); buttons costumes/accessories/
// rotate/cancel/ok at y=356. Clicking a body part cycles its CMTL costumes;
// accessories mode cycles the part's accessory set (APE::_FIncCmtl).
class CostumeModeButton extends StudioButton { // costumes/accessories are radio-selected (kstSelected face)
  constructor(up, dn, x, f, easel) {
    super(up, dn, x, 356, 50, 48, () => { easel.accessoriesMode = f; easel.syncModes(); });
    this.mode = f; this.up = up; this.downFace = dn; this.easel = easel;
  }
  syncMode() { this.faceOverride = this.easel.accessoriesMode === this.mode ? this.downFace : this.up; this.dirty(); }
}

export class CostumeEasel extends EaselView {
  static show = (a) => {
    if (!appState.moviePlayer || !a || !a.onStage) return;
    const template = a.template;
    if (template.isTdt || !template.cbset) return; // TDTs use the spletter easel; props without part sets do nothing
    appState.setSelectedChildId(movieEdits.childIdOf(a)); studioHost.syncRollCall(); playbackLoop.drawFrame();
    modalSlot.open(new CostumeEasel(a));
  };
  constructor(a) {
    super();
    this.a = a; this.template = a.template;
    const template = this.template;
    this.makeImage('e2par', 102, 100, 436, 347);
    const pcv = offscreenCanvas(416, 230); // preview frame (10,9)-(426,239) rel to bg
    this.previewElement = new CanvasEl(pcv, 112, 109, 416, 230);
    this.previewElement.pickable = true; this.previewElement.cursor = 'pointer';
    this.add(this.previewElement);
    this.nameInput = this.domInput(110, 415, 420, 24); // kidCostEditBox (8,315)-(427,339)
    this.nameInput.maxLength = 50; this.nameInput.value = a.data.name || '';
    const previewRenderer = this.previewRenderer = new THREE.WebGLRenderer({ canvas: pcv });
    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(25, 416 / 230, 0.1, 10000);
    this.previewActor = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, template, a.contentLibrary);
    this.previewActor._setDefaultCost();
    for (const c of Object.values(a._cost || {})) this.applyCost(this.previewActor, c); // start from the actor's current costume
    this.pending = {} as Record<string, any>; // ibset -> {fCmtl:true, cmid} picked in this session; OK commits them
    this.meshes = this.previewActor.parts.map(() => null);
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.viewAng = Math.PI / 6;
    this.accessoriesMode = false; // costumes vs accessories mode (kidCostCostumes/kidCostAccessories)
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.previewElement.onPointerDown = (e) => this.pickPart(e); // click a body part -> next costume for its ibset
    modalSlot.cleanup = () => previewRenderer.dispose();
    this.costB = new CostumeModeButton('e2cost', 'e2costs', 134, false, this);
    this.accB = new CostumeModeButton('e2acc', 'e2accs', 218, true, this);
    this.add(this.costB); this.add(this.accB);
    this.syncModes();
    this.makeButton('e2rot', 'e2rots', 302, 356, 50, 48, () => { this.viewAng += Math.PI / 4; this.pose(); }); // kidCostRotate -> ChangeView
    this.makeButton('e2can', 'e2canc', 406, 356, 50, 48, modalSlot.close); // cidEaselCancel (Esc also reaches this)
    this.makeButton('e2okay', 'e2okayc', 456, 356, 50, 48, () => this.commit()); // cidEaselOk: commit costume events + name
    this.pose();
  }

  applyCost(act, c) { // mirror _doAevCore AET.Cost
    const template = this.template, a = this.a;
    if (c.fCmtl) act._applyCmtl(templateCmtl(template, c.cmid));
    else { const m = a.contentLibrary.mtrl(c.tag); if (m) for (let i = 0; i < act.parts.length; i++) if (template.ibsets[i] === c.ibset) act.parts[i].mtrl = m; }
    act._cost[c.ibset] = { ...c };
  }
  pose() {
    const { previewActor, meshes, previewScene, previewCamera, box3, tmpB, cV, sV, a } = this;
    previewActor._setActnCel(a.anid || 0, 0); previewActor._positionBody();
    const w = previewActor.partWorldMatrices();
    box3.makeEmpty();
    previewActor.parts.forEach((p, i) => {
      if (!p.model) { if (meshes[i]) meshes[i].visible = false; return; }
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; m.material = appState.sceneRenderer._material(p.mtrl, 0); m.userData.ipar = i; previewScene.add(m); }
      m.visible = true; m.material = appState.sceneRenderer._material(p.mtrl, 0);
      m.geometry = appState.sceneRenderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) {
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      previewCamera.position.set(cV.x + r * 3.6 * Math.sin(this.viewAng), cV.y + r * 1.8, cV.z + r * 3.6 * Math.cos(this.viewAng));
      previewCamera.lookAt(cV);
    }
    this.previewRenderer.render(previewScene, previewCamera);
    this.previewElement.dirty();
  }

  // APE::_FIncCmtl helpers — which ibsets are accessory sets, and next-costume cycling
  cmtlHasModel(cmid) { const c = templateCmtl(this.template, cmid); return !!c && c.parts.some((p) => p.model); }
  bsetIsAcc(b) { return this.cmtlHasModel(this.template.cmids[b]?.[0]); }
  ibsetOnlyAcc() { let only; for (let b = 0; b < this.template.cbset; b++) if (this.bsetIsAcc(b)) { if (only !== undefined) return undefined; only = b; } return only; }
  accOf(ibset) {
    const template = this.template;
    if (this.bsetIsAcc(ibset)) return ibset;
    const only = this.ibsetOnlyAcc();
    if (only !== undefined) return only; // single accessory set applies to any costume click
    for (let b = 0; b < template.cbset; b++) if (this.bsetIsAcc(b))
      for (let i = 0; i < template.ibsets.length; i++)
        if (template.ibsets[i] === b && template.ibsets[template.parents[i]] === ibset) return b;
    return undefined;
  }
  sameAcc(cmid1, cmid2) { // TMPL::FSameAccCmids: same accessory = same model set
    const c1 = templateCmtl(this.template, cmid1), c2 = templateCmtl(this.template, cmid2);
    if (!c1 || !c2 || c1.parts.length !== c2.parts.length) return false;
    return c1.parts.every((p, k) => (p.model || null) === (c2.parts[k].model || null));
  }
  cmidNext(ibset, cmidCur, accessoriesMode) { // APE::_CmidNext: accessories cycle within the same model set
    const list = this.template.cmids[ibset] || [], i0 = Math.max(0, list.indexOf(cmidCur));
    for (let d = 1; d < list.length; d++) {
      const nx = list[(i0 + d) % list.length];
      if (accessoriesMode ? !this.sameAcc(cmidCur, nx) : this.sameAcc(cmidCur, nx)) return nx;
    }
    return cmidCur;
  }
  cmidCur(ibset) { return this.pending[ibset]?.cmid ?? (this.previewActor._cost[ibset]?.fCmtl ? this.previewActor._cost[ibset].cmid : this.template.cmids[ibset]?.[0]); }
  incCmtl(ibset) {
    if (this.accessoriesMode) { const b = this.accOf(ibset); if (b === undefined) return; ibset = b; }
    if (!(this.template.cmids[ibset] || []).length) return;
    const cmid = this.cmidNext(ibset, this.cmidCur(ibset), this.accessoriesMode);
    this.pending[ibset] = { ibset, cmid, fCmtl: true };
    this.applyCost(this.previewActor, this.pending[ibset]);
    this.pose();
  }
  pickPart(e) { // click a body part -> next costume for its ibset
    this.ndc.set((e.x - this.previewElement.x) / this.previewElement.w * 2 - 1, 1 - (e.y - this.previewElement.y) / this.previewElement.h * 2);
    this.ray.setFromCamera(this.ndc, this.previewCamera);
    const hit = this.ray.intersectObjects(this.meshes.filter(Boolean), false)[0];
    if (hit) this.incCmtl(this.template.ibsets[hit.object.userData.ipar]);
  }
  syncModes() { this.costB.syncMode(); this.accB.syncMode(); }

  commit() { // cidEaselOk: commit costume events + name
    const a = this.a;
    const changes = Object.values<any>(this.pending), nameNew = this.nameInput.value.trim() || a.data.name;
    if (changes.length || nameNew !== a.data.name) {
      const evs0 = structuredClone(a.data.events), name0 = a.data.name;
      const reval = (evs, nm) => { a.data.events = a.events = structuredClone(evs); a.data.name = nm;
        a.nfrmCur = null; appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame(); studioHost.syncRollCall(); };
      editHistory.executeOperation({ do: () => { a.data.name = nameNew;
          for (const c of changes) a.setCostumeCore(c.ibset, null, c.cmid, true);
          playbackLoop.drawFrame(); studioHost.syncRollCall(); },
        undo: () => reval(evs0, name0) });
    }
    modalSlot.close(); playbackLoop.drawFrame();
  }
}

