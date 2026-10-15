// Chromecast sender — lazily loads the Cast framework only when asked.
// The receiver is a second Vite entry (receiver.html) running mode=cast; we
// hand it a movie URL over a custom namespace. Requires a registered CAF app
// id (cast.google.com/publish) — pass ?castid= to override; unregistered
// sessions fail gracefully with a showToast().
import { toastHost } from './resources.ts';
import { localizer } from './localization.ts';
import { movieDocument } from './movieDocument.ts';
import { appState } from './appState.ts';
import { playbackLoop } from './playbackLoop.ts';

export const CAST_NS = 'urn:x-cast:com.3dmmweb.movie';
// CAF app id — register your own receiver at cast.google.com/publish ($5) and
// override via ?castid=<id>. The default below is a placeholder.
export const CAST_APP_ID = new URLSearchParams(location.search).get('castid')
  || localStorage.getItem('castAppId') || '3DMMWEB1';

class ChromecastSender {
  session = null;
  /** Mirrors the receiver — while a session is live the theatre is a remote:
   *  its play/rewind controls send play/pause/seek messages instead of driving
   *  the local moviePlayer (the movie is on the TV, not this player). */
  state = { active: false, playing: false };
  apiPromise = null;

  /** True while a cast session is live — the theatre switches to remote mode. */
  isActive = () => this.state.active;

  /** Fire-and-forget control message on the movie namespace. */
  sendCommand = async (type, data = {}) => {
    if (!this.session) return false;
    try { await this.session.sendMessage(CAST_NS, { type, ...data }); return true; }
    catch { return false; }
  };

  /** Toggle play/pause on the receiver and mirror the new state locally. */
  togglePlayback = async () => {
    const p = !this.state.playing;
    if (await this.sendCommand(p ? 'play' : 'pause')) { this.state.playing = p; appState.modeSync?.(); }
    return this.state.playing;
  };

  /** Seek the receiver to frame 1, then keep/start playback. */
  rewind = async () => {
    await this.sendCommand('seek', { frame: 1 });
    if (!this.state.playing) await this.togglePlayback();
  };

  /** Lazily inject the Cast sender framework — resolves true once the
   *  framework is ready (Chrome only; false when unavailable). */
  _loadApi = () => {
    if (this.apiPromise) return this.apiPromise;
    this.apiPromise = new Promise((res) => {
      (window as any).__onGCastApiAvailable = (ok) => {
        if (!ok) return res(false);
        try {
          (globalThis as any).cast.framework.CastContext.getInstance().setOptions({
            receiverApplicationId: CAST_APP_ID,
            autoJoinPolicy: (globalThis as any).chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          res(true);
        } catch { res(false); }
      };
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      s.onerror = () => res(false);
      document.head.appendChild(s);
      setTimeout(() => res(false), 8000); // API missing -> no cast on this browser
    });
    return this.apiPromise;
  };

  /** Theatre cast button — hands the current movie's URL to the receiver app.
   *  Only URL-loaded movies are castable; autosave/local files have no URL. */
  castMovie = async () => {
    const url = movieDocument.lastMovieUrl;
    if (!url) return toastHost.show(localizer.translate('ui.castNeedsUrl')); // autosave/local docs can't be handed off
    if (!(await this._loadApi())) return toastHost.show(localizer.translate('ui.castUnavailable'));
    try {
      const ctx = (globalThis as any).cast.framework.CastContext.getInstance();
      ctx.addEventListener((globalThis as any).cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
        if (e.sessionState === (globalThis as any).cast.framework.SessionState.ENDED) {
          this.session = null; this.state.active = false; this.state.playing = false; appState.modeSync?.();
        }
      });
      const sess = await ctx.requestSession();
      this.session = sess; this.state.active = true; this.state.playing = appState.playing;
      const pos = appState.moviePlayer?.scene
        ? { scene: appState.moviePlayer.movie.scenes.indexOf(appState.moviePlayer.scene), frame: appState.moviePlayer.scene.nfrm - appState.moviePlayer.scene.nfrmFirst + 1 } : {};
      await sess.sendMessage(CAST_NS, {
        type: 'movie', url, ...pos, play: appState.playing,
        packs: new URLSearchParams(location.search).get('packs') || undefined,
      });
      playbackLoop.setPlaying(false); // the movie moves to the TV — theatre stays as the remote
      appState.modeSync?.();
      toastHost.show(localizer.translate('ui.casting'));
    } catch (e) {
      if (e?.code !== 'cancel') toastHost.show(localizer.translate('ui.castFailed')); // user closed the picker — not an error
    }
  };
}

export const castSender = new ChromecastSender();
