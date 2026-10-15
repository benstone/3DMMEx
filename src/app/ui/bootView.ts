// Boot splash view — replaces the #boot DOM overlay. Draws the homelogo /
// splash art cover-fit, with the progress bar + caption once segment() is armed.
import { View, UI_WIDTH, UI_HEIGHT, uiRoot } from './root.ts';
import { Element } from './element.ts';
import { textureCache } from './textureCache.ts';
import { localizer } from '../localization.ts';

/** Boot splash — owns the canvas until `done()` pops it; `show(name)` swaps
 *  art, `segment(weight)` arms weighted progress tickers. */
class BootView extends View {
  /** Build the art + progress-bar elements. */
  constructor() {
    super();
    this.interactive = true; // swallow clicks while booting
    this.art = 'homelogo';
    this.progress = -1;  // <0 hidden
    this.caption = '';
    this.artEl = new class extends Element {
      constructor() { super(0, 0, UI_WIDTH, UI_HEIGHT); this.pickable = false; }
      /** Paint the splash art cover-fit (placeholder text while it decodes). */
      draw(ctx) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.w, this.h);
        const image = textureCache.image(this._root.art, () => this._root.invalidate());
        if (!textureCache.isReady(image)) { // text placeholder until the art lands
          ctx.fillStyle = '#ccc'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('loading...', this.w / 2, this.h / 2);
          return;
        }
        ctx.imageSmoothingEnabled = false;
        const s = Math.max(this.w / image.naturalWidth, this.h / image.naturalHeight);
        const w = image.naturalWidth * s, h = image.naturalHeight * s;
        ctx.drawImage(image, (this.w - w) / 2, (this.h - h) / 2, w, h);
      }
    };
    this.artEl._root = this;
    this.add(this.artEl);
    this.add(new class extends Element { // progress bar + caption, bottom-center
      constructor() { super(0, 0, UI_WIDTH, UI_HEIGHT); this.pickable = false; }
      /** Paint the progress bar + caption (nothing while progress < 0). */
      draw(ctx) {
        const r = this._root;
        if (r.progress < 0) return;
        const bw = 260, bh = 14, bx = (UI_WIDTH - bw) / 2, by = UI_HEIGHT - 60;
        ctx.fillStyle = '#000a'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#6a5'; ctx.fillRect(bx, by, bw * Math.min(1, r.progress), bh);
        if (r.caption) {
          ctx.fillStyle = '#eee'; ctx.font = "12px 'Comic Sans MS', cursive, sans-serif";
          ctx.textAlign = 'center'; ctx.fillText(r.caption, UI_WIDTH / 2, by + bh + 16);
        }
      }
    })._root = this;
  }

  segments: { w: number; f: number }[] = [];

  /** Swap the splash art ('homelogo' | 'splash'). */
  show = (name) => { this.art = name; this.invalidate(); };

  /** Dismiss the splash — fades the canvas BootView off the stack. */
  done = () => uiRoot.pop('fade');

  /** Arm a weighted progress segment; returns a ticker (fraction, caption?). */
  segment = (w) => {
    const s = { w, f: 0 };
    this.segments.push(s);
    return (f, cap?) => {
      if (f > s.f) s.f = Math.min(1, f);
      const tot = this.segments.reduce((a, x) => a + x.w * x.f, 0) / this.segments.reduce((a, x) => a + x.w, 0);
      this.progress = tot;
      if (cap != null) this.caption = cap;
      this.invalidate();
    };
  };

  /** Setter shim for callers that assigned the old DOM caption's textContent. */
  captionEl = { set textContent(v) { bootView.caption = v; bootView.invalidate(); } };
}

export const bootView = new BootView();
