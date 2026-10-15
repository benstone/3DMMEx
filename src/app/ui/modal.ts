// Shared modal layer — leaf module (imports nothing that can reach back into
// browsers/easels). easel.ts's `extends ModalView` is an eval-time edge, so
// ModalView and the modal slot must live somewhere that always finishes
// initializing before its consumers; keeping them in browser.ts put them
// inside the browser->sound->undo->studio->bio->easel import cycle (TDZ).
import { View, uiRoot } from './root.ts';
import { appState } from '../appState.ts';

/** Shared modal semantics — the view that owns the modal slot: Escape
 *  routing (modalSlot.view._onEsc || modalSlot.close) and DOM-overlay teardown.
 *  DOM inputs hide while covered and are removed once actually popped. */
export class ModalView extends View {
  constructor() { super(); this._onEsc = null; this._dom = []; }
  onExit() {
    const gone = !uiRoot.stack.includes(this);
    for (const el of this._dom) gone ? el.remove() : (el.style.display = 'none');
    if (gone) this._dom.length = 0;
  }
  onEnter() { for (const el of this._dom) el.style.display = ''; }
  addDom(el) { this._dom.push(el); return el; }
}

/** The single modal slot — the currently-open canvas browser/easel view plus
 *  its session teardown (GL dispose, snapshot restore). */
class ModalSlot {
  view = null;    // pushed ModalView, or null
  cleanup = null; // session teardown run on close

  open = (view) => { // browser/easel push: closes whatever is up, then pushes
    this.close(); this.view = view; uiRoot.push(view, 'none');
  };

  close = () => { // BRWN->Close; also tears down any easel overlay
    appState.soundQueue?.stopPreview();
    this.cleanup?.(); this.cleanup = null;
    if (this.view) {
      const v = this.view; this.view = null;
      if (uiRoot.topView === v) uiRoot.pop('none');
      else { const i = uiRoot.stack.indexOf(v); if (i >= 0) { uiRoot.stack.splice(i, 1); v.parent = v.root = null; uiRoot._rebuild(); } }
      v.onExit(); // pop() doesn't fire onExit — run teardown after stack removal
    }
  };

  installEscapeRoute = () => { // Esc inside a browser or easel closes it
    // (browser.cht maps Escape to the cancel button's cid). Easels may route
    // Escape to their own _onEsc (e.g. sorter cancel).
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.view) (this.view._onEsc || this.close)();
    });
  };
}

export const modalSlot = new ModalSlot();
modalSlot.installEscapeRoute();
