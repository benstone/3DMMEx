// Chromecast receiver entry (receiver.html) — minimal boot: no studio, no
// editor. Loads the app stack, pushes a CastView, then takes movies over the
// CAF custom namespace (or ?3mm= for standalone testing).
import { docDB, openUrl, newMovie } from './app/doc.ts';
import { setPlaying, draw } from './app/loop.ts';
import { opts } from './app/opts.ts';
import { applyPacks } from './app/packs.ts';
import { Library } from './engine/library.ts';
import { SoundQueue } from './engine/sound.ts';
import { Renderer } from './render/renderer.ts';
import { B, $, say } from './app/res.ts';
import { pal, player, renderer, lib, sounds, setLib, setPal, setRenderer, setSounds } from './app/state.ts';
import { initLang } from './app/i18n.ts';
import { ui } from './app/ui/root.ts';
import { CastView } from './app/ui/castview.ts';
import { CAST_NS } from './app/cast.ts';

document.getElementById('boot').remove(); // receiver shows the canvas immediately
const view = new CastView();
ui.push(view, 'none');
ui.canvas.style.background = '#000';

setLib(await Library.load(`${B}data`));
setPal(new Uint8Array(await (await fetch(`${B}data/socpal.pal`)).arrayBuffer()));
setRenderer(new Renderer($('view'), pal));
setSounds(new SoundQueue(lib));
renderer.setOpts(opts);
await initLang();
await applyPacks();

newMovie(); // empty doc so the view has a player before the first message

const qs = new URLSearchParams(location.search);
/** @param {{url: string, scene?: number, frame?: number, play?: boolean}} m */
async function loadMovie(m) {
  const { url, scene, frame, play } = m;
  const err = await openUrl(url, false); // receiver docs aren't autosaved locally
  if (err) { view.setStatus(err); return; }
  view.setStatus('');
  if (scene != null && player.movie.scenes.length)
    player.loadScene(Math.min(scene, player.movie.scenes.length - 1));
  if (frame != null && player.scene) player.gotoFrame(player.scene.nfrmFirst + frame - 1);
  draw();
  if (play !== false) { sounds.ensure(); setPlaying(true); }
}
if (qs.get('3mm')) await loadMovie({ url: qs.get('3mm'), scene: +qs.get('scene') || null, frame: +qs.get('frame') || null, play: true });

// CAF wiring — no-op when the framework script isn't present (dev standalone).
const caf = globalThis.cast?.framework;
if (caf) {
  const ctx = caf.CastReceiverContext.getInstance();
  ctx.addCustomMessageListener(CAST_NS, (e) => {
    if (e.data?.type === 'movie') loadMovie(e.data);
    else if (e.data?.type === 'play') setPlaying(true);
    else if (e.data?.type === 'pause') setPlaying(false);
    else if (e.data?.type === 'seek' && player?.scene) { player.gotoFrame(e.data.frame); draw(); }
  });
  const opts2 = new caf.CastReceiverOptions();
  opts2.disableIdleTimeout = true; // movies can sit paused for a while
  ctx.start(opts2);
}
