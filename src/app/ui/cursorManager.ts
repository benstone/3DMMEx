// Global cursor state for the canvas UI. Elements declare a `cursor` spec —
// {name,x,y} picks a .cur asset with its authored hotspot, {css} requests a
// raw CSS keyword, null falls back to the default arrow. CursorManager owns
// the rendered canvas's cursor: hover resolution, a default, a forced
// override (hidden/wait), and change-avoidance so the DOM write only
// happens when the resolved cursor actually changes.
import { cursorUrl } from '../resources.ts';
import type { Element } from './element.ts';

/** A cursor request — `{name,x,y}` is a .cur asset + hotspot, `{css}` a raw
 *  CSS cursor keyword, and null means "use the default". */
export type CursorSpec = { name: string; x?: number; y?: number } | { css: string } | null;

/** Named cursors — the original's kcrs* set (hotspots read from the .cur
 *  files) plus the CSS fallbacks the app still uses. */
export const CURSORS = {
  arrow:       { name: 'default' },              // kcrsArrow — the studio default
  pointer:     { name: 'hotspot', x: 5, y: 0 },  // kcrsHand — interactive elements
  ibeam:       { name: 'ibeam', x: 5, y: 3 },    // kcrsIBeam — text fields and boxes
  textboxCreate: { name: 'creatbox', x: 4, y: 4 }, // kcrsTboxCreate — a textbox attached to the mouse
  action:      { name: 'actions2', x: 0, y: 5 }, // kcrsActionBrowser — the action tool wand
  wait:        { name: 'wait', x: 7, y: 7 },     // busy during long operations
  crosshair:   { css: 'crosshair' },             // pending actor/prop placement
  none:        { css: 'none' },                  // hidden
} as const;

/** Build a .cur spec with its authored hotspot — the form `Element.cursor`
 *  takes for tool cursors. */
export const cur = (name: string, x = 0, y = 0): CursorSpec => ({ name, x, y });

/** Owns the canvas cursor. `apply(el)` resolves the hovered element's cursor
 *  spec (walking parents like the pointer code), `set(spec)` writes a spec
 *  directly, `setOverride` forces a cursor over everything (e.g. `none`
 *  while a textbox rides the mouse), and `reset()` re-derives the default. */
export class CursorManager {
  canvas: HTMLCanvasElement | null = null;
  /** The fallback spec when no element declares a cursor. */
  defaultSpec: CursorSpec = CURSORS.arrow;
  /** Forced cursor — beats element cursors while set. */
  override: CursorSpec = null;
  /** The last CSS string written to the canvas — avoids redundant DOM writes. */
  applied = '';

  /** Bind the rendered canvas — call once at boot. */
  attach(canvas: HTMLCanvasElement) { this.canvas = canvas; }

  /** Resolve a spec to a CSS cursor value. */
  css(spec: CursorSpec): string {
    const s = spec ?? this.defaultSpec;
    if (!s) return '';
    if ('css' in s) return s.css;
    return `url(${cursorUrl(s.name)}) ${s.x ?? 0} ${s.y ?? 0}, auto`;
  }

  /** Set a forced override (or clear it with null). */
  setOverride(spec: CursorSpec) { this.override = spec; }

  /** Recompute the canvas cursor for the element under the pointer —
   *  walks up the parent chain for the first non-null `el.cursor`. */
  apply(el: Element | null) {
    let spec: CursorSpec = this.override, e: Element | null = el;
    while (!spec && e) { spec = e.cursor; e = e.parent; }
    this.set(spec);
  }

  /** Write the resolved CSS to the canvas (a no-op when unchanged). */
  set(spec: CursorSpec) {
    const css = this.css(spec);
    if (css === this.applied) return;
    this.applied = css;
    if (this.canvas) this.canvas.style.cursor = css;
  }

  /** Drop element-derived state — pointer left the canvas or the stack emptied. */
  reset() { this.set(this.override); }
}

export const cursorManager = new CursorManager();
