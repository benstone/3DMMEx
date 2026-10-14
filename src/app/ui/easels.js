import * as M from '../../engine/mat34.js';
import * as THREE from 'three';
import { Actor } from '../../engine/actor.js';
import { FPS } from '../../engine/player.js';
import { ChunkyFile } from '../../format/chunky.js';
import { parseMbmp, STY, TDTS, makeTdtTemplate, templateCmtl } from '../../format/content.js';
import { parseMovie } from '../../format/movie.js';
import { toMatrix4 } from '../../render/renderer.js';
import { docMark } from '../doc.js';
import { selActor, chidOf } from '../edit/movie.js';
import { queryScenSnd, setScenVlm, remScenSnd } from '../edit/sound.js';
import { setTbSel, setTbFocus, insTbox } from '../edit/tbox.js';
import { setPlaying, draw } from '../loop.js';
import { addUserSnd, userSnds, decodeAudioBytes, sndName } from '../sndsrc.js';
import { player, ed, setSelChid, selTbSels, sounds, renderer, lib, setPendPlace } from '../state.js';
import { mbmpCanvas, spltThumbs } from '../thumbs.js';
import { histClear, opExec } from '../undo.js';
import { closeBrowser, showBrowser, setBrwsCleanup } from './browser.js';
import { EaselView, CvEl, offCv, showEasel } from './easel.js';
import { Element } from './element.js';
import { Img, StBtn, Txt } from './widgets.js';
import { texImg, imgReady } from './img.js';
import { syncRollCall } from './studio.js';
import { t } from '../i18n.js';
// --- scene sorter easel (easels.cht kidSSorter*; scnsort.cpp SCRT) -----------
// e3par panel at (20,65) 600x350; 6 frame cells 185x126 at (10+c*193,12+r*141);
// thumb rect (8,12)-(151,92); transition buttons at (156,11/33/55/77). Edits a
// working scene list (the CMVI); OK commits reorder/nuke/trans/appends, Esc or
// cancel discards. Sorter changes are not undoable (MVIE::ClearUndo on OK).
export function showSceneSorter() {
  if (!player) return;
  const V = new EaselView();
  V.mkImg('e3par', 20, 65, 600, 350);
  const PX = 20, PY = 65; // panel origin in studio coords
  const T4 = [0, 3, 1, 2]; // SCRT::_mplwtrans = {transCut, transDissolve, transFadeToBlack, transFadeToWhite}
  const items = player.movie.scenes.map((scen) => ({ scen, trans: scen.trans, batch: null }));
  let cur = Math.max(0, player.sceneIndex), top = Math.floor(cur / 6) * 6, tool = 'hand';
  let aridLim = null; // appended actors get arids above the current movie's max

  const thumbCv = (scen) => {
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
  };

  class SCell extends Element { // frame + thumb + 4 transition cells
    constructor(i) {
      const cx = PX + 10 + (i % 3) * 193, cy = PY + 12 + (i / 3 | 0) * 141;
      super(cx, cy, 185, 126);
      this.i = i; this.cursor = 'pointer';
      /** @type {any} */ this._drag = null;
      this.tbs = T4.map((tt, j) => {
        const b = new StBtn(`e3trn${j + 1}`, `e3trn${j + 1}s`, cx + 156, cy + 11 + 22 * j, 20, 17,
          () => { const it = items[top + i]; if (it) { it.trans = T4[j]; sync(); } }); // FCmdTransition
        V.add(b);
        return b;
      });
    }
    it() { return items[top + this.i]; }
    draw(ctx) {
      const it = this.it();
      if (!it) { this.visible = false; for (const b of this.tbs) b.visible = false; return; }
      this.visible = true;
      const fr = texImg(top + this.i === cur ? 'e3frms' : 'e3frm', () => this.dirty());
      if (imgReady(fr)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, 0, 0, 185, 126); }
      ctx.drawImage(thumbCv(it.scen), 8, 12, 143, 80);
      for (const [j, b] of this.tbs.entries()) {
        b.visible = true;
        b.faceOverride = `e3trn${j + 1}${it.trans === T4[j] ? 's' : ''}`;
      }
    }
    onPointerDown() { cellDown(this.i); }
    onPointerMove(p) { if (this._drag) dragMove(this, p); }
    onPointerUp() { if (this._drag) dragEnd(this); }
  }
  const cells = [];
  for (let i = 0; i < 6; i++) { const c = new SCell(i); cells.push(c); V.add(c); }

  const bar = V.mkImg('ssbar', 0, 0, 250, 140); // drop-position indicator
  bar.visible = false;

  // drag ghost (idSelFrame) — follows the pointer with the selected thumb
  const ghost = new Element(0, 0, 185, 126);
  ghost.pickable = false; ghost.visible = false;
  ghost.draw = (ctx) => {
    const fr = texImg('e3frms', () => ghost.dirty());
    if (imgReady(fr)) ctx.drawImage(fr, 0, 0, 185, 126);
    if (items[cur]) ctx.drawImage(thumbCv(items[cur].scen), 8, 12, 143, 80);
  };
  V.add(ghost);

  const hand = new StBtn('e3hand', 'e3handc', PX + 25, PY + 298, 50, 48, () => { tool = 'hand'; syncTools(); });
  const nuke = new StBtn('e3rmsn', 'e3rmsm', PX + 80, PY + 298, 50, 48, () => { tool = 'nuke'; syncTools(); });
  V.add(hand); V.add(nuke);
  const syncTools = () => {
    hand.faceOverride = `e3hand${tool === 'hand' || hand.isDown ? 'c' : ''}`; hand.dirty();
    nuke.faceOverride = `e3rmsn${tool === 'nuke' || nuke.isDown ? 'c' : ''}`; nuke.dirty();
  };
  const sup = new Element(PX + 580, PY + 2, 17, 19);
  const sdn = new Element(PX + 580, PY + 273, 17, 19);
  for (const [el, d, up] of /** @type {[Element & {_dn: boolean, _up: string}, number, string][]} */ ([[sup, -1, 'e3up'], [sdn, 1, 'e3down']])) {
    el.cursor = 'pointer'; el._dn = false; el._up = up;
    el.draw = (ctx) => { const im = texImg(`${el._up}${el._dn ? 'c' : ''}`, () => el.dirty()); if (imgReady(im)) ctx.drawImage(im, 0, 0, el.w, el.h); };
    let tm = null;
    const step = () => { top = Math.max(0, Math.min(items.length - 1, top + d * 3)); sync(); }; // FCmdScroll ±nxFrame
    el.onPointerDown = () => {
      el._dn = true; el.dirty(); step();
      let del = 250;
      const go = () => { step(); del = Math.max(80, del - 20); tm = setTimeout(go, del); };
      tm = setTimeout(go, del);
      return true;
    };
    el.onPointerUp = el.onPointerLeave = () => { el._dn = false; el.dirty(); clearTimeout(tm); };
    V.add(el);
  }

  function sync() { // _FResetThumbnails + _EnableScroll
    sup.visible = top > 0;
    sdn.visible = top + 6 < items.length;
    for (const c of cells) c.dirty(); // draw() computes visibility/faces
    V.invalidate();
  }

  function cellDown(i) {
    const idx = top + i;
    if (idx >= items.length) return;
    if (tool === 'nuke') { // FCmdNuke: drop the scene, keep selection valid
      items.splice(idx, 1);
      if (idx < cur) cur--;
      if (cur >= items.length) cur = items.length - 1;
      if (top >= items.length && top > 0) top -= 3;
      sync();
      return;
    }
    if (idx !== cur) { cur = idx; sync(); return; } // FCmdSelect on mouse-down
    dragStart(i); // mouse-down on the already-selected frame with hand -> drag
  }

  function dragStart(i) {
    const cell = cells[i];
    ghost.visible = true;
    ghost.x = cell.x; ghost.y = cell.y; ghost.dirty();
    bar.visible = true; bar.dirty();
    cell._drag = { grabX: 0, grabY: 0, to: cur, scrollTm: null };
  }
  function dragMove(cell, m) {
    const dr = cell._drag; if (!dr) return;
    if (!dr.grabbed) { dr.grabX = m.x - cell.x; dr.grabY = m.y - cell.y; dr.grabbed = true; }
    const xn = Math.max(0, Math.min(405, m.x - PX - dr.grabX));  // xpFrameMax = dxpSSorter-dxpFrame+kdxpSSorterRight
    const yn = Math.max(0, Math.min(141, m.y - PY - dr.grabY));  // ypFrameMax = dypSSorter-dypFrame
    ghost.x = PX + xn; ghost.y = PY + yn; ghost.dirty();
    const col = xn < 10 ? 0 : Math.min(3, 1 + (((xn - 11) / 193) | 0)); // xFrame from easels.cht
    const row = (((yn + 70) / 141) | 0);                               // yFrame
    dr.to = Math.min(items.length, row * 3 + col);
    bar.x = PX + (xn < 10 ? 4 : 4 + 193 * (1 + (((xn - 11) / 193) | 0)));
    bar.y = PY + 7 + 141 * row; bar.dirty();
    const my = m.y - PY; // drag past the grid scrolls one row (kdtimDragScroll)
    clearTimeout(dr.scrollTm);
    if (my < 0 || my > 282) dr.scrollTm = setTimeout(() => {
      top = Math.max(0, Math.min(items.length - 1, top + (my < 0 ? -3 : 3))); sync();
    }, 200);
  }
  function dragEnd(cell) {
    const dr = cell._drag; cell._drag = null; if (!dr) return;
    clearTimeout(dr.scrollTm); bar.visible = false; ghost.visible = false;
    const tt = Math.min(dr.to, items.length); // FCmdInsert: GL::Move(cur,to), ends at to-1 if to>cur
    if (tt !== cur) { const it = items.splice(cur, 1)[0]; const at = tt > cur ? tt - 1 : tt; items.splice(at, 0, it); cur = at; }
    sync();
  }

  V.mkBtn('e3port', 'e3portc', PX + 135, PY + 298, 50, 48, () => { // kidSSorterOpen -> FCmdPortfolio
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const mv = parseMovie(new ChunkyFile(await f.arrayBuffer(), f.name));
        if (aridLim == null) aridLim = 1 + Math.max(0, ...player.movie.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid)));
        const batch = { srcCf: mv.cf, srcRoll: mv.rollCall, remap: new Map(), aridOff: aridLim };
        aridLim += 1 + Math.max(0, ...mv.scenes.flatMap((s) => [...s.actors.values()].map((a) => a.arid))); // aridMin += aridLim
        for (const scen of mv.scenes) items.push({ scen, trans: scen.trans, batch });
        sync();
      } catch (err) { alert(`${f.name}: ${err.message}`); }
    };
    inp.click();
  });
  const dismiss = () => { // FCmdDismiss exits via either button -> SetTool(toolDefault)
    ed.tool = 'none';
    for (const b of Object.values(ed.toolBtns || {})) { b.classList.remove('on'); b._sync?.(); }
    closeBrowser();
  };
  V._onEsc = dismiss; // cancel-button CHILD_SCRIPT maps Escape to cidSceneSortCancel
  V.mkBtn('e3can', 'e3canc', PX + 465, PY + 298, 50, 48, dismiss);        // cidSceneSortCancel
  V.mkBtn('e3okay', 'e3okayc', PX + 515, PY + 298, 50, 48, applySort);    // cidSceneSortOk -> FSetCmvi

  function applySort() {
    const mv = player.movie;
    for (const it of items) {
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
    mv.scenes.push(...items.map((i) => i.scen)); // 0 scenes is legal — _iscen = ivNil
    setSelChid(-1); setTbSel(-1); setTbFocus(-1); selTbSels.clear();
    histClear(); // MVIE::FSetCmvi's caller does ClearUndo — sorter changes aren't undoable
    docMark();
    setPlaying(false); player.loadScene(Math.min(Math.max(0, cur), mv.scenes.length - 1));
    dismiss(); draw();
  }

  syncTools(); sync();
  showEasel(V);
}

// record easel (easels.cht kidRecord*): e5par + length thermometer + name + mike/play/can/okay
export function showRecorder(kind) {
  const V = new EaselView();
  V.mkImg('e5par', 202, 154, 236, 172);
  const fillEl = /** @type {Element & {_f: number}} */ (new Element(224, 184, 193, 22)); // kidRecordSoundLength thermometer fill
  fillEl.pickable = false; fillEl._f = 0;
  fillEl.draw = (ctx) => {
    ctx.fillStyle = '#cfe8ff'; ctx.fillRect(0, 0, fillEl.w, fillEl.h);
    ctx.fillStyle = '#3465a4'; ctx.fillRect(0, 0, fillEl.w * Math.min(1, fillEl._f), fillEl.h);
    ctx.strokeStyle = '#222'; ctx.strokeRect(0.5, 0.5, fillEl.w - 1, fillEl.h - 1);
  };
  V.add(fillEl);
  const inp = V.domInp(325, 229, 110, 21); // kidRecordSoundName (123,75)-(232,95)
  inp.maxLength = 40; inp.placeholder = t('easel.soundName');
  let stream = null, rec = null, chunks = [], take = null, t0 = 0, raf = 0, stopP = null;
  const stopTracks = () => { stream?.getTracks().forEach((tt) => tt.stop()); stream = null; };
  const done = async (save) => { // close easel -> back to the sound browser
    cancelAnimationFrame(raf); stopRec(); if (stopP) await stopP; stopTracks();
    if (save && take) await addUserSnd(kind, { name: inp.value.trim() || `recording ${userSnds.length + 1}`, buf: take.buf, bytes: take.bytes, mime: take.mime });
    showBrowser(kind);
  };
  const tick = () => {
    fillEl._f = ((performance.now() - t0) / 10000); fillEl.dirty();
    if (rec?.state === 'recording') raf = requestAnimationFrame(tick);
  };
  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { console.warn('[record] unsupported'); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { console.warn('[record] mic denied:', e.message); return; }
    take = null; chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const mime = rec.mimeType || 'audio/webm'; // capture now — rec is nulled by stopRec before onstop fires
    stopP = /** @type {Promise<void>} */ (new Promise((res) => {
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: mime }), bytes = await blob.arrayBuffer();
        take = { buf: await decodeAudioBytes(bytes), bytes, mime };
        fillEl._f = (take.buf?.duration || 0) / 10; fillEl.dirty();
        stopTracks(); res();
      };
    }));
    t0 = performance.now(); rec.start(); tick();
    setTimeout(() => { if (rec?.state === 'recording') stopRec(); }, 10000); // kdtsMaxRecord
  };
  const stopRec = () => { if (rec?.state === 'recording') rec.stop(); rec = null; };
  const mikeBtn = V.mkBtn('e5mike', 'e5mikes', 213, 269, 50, 48, async () => {
    if (rec?.state === 'recording') { stopRec(); mikeBtn._sync(); }
    else { sounds.ensure(); await startRec(); mikeBtn._sync(); }
  });
  mikeBtn._sync = () => { mikeBtn.faceOverride = `e5${rec?.state === 'recording' || mikeBtn.isDown ? 'mikes' : 'mike'}`; mikeBtn.dirty(); };
  V.mkBtn('e5play', 'e5plays', 265, 269, 50, 48, () => { stopRec(); if (take?.buf) sounds.preview({ buf: take.buf }); });
  V.mkBtn('e5can', 'e5canc', 329, 269, 50, 48, () => done(false));
  V.mkBtn('e5okay', 'e5okayc', 379, 269, 50, 48, () => done(true));
  setTimeout(() => inp.focus(), 0);
  showEasel(V);
}
// listener easel (easels.cht kidListenBackgroundBkgd/Actor): per-sty volume
// sliders + nukes + name-plate audition for this frame's sounds. Clicking an
// actor gives e4parmm (FX + Speech, MM variant when no plain sound of the sty
// exists); clicking empty space gives e4par (FX + Speech + Midi). Changes apply
// live; OK keeps them (the original ClearUndo's — easel edits aren't undoable),
// Cancel/Esc restores the open-time snapshot.
export function showListenerEasel(a) {
  const s = player.scene;
  if (!a && !s) return;
  const evs0 = a ? structuredClone(a.data.events) : structuredClone(s.frameEvents);
  const restore = () => {
    if (a) { a.data.events = a.events = structuredClone(evs0); a.nfrmCur = null; }
    else { s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(evs0)); }
    player.gotoFrame(player.frame); draw();
  };
  const V = new EaselView();
  setBrwsCleanup(restore); // Esc/cancel closes via closeBrowser -> restores the snapshot
  const X = a ? 182 : 116, Y = 100; // e4parmm/e4par gob origins (pos3.chh)
  V.mkImg(a ? 'e4parmm' : 'e4par', X, Y, a ? 277 : 408, 236);
  // columns: sty, slider left/right, icon x, nuke x, name-plate x
  const cols = a
    ? [[STY.Sfx, 70, 120, 13, 98, 10], [STY.Speech, 201, 251, 144, 229, 141]]
    : [[STY.Sfx, 70, 120, 13, 101, 12], [STY.Speech, 201, 251, 144, 232, 143], [STY.Midi, 332, 382, 275, 363, 274]];
  for (const [sty, sl, sr, ix, nx, ex] of cols) {
    const q = a ? (a.fQuerySnd(sty, false) || (() => { const m = a.fQuerySnd(sty, true); return m && { ...m, mm: true }; })())
                : queryScenSnd(sty);
    if (!q) continue;
    const mm = !!q.mm, colEls = [];
    const audition = () => { // LSND::Play: stop running movie sounds, play the tags
      if (q.vlm < 0) return;
      sounds.stopAll();
      sounds.play({ scope: a ? 'actor' : 'scene', arid: a?.data.arid, data: { tags: q.tags, sty, vlm: q.vlm, fLoop: q.fLoop } });
    };
    colEls.push(V.mkImg(mm ? 'e4mm' : q.tags.length > 1 ? 'e4queue' : q.fLoop ? 'e4loop' : 'e4snd', X + ix, Y + 117, 30, 30));
    const nm = new class extends Element { // e4audit name plate (click = audition)
      constructor() { super(X + ex, Y + 150, 122, 20); this.cursor = 'pointer'; this._dn = false; }
      draw(ctx) {
        const im = texImg(`e4audit${this._dn ? 'c' : ''}`, () => this.dirty());
        if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
        ctx.fillStyle = '#222'; ctx.font = "bold 9px 'Comic Sans MS', cursive, sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sndName(q.tags), this.w / 2, this.h / 2, this.w - 6);
      }
      onPointerDown() { this._dn = true; this.dirty(); }
      onPointerUp() { this._dn = false; this.dirty(); }
      onPointerLeave() { this._dn = false; this.dirty(); }
      onClick() { audition(); }
    }();
    V.add(nm); colEls.push(nm);
    const sld = /** @type {Element & {_yp: number, _move: (p: any) => void}} */ (new Element(X + sl, Y + 20, sr - sl, 118)); // volume track, thumb travels y 0..108
    sld.cursor = 'pointer'; sld._yp = 100 - Math.round(q.vlm * 101); // yPos = yNuke - vlm*FullDisplay/kvlmFull
    const th = V.mkImg('e4vol1', X + sl + 5, Y + 20 + sld._yp, 21, 11); // MoveAbsGob(kxpSliderThumb=5, yPos)
    sld.draw = () => {}; // track art is baked into the panel
    sld.onPointerDown = (p) => { sld._move(p); return true; };
    sld.onPointerMove = (p) => sld._move(p);
    sld._move = (p) => { sld._yp = Math.max(0, Math.min(108, p.y - (Y + 20))); th.y = Y + 20 + sld._yp; th.dirty(); };
    sld.onPointerUp = () => {
      q.vlm = sld._yp > 100 ? -1 : Math.max(0, (101 - sld._yp) / 101); // below the nuke line -> vlmNil/silent
      if (a) a.fSetVlmSnd(sty, mm, q.vlm); else setScenVlm(sty, q.vlm);
      audition(); // slider-up enqueues cidEaselPlay too
    };
    V.add(sld);
    colEls.push(sld, th);
    colEls.push(V.mkBtn('e4nuke', 'e4nukec', X + nx, Y + 123, 21, 20, () => { // kidListenNuke*: delete + hide the column
      if (a) a.fDeleteSndCore(sty, mm); else remScenSnd(sty);
      for (const el of colEls) { el.visible = false; el.dirty?.(); }
      V.invalidate();
    }));
  }
  V.mkBtn('e4can', 'e4canc', X + (a ? 149 : 280), Y + 183, 50, 48, () => closeBrowser());
  V.mkBtn('e4okay', 'e4okayc', X + (a ? 199 : 330), Y + 183, 50, 48, () => { setBrwsCleanup(null); closeBrowser(); });
  showEasel(V);
}
// words create dialog (browser.cht kidBrwsTextCreate): book9 + story/scroll choices
export function showWords() {
  const V = new EaselView();
  V.mkImg('book9', 132, 48, 376, 209);
  V.mkBtn('e6stor', 'e6stors', 174, 97, 136, 78, () => { closeBrowser(); insTbox(true); });   // cidCreateTbox fFalse -> story box
  V.mkBtn('e6scr1', 'e6scr1s', 329, 96, 136, 78, () => { closeBrowser(); insTbox(false); }); // cidCreateTbox fTrue -> credits box
  V.mkBtn('cancel', 'cancelc', 430, 205, 50, 48, closeBrowser);  // preg (0,48): bottom-left
  showEasel(V);
}
// spletter easel (easels.cht kidSplt*, esl.cpp ESLT): e1par + APE preview + text
// input + font/shape/texture popups + transmogrify/rotate. New TDTs place via
// pendPlace (StartPlaceActor); editing an existing TDT swaps its template.
export const SPLT_POP = { // popdn.cht + pos3.chh — coords relative to e1par at (61,57)
  font: { x: 97, y: 189, w: 144, h: 132, fh: 23, bd: 3, page: 5, ay: 115 },
  shape: { x: 149, y: 129, w: 46, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
  mtrl: { x: 197, y: 129, w: 78, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
};
export function showSpletter(editA) {
  const editing = editA?.tmpl?.isTdt ? editA : null;
  if (!editing && !player) return;
  const st = { // ESLT's working copy — GetTdtInfo/FGetMaterial read it on OK
    text: editing ? editing.tmpl.text : '3D Movie Maker', // vapp.GetStnProduct default
    tdts: editing ? editing.tmpl.tdts : TDTS.Normal,
    tagTdf: editing ? editing.tmpl.tagTdf : spltThumbs.font[0]?.tag,
    tagMtrl: !editing ? null : (editing._cost[0]?.fCmtl ? null : editing._cost[0]?.tag ?? null),
    mtrlDirty: false, // FGetMaterial(ibset) only fires when the easel touched it
    iview: 0,         // APE::_iview — ChangeView cycles 5 preset orientations
  };
  const V = new EaselView();
  V.mkImg('e1par', 61, 57, 518, 366);
  const pv = offCv(492, 238); // APE preview canvas
  const pvEl = new CvEl(pv, 74, 70, 492, 238);
  V.add(pvEl);
  const inp = V.domInp(71, 379, 498, 34); // kidSpltEditBox — SNE with all text selected
  inp.maxLength = 50; inp.value = st.text; inp.placeholder = 'type 3D text';
  // APE preview: a live Actor over a rebuilt TDT (FChangeTdt -> PtdtDup+AdjustBody)
  const pr = new THREE.WebGLRenderer({ canvas: pv });
  setBrwsCleanup(() => pr.dispose());
  const pscene = new THREE.Scene(), pcam = new THREE.PerspectiveCamera(25, 492 / 238, 0.1, 10000);
  let pactr = null, meshes = [];
  const box3 = new THREE.Box3(), tmpB = new THREE.Box3(), cV = new THREE.Vector3(), sV = new THREE.Vector3();
  const pose = () => {
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
    pr.render(pscene, pcam);
    pvEl.dirty();
  };
  const VIEW_MATS = [M.identity(), M.rotY(Math.PI / 2), M.rotY(Math.PI), M.rotY(3 * Math.PI / 2), M.rotX(Math.PI / 2)]; // ChangeView's preset post-rotations
  const rebuild = () => { // APE::FChangeTdt — rebuild template+body from the working state
    for (const m of meshes) if (m) pscene.remove(m);
    meshes = [];
    const tmpl = makeTdtTemplate(lib, st.text, st.tdts, st.tagTdf);
    pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: st.text, dxyzFullRte: { x: 0, y: 0, z: 0 },
      tagTmpl: null, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, tmpl, lib);
    pactr._setActnCel(0, 0);
    if (st.tagMtrl) { // FSetTdtMtrl: one material on the TDT's single body part set
      const m = lib.mtrl(st.tagMtrl);
      if (m) for (const p of pactr.parts) p.mtrl = m;
    }
    pactr.xfrm.cur = VIEW_MATS[st.iview]; // _matrixRotUpdate post-multiplies rest by xfrm.cur
    pactr._positionBody();
    pose();
  };
  // --- popups (popdn.cht kidSpltsFont/Shape/Color): gray sizer panel + d1frm
  // cells + d1up/d1dn page arrows; click picks+closes, outside/Esc cancels ---
  let pop = null; // {kind, pg, bg, cells}
  const closePop = () => { if (!pop) return; V.remove(pop.bg); for (const c of pop.cells) V.remove(c); pop = null; V.invalidate(); };
  const popPick = (it) => { // cidBrowserSelect+Ok: apply the pick and dismiss
    if (pop.kind === 'font') { if (it.tag.cno !== st.tagTdf?.cno) st.tagTdf = it.tag; }
    else if (pop.kind === 'shape') st.tdts = it.tdts;
    else { st.tagMtrl = it.tag; st.mtrlDirty = true; }
    closePop(); rebuild();
  };
  const popCells = () => {
    for (const c of pop.cells) V.remove(c); pop.cells = [];
    const d = SPLT_POP[pop.kind], items = spltThumbs[pop.kind];
    const cur = pop.kind === 'font' ? items.findIndex((i) => i.tag.cno === st.tagTdf?.cno)
      : pop.kind === 'shape' ? items.findIndex((i) => i.tdts === st.tdts)
      : items.findIndex((i) => i.tag.cno === st.tagMtrl?.cno);
    items.slice(pop.pg * d.page, pop.pg * d.page + d.page).forEach((it, i) => {
      const idx = pop.pg * d.page + i, sel = idx === cur;
      const b = new class extends Element {
        constructor() { super(d.x, d.y + i * d.fh, d.w, d.fh); this.cursor = 'pointer'; this._hov = false; }
        draw(ctx) {
          const im = texImg(`d1frm${sel || this._hov ? 'h' : ''}`, () => this.dirty());
          if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
          if (it.mbmp) { // thumb centered inside the frame border, aspect-preserved
            const s = Math.min((d.w - 2 * d.bd) / it.mbmp.width, (d.fh - 2 * d.bd) / it.mbmp.height);
            const cw = Math.max(1, Math.round(it.mbmp.width * s)), ch = Math.max(1, Math.round(it.mbmp.height * s));
            ctx.drawImage(mbmpCanvas(it.mbmp, cw, ch), (this.w - cw) / 2, (this.h - ch) / 2);
          }
        }
        onPointerEnter() { this._hov = true; this.dirty(); }
        onPointerLeave() { this._hov = false; this.dirty(); }
        onClick() { popPick(it); }
      }();
      V.add(b);
      pop.cells.push(b);
    });
    const last = Math.ceil(items.length / d.page) - 1;
    for (const [bmp, off, pg] of [['d1up', 0, 0], ['d1dn', d.w / 2, last]]) { // up = first page, dn = last
      const b = new StBtn(bmp, bmp + 's', d.x + off, d.y + d.ay, d.w / 2, d.h - d.ay,
        () => { if (pop.pg !== pg) { pop.pg = pg; popCells(); } });
      V.add(b);
      pop.cells.push(b);
    }
    V.invalidate();
  };
  const showPop = (kind) => {
    if (pop?.kind === kind) return closePop();
    closePop();
    if (!spltThumbs[kind].length) return;
    const d = SPLT_POP[kind];
    pop = { kind, pg: 0, cells: [], bg: new Element(d.x, d.y, d.w, d.h) };
    pop.bg.pickable = false;
    pop.bg.draw = (ctx) => { ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, d.w, d.h); ctx.strokeStyle = '#111'; ctx.strokeRect(0.5, 0.5, d.w - 1, d.h - 1); };
    V.add(pop.bg);
    popCells();
  };
  V.onPointerDown = (e) => { // outside the popup -> cidBrowserCancel
    const hit = V.hitTest(e.x, e.y);
    if (pop && hit !== pop.bg && !pop.cells.includes(hit)) closePop();
  };
  inp.oninput = () => { st.text = inp.value; rebuild(); }; // FTextChanged -> FChangeTdt(stn)
  // cidEaselFont/Shape/Texture -> FCmdStartPopup; transmogrify = SFL-shuffled
  // random shape+font+material; rotate = APE::ChangeView
  V.mkBtn('e1font', 'e1fonts', 97, 322, 50, 48, () => showPop('font'));
  V.mkBtn('e1shap', 'e1shaps', 147, 322, 50, 48, () => showPop('shape'));
  V.mkBtn('e1text', 'e1texts', 197, 322, 50, 48, () => showPop('mtrl'));
  V.mkBtn('e1tran', 'e1trans', 247, 322, 50, 48, () => { // FCmdTransmogrify — _psfl->LwNext picks
    const rnd = (n, cur) => { let v = cur; while (n > 1 && v === cur) v = (Math.random() * n) | 0; return v; };
    st.tdts = rnd(10, st.tdts);
    const fi = spltThumbs.font.findIndex((f) => f.tag.cno === st.tagTdf?.cno);
    if (spltThumbs.font.length) st.tagTdf = spltThumbs.font[rnd(spltThumbs.font.length, fi)].tag;
    const mi = spltThumbs.mtrl.findIndex((m) => m.tag.cno === st.tagMtrl?.cno);
    if (spltThumbs.mtrl.length) { st.tagMtrl = spltThumbs.mtrl[rnd(spltThumbs.mtrl.length, mi)].tag; st.mtrlDirty = true; }
    rebuild();
  });
  V.mkBtn('e1rot', 'e1rots', 320, 322, 50, 48, () => { st.iview = (st.iview + 1) % 5; rebuild(); }); // APE::ChangeView
  V.mkBtn('e1can', 'e1canc', 443, 322, 50, 48, closeBrowser); // cidEaselCancel
  V.mkBtn('e1okay', 'e1okayc', 493, 322, 50, 48, () => { // cidEaselOk -> _FAcceptChanges
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
  });
  rebuild();
  setTimeout(() => { inp.focus(); inp.select(); }, 0); // SNE starts with all text selected
  showEasel(V);
}
// action browser (browser.cht kidBrwsAction + pos3.chh): book5 at (62,100), 2x10 ACTN
// name grid, live cel-cycling preview pane w/ cel fwd/back, OK applies an Actn event
export function showActionBrowser() {
  if (!player) return;
  const a = selActor() || [...player.actors.values()].find((x) => x.onStage);
  if (!a) return; // original requires a selected actor
  setSelChid(chidOf(a)); syncRollCall();
  const tmpl = a.tmpl;
  const acts = tmpl.cf.kidsOf('TMPL', tmpl.cno, 'ACTN').map((k) => ({ anid: k.chid, name: tmpl.cf.get('ACTN', k.cno).name || `action ${k.chid}` }));
  if (!acts.length) return;
  const V = new EaselView();
  const X = 62, Y = 100; // book5 origin — child gob positions are relative to it
  V.mkImg('book5', X, Y, 516, 372);
  const num = new Txt('', X + 123, Y + 330, 64, 29, { size: 15 });
  V.add(num);
  // APE preview pane (312,12)-(496,282): small second renderer posing the action
  const pcv = offCv(184, 270);
  const pvEl = new CvEl(pcv, X + 312, Y + 12, 184, 270);
  V.add(pvEl);
  const pr = new THREE.WebGLRenderer({ canvas: pcv });
  const pscene = new THREE.Scene(), pcam = new THREE.PerspectiveCamera(25, 184 / 270, 0.1, 10000);
  const pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
    tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, tmpl, a.lib);
  pactr._setDefaultCost();
  const meshes = pactr.parts.map(() => null); // lazily created — parts gain models on _setActnCel
  // celn cycles in the preview; celnStart is what OK applies (BRWA::_celnStart —
  // 0 until the user touches the cel buttons, which stop the cycling)
  let anid = a.anid || acts[0].anid, celn = 0, ccel = 1, celnStart = 0, cycling = false;
  const box3 = new THREE.Box3(), tmpB = new THREE.Box3(), cV = new THREE.Vector3(), sV = new THREE.Vector3();
  const pose = () => {
    pactr._setActnCel(anid, celn); pactr._positionBody();
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
    pr.render(pscene, pcam);
    pvEl.dirty();
  };
  const setAnid = (an) => { anid = an; const act = pactr._actn(an); ccel = act ? act.cels.length : 1; celn = 0; celnStart = 0; cycling = true; pose(); };
  const step = (d) => { if (cycling) { cycling = false; celnStart = celn; } celnStart = (celnStart + d + ccel) % ccel; celn = celnStart; pose(); };
  const tick = setInterval(() => { if (cycling) { celn = (celn + 1) % ccel; pose(); } }, 1000 / FPS); // APE cycles cels
  setBrwsCleanup(() => { clearInterval(tick); pr.dispose(); });
  const perPage = 20, cells = [];
  for (let i = 0; i < perPage; i++) { // frame5 name cells at rel (15+143c, 32+28r)
    const c = i % 2, r = Math.floor(i / 2);
    const b = new class extends Element {
      constructor() { super(X + 15 + c * 143, Y + 32 + r * 28, 138, 25); this.cursor = 'pointer'; this._hov = false; this._sel = false; this.it = null; this.idx = i; }
      draw(ctx) {
        if (!this.it) { this.visible = false; return; }
        this.visible = true;
        const im = texImg(`frame5${this._sel || this._hov ? 'h' : ''}`, () => this.dirty());
        if (imgReady(im)) ctx.drawImage(im, 0, 0, this.w, this.h);
        ctx.fillStyle = '#222'; ctx.font = "10px 'Comic Sans MS', cursive, sans-serif";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.it.name, this.w / 2, this.h / 2, this.w - 8);
      }
      onPointerEnter() { this._hov = true; this.dirty(); }
      onPointerLeave() { this._hov = false; this.dirty(); }
      onClick() { pick(this); }
    }();
    V.add(b); cells.push(b);
  }
  let page = 0, sel = -1;
  const nPages = () => Math.max(1, Math.ceil(acts.length / perPage));
  function pick(b) {
    sel = page * perPage + b.idx;
    for (const o of cells) { o._sel = o === b; o.dirty(); }
    setAnid(b.it.anid);
  }
  const render = () => {
    num.textContent = t('ui.pageNum', { page: page + 1, total: nPages() });
    cells.forEach((b, i) => { b.it = acts[page * perPage + i] || null; b._sel = page * perPage + i === sel; b.dirty(); });
    V.invalidate();
  };
  V.mkBtn('fwd', 'fwdc', X + 204, Y + 320, 59, 46, () => { page = Math.min(nPages() - 1, page + 1); render(); });
  V.mkBtn('bback', 'bbackc', X + 54, Y + 320, 59, 46, () => { page = Math.max(0, page - 1); render(); });
  V.mkBtn('b5celbk', 'b5celbks', X + 447, Y + 290, 27, 16, () => step(-1));
  V.mkBtn('b5celfw', 'b5celfws', X + 475, Y + 290, 27, 16, () => step(1));
  V.mkBtn('okay', 'okayc', X + 431, Y + 320, 50, 48, () => { // gob pos is bottom-left (preg 0,48)
    if (sel >= 0) { // FSetAction(anid, celnStart, fFalse): Actn+Freeze(+Step) inserted at cursor, executed now
      const an = acts[sel].anid, cn = celnStart, d = a.data;
      const evs0 = structuredClone(d.events);
      const reval = () => { a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
      opExec({ do: () => { a.setActionCore(an, cn, false); draw(); },
               undo: () => { d.events = a.events = structuredClone(evs0); reval(); } });
      // BRWA::_ApplySelection arms toolRecordSameAction after applying
      ed.toolBtns?.['2cont']?.onclick();
    }
    closeBrowser(); draw();
  });
  V.mkBtn('cancel', 'cancelc', X + 381, Y + 320, 50, 48, closeBrowser);
  render();
  setAnid(anid);
  showEasel(V);
}
// costume easel (easels.cht kidCost*, ESLA): e2par bg at (102,100) 436x347;
// preview (112,109)-(528,339); name edit (110,415); buttons costumes/accessories/
// rotate/cancel/ok at y=356. Clicking a body part cycles its CMTL costumes;
// accessories mode cycles the part's accessory set (APE::_FIncCmtl).
export function showCostumeEasel(a) {
  if (!player || !a || !a.onStage) return;
  const tmpl = a.tmpl;
  if (tmpl.isTdt || !tmpl.cbset) return; // TDTs use the spletter easel; props without part sets do nothing
  setSelChid(chidOf(a)); syncRollCall(); draw();
  const V = new EaselView();
  V.mkImg('e2par', 102, 100, 436, 347);
  const pcv = offCv(416, 230); // preview frame (10,9)-(426,239) rel to bg
  const pvEl = new CvEl(pcv, 112, 109, 416, 230);
  pvEl.pickable = true; pvEl.cursor = 'pointer';
  V.add(pvEl);
  const inp = V.domInp(110, 415, 420, 24); // kidCostEditBox (8,315)-(427,339)
  inp.maxLength = 50; inp.value = a.data.name || '';
  const pr = new THREE.WebGLRenderer({ canvas: pcv });
  const pscene = new THREE.Scene(), pcam = new THREE.PerspectiveCamera(25, 416 / 230, 0.1, 10000);
  const pactr = new Actor({ cno: 0, arid: 0, nfrmFirst: 0, nfrmLast: 0, name: '', dxyzFullRte: { x: 0, y: 0, z: 0 },
    tagTmpl: a.data.tagTmpl, route: [{ x: 0, y: 0, z: 0, dwr: 0 }], events: [] }, tmpl, a.lib);
  pactr._setDefaultCost();
  const applyCost = (act, c) => { // mirror _doAevCore AET.Cost
    if (c.fCmtl) act._applyCmtl(templateCmtl(tmpl, c.cmid));
    else { const m = a.lib.mtrl(c.tag); if (m) for (let i = 0; i < act.parts.length; i++) if (tmpl.ibsets[i] === c.ibset) act.parts[i].mtrl = m; }
    act._cost[c.ibset] = { ...c };
  };
  for (const c of Object.values(a._cost || {})) applyCost(pactr, c); // start from the actor's current costume
  const pending = {}; // ibset -> {fCmtl:true, cmid} picked in this session; OK commits them
  const meshes = pactr.parts.map(() => null);
  const box3 = new THREE.Box3(), tmpB = new THREE.Box3(), cV = new THREE.Vector3(), sV = new THREE.Vector3();
  let viewAng = Math.PI / 6;
  const pose = () => {
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
      pcam.position.set(cV.x + r * 3.6 * Math.sin(viewAng), cV.y + r * 1.8, cV.z + r * 3.6 * Math.cos(viewAng));
      pcam.lookAt(cV);
    }
    pr.render(pscene, pcam);
    pvEl.dirty();
  };
  // APE::_FIncCmtl helpers — which ibsets are accessory sets, and next-costume cycling
  const cmtlHasModel = (cmid) => { const c = templateCmtl(tmpl, cmid); return !!c && c.parts.some((p) => p.model); };
  const bsetIsAcc = (b) => cmtlHasModel(tmpl.cmids[b]?.[0]);
  const ibsetOnlyAcc = (() => { let only; for (let b = 0; b < tmpl.cbset; b++) if (bsetIsAcc(b)) { if (only !== undefined) return undefined; only = b; } return only; })();
  const accOf = (ibset) => {
    if (bsetIsAcc(ibset)) return ibset;
    if (ibsetOnlyAcc !== undefined) return ibsetOnlyAcc; // single accessory set applies to any costume click
    for (let b = 0; b < tmpl.cbset; b++) if (bsetIsAcc(b))
      for (let i = 0; i < tmpl.ibsets.length; i++)
        if (tmpl.ibsets[i] === b && tmpl.ibsets[tmpl.parents[i]] === ibset) return b;
    return undefined;
  };
  const sameAcc = (cmid1, cmid2) => { // TMPL::FSameAccCmids: same accessory = same model set
    const c1 = templateCmtl(tmpl, cmid1), c2 = templateCmtl(tmpl, cmid2);
    if (!c1 || !c2 || c1.parts.length !== c2.parts.length) return false;
    return c1.parts.every((p, k) => (p.model || null) === (c2.parts[k].model || null));
  };
  const cmidNext = (ibset, cmidCur, fAcc) => { // APE::_CmidNext: accessories cycle within the same model set
    const list = tmpl.cmids[ibset] || [], i0 = Math.max(0, list.indexOf(cmidCur));
    for (let d = 1; d < list.length; d++) {
      const nx = list[(i0 + d) % list.length];
      if (fAcc ? !sameAcc(cmidCur, nx) : sameAcc(cmidCur, nx)) return nx;
    }
    return cmidCur;
  };
  const cmidCur = (ibset) => pending[ibset]?.cmid ?? (pactr._cost[ibset]?.fCmtl ? pactr._cost[ibset].cmid : tmpl.cmids[ibset]?.[0]);
  let fAcc = false; // costumes vs accessories mode (kidCostCostumes/kidCostAccessories)
  const incCmtl = (ibset) => {
    if (fAcc) { const b = accOf(ibset); if (b === undefined) return; ibset = b; }
    if (!(tmpl.cmids[ibset] || []).length) return;
    const cmid = cmidNext(ibset, cmidCur(ibset), fAcc);
    pending[ibset] = { ibset, cmid, fCmtl: true };
    applyCost(pactr, pending[ibset]);
    pose();
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  pvEl.onPointerDown = (e) => { // click a body part -> next costume for its ibset
    ndc.set((e.x - pvEl.x) / pvEl.w * 2 - 1, 1 - (e.y - pvEl.y) / pvEl.h * 2);
    ray.setFromCamera(ndc, pcam);
    const hit = ray.intersectObjects(meshes.filter(Boolean), false)[0];
    if (hit) incCmtl(tmpl.ibsets[hit.object.userData.ipar]);
  };
  setBrwsCleanup(() => pr.dispose());
  const modeBtn = (up, dn, x, f) => { // costumes/accessories are radio-selected (kstSelected face)
    const b = V.mkBtn(up, dn, x, 356, 50, 48, () => { fAcc = f; syncModes(); });
    /** @type {any} */ (b)._sync2 = () => { b.faceOverride = fAcc === f ? dn : up; b.dirty(); };
    return b;
  };
  const costB = modeBtn('e2cost', 'e2costs', 134, false);
  const accB = modeBtn('e2acc', 'e2accs', 218, true);
  const syncModes = () => { /** @type {any} */ (costB)._sync2(); /** @type {any} */ (accB)._sync2(); };
  syncModes();
  V.mkBtn('e2rot', 'e2rots', 302, 356, 50, 48, () => { viewAng += Math.PI / 4; pose(); }); // kidCostRotate -> ChangeView
  V.mkBtn('e2can', 'e2canc', 406, 356, 50, 48, closeBrowser); // cidEaselCancel (Esc also reaches this)
  V.mkBtn('e2okay', 'e2okayc', 456, 356, 50, 48, () => { // cidEaselOk: commit costume events + name
    const changes = Object.values(pending), nameNew = inp.value.trim() || a.data.name;
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
  });
  pose();
  showEasel(V);
}
