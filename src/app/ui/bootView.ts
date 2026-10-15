// Boot splash view — replaces the #boot DOM overlay. Draws the splash art
// cover-fit, with the progress bar + caption once segment() is armed.
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
    this.art = 'splash';
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
      /** Paint the progress bar + caption (nothing while progress < 0). The
       *  bar sits at 27%/72% like the shipped boot — the gap between the
       *  film-strip art and the credits block. */
      draw(ctx) {
        const r = this._root;
        if (r.progress < 0) return;
        const bw = 294, bh = 16, bx = 173, by = 346; // left 27%, top 72% of 640x480
        ctx.fillStyle = '#0c0c0c'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#0a56c8'; ctx.fillRect(bx, by, bw * Math.min(1, r.progress), bh);
        ctx.strokeStyle = '#555'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1); // sunken bevel: dark top/left...
        ctx.strokeStyle = '#d8d8d8'; ctx.beginPath(); ctx.moveTo(bx + bw - 0.5, by + 0.5); ctx.lineTo(bx + bw - 0.5, by + bh - 0.5); ctx.lineTo(bx + 0.5, by + bh - 0.5); ctx.stroke(); // ...light bottom/right
        if (r.caption) {
          ctx.fillStyle = '#666'; ctx.font = "bold 13px 'Comic Sans MS', cursive, sans-serif";
          ctx.textAlign = 'center'; ctx.fillText(r.caption, UI_WIDTH / 2, by + bh + 22);
        }
      }
    })._root = this;
  }

  segments: { w: number; f: number }[] = [];

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
