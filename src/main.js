import { ChunkyFile } from './format/chunky.js';
import { Reader } from './format/binary.js';
import { SEVT, AET, parseMovie, serializeMovie } from './format/movie.js';
import { decodeWavAdpcm } from './format/wav.js';
import { parseMbmp, templateCmtl, makeTdtTemplate, TDTS, STY, SPRM } from './format/content.js';
import { Library, CONTENT_FILES } from './engine/library.js';
import { MoviePlayer, FPS, WIT } from './engine/player.js';
import { SoundQueue } from './engine/sound.js';
import { Actor, DWR_NIL } from './engine/actor.js';
import * as M from './engine/mat34.js';
import { Renderer, toMatrix4 } from './render/renderer.js';
import { hitTbox, acrToColor } from './render/textbox.js';
import * as THREE from 'three';
import { version } from '../package.json';

const B = import.meta.env.BASE_URL; // vite base ('/' dev, './' pages build)
const $ = (id) => document.getElementById(id);
let player = null, playing = false, timer = null;

// --- boot splash -------------------------------------------------------------
// UTEST.CPP APP::_FInit: the Microsoft Home logo rides the early init, then the
// splash screen stays up while _FInitCrm reads the content chunkies; afterwards
// GetPortfolioDoc goes straight to the studio (autosaved doc) or the building's
// menu. Here: "loading..." (index.html) -> homelogo -> splash with a progress
// bar -> studio (autosave) or a menu (portfolo art).
const bootEl = $('boot'), bootScr = $('bootScr'), bootTxt = $('bootTxt');
const bootImg = document.createElement('img');
bootImg.id = 'bootImg'; bootImg.draggable = false;
bootImg.onload = () => bootTxt?.remove(); // keep "loading..." until art arrives
const bootBar = document.createElement('div'); bootBar.className = 'bootBar'; bootBar.hidden = true;
const bootFill = document.createElement('div'); bootFill.className = 'bootFill'; bootBar.appendChild(bootFill);
const bootCap = document.createElement('div'); bootCap.className = 'bootCap';
bootScr?.append(bootImg, bootBar, bootCap);
const bootShow = (n) => { bootImg.src = `${B}textures/${n}.png`; };
const bootDone = () => { bootEl?.classList.add('gone'); setTimeout(() => bootEl?.remove(), 400); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bootSegs = [];
const bootSeg = (w) => { // one weighted slice of the bar; cb updates its fraction
  const s = { w, f: 0 };
  bootSegs.push(s);
  return (f, cap) => {
    if (f > s.f) s.f = Math.min(1, f);
    const tot = bootSegs.reduce((a, x) => a + x.w * x.f, 0) / bootSegs.reduce((a, x) => a + x.w, 0);
    bootFill.style.width = (tot * 100).toFixed(1) + '%';
    if (cap != null) bootCap.textContent = cap;
  };
};
const manifestP = fetch(`${B}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
// warm the UI bitmaps + cursors while the content files stream in (they'd
// otherwise lazy-load through <img>/css and pop in on first open)
const warmSeg = bootSeg(0.18);
manifestP.then(async (manifest) => {
  const files = [...(manifest?.textures ?? []).map((f) => `textures/${f}`), ...(manifest?.cur ?? []).map((f) => `cur/${f}`)];
  if (!files.length) return warmSeg(1);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < files.length) {
      const f = files[i++];
      try { await (await fetch(`${B}${f}`)).blob(); } catch { /* lazy loads retry */ }
      warmSeg(++done / files.length, 'warming up');
    }
  }));
}).catch(() => {});
bootShow('homelogo'); // _FDisplayHomeLogo — the original's first screen
const bootT0 = performance.now();

const libSeg = bootSeg(0.74);
const libPart = new Map(); // per-.3CN byte fraction
await sleep(Math.max(0, 700 - (performance.now() - bootT0))); // a beat on the logo (kdtsHomeLogo)
bootShow('splash'); bootBar.hidden = false;
const splashT0 = performance.now();
const lib = await Library.load(`${B}data`, (n, got, tot) => {
  libPart.set(n, tot ? got / tot : 1);
  libSeg([...libPart.values()].reduce((a, b) => a + b, 0) / CONTENT_FILES.length, `loading ${n.toLowerCase()}`);
});
const miscSeg = bootSeg(0.08);
let miscN = 0;
const miscTick = (cap) => miscSeg(++miscN / 7, cap); // pal + 6 thumbnail-file fetches
const pal = new Uint8Array(await (await fetch(`${B}data/socpal.pal`)).arrayBuffer());
miscTick('loading palette');
const renderer = new Renderer($('view'), pal);
const sounds = new SoundQueue(lib);

// roll call thumbnails: TMTH/PRTH (TFC tmpl cno) -> GOKD -> MBMP, from actor.3th / prop.3th
const rcTmplThumbs = new Map();
const brwsTmpls = { actor: [], prop: [], scene: [] }; // selector grids: {cno, name, mbmp} in .3th order
const bkthCaths = new Map(); // bkgd cno -> Map(chid -> mbmp): camera-angle thumbs, social palette
{
  const tmplsCf = lib.content.find((cf) => cf.name === 'TMPLS.3CN');
  const bkgdsCf = lib.content.find((cf) => cf.name === 'BKGDS.3CN');
  for (const [file, ctg, kind] of [['actor.3th', 'TMTH', 'actor'], ['prop.3th', 'PRTH', 'prop'], ['bkgds.3th', 'BKTH', 'scene']]) {
    try {
      const th = new ChunkyFile(await (await fetch(`${B}data/${file}`)).arrayBuffer());
      for (const t of th.ofType(ctg)) {
        const d = th.data(ctg, t.cno);
        const gk = t.kids.find((k) => k.ctg === 'GOKD');
        const mk = gk && th.get('GOKD', gk.cno).kids.find((k) => k.ctg === 'MBMP');
        if (mk && ctg === 'BKTH') { // BRWC browses the BKTH's CATH kids (chid = icam)
          const m = new Map();
          for (const k of t.kids) if (k.ctg === 'CATH') {
            const g2 = th.get('CATH', k.cno)?.kids.find((x) => x.ctg === 'GOKD');
            const m2 = g2 && th.get('GOKD', g2.cno).kids.find((x) => x.ctg === 'MBMP');
            if (m2) m.set(k.chid, parseMbmp(th.data('MBMP', m2.cno)));
          }
          bkthCaths.set(t.cno, m);
        }
        if (mk) {
          // TMTH/PRTH map via TFC @8; BKTH cno is the BKGD cno directly
          const cno = ctg === 'BKTH' ? t.cno : new DataView(d.buffer, d.byteOffset).getUint32(8, true);
          const mbmp = parseMbmp(th.data('MBMP', mk.cno));
          if (ctg !== 'BKTH') rcTmplThumbs.set(cno, mbmp); // roll call only needs tmpl thumbs
          brwsTmpls[kind].push({ cno, name: (ctg === 'BKTH' ? bkgdsCf?.get('BKGD', cno) : tmplsCf?.get('TMPL', cno))?.name || '', mbmp });
        }
      }
    } catch (e) { console.warn(`${file}:`, e.message); }
    miscTick(`loading ${file}`);
  }
}
// spletter easel thumbs (easels.cht kctgTfth/kctgTsth/kctgMtth): the THD body is
// bo+i16+ctg+i32 — TFTH/MTTH carry a content tag, TSTH carries '....' + the tdts
const spltThumbs = { font: [], shape: [], mtrl: [] }; // {tag,mbmp} | {tdts,mbmp}
{
  for (const [file, ctg, kind] of [['actresl.3th', 'TFTH', 'font'], ['actresl.3th', 'TSTH', 'shape'], ['mtrl.3th', 'MTTH', 'mtrl']]) {
    try {
      const th = new ChunkyFile(await (await fetch(`${B}data/${file}`)).arrayBuffer());
      for (const t of th.ofType(ctg)) {
        const r = new Reader(th.data(ctg, t.cno)); r.bo(); r.i16();
        const ctg2 = r.ctg(), cno = r.i32();
        const gk = t.kids.find((k) => k.ctg === 'GOKD');
        const mk = gk && th.get('GOKD', gk.cno).kids.find((k) => k.ctg === 'MBMP');
        spltThumbs[kind].push(kind === 'shape'
          ? { tdts: cno, mbmp: mk ? parseMbmp(th.data('MBMP', mk.cno)) : null }
          : { tag: { sid: 2, ctg: ctg2, cno }, mbmp: mk ? parseMbmp(th.data('MBMP', mk.cno)) : null });
      }
    } catch (e) { console.warn(`${file}:`, e.message); }
    miscTick(`loading ${file}`);
  }
}
const rcThumbCache = new Map(); // tmpl cno (or 'a'+arid for TDT) -> 38x70 canvas
function rcThumbFor(cno, actor) {
  const key = actor?.tmpl?.isTdt ? 'a' + actor.data.arid : cno;
  if (!rcThumbCache.has(key)) {
    const c = document.createElement('canvas'); c.width = 38; c.height = 70;
    const m = rcTmplThumbs.get(cno);
    if (m) {
      const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
      const x = src.getContext('2d'), im = x.createImageData(m.width, m.height);
      for (let i = 0; i < m.pixels.length; i++) {
        const p = m.pixels[i];
        if (p < 0) continue; // transparent run pixel
        im.data[i * 4] = pal[p * 3]; im.data[i * 4 + 1] = pal[p * 3 + 1]; im.data[i * 4 + 2] = pal[p * 3 + 2]; im.data[i * 4 + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      // original centers the bitmap in the 38x70 frame and clips (BRWR::_FSetThumFrame) — crop, don't stretch
      const sw = Math.min(38, m.width), sh = Math.min(70, m.height);
      c.getContext('2d').drawImage(src,
        Math.max(0, (m.width - 38) >> 1), Math.max(0, (m.height - 70) >> 1), sw, sh,
        Math.max(0, (38 - m.width) >> 1), Math.max(0, (70 - m.height) >> 1), sw, sh);
    } else if (actor?.tmpl?.isTdt) {
      // TDT actors have no MBMP — original draws their name as a text gob (TGOB)
      const ctx = c.getContext('2d');
      const txt = (actor.data.name || actor.tmpl.text || actor.tmpl.name || '').trim();
      let size = 20, lines = [];
      for (; size > 6; size--) { // shrink until it fits the 34px-wide cell
        ctx.font = `bold ${size}px "Comic Sans MS", cursive, sans-serif`;
        const words = txt.split(/\s+/).filter(Boolean);
        lines = []; let cur = '', fits = true;
        for (const w of words) {
          if (ctx.measureText(w).width > 34) { fits = false; break; }
          const t = cur ? cur + ' ' + w : w;
          if (cur && ctx.measureText(t).width > 34) { lines.push(cur); cur = w; } else cur = t;
        }
        if (cur) lines.push(cur);
        if (fits && lines.length * (size + 2) <= 66) break;
      }
      ctx.font = `bold ${size}px "Comic Sans MS", cursive, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#222';
      lines.forEach((l, i) => ctx.fillText(l, 19, 35 + (i - (lines.length - 1) / 2) * (size + 2)));
    }
    rcThumbCache.set(key, c);
  }
  return rcThumbCache.get(key);
}
// roll call lists: actors on the left strip (x=3), props on the right (x=594) — pos3.chh/browser.cht
const rcLists = [
  { x: 3, prefix: 'rcact', up: 'rcaup', dn: 'rcadwn', filter: (a) => !a.tmpl.isProp, off: 0, sel: -1, key: '', cells: [], arrows: [] },
  { x: 594, prefix: 'rcp', up: 'rcpup', dn: 'rcpdwn', filter: (a) => a.tmpl.isProp, off: 0, sel: -1, key: '', cells: [], arrows: [] },
];
function rcActs(L) { return player ? [...player.actors.values()].filter(L.filter) : []; }

// --- editor undo/redo (studio.cht kidUndo): one button cycling undo<->redo ---
// kstOpen='undo' face (click -> cidUndo, ->closed), kstClosed='undos' = redo face
// (click -> cidRedo, ->open), kstDisabled='undod'. Ops are {do,undo} pairs.
const hist = { undos: [], redos: [], mode: 'u' };
function opExec(op) { tbSnapEnd(); op.do(); hist.undos.push(op); hist.redos.length = 0; hist.mode = 'u'; docMark(); syncUndoBtn(); }
function histUndo() { tbSnapEnd(); const op = hist.undos.pop(); if (op) { op.undo(); hist.redos.push(op); docMark(); } hist.mode = 'r'; syncUndoBtn(); }
function histRedo() { tbSnapEnd(); const op = hist.redos.pop(); if (op) { op.do(); hist.undos.push(op); docMark(); } hist.mode = 'u'; syncUndoBtn(); }
function histClear() { hist.undos.length = hist.redos.length = 0; hist.mode = 'u'; syncUndoBtn(); }
function syncUndoBtn() {
  const b = $('stb_undo'); if (!b) return;
  const n = hist.mode === 'u' ? hist.undos.length : hist.redos.length;
  b._en = n > 0;
  b.firstElementChild.src = `${B}textures/${n ? (hist.mode === 'u' ? 'undo' : 'undos') : 'undod'}.png`;
}

// --- editor state (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse) -
const ed = { xy: false, ground: false, tool: 'compose', // tool = active secondary tool
  sndTag: null, pauseSnd: false }; // _tagTool / fpseDown
let selChid = -1, pendPlace = null;
let selTbChid = -1, focusTbChid = -1, tbSel = null; // PtboxSelected (border chrome) | TBXG key focus + its cp sel
let tbAttach = null;             // TBOX::AttachToMouse — new box follows cursor {tb, moved}
let tbSnap = null;               // pending text-edit undo burst {tb, rc0, doc0}
let lastViewPt = null;           // last view-space point (popup arm-time apply needs it)
const tbPaint = { acr: -1, dyp: 14, grfont: 0, font: null }; // AcrPaint/DypFontTextCur/GrfontStyleTextCur/OnnTextCur
const chidOf = (a) => { for (const [c, x] of player.actors) if (x === a) return c; return -1; };
const selActor = () => (selChid >= 0 && player ? player.actors.get(selChid) : null);
function syncSelBox() { renderer.selActor = selActor(); } // 3D bbox drawn in-scene (BODY::_PrepareToRender)

// --- undoable movie mutations (all edits go through opExec) -------------------
function editBkgd(cno, name) { // MVIE::FSetBkgdCore: fill empty scene, else insert new scene after
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
function editCam(icam) { // kidBrwsCamera pick -> rewrite the effective ChngCamera event
  const s = player.scene;
  if (!s) return;
  let sev = s.startEvents.find((e) => e.sevt === SEVT.ChngCamera);
  for (const e of s.frameEvents) if (e.sevt === SEVT.ChngCamera && e.nfrm <= player.frame) sev = e;
  if (!sev) s.startEvents.push(sev = { sevt: SEVT.ChngCamera, nfrm: s.nfrmFirst, data: 0 });
  const old = sev.data;
  opExec({ do: () => { sev.data = icam; player.gotoFrame(player.frame); },
           undo: () => { sev.data = old; player.gotoFrame(player.frame); } });
}
function remActrCore(s, chid) { // SCEN::RemActrCore — drop the actor record + its AddActr events
  for (const l of [s.startEvents, s.frameEvents])
    for (let i = l.length - 1; i >= 0; i--)
      if (l[i].sevt === SEVT.AddActr && l[i].data === chid) l.splice(i, 1);
  s.actors.delete(chid);
  player.actors.delete(chid);
}

function restoreActr(s, chid, snap, f0) { // restore record + scene events, rebuild runtime, re-seek
  s.actors.set(chid, structuredClone(snap.actorRec));
  s.startEvents.length = 0; s.startEvents.push(...structuredClone(snap.startEvents));
  s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(snap.frameEvents));
  player.loadScene(player.sceneIndex);
  player.gotoFrame(f0);
  draw();
}

function cutSelActor(fAll) { // MVU::_ClearSel (movie.cpp) — cut the actor "from this frame on"
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

function nukeSelActor() { // toolActorNuke -> MVIE::FRemActr — delete the actor entirely
  const a = selActor();
  if (!a) return;
  const s = player.scene, chid = chidOf(a), f0 = player.frame;
  const snap = { actorRec: structuredClone(s.actors.get(chid)),
    startEvents: structuredClone(s.startEvents), frameEvents: structuredClone(s.frameEvents) };
  opExec({ do: () => { remActrCore(s, chid); player.gotoFrame(player.frame); draw(); },
           undo: () => restoreActr(s, chid, snap, f0) });
}

function insActr(tagTmpl, name, anid, p, after) { // MVIE::FInsActr — AddActr+Add+Actn at cur frame
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
    setPlaying(false); player.loadScene(player.sceneIndex); player.gotoFrame(nfrm); selChid = chid;
    after?.(chid);
  };
  const rem = () => {
    s.actors.delete(chid);
    for (const l of [s.startEvents, s.frameEvents]) { const j = l.findIndex((e) => e.sevt === SEVT.AddActr && e.data === chid); if (j >= 0) l.splice(j, 1); }
    selChid = -1; player.loadScene(player.sceneIndex); player.gotoFrame(Math.min(nfrm, s.nfrmLast));
  };
  opExec({ do: add, undo: rem });
}
function placeActor(item, p) { // actor/prop pick -> click stage -> AddActr at cur frame
  const tagTmpl = { sid: 2, ctg: 'TMPL', cno: item.cno };
  let anid = 0;
  try { const t = lib.template(tagTmpl); anid = t.cf.kidsOf('TMPL', t.cno, 'ACTN')[0]?.chid ?? 0; } catch { /* template w/o actions */ }
  insActr(tagTmpl, item.name || '', anid, p);
}
function insTdt(state, p) { // MVIE::FInsTdt: runtime TDT + easel costume (PtdtNew -> autosave CRF -> FInsActr)
  const tmpl = makeTdtTemplate(lib, state.text, state.tdts, state.tagTdf);
  insActr(lib.addTmpl(tmpl), state.text, 0, p,
    (chid) => { if (state.tagMtrl) player.actors.get(chid)?.setCostumeCore(0, state.tagMtrl, 0, false); });
}

// --- sound editing (movie.cpp toolSounder/Looper/Matcher + scene.cpp FAddSnd/
// FPauseCore + actrsnd.cpp FSetSndCore) ----------------------------------------
const SND_STY = { fx: STY.Sfx, speech: STY.Speech, music: STY.Midi };
const sndTagFor = (kind, it) => { // browser pick -> MVU _tagTool + resolved sty/vlm
  if (it.user || it.buf != null) return { tag: { sid: 'usr', ctg: 'MSND', cno: it.key }, sty: SND_STY[kind], vlm: 1, name: it.name };
  const tag = { sid: 2, ctg: 'MSND', cno: it.cno };
  const msnd = lib.msnd(tag);
  return { tag, sty: msnd?.sty ?? SND_STY[kind], vlm: msnd?.vlm ?? 1, name: it.name };
};
function setSndTag(kind, it) { // MVU::SetTagTool — browser OK loads the tool sound
  ed.sndTag = it ? sndTagFor(kind, it) : null;
  if (!it) return;
  // _ApplySelection: arm PlayOnce unless Looping is armed, or AttachToCell is
  // armed and the pick isn't midi (midi can't motion-match)
  if (ed.tool === 'looper' || (ed.tool === 'matcher' && ed.sndTag.sty !== STY.Midi)) return;
  ed.toolBtns['3sing']?.onclick();
}
const actorEvs = (a) => { // snapshot -> reval pattern used by all actor-edit ops
  const evs0 = structuredClone(a.data.events);
  const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
  return [evs0, reval];
};
function addActrSnd(a, fLoop, fQueue, fMM) { // MVIE::FAddActrSnd -> ACTR::FSetSndCore
  const t = ed.sndTag;
  if (!t) return;
  const [evs0, reval] = actorEvs(a);
  opExec({ do: () => { a.fSetSnd(t.tag, fLoop, fQueue, fMM, t.vlm, t.sty); draw(); }, undo: () => reval(evs0) });
}
const sceneEvs = () => { // snapshot/restore the scene's frameEvents in place
  const s = player.scene, evs0 = structuredClone(s.frameEvents);
  const reval = (evs) => { const c = structuredClone(evs); s.frameEvents.length = 0; s.frameEvents.push(...c); player.gotoFrame(player.frame); draw(); };
  return [evs0, reval];
};
function addBkgdSnd(fLoop, fQueue) { // MVIE::FAddBkgdSnd -> SCEN::FAddSndCore:
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
function editPause(on) { // cidPauseForSound/cidClearPause -> SCEN::FPauseCore:
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
const queryScenSnd = (sty) => {
  if (!player.scene) return null;
  for (const e of player.scene.frameEvents)
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty)
      return { tags: e.data.tags.slice(), vlm: e.data.vlm, fLoop: e.data.fLoop };
  return null;
};
const setScenVlm = (sty, vlm) => {
  if (!player.scene) return;
  for (const e of player.scene.frameEvents)
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) e.data.vlm = vlm;
};
const remScenSnd = (sty) => { // RemSndCore removes the sty's PlaySnd at this frame
  const s = player.scene;
  if (!s) return;
  for (let i = s.frameEvents.length - 1; i >= 0; i--) {
    const e = s.frameEvents[i];
    if (e.nfrm < player.frame) break;
    if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd && e.data.sty === sty) { s.frameEvents.splice(i, 1); return; }
  }
};
const sndName = (tags) => { // first resolvable tag's name for the name plate
  for (const t of tags) {
    if (t.sid === 'usr') return userSnds.find((u) => u.key === t.cno)?.name || 'sound';
    const m = lib.msnd(t);
    if (m && !m.invalid) return m.name || `sound ${t.cno}`;
  }
  return 'sound';
};
function sceneChop(fwd) { // SCEN::FChop (p3rmfw: truncate at cur) / FChopBack (p3rmbk: drop before cur)
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
  const swap = (dst) => { player.movie.scenes[i] = structuredClone(dst); player.loadScene(i); player.gotoFrame(f); selChid = -1; setTbSel(-1); setTbFocus(-1); selTbSels.clear(); };
  opExec({ do: () => swap(after), undo: () => swap(before) });
}

// --- text boxes (tbox.cpp TBXB/TBXG + studio.cpp FCmdCreateTbox/FCmdText*) ---
// Thumb data from content-files/tbox.3th: TCTH color iscr list, TBTH same plus
// iscr 0 (clear) first, TZTH font sizes, TYTH styles (grfontMask 3, grfont 0-3).
const TBX_B = 5; // kdzpBorderTbox
const TBX_MINW = 44, TBX_MINH = 22; // kdxpMinTbox(34)/kdypMinTbox(12) + 2*kdzpBorderTbox
const TCTH_ISCR = [15, 30, 34, 51, 66, 69, 77, 82, 85, 94, 98, 102, 109, 133, 144];
const TBTH_ISCR = [0, ...TCTH_ISCR];
const TZTH_DYP = [9, 12, 14, 18, 24, 36, 48];
const TYTH_STYLES = [{ mask: 3, grfont: 0 }, { mask: 3, grfont: 1 }, { mask: 3, grfont: 2 }, { mask: 3, grfont: 3 }];
const TB_FONTS = ['Comic Sans MS', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Trebuchet MS', 'Impact'];
const TBX_TOOL = { tboxSel: 1, tbPaintText: 1, tbFill: 1, tbFont: 1, tbSize: 1, tbStyle: 1, tbStory: 1, tbCredit: 1 };
const TBX_PAINT_TOOL = { tbPaintText: 1, tbFont: 1, tbSize: 1, tbStyle: 1 };
const selTbox = () => (selTbChid >= 0 && player?.scene ? player.scene.tboxes.get(selTbChid) : null);
const focusTbox = () => (focusTbChid >= 0 && player?.scene ? player.scene.tboxes.get(focusTbChid) : null);
const selTbSels = new Map(); // each TBXG keeps its own caret/selection (_cpAnchor/_cpOther)
const setTbSel = (chid) => { selTbChid = chid; }; // SCEN::SelectTbox — border chrome only
function setTbFocus(chid) { // TBXG key focus — the box whose interior was last clicked
  if (focusTbChid === chid) return;
  if (focusTbChid >= 0) selTbSels.set(focusTbChid, tbSel);
  focusTbChid = chid;
  tbSel = chid >= 0 ? (selTbSels.get(chid) || { anchor: 0, other: 0 }) : null;
}
const tbChidOf = (tb) => { if (!player?.scene) return -1; for (const [c, x] of player.scene.tboxes) if (x === tb) return c; return -1; };
const pickTbox = (px, py) => { // topmost visible tbox under a view-space point
  for (let i = player.tboxes.length - 1; i >= 0; i--) {
    const tb = player.tboxes[i];
    if (px >= tb.l && px < tb.r && py >= tb.t && py < tb.b) return tb;
  }
  return null;
};
// TBXB::_TbxtAnchor: which of the 8 resize zones (or move) a border-local pt is in
function tbAnchor(xp, yp, w, h) {
  const B = TBX_B;
  if (xp < B && yp < B) return 'upLeft';
  if (xp > w - B && yp > h - B) return 'downRight';
  if (xp > w - B && yp < B) return 'upRight';
  if (xp < B && yp > h - B) return 'downLeft';
  if (xp <= (w + B) / 2 && xp >= (w - B) / 2 && yp < B) return 'up';
  if (xp <= (w + B) / 2 && xp >= (w - B) / 2 && yp > h - B) return 'down';
  if (yp <= (h + B) / 2 && yp >= (h - B) / 2 && xp < B) return 'left';
  if (yp <= (h + B) / 2 && yp >= (h - B) / 2 && xp > w - B) return 'right';
  return 'move';
}
const inTboxBorder = (xp, yp, w, h) => xp < TBX_B || yp < TBX_B || xp > w - TBX_B || yp > h - TBX_B;
const TB_ANCHOR_CURS = { up: 'tboxvert', down: 'tboxvert', left: 'tboxhor', right: 'tboxhor', upLeft: 'tboxfall', downRight: 'tboxfall', upRight: 'tboxrise', downLeft: 'tboxrise', move: 'repositi' };
const TB_ANCHOR_HOT = { tboxvert: '8 7', tboxhor: '8 5', tboxfall: '7 7', tboxrise: '6 5', repositi: '8 1' };
// snapshot/restore for doc+rect ops (TUNT*/TUNC* undo objects in the original)
const tbSnapOf = (tb) => ({ l: tb.l, t: tb.t, r: tb.r, b: tb.b, fStory: tb.fStory, rtxt: structuredClone(tb.rtxt) });
const tbApply = (tb, d) => {
  Object.assign(tb, { l: d.l, t: d.t, r: d.r, b: d.b, fStory: d.fStory });
  tb.rtxt = structuredClone(d.rtxt); tb.rtxt._layout = null;
  player.gotoFrame(player.frame); draw();
};
function tbOp(tb, mut) { // run mut() live, then commit snapshot undo
  const d0 = tbSnapOf(tb);
  mut();
  const d1 = tbSnapOf(tb);
  if (JSON.stringify(d0) === JSON.stringify(d1)) { tbApply(tb, d0); return; }
  tb.rtxt._layout = null; draw();
  opExec({ do: () => tbApply(tb, structuredClone(d1)), undo: () => tbApply(tb, structuredClone(d0)) });
}
// text-edit burst: successive keystrokes merge into one undo op
function tbSnapStart(tb) {
  if (tbSnap && tbSnap.tb !== tb) tbSnapEnd();
  if (!tbSnap) tbSnap = { tb, d0: tbSnapOf(tb) };
}
function tbSnapEnd() {
  if (!tbSnap) return;
  const { tb, d0 } = tbSnap; tbSnap = null;
  const d1 = tbSnapOf(tb);
  if (JSON.stringify(d0) === JSON.stringify(d1)) return;
  opExec({ do: () => tbApply(tb, structuredClone(d1)), undo: () => tbApply(tb, structuredClone(d0)) });
}
function insTbox(fStory) { // STDIO::FCmdCreateTbox -> MVIE::FInsTbox (kxp/kyp/kdxp/kdypDefaultTbox)
  const s = player.scene, nfrm = player.frame;
  if (!s) return;
  const chid = Math.max(-1, ...s.actors.keys(), ...s.tboxes.keys()) + 1;
  const set = (on) => {
    if (on) {
      s.tboxes.set(chid, { cno: 0x8000 + chid, chid, nfrmFirst: nfrm, nfrmMax: 0x7fffffff, // klwMax
        l: 177, t: 78, r: 177 + 140, b: 78 + 100, fStory, _scv: 0,
        rtxt: { font: 'Comic Sans MS', dxpDef: 0, dypFont: 14, acrBack: -1, text: '', mpes: [], fonts: [] } });
      s.startEvents.push({ sevt: SEVT.AddTbox, nfrm, data: chid }); // FAddTboxCore: always the start list (frame-list AddTbox is invalid)
      setTbSel(chid); selChid = -1;
      tbAttach = { tb: s.tboxes.get(chid), moved: false }; // AttachToMouse: box tracks the cursor until a click drops it
      if (ed.view) ed.view.style.cursor = 'none';
    } else {
      s.tboxes.delete(chid);
      for (const l of [s.startEvents, s.frameEvents])
        for (let i = l.length - 1; i >= 0; i--) if (l[i].sevt === SEVT.AddTbox && l[i].data === chid) l.splice(i, 1);
      if (selTbChid === chid) setTbSel(-1);
      if (focusTbChid === chid) setTbFocus(-1);
      selTbSels.delete(chid);
      tbAttach = null; if (ed.view) ed.view.style.cursor = '';
    }
    player.gotoFrame(player.frame); draw();
  };
  opExec({ do: () => set(true), undo: () => set(false) });
  ed.openCover?.('words');           // EnableTboxTools: words row up + select tool armed
  ed.toolBtns?.['4ins']?.onclick();
}
function remTbox(tb) { // TBXG toolActorNuke -> SCEN::FRemTbox
  const chid = tbChidOf(tb), s = player.scene;
  const d0 = { rec: tbSnapOf(tb), cno: tb.cno, nfrmFirst: tb.nfrmFirst, nfrmMax: tb.nfrmMax,
    fev: structuredClone(s.frameEvents), sev: structuredClone(s.startEvents) };
  const set = (on) => {
    s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(d0.fev));
    s.startEvents.length = 0; s.startEvents.push(...structuredClone(d0.sev));
    if (on) {
      for (const l of [s.startEvents, s.frameEvents])
        for (let i = l.length - 1; i >= 0; i--) if (l[i].sevt === SEVT.AddTbox && l[i].data === chid) l.splice(i, 1);
      s.tboxes.delete(chid);
      if (selTbChid === chid) setTbSel(-1);
      if (focusTbChid === chid) setTbFocus(-1);
      selTbSels.delete(chid);
    } else {
      const rec = s.tboxes.get(chid) || {};
      Object.assign(rec, d0.rec, { cno: d0.cno, nfrmFirst: d0.nfrmFirst, nfrmMax: d0.nfrmMax });
      s.tboxes.set(chid, rec);
    }
    player.gotoFrame(player.frame); draw();
  };
  opExec({ do: () => set(true), undo: () => set(false) });
}
// TXRD::FApplyChp: apply masked chp sprms to [a,b), preserving per-segment values
function applyChp(tb, a, b, chg) {
  const doc = tb.rtxt;
  if (a === b || !doc) return;
  if (a > b) [a, b] = [b, a];
  const m0 = doc.mpes;
  const lwAt = (sprm, cp) => { let lw = 0; for (const m of m0) if (m.sprm === sprm && m.cp <= cp) lw = m.lw; return lw; };
  const encoders = {
    fore: { sprm: SPRM.Fore, lw: () => (((chg.acr >>> 0) - 0x01000000) | 0) }, // ACR.LwGet - kacrBlack.LwGet
    font: { sprm: SPRM.Font, lw: () => chg.fontIdx },
    dyp: { sprm: SPRM.Style, lw: (old) => (old & 0xffff) | ((((chg.dyp - doc.dypFont) & 0xffff) << 16) | 0) },
    grfont: { sprm: SPRM.Style, lw: (old) => (old & ~0xff) | (chg.grfont & 0xff) }, // lwMask=0xff: all 8 style bits overwritten
  };
  for (const key of Object.keys(chg)) {
    const E = encoders[key];
    if (!E) continue;
    const segs = []; // resolved-lw runs inside [a,b) on the ORIGINAL mpe list
    let s0 = a, prev = lwAt(E.sprm, a);
    for (let cp = a + 1; cp < b; cp++) {
      const lw = lwAt(E.sprm, cp);
      if (lw !== prev) { segs.push({ cp0: s0, lw: prev }); s0 = cp; prev = lw; }
    }
    segs.push({ cp0: s0, lw: prev });
    const keep = m0.filter((m) => !(m.sprm === E.sprm && m.cp >= a && m.cp < b));
    let before = 0;
    for (const m of keep) if (m.sprm === E.sprm && m.cp < a) before = m.lw;
    let lastLw = null;
    for (const seg of segs) {
      const nlw = E.lw(seg.lw);
      lastLw = nlw;
      if (seg.cp0 === a && nlw === before) continue; // continues the pre-range value
      keep.push({ sprm: E.sprm, cp: seg.cp0, lw: nlw });
    }
    if (b < doc.text.length) {
      const rb = lwAt(E.sprm, b);
      if (rb !== lastLw) keep.push({ sprm: E.sprm, cp: b, lw: rb }); // restore post-range value
    }
    doc.mpes = keep;
  }
  doc.mpes.sort((x, y) => x.sprm - y.sprm || x.cp - y.cp);
  doc._layout = null;
}
const applyChpOp = (tb, a, b, chg) => tbOp(tb, () => applyChp(tb, a, b, chg));
// TXRG::FApplyChp: applies to the box's own cp selection; a collapsed caret
// stores the change as _chpIns so it styles the next typed text
function applyChpSel(tb, chg) {
  const chid = tbChidOf(tb);
  const s = chid === focusTbChid ? tbSel : selTbSels.get(chid);
  if (s && s.anchor !== s.other) {
    const [a, b] = s.anchor < s.other ? [s.anchor, s.other] : [s.other, s.anchor];
    applyChpOp(tb, a, b, chg);
  } else {
    tb._chpIns = { ...(tb._chpIns || {}), ...chg };
  }
}
function tbInsText(tb, cp, str) { // TBXG text insert: shift mpes past cp
  const doc = tb.rtxt;
  tbSnapStart(tb);
  const n = str.length;
  doc.text = doc.text.slice(0, cp) + str + doc.text.slice(cp);
  for (const m of doc.mpes) if (m.cp > cp) m.cp += n;
  if (tb._chpIns) applyChp(tb, cp, cp + n, tb._chpIns); // TXRG insert-chp styles the new text
  doc._layout = null;
  if (TBX_PAINT_TOOL[ed.tool]) { ed.tool = 'tboxSel'; ed.syncTbFaces?.(); } // TBXG::InvalCp: paint tools revert to move on text change
  return cp + n;
}
function tbDelText(tb, a, b) { // delete [a,b): pull interior mpes back to a
  const doc = tb.rtxt, n = b - a;
  if (n <= 0) return a;
  tbSnapStart(tb);
  doc.text = doc.text.slice(0, a) + doc.text.slice(b);
  for (const m of doc.mpes) { if (m.cp >= a && m.cp <= b) m.cp = a; else if (m.cp > b) m.cp -= n; }
  doc.mpes.sort((x, y) => x.sprm - y.sprm || x.cp - y.cp);
  doc._layout = null;
  if (TBX_PAINT_TOOL[ed.tool]) { ed.tool = 'tboxSel'; ed.syncTbFaces?.(); } // TBXG::InvalCp: paint tools revert to move on text change
  return a;
}

function updateUi() { if (player) syncStudio(); }
let sayEl = null, sayTm = null;
function say(msg) { // PushErc-style notice: transient toast on the stage (errors, saves)
  console.log('[mms]', msg);
  if (!sayEl) { sayEl = document.createElement('div'); sayEl.id = 'say'; $('studio').appendChild(sayEl); }
  sayEl.textContent = msg; sayEl.classList.add('show');
  clearTimeout(sayTm); sayTm = setTimeout(() => sayEl.classList.remove('show'), 3000);
}
function draw() {
  renderer.selActor = selActor();
  // tbox editor overlay: the border-selected box gets the TBXB frame/anchors;
  // the interior-focused box shows its cp selection + caret (they can differ —
  // TBXG interior clicks never move PtboxSelected in the original)
  const chromeTb = !playing && (tbAttach?.tb || selTbox());
  const editTb = !playing && !tbAttach && focusTbox();
  renderer.tbEd = (chromeTb || editTb)
    ? { chrome: chromeTb, tb: editTb,
        a: tbSel ? Math.min(tbSel.anchor, tbSel.other) : 0, b: tbSel ? Math.max(tbSel.anchor, tbSel.other) : 0,
        caret: tbSel && tbSel.anchor === tbSel.other ? tbSel.other : null } // caret only on a collapsed sel
    : null;
  try { renderer.render(player); } catch (e) { console.error('render:', e); } updateUi();
}

// --- options ---------------------------------------------------------------
const opts = { fps24: false, modernLighting: false, shadows: false, castOnOthers: false, selfShadow: false, smoothTex: false, smoothVerts: false, scale2x: false, aa: false, aaMode: 4, mute: false, wireframe: false, lightInt: 1, selfShadowOp: 0.65 };
try { Object.assign(opts, JSON.parse(localStorage.getItem('opts3dmm') || '{}')); } catch { /* bad saved opts */ }
if (opts.aa && typeof opts.aa !== 'boolean') { opts.aaMode = opts.aa; opts.aa = true; } // migrate old numeric aa value

let raf = null, acc = 0, last = 0;
function loopTick(now) {
  if (!playing) return;
  const frameDur = 1000 / FPS;
  acc += now - last; last = now;
  while (acc >= frameDur) {
    renderer.beginFrame();
    if (!player.step()) { setPlaying(false); return; }
    acc -= frameDur;
  }
  try { renderer.render(player, acc / frameDur); } catch (e) { console.error('render:', e); }
  updateUi();
  raf = requestAnimationFrame(loopTick);
}
function startLoop() {
  if (opts.fps24) { acc = 0; last = performance.now(); raf = requestAnimationFrame(loopTick); }
  else timer = setInterval(() => { if (!player.step()) setPlaying(false); draw(); }, 1000 / FPS);
}
function setPlaying(p) {
  playing = p; clearInterval(timer); if (raf) cancelAnimationFrame(raf);
  if (p) { sounds.ensure(); startLoop(); }
  else sounds.suspend();
  const pb = $('stb_play');
  if (pb) { pb.classList.toggle('on', p); pb._sync(); }
  updateUi();
  modeSync?.(); // theatre/embed UI follows play state
}

const OPT_DEFS = [
  ['playback', [
    ['fps24', 'smooth playback (24 fps)'],
    ['mute', 'mute'],
  ]],
  ['lighting', [
    ['modernLighting', 'modern lighting (smooth shading)', [['lightInt', 'intensity', 0, 200]]],
  ]],
  ['shadows', [
    ['selfShadowOp', 'shadow opacity', 'range', [0, 100]],
    ['shadows', 'ground shadows'],
    ['castOnOthers', 'cast on others'],
    ['selfShadow', 'self shadows'],
  ]],
  ['textures', [
    ['smoothTex', 'smooth textures'],
    ['smoothVerts', 'vertex smoothing'],
  ]],
  ['rendering', [
    ['scale2x', '2x render resolution'],
    ['aa', 'antialiasing', [['aaMode', 'mode', 'sel', [[2, 'msaa 2x'], [4, 'msaa 4x'], [8, 'msaa 8x'], ['fsaa', 'fsaa (2x supersample)']]]]],
    ['wireframe', 'wireframe'],
  ]],
];
const optCbs = {};
{
  const menu = document.createElement('div');
  menu.id = 'optsMenu'; menu.hidden = true;
  document.body.appendChild(menu); // dev options panel — shown via ?menu=1 (no debug-bar chrome anymore)
  let savedAll = null; // enabled set remembered by "toggle all"
  const toggleAll = document.createElement('button');
  toggleAll.className = 'optToggleAll';
  toggleAll.textContent = 'toggle all';
  toggleAll.onclick = () => {
    const keys = Object.keys(opts).filter((k) => typeof opts[k] === 'boolean');
    if (keys.some((k) => opts[k])) {
      savedAll = keys.filter((k) => opts[k]);
      for (const k of keys) opts[k] = false;
    } else {
      for (const k of savedAll || keys) opts[k] = true; // all off: restore remembered set, else enable all
      savedAll = null;
    }
    for (const [k, cb] of Object.entries(optCbs)) { cb.checked = !!opts[k]; if (cb._sub) cb._sub.hidden = !cb.checked; }
    localStorage.setItem('opts3dmm', JSON.stringify(opts));
    sounds.setMuted(opts.mute, playing);
    renderer.setOpts(opts);
    if (playing) setPlaying(true); // restart loop if fps24 changed
    draw();
  };
  menu.appendChild(toggleAll);
  for (const [cat, defs] of OPT_DEFS) {
    const h = document.createElement('div');
    h.className = 'optCat'; h.textContent = cat;
    menu.appendChild(h);
    for (const [key, label, sliders, selOpts] of defs) {
      const l = document.createElement('label');
      if (sliders === 'range') { // standalone slider option (fraction 0-1 value)
        l.className = 'optRange';
        const r = document.createElement('input');
        r.type = 'range'; r.min = selOpts[0]; r.max = selOpts[1]; r.value = Math.round(opts[key] * 100);
        r.oninput = () => { opts[key] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
        l.append(label, r);
        menu.appendChild(l);
        continue;
      }
      const cb = document.createElement('input');
      optCbs[key] = cb;
      cb.type = 'checkbox'; cb.checked = !!opts[key];
      l.append(cb, label);
      menu.appendChild(l);
      let sub = null;
      if (sliders) {
        sub = document.createElement('div');
        sub.className = 'optSub'; sub.hidden = !cb.checked;
        for (const [skey, slabel, min, max] of sliders) {
          const sl = document.createElement('label');
          if (min === undefined) { // boolean sub-option
            sl.className = 'optCheck';
            const scb = document.createElement('input');
            scb.type = 'checkbox'; scb.checked = !!opts[skey];
            optCbs[skey] = scb;
            scb.onchange = () => { opts[skey] = scb.checked; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            sl.append(scb, slabel);
          } else if (min === 'sel') { // dropdown sub-option
            sl.className = 'optCheck';
            const sel = document.createElement('select');
            for (const [v, t] of max) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
            sel.value = String(opts[skey]);
            sel.onchange = () => { opts[skey] = isNaN(+sel.value) ? sel.value : +sel.value; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            sl.append(slabel, sel);
          } else {
            const r = document.createElement('input');
            r.type = 'range'; r.min = min; r.max = max; r.value = Math.round(opts[skey] * 100);
            r.oninput = () => { opts[skey] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            sl.append(slabel, r);
          }
          sub.appendChild(sl);
        }
        menu.appendChild(sub);
        cb._sub = sub;
      }
      cb.onchange = () => {
        opts[key] = cb.checked;
        localStorage.setItem('opts3dmm', JSON.stringify(opts));
        if (sub) sub.hidden = !cb.checked;
        if (key === 'mute') sounds.setMuted(opts.mute, playing);
        else renderer.setOpts(opts);
        if (key === 'fps24' && playing) setPlaying(true); // restart the loop in the new mode
        draw();
      };
    }
  }
}
renderer.setOpts(opts);
sounds.muted = opts.mute;
let saveHandle = null; // FileSystemFileHandle for cidSave (FGetFniSave result)
function open(buffer, name, cacheDoc = true) {
  setPlaying(false);
  sounds.stopAll();
  // MVU::FCloseDoc keep-changes check: unsaved ops prompt before replacing
  if (player && (hist.undos.length || hist.redos.length) && !confirm('Discard unsaved changes to the current movie?')) return false;
  let p;
  try { p = new MoviePlayer(new ChunkyFile(buffer, name), lib); }
  catch (e) { // _FLoadMovie restore: a failed load leaves the old movie open
    say(e.message);
    return false;
  }
  player = p;
  saveHandle = null;
  window.player = player; window.sounds = sounds; window.renderer = renderer;
  window.__mms = { importSndFile, showRecorder, userSnds, getSndItems, ed, // debug/test hooks
    insTbox, pickTbox, selTbox, get selTbChid() { return selTbChid; }, get focusTbChid() { return focusTbChid; }, get tbSel() { return tbSel; }, get tbAttach() { return tbAttach; },
    get pendPlace() { return pendPlace; }, get selChid() { return selChid; }, spltThumbs, player: () => player, brwsTmpls, lib, pal,
    docDB, docFlush, get docDirty() { return docDirty; }, set docDirty(v) { docDirty = v; },
    get movieBytes() { return movieBytes; }, callout };
  player.onSnd = (ev) => sounds.play(ev);
  player.onSndStop = () => sounds.stopLoops();
  player.sndPlaying = () => sounds.playing(); // witUntilSnd polls the queue
  sounds.userSnd = async (key) => { // resolve 'usr' tags (imported/recorded sounds)
    const u = userSnds.find((x) => x.key === key);
    if (u && !u.buf && u.bytes && !u.midi) u.buf = await wavToBuf(u.bytes);
    else if (u && !u.buf && u.bytes && u.midi) { // user midi -> synth-render it lazily
      u.buf = await sounds._midiBuffer({ cf: { data: () => u.bytes }, cno: key });
    }
    return u;
  };
  player.onTransStart = () => renderer.snapshot(player);
  // every scene/frame change updates DOC_POS — a refresh lands where the user was
  const _loadScene = p.loadScene.bind(p), _gotoFrame = p.gotoFrame.bind(p);
  p.loadScene = (i) => { _loadScene(i); posSave(); ed.syncToolState?.(); };
  p.gotoFrame = (n) => { _gotoFrame(n); posSave(); };
  player.loadScene(0);
  histClear(); selChid = -1; pendPlace = null;
  selTbChid = -1; focusTbChid = -1; tbSel = null; tbAttach = null; tbSnap = null; selTbSels.clear(); // stale tbox refs die with the movie
  if (player.warnings.length) console.warn(player.warnings);
  draw();
  if (cacheDoc) docMark(); // a newly loaded movie becomes the working doc (debounced — the caller may still reposition the scene)
  return true;
}
// --- portfolio commands (cidNew/cidOpen/cidSave/cidSaveAs, MVIE::FSave*) ------
const movieBytes = () => serializeMovie(player.movie, {
  rtmpl: (cno) => lib._rtmpl.get(cno) || null,
  userSnd: (key) => userSnds.find((u) => u.key === key) || null,
});
function newMovie() { // cidNew -> FLoadMovie(nil): PmvieNew(nil) = NO scenes (_iscen ivNil)
  open(serializeMovie({ name: 'A New Movie', scenes: [] }), 'A New Movie.3mm'); // idsEngineDefaultTitle
  setTimeout(guideTip, 450); // a sceneless doc gets the CO guide tip, on boot or via New
}
// --- working-doc autosave (the original's autosave doc: startup loads pfniUserDoc,
// else a blank doc — we keep the serialized .3MM in IndexedDB) ------------------
const docDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      let rq;
      try { rq = indexedDB.open('mmsdoc', 1); } catch { return res(null); } // blocked context
      rq.onupgradeneeded = () => rq.result.createObjectStore('doc');
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  },
  async put(rec) {
    const db = await this.open(); if (!db) return;
    await new Promise((res) => {
      try { // a leftover/empty mmsdoc db may lack the store — treat as unwritable
        const tx = db.transaction('doc', 'readwrite');
        tx.objectStore('doc').put(rec, 'autosave');
        tx.oncomplete = tx.onerror = tx.onabort = res;
      } catch { res(); }
    });
  },
  async get() { // newer of the IDB record and the localStorage mirror wins
    const db = await this.open();
    const idb = db ? await new Promise((res) => {
      try {
        const rq = db.transaction('doc').objectStore('doc').get('autosave');
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
      } catch { res(null); }
    }) : null;
    const ls = lsGet();
    if (idb && ls) return idb.t >= ls.t ? idb : ls;
    return idb || ls;
  },
};
// synchronous localStorage mirror — lands even when the pagehide/async-IDB
// write is killed, and covers contexts where indexedDB is unavailable
const DOC_LS = 'mmsdoc.autosave';
const DOC_POS = 'mmsdoc.pos'; // {scene, frame} — refreshed on every navigation
const posSave = () => { try { localStorage.setItem(DOC_POS, JSON.stringify({ scene: player.sceneIndex, frame: player.frame, t: Date.now() })); } catch { /* quota */ } };
const posGet = () => { try { return JSON.parse(localStorage.getItem(DOC_POS) || 'null'); } catch { return null; } };
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const lsPut = (rec) => { try { localStorage.setItem(DOC_LS, JSON.stringify({ ...rec, bytes: b64(rec.bytes) })); return true; } catch { return false; } };
const lsGet = () => { try { const r = JSON.parse(localStorage.getItem(DOC_LS) || 'null'); return r ? { ...r, bytes: unb64(r.bytes) } : null; } catch { return null; } };
let docDirty = false, docFlushing = false, docWarned = false, docTimer = null;
function docMark() { // an edit happened — flush soon; the leave handlers are a backstop
  docDirty = true;
  clearTimeout(docTimer); docTimer = setTimeout(docFlush, 1200);
}
async function docFlush() {
  if (!docDirty || docFlushing || !player) return;
  docFlushing = true;
  try {
    const rec = { bytes: movieBytes(), name: player.movie.name || 'A New Movie',
      scene: player.sceneIndex, frame: player.frame, t: Date.now() };
    docDirty = false;
    lsPut(rec);           // sync — always lands before any await
    await docDB.put(rec); // IDB for durability / movies over the LS quota
  } catch (e) {
    docDirty = true; console.warn('[autosave]', e);
    if (!docWarned) { docWarned = true; say(`autosave failed: ${e.message}`); } // surface it once, not every 3s
  }
  docFlushing = false;
}
setInterval(docFlush, 3000);
addEventListener('pagehide', docFlush);
addEventListener('beforeunload', docFlush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') docFlush(); });
// hard reload (Cmd/Ctrl+Shift+R, Shift+F5) -> wipe the working doc before the
// page is torn down; the leave-flush must not write it back (docDirty = false)
addEventListener('keydown', (e) => {
  if (!e.shiftKey || !((e.metaKey || e.ctrlKey) && e.code === 'KeyR' || e.key === 'F5')) return;
  docDirty = false;
  try {
    localStorage.removeItem(DOC_LS); localStorage.removeItem(DOC_POS);
    docDB._db?.close(); // unblock deleteDatabase
    indexedDB.deleteDatabase('mmsdoc');
  } catch { /* blocked */ }
}, true);
function openMovieFile() { // cidOpen -> file picker (FGetFniOpen); any .3MM is accepted, open() validates CHN2
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.onchange = async () => { const f = inp.files[0]; if (f) open(await f.arrayBuffer(), f.name); };
  inp.click();
}
async function saveMovie(saveAs = false) { // MVIE::FSave / FGetFniSave
  const name = `${player.movie.name || 'A New Movie'}.3mm`;
  try {
    if (!saveAs && saveHandle) {
      const ws = await saveHandle.createWritable();
      await ws.write(movieBytes()); await ws.close();
    } else if (window.showSaveFilePicker) {
      saveHandle = await showSaveFilePicker({ suggestedName: name,
        types: [{ description: '3D Movie Maker movie', accept: { 'application/octet-stream': ['.3mm'] } }] });
      const ws = await saveHandle.createWritable();
      await ws.write(movieBytes()); await ws.close();
    } else { // no file-system access — download is the browser's save dialog
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([movieBytes()]));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      saveHandle = null;
    }
    say(`saved ${saveHandle?.name || name}`);
  } catch (e) { if (e.name !== 'AbortError') say(`save failed: ${e.message}`); }
}
async function openUrl(urlOrName, cacheDoc = true) { // ?3mm= — returns null on success, else a friendly error
  let url;
  try { url = /^[\w.-]+$/.test(urlOrName) ? `${B}movies/${urlOrName}` : new URL(urlOrName, location.href).href; }
  catch { return `that doesn't look like a movie link`; }
  let buf;
  try {
    const res = await fetch(url);
    if (res.status === 404) return `couldn't find that movie — the link may have moved or been deleted`;
    if (!res.ok) return `the movie link didn't work (server said ${res.status})`;
    const ct = res.headers.get('content-type') || '';
    buf = await res.arrayBuffer();
    // SPA fallback serves index.html for missing files — same thing as a 404
    if (ct.includes('text/html')) return `couldn't find that movie — the link may have moved or been deleted`;
  } catch { return `couldn't reach that movie — check the link and your connection`; }
  const magic = buf.byteLength >= 4 ? String.fromCharCode(...new Uint8Array(buf, 0, 4)) : '';
  if (magic !== 'CHN2' && magic !== '2NHC') return `that file isn't a 3D Movie Maker movie`;
  const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || 'movie.3mm';
  return open(buf, name, cacheDoc) ? null : `couldn't load that movie`;
}

// --- studio editor chrome (visual layout only for now) ----------------------
// Positions lifted from 3DMMEx studio.cht / pos3.chh: bitmap lands at (gob - preg).
const STUDIO_IMGS = [ // [name, x, y, w, h] in the original 640x480 screen space
  ['back1', 0, 0, 640, 100], ['back2', 0, 97, 48, 314], ['back3', 592, 97, 48, 313], ['back4', 0, 406, 640, 74],
  ['vsld', 331, 414, 29, 45], ['name', 28, 464, 300, 16],
];
const TIP_TEXT = { // stb id or tool bmp -> 'Title\nDescription' verbatim from src/help/tooltips.cht (ktt* topics)
  frmRWEnd: 'First\nGo to the first frame of the current scene.', frmRW: 'Previous\nGo to the previous frame of the current scene.',
  frmFW: 'Next\nGo to the next frame of the current scene.', frmFWEnd: 'Last\nGo to the last frame of the current scene.',
  scnRWEnd: 'First Scene\nGo to the first scene.', scnRW: 'Previous Scene\nGo to the previous scene.',
  scnFW: 'Next Scene\nGo to the next scene.', scnFWEnd: 'Last Scene\nGo to the last scene.',
  play: 'Play/Stop \nClick to Play and Stop your movie.',
  undo: 'Undo/Redo\nUndo the last thing you did!  Redo what you undid!',
  ccp: 'Cut, Copy, & Paste Tools\nGet rid of, copy, paste, or move things from one place to another.',
  port: 'Portfolio\nStart a new movie, open an existing movie, and save your work!',
  book: '3D Movie Maker\nCheck out the source code for the original Microsoft© 3D Movie Maker™ on Github.',
  map: 'Source Code\nView the source code for this project on Github.',
  '1back': 'Scene Choices\nChoose from many different scenes!', // kidSettingsBrowser
  '1view': 'Camera Angles\nChoose a different camera view of the current scene.',
  p3rmbk: 'Remove Everything Before\nRemove everything before the current frame in the current scene.',
  p3rmfw: 'Remove Everything After\nRemove everything after the current frame in the current scene.',
  '1scen': 'Scene Organizer\nChange the scene order and add transitions.',
  '2actr': 'Actors\nChoose from many characters!', '2prop': 'Props \nAdd props like furniture and cars!',
  '2splt': '3D Words\nCreate 3D words that can spin and move!',
  '2comp': 'Reposition\nReposition an actor, prop, or 3D word and its path from the current frame on.',
  '2cont': 'Resume Last Action\nContinue the last action an actor, prop, or 3D word used.',
  '2acts': 'Actions\nMake the actor, prop, or 3D word you click move!',
  '2cost': 'Costume Changer\nChange the way the actor, prop, or 3D word you click looks!',
  '2rot': 'Rotate Tools\nChange the direction an actor, prop, or 3D word faces.',
  '2xy': 'Up & Down\nWhen this is "on," you can move an actor, prop, or 3D word up and down (instead of near and far).',
  '2zero': 'Fall Through Ground\nWhen this is "on," an actor, prop, or 3D word can move through the ground surface.  Otherwise, it can\'t.',
  '2tran': 'Size Tools\nResize an actor, prop, or 3D word!',
  '2soon': 'Synchronize\nChange when an actor, prop, or 3D word gets to a particular location.',
  '2bio': 'Talent Book\nGives you the scoop on all the actors you can use in your movie!',
  '3horn': 'Sound Effects\nAdd sound effects.', '3mike': 'Speech\nMake an actor talk!',
  '3note': 'Music\nAttach music to a background.',
  '3sing': 'Play Once\nAttaches the sound you choose and plays it one time.',
  '3loop': 'Loop\nAttaches the sound you choose and plays it continuously.',
  '3ear': 'Listener\nListen to, remove, or change the volume of individual sounds.',
  '3rpt': 'Action Matcher\nAttaches a sound to the current action position.',
  '1note': 'Wait For Sound to End\nPause the movie action until a sound is finished.',
  '4new': 'Word Box\nCreate a box where you can type your movie story or credits.',
  '4ins': 'Insertion Point\nMove, resize, or change words in a word box.',
  '4font': 'Letters\nChange the way your letters look!', '4bold': 'Styles\nMake words stand out with styles like bold or italic.',
  '4size': 'Letter Size\nChange the size of your letters.', '4colr': 'Letter Color\nChange the color of your letters.',
  '4back': 'Background Color\nChange the background color of a word box.',
  '4scrl': 'Scrolling or Non-Scrolling Words\nChange a word box so that words scroll or stay still!',
  p3cut: 'Cut\nCut what you click.  If you want, you can paste it in another location.',
  p3copy: 'Copy\nCopy what you click so that you can paste it in another location.',
  p3cppt: 'Copy Path\nCopy the path of the actor, prop, or 3D word you click.',
  p3past: 'Paste\nPaste whatever you most recently cut or copied at the place where you click.',
  p3rmac: 'Remove 3D Object\nRemove the actor, prop, or 3D word you click from the current scene.',
};

const STUDIO_BTNS = [ // [id, up, down/selected, x, y, w, h]
  ['frmRWEnd', 'frwe', 'frwes', 108, 414, 22, 17], ['frmRW', 'frw', 'frws', 130, 414, 22, 17],
  ['frmFW', 'ffw', 'ffws', 240, 414, 22, 17], ['frmFWEnd', 'ffwe', 'ffwes', 262, 414, 22, 17],
  ['scnRWEnd', 'srwe', 'srwes', 108, 439, 22, 17], ['scnRW', 'srw', 'srws', 130, 439, 22, 17],
  ['scnFW', 'sfw', 'sfws', 240, 439, 22, 17], ['scnFWEnd', 'sfwe', 'sfwes', 262, 439, 22, 17],
  ['play', 'play', 'plays', 301, 414, 26, 45],
  ['undo', 'undo', 'undos', 371, 411, 49, 52], ['ccp', 'ccp', 'ccps', 424, 411, 49, 52],
  ['port', 'port', 'ports', 481, 411, 49, 52], ['book', 'book', 'bookc', 534, 411, 49, 52],
  ['map', 'map', 'mapc', 587, 411, 49, 52],
];
const STUDIO_TXT = [ // [id, x, y, w, h] text overlays drawn on the baked fields
  ['stfnum', 56, 413, 40, 18], ['stsnum', 56, 440, 40, 17], ['stname', 30, 464, 296, 16],
];
const stSliders = []; // {th, axis, min, span, get}
{
  const studio = $('studio'), view = $('view');
  const place = (el, x, y, w, h) => {
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  };
  place(view, 48, 100, 544, 306);
  ed.view = view;
  // view clicks: pending actor placement, else pick+drag actors (compose/record tools)
  const viewNdc = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2]; };
  const viewPx = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 544, (e.clientY - r.top) / r.height * 306]; };
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
    : k === 'dyp' ? { dyp: 1, dyp: tbPaint.dyp }
    : { grfont: 1, grfont: tbPaint.grfont, mask: 3 });
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !player || playing) return;
    // sooner/later buttons' track-mouse: any click not on the buttons closes the
    // session, switches back to compose, and the click proceeds normally
    if (sl) { endSoonerLater(); ed.toolBtns?.['2comp']?.onclick(); }
    const [px, py] = lastViewPt = viewPx(e);
    if (tbAttach) { // AttachToMouse: the click drops the new tbox (TBXB::FCmdTrackMouse)
      const { tb, moved } = tbAttach; tbAttach = null; view.style.cursor = '';
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
        setTbSel(tbChidOf(tbHit)); selChid = -1;
        for (const L of rcLists) L.sel = -1;
        drag = { kind: 'tbRc', tb: tbHit, anchor: tbAnchor(lx, ly, w, h), rc0: { l: tbHit.l, t: tbHit.t, r: tbHit.r, b: tbHit.b }, px0: px, py0: py };
        view.setPointerCapture(e.pointerId); draw();
        return;
      }
      // interior (TBXG): fill/type tools hit the clicked box; the rest focus it + start a caret/text drag
      if (ed.tool === 'tbFill') { tbOp(tbHit, () => { tbHit.rtxt.acrBack = tbPaint.acr; tbHit.rtxt._layout = null; }); return; } // FSetAcrBack(AcrPaint)
      if (ed.tool === 'tbStory' || ed.tool === 'tbCredit') { const fs = ed.tool === 'tbStory'; tbOp(tbHit, () => { tbHit.fStory = fs; }); return; } // FSetType — any box, selected or not
      setTbFocus(tbChidOf(tbHit)); selChid = -1;
      const cp = hitTbox(tbHit, renderer.ovCtx, renderer.palColors, px, py); // interior: caret + text selection drag
      tbSel = { anchor: cp, other: cp };
      drag = { kind: 'tbTxt', tb: tbHit, paint: PAINT_CHP[ed.tool] || null };
      view.setPointerCapture(e.pointerId); draw();
      return;
    }
    if (TBX_TOOL[ed.tool]) { // text mode skips actor picking entirely: a miss just SelectTbox(pvNil)
      if (selTbChid >= 0) { setTbSel(-1); draw(); }
      return;
    }
    const [nx, ny] = viewNdc(e);
    if (pendPlace) {
      const p = renderer.groundPoint(nx, ny, 0);
      if (p) (pendPlace.tdt ? insTdt : placeActor)(pendPlace.tdt ?? pendPlace, { x: p.x, y: 0, z: p.z });
      pendPlace = null; view.style.cursor = ''; draw();
      return;
    }
    const a = renderer.pickActor(nx, ny);
    selChid = a ? chidOf(a) : -1;
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
      rot = { a, lx: e.clientX, ly: e.clientY, axis: ROT_AXIS[ed.tool], evs0: structuredClone(a.data.events) };
      view.setPointerCapture(e.pointerId);
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
      xform = { a, lx: e.clientX, ly: e.clientY, kind: XFM_TOOL[ed.tool], evs0: structuredClone(a.data.events) };
      view.setPointerCapture(e.pointerId);
      return;
    }
    if (ed.tool === 'sooner') { // toolSoonerLater: grab -> sooner/later buttons appear on release
      slPend = a;
      view.setPointerCapture(e.pointerId);
      return;
    }
    if (ed.tool !== 'compose' && ed.tool !== 'record') return;
    const wp = { x: a.xyz.x + a.dxyzRte.x, y: a.xyz.y + a.dxyzRte.y, z: a.xyz.z + a.dxyzRte.z };
    const pt = ed.xy ? renderer.viewPlanePoint(nx, ny, wp) : renderer.groundPoint(nx, ny, wp.y);
    if (!pt) return;
    if (ed.tool === 'record') { // toolRecordSameAction (FBeginRecord/FRecordMove/FEndRecord, actor.cpp)
      setPlaying(false); // recording drives the clock itself
      const R = rec = { a, wp, p0: { x: pt.x, y: pt.y, z: pt.z }, cur: { ...wp }, s: { ...a.dxyzRte },
        started: false, ticks: 0, ti: 0, raw: { x: 0, y: 0, z: 0 }, frozen: e.shiftKey, // fmafFreeze: shift records frozen
        f0: player.frame, route0: structuredClone(a.data.route), events0: structuredClone(a.data.events), nfrmLast0: player.scene.nfrmLast };
      const evt = (aet, data) => a.addDoAev(aet, data); // _FAddDoAev: insert at cursor + execute
      const begin = () => { // toolRecordSameAction mousedown asserts the action (FSetAction),
        a.setActionCore(a.anid, a.celn, R.frozen);     // then FBeginRecord + DeleteFwdCore(fFalse)
        const pts = a.route.slice(0, Math.max(0, a.rtel.irpt) + 1);
        if (a.rtel.dwrOffset > 0 && a.rtel.irpt >= 0 && pts.length) { // mid-segment: keep partial segment + split point
          const t = pts[pts.length - 1];
          pts[pts.length - 1] = { ...t, dwr: Math.max(0.01, Math.hypot(a.xyz.x - t.x, a.xyz.y - t.y, a.xyz.z - t.z)) };
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
          for (const e of a.events) {
            if (e.rtel.irpt >= irptIns) e.rtel.irpt++;
            else if (e.rtel.irpt === irptIns - 1 && irptIns < a.route.length - 1 && e.rtel.dwrOffset >= dwrCur) { e.rtel.dwrOffset -= dwrCur; e.rtel.irpt++; }
          }
          R.ti = R.ticks;
        }
        if (player.frame >= s.nfrmLast) s.nfrmLast = player.frame + 1; // scene grows as it records
        player.gotoFrame(player.frame + 1);
        draw();
      }, 1000 / FPS);
      view.setPointerCapture(e.pointerId);
      return;
    }
    drag = { a, wp, base: { ...a.dxyzSubRte }, p0: { x: pt.x, y: pt.y, z: pt.z }, cur: { ...a.dxyzSubRte },
      shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    lastViewPt = viewPx(e);
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
      const [nx, ny] = viewNdc(e);
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
      const ang = -((e.clientX - rot.lx) + (e.clientY - rot.ly)) * 0.001 * 2 * Math.PI;
      rot.lx = e.clientX; rot.ly = e.clientY;
      if (ang) { const r = { x: 0, y: 0, z: 0 }; r[rot.axis] = rot.axis === 'y' ? -ang : ang; // X/Z positive, Y negated
        rot.a.fRotate(r.x, r.y, r.z, e.metaKey || e.ctrlKey); draw(); } // cmd = aetRotF, else aetRotH
      return;
    }
    if (xform) { // MVU::_MouseDrag toolResize/toolSquashStretch: brs = ±(dx+dy)*0.001 + 1
      const d = (e.clientX - xform.lx) + (e.clientY - xform.ly);
      xform.lx = e.clientX; xform.ly = e.clientY;
      if (xform.kind === 'sqsh') { const brs = 1 + -d * 0.001; if (brs) xform.a.fPull(brs, 1 / brs, brs); } // FSquashStretchActr: no-op at brs 0
      else xform.a.fScale(1 + d * 0.001);
      draw();
      return;
    }
    if (!drag) return;
    const [nx, ny] = viewNdc(e);
    const pt = ed.xy ? renderer.viewPlanePoint(nx, ny, drag.wp) : renderer.groundPoint(nx, ny, drag.wp.y);
    if (!pt) return;
    const s = { x: drag.base.x + pt.x - drag.p0.x, y: drag.base.y + pt.y - drag.p0.y, z: drag.base.z + pt.z - drag.p0.z };
    if (ed.ground) s.y = drag.base.y; // fRGround: actor stays on the ground
    drag.cur = s;
    drag.a.dxyzSubRte = { ...s }; drag.a._updateXyzRte(); drag.a._positionBody();
    draw();
  });
  const endDrag = (e) => {
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
      const e0 = { ...ev.data };
      const set = (ed2, s) => { Object.assign(ev.data, ed2); a.dxyzSubRte = { ...s }; a._updateXyzRte(); a._positionBody(); };
      opExec({ do: () => set({ ...e0, x: e0.x + d.x, y: e0.y + d.y, z: e0.z + d.z }, cur), undo: () => set(e0, base) });
      draw();
      return;
    }
    const evs0 = structuredClone(a.data.events);
    const reval = (evs) => { a.data.events = a.events = structuredClone(evs); a.nfrmCur = null; player.gotoFrame(player.frame); draw(); };
    if (fCmd) { // FTweakRoute: absolute route-local position anchored at this rtel
      const t = { x: a.xyz.x + d.x, y: a.xyz.y + d.y, z: a.xyz.z + d.z };
      opExec({ do: () => { a.addDoAev(AET.Tweak, t); draw(); }, undo: () => reval(evs0) });
    } else { // aetMove: cumulative offset event at the cursor (BUG1870 merge-add)
      opExec({ do: () => { a.addDoAev(AET.Move, d); draw(); }, undo: () => reval(evs0) });
    }
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  // FCmdMouseMove: armed tools show their cursor only while hovering an actor
  // (PactrFromPt), else the default cursor. cutactor/nukscen .cur hotspots (8,10)/(11,3).
  const TOOL_CURS = { cut: `url(${B}cur/cutactor.cur) 8 10, auto`, nuke: `url(${B}cur/nukscen.cur) 11 3, auto`,
    costume: `url(${B}cur/costume.cur) 0 6, auto`, rotx: `url(${B}cur/rotatex.cur) 8 15, auto`,
    roty: `url(${B}cur/rotatey.cur) 14 7, auto`, rotz: `url(${B}cur/rotatez.cur) 10 15, auto`,
    rotnorm: `url(${B}cur/normaliz.cur) 0 0, auto`,
    sqsh: `url(${B}cur/squashst.cur) 7 7, auto`, size: `url(${B}cur/sizevenl.cur) 7 8, auto`,
    sizenorm: `url(${B}cur/normaliz.cur) 0 0, auto`,
    sooner: `url(${B}cur/squashst.cur) 7 7, auto`, // kcrsSoonerLater shares squashst.cur in the original
    sounder: `url(${B}cur/cur00003.cur) 7 12, auto`, looper: `url(${B}cur/cur00002.cur) 5 10, auto`,
    matcher: `url(${B}cur/cur00001.cur) 3 12, auto`, listener: `url(${B}cur/listen.cur) 4 4, auto`,
    tbPaintText: `url(${B}cur/fontextc.cur) 0 3, auto`, tbFont: `url(${B}cur/fontextc.cur) 0 3, auto`,
    tbSize: `url(${B}cur/fontextc.cur) 0 3, auto`, tbStyle: `url(${B}cur/fontextc.cur) 0 3, auto`,
    tbFill: `url(${B}cur/textback.cur) 2 15, auto`, tbStory: `url(${B}cur/textback.cur) 2 15, auto`,
    tbCredit: `url(${B}cur/textback.cur) 2 15, auto` };
  view.addEventListener('pointermove', (e) => {
    const [px, py] = lastViewPt = viewPx(e);
    if (tbAttach) { view.style.cursor = 'none'; return; }
    const cur = TOOL_CURS[ed.tool];
    if (TBX_TOOL[ed.tool] || (ed.tool === 'nuke' && pickTbox(px, py))) { // tbox tools cursor per TBXG/TBXB FCmdMouseMove
      const tb = pickTbox(px, py);
      if (!tb) { view.style.cursor = ed.tool === 'tboxSel' ? `url(${B}cur/repositi.cur) 8 1, auto` : (cur || ''); return; }
      if (ed.tool === 'nuke') { view.style.cursor = TOOL_CURS.nuke; return; }
      const lx = px - tb.l, ly = py - tb.t, w = tb.r - tb.l, h = tb.b - tb.t;
      if (ed.tool === 'tboxSel') { // border anchor cursors; ibeam over the text
        if (inTboxBorder(lx, ly, w, h)) {
          const c = TB_ANCHOR_CURS[tbAnchor(lx, ly, w, h)];
          view.style.cursor = `url(${B}cur/${c}.cur) ${TB_ANCHOR_HOT[c]}, auto`;
        } else view.style.cursor = `url(${B}cur/ibeam.cur) 5 3, auto`;
        return;
      }
      view.style.cursor = cur || ''; // paint/fill/type tools show their cursor over the box
      return;
    }
    if (cur === undefined) return;
    if (playing) { view.style.cursor = ''; return; }
    const [nx, ny] = viewNdc(e);
    const a = renderer.pickActor(nx, ny);
    // FCmdMouseMove: sound-attach tools need a loaded tool sound, but show their
    // cursor anywhere on the view; the listener always shows (and auditions)
    if (SND_TOOL[ed.tool]) { view.style.cursor = ed.sndTag ? cur : ''; return; }
    if (ed.tool === 'listener') {
      view.style.cursor = cur;
      if (a !== earHover) { // _pactrListener hover change -> replay that side's frame sounds
        earHover = a || null;
        sounds.stopAll();
        if (a && a.onStage) a.replaySnd();
        else player._replaySnd();
      }
      return;
    }
    view.style.cursor = a ? cur : '';
  });
  view.addEventListener('pointerleave', () => { if (TOOL_CURS[ed.tool] !== undefined || TBX_TOOL[ed.tool]) view.style.cursor = ''; });
  document.addEventListener('pointerdown', () => { if (player) player.clk = true; }, true); // witUntilClick resume
  // TBXG text mode: while a tbox tool is armed and a box is selected, typing
  // edits the doc (keystrokes merge into one undo op via tbSnap)
  document.addEventListener('keydown', (e) => {
    const tb = focusTbox(); // keys go to the TBXG with focus — the last interior-clicked box
    if (!tb || !tbSel || !TBX_TOOL[ed.tool] || playing || brwsEl) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
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
      const { tb, moved } = tbAttach; tbAttach = null; view.style.cursor = '';
      if (moved) tbOp(tb, () => {});
      draw();
      return;
    }
    if (tbSel && focusTbChid >= 0) { tbSel = { anchor: tbSel.other, other: tbSel.other }; draw(); } // collapse sel to caret, then still disarm
    if (pendPlace) { pendPlace = null; view.style.cursor = ''; return; }
    if (TOOL_CURS[ed.tool] !== undefined || TBX_TOOL[ed.tool]) { // disarm an armed tool (the original has no Esc; selecting another tool is the canonical disarm)
      tbSnapEnd();
      ed.tool = 'none'; view.style.cursor = ''; endSoonerLater(); earHover = undefined;
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      for (const o of ccpCells) o._sync?.();
    }
  });
  for (const [n, x, y, w, h] of STUDIO_IMGS) {
    const im = document.createElement('img');
    im.src = `${B}textures/${n}.png`; im.className = 'stImg'; im.draggable = false;
    studio.insertBefore(im, view); place(im, x, y, w, h);
  }
  for (const [id, x, y, w, h] of STUDIO_TXT) {
    const d = document.createElement('div');
    d.id = id; d.className = 'stTxt';
    studio.appendChild(d); place(d, x, y, w, h);
  }
  { // the original's EXIT strip (kidExit, quits the app) — a web page can't quit,
    // so its slot shows the app version instead
    const ver = document.createElement('div');
    ver.className = 'stVer'; ver.textContent = 'v' + version;
    studio.appendChild(ver); place(ver, 584, 466, 51, 14);
    const a = document.createElement('a'); // preview the working doc in the theatre
    a.id = 'stTheatre'; a.className = 'stLink'; a.textContent = 'play in theatre';
    const u = new URL(location.href); u.searchParams.set('mode', 'theatre');
    a.href = u.href; a.target = '_blank'; a.rel = 'noopener';
    studio.appendChild(a); place(a, 470, 466, 108, 14);
  }
  { // the original's kidName is display-only (title comes from the saved file's
    // leaf name) — here the bar doubles as the rename field: click to edit,
    // Enter/blur commits, Esc cancels
    const nameBar = $('stname');
    nameBar.style.pointerEvents = 'auto'; nameBar.style.cursor = 'text';
    nameBar.onclick = () => {
      if (nameBar.querySelector('input')) return;
      const inp = document.createElement('input');
      inp.className = 'stNameInp'; inp.value = player.movie.name || ''; inp.maxLength = 64;
      nameBar.textContent = ''; nameBar.appendChild(inp);
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
  const toStudio = (e) => { const r = studio.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 640, (e.clientY - r.top) / r.height * 480]; };
  const mkSlider = (id, x, y, w, h, img, tx, ty, tw, th, axis, min, span, get, set) => {
    const ov = document.createElement('div'); // transparent drag surface over the track
    ov.className = 'stSld'; studio.appendChild(ov); place(ov, x, y, w, h);
    const tim = document.createElement('img');
    tim.src = `${B}textures/${img}.png`; tim.className = 'stImg stThumb'; tim.draggable = false;
    studio.appendChild(tim); place(tim, tx, ty, tw, th);
    stSliders.push({ th: tim, axis, min, span, get });
    ov.onpointerdown = (e) => {
      ov.setPointerCapture(e.pointerId);
      const move = (ev) => { const [gx, gy] = toStudio(ev); set(Math.max(0, Math.min(1, ((axis === 'x' ? gx : gy) - min) / span))); };
      move(e);
      ov.onpointermove = move;
      ov.onpointerup = ov.onpointercancel = () => { ov.onpointermove = null; };
    };
  };
  const nScenes = () => Math.max(1, player.movie.scenes.length - 1);
  const fSpan = () => Math.max(1, player.scene.nfrmLast - player.scene.nfrmFirst);
  mkSlider('stfs', 151, 410, 89, 26, 'fthm', 151, 412, 13, 20, 'x', 151, 76,
    () => (player.scene ? (player.frame - player.scene.nfrmFirst) / fSpan() : 0),
    (f) => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmFirst + Math.round(f * fSpan())); draw(); });
  mkSlider('stss', 151, 434, 89, 26, 'stmb', 151, 437, 13, 20, 'x', 151, 76,
    () => Math.max(0, player.sceneIndex) / nScenes(),
    (f) => { setPlaying(false); player.loadScene(Math.max(0, Math.min(nScenes(), Math.round(f * nScenes())))); draw(); });
  mkSlider('stvs', 331, 414, 29, 45, 'volthmb', 335, 428, 12, 6, 'y', 417, 32,
    () => 1 - sounds.volume,
    (f) => { sounds.setVolume(1 - f); localStorage.setItem('vol3dmm', String(sounds.volume)); syncStudio(); });
  sounds.setVolume(parseFloat(localStorage.getItem('vol3dmm') || '1'));
  const ACTIONS = {
    frmRWEnd: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmFirst); draw(); },
    frmRW: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.frame - 1); draw(); },
    frmFW: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.frame + 1); draw(); },
    frmFWEnd: () => { if (!player.scene) return; setPlaying(false); player.gotoFrame(player.scene.nfrmLast); draw(); },
    scnRWEnd: () => { setPlaying(false); player.loadScene(0); selTbChid = -1; focusTbChid = -1; tbSel = null; tbAttach = null; selTbSels.clear(); draw(); },
    scnRW: () => { setPlaying(false); player.loadScene(Math.max(0, player.sceneIndex - 1)); selTbChid = -1; focusTbChid = -1; tbSel = null; tbAttach = null; selTbSels.clear(); draw(); },
    scnFW: () => { setPlaying(false); player.loadScene(Math.min(player.movie.scenes.length - 1, player.sceneIndex + 1)); selTbChid = -1; focusTbChid = -1; tbSel = null; tbAttach = null; selTbSels.clear(); draw(); },
    scnFWEnd: () => { setPlaying(false); player.loadScene(player.movie.scenes.length - 1); selTbChid = -1; focusTbChid = -1; tbSel = null; tbAttach = null; selTbSels.clear(); draw(); },
    play: () => { sounds.ensure(); setPlaying(!playing); },
    undo: () => { const b = $('stb_undo'); if (!b._en) return; (hist.mode === 'u' ? histUndo : histRedo)(); draw(); },
    ccp: () => toggleCcp(), // kidCutCopyPaste dropdown (popups.cht)
    port: () => togglePort(), // kidPortfolio briefcase (studio.cht)
    book: () => window.open('https://github.com/microsoft/Microsoft-3D-Movie-Maker', '_blank'),
    map: () => window.open('https://github.com/permpkin/3dmm-web', '_blank'),
  };
  for (const [id, up, dn, x, y, w, h] of STUDIO_BTNS) {
    const b = document.createElement('button');
    b.id = 'stb_' + id; b.className = 'stBtn';
    if (TIP_TEXT[id]) b.dataset.tip = TIP_TEXT[id]; // GOK's cnoTopic -> HBAL
    const im = document.createElement('img');
    im.src = `${B}textures/${up}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, x, y, w, h);
    b._sync = () => { im.src = `${B}textures/${b.classList.contains('on') || b.classList.contains('down') ? dn : up}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    if (ACTIONS[id]) b.onclick = () => ACTIONS[id]();
  }
  { // undo uses state faces (undo/undos=redo/undod), not the generic up/down pair
    const b = $('stb_undo'), im = b.firstElementChild;
    b._sync = () => { syncUndoBtn(); im.style.filter = b.classList.contains('down') && b._en ? 'brightness(.6)' : ''; };
    b._sync();
  }

  // cut/copy/paste popup (popups.cht kidCutCopyPaste): bg rect (224,354)-(470,406),
  // cells at child-x 24/73/122/171/220 (49x52 each, absolute 248+49k). Cells are
  // radio-commands: clicking one clears the active tool (chttActor = chttNone).
  const ccpBg = document.createElement('div');
  ccpBg.className = 'ccpBg'; studio.appendChild(ccpBg); place(ccpBg, 224, 354, 246, 52);
  ccpBg.style.display = 'none';
  const ccpCells = [];
  for (const [bmp, x, tool] of [ // pos3.chh kxpCCP* — copy/copyRoute/paste pending
    ['p3cut', 24, 'cut'],   // cidCutTool -> SetTool(toolCutObject) — arms a persistent cut tool
    ['p3copy', 73, null], ['p3cppt', 122, null], ['p3past', 171, null],
    ['p3rmac', 220, 'nuke'], // cidActorNuke -> SetTool(toolActorNuke)
  ]) {
    const b = document.createElement('button');
    b.className = 'stBtn ccpCell';
    if (TIP_TEXT[bmp]) b.dataset.tip = TIP_TEXT[bmp]; // GOK's cnoTopic -> HBAL
    const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, 224 + x - 24, 354, 49, 52); // REP_MBMPREG kxpregCCP*=24: bitmaps draw gobpos-preg -> contiguous from bg left
    b.style.display = 'none';
    ccpCells.push(b);
    if (!tool) { im.style.opacity = '.35'; continue; }
    b._tool = tool; // pressed face (bmp+'c') also shows while the tool stays armed
    b._sync = () => { im.src = `${B}textures/${bmp}${ed.tool === tool || b.classList.contains('down') ? 'c' : ''}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = () => { // CCP cell script: clear the actor tool (chttActor=chttNone), arm ours, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      for (const o of ccpCells) o._sync?.();
      setCcp(false);
    };
  }
  const ccpBtn = () => $('stb_ccp');
  const setCcp = (open) => { // kstOpen/kstClosed on kidCCPBackground
    ccpBg.style.display = open ? '' : 'none';
    for (const b of ccpCells) b.style.display = open ? '' : 'none';
    const b = ccpBtn(); if (b) { b.classList.toggle('on', open); b._sync(); }
  };
  const toggleCcp = () => setCcp(ccpBg.style.display === 'none');
  document.addEventListener('pointerdown', (e) => { // popup tracks the mouse; outside click closes
    if (ccpBg.style.display === 'none') return;
    if (e.target === ccpBtn() || ccpBtn()?.contains(e.target) || ccpCells.includes(e.target) || ccpCells.some((b) => b.contains(e.target))) return;
    setCcp(false);
  });

  // portfolio popup (popups.cht kidPortsBackground): open rect (477,198)-(589,406);
  // children at child-y 52/104/156/208 with preg 52 -> 112x52 cells at y 198/250/302/354
  const portBg = document.createElement('img');
  portBg.src = `${B}textures/p1par.png`; portBg.className = 'stImg'; portBg.draggable = false;
  studio.appendChild(portBg); place(portBg, 477, 198, 112, 208); portBg.style.display = 'none';
  const portCells = [];
  for (const [up, dn, y, fn] of [
    ['p1new', 'p1news', 198, () => newMovie()],        // kidPortsNew -> cidNew
    ['p1open', 'p1openc', 250, () => openMovieFile()], // kidPortsPortfolio -> cidOpen
    ['p1save', 'p1saves', 302, () => saveMovie()],     // kidPortsSave -> cidSave
    ['p1svas', 'p1svass', 354, () => saveMovie(true)], // kidPortsSaveAs -> cidSaveAs
  ]) {
    const b = document.createElement('button');
    b.className = 'stBtn';
    const im = document.createElement('img'); im.src = `${B}textures/${up}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, 477, y, 112, 52);
    b.style.display = 'none';
    portCells.push(b);
    b._sync = () => { im.src = `${B}textures/${b.classList.contains('down') ? dn : up}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = () => { setPort(false); fn(); }; // child script: kstClosed, then EnqueueCid
  }
  const setPort = (open) => { // kstOpen/kstClosed on kidPortsBackground
    portBg.style.display = open ? '' : 'none';
    for (const b of portCells) b.style.display = open ? '' : 'none';
    const b = $('stb_port'); if (b) { b.classList.toggle('on', open); b._sync(); } // ChangeStateGob(kidPortfolio, kstSelected/Default)
  };
  const togglePort = () => setPort(portBg.style.display === 'none');
  document.addEventListener('pointerdown', (e) => { // track-mouse script: outside click
    if (portBg.style.display === 'none') return;     // closes and passes through (Return fFalse)
    if (e.target === $('stb_port') || $('stb_port')?.contains(e.target)) return;
    if (portCells.includes(e.target) || portCells.some((b) => b.contains(e.target))) return;
    setPort(false);
  });
  document.addEventListener('keydown', (e) => { // kchidScript2 -> Return(fTrue): popup eats keys
    if (portBg.style.display !== 'none') { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // rotate popup (popups.cht kidRotatePopup): p5par bg gobpos (293,271) preg (23,174)
  // -> tl (270,97) 46x176; cells child-x 46 preg (46,21) -> tl (270, 97/141/185/229) 46x44
  const rotBg = document.createElement('img');
  rotBg.src = `${B}textures/p5par.png`; rotBg.className = 'stImg'; rotBg.draggable = false;
  studio.appendChild(rotBg); place(rotBg, 270, 97, 46, 176); rotBg.style.display = 'none';
  const rotCells = [];
  for (const [bmp, y, tool] of [['p5rotx', 97, 'rotx'], ['p5roty', 141, 'roty'], ['p5rotz', 185, 'rotz'], ['p5norm', 229, 'rotnorm']]) {
    const b = document.createElement('button');
    b.className = 'stBtn ccpCell';
    const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, 270, y, 46, 44);
    b.style.display = 'none';
    rotCells.push(b);
    b._sync = () => { im.src = `${B}textures/${bmp}${ed.tool === tool || b.classList.contains('down') ? 's' : ''}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsRotate, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      const rb = rotBtn(); if (rb) { rb.classList.add('on'); rb._sync(); }
      for (const o of ccpCells) o._sync?.();
      setRot(false);
    };
  }
  const rotBtn = () => TB.find((t) => t.id === 'actors')?.secBtns?.['2rot'];
  const setRot = (open) => {
    rotBg.style.display = open ? '' : 'none';
    for (const b of rotCells) { b.style.display = open ? '' : 'none'; b._sync(); }
    const rb = rotBtn(); if (rb && open) { rb.classList.add('on'); rb._sync(); }
  };
  const rotOpen = () => rotBg.style.display !== 'none';
  document.addEventListener('pointerdown', (e) => { // outside click closes; 2rot stays selected iff a rotate tool is armed
    if (!rotOpen()) return;
    if (rotBtn()?.contains(e.target) || rotCells.some((b) => b.contains(e.target))) return;
    setRot(false);
    const rb = rotBtn();
    if (rb && !ROT_AXIS[ed.tool] && ed.tool !== 'rotnorm') { rb.classList.remove('on'); rb._sync(); }
  });

  // transform popup (popups.cht kidTransformBackground): p4par bg gobpos (460,227)
  // preg (23,130) -> tl (437,97) 46x132; cells p4shrk/p4sqsh/p4norm preg (0,42)
  // -> tl (437, 97/141/185) 46x44 — order per pos3.chh is Shrink, Squash, Norm
  const trnBg = document.createElement('img');
  trnBg.src = `${B}textures/p4par.png`; trnBg.className = 'stImg'; trnBg.draggable = false;
  studio.appendChild(trnBg); place(trnBg, 437, 97, 46, 132); trnBg.style.display = 'none';
  const trnCells = [];
  for (const [bmp, y, tool] of [['p4shrk', 97, 'size'], ['p4sqsh', 141, 'sqsh'], ['p4norm', 185, 'sizenorm']]) {
    const b = document.createElement('button');
    b.className = 'stBtn ccpCell';
    const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, 437, y, 46, 44);
    b.style.display = 'none';
    trnCells.push(b);
    b._sync = () => { im.src = `${B}textures/${bmp}${ed.tool === tool || b.classList.contains('down') ? 's' : ''}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = () => { // cell script: deselect old tool, arm ours, select kidActorsTransform, close
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      ed.tool = tool;
      const tb2 = trnBtn(); if (tb2) { tb2.classList.add('on'); tb2._sync(); }
      for (const o of ccpCells) o._sync?.();
      setTrn(false);
    };
  }
  const trnBtn = () => TB.find((t) => t.id === 'actors')?.secBtns?.['2tran'];
  const setTrn = (open) => {
    trnBg.style.display = open ? '' : 'none';
    for (const b of trnCells) { b.style.display = open ? '' : 'none'; b._sync(); }
    const tb2 = trnBtn(); if (tb2 && open) { tb2.classList.add('on'); tb2._sync(); }
  };
  const trnOpen = () => trnBg.style.display !== 'none';
  document.addEventListener('pointerdown', (e) => { // outside click closes; 2tran stays selected iff a transform tool is armed
    if (!trnOpen()) return;
    if (trnBtn()?.contains(e.target) || trnCells.some((b) => b.contains(e.target))) return;
    setTrn(false);
    const tb2 = trnBtn();
    if (tb2 && !XFM_TOOL[ed.tool] && ed.tool !== 'sizenorm') { tb2.classList.remove('on'); tb2._sync(); }
  });

  // sooner/later (STDIO::StartSoonerLater): floating 2sbtn/2lbtn pair at
  // (247,376)/(320,376) appears after grabbing an actor; holding a button repeats
  // FSoonerLaterActr(Nfrm-+1) per tick, accelerating (klwSLDelay 24->12 cells)
  let sl = null; // {a, events0, frame0} — session state while the buttons are open
  const slEls = [];
  for (const [bmp, x, dn] of [['2sbtn', 247, -1], ['2lbtn', 320, 1]]) {
    const b = document.createElement('button');
    b.className = 'stBtn ccpCell';
    const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, x, 376, 73, 30);
    b.style.display = 'none';
    let rep = null, delay = 800;
    const stop = () => { clearTimeout(rep); rep = null; delay = 800; b.classList.remove('down'); im.src = `${B}textures/${bmp}.png`; };
    const tick = () => { if (!sl) { stop(); return; } slTick(dn); if (sl) { delay = Math.max(400, delay - 100); rep = setTimeout(tick, delay); } }; // klwSLDelayMax->Min accel
    b.onpointerdown = (e) => {
      e.stopPropagation(); // the view's track-mouse would end the session
      if (!sl) { stop(); return; }
      b.classList.add('down'); im.src = `${B}textures/${bmp}s.png`;
      slTick(dn);
      rep = setTimeout(tick, delay);
    };
    b.onpointerup = b.onpointerleave = stop;
    slEls.push(b);
  }
  const startSoonerLater = (a) => {
    endSoonerLater();
    sl = { a, events0: structuredClone(a.data.events), frame0: player.frame };
    for (const b of slEls) b.style.display = '';
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
    for (const b of slEls) b.style.display = 'none';
    const events1 = structuredClone(a.data.events), frame1 = player.frame;
    if (JSON.stringify(events0) === JSON.stringify(events1) && frame0 === frame1) return;
    const set = (evs, fr) => { a.data.events = a.events = structuredClone(evs);
      a.data.nfrmFirst = evs[0].nfrm; a.data.nfrmLast = evs[evs.length - 1].nfrm;
      a.nfrmCur = null; player.gotoFrame(fr); draw(); };
    opExec({ do: () => set(events1, frame1), undo: () => set(events0, frame0) });
  }
  // track-mouse script: a mousedown anywhere except the two buttons ends the
  // session and reverts to compose; the click itself still proceeds normally
  document.addEventListener('pointerdown', (e) => {
    if (!sl || slEls.some((b) => b.contains(e.target))) return;
    endSoonerLater(); ed.toolBtns?.['2comp']?.onclick();
  }, true);

  // --- words-tab popups ------------------------------------------------------
  // scroll-type popup (popups.cht kidScrollBackground): p7par (480,100) 46x88,
  // p7scrl (credits) -> chttTboxScroll/toolTboxCredit, p7nscr (story) -> toolTboxStory
  const scrlBg = document.createElement('img');
  scrlBg.src = `${B}textures/p7par.png`; scrlBg.className = 'stImg'; scrlBg.draggable = false;
  studio.appendChild(scrlBg); place(scrlBg, 480, 100, 46, 88); scrlBg.style.display = 'none';
  const scrlCells = [];
  for (const [bmp, y, tool] of [['p7scrl', 100, 'tbCredit'], ['p7nscr', 144, 'tbStory']]) {
    const b = document.createElement('button');
    b.className = 'stBtn ccpCell';
    const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, 480, y, 46, 44);
    b.style.display = 'none';
    scrlCells.push(b);
    b._sync = () => { im.src = `${B}textures/${bmp}${ed.tool === tool || b.classList.contains('down') ? 's' : ''}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = () => { // cell script: SetTool, close the popup, keep 4scrl selected
      tbSnapEnd();
      ed.tool = tool;
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      const sb = scrlBtn(); if (sb) { sb.classList.add('on'); sb._sync(); }
      setScrl(false); draw();
    };
  }
  const scrlBtn = () => TB.find((t) => t.id === 'words')?.secBtns?.['4scrl'];
  const setScrl = (open) => {
    scrlBg.style.display = open ? '' : 'none';
    for (const b of scrlCells) { b.style.display = open ? '' : 'none'; b._sync(); }
    const sb = scrlBtn();
    if (sb) { // selected while open OR while a scroll-type tool is armed
      sb.classList.toggle('on', open || ed.tool === 'tbStory' || ed.tool === 'tbCredit');
      sb._sync();
    }
  };
  document.addEventListener('pointerdown', (e) => {
    if (scrlBg.style.display === 'none') return;
    if (scrlBtn()?.contains(e.target) || scrlCells.some((b) => b.contains(e.target))) return;
    setScrl(false);
  });

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
    const w = TB.find((t) => t.id === 'words'); if (!w) return;
    for (const [bmp, b] of Object.entries(w.secBtns)) { b.classList.toggle('on', TOOL_TBFACE[ed.tool] === bmp); b._sync(); }
    for (const b of scrlCells) b._sync();
  };
  ed.syncTbFaces = syncTbFaces;
  const tpop = { el: null, cells: [], kind: null, pg: 0 };
  const tpopBtn = () => TB.find((t) => t.id === 'words')?.secBtns?.[TBPOP_BTN[tpop.kind]];
  function armTbPaint(tool) { // MVU::SetTool(lwMode<0, ptbox): FSetAcrText et al apply to the box under the cursor
    tbSnapEnd();
    ed.tool = tool;
    syncTbFaces();
    const tb = lastViewPt ? pickTbox(lastViewPt[0], lastViewPt[1]) : null;
    const key = PAINT_CHP[tool];
    if (tb && key) applyChpSel(tb, tbPaintChg(tb, key));
    draw();
  }
  function showTextPop(kind) {
    if (tpop.kind === kind) { closeTextPop(); return; }
    closeTextPop();
    const d = TBPOP_DEF[kind];
    tpop.kind = kind; tpop.pg = 0;
    const el = tpop.el = document.createElement('div');
    el.className = 'tbPopBg'; studio.appendChild(el);
    const rows = Math.min(d.items.length, d.page);
    place(el, d.x, d.y, d.w, rows * d.fh + (d.items.length > d.page ? 21 : 0));
    const b0 = tpopBtn(); if (b0) { b0.classList.add('on'); b0._sync(); }
    buildTpopCells();
  }
  function buildTpopCells() {
    for (const b of tpop.cells) b.remove();
    tpop.cells = [];
    const d = TBPOP_DEF[tpop.kind];
    d.items.slice(tpop.pg * d.page, tpop.pg * d.page + d.page).forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'stBtn ccpCell';
      const im = document.createElement('img'); im.src = `${B}textures/d8frm.png`; im.draggable = false;
      b.appendChild(im); studio.appendChild(b); place(b, d.x, d.y + i * d.fh, it.iscr !== undefined ? 102 : d.w, d.fh);
      const fill = document.createElement('div');
      b.appendChild(fill);
      if (it.iscr !== undefined) { // Tcth/Tbth swatch inside the 4px frame; iscr 0 = clear
        fill.style.cssText = 'position:absolute;left:4%;right:4%;top:18%;bottom:18%;';
        fill.style.background = it.iscr === 0
          ? 'repeating-linear-gradient(45deg,#888 0 2px,#ccc 2px 4px)'
          : `rgb(${renderer.palColors[it.iscr].join(',')})`;
      } else {
        fill.style.cssText = 'position:absolute;left:5%;right:2%;top:0;bottom:0;overflow:hidden;display:flex;align-items:center;';
        const sp = document.createElement('span');
        if (it.name !== undefined) { sp.textContent = it.name; sp.style.font = `12px '${it.name}',sans-serif`; }
        else if (it.dyp !== undefined) { sp.textContent = 'Abcg'; sp.style.font = `${it.dyp}px "Comic Sans MS",sans-serif`; }
        else { sp.textContent = 'Ab'; sp.style.font = `${it.grfont & 1 ? 'bold ' : ''}${it.grfont & 2 ? 'italic ' : ''}14px "Comic Sans MS",sans-serif`; }
        sp.style.whiteSpace = 'nowrap';
        fill.appendChild(sp);
      }
      b.onmouseenter = () => { im.src = `${B}textures/d8frmh.png`; };
      b.onmouseleave = () => { im.src = `${B}textures/d8frm.png`; };
      b.onclick = () => tpopPick(it);
      tpop.cells.push(b);
    });
    const pages = Math.ceil(d.items.length / d.page);
    if (pages > 1) { // bottom-strip d8dn/d8up page arrows
      for (const [bmp, dn] of [['d8dn', 1], ['d8up', -1]]) {
        const b = document.createElement('button');
        b.className = 'stBtn ccpCell';
        const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
        b.appendChild(im); studio.appendChild(b); place(b, d.x + (dn > 0 ? 0 : d.w / 2), d.y + d.page * d.fh, d.w / 2, 21);
        b.onclick = () => { tpop.pg = Math.max(0, Math.min(tpop.pg + dn, pages - 1)); buildTpopCells(); };
        tpop.cells.push(b);
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
    tpop.el.remove(); tpop.el = null;
    for (const b of tpop.cells) b.remove();
    tpop.cells = []; tpop.kind = null;
    const w = TB.find((t) => t.id === 'words');
    if (w) for (const bmp of ['4font', '4bold', '4size', '4colr', '4back']) {
      const b = w.secBtns[bmp];
      if (b && TOOL_TBFACE[ed.tool] !== bmp) { b.classList.remove('on'); b._sync(); }
    }
  }
  document.addEventListener('pointerdown', (e) => {
    if (!tpop.el) return;
    const b0 = tpopBtn();
    if (b0?.contains(e.target) || tpop.cells.some((b) => b.contains(e.target)) || tpop.el.contains(e.target)) return;
    closeTextPop();
  });

  // roll calls (browser.cht kidRollCallActor/Prop; pos3.chh)
  // cells at (L.x,98+i*74), thumb inside at (2,2) 38x70, page arrows at y=394
  for (const L of rcLists) {
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.className = 'stBtn';
      const im = document.createElement('img'); im.draggable = false;
      b.appendChild(im); studio.appendChild(b); place(b, L.x, 98 + i * 74, 42, 74);
      const cv = document.createElement('canvas');
      cv.width = 38; cv.height = 70; cv.className = 'rcThumb';
      studio.appendChild(cv); place(cv, L.x + 2, 100 + i * 74, 38, 70);
      b.onclick = () => { const a = rcActs(L)[L.off + i]; if (a) { L.sel = L.off + i; selChid = chidOf(a); syncRollCall(); draw(); } };
      L.cells.push({ b, im, cv });
    }
    const mkArrow = (img, x, w, scroll) => {
      const b = document.createElement('button');
      b.className = 'stBtn';
      const im = document.createElement('img'); im.draggable = false;
      b.appendChild(im); studio.appendChild(b); place(b, x, 394, w, 17);
      const paint = () => { im.src = `${B}textures/${img}${b._en ? (b._dn ? 'c' : '') : 'd'}.png`; };
      b.onmousedown = () => { b._dn = true; paint(); };
      b.onmouseup = b.onmouseleave = () => { b._dn = false; paint(); };
      b.onclick = () => { if (b._en) { scroll(); L.sel = -1; syncRollCall(); } };
      L.arrows.push({ b, paint });
      return b;
    };
    mkArrow(L.up, L.x, 21, () => L.off--);
    mkArrow(L.dn, L.x + 20, 20, () => L.off++);
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
            ['4back', 419, 0, () => showTextPop('back')], ['4scrl', 477, 0, () => setScrl(scrlBg.style.display === 'none')]] },
  ];
  const TB_DOWN = { p3rmbk: 'p3rmbkc', p3rmfw: 'p3rmfwc', '2cost': '2costc', '2acts': '2acts' }; // non-'s' down bmps
  const animBtns = []; // buttons whose default face is a cycling REP_ANIM cell sequence
  setInterval(() => { for (const b of animBtns) { // advance unselected animated tool faces
    if (b.classList.contains('on') || b.classList.contains('down') || !b.isConnected) continue;
    b._ai = (b._ai + 1) % b._anim.length; b._sync();
  } }, 160);
  const mkTbBtn = (up, x, y, w, h, onclick) => {
    const dn = TB_DOWN[up] || up + 's';
    const b = document.createElement('button');
    b.className = 'stBtn';
    if (TIP_TEXT[up]) b.dataset.tip = TIP_TEXT[up]; // GOK's cnoTopic -> HBAL
    const im = document.createElement('img');
    im.src = `${B}textures/${up}.png`; im.draggable = false;
    b.appendChild(im); studio.appendChild(b); place(b, x, y, w, h);
    b._sync = () => { im.src = `${B}textures/${b.classList.contains('on') || b.classList.contains('down') ? dn : up}.png`; };
    b.onmousedown = () => { b.classList.add('down'); b._sync(); };
    b.onmouseup = b.onmouseleave = () => { b.classList.remove('down'); b._sync(); };
    b.onclick = onclick;
    return b;
  };
  for (const t of TB) {
    // insert buttons — created first so the cover image can cover them
    t.insBtns = t.ins.map(([bmp, x, act]) => mkTbBtn(bmp, x, 1, 62, 40,
      act ? () => showBrowser(act) : () => {}));
    // secondary tool row (Npar bg at y47 + buttons at abs coords, children of rowEl)
    t.rowEl = document.createElement('div');
    t.rowEl.hidden = true;
    studio.appendChild(t.rowEl);
    const bg = document.createElement('img');
    bg.src = `${B}textures/${t.row}.png`; bg.className = 'stImg'; bg.draggable = false;
    t.rowEl.appendChild(bg); place(bg, 0, 47, 640, 51);
    t.secBtns = {};
    for (const [bmp, x, w, act, anim] of t.sec) { // act: 'tog:key' toggle | string = browser | fn = command | none = radio tool; anim = cycling default-face cells
      const b = mkTbBtn(bmp, x, 48, w || 50, 48, null);
      if (anim) { // REP_ANIM default state (e.g. kidActorsActionBrowser: 2act01-06); on/down face is bmp
        b._anim = anim; b._ai = 0;
        b._sync = () => { b.firstElementChild.src = `${B}textures/${b.classList.contains('on') || b.classList.contains('down') ? bmp : b._anim[b._ai]}.png`; };
        b._sync(); animBtns.push(b);
      }
      if (typeof act === 'string' && act.startsWith('tog:')) {
        if (act === 'tog:pause') { // kidPausesSound: open/closed faces by fpseDown, not a tool
          b._sync = () => { b.firstElementChild.src = `${B}textures/${ed.pauseSnd ? '1notes' : '1note'}.png`;
            b.firstElementChild.style.filter = b.classList.contains('down') ? 'brightness(.6)' : ''; };
          b.onclick = () => editPause(!ed.pauseSnd);
        } else {
          const key = act.slice(4); // faces per sectools.cht: xy on='2xys'/XZ off='2xy'; ground on='2zero'/off='2zeros'
          b._sync = () => { const on = ed[key];
            b.firstElementChild.src = `${B}textures/${on === (key === 'ground') ? bmp : bmp + 's'}.png`;
            b.firstElementChild.style.filter = b.classList.contains('down') ? 'brightness(.6)' : ''; };
          b.onclick = () => { ed[key] = !ed[key]; b._sync(); };
        }
        b._sync();
      } else if (typeof act === 'string') b.onclick = () => showBrowser(act);
      else if (typeof act === 'function') b.onclick = () => { act(); draw(); };
      else b.onclick = () => { tbSnapEnd(); for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
        b.classList.add('on'); b._sync();
        ed.tool = { '2comp': 'compose', '2cont': 'record', '2acts': 'action', '2cost': 'costume', '2soon': 'sooner',
          '3sing': 'sounder', '3loop': 'looper', '3rpt': 'matcher', '3ear': 'listener', '4ins': 'tboxSel' }[bmp] || 'none';
        for (const o of ccpCells) o._sync?.(); setRot(false); setTrn(false); setScrl(false); closeTextPop(); endSoonerLater(); earHover = undefined; view.style.cursor = ''; }; // picking a tool disarms armed tools/popups
      t.rowEl.appendChild(b);
      t.secBtns[bmp] = b;
      if (!act) (ed.toolBtns ||= {})[bmp] = b; // programmatic tool select (e.g. action apply arms 2cont)
    }
    if (t.def) { t.secBtns[t.def].classList.add('on'); }
    // doors (sectools.cht kidDoors): a door bitmap covers the row's tail until clicked;
    // fAll*Doors persists for the session — opening the doors reveals the whole row
    t.doorEl = document.createElement('img');
    t.doorEl.className = 'stImg'; t.doorEl.draggable = false;
    t.doorEl.style.pointerEvents = 'none';
    t.rowEl.appendChild(t.doorEl); place(t.doorEl, 0, 47, 640, 51);
    t.doorZone = document.createElement('button');
    t.doorZone.className = 'stBtn doorZone';
    t.rowEl.appendChild(t.doorZone); place(t.doorZone, t.dx, 47, 640 - t.dx, 51);
    const paintDoor = () => {
      t.doorEl.src = `${B}textures/door${t.all ? t.door - 4 : t.door}.png`; // door5-8 -> door1-4
      t.doorZone.style.display = t.all ? 'none' : '';
    };
    t.doorZone.onclick = () => { if (!player?.scene) return; t.all = true; paintDoor(); }; // doors stay shut until tools are enabled
    paintDoor(); t.paintDoor = paintDoor;
    // cover tab — on top of the insert buttons; open = hidden (covr*o is transparent)
    t.covEl = document.createElement('img');
    t.covEl.src = `${B}textures/${t.cov}c.png`; t.covEl.className = 'covImg'; t.covEl.draggable = false;
    studio.appendChild(t.covEl); place(t.covEl, t.cx, 0, t.cov === 'covr1' ? 99 : t.cov === 'covr2' ? 223 : t.cov === 'covr3' ? 220 : 98, 43);
    t.covEl.onclick = () => { if (!t.locked) setCover(t.id); }; // kstDisabled face is inert
  }
  function setCover(id) { // exactly one cover open — the others stay covered
    for (const t of TB) { t.covEl.style.display = t.id === id ? 'none' : ''; t.rowEl.hidden = t.id !== id; }
    // original: cover-open CreateChildGob's the secondary-tools background, whose
    // CREATE script arms the tab's default tool — scenes=chttNone(toolDefault),
    // actors=compose, sounds=listener, words=tboxMove — so every tab switch
    // exits text mode; you can never get stuck in an armed tbox tool
    closeTextPop(); setScrl(false); setRot(false); setTrn(false); endSoonerLater(); earHover = undefined;
    const t = TB.find((tb) => tb.id === id);
    if (t?.def) ed.toolBtns?.[t.def]?.onclick();
    else { // chttNone -> toolDefault: nil tool, no face selected
      tbSnapEnd(); ed.tool = 'none'; view.style.cursor = '';
      for (const tb of TB) for (const o of Object.values(tb.secBtns || {})) { o.classList.remove('on'); o._sync?.(); }
      for (const o of ccpCells) o._sync?.();
    }
  }
  // STDIO::_SetToolStates -> kchidResetTools/kchidEnableSceneTools: a sceneless
  // movie keeps the scrollbar strip + undo/ccp covered by their lids (covr5c/
  // covr7c bitmaps) and locks the actor/sound/text covers (covr*d face, inert
  // clicks); the settings cover stays open — Scene Choices is the way out — and
  // book/map/portfolio stay usable (kidBooksCover open). The first scene lifts
  // the lids and unlocks the covers; nuking the last scene re-covers them.
  const stripLids = [];
  for (const [bmp, x, y, w, h] of [['door0', 0, 47, 640, 51], ['covr5c', 0, 410, 362, 56], ['covr7c', 364, 410, 110, 56]]) { // kidDoors kstDefault face (door0.bmp) + gob pos + preg -> drawn rects
    const im = document.createElement('img');
    im.src = `${B}textures/${bmp}.png`; im.className = 'stImg'; im.draggable = false; im.style.display = 'none';
    studio.appendChild(im); place(im, x, y, w, h);
    stripLids.push(im);
  }
  ed.syncToolState = () => {
    const noScene = !player?.scene;
    for (const im of stripLids) im.style.display = noScene ? '' : 'none';
    for (const t of TB) {
      if (t.id === 'scenes') continue;
      t.locked = noScene;
      t.covEl.src = `${B}textures/${t.cov}${noScene ? 'd' : 'c'}.png`;
      t.covEl.style.cursor = noScene ? 'default' : '';
    }
    if (noScene) {
      for (const t of TB) { t.all = false; t.paintDoor(); t.rowEl.hidden = true; } // kidDoors -> kstDefault; no secondary row while tools are locked
      setCover('scenes'); // resets the armed tool too (chttNone)
      TB[0].rowEl.hidden = true; // settings cover stays open but its tool row stays hidden
    } else { // kchidEnableSceneTools: restore the open cover's row + open its doors
      const open = TB.find((t) => t.covEl.style.display === 'none');
      if (open) { open.rowEl.hidden = false; if (!open.all) { open.all = true; open.paintDoor(); } }
    }
  };
  ed.openCover = setCover;
  setCover('scenes');
}
function syncStudio() { // reflect player state into the studio bar (called from updateUi)
  $('stfnum').textContent = player.scene ? player.frame - player.scene.nfrmFirst + 1 : '–';
  $('stsnum').textContent = player.sceneIndex >= 0 ? player.sceneIndex + 1 : '–';
  const nm = $('stname');
  if (!nm.querySelector('input')) nm.textContent = player.movie.name || 'A New Movie';
  for (const s of stSliders) {
    const p = s.min + s.get() * s.span;
    s.th.style[s.axis === 'x' ? 'left' : 'top'] = (p / (s.axis === 'x' ? 6.4 : 4.8)) + '%';
  }
  { // SSCB::SetSndFrame — the frame thumb shows the speaker face (fthms) while a
    // sound event lands exactly on the current frame (SEVT.PlaySnd or actor Snd)
    let snd = false;
    if (player.scene && player.frame !== null) {
      for (const e of player.scene.frameEvents || []) if (e.nfrm === player.frame && e.sevt === SEVT.PlaySnd) { snd = true; break; }
      if (!snd) for (const a of player.actors.values())
        for (const ev of a.events || []) if (ev.nfrm === player.frame && ev.aet === AET.Snd) { snd = true; break; }
    }
    const fth = stSliders[0]?.th, src = `${B}textures/fthm${snd ? 's' : ''}.png`;
    if (fth && !fth.src.endsWith(`/fthm${snd ? 's' : ''}.png`)) fth.src = src;
  }
  syncRollCall();
}
function syncRollCall() { // actor + prop roll calls: 4 cells each + page arrows (scrolls 1/click, no wrap)
  for (const L of rcLists) {
    const acts = rcActs(L);
    L.off = Math.max(0, Math.min(L.off, Math.max(0, acts.length - 4)));
    if (L.sel >= acts.length) L.sel = -1;
    const key = `${player?.sceneIndex}|${L.off}|${L.sel}|${acts.map((a) => a.data.arid).join(',')}`;
    if (key === L.key) continue;
    L.key = key;
    for (let i = 0; i < 4; i++) {
      const a = acts[L.off + i], cell = L.cells[i];
      const st = !a ? '' : L.off + i === L.sel ? 's' : 'e';
      if (cell._st !== st) { cell.im.src = `${B}textures/${L.prefix}${i + 1}${st}.png`; cell._st = st; }
      const ctx = cell.cv.getContext('2d');
      ctx.clearRect(0, 0, 38, 70);
      if (a) ctx.drawImage(rcThumbFor(a.data.tagTmpl?.cno, a), 0, 0);
      cell.cv.style.display = a ? '' : 'none';
    }
    L.arrows[0].b._en = acts.length > 4 && L.off > 0;
    L.arrows[1].b._en = acts.length > 4 && L.off < acts.length - 4;
    for (const ar of L.arrows) ar.paint();
  }
  syncSelBox();
}
// --- item browser dialogs (browser.cht): modal book panel + frame grid + page controls
const BRWS_DEFS = {
  // kidBrwsBackground/kidBrwsSceneFrames: book1 at (62,48) via reg (258,370); frames 136x78, cells +4.
  // Cancel/OK bitmaps are bottom-anchored (kypregGenericCancel=48): source y368 -> top-left 320.
  scene: { book: 'book1', x: 62, y: 48, fw: 136, fh: 78, fr: 'frame1', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  bkgd: { book: 'book1', x: 62, y: 48, fw: 136, fh: 78, fr: 'frame1', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  // kidBrwsCamera: book2 at (62,100), same grid, frame2 cells
  cam:  { book: 'book2', x: 62, y: 100, fw: 136, fh: 78, fr: 'frame2', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  actor: { book: 'book3', x: 62, y: 47, fw: 80, fh: 80, fr: 'frame3', cols: 5, rows: 3, x0: 30, y0: 38, sx: 94, sy: 94, fwd: [304, 322], back: [155, 322], num: [228, 327], can: [437, 320] },
  prop: { book: 'book4', x: 62, y: 47, fw: 80, fh: 80, fr: 'frame4', cols: 5, rows: 3, x0: 30, y0: 38, sx: 94, sy: 94, fwd: [304, 322], back: [155, 322], num: [228, 327], can: [437, 320] },
  // sound name-list browsers (browser.cht kidBrwsSounds*): book6=midi, book7=fx, book8=speech
  fx:     { book: 'book7', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], rec: [29, 320], imp: [79, 320] },
  speech: { book: 'book8', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], rec: [29, 320], imp: [79, 320] },
  music:  { book: 'book6', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], imp: [79, 320] },
};
let sndItems = null;
const userSnds = []; // imported/recorded: {kind:'fx'|'speech'|'music', name, buf, midi, key}
function getSndItems() { // MSNDs: WAVE kid = fx, MIDS kid = music; + user sounds tagged by browser
  if (!sndItems) {
    sndItems = { fx: [], music: [], speech: [] };
    const cf = lib.content.find((c) => c.name === 'SNDS.3CN');
    if (cf) for (const m of cf.ofType('MSND')) {
      const kids = cf.kidsOf('MSND', m.cno).map((k) => k.ctg);
      sndItems[kids.includes('MIDS') ? 'music' : 'fx'].push({ cno: m.cno, name: m.name });
    }
  }
  return { fx: [...sndItems.fx, ...userSnds.filter((u) => u.kind === 'fx')],
    speech: [...sndItems.speech, ...userSnds.filter((u) => u.kind === 'speech')],
    music: [...sndItems.music, ...userSnds.filter((u) => u.kind === 'music')] };
}
// user sound persistence (imported + recorded audio survives reloads)
const sndDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res) => {
      const rq = indexedDB.open('mms', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('snds', { autoIncrement: true });
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => res(null);
    });
  },
  async all() {
    const db = await this.open(); if (!db) return [];
    return new Promise((res) => {
      const out = [], cur = db.transaction('snds').objectStore('snds').openCursor();
      cur.onsuccess = () => { if (cur.result) { out.push({ key: cur.result.key, ...cur.result.value }); cur.result.continue(); } else res(out); };
      cur.onerror = () => res(out);
    });
  },
  async add(rec) {
    const db = await this.open(); if (!db) return null;
    return new Promise((res) => {
      const tx = db.transaction('snds', 'readwrite');
      const rq = tx.objectStore('snds').add(rec);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    });
  },
};
async function decodeAudioBytes(bytes) { // -> AudioBuffer|null via the live ctx (works while suspended)
  try { return await sounds.ensure().decodeAudioData(new Uint8Array(bytes).slice().buffer); } catch { return null; }
}
async function wavToBuf(wd) { // 3DMM ADPCM first, else standard wav decode
  const pcm = decodeWavAdpcm(wd);
  if (pcm) {
    const b = sounds.ctx.createBuffer(pcm.channels, pcm.frames, pcm.rate);
    pcm.out.forEach((ch, i) => b.copyToChannel(ch, i));
    return b;
  }
  return decodeAudioBytes(wd);
}
async function loadUserSnds() {
  for (const r of await sndDB.all())
    userSnds.push({ user: true, kind: r.kind, name: r.name, buf: null, bytes: r.bytes, midi: !!r.midi, key: r.key }); // buf decoded lazily on preview
}
async function addUserSnd(kind, it) {
  if (!it.buf && it.bytes && !it.midi) it.buf = await wavToBuf(it.bytes);
  const key = await sndDB.add({ kind, name: it.name, bytes: it.bytes, mime: it.mime, midi: !!it.midi });
  userSnds.push({ user: true, kind, name: it.name, buf: it.buf, midi: !!it.midi, key });
}
async function previewItem(it) { // browser select = play it (built-in msnd or user/import item)
  if (!it.buf && it.bytes && !it.midi) it.buf = await wavToBuf(it.bytes);
  sounds.preview(it);
}
// the bag button (browser.cht kidBrowserImport): pick a file, list the sounds found inside,
// OK imports the picked sound into the browser's list (original's import browser)
async function importSndFile(kind, file) {
  sounds.ensure();
  const bytes = await file.arrayBuffer();
  const u8 = new Uint8Array(bytes);
  const magic = String.fromCharCode(...u8.subarray(0, 4));
  const cands = [];
  if (magic === 'CHN2' || magic === '2NHC') { // movie/content file: list its MSND sounds
    try {
      const cf = new ChunkyFile(bytes);
      for (const m of cf.ofType('MSND')) {
        const kids = cf.kidsOf('MSND', m.cno);
        const wav = kids.find((k) => k.ctg === 'WAVE'), mid = kids.find((k) => k.ctg === 'MIDS');
        if (wav) cands.push({ name: m.name || file.name, bytes: cf.data('WAVE', wav.cno).slice(), mime: 'audio/wav' });
        else if (mid) cands.push({ name: m.name || file.name, bytes: cf.data('MIDS', mid.cno).slice(), mime: 'audio/mids', midi: true });
      }
    } catch (e) { console.warn('[import] chunky parse:', e.message); }
  } else {
    const midi = /\.(mid|midi|rmi)$/i.test(file.name);
    cands.push({ name: file.name.replace(/\.[^.]+$/, ''), bytes: u8, mime: file.type || 'audio/*', midi });
  }
  if (cands.length) showBrowser(kind, cands);
  else console.warn(`[import] no sounds found in ${file.name}`);
}
function importSndFiles(kind) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.multiple = true;
  inp.accept = kind === 'music' ? 'audio/*,.mid,.midi,.3mm,.3cn,.chn,.cfl' : 'audio/*,.3mm,.3cn,.chn,.cfl';
  inp.onchange = async () => { for (const f of inp.files) await importSndFile(kind, f); };
  inp.click();
}
function mbmpCanvas(m, w, h) { // draw an MBMP scaled into wxh — all baked thumbs index the social palette
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const src = document.createElement('canvas'); src.width = m.width; src.height = m.height;
  const x = src.getContext('2d'), im = x.createImageData(m.width, m.height);
  for (let i = 0; i < m.pixels.length; i++) {
    const p = m.pixels[i];
    if (p < 0) continue;
    im.data[i * 4] = pal[p * 3]; im.data[i * 4 + 1] = pal[p * 3 + 1]; im.data[i * 4 + 2] = pal[p * 3 + 2];
    im.data[i * 4 + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}
let brwsEl = null, brwsCleanup = null;
function closeBrowser() { sounds.stopPreview(); brwsCleanup?.(); brwsCleanup = null; brwsEl?.remove(); brwsEl = null; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && brwsEl) (brwsEl._onEsc || closeBrowser)(); }); // easel cidEaselCancel on Escape
function brwsShell() { // shared: overlay div + % placement helper
  closeBrowser();
  brwsEl = document.createElement('div');
  brwsEl.id = 'brws';
  $('studio').appendChild(brwsEl);
  const place = (el, x, y, w, h) => {
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  };
  const mkImg = (n, x, y, w, h, cls = 'stImg') => {
    const im = document.createElement('img');
    im.src = `${B}textures/${n}.png`; im.className = cls; im.draggable = false;
    brwsEl.appendChild(im); place(im, x, y, w, h);
    return im;
  };
  const mkBtn = (up, dn, x, y, w, h, act) => {
    const b = document.createElement('button');
    b.className = 'stBtn';
    const im = document.createElement('img');
    im.src = `${B}textures/${up}.png`; im.draggable = false;
    b.appendChild(im); brwsEl.appendChild(b); place(b, x, y, w, h);
    b.onmousedown = () => { im.src = `${B}textures/${dn}.png`; };
    b.onmouseup = b.onmouseleave = () => { im.src = `${B}textures/${up}.png`; };
    if (act) b.onclick = act;
    return b;
  };
  return { place, mkImg, mkBtn };
}
function showBrowser(kind, importItems = null) {
  if (kind === 'splt') return showSpletter();
  if (kind === 'words') return showWords();
  if (!player) return;
  const d = BRWS_DEFS[kind];
  const { place, mkImg, mkBtn } = brwsShell();
  const items = importItems || (kind === 'scene' ? player.movie.scenes.map((s, i) => ({ s, i }))
    : kind === 'cam' ? [...(bkthCaths.get(player.bkgd?.cno) ?? [])].sort((a, b) => a[0] - b[0]).map(([icam, mbmp]) => ({ icam, name: `camera ${icam}`, mbmp }))
    : d.fw === 138 ? getSndItems()[kind]
    : brwsTmpls[kind === 'bkgd' ? 'scene' : kind]);
  const perPage = d.cols * d.rows;
  mkImg(d.book, d.x, d.y, 516, 372);
  const num = document.createElement('div');
  num.className = 'brwsNum'; brwsEl.appendChild(num); place(num, d.x + d.num[0], d.y + d.num[1], 64, 29); // REP_RECT at gob pos
  let page = 0, sel = -1;
  const cells = [];
  for (let c = 0; c < d.cols; c++) for (let r = 0; r < d.rows; r++) { // sound lists fill column-major
    const b = document.createElement('button');
    b.className = 'stBtn brwsCell';
    const fim = document.createElement('img'); fim.src = `${B}textures/${d.fr}.png`; fim.draggable = false;
    b.appendChild(fim); brwsEl.appendChild(b);
    place(b, d.x + d.x0 + c * d.sx, d.y + d.y0 + r * d.sy, d.fw, d.fh);
    const cv = document.createElement('canvas');
    cv.className = 'brwsCv'; brwsEl.appendChild(cv);
    place(cv, d.x + d.x0 + c * d.sx + 4, d.y + d.y0 + r * d.sy + 4, d.fw - 8, d.fh - 8);
    cells.push({ b, fim, cv });
  }
  const nPages = () => Math.max(1, Math.ceil(items.length / perPage));
  mkBtn('fwd', 'fwdc', d.x + d.fwd[0], d.y + d.fwd[1], 59, 46, () => { page = Math.min(nPages() - 1, page + 1); render(); });
  mkBtn('bback', 'bbackc', d.x + d.back[0], d.y + d.back[1], 59, 46, () => { page = Math.max(0, page - 1); render(); });
  if (d.ok) mkBtn('okay', 'okayc', d.x + d.ok[0], d.y + d.ok[1], 50, 48, () => {
    if (importItems) { // import pick -> into the browser's list
      if (sel < 0) return;
      addUserSnd(kind, items[sel]); showBrowser(kind); return;
    }
    setSndTag(kind, sel >= 0 ? items[sel] : null); // BRWN::FCmdOk -> MVU::SetTagTool
    closeBrowser();                              // (empty pick clears the tool sound)
  });
  mkBtn('cancel', 'cancelc', d.x + d.can[0], d.y + d.can[1], 50, 48, () => importItems ? showBrowser(kind) : closeBrowser());
  if (d.rec && !importItems) mkBtn('mike', 'mikes', d.x + d.rec[0], d.y + d.rec[1], 50, 48, () => showRecorder(kind));
  if (d.imp && !importItems) mkBtn('sndport', 'sndports', d.x + d.imp[0], d.y + d.imp[1], 50, 48, () => importSndFiles(kind));
  function render() {
    num.textContent = `${page + 1} / ${nPages()}`;
    for (let i = 0; i < cells.length; i++) {
      const it = items[page * perPage + i], { b, fim, cv } = cells[i];
      cv.width = d.fw - 8; cv.height = d.fh - 8;
      cv.style.display = b.style.display = it ? '' : 'none';
      if (!it) continue;
      const x = cv.getContext('2d');
      if (it.mbmp) x.drawImage(mbmpCanvas(it.mbmp, cv.width, cv.height), 0, 0);
      else if (it.s) { // scene cell: text label (index, name, length)
        x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 14px "Comic Sans MS", cursive, sans-serif';
        x.fillText(`${it.i + 1}`, cv.width / 2, 16);
        x.font = '11px "Comic Sans MS", cursive, sans-serif';
        x.fillText((it.s.name || 'scene').slice(0, 18), cv.width / 2, 40);
        x.fillText(`${it.s.nfrmLast - it.s.nfrmFirst + 1} frames`, cv.width / 2, 58);
      } else { // sound name cell
        x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '10px "Comic Sans MS", cursive, sans-serif';
        x.fillText(it.name, cv.width / 2, cv.height / 2);
      }
      b.onmousedown = () => { fim.src = `${B}textures/${d.fr}h.png`; };
      b.onmouseup = b.onmouseleave = () => { fim.src = page * perPage + i === sel ? `${B}textures/${d.fr}h.png` : `${B}textures/${d.fr}.png`; };
      b.onclick = d.ok
        ? () => { sel = page * perPage + i; for (const o of cells) o.fim.src = `${B}textures/${d.fr}.png`; fim.src = `${B}textures/${d.fr}h.png`; previewItem(it); }
        : () => {
            if (kind === 'bkgd') editBkgd(it.cno, it.name); // FSetBkgdCore: fill empty scene else insert new
            else if (kind === 'cam') editCam(it.icam); // kidBrwsCamera -> ChngCamera event
            else if (kind === 'actor' || kind === 'prop') { // pick template -> click stage to place
              pendPlace = { cno: it.cno, name: it.name };
              $('view').style.cursor = 'crosshair';
            } else if (kind === 'scene') { setPlaying(false); player.loadScene(it.i); }
            closeBrowser(); draw();
          };
    }
  }
  render();
}
// --- scene sorter easel (easels.cht kidSSorter*; scnsort.cpp SCRT) -----------
// e3par panel at (20,65) 600x350; 6 frame cells 185x126 at (10+c*193,12+r*141);
// thumb rect (8,12)-(151,92); transition buttons at (156,11/33/55/77). Edits a
// working scene list (the CMVI); OK commits reorder/nuke/trans/appends, Esc or
// cancel discards. Sorter changes are not undoable (MVIE::ClearUndo on OK).
function showSceneSorter() {
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
  for (const [im, t] of [[hand, 'hand'], [nuke, 'nuke']]) {
    im.style.cursor = 'pointer';
    im.onmousedown = () => { tool = t; syncTools(); };
  }
  const syncTools = () => {
    hand.src = `${B}textures/e3hand${tool === 'hand' ? 'c' : ''}.png`;
    nuke.src = `${B}textures/e3rmsn${tool === 'nuke' ? 'c' : ''}.png`;
  };
  const sup = mkImg('e3up', PX + 580, PY + 2, 17, 19);       // kidSSorterScrollUp (hidden when disabled)
  const sdn = mkImg('e3down', PX + 580, PY + 273, 17, 19);   // kidSSorterScrollDn
  for (const [el, d, dn] of [[sup, -1, 'e3upc'], [sdn, 1, 'e3downc']]) {
    let tm = null;
    const step = () => { top = Math.max(0, Math.min(items.length - 1, top + d * 3)); sync(); }; // FCmdScroll ±nxFrame
    el.style.cursor = 'pointer';
    el.onmousedown = () => {
      el.src = `${B}textures/${dn}.png`; step();
      let del = 250;
      const go = () => { step(); del = Math.max(80, del - 20); tm = setTimeout(go, del); };
      tm = setTimeout(go, del);
    };
    el.onmouseup = el.onmouseleave = () => { el.src = `${B}textures/${el === sup ? 'e3up' : 'e3down'}.png`; clearTimeout(tm); };
  }

  function sync() { // _FResetThumbnails + _EnableScroll
    for (let i = 0; i < 6; i++) {
      const it = items[top + i], c = cells[i];
      c.fim.style.display = c.cv.style.display = it ? '' : 'none';
      for (const t of c.tbs) t.style.display = it ? '' : 'none';
      if (!it) continue;
      c.fim.src = `${B}textures/${top + i === cur ? 'e3frms' : 'e3frm'}.png`;
      c.cv.getContext('2d').drawImage(thumbCv(it.scen), 0, 0);
      c.tbs.forEach((t, j) => { t.src = `${B}textures/e3trn${j + 1}${it.trans === T4[j] ? 's' : ''}.png`; });
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
    const g = document.createElement('div'); // idSelFrame — dragged ghost of the selected cell
    g.style.cssText = 'position:absolute;pointer-events:none;';
    const gf = document.createElement('img');
    gf.src = `${B}textures/e3frms.png`; gf.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
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
    selChid = -1; setTbSel(-1); setTbFocus(-1); selTbSels.clear();
    histClear(); // MVIE::FSetCmvi's caller does ClearUndo — sorter changes aren't undoable
    docMark();
    setPlaying(false); player.loadScene(Math.min(Math.max(0, cur), mv.scenes.length - 1));
    dismiss(); draw();
  }

  syncTools(); sync();
}

// record easel (easels.cht kidRecord*): e5par + length thermometer + name + mike/play/can/okay
function showRecorder(kind) {
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('e5par', 202, 154, 236, 172);
  const therm = document.createElement('div'); // kidRecordSoundLength: fill (22,30)-(214,51) -> elapsed/10s
  therm.className = 'recTherm'; brwsEl.appendChild(therm); place(therm, 224, 184, 193, 22);
  const fill = document.createElement('div'); fill.className = 'recThermFill'; therm.appendChild(fill);
  const inp = document.createElement('input'); // kidRecordSoundName (123,75)-(232,95)
  inp.className = 'spltInp'; inp.maxLength = 40; inp.placeholder = 'sound name';
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
    stopP = new Promise((res) => {
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: mime }), bytes = await blob.arrayBuffer();
        take = { buf: await decodeAudioBytes(bytes), bytes, mime };
        fill.style.width = `${Math.min(100, ((take.buf?.duration || 0) / 10) * 100)}%`;
        stopTracks(); res();
      };
    });
    t0 = performance.now(); rec.start(); tick();
    setTimeout(() => { if (rec?.state === 'recording') stopRec(); }, 10000); // kdtsMaxRecord
  };
  const stopRec = () => { if (rec?.state === 'recording') rec.stop(); rec = null; };
  const mikeBtn = mkBtn('e5mike', 'e5mikes', 213, 269, 50, 48, async () => {
    if (rec?.state === 'recording') { stopRec(); mikeBtn.querySelector('img').src = `${B}textures/e5mike.png`; }
    else { sounds.ensure(); await startRec(); }
  });
  mikeBtn.onmouseup = mikeBtn.onmouseleave = () => {
    mikeBtn.querySelector('img').src = `${B}textures/e5${rec?.state === 'recording' ? 'mikes' : 'mike'}.png`; // hold selected while recording
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
function showListenerEasel(a) {
  const s = player.scene;
  if (!a && !s) return;
  const evs0 = a ? structuredClone(a.data.events) : structuredClone(s.frameEvents);
  const restore = () => {
    if (a) { a.data.events = a.events = structuredClone(evs0); a.nfrmCur = null; }
    else { s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(evs0)); }
    player.gotoFrame(player.frame); draw();
  };
  const { place, mkImg, mkBtn } = brwsShell();
  brwsCleanup = restore; // Esc/cancel closes via closeBrowser -> restores the snapshot
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
    nim.src = `${B}textures/e4audit.png`; nim.className = 'stImg'; nim.draggable = false;
    nm.appendChild(nim);
    const nmt = document.createElement('span');
    nmt.className = 'lisNameTxt'; nmt.textContent = sndName(q.tags);
    nm.appendChild(nmt);
    nm.onmousedown = () => { nim.src = `${B}textures/e4auditc.png`; };
    nm.onmouseup = nm.onmouseleave = () => { nim.src = `${B}textures/e4audit.png`; };
    nm.onclick = audition;
    colEls.push(nm);
    const sld = document.createElement('div'); // volume track (l,20)-(r,138), thumb travels y 20..128
    sld.className = 'stSld'; brwsEl.appendChild(sld); place(sld, X + sl, Y + 20, sr - sl, 118);
    const th = document.createElement('img'); // e4vol1 thumb, MoveAbsGob(kxpSliderThumb=5, yPos)
    th.src = `${B}textures/e4vol1.png`; th.className = 'stImg stThumb'; th.draggable = false;
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
  mkBtn('e4okay', 'e4okayc', X + (a ? 199 : 330), Y + 183, 50, 48, () => { brwsCleanup = null; closeBrowser(); });
}
// words create dialog (browser.cht kidBrwsTextCreate): book9 + story/scroll choices
function showWords() {
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('book9', 132, 48, 376, 209);
  mkBtn('e6stor', 'e6stors', 174, 97, 136, 78, () => { closeBrowser(); insTbox(true); });   // cidCreateTbox fFalse -> story box
  mkBtn('e6scr1', 'e6scr1s', 329, 96, 136, 78, () => { closeBrowser(); insTbox(false); }); // cidCreateTbox fTrue -> credits box
  mkBtn('cancel', 'cancelc', 430, 205, 50, 48, closeBrowser);  // preg (0,48): bottom-left
}
// spletter easel (easels.cht kidSplt*, esl.cpp ESLT): e1par + APE preview + text
// input + font/shape/texture popups + transmogrify/rotate. New TDTs place via
// pendPlace (StartPlaceActor); editing an existing TDT swaps its template.
const SPLT_POP = { // popdn.cht + pos3.chh — coords relative to e1par at (61,57)
  font: { x: 97, y: 189, w: 144, h: 132, fh: 23, bd: 3, page: 5, ay: 115 },
  shape: { x: 149, y: 129, w: 46, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
  mtrl: { x: 197, y: 129, w: 78, h: 194, fh: 44, bd: 7, page: 4, ay: 176 },
};
function showSpletter(editA) {
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
  brwsCleanup = () => pr.dispose();
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
      const fim = document.createElement('img'); fim.src = `${B}textures/d1frm${sel ? 'h' : ''}.png`; fim.draggable = false;
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
      b.onmousedown = () => { fim.src = `${B}textures/d1frmh.png`; };
      b.onmouseup = b.onmouseleave = () => { fim.src = `${B}textures/d1frm${sel ? 'h' : ''}.png`; };
      b.onclick = () => popPick(it);
      pop.cells.push(b);
    });
    const last = Math.ceil(items.length / d.page) - 1;
    for (const [bmp, off, pg] of [['d1up', 0, 0], ['d1dn', d.w / 2, last]]) { // up = first page, dn = last
      const b = document.createElement('button'); b.className = 'stBtn ccpCell';
      const im = document.createElement('img'); im.src = `${B}textures/${bmp}.png`; im.draggable = false;
      b.appendChild(im); brwsEl.appendChild(b); place(b, d.x + off, d.y + d.ay, d.w / 2, d.h - d.ay);
      b.onmousedown = () => { im.src = `${B}textures/${bmp}s.png`; };
      b.onmouseup = b.onmouseleave = () => { im.src = `${B}textures/${bmp}.png`; };
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
      pendPlace = { tdt: { text, tdts: st.tdts, tagTdf: st.tagTdf, tagMtrl: st.mtrlDirty ? st.tagMtrl : null } };
      $('view').style.cursor = 'crosshair';
      closeBrowser(); draw();
    }
  });
  rebuild();
  setTimeout(() => { inp.focus(); inp.select(); }, 0); // SNE starts with all text selected
}
// action browser (browser.cht kidBrwsAction + pos3.chh): book5 at (62,100), 2x10 ACTN
// name grid, live cel-cycling preview pane w/ cel fwd/back, OK applies an Actn event
function showActionBrowser() {
  if (!player) return;
  const a = selActor() || [...player.actors.values()].find((x) => x.onStage);
  if (!a) return; // original requires a selected actor
  selChid = chidOf(a); syncRollCall();
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
  brwsCleanup = () => { clearInterval(tick); pr.dispose(); };
  const perPage = 20, cells = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 10; r++) { // frame5 name cells at rel (15+143c, 32+28r)
    const b = document.createElement('button');
    b.className = 'stBtn brwsCell';
    const fim = document.createElement('img'); fim.src = `${B}textures/frame5.png`; fim.draggable = false;
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
    num.textContent = `${page + 1} / ${nPages()}`;
    for (let i = 0; i < cells.length; i++) {
      const it = acts[page * perPage + i], { b, fim, cv } = cells[i];
      cv.width = 130; cv.height = 17;
      cv.style.display = b.style.display = it ? '' : 'none';
      if (!it) continue;
      const x = cv.getContext('2d');
      x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '10px "Comic Sans MS", cursive, sans-serif';
      x.fillText(it.name, cv.width / 2, cv.height / 2);
      b.onmousedown = () => { fim.src = `${B}textures/frame5h.png`; };
      b.onmouseup = b.onmouseleave = () => { fim.src = sel === page * perPage + i ? `${B}textures/frame5h.png` : `${B}textures/frame5.png`; };
      b.onclick = () => { sel = page * perPage + i; for (const o of cells) o.fim.src = `${B}textures/frame5.png`; fim.src = `${B}textures/frame5h.png`; setAnid(it.anid); };
    }
  }
  render();
  setAnid(anid);
}
// costume easel (easels.cht kidCost*, ESLA): e2par bg at (102,100) 436x347;
// preview (112,109)-(528,339); name edit (110,415); buttons costumes/accessories/
// rotate/cancel/ok at y=356. Clicking a body part cycles its CMTL costumes;
// accessories mode cycles the part's accessory set (APE::_FIncCmtl).
function showCostumeEasel(a) {
  if (!player || !a || !a.onStage) return;
  const tmpl = a.tmpl;
  if (tmpl.isTdt || !tmpl.cbset) return; // TDTs use the spletter easel; props without part sets do nothing
  selChid = chidOf(a); syncRollCall(); draw();
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
  brwsCleanup = () => pr.dispose();
  const modeBtn = (up, dn, x, f) => { // costumes/accessories are radio-selected (kstSelected face)
    const b = mkBtn(up, dn, x, 356, 50, 48, () => { fAcc = f; syncModes(); });
    b._mode = () => fAcc === f;
    b._sync2 = () => { b.firstElementChild.src = `${B}textures/${b._mode() ? dn : up}.png`; };
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
// --- talent book (BIO_CREATEBOOK / biopage.cht + sharecd.cht) ---------------
// corkboard book (biopage.pbm) + per-page portrait collage (biopgN.png adopted
// cells on kgobBioActors) + spiral-ring overlay (biopanel.pbm). The original's
// pages were "found" collectibles gated behind the building hub (fBio1/fBio2)
// with a table-of-contents/instructions page 0 — with no hub to find them in,
// all 40 actor pages are browsable and the instructions page is dropped.
const NUM_BIOPAGES = 41; // biopage.chh — bits 1..40 (bit 0 was the TOC)
// bit -> actor index in .3th order (Henry, S'kelly and the three mascots have
// no page; Ramu/Patrick swap order and Maribella sits with the late pages —
// matched visually: each biopgN.png shows that actor's 4 costume portraits)
const BIO_ACTOR = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18, 19, 20, 21, 22, 24, 25, 26, 27, 29, 28, 30, 31, 23, 33, 34, 35, 36, 37, 38, 39, 40, 41];
// page bitmap bounds (left,top,w,h) — deviations from the common 42,60 box
const BIO_POS = { 3: [43, 60, 548, 359] };
const BIO_BLURB = { // short per-page line keyed by bit — name always shown
  4: 'is a mummy.', 12: 'is a robot.', 15: 'is a baby.', 20: 'is the bearded fellow.',
  36: 'is a vampire.', 37: 'is a vampire.', 38: 'is the golden robot.',
  39: 'is the purple elephant.', 40: 'is the masked bandit.',
};
let bioState = null;
try { bioState = JSON.parse(localStorage.getItem('mmsbio')); } catch { /* bad record */ }
if (!bioState) bioState = { page: 1 };
if (!(bioState.page >= 1)) bioState.page = 1; // stale records may point at the removed TOC
const bioSave = () => { try { localStorage.setItem('mmsbio', JSON.stringify(bioState)); } catch { /* quota */ } };
function showBio(bit = bioState.page) {
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('biopage', 0, 0, 640, 480);
  const pageIm = document.createElement('img'); // page collage over the backdrop
  pageIm.className = 'stImg'; pageIm.draggable = false; brwsEl.appendChild(pageIm);
  mkImg('biopnl', 0, 0, 640, 480); // ring panel goes on top
  const txt = document.createElement('div');
  txt.className = 'bioTxt'; brwsEl.appendChild(txt); place(txt, 215, 58, 207, 349); // kxpBioPage*
  const num = document.createElement('div');
  num.className = 'brwsNum bioNum'; brwsEl.appendChild(num); place(num, 282, 424, 62, 27); // kxpBioPageNum*
  const render = () => {
    bioState.page = bit; bioSave();
    const [l, t, w, h] = BIO_POS[bit] ?? [42, 60, 549, 359];
    pageIm.src = `${B}textures/biopg${bit + 1}.png`; place(pageIm, l, t, w, h);
    const ai = BIO_ACTOR[bit];
    const name = ai == null ? '' : (brwsTmpls.actor[ai]?.name || 'actor');
    txt.innerHTML = `<b>${name}</b>${BIO_BLURB[bit] ? '<br><br>' + name + ' ' + BIO_BLURB[bit] : ''}`;
    num.textContent = `Page ${bit}`;
  };
  mkBtn('bioback', 'biobackc', 229, 410, 69, 50, () => { // kxpBioBack/kypBioBack
    if (bit > 1) { bit--; render(); }
  });
  mkBtn('biofwd', 'biofwdc', 339, 410, 69, 50, () => { // kxpBioFwd/kypBioFwd
    if (bit < NUM_BIOPAGES - 1) { bit++; render(); }
  });
  mkBtn('biocan', 'biocanc', 511, 415, 48, 47, closeBrowser); // kxpBioCancel
  render();
}
// --- callout tips (the original's HBAL: kgobCalloutBalloonN — a cobllnN.bmp
// skin tiled by GORT with the red arrow baked in; reg point = the arrow tip.
// Dwell on a control to get its tip (suppressed while playing, like the
// original pushing kpridToolTipDelay to 0x0FFFFFFF during FCmdPlay)) ---------
const COBLN = { // bmp w,h, arrow-tip reg (x,y), borders LTRB, horz+vert tile rows
  0: [167, 122,  83,  61,  5,  4,  5,  4, [8, 151, 8, 0,  0,  0, 8], [8, 106, 8, 0,  0,  0, 8]],
  1: [190, 143,   1,   1, 29, 28,  8,  8, [36, 146, 8, 0,  0,  0, 8], [32, 103, 8, 0,  0,  0, 8]],
  2: [168, 156,  83,   1,  4, 41,  8,  8, [8,  58,  8, 35, 60, 8, 8], [42, 108, 8, 0,  0,  0, 8]],
  3: [191, 145, 189,   2,  4, 30, 32,  8, [8, 147, 8, 0,  0, 0, 36], [34, 103, 4, 0,  0,  0, 8]],
  4: [204, 122, 201,  65,  4,  3, 46,  8, [8, 148, 8, 0,  0, 0, 48], [8,  40, 4, 34, 40, 4, 8]],
  5: [192, 146, 189, 143,  4,  3, 32, 32, [8, 148, 8, 0,  0, 0, 36], [8, 102, 8, 0,  0, 0, 36]],
  6: [168, 157,  83, 155,  4,  3,  8, 38, [8,  60, 8, 33, 60, 8, 8], [8, 105, 8, 0, 0, 0, 44]],
  7: [191, 147,   0, 147, 30,  3,  8, 28, [34, 149, 8, 0, 0, 0, 8],  [8, 101, 8, 0, 0, 0, 38]],
  8: [203, 122,   0,  66, 32,  3,  8,  8, [42, 150, 8, 0, 0, 0, 8],  [8,  40, 4, 34, 32, 4, 8]],
}; // arrows: 1/2/3 = up-left/mid/right, 4 = right, 5/6/7 = down-right/mid/left, 8 = left
const coblnImgs = {};
for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) { // skins live under public/textures
  const im = new Image(); im.src = B + 'textures/coblln' + n + '.png'; coblnImgs[n] = im;
}
const coblnReady = Promise.all(Object.values(coblnImgs).map((im) =>
  im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
function gortSegs(t, D) { // GORT::_ComputeFlexZp + Draw — [srcOff,srcLen,dstOff,dstLen][]
  const [l, lf, li, m, rf, ri, r] = t;
  let rfD = Math.max(0, D - l - m - r);
  let lfD = lf + rf ? Math.floor(rfD * lf / (lf + rf)) : 0;
  if (lfD > 0) { const q = Math.floor(lfD / lf); lfD = q * lf + Math.min(lf, Math.ceil(Math.max(0, lfD - q * lf) / li) * li); }
  rfD = Math.max(0, rfD - lfD);
  if (rfD > 0) { const q = Math.floor(rfD / rf); rfD = q * rf + Math.min(rf, Math.ceil(Math.max(0, rfD - q * rf) / ri) * ri); }
  const segs = [];
  let d = 0, s = 0;
  const seg = (sl, dl) => { segs.push([s, sl, d, dl]); d += dl; s += sl; };
  seg(l, l);
  for (let rem = lfD; rem > 0; rem -= lf) { const w = Math.min(lf, rem); segs.push([s, w, d, w]); d += w; }
  s += lf; seg(m, m);
  for (let rem = rfD; rem > 0; rem -= rf) { const w = Math.min(rf, rem); segs.push([s, w, d, w]); d += w; }
  s += rf; seg(r, r);
  return segs;
}
function gortMap(t, D, v) { // map a source coord through the flexed axis to dest
  for (const [s, sl, d] of gortSegs(t, D)) if (v < s + sl) return d + v - s;
  return D;
}
const coMeas = document.createElement('div');
coMeas.className = 'coTxt'; coMeas.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;max-width:45cqw;';
function callout(target, parts, sticky) { // -> balloon el or null; parts: [text, hot?][]
  const studioEl = $('studio'), sr = studioEl.getBoundingClientRect(), sc = sr.width / 640;
  const tr = target.getBoundingClientRect();
  const tx = (tr.left + tr.width / 2 - sr.left) / sc, ty = (tr.top + tr.height / 2 - sr.top) / sc; // logical target pt
  // pick the arrow direction with the best room, preferring the natural side
  const up = ty < 220, right = tx < 420;
  const pref = up ? (right ? [2, 1, 3, 8, 4, 7, 6, 5, 0] : [2, 3, 1, 4, 8, 5, 6, 7, 0])
                  : (right ? [6, 7, 5, 8, 4, 1, 2, 3, 0] : [6, 5, 7, 4, 8, 3, 2, 1, 0]);
  // measure the text doc at logical size
  const mkRuns = (dst) => { for (const [t, cls] of parts) { const s = document.createElement('span'); if (cls) s.className = cls === 1 ? 'hot' : cls; s.textContent = t; dst.appendChild(s); } };
  coMeas.innerHTML = ''; mkRuns(coMeas);
  studioEl.appendChild(coMeas);
  const tw = coMeas.offsetWidth / sc + 10, th = coMeas.offsetHeight / sc + 4; // natural doc size
  coMeas.remove();
  for (const dir of pref) {
    const [bw, bh, rx, ry, bl, bt, br, bb, thz, tvz] = COBLN[dir];
    // text doc + the AGPA-embedded cancel button (cancbtn1, 16x16) in a right column
    const W = Math.max(bl + br + tw + 22, 76), H = Math.max(bb + bt + Math.max(th, 20), 60);
    const gx = tx - gortMap(thz, W, rx), gy = ty - gortMap(tvz, H, ry);   // arrow tip at target
    if (gx < 2 || gy < 2 || gx + W > 638 || gy + H > 478) continue;
    const img = coblnImgs[dir];
    if (!img.complete || !img.naturalWidth) continue;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * sc * 2); cv.height = Math.round(H * sc * 2); // 2x for hi-dpi
    const x2 = cv.getContext('2d'); x2.scale(2, 2); x2.imageSmoothingEnabled = true;
    const scx = cv.width / 2 / W, scy = cv.height / 2 / H;
    for (const [sy, sh, dy, dh] of gortSegs(tvz, H)) for (const [sx, sw, dx, dw] of gortSegs(thz, W))
      x2.drawImage(img, sx, sy, sw, sh, dx * scx, dy * scy, dw * scx, dh * scy);
    const gob = document.createElement('div');
    gob.className = 'coBalloon'; if (sticky) gob.classList.add('sticky');
    gob.style.left = (gx / 6.4) + '%'; gob.style.top = (gy / 4.8) + '%';
    gob.style.width = (W / 6.4) + '%'; gob.style.height = (H / 4.8) + '%';
    gob.appendChild(cv);
    const td = document.createElement('div'); // the TXHG text inside the content rc
    td.className = 'coTxt';
    td.style.left = (bl / W * 100) + '%'; td.style.top = (bt / H * 100) + '%';
    td.style.width = ((W - bl - br - 22) / W * 100) + '%';
    mkRuns(td);
    gob.appendChild(td);
    const xb = document.createElement('img'); // kgobCancelButton — cancbtn1.bmp, 16x16, bottom-right
    xb.src = B + 'textures/cancbtn1.png'; xb.className = 'coX'; xb.draggable = false;
    xb.style.left = ((W - br - 18) / W * 100) + '%'; xb.style.top = ((H - bb - 18) / H * 100) + '%';
    xb.style.width = (16 / W * 100) + '%';
    xb.onpointerdown = (e) => { e.stopPropagation(); xb.src = B + 'textures/cancbtn3.png'; tipDismiss(); }; // krepMouseDnOn face, then gone
    gob.appendChild(xb);
    studioEl.appendChild(gob);
    return gob;
  }
  return null;
}
let tipEl = null, tipTimer = 0, tipSrc = null;
const tipDismiss = () => { clearTimeout(tipTimer); tipTimer = 0; tipEl?.remove(); tipEl = null; tipSrc = null; };
function tipShow(el) { // HBAL::PhbalNew — the control's topic balloon, arrow at the control
  tipDismiss();
  const tip = el.dataset?.tip;
  if (!tip) return;
  tipSrc = el;
  coblnReady.then(() => { if (tipSrc === el && !playing)
    tipEl = callout(el, typeof tip === 'string' // 'Title\nBody' -> title run + body
      ? tip.split('\n').map((l, i) => [l + '\n', i ? '' : 't']) : tip, false); });
}
document.addEventListener('pointermove', (e) => {
  if (tipEl?.classList.contains('sticky')) return; // guide stays until click/X
  const el = e.target?.closest?.('[data-tip]');
  if (el === tipSrc || (tipEl && e.target?.closest?.('.coBalloon') === tipEl)) return;
  clearTimeout(tipTimer); tipTimer = 0;
  tipEl?.remove(); tipEl = null;
  tipSrc = el;
  if (el && !playing && !e.buttons)
    tipTimer = setTimeout(() => { if (tipSrc === el && !playing) tipShow(el); }, 1200); // kdtimToolTipDelay ~1.5s
}, true);
document.addEventListener('pointerdown', tipDismiss, true);
function guideTip() { // first-boot guide — the original's CO tip for the scenes cover
  const b = [...document.querySelectorAll('#studio .stBtn')]
    .find((x) => x.firstElementChild?.src.includes('/1back.'));
  if (!b) return; // guidhelp.cht CO__To_see_the_scenes, verbatim text + hot run
  coblnReady.then(() => { if (tipEl || player?.movie.scenes.length) return;
    tipEl = callout(b, [['To see the scenes you can choose from, click '], ['Scene Choices', 1], ['.']], true);
    if (tipEl) tipSrc = b;
    setTimeout(() => { if (tipEl?.classList.contains('sticky')) tipDismiss(); }, 15000); });
}

// --- theatre mode (?3mm=...&mode=theatre) ------------------------------------
// The building's cinema (bldghd.cht kgobTheatre1 + theatre.cht kgobMovie):
// theatre1.pbm room (the1dark.pbm while the movie plays), the MVU fills the
// screen rect (48,85)-(592,391), projector-lens rewind/play sit at (293/318,7)
// and a volume slider runs down the left wall (9,110 + 62px travel). The editor
// chrome stays mounted but is covered by the opaque room.
let modeSync = null;
const mkThBtn = (up, dn, act) => {
  const b = document.createElement('button');
  b.className = 'stBtn';
  const im = document.createElement('img');
  const face = () => `${B}textures/${typeof up === 'function' ? up() : up}.png`;
  im.src = face(); im.draggable = false;
  b.appendChild(im);
  b.onmousedown = () => { if (dn) im.src = `${B}textures/${dn}.png`; };
  b.onmouseup = b.onmouseleave = () => { im.src = face(); };
  b.onclick = act;
  return { b, im };
};
const thRewind = () => { // kgobRewindButton: rewind then play
  if (!player?.movie.scenes.length) return;
  player.loadScene(0); player.gotoFrame(player.scene.nfrmFirst); setPlaying(true);
};
const mkVol = () => { // kgobTheaterVolume slidepath + thumb
  const vpath = document.createElement('div');
  vpath.className = 'thVol';
  const vth = document.createElement('img');
  vth.src = `${B}textures/thvol.png`; vth.className = 'stImg thVolT'; vth.draggable = false;
  vpath.appendChild(vth);
  const setVol = (y) => { // _kdySlider: 62 units of travel on the 74-high path
    sounds.setVolume(1 - Math.max(0, Math.min(62, y)) / 62);
    const f = 1 - sounds.volume;
    vth.style.top = f * 100 + '%'; vth.style.transform = `translateY(${-f * 100}%)`;
    localStorage.setItem('vol3dmm', String(sounds.volume));
  };
  setVol((1 - sounds.volume) * 62);
  vpath.onpointerdown = (e) => {
    vpath.setPointerCapture(e.pointerId);
    const r = vpath.getBoundingClientRect();
    const mv = (ev) => setVol((ev.clientY - r.top) / r.height * 74);
    mv(e);
    vpath.onpointermove = mv;
    vpath.onpointerup = () => { vpath.onpointermove = vpath.onpointerup = null; };
  };
  return vpath;
};
function enterTheatre() {
  const studio = $('studio'), view = $('view');
  const th = document.createElement('div');
  th.id = 'theatre';
  const place = (el, x, y, w, h) => {
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  };
  const bg = document.createElement('img');
  bg.className = 'stImg'; bg.src = `${B}textures/theatre1.png`; bg.draggable = false;
  th.appendChild(bg); place(bg, 0, 0, 640, 480);
  const scr = document.createElement('div'); // kgobMovie workspace
  scr.className = 'thScr'; th.appendChild(scr); place(scr, 48, 85, 544, 306);
  scr.appendChild(view); // the stage canvas becomes the movie screen
  view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const veil = document.createElement('div'); // click filter — no editing in the theatre
  veil.className = 'thVeil'; scr.appendChild(veil);
  const playB = mkThBtn(() => playing ? 'thstop' : 'thplay', null, () => setPlaying(!playing)); // kgobPlayButton: kst1/kst2 are play/stop faces, not press states
  th.appendChild(playB.b); place(playB.b, 318, 7, 25, 51);
  const rewB = mkThBtn('threw', 'threwc', thRewind);
  th.appendChild(rewB.b); place(rewB.b, 293, 7, 24, 51);
  const vpath = mkVol(); th.appendChild(vpath); place(vpath, 9, 110, 12, 74);
  studio.appendChild(th);
  modeSync = () => { // lights dim while the movie rolls (kst3 -> the1dark)
    bg.src = `${B}textures/${playing ? 'the1dark' : 'theatre1'}.png`;
    playB.im.src = `${B}textures/${playing ? 'thstop' : 'thplay'}.png`;
    vpath.hidden = !playing;
  };
  modeSync();
}
function enterEmbed() { // bare movie screen — controls float above the corners
  const studio = $('studio'), view = $('view');
  const em = document.createElement('div');
  em.id = 'embed';
  const scr = document.createElement('div');
  scr.className = 'emScr'; em.appendChild(scr);
  scr.appendChild(view);
  view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const veil = document.createElement('div'); // click filter — no editing
  veil.className = 'thVeil'; scr.appendChild(veil);
  const vpath = mkVol(); vpath.classList.add('emVol'); em.appendChild(vpath);
  const rewB = mkThBtn('threw', 'threwc', thRewind); // rewind left, play right — same order as the projector lens
  rewB.b.classList.add('emRew'); em.appendChild(rewB.b);
  const playB = mkThBtn(() => playing ? 'thstop' : 'thplay', null, () => setPlaying(!playing));
  playB.b.classList.add('emPlay'); em.appendChild(playB.b);
  studio.appendChild(em);
  modeSync = () => { playB.im.src = `${B}textures/${playing ? 'thstop' : 'thplay'}.png`; };
  modeSync();
}
document.addEventListener('keydown', (e) => { // Space = play/pause in theatre/embed (editor owns Space for tbox typing)
  if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!document.getElementById('theatre') && !document.getElementById('embed')) return;
  if (!player?.movie?.scenes.length) return;
  e.preventDefault();
  setPlaying(!playing);
});

const qs = new URLSearchParams(location.search);
if (qs.get('opts')) { for (const k of qs.get('opts').split(',')) if (typeof opts[k] === 'boolean') { opts[k] = true; if (optCbs[k]) { optCbs[k].checked = true; if (optCbs[k]._sub) optCbs[k]._sub.hidden = false; } } renderer.setOpts(opts); sounds.muted = opts.mute; }
if (qs.has('menu')) $('optsMenu').hidden = false;
// startup mirrors the original: GetPortfolioDoc -> FLoadMovie(pfniUserDoc) — the
// autosaved working doc opens straight into the studio; no doc -> FLoadMovie()
// blank doc. ?3mm=url loads a remote movie, replacing the working doc on success;
// on failure we fall back to the normal boot and show the error after the splash.
let booted = false, bootErr = null;
const remoteMovie = qs.get('3mm');
if (remoteMovie) {
  bootErr = await openUrl(remoteMovie); // a loaded remote movie becomes the working doc
  booted = !bootErr;
}
if (!booted) {
  const doc = await docDB.get(), pos = posGet(); // pos first — open()'s loadScene(0) overwrites it
  if (doc?.bytes?.length) {
    booted = open(doc.bytes, doc.name || 'autosave.3mm');
    if (booted) { // return to the last scene+frame seen — the fresher of pos (nav) vs doc rec (flush)
      const rec = (pos?.t ?? 0) >= (doc.t ?? 0) ? pos : doc; // scene+frame stay consistent per source
      if (rec?.scene >= 0) player.loadScene(Math.min(rec.scene, player.movie.scenes.length - 1));
      if (rec?.frame != null) player.gotoFrame(rec.frame);
      draw(); // repositioning happened after open()'s draw
    }
    if (!booted) console.warn('[autosave] cached movie failed to open — starting a new movie');
  }
}
await sleep(Math.max(0, 500 - (performance.now() - splashT0))); // don't flash the splash on a warm cache (kdtsSplashScreen, scaled way down)
if (!booted) newMovie(); // straight to the editor — no menu
bootDone();
if (bootErr) setTimeout(() => say(bootErr), 400); // toast after the splash fades
const bootMode = qs.get('mode');
if (bootMode === 'theatre' || bootMode === 'embed') { // cinema/embed views instead of the editor (works for the autosaved doc too, so the studio's theatre link can open it)
  (bootMode === 'theatre' ? enterTheatre : enterEmbed)();
  if (player.movie.scenes.length) setTimeout(() => setPlaying(true), 500); // showtime
} else if (!player.movie.scenes.length) setTimeout(guideTip, 450); // first-boot: point at Add Scene once the splash fades
loadUserSnds();
if (player && qs.get('scene')) { player.loadScene(+qs.get('scene')); draw(); }
if (player?.scene && qs.get('frame')) { player.gotoFrame(player.scene.nfrmFirst + (+qs.get('frame')) - 1); draw(); }
if (player && qs.has('play')) { sounds.ensure(); setPlaying(true); }
