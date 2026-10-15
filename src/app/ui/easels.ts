import * as M from '../../engine/mat34.ts';
import * as THREE from 'three';
import { Actor } from '../../engine/actor.ts';
import { FPS } from '../../engine/player.ts';
import { ChunkyFile } from '../../format/chunky.ts';
import { parseMbmp, STY, TDTS, makeTdtTemplate, templateCmtl } from '../../format/content.ts';
import { parseMovie } from '../../format/movie.ts';
import { toMatrix4 } from '../../render/renderer.ts';
import { docMark } from '../doc.ts';
import { selActor, chidOf } from '../edit/movie.ts';
import { queryScenSnd, setScenVlm, remScenSnd } from '../edit/sound.ts';
import { setTbSel, setTbFocus, insTbox } from '../edit/tbox.ts';
import { setPlaying, draw } from '../loop.ts';
import { addUserSnd, userSnds, decodeAudioBytes, sndName } from '../sndsrc.ts';
import { player, ed, setSelChid, selTbSels, sounds, renderer, lib, setPendPlace } from '../state.ts';
import { mbmpCanvas, spltThumbs } from '../thumbs.ts';
import { histClear, opExec } from '../undo.ts';
import { closeBrowser, showBrowser, setBrwsCleanup } from './browser.ts';
import { EaselView, CvEl, offCv, showEasel, ScrollBtn, Therm, NamePlate, LisSlider, FrmCell } from './easel.ts';
import { Element } from './element.ts';
import { StBtn, Txt } from './widgets.ts';
import { texImg, imgReady } from './img.ts';
import { syncRollCall } from './studio.ts';
import { t } from '../i18n.ts';

// --- scene sorter easel (easels.cht kidSSorter*; scnsort.cpp SCRT) -----------
// e3par panel at (20,65) 600x350; 6 frame cells 185x126 at (10+c*193,12+r*141);
// thumb rect (8,12)-(151,92); transition buttons at (156,11/33/55/77). Edits a
// working scene list (the CMVI); OK commits reorder/nuke/trans/appends, Esc or
// cancel discards. Sorter changes are not undoable (MVIE::ClearUndo on OK).
const SS_X = 20, SS_Y = 65; // panel origin in studio coords
const T4 = [0, 3, 1, 2]; // SCRT::_mplwtrans = {transCut, transDissolve, transFadeToBlack, transFadeToWhite}

class SCell extends Element { // frame + thumb + 4 transition cells
  constructor(esl, i) {
    const cx = SS_X + 10 + (i % 3) * 193, cy = SS_Y + 12 + (i / 3 | 0) * 141;
    super(cx, cy, 185, 126);
    this.esl = esl; this.i = i; this.cursor = 'pointer';
    /** @type {any} */ this._drag = null;
    this.tbs = T4.map((tt, j) => {
      const b = new StBtn(`e3trn${j + 1}`, `e3trn${j + 1}s`, cx + 156, cy + 11 + 22 * j, 20, 17,
        () => { const it = this.it(); if (it) { it.trans = T4[j]; esl.sync(); } }); // FCmdTransition
      esl.add(b);
      return b;
    });
  }
  it() { return this.esl.items[this.esl.top + this.i]; }
  draw(ctx) {
    const it = this.it(), esl = this.esl;
    if (!it) { this.visible = false; for (const b of this.tbs) b.visible = false; return; }
    this.visible = true;
    const fr = texImg(esl.top + this.i === esl.cur ? 'e3frms' : 'e3frm', () => this.dirty());
    if (imgReady(fr)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, 0, 0, 185, 126); }
    ctx.drawImage(esl.thumbCv(it.scen), 8, 12, 143, 80);
    for (const [j, b] of this.tbs.entries()) {
      b.visible = true;
      b.faceOverride = `e3trn${j + 1}${it.trans === T4[j] ? 's' : ''}`;
    }
  }
  onPointerDown() { this.esl.cellDown(this.i); }
  onPointerMove(p) { if (this._drag) this.esl.dragMove(this, p); }
  onPointerUp() { if (this._drag) this.esl.dragEnd(this); }
}

export class SorterEasel extends EaselView {
  constructor() {
    super();
    this.mkImg('e3par', SS_X, SS_Y, 600, 350);
    this.items = player.movie.scenes.map((scen) => ({ scen, trans: scen.trans, batch: null }));
    this.cur = Math.max(0, player.sceneIndex);
    this.top = Math.floor(this.cur / 6) * 6;
    this.tool = 'hand';
    this.aridLim = null; // appended actors get arids above the current movie's max

    this.cells = [];
    for (let i = 0; i < 6; i++) { const c = new SCell(this, i); this.cells.push(c); this.add(c); }

    this.bar = this.mkImg('ssbar', 0, 0, 250, 140); // drop-position indicator
    this.bar.visible = false;

    // drag ghost (idSelFrame) — follows the pointer with the selected thumb
    const ghost = this.ghost = new Element(0, 0, 185, 126);
    ghost.pickable = false; ghost.visible = false;
    ghost.draw = (ctx) => {
      const fr = texImg('e3frms', () => ghost.dirty());
      if (imgReady(fr)) ctx.drawImage(fr, 0, 0, 185, 126);
      if (this.items[this.cur]) ctx.drawImage(this.thumbCv(this.items[this.cur].scen), 8, 12, 143, 80);
    };
    this.add(ghost);

    this.hand = new StBtn('e3hand', 'e3handc', SS_X + 25, SS_Y + 298, 50, 48, () => { this.tool = 'hand'; this.syncTools(); });
    this.nuke = new StBtn('e3rmsn', 'e3rmsm', SS_X + 80, SS_Y + 298, 50, 48, () => { this.tool = 'nuke'; this.syncTools(); });
    this.add(this.hand); this.add(this.nuke);
    this.sup = new ScrollBtn('e3up', SS_X + 580, SS_Y + 2, 17, 19, () => this.scroll(-3));
    this.sdn = new ScrollBtn('e3down', SS_X + 580, SS_Y + 273, 17, 19, () => this.scroll(3));
    this.add(this.sup); this.add(this.sdn);

    this.mkBtn('e3port', 'e3portc', SS_X + 135, SS_Y + 298, 50, 48, () => this.importMovie()); // kidSSorterOpen -> FCmdPortfolio
    this._onEsc = () => this.dismiss(); // cancel-button CHILD_SCRIPT maps Escape to cidSceneSortCancel
    this.mkBtn('e3can', 'e3canc', SS_X + 465, SS_Y + 298, 50, 48, () => this.dismiss());   // cidSceneSortCancel
    this.mkBtn('e3okay', 'e3okayc', SS_X + 515, SS_Y + 298, 50, 48, () => this.applySort()); // cidSceneSortOk -> FSetCmvi
    this.syncTools(); this.sync();
  }

  thumbCv(scen) {
    if (!scen._tcv) {
      const c = offCv(143, 80);
      const x = c.getContext('2d');
      if (scen.thumb) { try { x.drawImage(mbmpCanvas(parseMbmp(scen.thumb), 143, 80), 0, 0); } catch { x.fillStyle = '#111'; x.fillRect(0, 0, 143, 80); } }
      else { // no THUM stored — name placeholder (original renders via SCEN::PmbmpThumbnail)
        x.fillStyle = '#111'; x.fillRect(0, 0, 143, 80); x.fillStyle = '#ccc';
        x.font = '12px "Comic Sans MS", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText((scen.name || 'scene').slice(0, 20), 71, 40);
      }
      scen._tcv = c;
    }
    return scen._tcv;
  }

  sync() { // _FResetThumbnails + _EnableScroll
    this.sup.visible = this.top > 0;
    this.sdn.visible = this.top + 6 < this.items.length;
    for (const c of this.cells) c.dirty(); // draw() computes visibility/faces
    this.invalidate();
  }
  syncTools() {
    this.hand.faceOverride = `e3hand${this.tool === 'hand' || this.hand.isDown ? 'c' : ''}`; this.hand.dirty();
    this.nuke.faceOverride = `e3rmsn${this.tool === 'nuke' || this.nuke.isDown ? 'c' : ''}`; this.nuke.dirty();
  }
  scroll(d) { // FCmdScroll ±nxFrame
    this.top = Math.max(0, Math.min(this.items.length - 1, this.top + d));
    this.sync();
  }

  cellDown(i) {
    const idx = this.top + i;
    if (idx >= this.items.length) return;
    if (this.tool === 'nuke') { // FCmdNuke: drop the scene, keep selection valid
      this.items.splice(idx, 1);
      if (idx < this.cur) this.cur--;
      if (this.cur >= this.items.length) this.cur = this.items.length - 1;
      if (this.top >= this.items.length && this.top > 0) this.top -= 3;
      this.sync();
      return;
    }
    if (idx !== this.cur) { this.cur = idx; this.sync(); return; } // FCmdSelect on mouse-down
    this.dragStart(i); // mouse-down on the already-selected frame with hand -> drag
  }

  dragStart(i) {
    const cell = this.cells[i];
    this.ghost.visible = true;
    this.ghost.x = cell.x; this.ghost.y = cell.y; this.ghost.dirty();
    this.bar.visible = true; this.bar.dirty();
    cell._drag = { grabX: 0, grabY: 0, to: this.cur, scrollTm: null };
  }
  dragMove(cell, m) {
    const dr = cell._drag; if (!dr) return;
    if (!dr.grabbed) { dr.grabX = m.x - cell.x; dr.grabY = m.y - cell.y; dr.grabbed = true; }
    const xn = Math.max(0, Math.min(405, m.x - SS_X - dr.grabX));  // xpFrameMax = dxpSSorter-dxpFrame+kdxpSSorterRight
    const yn = Math.max(0, Math.min(141, m.y - SS_Y - dr.grabY));  // ypFrameMax = dypSSorter-dypFrame
    this.ghost.x = SS_X + xn; this.ghost.y = SS_Y + yn; this.ghost.dirty();
    const col = xn < 10 ? 0 : Math.min(3, 1 + (((xn - 11) / 193) | 0)); // xFrame from easels.cht
    const row = (((yn + 70) / 141) | 0);                               // yFrame
    dr.to = Math.min(this.items.length, row * 3 + col);
    this.bar.x = SS_X + (xn < 10 ? 4 : 4 + 193 * (1 + (((xn - 11) / 193) | 0)));
    this.bar.y = SS_Y + 7 + 141 * row; this.bar.dirty();
    const my = m.y - SS_Y; // drag past the grid scrolls one row (kdtimDragScroll)
    clearTimeout(dr.scrollTm);
    if (my < 0 || my > 282) dr.scrollTm = setTimeout(() => {
      this.top = Math.max(0, Math.min(this.items.length - 1, this.top + (my < 0 ? -3 : 3))); this.sync();
    }, 200);
  }
  dragEnd(cell) {
    const dr = cell._drag; cell._drag = null; if (!dr) return;
    clearTimeout(dr.scrollTm); this.bar.visible = false; this.ghost.visible = false;
    const tt = Math.min(dr.to, this.items.length); // FCmdInsert: GL::Move(cur,to), ends at to-1 if to>cur
    if (tt !== this.cur) { const it = this.items.splice(this.cur, 1)[0]; const at = tt > this.cur ? tt - 1 : tt; this.items.splice(at, 0, it); this.cur = at; }
    this.sync();
  }

  importMovie() { // kidSSorterOpen -> FCmdPortfolio: append another movie's scenes
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const mv = parseMovie(new ChunkyFile(await f.arrayBuffer(), f.name));
        if (this.aridLim == null) this.aridLim = 1 + Math.max(0, ...player.movie.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid)));
        const batch = { srcCf: mv.cf, srcRoll: mv.rollCall, remap: new Map(), aridOff: this.aridLim };
        this.aridLim += 1 + Math.max(0, ...mv.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid))); // aridMin += aridLim
        for (const scen of mv.scenes) this.items.push({ scen, trans: scen.trans, batch });
        this.sync();
      } catch (err) { alert(`${f.name}: ${err.message}`); }
    };
    inp.click();
  }

  dismiss() { // FCmdDismiss exits via either button -> SetTool(toolDefault)
    ed.tool = 'none';
    for (const b of Object.values<any>(ed.toolBtns || {})) { b.classList.remove('on'); b._sync?.(); }
    closeBrowser();
  }

  applySort() { // cidSceneSortOk -> FSetCmvi: commit the working list into the movie
    const mv = player.movie;
    for (const it of this.items) {
      it.scen.trans = it.trans;
      if (!it.batch) continue;
      const { srcCf, srcRoll, remap, aridOff } = it.batch;
      const fix = (tg) => { // merge embedded (sid 0) chunks into this movie's cf (FClone + tag rewrite)
        if (!tg || tg.sid !== 0) return;
        if (!remap.has(tg.cno)) {
          const c = mv.cf?.adopt(srcCf, tg.ctg, tg.cno);
          remap.set(tg.cno, c ? c.cno : -1);
        }
        if (remap.get(tg.cno) < 0) { tg.sid = -1; return; }
        tg.cno = remap.get(tg.cno);
      };
      const s = it.scen;
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
    mv.scenes.push(...this.items.map((i) => i.scen)); // 0 scenes is legal — _iscen = ivNil
    setSelChid(-1); setTbSel(-1); setTbFocus(-1); selTbSels.clear();
    histClear(); // MVIE::FSetCmvi's caller does ClearUndo — sorter changes aren't undoable
    docMark();
    setPlaying(false); player.loadScene(Math.min(Math.max(0, this.cur), mv.scenes.length - 1));
    this.dismiss(); draw();
  }
}
export const showSceneSorter = () => { if (player) showEasel(new SorterEasel()); };

// record easel (easels.cht kidRecord*): e5par + length thermometer + name + mike/play/can/okay
export class RecorderEasel extends EaselView {
  constructor(kind) {
    super();
    this.kind = kind;
    this.mkImg('e5par', 202, 154, 236, 172);
    this.therm = new Therm(224, 184, 193, 22); // kidRecordSoundLength thermometer fill
    this.add(this.therm);
    this.inp = this.domInp(325, 229, 110, 21); // kidRecordSoundName (123,75)-(232,95)
    this.inp.maxLength = 40; this.inp.placeholder = t('easel.soundName');
    this.stream = null; this.rec = null; this.chunks = []; this.take = null;
    this.t0 = 0; this.raf = 0; this.stopP = null;
    this.mikeBtn = this.mkBtn('e5mike', 'e5mikes', 213, 269, 50, 48, async () => {
      if (this.rec?.state === 'recording') { this.stopRec(); this.syncMike(); }
      else { sounds.ensure(); await this.startRec(); this.syncMike(); }
    });
    this.mkBtn('e5play', 'e5plays', 265, 269, 50, 48, () => { this.stopRec(); if (this.take?.buf) sounds.preview({ buf: this.take.buf }); });
    this.mkBtn('e5can', 'e5canc', 329, 269, 50, 48, () => this.done(false));
    this.mkBtn('e5okay', 'e5okayc', 379, 269, 50, 48, () => this.done(true));
    setTimeout(() => this.inp.focus(), 0);
  }

  syncMike() { this.mikeBtn.faceOverride = `e5${this.rec?.state === 'recording' || this.mikeBtn.isDown ? 'mikes' : 'mike'}`; this.mikeBtn.dirty(); }
  stopTracks() { this.stream?.getTracks().forEach((tt) => tt.stop()); this.stream = null; }
  stopRec() { if (this.rec?.state === 'recording') this.rec.stop(); this.rec = null; }
  tick() {
    this.therm.f = ((performance.now() - this.t0) / 10000); this.therm.dirty();
    if (this.rec?.state === 'recording') this.raf = requestAnimationFrame(() => this.tick());
  }
  async startRec() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { console.warn('[record] unsupported'); return; }
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { console.warn('[record] mic denied:', e.message); return; }
    this.take = null; this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => this.chunks.push(e.data);
    const mime = this.rec.mimeType || 'audio/webm'; // capture now — rec is nulled by stopRec before onstop fires
    const rec = this.rec;
    this.stopP = new Promise<void>((res) => {
      rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: mime }), bytes = await blob.arrayBuffer();
        this.take = { buf: await decodeAudioBytes(bytes), bytes, mime };
        this.therm.f = (this.take.buf?.duration || 0) / 10; this.therm.dirty();
        this.stopTracks(); res();
      };
    });
    this.t0 = performance.now(); rec.start(); this.tick();
    setTimeout(() => { if (this.rec?.state === 'recording') this.stopRec(); }, 10000); // kdtsMaxRecord
  }
  async done(save) { // close easel -> back to the sound browser
    cancelAnimationFrame(this.raf); this.stopRec(); if (this.stopP) await this.stopP; this.stopTracks();
    if (save && this.take) await addUserSnd(this.kind, { name: this.inp.value.trim() || `recording ${userSnds.length + 1}`, buf: this.take.buf, bytes: this.take.bytes, mime: this.take.mime });
    showBrowser(this.kind);
  }
}
export const showRecorder = (kind) => showEasel(new RecorderEasel(kind));

// listener easel (easels.cht kidListenBackgroundBkgd/Actor): per-sty volume
// sliders + nukes + name-plate audition for this frame's sounds. Clicking an
// actor gives e4parmm (FX + Speech, MM variant when no plain sound of the sty
// exists); clicking empty space gives e4par (FX + Speech + Midi). Changes apply
// live; OK keeps them (the original ClearUndo's — easel edits aren't undoable),
// Cancel/Esc restores the open-time snapshot.
export class ListenerEasel extends EaselView {
  constructor(a) {
    super();
    this.a = a;
    const s = player.scene;
    const evs0 = a ? structuredClone(a.data.events) : structuredClone(s.frameEvents);
    setBrwsCleanup(() => this.restore(evs0)); // Esc/cancel closes via closeBrowser -> restores the snapshot
    const X = a ? 182 : 116, Y = 100; // e4parmm/e4par gob origins (pos3.chh)
    this.mkImg(a ? 'e4parmm' : 'e4par', X, Y, a ? 277 : 408, 236);
    // columns: sty, slider left/right, icon x, nuke x, name-plate x
    const cols = a
      ? [[STY.Sfx, 70, 120, 13, 98, 10], [STY.Speech, 201, 251, 144, 229, 141]]
      : [[STY.Sfx, 70, 120, 13, 101, 12], [STY.Speech, 201, 251, 144, 232, 143], [STY.Midi, 332, 382, 275, 363, 274]];
    for (const [sty, sl, sr, ix, nx, ex] of cols) this.buildCol(sty, X, Y, sl, sr, ix, nx, ex);
    this.mkBtn('e4can', 'e4canc', X + (a ? 149 : 280), Y + 183, 50, 48, () => closeBrowser());
    this.mkBtn('e4okay', 'e4okayc', X + (a ? 199 : 330), Y + 183, 50, 48, () => { setBrwsCleanup(null); closeBrowser(); });
  }

  restore(evs0) {
    const a = this.a;
    if (a) { a.data.events = a.events = structuredClone(evs0); a.nfrmCur = null; }
    else { const s = player.scene; s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(evs0)); }
    player.gotoFrame(player.frame); draw();
  }

  buildCol(sty, X, Y, sl, sr, ix, nx, ex) {
    const a = this.a;
    const q = a ? (a.fQuerySnd(sty, false) || (() => { const m = a.fQuerySnd(sty, true); return m && { ...m, mm: true }; })())
                : queryScenSnd(sty);
    if (!q) return;
    const mm = !!q.mm, colEls = [];
    const audition = () => { // LSND::Play: stop running movie sounds, play the tags
      if (q.vlm < 0) return;
      sounds.stopAll();
      sounds.play({ scope: a ? 'actor' : 'scene', arid: a?.data.arid, data: { tags: q.tags, sty, vlm: q.vlm, fLoop: q.fLoop } });
    };
    colEls.push(this.mkImg(mm ? 'e4mm' : q.tags.length > 1 ? 'e4queue' : q.fLoop ? 'e4loop' : 'e4snd', X + ix, Y + 117, 30, 30));
    const nm = new NamePlate(X + ex, Y + 150, 122, 20, sndName(q.tags), audition); // e4audit name plate (click = audition)
    this.add(nm); colEls.push(nm);
    const sld = new LisSlider(X + sl, Y + 20, sr - sl, 118, q.vlm, (vlm) => {
      q.vlm = vlm; // below the nuke line -> vlmNil/silent
      if (a) a.fSetVlmSnd(sty, mm, vlm); else setScenVlm(sty, vlm);
      audition(); // slider-up enqueues cidEaselPlay too
    });
    this.add(sld);
    colEls.push(sld, sld.th);
    colEls.push(this.mkBtn('e4nuke', 'e4nukec', X + nx, Y + 123, 21, 20, () => { // kidListenNuke*: delete + hide the column
      if (a) a.fDeleteSndCore(sty, mm); else remScenSnd(sty);
      for (const el of colEls) { el.visible = false; el.dirty?.(); }
      this.invalidate();
    }));
  }
}
export const showListenerEasel = (a) => { if (a || player?.scene) showEasel(new ListenerEasel(a)); };

// words create dialog (browser.cht kidBrwsTextCreate): book9 + story/scroll choices
export class WordsDlg extends EaselView {
  constructor() {
    super();
    this.mkImg('book9', 132, 48, 376, 209);
    this.mkBtn('e6stor', 'e6stors', 174, 97, 136, 78, () => { closeBrowser(); insTbox(true); });   // cidCreateTbox fFalse -> story box
    this.mkBtn('e6scr1', 'e6scr1s', 329, 96, 136, 78, () => { closeBrowser(); insTbox(false); }); // cidCreateTbox fTrue -> credits box
    this.mkBtn('cancel', 'cancelc', 430, 205, 50, 48, closeBrowser);  // preg (0,48): bottom-left
  }
}
export const showWords = () => showEasel(new WordsDlg());

// spletter easel (easels.cht kidSplt*, esl.cpp ESLT): e1par + APE preview + text
// input + font/shape/texture popups + transmogrify/rotate. New TDTs place via
// pendPlace (StartPlaceActor); editing an existing TDT swaps its template.
export const SPLT_POP = { // popdn.cht + pos3.chh — coords relative to e1par at (61,57)
  font: { x: 97, y: 189, w: 144, h: 132, fh: 23, bd: 3, page: 5, ay: 115 },
  shape: { x: 149, y: 129, w: 46, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
  mtrl: { x: 197, y: 129, w: 78, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
};
const SPLT_VIEWS = [M.identity(), M.rotY(Math.PI / 2), M.rotY(Math.PI), M.rotY(3 * Math.PI / 2), M.rotX(Math.PI / 2)]; // ChangeView's preset post-rotations

class PopCell extends FrmCell { // popdn cell: mbmp thumb centered in the frame border
  constructor(x, y, w, h, d, it, onPick) {
    super('d1frm', x, y, w, h, onPick);
    this.d = d; this.it = it;
  }
  drawInner(ctx) {
    const { d, it } = this;
    if (!it.mbmp) return;
    const s = Math.min((d.w - 2 * d.bd) / it.mbmp.width, (d.fh - 2 * d.bd) / it.mbmp.height);
    const cw = Math.max(1, Math.round(it.mbmp.width * s)), ch = Math.max(1, Math.round(it.mbmp.height * s));
    ctx.drawImage(mbmpCanvas(it.mbmp, cw, ch), (this.w - cw) / 2, (this.h - ch) / 2);
  }
}

export class SpletterEasel extends EaselView {
  constructor(editA) {
    super();
    this.editing = editA?.tmpl?.isTdt ? editA : null;
    const editing = this.editing;
    this.st = { // ESLT's working copy — GetTdtInfo/FGetMaterial read it on OK
      text: editing ? editing.tmpl.text : '3D Movie Maker', // vapp.GetStnProduct default
      tdts: editing ? editing.tmpl.tdts : TDTS.Normal,
      tagTdf: editing ? editing.tmpl.tagTdf : spltThumbs.font[0]?.tag,
      tagMtrl: !editing ? null : (editing._cost[0]?.fCmtl ? null : editing._cost[0]?.tag ?? null),
      mtrlDirty: false, // FGetMaterial(ibset) only fires when the easel touched it
      iview: 0,         // APE::_iview — ChangeView cycles 5 preset orientations
    };
    this.mkImg('e1par', 61, 57, 518, 366);
    const pv = offCv(492, 238); // APE preview canvas
    this.pvEl = new CvEl(pv, 74, 70, 492, 238);
    this.add(this.pvEl);
    this.inp = this.domInp(71, 379, 498, 34); // kidSpltEditBox — SNE with all text selected
    this.inp.maxLength = 50; this.inp.value = this.st.text; this.inp.placeholder = 'type 3D text';
    // APE preview: a live Actor over a rebuilt TDT (FChangeTdt -> PtdtDup+AdjustBody)
    const pr = this.pr = new THREE.WebGLRenderer({ canvas: pv });
    setBrwsCleanup(() => pr.dispose());
    this.pscene = new THREE.Scene();
    this.pcam = new THREE.PerspectiveCamera(25, 492 / 238, 0.1, 10000);
    this.pactr = null; this.meshes = [];
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.pop = null; // {kind, pg, bg, cells}
    // cidEaselFont/Shape/Texture -> FCmdStartPopup; transmogrify = SFL-shuffled
    // random shape+font+material; rotate = APE::ChangeView
    this.mkBtn('e1font', 'e1fonts', 97, 322, 50, 48, () => this.showPop('font'));
    this.mkBtn('e1shap', 'e1shaps', 147, 322, 50, 48, () => this.showPop('shape'));
    this.mkBtn('e1text', 'e1texts', 197, 322, 50, 48, () => this.showPop('mtrl'));
    this.mkBtn('e1tran', 'e1trans', 247, 322, 50, 48, () => this.transmogrify()); // FCmdTransmogrify — _psfl->LwNext picks
    this.mkBtn('e1rot', 'e1rots', 320, 322, 50, 48, () => { this.st.iview = (this.st.iview + 1) % 5; this.rebuild(); }); // APE::ChangeView
    this.mkBtn('e1can', 'e1canc', 443, 322, 50, 48, closeBrowser); // cidEaselCancel
    this.mkBtn('e1okay', 'e1okayc', 493, 322, 50, 48, () => this.commit()); // cidEaselOk -> _FAcceptChanges
    this.inp.oninput = () => { this.st.text = this.inp.value; this.rebuild(); }; // FTextChanged -> FChangeTdt(stn)
    this.rebuild();
    setTimeout(() => { this.inp.focus(); this.inp.select(); }, 0); // SNE starts with all text selected
  }

  pose() {
    const { pactr, meshes, pscene, pcam, box3, tmpB, cV, sV } = this;
    const w = pactr.partWorldMatrices();
    box3.makeEmpty();
    pactr.parts.forEach((p, i) => {
      if (!p.model) { if (meshes[i]) meshes[i].visible = false; return; }
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; pscene.add(m); }
      m.visible = true; m.material = renderer._material(p.mtrl, 0);
      m.geometry = renderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) {
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      pcam.position.set(cV.x, cV.y + r * 1.4, cV.z + r * 3.2); pcam.lookAt(cV);
    }
    this.pr.render(pscene, pcam);
    this.pvEl.dirty();
  }

  rebuild() { // APE::FChangeTdt — rebuild template+body from the working state
    const st = this.st;
    for (const m of this.meshes) if (m) this.pscene.remove(m);
    this.meshes = [];
    const tmpl = makeTdtTemplate(lib, st.text, st.tdts, st.tagTdf);
    this.pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: st.text, dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: null, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, tmpl, lib);
    this.pactr._setActnCel(0, 0);
    if (st.tagMtrl) { // FSetTdtMtrl: one material on the TDT's single body part set
      const m = lib.mtrl(st.tagMtrl);
      if (m) for (const p of this.pactr.parts) p.mtrl = m;
    }
    this.pactr.xfrm.cur = SPLT_VIEWS[st.iview]; // _matrixRotUpdate post-multiplies rest by xfrm.cur
    this.pactr._positionBody();
    this.pose();
  }

  // --- popups (popdn.cht kidSpltsFont/Shape/Color): gray sizer panel + d1frm
  // cells + d1up/d1dn page arrows; click picks+closes, outside/Esc cancels ---
  closePop() { if (!this.pop) return; this.remove(this.pop.bg); for (const c of this.pop.cells) this.remove(c); this.pop = null; this.invalidate(); }
  popPick(it) { // cidBrowserSelect+Ok: apply the pick and dismiss
    const st = this.st;
    if (this.pop.kind === 'font') { if (it.tag.cno !== st.tagTdf?.cno) st.tagTdf = it.tag; }
    else if (this.pop.kind === 'shape') st.tdts = it.tdts;
    else { st.tagMtrl = it.tag; st.mtrlDirty = true; }
    this.closePop(); this.rebuild();
  }
  popCells() {
    const pop = this.pop;
    for (const c of pop.cells) this.remove(c); pop.cells = [];
    const d = SPLT_POP[pop.kind], items = spltThumbs[pop.kind];
    const st = this.st;
    const cur = pop.kind === 'font' ? items.findIndex((i) => i.tag.cno === st.tagTdf?.cno)
      : pop.kind === 'shape' ? items.findIndex((i) => i.tdts === st.tdts)
      : items.findIndex((i) => i.tag.cno === st.tagMtrl?.cno);
    items.slice(pop.pg * d.page, pop.pg * d.page + d.page).forEach((it, i) => {
      const idx = pop.pg * d.page + i;
      const b = new PopCell(d.x, d.y + i * d.fh, d.w, d.fh, d, it, () => this.popPick(it));
      b.sel = idx === cur;
      this.add(b);
      pop.cells.push(b);
    });
    const last = Math.ceil(items.length / d.page) - 1;
    for (const [bmp, off, pg] of ([['d1up', 0, 0], ['d1dn', d.w / 2, last]] as [string, number, number][])) { // up = first page, dn = last
      const b = new StBtn(bmp, bmp + 's', d.x + off, d.y + d.ay, d.w / 2, d.h - d.ay,
        () => { if (this.pop.pg !== pg) { this.pop.pg = pg; this.popCells(); } });
      this.add(b);
      pop.cells.push(b);
    }
    this.invalidate();
  }
  showPop(kind) {
    if (this.pop?.kind === kind) return this.closePop();
    this.closePop();
    if (!spltThumbs[kind].length) return;
    const d = SPLT_POP[kind];
    const bg = new Element(d.x, d.y, d.w, d.h);
    bg.pickable = false;
    bg.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, d.w, d.h); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, d.w - 1, d.h - 1); };
    this.pop = { kind, pg: 0, cells: [], bg };
    this.add(bg);
    this.popCells();
  }
  onPointerDown(e) { // outside the popup -> cidBrowserCancel
    const hit = this.hitTest(e.x, e.y);
    if (this.pop && hit !== this.pop.bg && !this.pop.cells.includes(hit)) this.closePop();
  }

  transmogrify() { // FCmdTransmogrify — _psfl->LwNext picks
    const st = this.st;
    const rnd = (n, cur) => { let v = cur; while (n > 1 && v === cur) v = (Math.random() * n) | 0; return v; };
    st.tdts = rnd(10, st.tdts);
    const fi = spltThumbs.font.findIndex((f) => f.tag.cno === st.tagTdf?.cno);
    if (spltThumbs.font.length) st.tagTdf = spltThumbs.font[rnd(spltThumbs.font.length, fi)].tag;
    const mi = spltThumbs.mtrl.findIndex((m) => m.tag.cno === st.tagMtrl?.cno);
    if (spltThumbs.mtrl.length) { st.tagMtrl = spltThumbs.mtrl[rnd(spltThumbs.mtrl.length, mi)].tag; st.mtrlDirty = true; }
    this.rebuild();
  }

  commit() { // cidEaselOk -> _FAcceptChanges
    const st = this.st, editing = this.editing;
    const text = st.text;
    if (!/[^ ]/.test(text)) return closeBrowser(); // all-space text treated as cancel
    if (editing) { // FChangeActrTdt + costume on the live actor
      const a = editing, chid = chidOf(a), rec = a.data, oldTag = rec.tagTmpl, oldName = rec.name;
      const evs0 = structuredClone(rec.events);
      const changed = text !== a.tmpl.text || st.tdts !== a.tmpl.tdts ||
        st.tagTdf.cno !== a.tmpl.tagTdf.cno || st.tagTdf.sid !== a.tmpl.tagTdf.sid;
      const swap = (tag, name) => { // rebuild the actor from the (new) template tag
        rec.tagTmpl = tag; rec.name = name;
        player.loadScene(player.sceneIndex); player.gotoFrame(player.frame);
      };
      opExec({ do: () => {
          if (changed) swap(lib.addTmpl(makeTdtTemplate(lib, text, st.tdts, st.tagTdf)), text);
          if (st.mtrlDirty && st.tagMtrl) player.actors.get(chid)?.setCostumeCore(0, st.tagMtrl, 0, false);
          draw();
        },
        undo: () => {
          swap(oldTag, oldName);
          const live = player.actors.get(chid);
          if (live) { live.data.events = live.events = structuredClone(evs0); live.nfrmCur = null; player.gotoFrame(player.frame); }
          draw();
        } });
      closeBrowser();
    } else { // new TDT: FInsTdt happens at the drop point (StartPlaceActor)
      setPendPlace({ tdt: { text, tdts: st.tdts, tagTdf: st.tagTdf, tagMtrl: st.mtrlDirty ? st.tagMtrl : null } });
      if (ed.view) ed.view.cursor = 'crosshair';
      closeBrowser(); draw();
    }
  }
}
export const showSpletter = (editA) => {
  const editing = editA?.tmpl?.isTdt ? editA : null;
  if (!editing && !player) return;
  showEasel(new SpletterEasel(editA));
};

// action browser (browser.cht kidBrwsAction + pos3.chh): book5 at (62,100), 2x10 ACTN
// name grid, live cel-cycling preview pane w/ cel fwd/back, OK applies an Actn event
class ActnCell extends FrmCell { // frame5 name cell
  constructor(x, y, onPick) {
    super('frame5', x, y, 138, 25, onPick);
    this.it = null; this.idx = 0;
  }
  draw(ctx) {
    if (!this.it) { this.visible = false; return; }
    this.visible = true;
    super.draw(ctx);
  }
  drawInner(ctx) {
    ctx.fillStyle = '#222'; ctx.font = "10px 'Comic Sans MS', cursive, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.it.name, this.w / 2, this.h / 2, this.w - 8);
  }
}

export class ActionBrowser extends EaselView {
  constructor(a, acts) {
    super();
    this.a = a; this.acts = acts;
    const X = 62, Y = 100; // book5 origin — child gob positions are relative to it
    this.mkImg('book5', X, Y, 516, 372);
    this.num = new Txt('', X + 123, Y + 330, 64, 29, { size: 15 });
    this.add(this.num);
    // APE preview pane (312,12)-(496,282): small second renderer posing the action
    const pcv = offCv(184, 270);
    this.pvEl = new CvEl(pcv, X + 312, Y + 12, 184, 270);
    this.add(this.pvEl);
    const pr = this.pr = new THREE.WebGLRenderer({ canvas: pcv });
    this.pscene = new THREE.Scene();
    this.pcam = new THREE.PerspectiveCamera(25, 184 / 270, 0.1, 10000);
    this.pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, a.tmpl, a.lib);
    this.pactr._setDefaultCost();
    this.meshes = this.pactr.parts.map(() => null); // lazily created — parts gain models on _setActnCel
    // celn cycles in the preview; celnStart is what OK applies (BRWA::_celnStart —
    // 0 until the user touches the cel buttons, which stop the cycling)
    this.anid = a.anid || acts[0].anid; this.celn = 0; this.ccel = 1; this.celnStart = 0; this.cycling = false;
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.page = 0; this.sel = -1;
    this.cells = [];
    const perPage = 20;
    for (let i = 0; i < perPage; i++) { // frame5 name cells at rel (15+143c, 32+28r)
      const c = i % 2, r = Math.floor(i / 2);
      const b = new ActnCell(X + 15 + c * 143, Y + 32 + r * 28, (cell) => this.pick(cell));
      b.idx = i;
      this.add(b); this.cells.push(b);
    }
    this.tick = setInterval(() => { if (this.cycling) { this.celn = (this.celn + 1) % this.ccel; this.pose(); } }, 1000 / FPS); // APE cycles cels
    setBrwsCleanup(() => { clearInterval(this.tick); pr.dispose(); });
    this.mkBtn('fwd', 'fwdc', X + 204, Y + 320, 59, 46, () => { this.page = Math.min(this.nPages() - 1, this.page + 1); this.render(); });
    this.mkBtn('bback', 'bbackc', X + 54, Y + 320, 59, 46, () => { this.page = Math.max(0, this.page - 1); this.render(); });
    this.mkBtn('b5celbk', 'b5celbks', X + 447, Y + 290, 27, 16, () => this.step(-1));
    this.mkBtn('b5celfw', 'b5celfws', X + 475, Y + 290, 27, 16, () => this.step(1));
    this.mkBtn('okay', 'okayc', X + 431, Y + 320, 50, 48, () => this.commit()); // gob pos is bottom-left (preg 0,48)
    this.mkBtn('cancel', 'cancelc', X + 381, Y + 320, 50, 48, closeBrowser);
    this.render();
    this.setAnid(this.anid);
  }

  nPages() { return Math.max(1, Math.ceil(this.acts.length / 20)); }
  pose() {
    const { pactr, meshes, pscene, pcam, box3, tmpB, cV, sV } = this;
    pactr._setActnCel(this.anid, this.celn); pactr._positionBody();
    const w = pactr.partWorldMatrices();
    box3.makeEmpty();
    pactr.parts.forEach((p, i) => {
      if (!p.model) return;
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; m.material = renderer._material(p.mtrl, 0); pscene.add(m); }
      m.geometry = renderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) { // ~APE::SetCustomView(0,-30,0) orbit framing
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      pcam.position.set(cV.x, cV.y + r * 2, cV.z + r * 3.6); pcam.lookAt(cV);
    }
    this.pr.render(pscene, pcam);
    this.pvEl.dirty();
  }
  setAnid(an) {
    this.anid = an;
    const act = this.pactr._actn(an);
    this.ccel = act ? act.cels.length : 1;
    this.celn = 0; this.celnStart = 0; this.cycling = true; this.pose();
  }
  step(d) {
    if (this.cycling) { this.cycling = false; this.celnStart = this.celn; }
    this.celnStart = (this.celnStart + d + this.ccel) % this.ccel;
    this.celn = this.celnStart; this.pose();
  }
  pick(b) {
    this.sel = this.page * 20 + b.idx;
    for (const o of this.cells) { o.sel = o === b; o.dirty(); }
    this.setAnid(b.it.anid);
  }
  render() {
    this.num.textContent = t('ui.pageNum', { page: this.page + 1, total: this.nPages() });
    this.cells.forEach((b, i) => { b.it = this.acts[this.page * 20 + i] || null; b.sel = this.page * 20 + i === this.sel; b.dirty(); });
    this.invalidate();
  }
  commit() { // FSetAction(anid, celnStart, fFalse): Actn+Freeze(+Step) inserted at cursor, executed now
    const a = this.a;
    if (this.sel >= 0) {
      const an = this.acts[this.sel].anid, cn = this.celnStart, d = a.data;
      const evs0 = structuredClone(d.events);
      const reval = () => { a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      opExec({ do: () => { a.setActionCore(an, cn, false); draw(); },
               undo: () => { d.events = a.events = structuredClone(evs0); reval(); } });
      // BRWA::_ApplySelection arms toolRecordSameAction after applying
      ed.toolBtns?.['2cont']?.onclick();
    }
    closeBrowser(); draw();
  }
}
export const showActionBrowser = () => {
  if (!player) return;
  const a = selActor() || [...player.actors.values()].find((x) => x.onStage);
  if (!a) return; // original requires a selected actor
  setSelChid(chidOf(a)); syncRollCall();
  const tmpl = a.tmpl;
  const acts = tmpl.cf.kidsOf('TMPL', tmpl.cno, 'ACTN').map((k) => ({ anid: k.chid, name: tmpl.cf.get('ACTN', k.cno).name || `action ${k.chid}` }));
  if (!acts.length) return;
  showEasel(new ActionBrowser(a, acts));
};

// costume easel (easels.cht kidCost*, ESLA): e2par bg at (102,100) 436x347;
// preview (112,109)-(528,339); name edit (110,415); buttons costumes/accessories/
// rotate/cancel/ok at y=356. Clicking a body part cycles its CMTL costumes;
// accessories mode cycles the part's accessory set (APE::_FIncCmtl).
class CostModeBtn extends StBtn { // costumes/accessories are radio-selected (kstSelected face)
  constructor(up, dn, x, f, esl) {
    super(up, dn, x, 356, 50, 48, () => { esl.fAcc = f; esl.syncModes(); });
    this.f = f; this.up = up; this.dn = dn; this.esl = esl;
  }
  syncMode() { this.faceOverride = this.esl.fAcc === this.f ? this.dn : this.up; this.dirty(); }
}

export class CostumeEasel extends EaselView {
  constructor(a) {
    super();
    this.a = a; this.tmpl = a.tmpl;
    const tmpl = this.tmpl;
    this.mkImg('e2par', 102, 100, 436, 347);
    const pcv = offCv(416, 230); // preview frame (10,9)-(426,239) rel to bg
    this.pvEl = new CvEl(pcv, 112, 109, 416, 230);
    this.pvEl.pickable = true; this.pvEl.cursor = 'pointer';
    this.add(this.pvEl);
    this.inp = this.domInp(110, 415, 420, 24); // kidCostEditBox (8,315)-(427,339)
    this.inp.maxLength = 50; this.inp.value = a.data.name || '';
    const pr = this.pr = new THREE.WebGLRenderer({ canvas: pcv });
    this.pscene = new THREE.Scene();
    this.pcam = new THREE.PerspectiveCamera(25, 416 / 230, 0.1, 10000);
    this.pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, tmpl, a.lib);
    this.pactr._setDefaultCost();
    for (const c of Object.values(a._cost || {})) this.applyCost(this.pactr, c); // start from the actor's current costume
    this.pending = {} as Record<string, any>; // ibset -> {fCmtl:true, cmid} picked in this session; OK commits them
    this.meshes = this.pactr.parts.map(() => null);
    this.box3 = new THREE.Box3(); this.tmpB = new THREE.Box3();
    this.cV = new THREE.Vector3(); this.sV = new THREE.Vector3();
    this.viewAng = Math.PI / 6;
    this.fAcc = false; // costumes vs accessories mode (kidCostCostumes/kidCostAccessories)
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.pvEl.onPointerDown = (e) => this.pickPart(e); // click a body part -> next costume for its ibset
    setBrwsCleanup(() => pr.dispose());
    this.costB = new CostModeBtn('e2cost', 'e2costs', 134, false, this);
    this.accB = new CostModeBtn('e2acc', 'e2accs', 218, true, this);
    this.add(this.costB); this.add(this.accB);
    this.syncModes();
    this.mkBtn('e2rot', 'e2rots', 302, 356, 50, 48, () => { this.viewAng += Math.PI / 4; this.pose(); }); // kidCostRotate -> ChangeView
    this.mkBtn('e2can', 'e2canc', 406, 356, 50, 48, closeBrowser); // cidEaselCancel (Esc also reaches this)
    this.mkBtn('e2okay', 'e2okayc', 456, 356, 50, 48, () => this.commit()); // cidEaselOk: commit costume events + name
    this.pose();
  }

  applyCost(act, c) { // mirror _doAevCore AET.Cost
    const tmpl = this.tmpl, a = this.a;
    if (c.fCmtl) act._applyCmtl(templateCmtl(tmpl, c.cmid));
    else { const m = a.lib.mtrl(c.tag); if (m) for (let i = 0; i < act.parts.length; i++) if (tmpl.ibsets[i] === c.ibset) act.parts[i].mtrl = m; }
    act._cost[c.ibset] = { ...c };
  }
  pose() {
    const { pactr, meshes, pscene, pcam, box3, tmpB, cV, sV, a } = this;
    pactr._setActnCel(a.anid || 0, 0); pactr._positionBody();
    const w = pactr.partWorldMatrices();
    box3.makeEmpty();
    pactr.parts.forEach((p, i) => {
      if (!p.model) { if (meshes[i]) meshes[i].visible = false; return; }
      let m = meshes[i];
      if (!m) { m = meshes[i] = new THREE.Mesh(); m.matrixAutoUpdate = false; m.material = renderer._material(p.mtrl, 0); m.userData.ipar = i; pscene.add(m); }
      m.visible = true; m.material = renderer._material(p.mtrl, 0);
      m.geometry = renderer._geometry(p.model);
      m.matrix.copy(toMatrix4(w[i]));
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); box3.union(tmpB.copy(g.boundingBox).applyMatrix4(m.matrix));
    });
    if (!box3.isEmpty()) {
      box3.getCenter(cV); const r = Math.max(4, box3.getSize(sV).length() / 2);
      pcam.position.set(cV.x + r * 3.6 * Math.sin(this.viewAng), cV.y + r * 1.8, cV.z + r * 3.6 * Math.cos(this.viewAng));
      pcam.lookAt(cV);
    }
    this.pr.render(pscene, pcam);
    this.pvEl.dirty();
  }

  // APE::_FIncCmtl helpers — which ibsets are accessory sets, and next-costume cycling
  cmtlHasModel(cmid) { const c = templateCmtl(this.tmpl, cmid); return !!c && c.parts.some((p) => p.model); }
  bsetIsAcc(b) { return this.cmtlHasModel(this.tmpl.cmids[b]?.[0]); }
  ibsetOnlyAcc() { let only; for (let b = 0; b < this.tmpl.cbset; b++) if (this.bsetIsAcc(b)) { if (only !== undefined) return undefined; only = b; } return only; }
  accOf(ibset) {
    const tmpl = this.tmpl;
    if (this.bsetIsAcc(ibset)) return ibset;
    const only = this.ibsetOnlyAcc();
    if (only !== undefined) return only; // single accessory set applies to any costume click
    for (let b = 0; b < tmpl.cbset; b++) if (this.bsetIsAcc(b))
      for (let i = 0; i < tmpl.ibsets.length; i++)
        if (tmpl.ibsets[i] === b && tmpl.ibsets[tmpl.parents[i]] === ibset) return b;
    return undefined;
  }
  sameAcc(cmid1, cmid2) { // TMPL::FSameAccCmids: same accessory = same model set
    const c1 = templateCmtl(this.tmpl, cmid1), c2 = templateCmtl(this.tmpl, cmid2);
    if (!c1 || !c2 || c1.parts.length !== c2.parts.length) return false;
    return c1.parts.every((p, k) => (p.model || null) === (c2.parts[k].model || null));
  }
  cmidNext(ibset, cmidCur, fAcc) { // APE::_CmidNext: accessories cycle within the same model set
    const list = this.tmpl.cmids[ibset] || [], i0 = Math.max(0, list.indexOf(cmidCur));
    for (let d = 1; d < list.length; d++) {
      const nx = list[(i0 + d) % list.length];
      if (fAcc ? !this.sameAcc(cmidCur, nx) : this.sameAcc(cmidCur, nx)) return nx;
    }
    return cmidCur;
  }
  cmidCur(ibset) { return this.pending[ibset]?.cmid ?? (this.pactr._cost[ibset]?.fCmtl ? this.pactr._cost[ibset].cmid : this.tmpl.cmids[ibset]?.[0]); }
  incCmtl(ibset) {
    if (this.fAcc) { const b = this.accOf(ibset); if (b === undefined) return; ibset = b; }
    if (!(this.tmpl.cmids[ibset] || []).length) return;
    const cmid = this.cmidNext(ibset, this.cmidCur(ibset), this.fAcc);
    this.pending[ibset] = { ibset, cmid, fCmtl: true };
    this.applyCost(this.pactr, this.pending[ibset]);
    this.pose();
  }
  pickPart(e) { // click a body part -> next costume for its ibset
    this.ndc.set((e.x - this.pvEl.x) / this.pvEl.w * 2 - 1, 1 - (e.y - this.pvEl.y) / this.pvEl.h * 2);
    this.ray.setFromCamera(this.ndc, this.pcam);
    const hit = this.ray.intersectObjects(this.meshes.filter(Boolean), false)[0];
    if (hit) this.incCmtl(this.tmpl.ibsets[hit.object.userData.ipar]);
  }
  syncModes() { this.costB.syncMode(); this.accB.syncMode(); }

  commit() { // cidEaselOk: commit costume events + name
    const a = this.a;
    const changes = Object.values<any>(this.pending), nameNew = this.inp.value.trim() || a.data.name;
    if (changes.length || nameNew !== a.data.name) {
      const evs0 = structuredClone(a.data.events), name0 = a.data.name;
      const reval = (evs, nm) => { a.data.events = a.events = structuredClone(evs); a.data.name = nm;
        a.nfrmCur = null; player.gotoFrame(player.frame); draw(); syncRollCall(); };
      opExec({ do: () => { a.data.name = nameNew;
          for (const c of changes) a.setCostumeCore(c.ibset, null, c.cmid, true);
          draw(); syncRollCall(); },
        undo: () => reval(evs0, name0) });
    }
    closeBrowser(); draw();
  }
}
export const showCostumeEasel = (a) => {
  if (!player || !a || !a.onStage) return;
  const tmpl = a.tmpl;
  if (tmpl.isTdt || !tmpl.cbset) return; // TDTs use the spletter easel; props without part sets do nothing
  setSelChid(chidOf(a)); syncRollCall(); draw();
  showEasel(new CostumeEasel(a));
};
