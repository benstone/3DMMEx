// Theatre + embed views — canvas implementations of the cinema/embed modes.
// The movie fills the screen rect (48,85)-(592,391), projector-lens rewind/play
// sit at (293/318,7), volume slider on the left wall (9,110 + 62px travel).
// Lights dim (the1dark) while the movie rolls.
import { View, uiRoot, UI_WIDTH, UI_HEIGHT } from './root.ts';
import { Element } from './element.ts';
import { ImageElement, ImageButton, TextLink, VerticalSlider, MovieScreen } from './widgets.ts';
import { appState } from '../appState.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { OptionsEasel } from './optionsEasel.ts';
import { localizer } from '../localization.ts';

/** Rewind button — seek to scene 1 + play. */
const theatreRewind = () => {
  if (!appState.moviePlayer?.movie.scenes.length) return;
  appState.moviePlayer.loadScene(0); appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst); playbackLoop.setPlaying(true);
};
/** Play/stop toggle. */
const theatreTogglePlay = () => playbackLoop.setPlaying(!appState.playing);
/** The play/stop face texture name. */
const theatrePlayFace = () => appState.playing ? 'thstop' : 'thplay';

/** Transparent click filter over the movie — no editing in theatre/embed. */
class Veil extends Element {
  constructor(x, y, w, h) { super(x, y, w, h); }
  /** Swallow presses — the movie surface isn't editable here. */
  onPointerDown() { return true; }
}

/** Volume slider factory — drives the sound queue's master volume and
 *  persists it. */
const makeVolumeSlider = (x, y, w, h) => {
  const s = new VerticalSlider(x, y, w, h, 'thvol', (v) => {
    appState.soundQueue.setVolume(1 - v);
    localStorage.setItem('vol3dmm', String(appState.soundQueue.volume));
  });
  s.set(1 - appState.soundQueue.volume);
  return s;
};

// --- portrait phones can't fit the 640-wide stage — ask to rotate -----------
/** The rotate-device prompt — a DOM overlay shown/hidden by a portrait+coarse
 *  media query while a mode has it watched. */
class OrientationPrompt {
  msgEl = null;
  mediaQuery = null;
  /** Reflect the media query into the overlay's visibility. */
  sync = () => this.msgEl?.classList.toggle('show', this.mediaQuery?.matches ?? false);
  /** Install (`on`) or remove the prompt + its media-query listener. */
  watch = (on) => {
    if (on && !this.msgEl) {
      this.msgEl = document.createElement('div');
      this.msgEl.id = 'rotMsg';
      this.msgEl.textContent = localizer.translate('ui.rotateDevice');
      document.body.appendChild(this.msgEl);
      this.mediaQuery = matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 679px)');
      this.mediaQuery.addEventListener('change', this.sync);
      this.sync();
    } else if (!on && this.msgEl) {
      this.mediaQuery.removeEventListener('change', this.sync); this.mediaQuery = null;
      this.msgEl.remove(); this.msgEl = null;
    }
  };
}
const orientationPrompt = new OrientationPrompt();

export class TheatreView extends View {
  /** Swap the stack to the cinema view. */
  static enter = () => uiRoot.replace(new TheatreView(), 'fade');
  /** Build the backdrop, screen+veil, lens buttons, volume, settings/cast links. */
  constructor() {
    super();
    this.bg = new ImageElement('theatre1', 0, 0, UI_WIDTH, UI_HEIGHT);
    this.add(this.bg);
    this.add(new MovieScreen(48, 85, 544, 306));       // the movie screen
    this.add(new Veil(48, 85, 544, 306));
    this.playB = new ImageButton(theatrePlayFace, null, 318, 7, 25, 51, theatreTogglePlay);
    this.add(this.playB);
    this.add(new ImageButton('threw', 'threwc', 293, 7, 24, 51, theatreRewind));
    this.vol = makeVolumeSlider(9, 110, 12, 74);
    this.add(this.vol);
    this.add(new TextLink(localizer.translate('ui.settings'), 4, 4, 60, 14, () => OptionsEasel.show()));
    appState.setModeSync(() => {                                 // lights dim while rolling
      this.bg.name = appState.playing ? 'the1dark' : 'theatre1';
      this.playB.sync();
      this.vol.visible = !appState.playing;
      this.invalidate();
    });
    appState.modeSync?.();
  }
  /** Push hook — arm the rotate prompt. */
  onEnter() { orientationPrompt.watch(true); }
  /** Pop hook — release mode-sync and the rotate prompt. */
  onExit() { appState.setModeSync(null); orientationPrompt.watch(false); }
}

export class EmbedView extends View {
  /** Swap the stack to the embed view. */
  static enter = () => uiRoot.replace(new EmbedView(), 'fade');
  /** Build the screen+veil, volume, rewind/play, and the settings link. */
  constructor() {
    super();
    this.interactive = true;
    this.add(new MovieScreen(0, 60, UI_WIDTH, 360));        // 544:306 scaled to the 640-wide stage
    this.add(new Veil(0, 60, UI_WIDTH, 360));
    this.vol = makeVolumeSlider(14, 395, 12, 70);
    this.add(this.vol);
    this.add(new ImageButton('threw', 'threwc', 556, 405, 30, 60, theatreRewind));
    this.playB = new ImageButton(theatrePlayFace, null, 594, 405, 30, 60, theatreTogglePlay);
    this.add(this.playB);
    this.add(new TextLink(localizer.translate('ui.settings'), 4, 4, 60, 14, () => OptionsEasel.show()));
    appState.setModeSync(() => { this.playB.sync(); this.invalidate(); });
    appState.modeSync?.();
  }
  /** Pop hook — release mode-sync. */
  onExit() { appState.setModeSync(null); }
}

// --- theatre / embed mode entry (?3mm=...&mode=theatre|embed) -----------------
// The cinema is a canvas view; the studio stays mounted underneath it.
// Entry: TheatreView.enter() / EmbedView.enter().
