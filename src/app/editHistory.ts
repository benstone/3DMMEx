// --- editor undo/redo (studio.cht kidUndo): one button cycling undo<->redo ---
// kstOpen='undo' face (click -> cidUndo, ->closed), kstClosed='undos' = redo face
// (click -> cidRedo, ->open), kstDisabled='undod'. Ops are {do,undo} pairs.
import { studioHost } from './ui/studio.ts';
import { textboxEdits } from './edit/textboxEdits.ts';
import { movieDocument } from './movieDocument.ts';

export class EditHistory {
  undos: any[] = [];
  redos: any[] = [];
  mode = 'u'; // 'u' = next button press undos, 'r' = redos

  /** Run op.do() now and push it as the next undoable step (clears the redo stack). */
  executeOperation = (op) => {
    textboxEdits.endTextboxSnapshot(); op.do();
    this.undos.push(op); this.redos.length = 0; this.mode = 'u';
    movieDocument.markDocumentDirty(); this.syncUndoButton();
  };

  undo = () => {
    textboxEdits.endTextboxSnapshot(); const op = this.undos.pop();
    if (op) { op.undo(); this.redos.push(op); movieDocument.markDocumentDirty(); }
    this.mode = 'r'; this.syncUndoButton();
  };

  redo = () => {
    textboxEdits.endTextboxSnapshot(); const op = this.redos.pop();
    if (op) { op.do(); this.undos.push(op); movieDocument.markDocumentDirty(); }
    this.mode = 'u'; this.syncUndoButton();
  };

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
