import { $, B } from './res.js';
import { ui } from './ui/root.js';
import { bootView, bootShow, bootDone, bootSeg, bootSegs, bootCap } from './ui/bootview.js';
export { bootShow, bootDone, bootSeg, bootSegs, bootCap };
// --- boot splash -------------------------------------------------------------
// UTEST.CPP APP::_FInit: the Microsoft Home logo rides the early init, then the
// splash screen stays up while _FInitCrm reads the content chunkies; afterwards
// GetPortfolioDoc goes straight to the studio (autosaved doc) or the building's
// menu. index.html's #boot div is only the pre-JS "loading..." placeholder —
// removed as soon as the canvas BootView mounts below.
export const bootBar = { // shim: callers toggle .hidden like the old DOM div
  get hidden() { return bootView.progress < 0; },
  set hidden(v) { bootView.progress = v ? -1 : 0; bootView.invalidate(); },
};
export const manifestP = fetch(`${B}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export const miscSeg = bootSeg(0.08);
export let miscN = 0;
export const miscTick = (cap) => miscSeg(++miscN / 6, cap); // pal + 5 thumbnail-file fetches

ui.push(bootView, 'none'); // splash owns the canvas until bootDone() pops it
$('boot')?.remove();
