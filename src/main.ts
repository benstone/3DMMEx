import { movieDocument } from './app/movieDocument.ts';
import { playbackLoop } from './app/playbackLoop.ts';
import { bootSequence } from './app/bootstrap.ts';
import { bootView } from './app/ui/bootView.ts';
import { renderOptions, renderOptionsPanel } from './app/renderOptions.ts';
import { expansionPacks } from './app/expansionPacks.ts';
import { soundSources} from './app/soundSources.ts';
import { thumbnails } from './app/thumbnails.ts';
import { optionsDialog } from './app/ui/optionsDialog.ts';
import { TheatreView, EmbedView } from './app/ui/theatre.ts';
import { studioHost } from './app/ui/studio.ts';
import { injectAppStyles } from './app/ui/styles.ts';
import { textureCache } from './app/ui/textureCache.ts';
import { tooltips } from './app/ui/tooltips.ts';
// 3DMM Web — boot orchestrator. The app lives in src/app/ (state, resources,
// editHistory, bootstrap, expansion packs, thumbnails, movieDocument,
// playbackLoop, renderOptions, soundSources, edit/ mutations) and
// src/app/ui/ (studio, browsers, easels, bio, tooltips, theatre/embed).
import { Library, CONTENT_FILES } from './engine/library.ts';
import { SoundQueue } from './engine/sound.ts';
import { Renderer } from './render/renderer.ts';
import { baseUrl, elementById, sleep, toastHost } from './app/resources.ts';
import { appState } from './app/appState.ts';
import { localizer } from './app/localization.ts';


// --- boot: splash, texture warm, content library -------------------------------
injectAppStyles();
const warmupProgress = bootView.segment(0.18);
bootSequence.manifestPromise.then(async (manifest) => {
  const files = [...(manifest?.textures ?? []).map((f) => `textures/${f}`), ...(manifest?.cur ?? []).map((f) => `cur/${f}`)];
  if (!files.length) return warmupProgress(1);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < files.length) {
      const f = files[i++];
      try {
        // PNGs are decoded into the textureImage cache (not just fetched) so first
        // paint never flickers on a half-decoded Image; cursors stay fetch-only.
        if (f.endsWith('.png') && f.startsWith('textures/')) await textureCache.warm(f.slice(9, -4));
        else await (await fetch(`${baseUrl}${f}`)).blob();
      } catch { /* lazy loads retry */ }
      warmupProgress(++done / files.length, localizer.translate('boot.loading'));
    }
  }));
}).catch(() => {});
bootView.show('homelogo'); // the logo rides the early init
const bootT0 = performance.now();

const libraryProgress = bootView.segment(0.74);
const libraryParts = new Map(); // per-.3CN byte fraction
await sleep(Math.max(0, 700 - (performance.now() - bootT0))); // hold the logo for a beat
bootView.show('splash'); bootSequence.progressBar.hidden = false;
const splashT0 = performance.now();
appState.setContentLibrary(await Library.load(`${baseUrl}data`, (n, got, tot) => {
  libraryParts.set(n, tot ? got / tot : 1);
  libraryProgress([...libraryParts.values()].reduce((a, b) => a + b, 0) / CONTENT_FILES.length, `loading ${n.toLowerCase()}`);
}));
appState.setSocialPalette(new Uint8Array(await (await fetch(`${baseUrl}data/socpal.palette`)).arrayBuffer()));
bootSequence.advanceMiscTick(localizer.translate('boot.palette'));
appState.setSceneRenderer(new Renderer(elementById('view'), appState.socialPalette));
appState.setSoundQueue(new SoundQueue(appState.contentLibrary));

await thumbnails.loadBuiltinThumbnails();
await expansionPacks.applyAll();

// --- editor: renderer options, strings, then the studio itself -----------------
appState.sceneRenderer.setOpts(renderOptions);
await localizer.initialize(); // the ?lang= dictionary loads before any UI strings bake
studioHost.initialize();
document.addEventListener('keydown', (e) => { // Space = play/pause in theatre/embed (the editor owns Space for textbox typing)
  if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!document.getElementById('theatre') && !document.getElementById('embed')) return;
  if (!appState.moviePlayer?.movie?.scenes.length) return;
  e.preventDefault();
  playbackLoop.setPlaying(!appState.playing);
});

// --- URL params: render options, menu, movie source, theatre/embed ------------
const queryParams = new URLSearchParams(location.search);
if (queryParams.get('renderOptions')) { for (const k of queryParams.get('renderOptions').split(',')) if (typeof renderOptions[k] === 'boolean') { renderOptions[k] = true; if (renderOptionsPanel.controls[k]) { renderOptionsPanel.controls[k].checked = true; if (renderOptionsPanel.controls[k]._sub) renderOptionsPanel.controls[k]._sub.hidden = false; } } appState.sceneRenderer.setOpts(renderOptions); }
if (queryParams.has('menu')) setTimeout(optionsDialog.show, 600);
// Startup: the autosaved working doc opens straight into the studio; no doc
// means a blank movie. ?3mm=url loads a remote movie, replacing the working doc
// on success; on failure we fall back to the normal boot and show the error
// after the splash.
let bootComplete = false, bootError = null;
const remoteMovie = queryParams.get('3mm');
if (remoteMovie) {
  bootError = await movieDocument.openMovieUrl(remoteMovie); // a loaded remote movie becomes the working doc
  bootComplete = !bootError;
}
if (!bootComplete) {
  const doc = await movieDocument.documentDatabase.get(), pos = movieDocument.savedPlaybackPosition(); // pos first — movieDocument.openMovie()'s loadScene(0) overwrites it
  if (doc?.bytes?.length) {
    try { bootComplete = movieDocument.openMovie(doc.bytes, doc.name || 'autosave.3mm'); } // open() catches only the
    catch (e) { console.warn('[autosave] restore threw:', e); }  // ctor — guard the rest too
    if (bootComplete) { // return to the last scene+frame seen — the fresher of pos (nav) vs doc rec (flush)
      const rec = (pos?.t ?? 0) >= (doc.t ?? 0) ? pos : doc; // scene+frame stay consistent per source
      if (rec?.scene >= 0) appState.moviePlayer.loadScene(Math.min(rec.scene, appState.moviePlayer.movie.scenes.length - 1));
      if (rec?.frame != null) appState.moviePlayer.gotoFrame(rec.frame);
      playbackLoop.drawFrame(); // repositioning happened after movieDocument.openMovie()'s draw
    }
    if (!bootComplete) console.warn('[autosave] cached movie failed to open — starting a new movie');
  }
}
await sleep(Math.max(0, 500 - (performance.now() - splashT0))); // keep the splash up briefly so it doesn't flash
if (!bootComplete) movieDocument.newMovie(); // straight to the editor — no menu
bootView.done();
[bootError, ...expansionPacks.packNotes].filter(Boolean).forEach((n, i) => setTimeout(() => toastHost.show(n), 400 + i * 3400)); // toasts after the splash fades
const bootMode = queryParams.get('mode');
if (bootMode === 'theatre' || bootMode === 'embed') { // cinema/embed views instead of the editor (works for the autosaved doc too, so the studio's theatre link can open it)
  (bootMode === 'theatre' ? TheatreView.enter : EmbedView.enter)();
  if (appState.moviePlayer.movie.scenes.length) setTimeout(() => playbackLoop.setPlaying(true), 500); // showtime
} else if (!appState.moviePlayer.movie.scenes.length) setTimeout(tooltips.showGuideTip, 450); // first-boot: point at Add Scene once the splash fades
soundSources.loadUserSounds();
if (appState.moviePlayer && queryParams.get('scene')) { appState.moviePlayer.loadScene(+queryParams.get('scene')); playbackLoop.drawFrame(); }
if (appState.moviePlayer?.scene && queryParams.get('frame')) { appState.moviePlayer.gotoFrame(appState.moviePlayer.scene.nfrmFirst + (+queryParams.get('frame')) - 1); playbackLoop.drawFrame(); }
if (appState.moviePlayer && queryParams.has('play')) { appState.soundQueue.ensure(); playbackLoop.setPlaying(true); }
