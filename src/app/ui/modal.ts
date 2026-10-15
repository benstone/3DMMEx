// Shared modal layer — leaf module (imports nothing that can reach back into
// the browser/easel modules). easel.ts's `extends ModalView` is an eval-time
// edge, so ModalView and the modal slot must live somewhere that always
// finishes initializing before its consumers.
import { View, uiRoot } from './root.ts';
import { appState } from '../appState.ts';

/** Shared modal semantics — the view that owns the modal slot: Escape
 *  routing (modalSlot.view._onEsc || modalSlot.close) and DOM-overlay teardown.
 *  DOM inputs hide while covered and are removed once actually popped. */
export class ModalView extends View {
  constructor() { super(); this._onEsc = null; this._dom = []; }
  /** View-pop hook — DOM overlays hide while the view's covered and are
   *  removed once it's actually off the stack. */
  onExit() {
    const gone = !uiRoot.stack.includes(this);
    for (const el of this._dom) gone ? el.remove() : (el.style.display = 'none');
    if (gone) this._dom.length = 0;
  }
  /** View-enter hook — DOM overlays resurface. */
  onEnter() { for (const el of this._dom) el.style.display = ''; }
  /** Register a DOM overlay element so it hides/pops with the view. */
  addDom(el) { this._dom.push(el); return el; }
}

/** The single modal slot — the currently-open canvas browser/easel view plus
 *  its session teardown (GL dispose, snapshot restore). */
class ModalSlot {
  view = null;    // pushed ModalView, or null
  cleanup = null; // session teardown run on close

  /** Push a browser/easel — closes whatever is up first. */
  open = (view) => {
    this.close(); this.view = view; uiRoot.push(view, 'none');
  };

  /** Close the current browser/easel — stops sound previews, runs session
   *  teardown, pops the view (or splices it out when it isn't on top). */
  close = () => {
    appState.soundQueue?.stopPreview();
    this.cleanup?.(); this.cleanup = null;
    if (this.view) {
      const v = this.view; this.view = null;
      if (uiRoot.topView === v) uiRoot.pop('none');
      else { const i = uiRoot.stack.indexOf(v); if (i >= 0) { uiRoot.stack.splice(i, 1); v.parent = v.root = null; uiRoot._rebuild(); } }
      v.onExit(); // pop() doesn't fire onExit — run teardown after stack removal
    }
  };

  /** Esc inside a browser or easel closes it — easels may route Escape to
   *  their own _onEsc (e.g. sorter cancel) instead. */
  installEscapeRoute = () => {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.view) (this.view._onEsc || this.close)();
    });
  };
}

export const modalSlot = new ModalSlot();
modalSlot.installEscapeRoute();
