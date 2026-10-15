// CAF receiver entry (receiver.html) — minimal boot: no studio, no editor.
// Loads the app stack, pushes a ReceiverView, then takes movies over the CAF
// custom namespace (or ?3mm= for standalone testing). This is the Chromecast
// app backend for the stream picker — AirPlay/Remote Playback don't use it.
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
import { ReceiverView } from './app/ui/receiverView.ts';
import { injectAppStyles } from './app/ui/styles.ts';
import { CAST_NS } from './app/stream.ts';

injectAppStyles();
document.getElementById('boot').remove(); // receiver shows the canvas immediately
document.getElementById('studio').style.height = '100vh'; // receiver fills the TV viewport
const view = new ReceiverView();
uiRoot.push(view, 'none');
uiRoot.canvas.style.background = '#000';

appState.setContentLibrary(await Library.load(`${baseUrl}data`));
appState.setSocialPalette(new Uint8Array(await (await fetch(`${baseUrl}data/socpal.pal`)).arrayBuffer()));
appState.setSceneRenderer(new Renderer(elementById('view'), appState.socialPalette));
appState.setSoundQueue(new SoundQueue(appState.contentLibrary));
appState.sceneRenderer.setOpts(renderOptions);
await localizer.initialize();
await expansionPacks.applyAll();

movieDocument.newMovie(); // empty doc so the view has a appState.moviePlayer before the first message

const qs = new URLSearchParams(location.search);
/** Position the playhead per a cast message and start (or hold) playback. */
function applyPos(m) {
  if (m.scene != null && appState.moviePlayer.movie.scenes.length)
    appState.moviePlayer.loadScene(Math.min(m.scene, appState.moviePlayer.movie.scenes.length - 1));
  if (m.frame != null && appState.moviePlayer.scene) appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst + m.frame - 1);
  playbackLoop.drawFrame();
  if (m.play !== false) { appState.soundQueue.ensure(); playbackLoop.setPlaying(true); }
}
/** Load a movie by URL — for CAF/Presentation 'movie' messages and the ?3mm=
 *  standalone test param; errors land on the view's status line. */
async function loadMovie(m) {
  const err = await movieDocument.openMovieUrl(m.url, false); // receiver docs aren't autosaved locally
  if (err) { view.setStatus(err); return; }
  view.setStatus('');
  applyPos(m);
}
/** Load a movie from serialized bytes — Presentation connections carry the
 *  doc itself, so local/autosaved movies cast without a hosted URL. */
function loadMovieBytes(buf, m) {
  if (movieDocument.openMovie(buf, m.name || 'cast.3mm', false) === false) { view.setStatus(localizer.translate('ui.castFailed')); return; }
  view.setStatus('');
  applyPos(m);
}
/** Shared command handler — CAF messages arrive as objects, Presentation
 *  messages as JSON strings; 'movieBytes' arms the next binary payload. */
let pendingBytes = null;
function onCastMessage(m) {
  if (m?.type === 'movie') loadMovie(m);
  else if (m?.type === 'movieBytes') pendingBytes = m;
  else if (m?.type === 'play') playbackLoop.setPlaying(true);
  else if (m?.type === 'pause') playbackLoop.setPlaying(false);
  else if (m?.type === 'seek' && appState.moviePlayer?.scene) { appState.moviePlayer.gotoFrame(m.frame); playbackLoop.drawFrame(); }
}
if (qs.get('3mm')) await loadMovie({ url: qs.get('3mm'), scene: +qs.get('scene') || null, frame: +qs.get('frame') || null, play: true });

// CAF wiring — no-op when the framework script isn't present (dev standalone).
const caf = globalThis.cast?.framework;
if (caf) {
  const ctx = caf.CastReceiverContext.getInstance();
  ctx.addCustomMessageListener(CAST_NS, (e) => onCastMessage(e.data));
  const opts2 = new caf.CastReceiverOptions();
  opts2.disableIdleTimeout = true; // movies can sit paused for a while
  ctx.start(opts2);
}

// Presentation API — Chrome's built-in page cast: the sender opens this page
// on the device and streams commands/movie bytes over the connection.
const pres = (navigator as any).presentation?.receiver;
if (pres) {
  pres.connectionList.then((list) => {
    const wire = (conn) => {
      conn.onmessage = (e) => {
        if (typeof e.data === 'string') { try { onCastMessage(JSON.parse(e.data)); } catch { /* not ours */ } }
        else if (pendingBytes) { const m = pendingBytes; pendingBytes = null; loadMovieBytes(e.data, m); }
      };
    };
    (list.connections || []).forEach(wire);
    list.addEventListener('connectionavailable', (e) => wire(e.connection));
  });
}
