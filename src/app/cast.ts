// Chromecast sender — lazily loads the Cast framework only when asked.
// The receiver is a second Vite entry (receiver.html) running mode=cast; we
// hand it a movie URL over a custom namespace. Requires a registered CAF app
// id (cast.google.com/publish) — pass ?castid= to override; unregistered
// sessions fail gracefully with a say().
import { say } from './res.ts';
import { t } from './i18n.ts';
import { lastMovieUrl } from './doc.ts';
import { playing, player, modeSync } from './state.ts';
import { setPlaying } from './loop.ts';

export const CAST_NS = 'urn:x-cast:com.3dmmweb.movie';
// CAF app id — register your own receiver at cast.google.com/publish ($5) and
// override via ?castid=<id>. The default below is a placeholder.
export const CAST_APP_ID = new URLSearchParams(location.search).get('castid')
  || localStorage.getItem('castAppId') || '3DMMWEB1';

// Sender-side cast session state — while a session is live the theatre is a
// remote: its play/rewind controls send play/pause/seek messages instead of
// driving the local player (the movie is on the TV, not this player).
let castSession = null;
export const castState = { active: false, playing: false }; // mirrors the receiver
export const castActive = () => castState.active;

/** Fire-and-forget control message on the movie namespace. */
export async function castCmd(type, data = {}) {
  if (!castSession) return false;
  try { await castSession.sendMessage(CAST_NS, { type, ...data }); return true; }
  catch { return false; }
}

export async function castTogglePlay() {
  const p = !castState.playing;
  if (await castCmd(p ? 'play' : 'pause')) { castState.playing = p; modeSync?.(); }
  return castState.playing;
}

export async function castRewind() { // seek to frame 1 then keep/start playing
  await castCmd('seek', { frame: 1 });
  if (!castState.playing) await castTogglePlay();
}

let apiP = null;
function loadApi() { // resolves true once the Cast framework is ready (Chrome only)
  if (apiP) return apiP;
  apiP = new Promise((res) => {
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
  return apiP;
}

export async function castMovie() { // sender button in theatre
  const url = lastMovieUrl;
  if (!url) return say(t('ui.castNeedsUrl')); // autosave/local docs can't be handed off
  if (!(await loadApi())) return say(t('ui.castUnavailable'));
  try {
    const ctx = (globalThis as any).cast.framework.CastContext.getInstance();
    ctx.addEventListener((globalThis as any).cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
      if (e.sessionState === (globalThis as any).cast.framework.SessionState.ENDED) {
        castSession = null; castState.active = false; castState.playing = false; modeSync?.();
      }
    });
    const sess = await ctx.requestSession();
    castSession = sess; castState.active = true; castState.playing = playing;
    const pos = player?.scene
      ? { scene: player.movie.scenes.indexOf(player.scene), frame: player.scene.nfrm - player.scene.nfrmFirst + 1 } : {};
    await sess.sendMessage(CAST_NS, {
      type: 'movie', url, ...pos, play: playing,
      packs: new URLSearchParams(location.search).get('packs') || undefined,
    });
    setPlaying(false); // the movie moves to the TV — theatre stays as the remote
    modeSync?.();
    say(t('ui.casting'));
  } catch (e) {
    if (e?.code !== 'cancel') say(t('ui.castFailed')); // user closed the picker — not an error
  }
}
