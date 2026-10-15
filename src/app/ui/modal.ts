// Shared modal layer — leaf module (imports nothing that can reach back into
// browsers/easels). easel.ts's `extends ModalView` is an eval-time edge, so
// ModalView and the modal slot must live somewhere that always finishes
// initializing before its consumers; keeping them in browser.ts put them
// inside the browser->sound->undo->studio->bio->easel import cycle (TDZ).
import { View, ui } from './root.ts';
import { sounds } from '../state.ts';

/** Shared modal semantics — the view that owns the modal slot: Escape
 *  routing (modalView._onEsc || closeModal) and DOM-overlay teardown. DOM
 *  inputs hide while covered and are removed once actually popped. */
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

/** The currently-open canvas browser/easel view (pushed on the stack), or null. */
export let modalView = null;
export let modalCleanup = null; // session teardown (GL dispose, snapshot restore)
export const setModalView = (v) => (modalView = v);
export const setModalCleanup = (f) => (modalCleanup = f);

export function closeModal() { // BRWN->Close; also tears down any easel overlay
  sounds?.stopPreview();
  modalCleanup?.(); modalCleanup = null;
  if (modalView) {
    const v = modalView; modalView = null;
    if (ui.topView === v) ui.pop('none');
    else { const i = ui.stack.indexOf(v); if (i >= 0) { ui.stack.splice(i, 1); v.parent = v.root = null; ui._rebuild(); } }
    v.onExit(); // pop() doesn't fire onExit — run teardown after stack removal
  }
}

/** Esc inside a browser or easel closes it (browser.cht maps Escape to the cancel
 * button's cid). Easels may route Escape to their own _onEsc (e.g. sorter cancel). */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalView) (modalView._onEsc || closeModal)();
});
