// Canvas item-browser view — port of ui-dom/browsers.js AssetBrowserView.show().
// browser.cht: modal book panel + frame grid + page controls. Pushed onto the
// UiRoot stack; studio stays mounted underneath.
import { View, uiRoot } from './root.ts';
import { Element } from './element.ts';
import { ImageElement, StudioButton } from './widgets.ts';
import { textureCache } from './textureCache.ts';
import { appState } from '../appState.ts';
import { movieEdits } from '../edit/movieEdits.ts';
import { soundEdits } from '../edit/soundEdits.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { soundSources} from '../soundSources.ts';
import { thumbnails } from '../thumbnails.ts';
import { localizer } from '../localization.ts';
// easel->browser->easels->easel was an eval-time import cycle; modal.ts owns
// ModalView+the slot (a leaf), and the recorder entry is click-time only, so
// a lazy import keeps this module out of the cycle entirely.
import { ModalView, modalSlot } from './modal.ts';
const easels = () => import('./easels.ts');

export const BROWSER_DEFS = {
  // kidBrwsBackground/kidBrwsSceneFrames: book1 at (62,48) via reg (258,370); frames 136x78, cells +4.
  scene: { bookSkin: 'book1', x: 62, y: 48, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame1', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 345], cancelButton: [437, 320] },
  bkgd: { bookSkin: 'book1', x: 62, y: 48, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame1', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 345], cancelButton: [437, 320] },
  // kidBrwsCamera: book2 at (62,100), same grid, frame2 cells
  cam:  { bookSkin: 'book2', x: 62, y: 100, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame2', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 345], cancelButton: [437, 320] },
  actor: { bookSkin: 'book3', x: 62, y: 47, frameWidth: 80, frameHeight: 80, cellFrameSkin: 'frame3', columns: 5, rows: 3, gridX: 30, gridY: 38, cellStepX: 94, cellStepY: 94, forwardButton: [304, 322], backButton: [155, 322], pageText: [228, 342], cancelButton: [437, 320] },
  prop: { bookSkin: 'book4', x: 62, y: 47, frameWidth: 80, frameHeight: 80, cellFrameSkin: 'frame4', columns: 5, rows: 3, gridX: 30, gridY: 38, cellStepX: 94, cellStepY: 94, forwardButton: [304, 322], backButton: [155, 322], pageText: [228, 342], cancelButton: [437, 320] },
  // sound name-list browsers (browser.cht kidBrwsSounds*): book6=midi, book7=fx, book8=speech
  fx:     { bookSkin: 'book7', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 341], okButton: [437, 320], cancelButton: [387, 320], recordButton: [29, 320], importButton: [79, 320] },
  speech: { bookSkin: 'book8', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 341], okButton: [437, 320], cancelButton: [387, 320], recordButton: [29, 320], importButton: [79, 320] },
  music:  { bookSkin: 'book6', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 341], okButton: [437, 320], cancelButton: [387, 320], importButton: [79, 320] },
};

class BrowserCell extends Element { // frame img + content (mbmp thumb or text label)
  constructor(view, def, i) {
    const col = i % def.columns, row = Math.floor(i / def.columns);
    super(def.x + def.gridX + col * def.cellStepX, def.y + def.gridY + row * def.cellStepY, def.frameWidth, def.frameHeight);
    this.def = def; this.view = view; this.cursor = 'pointer';
    this.cellIndex = i; this.hover = false; this.selected = false;
  }
  item() { return this.view.items[this.view.pageIndex * this.view.itemsPerPage + this.cellIndex]; }
  draw(ctx) {
    const item = this.item();
    const frameImage = textureCache.image(`${this.def.cellFrameSkin}${this.selected || this.hover ? 'h' : ''}`, () => this.dirty());
    if (textureCache.isReady(frameImage)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(frameImage, 0, 0, this.w, this.h); }
    if (!item) return;
    const cw = this.w - 8, ch = this.h - 8;
    ctx.save(); ctx.translate(4, 4);
    if (item.mbmp) ctx.drawImage(thumbnails.mbmpToCanvas(item.mbmp, cw, ch), 0, 0);
    else {
      ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (item.scene) { // scene cell: index, name, length
        ctx.font = 'bold 14px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText(`${item.sceneIndex + 1}`, cw / 2, 16);
        ctx.font = '11px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText((item.scene.name || 'scene').slice(0, 18), cw / 2, 40);
        ctx.fillText(`${item.scene.lastFrame - item.scene.firstFrame + 1} frames`, cw / 2, 58);
      } else { // sound name cell
        ctx.font = '10px "Comic Sans MS", cursive, sans-serif';
        ctx.fillText(item.name, cw / 2, ch / 2, cw - 4);
      }
    }
    ctx.restore();
  }
  onPointerDown() { this.hover = true; this.dirty(); } // 'h' face is a press state, not hover
  onPointerUp() { this.hover = false; this.dirty(); }
  onPointerLeave() { this.hover = false; this.dirty(); }
  onClick() { this.view.pick(this); }
}

/** Shared modal semantics — the view that owns the modalSlot.view slot: Escape
 *  routing (modalSlot.view._onEsc || modalSlot.close) and DOM-overlay teardown. DOM
 *  inputs (EaselView.domInput) are tracked in _dom: hidden while the modal is
 *  covered by a nested push, removed when it actually leaves the stack. */
export class AssetBrowserView extends ModalView {
  /** Open a canvas browser over the studio. */
  static show(kind, items = null) {
    if (!BROWSER_DEFS[kind]) { console.warn(`[browser] unknown kind: ${kind}`); return; }
    modalSlot.open(new AssetBrowserView(kind, items));
  }
  constructor(kind, importItems = null) {
    super();
    this.kind = kind; this.importItems = importItems;
    const def = this.def = BROWSER_DEFS[kind];
    this.items = importItems || (kind === 'scene' ? appState.moviePlayer.movie.scenes.map((s, i) => ({ s, i }))
      : kind === 'cam' ? [...(thumbnails.backgroundThumbCatalogs.get(appState.moviePlayer.bkgd?.cno) ?? [])].sort((a, b) => a[0] - b[0]).map(([icam, mbmp]) => ({ cameraIndex: icam, name: `camera ${icam}`, mbmp }))
      : def.frameWidth === 138 ? soundSources.getSoundItems()[kind]
      : thumbnails.browserTemplates[kind === 'bkgd' ? 'scene' : kind]);
    this.itemsPerPage = def.columns * def.rows;
    this.pageIndex = 0; this.selectedIndex = -1;
    this.pickable = false; // cells carry their own hit rects; clicks outside them still must not fall through:
    this.veil = new Element(0, 0, 640, 480);
    this.veil.draw = () => {};
    this.veil.onPointerDown = () => true;
    this.add(this.veil);
    this.add(new ImageElement(def.bookSkin, def.x, def.y, 516, 372));
    this.pageTextEl = new Element(def.x + def.pageText[0], def.y + def.pageText[1], 64, 29);
    this.pageTextEl.pickable = false;
    this.pageTextEl.draw = (ctx) => {
      ctx.fillStyle = '#333'; ctx.font = "bold 15px 'Comic Sans MS', cursive, sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(localizer.translate('ui.pageNum', { page: this.pageIndex + 1, total: this.pageCount() }), 32, 14);
    };
    this.add(this.pageTextEl);
    this.cells = [];
    for (let i = 0; i < def.columns * def.rows; i++) {
      const cell = new BrowserCell(this, def, i);
      this.cells.push(cell); this.add(cell);
    }
    const makeButton = (up, dn, x, y, w, h, act) => { const b = new StudioButton(up, dn, x, y, w, h, act); this.add(b); return b; };
    makeButton('fwd', 'fwdc', def.x + def.forwardButton[0], def.y + def.forwardButton[1], 59, 46, () => { this.pageIndex = Math.min(this.pageCount() - 1, this.pageIndex + 1); this.invalidate(); });
    makeButton('bback', 'bbackc', def.x + def.backButton[0], def.y + def.backButton[1], 59, 46, () => { this.pageIndex = Math.max(0, this.pageIndex - 1); this.invalidate(); });
    if (def.okButton) makeButton('okay', 'okayc', def.x + def.okButton[0], def.y + def.okButton[1], 50, 48, () => {
      if (importItems) { // import pick -> into the browser's list
        if (this.selectedIndex < 0) return;
        soundSources.addUserSound(kind, this.items[this.selectedIndex]); modalSlot.close(); AssetBrowserView.show(kind); return;
      }
      soundEdits.setSoundTag(kind, this.selectedIndex >= 0 ? this.items[this.selectedIndex] : null); // BRWN::FCmdOk -> MVU::SetTagTool
      modalSlot.close();                                              // (empty pick clears the tool sound)
    });
    makeButton('cancel', 'cancelc', def.x + def.cancelButton[0], def.y + def.cancelButton[1], 50, 48, () => importItems ? (modalSlot.close(), AssetBrowserView.show(kind)) : modalSlot.close());
    if (def.recordButton && !importItems) makeButton('mike', 'mikes', def.x + def.recordButton[0], def.y + def.recordButton[1], 50, 48, () => easels().then((m) => m.RecorderEasel.show(kind)));
    if (def.importButton && !importItems) makeButton('sndport', 'sndports', def.x + def.importButton[0], def.y + def.importButton[1], 50, 48, () => soundSources.importSoundFiles(kind));
    this.invalidate();
  }
  pageCount() { return Math.max(1, Math.ceil(this.items.length / this.itemsPerPage)); }
  pick(cell) {
    const item = cell.item(), kind = this.kind, def = this.def;
    if (!item) return;
    if (def.okButton) { // select-then-ok browsers: highlight + preview
      this.selectedIndex = this.pageIndex * this.itemsPerPage + cell.cellIndex;
      for (const c of this.cells) { c.selected = c === cell; c.dirty(); }
      soundSources.previewSoundItem(item);
      return;
    }
    if (kind === 'bkgd') movieEdits.editBackground(item.cno, item.name); // FSetBkgdCore: fill empty scene else insert new
    else if (kind === 'cam') movieEdits.editCamera(item.cameraIndex); // kidBrwsCamera -> ChngCamera event
    else if (kind === 'actor' || kind === 'prop') { // pick template -> click stage to place
      appState.setPendingPlacement({ cno: item.cno, name: item.name });
      if (appState.editorTools.view) appState.editorTools.view.cursor = 'crosshair';
    } else if (kind === 'scene') { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(item.sceneIndex); }
    modalSlot.close(); playbackLoop.drawFrame();
  }
}
