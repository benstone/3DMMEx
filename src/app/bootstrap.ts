import { elementById, baseUrl } from './resources.ts';
import { uiRoot } from './ui/root.ts';
import { bootView } from './ui/bootView.ts';
// --- boot splash -------------------------------------------------------------
// UTEST.CPP APP::_FInit: the Microsoft Home logo rides the early init, then the
// splash screen stays up while _FInitCrm reads the content chunkies; afterwards
// GetPortfolioDoc goes straight to the studio (autosaved doc) or the building's
// menu. index.html's #boot div is only the pre-JS "loading..." placeholder —
// removed as soon as the canvas BootView mounts below.
export class BootSequence {
  /** Shim: callers toggle .hidden like the old DOM progress div. */
  progressBar = {
    get hidden() { return bootView.progress < 0; },
    set hidden(v) { bootView.progress = v ? -1 : 0; bootView.invalidate(); },
  };

  manifestPromise = fetch(`${baseUrl}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  miscTickCount = 0;
  miscSegment = bootView.segment(0.08);
  advanceMiscTick = (cap) => this.miscSegment(++this.miscTickCount / 6, cap); // socialPalette + 5 thumbnail-file fetches
}

export const bootSequence = new BootSequence();

uiRoot.push(bootView, 'none'); // splash owns the canvas until bootView.done() pops it
elementById('boot')?.remove();
