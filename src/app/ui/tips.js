import { playing, player } from '../state.js';
import { B } from '../res.js';
import { ui, UI_W, UI_H } from './root.js';
import { Element } from './element.js';
import { t } from '../i18n.js';
// --- callout tips (the original's HBAL: kgobCalloutBalloonN — a cobllnN.bmp
// skin tiled by GORT with the red arrow baked in; reg point = the arrow tip.
// Dwell on a control to get its tip (suppressed while playing, like the
// original pushing kpridToolTipDelay to 0x0FFFFFFF during FCmdPlay)) ---------
export const COBLN = { // bmp w,h, arrow-tip reg (x,y), borders LTRB, horz+vert tile rows
  0: [167, 122,  83,  61,  5,  4,  5,  4, [8, 151, 8, 0,  0,  0, 8], [8, 106, 8, 0,  0,  0, 8]],
  1: [190, 143,   1,   1, 29, 28,  8,  8, [36, 146, 8, 0,  0,  0, 8], [32, 103, 8, 0,  0,  8]],
  2: [168, 156,  83,   1,  4, 41,  8,  8, [8,  58,  8, 35, 60, 8, 8], [42, 108, 8, 0,  0,  0, 8]],
  3: [191, 145, 189,   2,  4, 30, 32,  8, [8, 147, 8, 0,  0, 0, 36], [34, 103, 4, 0,  0,  0, 8]],
  4: [204, 122, 201,  65,  4,  3, 46,  8, [8, 148, 8, 0,  0, 0, 48], [8,  40, 4, 34, 40, 4, 8]],
  5: [192, 146, 189, 143,  4,  3, 32, 32, [8, 148, 8, 0,  0, 0, 36], [8, 102, 8, 0,  0, 0, 36]],
  6: [168, 157,  83, 155,  4,  3,  8, 38, [8,  60, 8, 33, 60, 8, 8], [8, 105, 8, 0, 0, 0, 44]],
  7: [191, 147,   0, 147, 30,  3,  8, 28, [34, 149, 8, 0, 0, 0, 8],  [8, 101, 8, 0,  0, 0, 38]],
  8: [203, 122,   0,  66, 32,  3,  8,  8, [42, 150, 8, 0,  0,  0, 8], [8,  40, 4, 34, 32, 4, 8]],
}; // arrows: 1/2/3 = up-left/mid/right, 4 = right, 5/6/7 = down-right/mid/left, 8 = left
export const coblnImgs = {};
for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) { // skins live under public/textures
  const im = new Image(); im.src = B + 'textures/coblln' + n + '.png'; coblnImgs[n] = im;
}
export const coblnReady = Promise.all(Object.values(coblnImgs).map((im) =>
  im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
export function gortSegs(t, D) { // GORT::_ComputeFlexZp + Draw — [srcOff,srcLen,dstOff,dstLen][]
  const [l, lf, li, m, rf, ri, r] = t;
  let rfD = Math.max(0, D - l - m - r);
  let lfD = lf + rf ? Math.floor(rfD * lf / (lf + rf)) : 0;
  if (lfD > 0) { const q = Math.floor(lfD / lf); lfD = q * lf + Math.min(lf, Math.ceil(Math.max(0, lfD - q * lf) / li) * li); }
  rfD = Math.max(0, rfD - lfD);
  if (rfD > 0) { const q = Math.floor(rfD / rf); rfD = q * rf + Math.min(rf, Math.ceil(Math.max(0, rfD - q * rf) / ri) * ri); }
  const segs = [];
  let d = 0, s = 0;
  const seg = (sl, dl) => { segs.push([s, sl, d, dl]); d += dl; s += sl; };
  seg(l, l);
  for (let rem = lfD; rem > 0; rem -= lf) { const w = Math.min(lf, rem); segs.push([s, w, d, w]); d += w; }
  s += lf; seg(m, m);
  for (let rem = rfD; rem > 0; rem -= rf) { const w = Math.min(rf, rem); segs.push([s, w, d, w]); d += w; }
  s += rf; seg(r, r);
  return segs;
}
export function gortMap(t, D, v) { // map a source coord through the flexed axis to dest
  for (const [s, sl, d] of gortSegs(t, D)) if (v < s + sl) return d + v - s;
  return D;
}

// The tip layer sits above the view stack (added to UiRoot._rebuild children).
export function tipLayer() { return ui.tips; }

const RUN_STYLE = { 't': { bold: true, color: '#1a1a1a' }, 'hot': { bold: false, color: '#1332be' }, 1: { bold: false, color: '#1332be' } };
const TIP_FONT = (b) => `${b ? 'bold ' : ''}10px 'Comic Sans MS', cursive, sans-serif`;

/** Wrap styled runs into lines: returns {lines:[[{text,bold,color,x}]..], w, h}. */
function layoutRuns(parts, maxW, ctx) {
  const tokens = []; // {text, cls} word tokens; '\n' breaks
  for (const [txt, cls] of parts)
    for (const seg of String(txt).split('\n')) {
      for (const wd of seg.split(/(\s+)/).filter((w) => w.length)) tokens.push({ text: wd, cls });
      tokens.push({ br: true });
    }
  if (tokens.length && tokens[tokens.length - 1].br) tokens.pop();
  const lines = []; let line = [], lx = 0;
  const meas = (w, b) => { ctx.font = TIP_FONT(b); return ctx.measureText(w).width; };
  for (const tk of tokens) {
    if (tk.br) { lines.push(line); line = []; lx = 0; continue; }
    const st = RUN_STYLE[tk.cls] || { bold: false, color: '#1a1a1a' };
    const w = meas(tk.text, st.bold);
    if (lx + w > maxW && lx > 0 && !/^\s+$/.test(tk.text)) { lines.push(line); line = []; lx = 0; }
    if (lx === 0 && /^\s+$/.test(tk.text)) continue; // drop leading space on a new line
    line.push({ text: tk.text, ...st, x: lx, w });
    lx += w;
  }
  if (line.length) lines.push(line);
  return { lines, w: Math.max(0, ...lines.map((l) => l.length ? l[l.length - 1].x + l[l.length - 1].w : 0)), h: lines.length * 12 };
}

class Balloon extends Element {
  constructor(dir, gx, gy, W, H, parts, sticky, ctx2) {
    super(Math.round(gx), Math.round(gy), Math.round(W), Math.round(H));
    this.dir = dir; this.parts = parts; this.sticky = sticky;
    const [, , , , bl, bt, br, bb, thz, tvz] = COBLN[dir];
    const lay = layoutRuns(parts, Math.min(W - bl - br - 22, 200), ctx2);
    this.lay = lay; this.bl = bl; this.bt = bt; this.br = br; this.bb = bb;
    this.xEl = /** @type {Element & {_dn: boolean}} */ (new Element(W - br - 18, H - bb - 18, 16, 16)); // kgobCancelButton — cancbtn1.bmp
    this.xEl.cursor = 'pointer';
    this.xEl._dn = false;
    this.xEl.draw = (ctx) => {
      const im = new Image(); im.src = B + `textures/cancbtn${this.xEl._dn ? '3' : '1'}.png`;
      if (im.complete && im.naturalWidth) ctx.drawImage(im, 0, 0, 16, 16);
      else im.onload = () => this.xEl.dirty();
    };
    this.xEl.onPointerDown = () => { this.xEl._dn = true; this.xEl.dirty(); return true; };
    this.xEl.onClick = () => tipDismiss();
    this.add(this.xEl);
  }
  draw(ctx) {
    const img = coblnImgs[this.dir];
    if (!img.complete || !img.naturalWidth) return;
    const [, , , , , , , , thz, tvz] = COBLN[this.dir];
    ctx.imageSmoothingEnabled = false;
    for (const [sy, sh, dy, dh] of gortSegs(tvz, this.h))
      for (const [sx, sw, dx, dw] of gortSegs(thz, this.w))
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    // text runs in the content rc
    for (const line of this.lay.lines) for (const r of line) {
      ctx.font = TIP_FONT(r.bold); ctx.fillStyle = r.color;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(r.text, this.bl + r.x, this.bt + this.lay.lines.indexOf(line) * 12);
    }
  }
}

const measCtx = document.createElement('canvas').getContext('2d');
/** -> Balloon element or null; target: Element (uses abs()) or {x,y,w,h} logical.
 * parts: [text, hot?][] */
export function callout(target, parts, sticky) {
  let tx, ty;
  if (target instanceof Element) { const [ax, ay] = target.abs(); tx = ax + target.w / 2; ty = ay + target.h / 2; }
  else { tx = target.x + (target.w || 0) / 2; ty = target.y + (target.h || 0) / 2; }
  const up = ty < 220, right = tx < 420;
  const pref = up ? (right ? [2, 1, 3, 8, 4, 7, 6, 5, 0] : [2, 3, 1, 4, 8, 5, 6, 7, 0])
                  : (right ? [6, 7, 5, 8, 4, 1, 2, 3, 0] : [6, 5, 7, 4, 8, 3, 2, 1, 0]);
  for (const dir of pref) {
    const [bw, bh, rx, ry, bl, bt, br, bb, thz, tvz] = COBLN[dir];
    const lay = layoutRuns(parts, 200, measCtx); // content measure (max doc width ~200)
    const tw = lay.w + 10, th = lay.h + 4;
    const W = Math.max(bl + br + tw + 22, 76), H = Math.max(bb + bt + Math.max(th, 20), 60);
    const gx = tx - gortMap(thz, W, rx), gy = ty - gortMap(tvz, H, ry);   // arrow tip at target
    if (gx < 2 || gy < 2 || gx + W > 638 || gy + H > 478) continue;
    const img = coblnImgs[dir];
    if (!img.complete || !img.naturalWidth) continue;
    const gob = new Balloon(dir, gx, gy, W, H, parts, sticky, measCtx);
    tipLayer().add(gob);
    ui.invalidate();
    return gob;
  }
  return null;
}
export let tipEl = null, tipSrc = null;
export let tipTimer = /** @type {any} */ (0);
export const tipDismiss = () => { clearTimeout(tipTimer); tipTimer = 0; if (tipEl) { tipLayer().remove(tipEl); ui.invalidate(); } tipEl = null; tipSrc = null; };
export function tipShow(el) { // HBAL::PhbalNew — the control's topic balloon, arrow at the control
  tipDismiss();
  const tipId = el.tip ?? el.dataset?.tip;
  if (!tipId) return;
  tipSrc = el;
  const tip = el.tip ? t(`tip.${tipId}`) : tipId; // canvas elements hold ids; legacy callers pass text
  coblnReady.then(() => { if (tipSrc === el && !playing)
    tipEl = callout(el, typeof tip === 'string' // 'Title\nBody' -> title run + body
      ? tip.split('\n').map((l, i) => [l + '\n', i ? '' : 't']) : tip, false); });
}
// Dwell tracking: the UI canvas computes the hit element; a tip id on it (or an
// ancestor) schedules the balloon after ~1.2s (kdtimToolTipDelay ~1.5s).
document.addEventListener('pointermove', (e) => {
  if (tipEl?.sticky) return; // guide stays until click/X
  let el = null;
  if (e.target === ui.canvas) {
    const r = ui.canvas.getBoundingClientRect();
    const hit = ui.topView?.hitTest((e.clientX - r.left) / r.width * 640, (e.clientY - r.top) / r.height * 480);
    for (let n = hit; n; n = n.parent) if (n.tip) { el = n; break; }
  }
  if (el === tipSrc || (tipEl && hitInTip(e))) return;
  clearTimeout(tipTimer); tipTimer = 0;
  if (tipEl) { tipLayer().remove(tipEl); ui.invalidate(); tipEl = null; }
  tipSrc = el;
  if (el && !playing && !e.buttons)
    tipTimer = setTimeout(() => { if (tipSrc === el && !playing) tipShow(el); }, 1200); // kdtimToolTipDelay ~1.5s
}, true);
function hitInTip(e) { // pointer inside the balloon doesn't dismiss it
  if (!tipEl) return false;
  const r = ui.canvas.getBoundingClientRect();
  const [ax, ay] = tipEl.abs();
  const vx = (e.clientX - r.left) / r.width * 640, vy = (e.clientY - r.top) / r.height * 480;
  return vx >= ax && vy >= ay && vx < ax + tipEl.w && vy < ay + tipEl.h;
}
document.addEventListener('pointerdown', tipDismiss, true);
// Touch has no hover — a ~700ms press-and-hold on a tipped control is its dwell.
let /** @type {any} */ lpTimer = 0, lpX = 0, lpY = 0, lpEl = null;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || e.target !== ui.canvas) return;
  const r = ui.canvas.getBoundingClientRect();
  const hit = ui.topView?.hitTest((e.clientX - r.left) / r.width * UI_W, (e.clientY - r.top) / r.height * UI_H);
  lpEl = null;
  for (let n = hit; n; n = n.parent) if (n.tip) { lpEl = n; break; }
  lpX = e.clientX; lpY = e.clientY;
  clearTimeout(lpTimer);
  if (lpEl) lpTimer = setTimeout(() => { if (lpEl && !playing) tipShow(lpEl); }, 700);
}, true);
const lpCancel = (e) => {
  if (e.type === 'pointermove' && Math.hypot(e.clientX - lpX, e.clientY - lpY) < 12) return; // still held
  clearTimeout(lpTimer); lpEl = null;
};
document.addEventListener('pointerup', lpCancel, true);
document.addEventListener('pointercancel', lpCancel, true);
document.addEventListener('pointermove', lpCancel, true);
export function guideTip() { // first-boot guide — the original's CO tip for the scenes cover
  const b = { x: 18, y: 1, w: 62, h: 40 }; // 1back insert button rect (logical)
  coblnReady.then(() => { if (tipEl || player?.movie.scenes.length) return;
    tipEl = callout(b, [['To see the scenes you can choose from, click '], ['Scene Choices', 1], ['.']], true);
    if (tipEl) tipSrc = b;
    setTimeout(() => { if (tipEl?.sticky) tipDismiss(); }, 15000); });
}
