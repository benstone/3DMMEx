import { elementById, baseUrl } from './resources.ts';
import { uiRoot } from './ui/root.ts';
import { bootView } from './ui/bootView.ts';
// Boot splash orchestration — the splash stays up while the content files
// load; afterwards the app goes straight to
// the studio (autosaved doc) or the building menu. index.html's #boot div is
// only the pre-JS "loading..." placeholder — removed as soon as the canvas
// BootView mounts below.
/** Boot-progress bookkeeping — the manifest fetch plus the misc segment the
 *  palette + thumbnail loads tick through. */
export class BootSequence {
  /** Shim: callers toggle .hidden like the old DOM progress div. */
  progressBar = {
    get hidden() { return bootView.progress < 0; },
    set hidden(v) { bootView.progress = v ? -1 : 0; bootView.invalidate(); },
  };

  /** Texture manifest fetch — resolves the manifest JSON or null. */
  manifestPromise = fetch(`${baseUrl}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  miscTickCount = 0;
  miscSegment = bootView.segment(0.08);
  /** Advance the misc-load segment — the palette + 5 thumbnail-file fetches
   *  tick this to completion. */
  advanceMiscTick = (cap) => this.miscSegment(++this.miscTickCount / 6, cap);
}

export const bootSequence = new BootSequence();

uiRoot.push(bootView, 'none'); // splash owns the canvas until bootView.done() pops it
elementById('boot')?.remove();
