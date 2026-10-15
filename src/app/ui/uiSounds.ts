// Interface sounds — the original's ADOPT_WAVE/PlayUISound set mapped onto
// the sound queue's dedicated 'ui' channel. Call sites pass the wav's
// basename under public/snd/ ('cover', 'sectool', 'recframe', ...); the
// queue lazily fetches, decodes, and plays it through the master gain so
// the studio volume slider and mute toggle apply to UI sounds too.
import { appState } from '../appState.ts';

/** Interface-sound facade — `play` one-shots, `loop` repeats until `stop`,
 *  `stop` ends a held tool sound (rotate drone, recording tick). All calls
 *  are safe before the sound queue exists or while muted — they're no-ops. */
class UiSounds {
  /** One-shot interface sound — button clicks, opens, picks, tool applies. */
  play(name: string) { appState.soundQueue?.playUi(name); }
  /** Loop an interface sound until `stop()` — rotate/transform drones. */
  loop(name: string) { appState.soundQueue?.playUi(name, { loop: true }); }
  /** Stop the current interface sound — end a held loop on release. */
  stop() { appState.soundQueue?.stopUi(); }
}

export const uiSounds = new UiSounds();
