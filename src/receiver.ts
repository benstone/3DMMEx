// Chromecast receiver entry (receiver.html) — minimal boot: no studio, no
// editor. Loads the app stack, pushes a CastView, then takes movies over the
// CAF custom namespace (or ?3mm= for standalone testing).
import { movieDocument } from './app/movieDocument.ts';
import { playbackLoop } from './app/playbackLoop.ts';
import { renderOptions } from './app/renderOptions.ts';
import { expansionPacks } from './app/expansionPacks.ts';
import { Library } from './engine/library.ts';
import { SoundQueue } from './engine/sound.ts';
import { Renderer } from './render/renderer.ts';
import {baseUrl, elementById } from './app/resources.ts';
import { appState } from './app/appState.ts';
import { localizer } from './app/localization.ts';
import { uiRoot } from './app/ui/root.ts';
import { CastView } from './app/ui/castView.ts';
import { injectAppStyles } from './app/ui/styles.ts';
import { CAST_NS } from './app/chromecast.ts';

injectAppStyles();
document.getElementById('boot').remove(); // receiver shows the canvas immediately
document.getElementById('studio').style.height = '100vh'; // receiver fills the TV viewport
const view = new CastView();
uiRoot.push(view, 'none');
uiRoot.canvas.style.background = '#000';

appState.setContentLibrary(await Library.load(`${baseUrl}data`));
appState.setSocialPalette(new Uint8Array(await (await fetch(`${baseUrl}data/socpal.palette`)).arrayBuffer()));
appState.setSceneRenderer(new Renderer(elementById('view'), appState.socialPalette));
appState.setSoundQueue(new SoundQueue(appState.contentLibrary));
appState.sceneRenderer.setOpts(renderOptions);
await localizer.initialize();
await expansionPacks.applyAll();

movieDocument.newMovie(); // empty doc so the view has a appState.moviePlayer before the first message

const qs = new URLSearchParams(location.search);
/** Load a movie by URL into the receiver — called for CAF 'movie' messages and
 *  the ?3mm= standalone test param. `scene`/`frame` position the playhead,
 *  `play` starts playback; errors land on the view's status line.
 *  @param {{url: string, scene?: number, frame?: number, play?: boolean}} m */
async function loadMovie(m) {
  const { url, scene, frame, play } = m;
  const err = await movieDocument.openMovieUrl(url, false); // receiver docs aren't autosaved locally
  if (err) { view.setStatus(err); return; }
  view.setStatus('');
  if (scene != null && appState.moviePlayer.movie.scenes.length)
    appState.moviePlayer.loadScene(Math.min(scene, appState.moviePlayer.movie.scenes.length - 1));
  if (frame != null && appState.moviePlayer.scene) appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst + frame - 1);
  playbackLoop.drawFrame();
  if (play !== false) { appState.soundQueue.ensure(); playbackLoop.setPlaying(true); }
}
if (qs.get('3mm')) await loadMovie({ url: qs.get('3mm'), scene: +qs.get('scene') || null, frame: +qs.get('frame') || null, play: true });

// CAF wiring — no-op when the framework script isn't present (dev standalone).
const caf = globalThis.cast?.framework;
if (caf) {
  const ctx = caf.CastReceiverContext.getInstance();
  ctx.addCustomMessageListener(CAST_NS, (e) => {
    if (e.data?.type === 'movie') loadMovie(e.data);
    else if (e.data?.type === 'play') playbackLoop.setPlaying(true);
    else if (e.data?.type === 'pause') playbackLoop.setPlaying(false);
    else if (e.data?.type === 'seek' && appState.moviePlayer?.scene) { appState.moviePlayer.gotoFrame(e.data.frame); playbackLoop.drawFrame(); }
  });
  const opts2 = new caf.CastReceiverOptions();
  opts2.disableIdleTimeout = true; // movies can sit paused for a while
  ctx.start(opts2);
}
