import { docDB, openUrl, posGet, newMovie, open } from './app/doc.js';
import { setPlaying, draw } from './app/loop.js';
import { bootSeg, manifestP, bootShow, bootBar, miscTick, bootDone } from './app/boot.js';
import { opts, optCbs } from './app/opts.js';
import { applyPacks, packNotes } from './app/packs.js';
import { loadUserSnds } from './app/sndsrc.js';
import { loadBuiltinThumbs } from './app/thumbs.js';
import { showOptsDlg } from './app/ui-dom/browsers.js';
import { enterTheatre, enterEmbed } from './app/ui-dom/modes.js';
import { initStudio } from './app/ui-dom/studio.js';
import { guideTip } from './app/ui-dom/tips.js';
// 3DMM Web — boot orchestrator. Everything else lives in src/app/: state
// (shared lets+setters), res (paths/DOM helpers), undo, boot (splash), packs
// (?packs= expansions), thumbs (.3th scan), doc (open/save/autosave), loop
// (play loop + draw), opts (render settings), sndsrc (sound browsers),
// edit/ (movie/sound/tbox mutations), ui-dom/ (studio, browsers, easels,
// bio, tips, theatre/embed modes).
import { Library, CONTENT_FILES } from './engine/library.js';
import { SoundQueue } from './engine/sound.js';
import { Renderer } from './render/renderer.js';
import { B, $, sleep, say } from './app/res.js';
import { lib, pal, renderer, sounds, player, playing,
  setLib, setPal, setRenderer, setSounds } from './app/state.js';


/* @@boot.js:25@@ */
/* @@packs.js:53@@ */
const warmSeg = bootSeg(0.18);
manifestP.then(async (manifest) => {
  const files = [...(manifest?.textures ?? []).map((f) => `textures/${f}`), ...(manifest?.cur ?? []).map((f) => `cur/${f}`)];
  if (!files.length) return warmSeg(1);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (i < files.length) {
      const f = files[i++];
      try { await (await fetch(`${B}${f}`)).blob(); } catch { /* lazy loads retry */ }
      warmSeg(++done / files.length, 'warming up');
    }
  }));
}).catch(() => {});
bootShow('homelogo'); // _FDisplayHomeLogo — the original's first screen
const bootT0 = performance.now();

const libSeg = bootSeg(0.74);
const libPart = new Map(); // per-.3CN byte fraction
await sleep(Math.max(0, 700 - (performance.now() - bootT0))); // a beat on the logo (kdtsHomeLogo)
bootShow('splash'); bootBar.hidden = false;
const splashT0 = performance.now();
setLib(await Library.load(`${B}data`, (n, got, tot) => {
  libPart.set(n, tot ? got / tot : 1);
  libSeg([...libPart.values()].reduce((a, b) => a + b, 0) / CONTENT_FILES.length, `loading ${n.toLowerCase()}`);
}));
/* @@boot.js:95@@ */
setPal(new Uint8Array(await (await fetch(`${B}data/socpal.pal`)).arrayBuffer()));
miscTick('loading palette');
setRenderer(new Renderer($('view'), pal));
setSounds(new SoundQueue(lib));

await loadBuiltinThumbs();
await applyPacks();
/* @@thumbs.js:200@@ */
// --- editor undo/redo moved to app/undo.js

/* @@edit/movie.js:255@@ */
/* @@edit/sound.js:382@@ */
/* @@sndsrc.js:473@@ */
/* @@edit/sound.js:481@@ */
/* @@edit/tbox.js:525@@ */
/* @@loop.js:726@@ */
/* @@opts.js:742@@ */
/* @@loop.js:747@@ */
/* @@opts.js:775@@ */
renderer.setOpts(opts);
/* @@doc.js:873@@ */
initStudio();
/* @@ui-dom/browsers.js:2290@@ */
/* @@sndsrc.js:2305@@ */
/* @@thumbs.js:2408@@ */
/* @@ui-dom/browsers.js:2423@@ */
/* @@ui-dom/easels.js:2578@@ */
/* @@ui-dom/bio.js:3326@@ */
/* @@ui-dom/tips.js:3378@@ */
/* @@ui-dom/modes.js:3504@@ */
document.addEventListener('keydown', (e) => { // Space = play/pause in theatre/embed (editor owns Space for tbox typing)
  if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!document.getElementById('theatre') && !document.getElementById('embed')) return;
  if (!player?.movie?.scenes.length) return;
  e.preventDefault();
  setPlaying(!playing);
});

const qs = new URLSearchParams(location.search);
if (qs.get('opts')) { for (const k of qs.get('opts').split(',')) if (typeof opts[k] === 'boolean') { opts[k] = true; if (optCbs[k]) { optCbs[k].checked = true; if (optCbs[k]._sub) optCbs[k]._sub.hidden = false; } } renderer.setOpts(opts); }
if (qs.has('menu')) setTimeout(showOptsDlg, 600);
// startup mirrors the original: GetPortfolioDoc -> FLoadMovie(pfniUserDoc) — the
// autosaved working doc opens straight into the studio; no doc -> FLoadMovie()
// blank doc. ?3mm=url loads a remote movie, replacing the working doc on success;
// on failure we fall back to the normal boot and show the error after the splash.
let booted = false, bootErr = null;
const remoteMovie = qs.get('3mm');
if (remoteMovie) {
  bootErr = await openUrl(remoteMovie); // a loaded remote movie becomes the working doc
  booted = !bootErr;
}
if (!booted) {
  const doc = await docDB.get(), pos = posGet(); // pos first — open()'s loadScene(0) overwrites it
  if (doc?.bytes?.length) {
    booted = open(doc.bytes, doc.name || 'autosave.3mm');
    if (booted) { // return to the last scene+frame seen — the fresher of pos (nav) vs doc rec (flush)
      const rec = (pos?.t ?? 0) >= (doc.t ?? 0) ? pos : doc; // scene+frame stay consistent per source
      if (rec?.scene >= 0) player.loadScene(Math.min(rec.scene, player.movie.scenes.length - 1));
      if (rec?.frame != null) player.gotoFrame(rec.frame);
      draw(); // repositioning happened after open()'s draw
    }
    if (!booted) console.warn('[autosave] cached movie failed to open — starting a new movie');
  }
}
await sleep(Math.max(0, 500 - (performance.now() - splashT0))); // don't flash the splash on a warm cache (kdtsSplashScreen, scaled way down)
if (!booted) newMovie(); // straight to the editor — no menu
bootDone();
[bootErr, ...packNotes].filter(Boolean).forEach((n, i) => setTimeout(() => say(n), 400 + i * 3400)); // toasts after the splash fades
const bootMode = qs.get('mode');
if (bootMode === 'theatre' || bootMode === 'embed') { // cinema/embed views instead of the editor (works for the autosaved doc too, so the studio's theatre link can open it)
  (bootMode === 'theatre' ? enterTheatre : enterEmbed)();
  if (player.movie.scenes.length) setTimeout(() => setPlaying(true), 500); // showtime
} else if (!player.movie.scenes.length) setTimeout(guideTip, 450); // first-boot: point at Add Scene once the splash fades
loadUserSnds();
if (player && qs.get('scene')) { player.loadScene(+qs.get('scene')); draw(); }
if (player?.scene && qs.get('frame')) { player.gotoFrame(player.scene.nfrmFirst + (+qs.get('frame')) - 1); draw(); }
if (player && qs.has('play')) { sounds.ensure(); setPlaying(true); }
