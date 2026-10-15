// Canvas item-browser view — port of ui-dom/browsers.js showBrowser().
// browser.cht: modal book panel + frame grid + page controls. Pushed onto the
// UiRoot stack; studio stays mounted underneath.
import { View, ui } from './root.ts';
import { Element } from './element.ts';
import { Img, StBtn } from './widgets.ts';
import { texImg, imgReady } from './img.ts';
import { playing, sounds, renderer, player, setPendPlace, ed } from '../state.ts';
import { editBkgd, editCam } from '../edit/movie.ts';
import { setSndTag } from '../edit/sound.ts';
import { setPlaying, draw } from '../loop.ts';
import { getSndItems, addUserSnd, importSndFiles, previewItem } from '../sndsrc.ts';
import { bkthCaths, brwsTmpls, mbmpCanvas } from '../thumbs.ts';
import { showSpletter, showWords, showRecorder } from './easels.ts';
import { t } from '../i18n.ts';

export const BRWS_DEFS = {
  // kidBrwsBackground/kidBrwsSceneFrames: book1 at (62,48) via reg (258,370); frames 136x78, cells +4.
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

class BrwsCell extends Element { // frame img + content (mbmp thumb or text label)
  constructor(view, d, i) {
    const c = i % d.cols, r = Math.floor(i / d.cols);
    super(d.x + d.x0 + c * d.sx, d.y + d.y0 + r * d.sy, d.fw, d.fh);
    this.d = d; this.view = view; this.cursor = 'pointer';
    this.idx = i; this.hover = false; this.sel = false;
  }
  it() { return this.view.items[this.view.page * this.view.perPage + this.idx]; }
  draw(ctx) {
    const it = this.it();
    const fr = texImg(`${this.d.fr}${this.sel || this.hover ? 'h' : ''}`, () => this.dirty());
    if (imgReady(fr)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, 0, 0, this.w, this.h); }
    if (!it) return;
    const cw = this.w - 8, ch = this.h - 8;
    ctx.save(); ctx.translate(4, 4);
    if (it.mbmp) ctx.drawImage(mbmpCanvas(it.mbmp, cw, ch), 0, 0);
    else {
      ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (it.s) { // scene cell: index, name, length
        ctx.font = 'bold 14px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText(`${it.i + 1}`, cw / 2, 16);
        ctx.font = '11px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText((it.s.name || 'scene').slice(0, 18), cw / 2, 40);
        ctx.fillText(`${it.s.nfrmLast - it.s.nfrmFirst + 1} frames`, cw / 2, 58);
      } else { // sound name cell
        ctx.font = '10px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText(it.name, cw / 2, ch / 2, cw - 4);
      }
    }
    ctx.restore();
  }
  onPointerEnter() { this.hover = true; this.dirty(); }
  onPointerLeave() { this.hover = false; this.dirty(); }
  onClick() { this.view.pick(this); }
}

/** Shared modal semantics — the view that owns the brwsView slot: Escape
 *  routing (brwsView._onEsc || closeBrowser) and DOM-overlay teardown. DOM
 *  inputs (EaselView.domInp) are tracked in _dom: hidden while the modal is
 *  covered by a nested push, removed when it actually leaves the stack. */
export class ModalView extends View {
  constructor() { super(); this._onEsc = null; this._dom = []; }
  onExit() {
    const gone = !ui.stack.includes(this);
    for (const el of this._dom) gone ? el.remove() : (el.style.display = 'none');
    if (gone) this._dom.length = 0;
  }
  onEnter() { for (const el of this._dom) el.style.display = ''; }
  addDom(el) { this._dom.push(el); return el; }
}

export class BrowserView extends ModalView {
  constructor(kind, importItems = null) {
    super();
    this.kind = kind; this.importItems = importItems;
    const d = this.d = BRWS_DEFS[kind];
    this.items = importItems || (kind === 'scene' ? player.movie.scenes.map((s, i) => ({ s, i }))
      : kind === 'cam' ? [...(bkthCaths.get(player.bkgd?.cno) ?? [])].sort((a, b) => a[0] - b[0]).map(([icam, mbmp]) => ({ icam, name: `camera ${icam}`, mbmp }))
      : d.fw === 138 ? getSndItems()[kind]
      : brwsTmpls[kind === 'bkgd' ? 'scene' : kind]);
    this.perPage = d.cols * d.rows;
    this.page = 0; this.sel = -1;
    this.pickable = false; // cells carry their own hit rects; clicks outside them still must not fall through:
    this.veil = new Element(0, 0, 640, 480);
    this.veil.draw = () => {};
    this.veil.onPointerDown = () => true;
    this.add(this.veil);
    this.add(new Img(d.book, d.x, d.y, 516, 372));
    this.numEl = new Element(d.x + d.num[0], d.y + d.num[1], 64, 29);
    this.numEl.pickable = false;
    this.numEl.draw = (ctx) => {
      ctx.fillStyle = '#333'; ctx.font = "bold 15px 'Comic Sans MS', cursive, sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('ui.pageNum', { page: this.page + 1, total: this.nPages() }), 32, 14);
    };
    this.add(this.numEl);
    this.cells = [];
    for (let i = 0; i < d.cols * d.rows; i++) {
      const cell = new BrwsCell(this, d, i);
      this.cells.push(cell); this.add(cell);
    }
    const mkB = (up, dn, x, y, w, h, act) => { const b = new StBtn(up, dn, x, y, w, h, act); this.add(b); return b; };
    mkB('fwd', 'fwdc', d.x + d.fwd[0], d.y + d.fwd[1], 59, 46, () => { this.page = Math.min(this.nPages() - 1, this.page + 1); this.invalidate(); });
    mkB('bback', 'bbackc', d.x + d.back[0], d.y + d.back[1], 59, 46, () => { this.page = Math.max(0, this.page - 1); this.invalidate(); });
    if (d.ok) mkB('okay', 'okayc', d.x + d.ok[0], d.y + d.ok[1], 50, 48, () => {
      if (importItems) { // import pick -> into the browser's list
        if (this.sel < 0) return;
        addUserSnd(kind, this.items[this.sel]); closeBrowser(); showBrowser(kind); return;
      }
      setSndTag(kind, this.sel >= 0 ? this.items[this.sel] : null); // BRWN::FCmdOk -> MVU::SetTagTool
      closeBrowser();                                              // (empty pick clears the tool sound)
    });
    mkB('cancel', 'cancelc', d.x + d.can[0], d.y + d.can[1], 50, 48, () => importItems ? (closeBrowser(), showBrowser(kind)) : closeBrowser());
    if (d.rec && !importItems) mkB('mike', 'mikes', d.x + d.rec[0], d.y + d.rec[1], 50, 48, () => showRecorder(kind));
    if (d.imp && !importItems) mkB('sndport', 'sndports', d.x + d.imp[0], d.y + d.imp[1], 50, 48, () => importSndFiles(kind));
    this.invalidate();
  }
  nPages() { return Math.max(1, Math.ceil(this.items.length / this.perPage)); }
  pick(cell) {
    const it = cell.it(), kind = this.kind, d = this.d;
    if (!it) return;
    if (d.ok) { // select-then-ok browsers: highlight + preview
      this.sel = this.page * this.perPage + cell.idx;
      for (const c of this.cells) { c.sel = c === cell; c.dirty(); }
      previewItem(it);
      return;
    }
    if (kind === 'bkgd') editBkgd(it.cno, it.name); // FSetBkgdCore: fill empty scene else insert new
    else if (kind === 'cam') editCam(it.icam); // kidBrwsCamera -> ChngCamera event
    else if (kind === 'actor' || kind === 'prop') { // pick template -> click stage to place
      setPendPlace({ cno: it.cno, name: it.name });
      if (ed.view) ed.view.cursor = 'crosshair';
    } else if (kind === 'scene') { setPlaying(false); player.loadScene(it.i); }
    closeBrowser(); draw();
  }
}

/** The currently-open canvas browser/easel view (pushed on the stack), or null. */
export let brwsView = null;
export let brwsCleanup = null; // session teardown (GL dispose, snapshot restore)
export const setBrwsView = (v) => (brwsView = v);
export const setBrwsCleanup = (f) => (brwsCleanup = f);

export function showBrowser(kind, items = null) { // open a canvas browser over the studio
  closeBrowser();
  brwsView = new BrowserView(kind, items);
  ui.push(brwsView, 'none');
}

export function closeBrowser() { // BRWN->Close; also tears down any easel overlay
  sounds.stopPreview();
  brwsCleanup?.(); brwsCleanup = null;
  if (brwsView) {
    const v = brwsView; brwsView = null;
    if (ui.topView === v) ui.pop('none');
    else { const i = ui.stack.indexOf(v); if (i >= 0) { ui.stack.splice(i, 1); v.parent = v.root = null; ui._rebuild(); } }
    v.onExit(); // pop() doesn't fire onExit — run teardown after stack removal
  }
}

/** Esc inside a browser or easel closes it (browser.cht maps Escape to the cancel
 * button's cid). Easels may route Escape to their own _onEsc (e.g. sorter cancel). */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && brwsView) (brwsView._onEsc || closeBrowser)();
});
