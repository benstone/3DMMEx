import { playing, setPlaying as setPlayingFlag, player, renderer, tbAttach, tbSel, sounds, modeSync } from './state.js';
import { $ } from './res.js';
import { FPS } from '../engine/player.js';
import { selActor } from './edit/movie.js';
import { selTbox, focusTbox } from './edit/tbox.js';
import { opts } from './opts.js';
import { syncStudio } from './ui-dom/studio.js';
export let timer = null;
export function updateUi() { if (player) syncStudio(); }
export function draw() {
  renderer.selActor = selActor();
  // tbox editor overlay: the border-selected box gets the TBXB frame/anchors;
  // the interior-focused box shows its cp selection + caret (they can differ —
  // TBXG interior clicks never move PtboxSelected in the original)
  const chromeTb = !playing && (tbAttach?.tb || selTbox());
  const editTb = !playing && !tbAttach && focusTbox();
  renderer.tbEd = (chromeTb || editTb)
    ? { chrome: chromeTb, tb: editTb,
        a: tbSel ? Math.min(tbSel.anchor, tbSel.other) : 0, b: tbSel ? Math.max(tbSel.anchor, tbSel.other) : 0,
        caret: tbSel && tbSel.anchor === tbSel.other ? tbSel.other : null } // caret only on a collapsed sel
    : null;
  try { renderer.render(player); } catch (e) { console.error('render:', e); } updateUi();
}


export let raf = null, acc = 0, last = 0;
export function loopTick(now) {
  if (!playing) return;
  const frameDur = 1000 / FPS;
  acc += now - last; last = now;
  while (acc >= frameDur) {
    renderer.beginFrame();
    if (!player.step()) { setPlaying(false); return; }
    acc -= frameDur;
  }
  try { renderer.render(player, acc / frameDur); } catch (e) { console.error('render:', e); }
  updateUi();
  raf = requestAnimationFrame(loopTick);
}
export function startLoop() {
  if (opts.fps24) { acc = 0; last = performance.now(); raf = requestAnimationFrame(loopTick); }
  else timer = setInterval(() => { if (!player.step()) setPlaying(false); draw(); }, 1000 / FPS);
}
export function setPlaying(p) {
  setPlayingFlag(p); clearInterval(timer); if (raf) cancelAnimationFrame(raf);
  if (p) { sounds.ensure(); startLoop(); }
  else sounds.suspend();
  const pb = $('stb_play');
  if (pb) { pb.classList.toggle('on', p); pb._sync(); }
  updateUi();
  modeSync?.(); // theatre/embed UI follows play state
}
