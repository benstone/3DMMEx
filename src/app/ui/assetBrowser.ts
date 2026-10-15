// Canvas item-browser view — a modal book panel with a frame grid and page
// controls. Pushed onto the uiRoot stack via the modal slot; the studio stays
// mounted underneath.
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
// The recorder entry is click-time only — a lazy easels import keeps this
// module out of the easel import cycle.
import { ModalView, modalSlot } from './modal.ts';
import { CURSORS } from './cursorManager.ts';
import { uiSounds } from './uiSounds.ts';
const easels = () => import('./easels.ts');

/** Per-kind browser layouts — book skin, grid geometry, and button slots,
 *  — the pickers' fixed 640x480 layouts. */
export const BROWSER_DEFS = {
  // scene + backdrop pickers share the book1 layout at (62,48); 136x78 frames.
  scene: { bookSkin: 'book1', x: 62, y: 48, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame1', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 340], cancelButton: [437, 320] },
  bkgd: { bookSkin: 'book1', x: 62, y: 48, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame1', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 340], cancelButton: [437, 320] },
  // camera picker: book2 at (62,100), same grid, frame2 cells
  cam:  { bookSkin: 'book2', x: 62, y: 100, frameWidth: 136, frameHeight: 78, cellFrameSkin: 'frame2', columns: 3, rows: 3, gridX: 40, gridY: 40, cellStepX: 150, cellStepY: 87, forwardButton: [303, 320], backButton: [155, 320], pageText: [226, 340], cancelButton: [437, 320] },
  actor: { bookSkin: 'book3', x: 62, y: 47, frameWidth: 80, frameHeight: 80, cellFrameSkin: 'frame3', columns: 5, rows: 3, gridX: 30, gridY: 38, cellStepX: 94, cellStepY: 94, forwardButton: [304, 322], backButton: [155, 322], pageText: [228, 337], cancelButton: [437, 320] },
  prop: { bookSkin: 'book4', x: 62, y: 47, frameWidth: 80, frameHeight: 80, cellFrameSkin: 'frame4', columns: 5, rows: 3, gridX: 30, gridY: 38, cellStepX: 94, cellStepY: 94, forwardButton: [304, 322], backButton: [155, 322], pageText: [228, 337], cancelButton: [437, 320] },
  // sound name-list browsers: book6=midi, book7=fx, book8=speech
  fx:     { bookSkin: 'book7', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 336], okButton: [437, 320], cancelButton: [387, 320], recordButton: [29, 320], importButton: [79, 320] },
  speech: { bookSkin: 'book8', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 336], okButton: [437, 320], cancelButton: [387, 320], recordButton: [29, 320], importButton: [79, 320] },
  music:  { bookSkin: 'book6', x: 62, y: 48, frameWidth: 138, frameHeight: 25, cellFrameSkin: 'frame5', columns: 3, rows: 10, columnMajor: true, gridX: 31, gridY: 34, cellStepX: 158, cellStepY: 28, forwardButton: [303, 320], backButton: [154, 320], pageText: [230, 336], okButton: [437, 320], cancelButton: [387, 320], importButton: [79, 320] },
};

/** A grid cell — frame image plus content (thumbnail or name label). */
class BrowserCell extends Element {
  /** `view` is the owning browser, `def` the layout, `i` the grid slot. */
  constructor(view, def, i) {
    const col = i % def.columns, row = Math.floor(i / def.columns);
    super(def.x + def.gridX + col * def.cellStepX, def.y + def.gridY + row * def.cellStepY, def.frameWidth, def.frameHeight);
    this.def = def; this.view = view; this.cursor = CURSORS.pointer;
    this.clickSound = 'brwzpic'; // the cell-pick sound
    this.cellIndex = i; this.hover = false; this.selected = false;
  }
  /** The item this cell currently shows — page + grid slot into the list. */
  item() { return this.view.items[this.view.pageIndex * this.view.itemsPerPage + this.cellIndex]; }
  /** Paint the frame + the item's thumbnail, or the scene/sound label. */
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
  /** Press — the 'h' face is a press state, not hover. */
  onPointerDown() { this.hover = true; this.dirty(); }
  /** Release the press. */
  onPointerUp() { this.hover = false; this.dirty(); }
  /** Cancel the press when the pointer slides off. */
  onPointerLeave() { this.hover = false; this.dirty(); }
  /** Pick this cell's item. */
  onClick() { this.view.pick(this); }
}

/** Shared modal semantics — the view that owns the modalSlot.view slot: Escape
 *  routing (modalSlot.view._onEsc || modalSlot.close) and DOM-overlay teardown. DOM
 *  inputs (EaselView.domInput) are tracked in _dom: hidden while the modal is
 *  covered by a nested push, removed when it actually leaves the stack. */
export class AssetBrowserView extends ModalView {
  /** Open a browser over the studio — `kind` selects a BROWSER_DEFS layout;
   *  `items` overrides the list (import candidates). */
  static show(kind, items = null) {
    if (!BROWSER_DEFS[kind]) { console.warn(`[browser] unknown kind: ${kind}`); return; }
    modalSlot.open(new AssetBrowserView(kind, items));
  }
  /** Build the book, cells, page controls, and kind-specific buttons. */
  constructor(kind, importItems = null) {
    super();
    this.openSound = 'pbrowse'; // the page-flip browser-open sound
    this.kind = kind; this.importItems = importItems;
    const def = this.def = BROWSER_DEFS[kind];
    this.items = importItems || (kind === 'scene' ? appState.moviePlayer.movie.scenes.map((s, i) => ({ s, i }))
      : kind === 'cam' ? [...(thumbnails.backgroundThumbCatalogs.get(appState.moviePlayer.bkgd?.cno) ?? [])].sort((a, b) => a[0] - b[0]).map(([icam, mbmp]) => ({ cameraIndex: icam, name: `camera ${icam}`, mbmp }))
      : def.frameWidth === 138 ? soundSources.getSoundItems()[kind]
      : thumbnails.browserTemplates[kind === 'bkgd' ? 'scene' : kind]);
    this.itemsPerPage = def.columns * def.rows;
    this.pageIndex = 0; this.selectedIndex = -1;
    this.pickable = false; // cells carry their own hit rects; clicks outside must not fall through:
    this.veil = new Element(0, 0, 640, 480);
    this.veil.draw = () => {};
    this.veil.onPointerDown = () => { uiSounds.play('splot'); return true; }; // background clicks splat
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
    const makeButton = (up, dn, x, y, w, h, act, clickSound = 'brwzbtn') => { const b = new StudioButton(up, dn, x, y, w, h, act); b.clickSound = clickSound; this.add(b); return b; };
    makeButton('fwd', 'fwdc', def.x + def.forwardButton[0], def.y + def.forwardButton[1], 59, 46, () => { this.pageIndex = Math.min(this.pageCount() - 1, this.pageIndex + 1); this.invalidate(); }, 'pagedn');
    makeButton('bback', 'bbackc', def.x + def.backButton[0], def.y + def.backButton[1], 59, 46, () => { this.pageIndex = Math.max(0, this.pageIndex - 1); this.invalidate(); }, 'pageup');
    if (def.okButton) makeButton('okay', 'okayc', def.x + def.okButton[0], def.y + def.okButton[1], 50, 48, () => {
      if (importItems) { // import pick -> into the browser's list
        if (this.selectedIndex < 0) return;
        soundSources.addUserSound(kind, this.items[this.selectedIndex]); modalSlot.close(); AssetBrowserView.show(kind); return;
      }
      soundEdits.setSoundTag(kind, this.selectedIndex >= 0 ? this.items[this.selectedIndex] : null); // OK loads the tool sound
      modalSlot.close();                                              // (empty pick clears the tool sound)
    }, 'ok');
    makeButton('cancel', 'cancelc', def.x + def.cancelButton[0], def.y + def.cancelButton[1], 50, 48, () => importItems ? (modalSlot.close(), AssetBrowserView.show(kind)) : modalSlot.close(), 'cancel');
    if (def.recordButton && !importItems) makeButton('mike', 'mikes', def.x + def.recordButton[0], def.y + def.recordButton[1], 50, 48, () => easels().then((m) => m.RecorderEasel.show(kind)), 'mike');
    if (def.importButton && !importItems) makeButton('sndport', 'sndports', def.x + def.importButton[0], def.y + def.importButton[1], 50, 48, () => soundSources.importSoundFiles(kind), 'pfopen');
    this.invalidate();
  }
  /** Page count for the current items. */
  pageCount() { return Math.max(1, Math.ceil(this.items.length / this.itemsPerPage)); }
  /** A cell's click — sound browsers select+preview for OK; other kinds run
   *  their edit (backdrop/camera pick, actor placement arm, scene jump) and
   *  close. */
  pick(cell) {
    const item = cell.item(), kind = this.kind, def = this.def;
    if (!item) return;
    if (def.okButton) { // select-then-ok browsers: highlight + preview
      this.selectedIndex = this.pageIndex * this.itemsPerPage + cell.cellIndex;
      for (const c of this.cells) { c.selected = c === cell; c.dirty(); }
      soundSources.previewSoundItem(item);
      return;
    }
    if (kind === 'bkgd') movieEdits.editBackground(item.cno, item.name); // fills an empty scene, else inserts a new one
    else if (kind === 'cam') movieEdits.editCamera(item.cameraIndex); // rewrites the current ChngCamera event
    else if (kind === 'actor' || kind === 'prop') { // pick template -> click stage to place
      appState.setPendingPlacement({ cno: item.cno, name: item.name });
      if (appState.editorTools.view) appState.editorTools.view.cursor = CURSORS.crosshair;
    } else if (kind === 'scene') { playbackLoop.setPlaying(false); appState.moviePlayer.loadScene(item.sceneIndex); }
    modalSlot.close(); playbackLoop.drawFrame();
  }
}
