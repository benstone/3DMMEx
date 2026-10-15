// Render-settings easel — the in-canvas replacement for the old DOM options
// dialog, drawn in the device-picker panel style: a beveled plate with a
// title strip, category headers, checkbox rows, drag sliders, and a
// click-to-cycle selector for the AA mode. Options apply live (same fan-out
// as before); OK commits, Cancel/Esc restores the snapshot taken at open.
import { EaselView } from './easel.ts';
import { modalSlot } from './modal.ts';
import { Element } from './element.ts';
import { localizer } from '../localization.ts';
import { renderOptions, RENDER_OPTION_DEFS } from '../renderOptions.ts';
import { appState } from '../appState.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { CURSORS } from './cursorManager.ts';

const PW = 300, ROW_H = 19, CAT_H = 15;

/** opt.* label key — selfShadowOp's string lives under 'shadowOpacity'. */
const labelKey = (key) => 'opt.' + (key === 'selfShadowOp' ? 'shadowOpacity' : key);

/** Push an option change live — persist, renderer, repaint (the DOM
 *  panel's identical fan-out). */
const apply = (key, v) => {
  renderOptions[key] = v;
  localStorage.setItem('opts3dmm', JSON.stringify(renderOptions));
  appState.sceneRenderer.setOpts(renderOptions);
  if (key === 'fps24' && appState.playing) playbackLoop.setPlaying(true); // restart the loop in the new mode
  playbackLoop.drawFrame();
};

/** Panel background — the picker plate: dark fill, outer shadow + inner
 *  highlight, and a title strip. */
class PanelPlate extends Element {
  constructor(x, y, w, h, title) { super(x, y, w, h); this.title = title; this.pickable = false; }
  /** Paint the plate: drop shadow, beveled frame, title. */
  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = '#141414'; ctx.fillRect(2, 3, w, h);           // drop shadow
    ctx.fillStyle = '#3a3a3e'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0d0d0d'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = '#5c5c62'; ctx.beginPath();
    ctx.moveTo(3, h - 4); ctx.lineTo(3, 3); ctx.lineTo(w - 4, 3); ctx.stroke();
    // title strip
    ctx.fillStyle = '#26262a'; ctx.fillRect(6, 6, w - 12, 26);
    ctx.strokeStyle = '#1a1a1c'; ctx.lineWidth = 1; ctx.strokeRect(6.5, 6.5, w - 13, 25);
    ctx.fillStyle = '#d8d8dc';
    ctx.font = `bold 13px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.title, w / 2, 19);
  }
}

/** Category header — dimmed small-caps text, not interactive. */
class CatRow extends Element {
  constructor(cat, x, y, w) { super(x, y, w, CAT_H); this.cat = cat; this.pickable = false; }
  /** Paint the label. */
  draw(ctx) {
    ctx.fillStyle = '#8f8f96'; ctx.font = `9px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(localizer.translate('opt.' + this.cat).toUpperCase(), 4, this.h / 2 + 1, this.w - 8);
    ctx.strokeStyle = '#2c2c30'; ctx.beginPath();
    ctx.moveTo(2, this.h - 0.5); ctx.lineTo(this.w - 2, this.h - 0.5); ctx.stroke();
  }
}

/** Shared row drawing — hover strip + dimmed-disabled handling. */
class OptRow extends Element {
  constructor(x, y, w, enabled = () => true) {
    super(x, y, w, ROW_H);
    this.cursor = CURSORS.pointer; this.hover = false; this.enabled = enabled;
  }
  /** Paint the hover strip; subclasses draw content via `_content`. */
  draw(ctx) {
    if (this.hover && this.enabled()) { ctx.fillStyle = '#4a4a50'; ctx.fillRect(0, 0, this.w, this.h); }
    ctx.save();
    if (!this.enabled()) ctx.globalAlpha = 0.4;
    this._content(ctx);
    ctx.restore();
  }
  onPointerEnter() { this.hover = true; this.dirty(); }
  onPointerLeave() { this.hover = false; this.dirty(); }
}

/** Checkbox row — sunken box + fill + label; click toggles. */
class OptCheck extends OptRow {
  constructor(key, x, y, w, indent = 0, enabled?) {
    super(x, y, w, enabled);
    this.key = key; this.indent = indent;
  }
  /** Paint the box, the check fill, and the translated label. */
  _content(ctx) {
    const on = !!renderOptions[this.key], bx = 4 + this.indent;
    ctx.fillStyle = '#161617'; ctx.fillRect(bx, 4, 11, 11);
    ctx.strokeStyle = '#6a6a72'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, 4.5, 10, 10);
    if (on) { ctx.fillStyle = '#7db4ff'; ctx.fillRect(bx + 2, 6, 7, 7); }
    ctx.fillStyle = '#d8d8dc'; ctx.font = `12px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(localizer.translate(labelKey(this.key)), bx + 17, this.h / 2 + 1, this.w - bx - 20);
  }
  onClick() { if (!this.enabled()) return; apply(this.key, !renderOptions[this.key]); this.dirty(); }
}

/** Slider row — label + sunken track + raised thumb; drag maps 0..1 →
 *  min..max percent (values store as fractions like the DOM panel). */
class OptSlider extends OptRow {
  constructor(key, min, max, x, y, w, indent = 0, enabled?) {
    super(x, y, w, enabled);
    this.key = key; this.min = min; this.max = max; this.indent = indent;
    this._drag = false;
  }
  /** The track's left edge and width. */
  get tx() { return 118 + this.indent; }
  get tw() { return this.w - this.tx - 8; }
  /** Paint label, current %, track, and thumb at the option's fraction. */
  _content(ctx) {
    const f = Math.max(0, Math.min(1, renderOptions[this.key] * 100 / (this.max - this.min) - this.min / (this.max - this.min)));
    ctx.fillStyle = '#d8d8dc'; ctx.font = `11px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(localizer.translate(labelKey(this.key)), 4 + this.indent, this.h / 2 + 1, this.tx - 12 - this.indent);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(renderOptions[this.key] * 100) + '%', this.tx - 6, this.h / 2 + 1);
    const ty = (this.h - 10) / 2;
    ctx.fillStyle = '#161617'; ctx.fillRect(this.tx, ty, this.tw, 10);
    ctx.strokeStyle = '#6a6a72'; ctx.strokeRect(this.tx + 0.5, ty + 0.5, this.tw - 1, 9);
    const cx = this.tx + f * (this.tw - 10);
    ctx.fillStyle = '#8a8a92'; ctx.fillRect(cx, ty + 1, 9, 8);
    ctx.strokeStyle = '#c8c8ce'; ctx.strokeRect(cx + 0.5, ty + 1.5, 8, 7);
  }
  onPointerDown(p) { if (this.enabled()) { this._drag = true; this._move(p); } return true; }
  onPointerMove(p) { if (this._drag) this._move(p); }
  onPointerUp() { this._drag = false; }
  /** Map a view-space x to the percent range and apply it. */
  _move(p) {
    const f = Math.max(0, Math.min(1, (p.x - (this.x + this.tx) - 5) / (this.tw - 10)));
    apply(this.key, (this.min + f * (this.max - this.min)) / 100);
    this.dirty();
  }
}

/** Cycle row — click steps a 'sel' option through its value list. */
class OptCycle extends OptRow {
  constructor(key, opts, x, y, w, indent = 0, enabled?) {
    super(x, y, w, enabled);
    this.key = key; this.opts = opts; this.indent = indent;
  }
  /** Paint label + current selection with step arrows. */
  _content(ctx) {
    const cur = this.opts.find(([v]) => String(v) === String(renderOptions[this.key])) || this.opts[0];
    ctx.font = `11px 'Comic Sans MS', cursive, sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d8d8dc'; ctx.textAlign = 'left';
    ctx.fillText(localizer.translate(labelKey(this.key)), 4 + this.indent, this.h / 2 + 1);
    ctx.fillStyle = '#9fc4ff'; ctx.textAlign = 'right';
    ctx.fillText('‹ ' + localizer.translate('opt.' + cur[1]) + ' ›', this.w - 8, this.h / 2 + 1);
  }
  onClick() {
    if (!this.enabled()) return;
    const i = this.opts.findIndex(([v]) => String(v) === String(renderOptions[this.key]));
    apply(this.key, this.opts[(i + 1) % this.opts.length][0]);
    this.dirty();
  }
}

/** The render-settings easel — rows generated from RENDER_OPTION_DEFS. */
export class OptionsEasel extends EaselView {
  static show = () => modalSlot.open(new OptionsEasel());
  /** Build the panel, rows, and OK/Cancel — snapshotting options for revert. */
  constructor() {
    super();
    this._snapshot = structuredClone(renderOptions);
    this._committed = false;
    const rows = [];
    for (const [cat, defs] of RENDER_OPTION_DEFS) {
      rows.push({ cat });
      for (const [key, , kind, opts] of defs) {
        if (!key) continue;
        if (kind === 'range') rows.push({ key, slider: opts });
        else {
          rows.push({ key });
          for (const [skey, , smin, smax] of (kind || []))
            rows.push({ key: skey, sub: key, sel: smin === 'sel' ? smax : smin === undefined ? null : null, slider: smin !== undefined && smin !== 'sel' ? [smin, smax] : null, check: smin === undefined });
        }
      }
    }
    const ch = rows.length * ROW_H, ph = 40 + ch + 60;
    const px = (640 - PW) / 2, py = (480 - ph) / 2;
    this.add(new PanelPlate(px, py, PW, ph, localizer.translate('ui.renderSettings')));
    rows.forEach((r, i) => {
      const y = py + 38 + i * ROW_H;
      if (r.cat) this.add(new CatRow(r.cat, px + 16, y, PW - 32));
      else {
        const en = r.sub ? () => !!renderOptions[r.sub] : undefined;
        const ind = r.sub ? 14 : 0;
        if (r.slider) this.add(new OptSlider(r.key, r.slider[0], r.slider[1], px + 16, y, PW - 32, ind, en));
        else if (r.sel) this.add(new OptCycle(r.key, r.sel, px + 16, y, PW - 32, ind, en));
        else this.add(new OptCheck(r.key, px + 16, y, PW - 32, ind, en));
      }
    });
    this.makeButton('okay', 'okayc', px + PW - 124, py + ph - 54, 50, 48, () => { this._committed = true; modalSlot.close(); });
    this.makeButton('cancel', 'cancelc', px + PW - 66, py + ph - 54, 50, 48, modalSlot.close);
  }

  /** Closing without OK restores the open-time snapshot (Cancel/Esc). */
  onModalClose() {
    if (this._committed) return;
    Object.assign(renderOptions, this._snapshot);
    localStorage.setItem('opts3dmm', JSON.stringify(renderOptions));
    appState.sceneRenderer.setOpts(renderOptions);
    if (appState.playing) playbackLoop.setPlaying(true);
    playbackLoop.drawFrame();
  }
}
