// Theatre + embed views — canvas implementations of the old DOM overlays.
// theatre.cht kgobMovie: the MVU fills the screen rect (48,85)-(592,391),
// projector-lens rewind/play sit at (293/318,7), volume slider on the left
// wall (9,110 + 62px travel). Lights dim (the1dark) while the movie rolls.
import { View, ui, UI_W, UI_H } from './root.js';
import { Element } from './element.js';
import { Img, ImgButton, TextLink, VSlider, MovieScreen } from './widgets.js';
import { playing, player, sounds, setModeSync, modeSync } from '../state.js';
import { setPlaying } from '../loop.js';
import { showOptsDlg } from './optdlg.js';
import { castMovie, castState, castTogglePlay, castRewind } from '../cast.js';
import { t } from '../i18n.js';

const thRewind = () => { // kgobRewindButton: rewind then play
  if (castState.active) return void castRewind(); // remote: seek+play on the TV
  if (!player?.movie.scenes.length) return;
  player.loadScene(0); player.gotoFrame(player.scene.nfrmFirst); setPlaying(true);
};
const thPlay = () => castState.active ? void castTogglePlay() : setPlaying(!playing);
const thPlayFace = () => (castState.active ? castState.playing : playing) ? 'thstop' : 'thplay';

class Veil extends Element { // transparent click filter — no editing in theatre
  constructor(x, y, w, h) { super(x, y, w, h); }
  onPointerDown() { return true; }
}

const mkVol = (x, y, w, h) => { // kgobTheaterVolume slidepath + thumb
  const s = new VSlider(x, y, w, h, 'thvol', (v) => {
    sounds.setVolume(1 - v);
    localStorage.setItem('vol3dmm', String(sounds.volume));
  });
  s.set(1 - sounds.volume);
  return s;
};

// --- portrait phones can't fit the 640-wide stage — ask to rotate -----------
let rotMsg = null, rotQ = null;
const rotSync = () => rotMsg?.classList.toggle('show', rotQ?.matches ?? false);
function rotWatch(on) {
  if (on && !rotMsg) {
    rotMsg = document.createElement('div');
    rotMsg.id = 'rotMsg';
    rotMsg.textContent = t('ui.rotateDevice');
    document.body.appendChild(rotMsg);
    rotQ = matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 679px)');
    rotQ.addEventListener('change', rotSync);
    rotSync();
  } else if (!on && rotMsg) {
    rotQ.removeEventListener('change', rotSync); rotQ = null;
    rotMsg.remove(); rotMsg = null;
  }
}

export class TheatreView extends View {
  constructor() {
    super();
    this.bg = new Img('theatre1', 0, 0, UI_W, UI_H);
    this.add(this.bg);
    this.add(new MovieScreen(48, 85, 544, 306));       // kgobMovie workspace
    this.add(new Veil(48, 85, 544, 306));
    this.playB = new ImgButton(thPlayFace, null, 318, 7, 25, 51, thPlay); // kgobPlayButton
    this.add(this.playB);
    this.add(new ImgButton('threw', 'threwc', 293, 7, 24, 51, thRewind));
    this.vol = mkVol(9, 110, 12, 74);
    this.add(this.vol);
    this.add(new TextLink(t('ui.settings'), 4, 4, 60, 14, () => showOptsDlg()));
    this.add(new TextLink(t('ui.cast'), 4, 22, 60, 14, () => castMovie()));
    setModeSync(() => {                                 // lights dim while rolling (kst3 -> the1dark)
      this.bg.name = playing ? 'the1dark' : 'theatre1';
      this.playB.sync();
      this.vol.visible = !playing;
      this.invalidate();
    });
    modeSync?.();
  }
  onEnter() { rotWatch(true); }
  onExit() { setModeSync(null); rotWatch(false); }
}

export class EmbedView extends View {
  constructor() {
    super();
    this.interactive = true;
    this.add(new MovieScreen(0, 60, UI_W, 360));        // 544:306 scaled to the 640-wide stage
    this.add(new Veil(0, 60, UI_W, 360));
    this.vol = mkVol(14, 395, 12, 70);
    this.add(this.vol);
    this.add(new ImgButton('threw', 'threwc', 556, 405, 30, 60, thRewind));
    this.playB = new ImgButton(thPlayFace, null, 594, 405, 30, 60, thPlay);
    this.add(this.playB);
    this.add(new TextLink(t('ui.settings'), 4, 4, 60, 14, () => showOptsDlg()));
    setModeSync(() => { this.playB.sync(); this.invalidate(); });
    modeSync?.();
  }
  onExit() { setModeSync(null); }
}

// --- theatre / embed mode entry (?3mm=...&mode=theatre|embed) -----------------
// The cinema is a canvas view; the studio stays mounted underneath it.
export const enterTheatre = () => ui.replace(new TheatreView(), 'fade');
export const enterEmbed = () => ui.replace(new EmbedView(), 'fade');
