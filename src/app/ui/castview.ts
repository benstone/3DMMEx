// Cast receiver view — receiver.html pushes this and nothing else: a
// letterboxed MovieScreen plus a status line while waiting for a movie.
import { View, UI_W, UI_H } from './root.ts';
import { Img, MovieScreen, Txt } from './widgets.ts';
import { playing } from '../state.ts';
import { setPlaying } from '../loop.ts';
import { setModeSync } from '../state.ts';
import { ImgButton } from './widgets.ts';
import { t } from '../i18n.ts';

export class CastView extends View {
  constructor() {
    super();
    this.add(new MovieScreen(0, 60, UI_W, 360)); // 544:306 scaled to 640 wide, letterboxed
    this.status = new Txt(t('ui.castWaiting'), 0, 430, UI_W, 20, { color: '#888' });
    this.status.pickable = false;
    this.add(this.status);
    this.playB = new ImgButton(() => playing ? 'thstop' : 'thplay', null, 594, 405, 30, 60,
      () => setPlaying(!playing));
    this.add(this.playB);
    setModeSync(() => { this.playB.sync(); this.invalidate(); });
  }
  setStatus(s) { this.status.text = s || ''; this.status.dirty(); this.invalidate(); }
  onExit() { setModeSync(null); }
}
