import { appState } from './appState.ts';
import { elementById } from './resources.ts';
import { FPS } from '../engine/player.ts';
import { movieEdits } from './edit/movieEdits.ts';
import { textboxEdits } from './edit/textboxEdits.ts';
import { renderOptions } from './renderOptions.ts';
import { studioHost } from './ui/studio.ts';

/** Playback driver — the ~6fps movie clock (FPS), rAF or setInterval depending
 *  on the smooth-playback option, plus the editor overlay update each frame. */
class PlaybackLoop {
  timer = null;
  raf = null;
  acc = 0;
  last = 0;

  /** Repaint the studio chrome for the current player state. */
  syncUi = () => { if (appState.moviePlayer) studioHost.sync(); };

  /** Render the current frame + editor overlays, then resync studio chrome. */
  drawFrame = () => {
    const { sceneRenderer, moviePlayer, playing, textboxAttachment, textboxSelection } = appState;
    sceneRenderer.selActor = movieEdits.selectedActor();
    // Textbox editor overlay: the border-selected box gets the frame/anchors;
    // the interior-focused box shows its text selection + caret — the two can
    // be different boxes, since interior clicks never move the border selection.
    const chromeTb = !playing && (textboxAttachment?.tb || textboxEdits.selectedTextbox());
    const editTb = !playing && !textboxAttachment && textboxEdits.focusedTextbox();
    sceneRenderer.textboxChrome = (chromeTb || editTb)
      ? { chrome: chromeTb, textbox: editTb,
          a: textboxSelection ? Math.min(textboxSelection.anchor, textboxSelection.other) : 0,
          b: textboxSelection ? Math.max(textboxSelection.anchor, textboxSelection.other) : 0,
          caret: textboxSelection && textboxSelection.anchor === textboxSelection.other ? textboxSelection.other : null } // caret only on a collapsed sel
      : null;
    try { sceneRenderer.render(moviePlayer); } catch (e) { console.error('render:', e); }
    this.syncUi();
  };

  /** rAF tick for the smooth-playback path — accumulates real time into whole
   *  movie steps, then renders at the fractional remainder. */
  _tick = (now) => {
    const { moviePlayer, sceneRenderer } = appState;
    if (!appState.playing) return;
    const frameDur = 1000 / FPS;
    this.acc += now - this.last; this.last = now;
    while (this.acc >= frameDur) {
      sceneRenderer.beginFrame();
      if (!moviePlayer.step()) { this.setPlaying(false); return; }
      this.acc -= frameDur;
    }
    try { sceneRenderer.render(moviePlayer, this.acc / frameDur); } catch (e) { console.error('render:', e); }
    this.syncUi();
    this.raf = requestAnimationFrame(this._tick);
  };

  /** Start the frame clock — rAF accumulation when the 24fps option is on,
   *  a plain ~6fps interval otherwise. */
  _startClock = () => {
    if (renderOptions.fps24) { this.acc = 0; this.last = performance.now(); this.raf = requestAnimationFrame(this._tick); }
    else this.timer = setInterval(() => { if (!appState.moviePlayer.step()) this.setPlaying(false); this.drawFrame(); }, 1000 / FPS);
  };

  /** Toggle playback — wakes or suspends the audio queue, starts/stops the
   *  frame clock, and notifies studio + theatre chrome. */
  setPlaying = (p) => {
    appState.setPlaying(p); clearInterval(this.timer); if (this.raf) cancelAnimationFrame(this.raf);
    if (p) { appState.soundQueue.ensure(); this._startClock(); }
    else appState.soundQueue.suspend();
    this.syncUi(); // stb_play repaints via the useUiState.playing subscription in StudioView
    appState.modeSync?.(); // theatre/embed UI follows play state
  };
}

export const playbackLoop = new PlaybackLoop();
