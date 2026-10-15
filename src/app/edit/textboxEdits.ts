import { SEVT } from '../../format/movie.ts';
import { appState } from '../appState.ts';
import { SPRM } from '../../format/content.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { editHistory } from '../editHistory.ts';
// --- text boxes (tbox.cpp TBXB/TBXG + studio.cpp FCmdCreateTbox/FCmdText*) ---
// Thumb data from content-files/tbox.3th: TCTH color iscr list, TBTH same plus
// iscr 0 (clear) first, TZTH font sizes, TYTH styles (grfontMask 3, grfont 0-3).
export class TextboxEdits {
  TEXTBOX_BORDER = 5; // kdzpBorderTbox
  TEXTBOX_MIN_WIDTH = 44;
  TEXTBOX_MIN_HEIGHT = 22; // kdxpMinTbox(34)/kdypMinTbox(12) + 2*kdzpBorderTbox
  TCTH_ISCR = [15, 30, 34, 51, 66, 69, 77, 82, 85, 94, 98, 102, 109, 133, 144];
  TBTH_ISCR = [0, ...this.TCTH_ISCR];
  TZTH_DYP = [9, 12, 14, 18, 24, 36, 48];
  TYTH_STYLES = [{ mask: 3, grfont: 0 }, { mask: 3, grfont: 1 }, { mask: 3, grfont: 2 }, { mask: 3, grfont: 3 }];
  TB_FONTS = ['Comic Sans MS', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Trebuchet MS', 'Impact'];
  TEXTBOX_TOOLS = { textboxSelect: 1, textboxPaintText: 1, textboxFill: 1, textboxFont: 1, textboxSize: 1, textboxStyle: 1, textboxStory: 1, textboxCredit: 1 };
  TEXTBOX_PAINT_TOOLS = { textboxPaintText: 1, textboxFont: 1, textboxSize: 1, textboxStyle: 1 };
  selectedTextbox = () => (appState.selectedTextboxId >= 0 && appState.moviePlayer?.scene ? appState.moviePlayer.scene.textboxes.get(appState.selectedTextboxId) : null);
  focusedTextbox = () => (appState.focusedTextboxId >= 0 && appState.moviePlayer?.scene ? appState.moviePlayer.scene.textboxes.get(appState.focusedTextboxId) : null);
  setSelectedTextbox = (chid) => { appState.setSelectedTextboxId(chid); }; // SCEN::SelectTbox — border chrome only
  setFocusedTextbox = (chid) => { // TBXG key focus — the box whose interior was last clicked
  if (appState.focusedTextboxId === chid) return;
  if (appState.focusedTextboxId >= 0) appState.textboxSelections.set(appState.focusedTextboxId, appState.textboxSelection);
  appState.setFocusedTextboxId(chid);
  appState.setTextboxSelection(chid >= 0 ? (appState.textboxSelections.get(chid) || { anchor: 0, other: 0 }) : null);
}
  textboxIdOf = (textbox) => { if (!appState.moviePlayer?.scene) return -1; for (const [c, x] of appState.moviePlayer.scene.textboxes) if (x === textbox) return c; return -1; };
  pickTextbox = (px, py) => { // topmost visible tbox under a view-space point
  for (let i = appState.moviePlayer.textboxes.length - 1; i >= 0; i--) {
    const textbox = appState.moviePlayer.textboxes[i];
    if (px >= textbox.l && px < textbox.r && py >= textbox.t && py < textbox.b) return textbox;
  }
  return null;
};
// TBXB::_TbxtAnchor: which of the 8 resize zones (or move) a border-local pt is in
  textboxAnchor = (xp, yp, w, h) => {
  const B = this.TEXTBOX_BORDER;
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
  inTextboxBorder = (xp, yp, w, h) => xp < this.TEXTBOX_BORDER || yp < this.TEXTBOX_BORDER || xp > w - this.TEXTBOX_BORDER || yp > h - this.TEXTBOX_BORDER;
  TB_ANCHOR_CURS = { up: 'tboxvert', down: 'tboxvert', left: 'tboxhor', right: 'tboxhor', upLeft: 'tboxfall', downRight: 'tboxfall', upRight: 'tboxrise', downLeft: 'tboxrise', move: 'repositi' };
  TB_ANCHOR_HOT = { tboxvert: '8 7', tboxhor: '8 5', tboxfall: '7 7', tboxrise: '6 5', repositi: '8 1' };
// snapshot/restore for doc+rect ops (TUNT*/TUNC* undo objects in the original)
  textboxSnapshotOf = (textbox) => ({ l: textbox.l, t: textbox.t, r: textbox.r, b: textbox.b, fStory: textbox.fStory, rtxt: structuredClone(textbox.rtxt) });
  applyTextboxSnapshot = (textbox, d) => {
  Object.assign(textbox, { l: d.l, t: d.t, r: d.r, b: d.b, fStory: d.fStory });
  textbox.rtxt = structuredClone(d.rtxt); textbox.rtxt._layout = null;
  appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame();
};
  textboxOperation = (textbox, mut) => { // run mut() live, then commit snapshot undo
  const d0 = this.textboxSnapshotOf(textbox);
  mut();
  const d1 = this.textboxSnapshotOf(textbox);
  if (JSON.stringify(d0) === JSON.stringify(d1)) { this.applyTextboxSnapshot(textbox, d0); return; }
  textbox.rtxt._layout = null; playbackLoop.drawFrame();
  editHistory.executeOperation({ do: () => this.applyTextboxSnapshot(textbox, structuredClone(d1)), undo: () => this.applyTextboxSnapshot(textbox, structuredClone(d0)) });
}
// text-edit burst: successive keystrokes merge into one undo op
  beginTextboxSnapshot = (textbox) => {
  if (appState.textboxSnapshot && appState.textboxSnapshot.tb !== textbox) this.endTextboxSnapshot();
  if (!appState.textboxSnapshot) appState.setTextboxSnapshot({ textbox, d0: this.textboxSnapshotOf(textbox) });
}
  endTextboxSnapshot = () => {
  if (!appState.textboxSnapshot) return;
  const { textbox, d0 } = appState.textboxSnapshot; appState.setTextboxSnapshot(null);
  const d1 = this.textboxSnapshotOf(textbox);
  if (JSON.stringify(d0) === JSON.stringify(d1)) return;
  editHistory.executeOperation({ do: () => this.applyTextboxSnapshot(textbox, structuredClone(d1)), undo: () => this.applyTextboxSnapshot(textbox, structuredClone(d0)) });
}
  insertTextbox = (fStory) => { // STDIO::FCmdCreateTbox -> MVIE::FInsTbox (kxp/kyp/kdxp/kdypDefaultTbox)
  const s = appState.moviePlayer.scene, nfrm = appState.moviePlayer.frame;
  if (!s) return;
  const chid = Math.max(-1, ...s.actors.keys(), ...s.textboxes.keys()) + 1;
  const set = (on) => {
    if (on) {
      s.textboxes.set(chid, { cno: 0x8000 + chid, chid, nfrmFirst: nfrm, nfrmMax: 0x7fffffff, // klwMax
        l: 177, t: 78, r: 177 + 140, b: 78 + 100, fStory, _scv: 0,
        rtxt: { font: 'Comic Sans MS', dxpDef: 0, dypFont: 14, acrBack: -1, text: '', mpes: [], fonts: [] } });
      s.startEvents.push({ sevt: SEVT.AddTbox, nfrm, data: chid }); // FAddTboxCore: always the start list (frame-list AddTbox is invalid)
      this.setSelectedTextbox(chid); appState.setSelectedChildId(-1);
      appState.setTextboxAttachment({ textbox: s.textboxes.get(chid), moved: false }); // AttachToMouse: box tracks the cursor until a click drops it
      if (appState.editorTools.view) appState.editorTools.view.cursor = 'none';
    } else {
      s.textboxes.delete(chid);
      for (const l of [s.startEvents, s.frameEvents])
        for (let i = l.length - 1; i >= 0; i--) if (l[i].sevt === SEVT.AddTbox && l[i].data === chid) l.splice(i, 1);
      if (appState.selectedTextboxId === chid) this.setSelectedTextbox(-1);
      if (appState.focusedTextboxId === chid) this.setFocusedTextbox(-1);
      appState.textboxSelections.delete(chid);
      appState.setTextboxAttachment(null); if (appState.editorTools.view) appState.editorTools.view.cursor = '';
    }
    appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame();
  };
  editHistory.executeOperation({ do: () => set(true), undo: () => set(false) });
  appState.editorTools.openCover?.('words');           // EnableTboxTools: words row up + select tool armed
  appState.editorTools.toolBtns?.['4ins']?.onclick();
}
  removeTextbox = (textbox) => { // TBXG toolActorNuke -> SCEN::FRemTbox
  const chid = this.textboxIdOf(textbox), s = appState.moviePlayer.scene;
  const d0 = { rec: this.textboxSnapshotOf(textbox), cno: textbox.cno, nfrmFirst: textbox.nfrmFirst, nfrmMax: textbox.nfrmMax,
    fev: structuredClone(s.frameEvents), sev: structuredClone(s.startEvents) };
  const set = (on) => {
    s.frameEvents.length = 0; s.frameEvents.push(...structuredClone(d0.fev));
    s.startEvents.length = 0; s.startEvents.push(...structuredClone(d0.sev));
    if (on) {
      for (const l of [s.startEvents, s.frameEvents])
        for (let i = l.length - 1; i >= 0; i--) if (l[i].sevt === SEVT.AddTbox && l[i].data === chid) l.splice(i, 1);
      s.textboxes.delete(chid);
      if (appState.selectedTextboxId === chid) this.setSelectedTextbox(-1);
      if (appState.focusedTextboxId === chid) this.setFocusedTextbox(-1);
      appState.textboxSelections.delete(chid);
    } else {
      const rec = s.textboxes.get(chid) || {};
      Object.assign(rec, d0.rec, { cno: d0.cno, nfrmFirst: d0.nfrmFirst, nfrmMax: d0.nfrmMax });
      s.textboxes.set(chid, rec);
    }
    appState.moviePlayer.gotoFrame(appState.moviePlayer.frame); playbackLoop.drawFrame();
  };
  editHistory.executeOperation({ do: () => set(true), undo: () => set(false) });
}
// TXRD::FApplyChp: apply masked chp sprms to [a,b), preserving per-segment values
  applyTextChange = (textbox, a, b, chg) => {
  const doc = textbox.rtxt;
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
  applyTextChangeOp = (textbox, a, b, chg) => this.textboxOperation(textbox, () => this.applyTextChange(textbox, a, b, chg));
// TXRG::FApplyChp: applies to the box's own cp selection; a collapsed caret
// stores the change as _chpIns so it styles the next typed text
  applyTextChangeToSelection = (textbox, chg) => {
  const chid = this.textboxIdOf(textbox);
  const s = chid === appState.focusedTextboxId ? appState.textboxSelection : appState.textboxSelections.get(chid);
  if (s && s.anchor !== s.other) {
    const [a, b] = s.anchor < s.other ? [s.anchor, s.other] : [s.other, s.anchor];
    this.applyTextChangeOp(textbox, a, b, chg);
  } else {
    textbox._chpIns = { ...(textbox._chpIns || {}), ...chg };
  }
}
  insertTextboxText = (textbox, cp, str) => { // TBXG text insert: shift mpes past cp
  const doc = textbox.rtxt;
  this.beginTextboxSnapshot(textbox);
  const n = str.length;
  doc.text = doc.text.slice(0, cp) + str + doc.text.slice(cp);
  for (const m of doc.mpes) if (m.cp > cp) m.cp += n;
  if (textbox._chpIns) this.applyTextChange(textbox, cp, cp + n, textbox._chpIns); // TXRG insert-chp styles the new text
  doc._layout = null;
  if (this.TEXTBOX_PAINT_TOOLS[appState.editorTools.tool]) { appState.editorTools.tool = 'textboxSelect'; appState.editorTools.syncTextboxFaces?.(); } // TBXG::InvalCp: paint tools revert to move on text change
  return cp + n;
}
  deleteTextboxText = (textbox, a, b) => { // delete [a,b): pull interior mpes back to a
  const doc = textbox.rtxt, n = b - a;
  if (n <= 0) return a;
  this.beginTextboxSnapshot(textbox);
  doc.text = doc.text.slice(0, a) + doc.text.slice(b);
  for (const m of doc.mpes) { if (m.cp >= a && m.cp <= b) m.cp = a; else if (m.cp > b) m.cp -= n; }
  doc.mpes.sort((x, y) => x.sprm - y.sprm || x.cp - y.cp);
  doc._layout = null;
  if (this.TEXTBOX_PAINT_TOOLS[appState.editorTools.tool]) { appState.editorTools.tool = 'textboxSelect'; appState.editorTools.syncTextboxFaces?.(); } // TBXG::InvalCp: paint tools revert to move on text change
  return a;
}
}

export const textboxEdits = new TextboxEdits();
