import { SEVT } from '../../format/movie.ts';
import { selTbSels, setTbSelVal, tbSnap, selTbChid, player, focusTbChid, setSelTbChid, tbSel, setFocusTbChid, setTbSnap, setSelChid, setTbAttach, ed } from '../state.ts';
import { SPRM } from '../../format/content.ts';
import { draw } from '../loop.ts';
import { opExec } from '../undo.ts';
// --- text boxes (tbox.cpp TBXB/TBXG + studio.cpp FCmdCreateTbox/FCmdText*) ---
// Thumb data from content-files/tbox.3th: TCTH color iscr list, TBTH same plus
// iscr 0 (clear) first, TZTH font sizes, TYTH styles (grfontMask 3, grfont 0-3).
export const TBX_B = 5; // kdzpBorderTbox
export const TBX_MINW = 44, TBX_MINH = 22; // kdxpMinTbox(34)/kdypMinTbox(12) + 2*kdzpBorderTbox
export const TCTH_ISCR = [15, 30, 34, 51, 66, 69, 77, 82, 85, 94, 98, 102, 109, 133, 144];
export const TBTH_ISCR = [0, ...TCTH_ISCR];
export const TZTH_DYP = [9, 12, 14, 18, 24, 36, 48];
export const TYTH_STYLES = [{ mask: 3, grfont: 0 }, { mask: 3, grfont: 1 }, { mask: 3, grfont: 2 }, { mask: 3, grfont: 3 }];
export const TB_FONTS = ['Comic Sans MS', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Trebuchet MS', 'Impact'];
export const TBX_TOOL = { tboxSel: 1, tbPaintText: 1, tbFill: 1, tbFont: 1, tbSize: 1, tbStyle: 1, tbStory: 1, tbCredit: 1 };
export const TBX_PAINT_TOOL = { tbPaintText: 1, tbFont: 1, tbSize: 1, tbStyle: 1 };
export const selTbox = () => (selTbChid >= 0 && player?.scene ? player.scene.tboxes.get(selTbChid) : null);
export const focusTbox = () => (focusTbChid >= 0 && player?.scene ? player.scene.tboxes.get(focusTbChid) : null);
export const setTbSel = (chid) => { setSelTbChid(chid); }; // SCEN::SelectTbox — border chrome only
export function setTbFocus(chid) { // TBXG key focus — the box whose interior was last clicked
  if (focusTbChid === chid) return;
  if (focusTbChid >= 0) selTbSels.set(focusTbChid, tbSel);
  setFocusTbChid(chid);
  setTbSelVal(chid >= 0 ? (selTbSels.get(chid) || { anchor: 0, other: 0 }) : null);
}
export const tbChidOf = (tb) => { if (!player?.scene) return -1; for (const [c, x] of player.scene.tboxes) if (x === tb) return c; return -1; };
export const pickTbox = (px, py) => { // topmost visible tbox under a view-space point
  for (let i = player.tboxes.length - 1; i >= 0; i--) {
    const tb = player.tboxes[i];
    if (px >= tb.l && px < tb.r && py >= tb.t && py < tb.b) return tb;
  }
  return null;
};
// TBXB::_TbxtAnchor: which of the 8 resize zones (or move) a border-local pt is in
export function tbAnchor(xp, yp, w, h) {
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
export const inTboxBorder = (xp, yp, w, h) => xp < TBX_B || yp < TBX_B || xp > w - TBX_B || yp > h - TBX_B;
export const TB_ANCHOR_CURS = { up: 'tboxvert', down: 'tboxvert', left: 'tboxhor', right: 'tboxhor', upLeft: 'tboxfall', downRight: 'tboxfall', upRight: 'tboxrise', downLeft: 'tboxrise', move: 'repositi' };
export const TB_ANCHOR_HOT = { tboxvert: '8 7', tboxhor: '8 5', tboxfall: '7 7', tboxrise: '6 5', repositi: '8 1' };
// snapshot/restore for doc+rect ops (TUNT*/TUNC* undo objects in the original)
export const tbSnapOf = (tb) => ({ l: tb.l, t: tb.t, r: tb.r, b: tb.b, fStory: tb.fStory, rtxt: structuredClone(tb.rtxt) });
export const tbApply = (tb, d) => {
  Object.assign(tb, { l: d.l, t: d.t, r: d.r, b: d.b, fStory: d.fStory });
  tb.rtxt = structuredClone(d.rtxt); tb.rtxt._layout = null;
  player.gotoFrame(player.frame); draw();
};
export function tbOp(tb, mut) { // run mut() live, then commit snapshot undo
  const d0 = tbSnapOf(tb);
  mut();
  const d1 = tbSnapOf(tb);
  if (JSON.stringify(d0) === JSON.stringify(d1)) { tbApply(tb, d0); return; }
  tb.rtxt._layout = null; draw();
  opExec({ do: () => tbApply(tb, structuredClone(d1)), undo: () => tbApply(tb, structuredClone(d0)) });
}
// text-edit burst: successive keystrokes merge into one undo op
export function tbSnapStart(tb) {
  if (tbSnap && tbSnap.tb !== tb) tbSnapEnd();
  if (!tbSnap) setTbSnap({ tb, d0: tbSnapOf(tb) });
}
export function tbSnapEnd() {
  if (!tbSnap) return;
  const { tb, d0 } = tbSnap; setTbSnap(null);
  const d1 = tbSnapOf(tb);
  if (JSON.stringify(d0) === JSON.stringify(d1)) return;
  opExec({ do: () => tbApply(tb, structuredClone(d1)), undo: () => tbApply(tb, structuredClone(d0)) });
}
export function insTbox(fStory) { // STDIO::FCmdCreateTbox -> MVIE::FInsTbox (kxp/kyp/kdxp/kdypDefaultTbox)
  const s = player.scene, nfrm = player.frame;
  if (!s) return;
  const chid = Math.max(-1, ...s.actors.keys(), ...s.tboxes.keys()) + 1;
  const set = (on) => {
    if (on) {
      s.tboxes.set(chid, { cno: 0x8000 + chid, chid, nfrmFirst: nfrm, nfrmMax: 0x7fffffff, // klwMax
        l: 177, t: 78, r: 177 + 140, b: 78 + 100, fStory, _scv: 0,
        rtxt: { font: 'Comic Sans MS', dxpDef: 0, dypFont: 14, acrBack: -1, text: '', mpes: [], fonts: [] } });
      s.startEvents.push({ sevt: SEVT.AddTbox, nfrm, data: chid }); // FAddTboxCore: always the start list (frame-list AddTbox is invalid)
      setTbSel(chid); setSelChid(-1);
      setTbAttach({ tb: s.tboxes.get(chid), moved: false }); // AttachToMouse: box tracks the cursor until a click drops it
      if (ed.view) ed.view.cursor = 'none';
    } else {
      s.tboxes.delete(chid);
      for (const l of [s.startEvents, s.frameEvents])
        for (let i = l.length - 1; i >= 0; i--) if (l[i].sevt === SEVT.AddTbox && l[i].data === chid) l.splice(i, 1);
      if (selTbChid === chid) setTbSel(-1);
      if (focusTbChid === chid) setTbFocus(-1);
      selTbSels.delete(chid);
      setTbAttach(null); if (ed.view) ed.view.cursor = '';
    }
    player.gotoFrame(player.frame); draw();
  };
  opExec({ do: () => set(true), undo: () => set(false) });
  ed.openCover?.('words');           // EnableTboxTools: words row up + select tool armed
  ed.toolBtns?.['4ins']?.onclick();
}
export function remTbox(tb) { // TBXG toolActorNuke -> SCEN::FRemTbox
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
export function applyChp(tb, a, b, chg) {
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
export const applyChpOp = (tb, a, b, chg) => tbOp(tb, () => applyChp(tb, a, b, chg));
// TXRG::FApplyChp: applies to the box's own cp selection; a collapsed caret
// stores the change as _chpIns so it styles the next typed text
export function applyChpSel(tb, chg) {
  const chid = tbChidOf(tb);
  const s = chid === focusTbChid ? tbSel : selTbSels.get(chid);
  if (s && s.anchor !== s.other) {
    const [a, b] = s.anchor < s.other ? [s.anchor, s.other] : [s.other, s.anchor];
    applyChpOp(tb, a, b, chg);
  } else {
    tb._chpIns = { ...(tb._chpIns || {}), ...chg };
  }
}
export function tbInsText(tb, cp, str) { // TBXG text insert: shift mpes past cp
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
export function tbDelText(tb, a, b) { // delete [a,b): pull interior mpes back to a
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
