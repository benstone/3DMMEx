// Boot splash view — replaces the #boot DOM overlay. Draws the homelogo /
// splash art cover-fit, with the progress bar + caption once bootSeg is armed.
import { View, UI_W, UI_H, ui } from './root.ts';
import { Element } from './element.ts';
import { texImg, imgReady } from './img.ts';
import { t } from '../i18n.ts';

class BootView extends View {
  constructor() {
    super();
    this.interactive = true; // swallow clicks while booting
    this.art = 'homelogo';
    this.progress = -1;  // <0 hidden
    this.caption = '';
    this.artEl = new class extends Element {
      constructor() { super(0, 0, UI_W, UI_H); this.pickable = false; }
      draw(ctx) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.w, this.h);
        const im = texImg(this._root.art, () => this._root.invalidate());
        if (!imgReady(im)) { // text placeholder until art lands (was index.html "loading...")
          ctx.fillStyle = '#ccc'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('loading...', this.w / 2, this.h / 2);
          return;
        }
        ctx.imageSmoothingEnabled = false;
        const s = Math.max(this.w / im.naturalWidth, this.h / im.naturalHeight);
        const w = im.naturalWidth * s, h = im.naturalHeight * s;
        ctx.drawImage(im, (this.w - w) / 2, (this.h - h) / 2, w, h);
      }
    };
    this.artEl._root = this;
    this.add(this.artEl);
    this.add(new class extends Element { // progress bar + caption, bottom-center
      constructor() { super(0, 0, UI_W, UI_H); this.pickable = false; }
      draw(ctx) {
        const r = this._root;
        if (r.progress < 0) return;
        const bw = 260, bh = 14, bx = (UI_W - bw) / 2, by = UI_H - 60;
        ctx.fillStyle = '#000a'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#6a5'; ctx.fillRect(bx, by, bw * Math.min(1, r.progress), bh);
        if (r.caption) {
          ctx.fillStyle = '#eee'; ctx.font = "12px 'Comic Sans MS', cursive, sans-serif";
          ctx.textAlign = 'center'; ctx.fillText(r.caption, UI_W / 2, by + bh + 16);
        }
      }
    })._root = this;
  }
}

export const bootView = new BootView();

// Same API boot.js used to expose — re-implemented on the canvas view.
export const bootShow = (name) => { bootView.art = name; bootView.invalidate(); };
export const bootDone = () => ui.pop('fade');
export const bootSegs = [];
export const bootSeg = (w) => {
  const s = { w, f: 0 };
  bootSegs.push(s);
  return (f, cap?) => {
    if (f > s.f) s.f = Math.min(1, f);
    const tot = bootSegs.reduce((a, x) => a + x.w * x.f, 0) / bootSegs.reduce((a, x) => a + x.w, 0);
    bootView.progress = tot;
    if (cap != null) bootView.caption = cap;
    bootView.invalidate();
  };
};
export const bootCap = { // setter shim for callers that assigned textContent
  set textContent(v) { bootView.caption = v; bootView.invalidate(); },
};
