// --- editor undo/redo (studio.cht kidUndo): one button cycling undo<->redo ---
// kstOpen='undo' face (click -> cidUndo, ->closed), kstClosed='undos' = redo face
// (click -> cidRedo, ->open), kstDisabled='undod'. Ops are {do,undo} pairs.
import { $, texUrl } from './res.js';
import { tbSnapEnd } from './edit/tbox.js';
import { docMark } from './doc.js';

export const hist = { undos: [], redos: [], mode: 'u' };
export function opExec(op) { tbSnapEnd(); op.do(); hist.undos.push(op); hist.redos.length = 0; hist.mode = 'u'; docMark(); syncUndoBtn(); }
export function histUndo() { tbSnapEnd(); const op = hist.undos.pop(); if (op) { op.undo(); hist.redos.push(op); docMark(); } hist.mode = 'r'; syncUndoBtn(); }
export function histRedo() { tbSnapEnd(); const op = hist.redos.pop(); if (op) { op.do(); hist.undos.push(op); docMark(); } hist.mode = 'u'; syncUndoBtn(); }
export function histClear() { hist.undos.length = hist.redos.length = 0; hist.mode = 'u'; syncUndoBtn(); }
export function syncUndoBtn() {
  const b = $('stb_undo'); if (!b) return;
  const n = hist.mode === 'u' ? hist.undos.length : hist.redos.length;
  b._en = n > 0;
  b.firstElementChild.src = texUrl(`${n ? (hist.mode === 'u' ? 'undo' : 'undos') : 'undod'}`);
}
