// Chromecast sender — lazily loads the Cast framework only when asked.
// The receiver is a second Vite entry (receiver.html) running mode=cast; we
// hand it a movie URL over a custom namespace. Requires a registered CAF app
// id (cast.google.com/publish) — pass ?castid= to override; unregistered
// sessions fail gracefully with a say().
import { say } from './res.js';
import { t } from './i18n.js';
import { lastMovieUrl } from './doc.js';
import { playing, player } from './state.js';
import { setPlaying } from './loop.js';

export const CAST_NS = 'urn:x-cast:com.3dmmweb.movie';
// CAF app id — register your own receiver at cast.google.com/publish ($5) and
// override via ?castid=<id>. The default below is a placeholder.
export const CAST_APP_ID = new URLSearchParams(location.search).get('castid')
  || localStorage.getItem('castAppId') || '3DMMWEB1';

let apiP = null;
function loadApi() { // resolves true once the Cast framework is ready (Chrome only)
  if (apiP) return apiP;
  apiP = new Promise((res) => {
    /** @type {any} */ (window).__onGCastApiAvailable = (ok) => {
      if (!ok) return res(false);
      try {
        /** @type {any} */ (globalThis).cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: CAST_APP_ID,
          autoJoinPolicy: /** @type {any} */ (globalThis).chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
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
    const ctx = /** @type {any} */ (globalThis).cast.framework.CastContext.getInstance();
    const sess = await ctx.requestSession();
    const pos = player?.scene
      ? { scene: player.movie.scenes.indexOf(player.scene), frame: player.scene.nfrm - player.scene.nfrmFirst + 1 } : {};
    await sess.sendMessage(CAST_NS, {
      type: 'movie', url, ...pos, play: playing,
      packs: new URLSearchParams(location.search).get('packs') || undefined,
    });
    setPlaying(false); // the movie moves to the TV — theatre stays as the remote
    say(t('ui.casting'));
  } catch (e) {
    if (e?.code !== 'cancel') say(t('ui.castFailed')); // user closed the picker — not an error
  }
}
