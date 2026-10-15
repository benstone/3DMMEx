// Editor undo/redo — one toolbar button cycling undo<->redo: the 'undo' face
// clicks through to an undo and flips to the 'undos' (redo) face; 'undod' is
// the disabled face. Ops are {do,undo} pairs.
import { studioHost } from './ui/studio.ts';
import { textboxEdits } from './edit/textboxEdits.ts';
import { movieDocument } from './movieDocument.ts';

/** Undo/redo stacks + the toolbar button sync. `executeOperation` runs and
 *  records an op; `undo`/`redo` pop across the stacks and mark the document
 *  dirty. */
export class EditHistory {
  undos: any[] = [];
  redos: any[] = [];
  mode = 'u'; // 'u' = next press undos, 'r' = redos

  /** Run op.do() now and push it as the next undoable step (clears the redo stack). */
  executeOperation = (op) => {
    textboxEdits.endTextboxSnapshot(); op.do();
    this.undos.push(op); this.redos.length = 0; this.mode = 'u';
    movieDocument.markDocumentDirty(); this.syncUndoButton();
  };

  /** Pop the newest op, run its undo, move it to the redo stack. */
  undo = () => {
    textboxEdits.endTextboxSnapshot(); const op = this.undos.pop();
    if (op) { op.undo(); this.redos.push(op); movieDocument.markDocumentDirty(); }
    this.mode = 'r'; this.syncUndoButton();
  };

  /** Pop the newest redone op, run its do, move it back to the undo stack. */
  redo = () => {
    textboxEdits.endTextboxSnapshot(); const op = this.redos.pop();
    if (op) { op.do(); this.undos.push(op); movieDocument.markDocumentDirty(); }
    this.mode = 'u'; this.syncUndoButton();
  };

  /** Drop both stacks — used when a new document is loaded. */
  clear = () => { this.undos.length = this.redos.length = 0; this.mode = 'u'; this.syncUndoButton(); }

  /** Push stack depth + direction into the undo button's face/enabled state. */
  syncUndoButton = () => {
    const b = studioHost.elementById('stb_undo'); if (!b) return;
    const n = this.mode === 'u' ? this.undos.length : this.redos.length;
    b.enabled = n > 0;
    b.faceOverride = n ? (this.mode === 'u' ? 'undo' : 'undos') : 'undod';
    b.dirty();
  }
}

export const editHistory = new EditHistory();
