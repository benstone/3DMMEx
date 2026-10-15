// CAF receiver view — receiver.html pushes this and nothing else: a
// letterboxed MovieScreen plus a status line while waiting for a movie.
import { View, UI_WIDTH, UI_HEIGHT } from './root.ts';
import { ImageElement, MovieScreen, TextElement } from './widgets.ts';
import { appState } from '../appState.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { ImageButton } from './widgets.ts';
import { localizer } from '../localization.ts';

/** CAF-receiver view — a letterboxed MovieScreen plus a status line and a
 *  play/stop button; receiver.html pushes this and nothing else. */
export class ReceiverView extends View {
  /** Build the letterboxed screen + status text + play button. */
  constructor() {
    super();
    this.add(new MovieScreen(0, 60, UI_WIDTH, 360)); // 544:306 scaled to 640 wide, letterboxed
    this.status = new TextElement(localizer.translate('ui.castWaiting'), 0, 430, UI_WIDTH, 20, { color: '#888' });
    this.status.pickable = false;
    this.add(this.status);
    this.playB = new ImageButton(() => appState.playing ? 'thstop' : 'thplay', null, 594, 405, 30, 60,
      () => playbackLoop.setPlaying(!appState.playing));
    this.add(this.playB);
    appState.setModeSync(() => { this.playB.sync(); this.invalidate(); });
  }
  /** Update the status line — '' hides it. */
  setStatus(s) { this.status.text = s || ''; this.status.dirty(); this.invalidate(); }
  /** View-pop hook — release the mode-sync callback. */
  onExit() { appState.setModeSync(null); }
}
