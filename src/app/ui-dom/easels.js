import * as M from '../../engine/mat34.js';
import * as THREE from 'three';
import { Actor } from '../../engine/actor.js';
import { $, texUrl } from '../res.js';
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
import { brwsShell, brwsEl, closeBrowser, showBrowser, brwsCleanup, setBrwsCleanup } from './browsers.js';
import { syncRollCall } from '../ui/studio.js';
import { t } from '../i18n.js';
// --- scene sorter easel (easels.cht kidSSorter*; scnsort.cpp SCRT) -----------
// e3par panel at (20,65) 600x350; 6 frame cells 185x126 at (10+c*193,12+r*141);
// thumb rect (8,12)-(151,92); transition buttons at (156,11/33/55/77). Edits a
// working scene list (the CMVI); OK commits reorder/nuke/trans/appends, Esc or
// cancel discards. Sorter changes are not undoable (MVIE::ClearUndo on OK).
export function showSceneSorter() {
  if (!player) return;
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('e3par', 20, 65, 600, 350);
  const PX = 20, PY = 65; // panel origin in studio coords
  const T4 = [0, 3, 1, 2]; // SCRT::_mplwtrans = {transCut, transDissolve, transFadeToBlack, transFadeToWhite}
  const items = player.movie.scenes.map((scen) => ({ scen, trans: scen.trans, batch: null }));
  let cur = Math.max(0, player.sceneIndex), top = Math.floor(cur / 6) * 6, tool = 'hand';
  let aridLim = null; // appended actors get arids above the current movie's max

  const thumbCv = (scen) => {
    if (!scen._tcv) {
      const c = document.createElement('canvas'); c.width = 143; c.height = 80;
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

  const cells = [];
  for (let i = 0; i < 6; i++) {
    const cx = PX + 10 + (i % 3) * 193, cy = PY + 12 + (i / 3 | 0) * 141;
    const fim = mkImg('e3frm', cx, cy, 185, 126);
    const cv = document.createElement('canvas');
    cv.width = 143; cv.height = 80; cv.className = 'brwsCv';
    brwsEl.appendChild(cv); place(cv, cx + 8, cy + 12, 143, 80);
    const tbs = T4.map((t, j) => {
      const im = mkImg(`e3trn${j + 1}`, cx + 156, cy + 11 + 22 * j, 20, 17);
      im.style.cursor = 'pointer';
      im.onmousedown = (e) => e.stopPropagation();
      im.onclick = () => { const it = items[top + i]; if (it) { it.trans = t; sync(); } }; // FCmdTransition
      return im;
    });
    fim.style.cursor = 'pointer';
    fim.onmousedown = (e) => cellDown(i, e);
    cells.push({ fim, cv, tbs });
  }
  const bar = mkImg('ssbar', 0, 0, 250, 140); // drop-position indicator
  bar.style.display = 'none'; bar.style.pointerEvents = 'none';

  const hand = mkImg('e3hand', PX + 25, PY + 298, 50, 48);   // kidSSorterHand (default)
  const nuke = mkImg('e3rmsn', PX + 80, PY + 298, 50, 48);   // kidSSorterNuke
  /** @type {[HTMLImageElement, string][]} */
  const sorterTools = [[hand, 'hand'], [nuke, 'nuke']];
  for (const [im, t] of sorterTools) {
    im.style.cursor = 'pointer';
    im.onmousedown = () => { tool = t; syncTools(); };
  }
  const syncTools = () => {
    hand.src = texUrl(`e3hand${tool === 'hand' ? 'c' : ''}`);
    nuke.src = texUrl(`e3rmsn${tool === 'nuke' ? 'c' : ''}`);
  };
  const sup = mkImg('e3up', PX + 580, PY + 2, 17, 19);       // kidSSorterScrollUp (hidden when disabled)
  const sdn = mkImg('e3down', PX + 580, PY + 273, 17, 19);   // kidSSorterScrollDn
  /** @type {[HTMLImageElement, number, string][]} */
  const scrollBtns = [[sup, -1, 'e3upc'], [sdn, 1, 'e3downc']];
  for (const [el, d, dn] of scrollBtns) {
    let tm = null;
    const step = () => { top = Math.max(0, Math.min(items.length - 1, top + d * 3)); sync(); }; // FCmdScroll ±nxFrame
    el.style.cursor = 'pointer';
    el.onmousedown = () => {
      el.src = texUrl(`${dn}`); step();
      let del = 250;
      const go = () => { step(); del = Math.max(80, del - 20); tm = setTimeout(go, del); };
      tm = setTimeout(go, del);
    };
    el.onmouseup = el.onmouseleave = () => { el.src = texUrl(`${el === sup ? 'e3up' : 'e3down'}`); clearTimeout(tm); };
  }

  function sync() { // _FResetThumbnails + _EnableScroll
    for (let i = 0; i < 6; i++) {
      const it = items[top + i], c = cells[i];
      c.fim.style.display = c.cv.style.display = it ? '' : 'none';
      for (const t of c.tbs) t.style.display = it ? '' : 'none';
      if (!it) continue;
      c.fim.src = texUrl(`${top + i === cur ? 'e3frms' : 'e3frm'}`);
      c.cv.getContext('2d').drawImage(thumbCv(it.scen), 0, 0);
      c.tbs.forEach((t, j) => { t.src = texUrl(`e3trn${j + 1}${it.trans === T4[j] ? 's' : ''}`); });
    }
    sup.style.display = top > 0 ? '' : 'none';
    sdn.style.display = top + 6 < items.length ? '' : 'none';
  }

  function cellDown(i, e) {
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
    dragStart(i, e); // mouse-down on the already-selected frame with hand -> drag
  }

  function dragStart(i, e) {
    e.preventDefault();
    const r = $('studio').getBoundingClientRect();
    const toStudio = (ev) => ({ x: ((ev.clientX - r.left) / r.width) * 640, y: ((ev.clientY - r.top) / r.height) * 480 });
    /** @type {HTMLDivElement & {_idx?: number}} */
    const g = document.createElement('div'); // idSelFrame — dragged ghost of the selected cell
    g.style.cssText = 'position:absolute;pointer-events:none;';
    const gf = document.createElement('img');
    gf.src = texUrl('e3frms'); gf.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    const gv = document.createElement('canvas');
    gv.width = 143; gv.height = 80;
    gv.getContext('2d').drawImage(thumbCv(items[cur].scen), 0, 0);
    gv.style.cssText = 'position:absolute;left:4.3%;top:9.5%;width:77.3%;height:63.5%';
    g.appendChild(gf); g.appendChild(gv); brwsEl.appendChild(g);
    place(g, PX + 10 + (i % 3) * 193, PY + 12 + (i / 3 | 0) * 141, 185, 126);
    const m0 = toStudio(e);
    const grab = { x: m0.x - (PX + 10 + (i % 3) * 193), y: m0.y - (PY + 12 + (i / 3 | 0) * 141) };
    let scrollTm = null;
    bar.style.display = '';
    const move = (ev) => {
      const m = toStudio(ev);
      const xn = Math.max(0, Math.min(405, m.x - PX - grab.x));  // xpFrameMax = dxpSSorter-dxpFrame+kdxpSSorterRight
      const yn = Math.max(0, Math.min(141, m.y - PY - grab.y));  // ypFrameMax = dypSSorter-dypFrame
      place(g, PX + xn, PY + yn, 185, 126);
      const col = xn < 10 ? 0 : Math.min(3, 1 + (((xn - 11) / 193) | 0)); // xFrame from easels.cht
      const row = (((yn + 70) / 141) | 0);                               // yFrame
      g._idx = Math.min(items.length, row * 3 + col);
      place(bar, PX + (xn < 10 ? 4 : 4 + 193 * (1 + (((xn - 11) / 193) | 0))), PY + 7 + 141 * row, 250, 140);
      const my = m.y - PY; // drag past the grid scrolls one row (kdtimDragScroll)
      clearTimeout(scrollTm);
      if (my < 0 || my > 282) scrollTm = setTimeout(() => {
        top = Math.max(0, Math.min(items.length - 1, top + (my < 0 ? -3 : 3))); sync();
      }, 200);
    };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      clearTimeout(scrollTm); bar.style.display = 'none'; g.remove();
      const to = Math.min(g._idx ?? cur, items.length); // FCmdInsert: GL::Move(cur,to), ends at to-1 if to>cur
      if (to !== cur) { const it = items.splice(cur, 1)[0]; const at = to > cur ? to - 1 : to; items.splice(at, 0, it); cur = at; }
      sync();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }

  mkBtn('e3port', 'e3portc', PX + 135, PY + 298, 50, 48, () => { // kidSSorterOpen -> FCmdPortfolio
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
  brwsEl._onEsc = dismiss; // cancel-button CHILD_SCRIPT maps Escape to cidSceneSortCancel
  mkBtn('e3can', 'e3canc', PX + 465, PY + 298, 50, 48, dismiss);        // cidSceneSortCancel
  mkBtn('e3okay', 'e3okayc', PX + 515, PY + 298, 50, 48, applySort);    // cidSceneSortOk -> FSetCmvi

  function applySort() {
    const mv = player.movie;
    for (const it of items) {
      it.scen.trans = it.trans;
      if (!it.batch) continue;
      const { srcCf, srcRoll, remap, aridOff } = it.batch;
      const fix = (t) => { // merge embedded (sid 0) chunks into this movie's cf (FClone + tag rewrite)
        if (!t || t.sid !== 0) return;
        if (!remap.has(t.cno)) {
          const c = mv.cf?.adopt(srcCf, t.ctg, t.cno);
          remap.set(t.cno, c ? c.cno : -1);
        }
        if (remap.get(t.cno) < 0) { t.sid = -1; return; }
        t.cno = remap.get(t.cno);
      };
      const s = it.scen;
      for (const e of [...s.startEvents, ...s.frameEvents]) {
        if (e.data?.tags) for (const t of e.data.tags) fix(t);
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
}

// record easel (easels.cht kidRecord*): e5par + length thermometer + name + mike/play/can/okay
export function showRecorder(kind) {
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('e5par', 202, 154, 236, 172);
  const therm = document.createElement('div'); // kidRecordSoundLength: fill (22,30)-(214,51) -> elapsed/10s
  therm.className = 'recTherm'; brwsEl.appendChild(therm); place(therm, 224, 184, 193, 22);
  const fill = document.createElement('div'); fill.className = 'recThermFill'; therm.appendChild(fill);
  const inp = document.createElement('input'); // kidRecordSoundName (123,75)-(232,95)
  inp.className = 'spltInp'; inp.maxLength = 40; inp.placeholder = t('easel.soundName');
  brwsEl.appendChild(inp); place(inp, 325, 229, 110, 21);
  let stream = null, rec = null, chunks = [], take = null, t0 = 0, raf = 0, stopP = null;
  const stopTracks = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const done = async (save) => { // close easel -> back to the sound browser
    cancelAnimationFrame(raf); stopRec(); if (stopP) await stopP; stopTracks();
    if (save && take) await addUserSnd(kind, { name: inp.value.trim() || `recording ${userSnds.length + 1}`, buf: take.buf, bytes: take.bytes, mime: take.mime });
    showBrowser(kind);
  };
  const tick = () => {
    fill.style.width = `${Math.min(100, ((performance.now() - t0) / 10000) * 100)}%`;
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
        fill.style.width = `${Math.min(100, ((take.buf?.duration || 0) / 10) * 100)}%`;
        stopTracks(); res();
      };
    }));
    t0 = performance.now(); rec.start(); tick();
    setTimeout(() => { if (rec?.state === 'recording') stopRec(); }, 10000); // kdtsMaxRecord
  };
  const stopRec = () => { if (rec?.state === 'recording') rec.stop(); rec = null; };
  const mikeBtn = mkBtn('e5mike', 'e5mikes', 213, 269, 50, 48, async () => {
    if (rec?.state === 'recording') { stopRec(); mikeBtn.querySelector('img').src = texUrl('e5mike'); }
    else { sounds.ensure(); await startRec(); }
  });
  mikeBtn.onmouseup = mikeBtn.onmouseleave = () => {
    mikeBtn.querySelector('img').src = texUrl(`e5${rec?.state === 'recording' ? 'mikes' : 'mike'}`); // hold selected while recording
  };
  mkBtn('e5play', 'e5plays', 265, 269, 50, 48, () => { stopRec(); if (take?.buf) sounds.preview({ buf: take.buf }); });
  mkBtn('e5can', 'e5canc', 329, 269, 50, 48, () => done(false));
  mkBtn('e5okay', 'e5okayc', 379, 269, 50, 48, () => done(true));
  setTimeout(() => inp.focus(), 0);
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
  const { place, mkImg, mkBtn } = brwsShell();
  setBrwsCleanup(restore); // Esc/cancel closes via closeBrowser -> restores the snapshot
  const X = a ? 182 : 116, Y = 100; // e4parmm/e4par gob origins (pos3.chh)
  mkImg(a ? 'e4parmm' : 'e4par', X, Y, a ? 277 : 408, 236);
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
    colEls.push(mkImg(mm ? 'e4mm' : q.tags.length > 1 ? 'e4queue' : q.fLoop ? 'e4loop' : 'e4snd', X + ix, Y + 117, 30, 30));
    const nm = document.createElement('button'); // e4audit name plate (click = audition)
    nm.className = 'stBtn'; brwsEl.appendChild(nm); place(nm, X + ex, Y + 150, 122, 20);
    const nim = document.createElement('img');
    nim.src = texUrl('e4audit'); nim.className = 'stImg'; nim.draggable = false;
    nm.appendChild(nim);
    const nmt = document.createElement('span');
    nmt.className = 'lisNameTxt'; nmt.textContent = sndName(q.tags);
    nm.appendChild(nmt);
    nm.onmousedown = () => { nim.src = texUrl('e4auditc'); };
    nm.onmouseup = nm.onmouseleave = () => { nim.src = texUrl('e4audit'); };
    nm.onclick = audition;
    colEls.push(nm);
    /** @type {HTMLDivElement & {_yp?: number}} */
    const sld = document.createElement('div'); // volume track (l,20)-(r,138), thumb travels y 20..128
    sld.className = 'stSld'; brwsEl.appendChild(sld); place(sld, X + sl, Y + 20, sr - sl, 118);
    const th = document.createElement('img'); // e4vol1 thumb, MoveAbsGob(kxpSliderThumb=5, yPos)
    th.src = texUrl('e4vol1'); th.className = 'stImg stThumb'; th.draggable = false;
    brwsEl.appendChild(th);
    const yPos0 = 100 - Math.round(q.vlm * 101); // yPos = yNuke - vlm*FullDisplay/kvlmFull
    const setY = (yp) => { sld._yp = yp; place(th, X + sl + 5, Y + 20 + yp, 21, 11); };
    setY(yPos0);
    sld.onpointerdown = (e) => {
      sld.setPointerCapture(e.pointerId);
      const r = sld.getBoundingClientRect();
      const move = (ev) => setY(Math.max(0, Math.min(108, ((ev.clientY - r.top) / r.height) * 118)));
      move(e);
      sld.onpointermove = move;
      sld.onpointerup = sld.onpointercancel = () => {
        sld.onpointermove = null;
        const yp = sld._yp ?? 0;
        q.vlm = yp > 100 ? -1 : Math.max(0, (101 - yp) / 101); // below the nuke line -> vlmNil/silent
        if (a) a.fSetVlmSnd(sty, mm, q.vlm); else setScenVlm(sty, q.vlm);
        audition(); // slider-up enqueues cidEaselPlay too
      };
    };
    colEls.push(sld, th);
    colEls.push(mkBtn('e4nuke', 'e4nukec', X + nx, Y + 123, 21, 20, () => { // kidListenNuke*: delete + hide the column
      if (a) a.fDeleteSndCore(sty, mm); else remScenSnd(sty);
      for (const el of colEls) el.style.display = 'none';
    }));
  }
  mkBtn('e4can', 'e4canc', X + (a ? 149 : 280), Y + 183, 50, 48, () => closeBrowser());
  mkBtn('e4okay', 'e4okayc', X + (a ? 199 : 330), Y + 183, 50, 48, () => { setBrwsCleanup(null); closeBrowser(); });
}
// words create dialog (browser.cht kidBrwsTextCreate): book9 + story/scroll choices
export function showWords() {
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('book9', 132, 48, 376, 209);
  mkBtn('e6stor', 'e6stors', 174, 97, 136, 78, () => { closeBrowser(); insTbox(true); });   // cidCreateTbox fFalse -> story box
  mkBtn('e6scr1', 'e6scr1s', 329, 96, 136, 78, () => { closeBrowser(); insTbox(false); }); // cidCreateTbox fTrue -> credits box
  mkBtn('cancel', 'cancelc', 430, 205, 50, 48, closeBrowser);  // preg (0,48): bottom-left
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
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('e1par', 61, 57, 518, 366);
  const pv = document.createElement('canvas');
  pv.className = 'brwsCv'; pv.width = 492; pv.height = 238;
  brwsEl.appendChild(pv); place(pv, 74, 70, 492, 238);
  const inp = document.createElement('input'); // kidSpltEditBox — SNE with all text selected
  inp.className = 'spltInp'; inp.maxLength = 50; inp.value = st.text; inp.placeholder = 'type 3D text';
  brwsEl.appendChild(inp); place(inp, 71, 379, 498, 34);
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
  const closePop = () => { if (!pop) return; pop.bg.remove(); for (const c of pop.cells) c.remove(); pop = null; };
  const popPick = (it) => { // cidBrowserSelect+Ok: apply the pick and dismiss
    if (pop.kind === 'font') { if (it.tag.cno !== st.tagTdf?.cno) st.tagTdf = it.tag; }
    else if (pop.kind === 'shape') st.tdts = it.tdts;
    else { st.tagMtrl = it.tag; st.mtrlDirty = true; }
    closePop(); rebuild();
  };
  const popCells = () => {
    for (const c of pop.cells) c.remove(); pop.cells = [];
    const d = SPLT_POP[pop.kind], items = spltThumbs[pop.kind];
    const cur = pop.kind === 'font' ? items.findIndex((i) => i.tag.cno === st.tagTdf?.cno)
      : pop.kind === 'shape' ? items.findIndex((i) => i.tdts === st.tdts)
      : items.findIndex((i) => i.tag.cno === st.tagMtrl?.cno);
    items.slice(pop.pg * d.page, pop.pg * d.page + d.page).forEach((it, i) => {
      const idx = pop.pg * d.page + i, sel = idx === cur;
      const b = document.createElement('button'); b.className = 'stBtn ccpCell';
      const fim = document.createElement('img'); fim.src = texUrl(`d1frm${sel ? 'h' : ''}`); fim.draggable = false;
      b.appendChild(fim); brwsEl.appendChild(b); place(b, d.x, d.y + i * d.fh, d.w, d.fh);
      const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;pointer-events:none;';
      b.appendChild(cv);
      if (it.mbmp) { // thumb centered inside the frame border, aspect-preserved
        const s = Math.min((d.w - 2 * d.bd) / it.mbmp.width, (d.fh - 2 * d.bd) / it.mbmp.height);
        const cw = Math.max(1, Math.round(it.mbmp.width * s)), ch = Math.max(1, Math.round(it.mbmp.height * s));
        cv.width = cw; cv.height = ch;
        cv.style.left = `calc(50% - ${cw / 2}px)`; cv.style.top = `calc(50% - ${ch / 2}px)`;
        cv.getContext('2d').drawImage(mbmpCanvas(it.mbmp, cw, ch), 0, 0);
      }
      b.onmousedown = () => { fim.src = texUrl('d1frmh'); };
      b.onmouseup = b.onmouseleave = () => { fim.src = texUrl(`d1frm${sel ? 'h' : ''}`); };
      b.onclick = () => popPick(it);
      pop.cells.push(b);
    });
    const last = Math.ceil(items.length / d.page) - 1;
    for (const [bmp, off, pg] of [['d1up', 0, 0], ['d1dn', d.w / 2, last]]) { // up = first page, dn = last
      const b = document.createElement('button'); b.className = 'stBtn ccpCell';
      const im = document.createElement('img'); im.src = texUrl(`${bmp}`); im.draggable = false;
      b.appendChild(im); brwsEl.appendChild(b); place(b, d.x + off, d.y + d.ay, d.w / 2, d.h - d.ay);
      b.onmousedown = () => { im.src = texUrl(`${bmp}s`); };
      b.onmouseup = b.onmouseleave = () => { im.src = texUrl(`${bmp}`); };
      b.onclick = () => { if (pop.pg !== pg) { pop.pg = pg; popCells(); } };
      pop.cells.push(b);
    }
  };
  const showPop = (kind) => {
    if (pop?.kind === kind) return closePop();
    closePop();
    if (!spltThumbs[kind].length) return;
    const d = SPLT_POP[kind];
    pop = { kind, pg: 0, cells: [], bg: document.createElement('div') };
    pop.bg.className = 'tbPopBg'; brwsEl.appendChild(pop.bg); place(pop.bg, d.x, d.y, d.w, d.h);
    popCells();
  };
  brwsEl.addEventListener('pointerdown', (e) => { // outside the popup -> cidBrowserCancel
    if (pop && !pop.bg.contains(e.target) && !pop.cells.some((c) => c.contains(e.target))) closePop();
  });
  inp.oninput = () => { st.text = inp.value; rebuild(); }; // FTextChanged -> FChangeTdt(stn)
  // cidEaselFont/Shape/Texture -> FCmdStartPopup; transmogrify = SFL-shuffled
  // random shape+font+material; rotate = APE::ChangeView
  mkBtn('e1font', 'e1fonts', 97, 322, 50, 48, () => showPop('font'));
  mkBtn('e1shap', 'e1shaps', 147, 322, 50, 48, () => showPop('shape'));
  mkBtn('e1text', 'e1texts', 197, 322, 50, 48, () => showPop('mtrl'));
  mkBtn('e1tran', 'e1trans', 247, 322, 50, 48, () => { // FCmdTransmogrify — _psfl->LwNext picks
    const rnd = (n, cur) => { let v = cur; while (n > 1 && v === cur) v = (Math.random() * n) | 0; return v; };
    st.tdts = rnd(10, st.tdts);
    const fi = spltThumbs.font.findIndex((f) => f.tag.cno === st.tagTdf?.cno);
    if (spltThumbs.font.length) st.tagTdf = spltThumbs.font[rnd(spltThumbs.font.length, fi)].tag;
    const mi = spltThumbs.mtrl.findIndex((m) => m.tag.cno === st.tagMtrl?.cno);
    if (spltThumbs.mtrl.length) { st.tagMtrl = spltThumbs.mtrl[rnd(spltThumbs.mtrl.length, mi)].tag; st.mtrlDirty = true; }
    rebuild();
  });
  mkBtn('e1rot', 'e1rots', 320, 322, 50, 48, () => { st.iview = (st.iview + 1) % 5; rebuild(); }); // APE::ChangeView
  mkBtn('e1can', 'e1canc', 443, 322, 50, 48, closeBrowser); // cidEaselCancel
  mkBtn('e1okay', 'e1okayc', 493, 322, 50, 48, () => { // cidEaselOk -> _FAcceptChanges
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
  const { place, mkImg, mkBtn } = brwsShell();
  const X = 62, Y = 100; // book5 origin — child gob positions are relative to it
  mkImg('book5', X, Y, 516, 372);
  const num = document.createElement('div');
  num.className = 'brwsNum'; brwsEl.appendChild(num); place(num, X + 123, Y + 330, 64, 29);
  // APE preview pane (312,12)-(496,282): small second renderer posing the action
  const pcv = document.createElement('canvas');
  pcv.className = 'brwsCv'; pcv.width = 184; pcv.height = 270;
  brwsEl.appendChild(pcv); place(pcv, X + 312, Y + 12, 184, 270);
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
  };
  const setAnid = (an) => { anid = an; const act = pactr._actn(an); ccel = act ? act.cels.length : 1; celn = 0; celnStart = 0; cycling = true; pose(); };
  const step = (d) => { if (cycling) { cycling = false; celnStart = celn; } celnStart = (celnStart + d + ccel) % ccel; celn = celnStart; pose(); };
  const tick = setInterval(() => { if (cycling) { celn = (celn + 1) % ccel; pose(); } }, 1000 / FPS); // APE cycles cels
  setBrwsCleanup(() => { clearInterval(tick); pr.dispose(); });
  const perPage = 20, cells = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 10; r++) { // frame5 name cells at rel (15+143c, 32+28r)
    const b = document.createElement('button');
    b.className = 'stBtn brwsCell';
    const fim = document.createElement('img'); fim.src = texUrl('frame5'); fim.draggable = false;
    b.appendChild(fim); brwsEl.appendChild(b); place(b, X + 15 + c * 143, Y + 32 + r * 28, 138, 25);
    const cv = document.createElement('canvas'); cv.className = 'brwsCv'; brwsEl.appendChild(cv);
    place(cv, X + 19 + c * 143, Y + 36 + r * 28, 130, 17);
    cells.push({ b, fim, cv });
  }
  let page = 0, sel = -1;
  const nPages = () => Math.max(1, Math.ceil(acts.length / perPage));
  mkBtn('fwd', 'fwdc', X + 204, Y + 320, 59, 46, () => { page = Math.min(nPages() - 1, page + 1); render(); });
  mkBtn('bback', 'bbackc', X + 54, Y + 320, 59, 46, () => { page = Math.max(0, page - 1); render(); });
  mkBtn('b5celbk', 'b5celbks', X + 447, Y + 290, 27, 16, () => step(-1));
  mkBtn('b5celfw', 'b5celfws', X + 475, Y + 290, 27, 16, () => step(1));
  mkBtn('okay', 'okayc', X + 431, Y + 320, 50, 48, () => { // gob pos is bottom-left (preg 0,48)
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
  mkBtn('cancel', 'cancelc', X + 381, Y + 320, 50, 48, closeBrowser);
  function render() {
    num.textContent = t('ui.pageNum', { page: page + 1, total: nPages() });
    for (let i = 0; i < cells.length; i++) {
      const it = acts[page * perPage + i], { b, fim, cv } = cells[i];
      cv.width = 130; cv.height = 17;
      cv.style.display = b.style.display = it ? '' : 'none';
      if (!it) continue;
      const x = cv.getContext('2d');
      x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '10px "Comic Sans MS", cursive, sans-serif';
      x.fillText(it.name, cv.width / 2, cv.height / 2);
      b.onmousedown = () => { fim.src = texUrl('frame5h'); };
      b.onmouseup = b.onmouseleave = () => { fim.src = sel === page * perPage + i ? texUrl('frame5h') : texUrl('frame5'); };
      b.onclick = () => { sel = page * perPage + i; for (const o of cells) o.fim.src = texUrl('frame5'); fim.src = texUrl('frame5h'); setAnid(it.anid); };
    }
  }
  render();
  setAnid(anid);
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
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('e2par', 102, 100, 436, 347);
  const pcv = document.createElement('canvas'); // preview frame (10,9)-(426,239) rel to bg
  pcv.className = 'brwsCv'; pcv.width = 416; pcv.height = 230; pcv.style.pointerEvents = 'auto';
  brwsEl.appendChild(pcv); place(pcv, 112, 109, 416, 230);
  const inp = document.createElement('input'); // kidCostEditBox (8,315)-(427,339)
  inp.className = 'spltInp'; inp.maxLength = 50; inp.value = a.data.name || '';
  brwsEl.appendChild(inp); place(inp, 110, 415, 420, 24);
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
  pcv.addEventListener('pointerdown', (e) => { // click a body part -> next costume for its ibset
    const r = pcv.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
    ray.setFromCamera(ndc, pcam);
    const hit = ray.intersectObjects(meshes.filter(Boolean), false)[0];
    if (hit) incCmtl(tmpl.ibsets[hit.object.userData.ipar]);
  });
  setBrwsCleanup(() => pr.dispose());
  const modeBtn = (up, dn, x, f) => { // costumes/accessories are radio-selected (kstSelected face)
    /** @type {HTMLButtonElement & {_mode?: () => boolean, _sync2?: () => void}} */
    const b = mkBtn(up, dn, x, 356, 50, 48, () => { fAcc = f; syncModes(); });
    b._mode = () => fAcc === f;
    b._sync2 = () => { (/** @type {HTMLImageElement} */ (b.firstElementChild)).src = texUrl(`${b._mode() ? dn : up}`); };
    b.onmouseup = b.onmouseleave = () => b._sync2();
    return b;
  };
  const costB = modeBtn('e2cost', 'e2costs', 134, false);
  const accB = modeBtn('e2acc', 'e2accs', 218, true);
  const syncModes = () => { costB._sync2(); accB._sync2(); };
  syncModes();
  mkBtn('e2rot', 'e2rots', 302, 356, 50, 48, () => { viewAng += Math.PI / 4; pose(); }); // kidCostRotate -> ChangeView
  mkBtn('e2can', 'e2canc', 406, 356, 50, 48, closeBrowser); // cidEaselCancel (Esc also reaches this)
  mkBtn('e2okay', 'e2okayc', 456, 356, 50, 48, () => { // cidEaselOk: commit costume events + name
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
}