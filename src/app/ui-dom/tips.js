import { playing } from '../state.js';import { $ } from '../res.js';import { B } from '../res.js';import { player } from '../state.js';
// --- callout tips (the original's HBAL: kgobCalloutBalloonN — a cobllnN.bmp
// skin tiled by GORT with the red arrow baked in; reg point = the arrow tip.
// Dwell on a control to get its tip (suppressed while playing, like the
// original pushing kpridToolTipDelay to 0x0FFFFFFF during FCmdPlay)) ---------
export const COBLN = { // bmp w,h, arrow-tip reg (x,y), borders LTRB, horz+vert tile rows
  0: [167, 122,  83,  61,  5,  4,  5,  4, [8, 151, 8, 0,  0,  0, 8], [8, 106, 8, 0,  0,  0, 8]],
  1: [190, 143,   1,   1, 29, 28,  8,  8, [36, 146, 8, 0,  0,  0, 8], [32, 103, 8, 0,  0,  0, 8]],
  2: [168, 156,  83,   1,  4, 41,  8,  8, [8,  58,  8, 35, 60, 8, 8], [42, 108, 8, 0,  0,  0, 8]],
  3: [191, 145, 189,   2,  4, 30, 32,  8, [8, 147, 8, 0,  0, 0, 36], [34, 103, 4, 0,  0,  0, 8]],
  4: [204, 122, 201,  65,  4,  3, 46,  8, [8, 148, 8, 0,  0, 0, 48], [8,  40, 4, 34, 40, 4, 8]],
  5: [192, 146, 189, 143,  4,  3, 32, 32, [8, 148, 8, 0,  0, 0, 36], [8, 102, 8, 0,  0, 0, 36]],
  6: [168, 157,  83, 155,  4,  3,  8, 38, [8,  60, 8, 33, 60, 8, 8], [8, 105, 8, 0, 0, 0, 44]],
  7: [191, 147,   0, 147, 30,  3,  8, 28, [34, 149, 8, 0, 0, 0, 8],  [8, 101, 8, 0, 0, 0, 38]],
  8: [203, 122,   0,  66, 32,  3,  8,  8, [42, 150, 8, 0, 0, 0, 8],  [8,  40, 4, 34, 32, 4, 8]],
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
export const coMeas = document.createElement('div');
coMeas.className = 'coTxt'; coMeas.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;max-width:45cqw;';
export function callout(target, parts, sticky) { // -> balloon el or null; parts: [text, hot?][]
  const studioEl = $('studio'), sr = studioEl.getBoundingClientRect(), sc = sr.width / 640;
  const tr = target.getBoundingClientRect();
  const tx = (tr.left + tr.width / 2 - sr.left) / sc, ty = (tr.top + tr.height / 2 - sr.top) / sc; // logical target pt
  // pick the arrow direction with the best room, preferring the natural side
  const up = ty < 220, right = tx < 420;
  const pref = up ? (right ? [2, 1, 3, 8, 4, 7, 6, 5, 0] : [2, 3, 1, 4, 8, 5, 6, 7, 0])
                  : (right ? [6, 7, 5, 8, 4, 1, 2, 3, 0] : [6, 5, 7, 4, 8, 3, 2, 1, 0]);
  // measure the text doc at logical size
  const mkRuns = (dst) => { for (const [t, cls] of parts) { const s = document.createElement('span'); if (cls) s.className = cls === 1 ? 'hot' : cls; s.textContent = t; dst.appendChild(s); } };
  coMeas.innerHTML = ''; mkRuns(coMeas);
  studioEl.appendChild(coMeas);
  const tw = coMeas.offsetWidth / sc + 10, th = coMeas.offsetHeight / sc + 4; // natural doc size
  coMeas.remove();
  for (const dir of pref) {
    const [bw, bh, rx, ry, bl, bt, br, bb, thz, tvz] = COBLN[dir];
    // text doc + the AGPA-embedded cancel button (cancbtn1, 16x16) in a right column
    const W = Math.max(bl + br + tw + 22, 76), H = Math.max(bb + bt + Math.max(th, 20), 60);
    const gx = tx - gortMap(thz, W, rx), gy = ty - gortMap(tvz, H, ry);   // arrow tip at target
    if (gx < 2 || gy < 2 || gx + W > 638 || gy + H > 478) continue;
    const img = coblnImgs[dir];
    if (!img.complete || !img.naturalWidth) continue;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * sc * 2); cv.height = Math.round(H * sc * 2); // 2x for hi-dpi
    const x2 = cv.getContext('2d'); x2.scale(2, 2); x2.imageSmoothingEnabled = true;
    const scx = cv.width / 2 / W, scy = cv.height / 2 / H;
    for (const [sy, sh, dy, dh] of gortSegs(tvz, H)) for (const [sx, sw, dx, dw] of gortSegs(thz, W))
      x2.drawImage(img, sx, sy, sw, sh, dx * scx, dy * scy, dw * scx, dh * scy);
    const gob = document.createElement('div');
    gob.className = 'coBalloon'; if (sticky) gob.classList.add('sticky');
    gob.style.left = (gx / 6.4) + '%'; gob.style.top = (gy / 4.8) + '%';
    gob.style.width = (W / 6.4) + '%'; gob.style.height = (H / 4.8) + '%';
    gob.appendChild(cv);
    const td = document.createElement('div'); // the TXHG text inside the content rc
    td.className = 'coTxt';
    td.style.left = (bl / W * 100) + '%'; td.style.top = (bt / H * 100) + '%';
    td.style.width = ((W - bl - br - 22) / W * 100) + '%';
    mkRuns(td);
    gob.appendChild(td);
    const xb = document.createElement('img'); // kgobCancelButton — cancbtn1.bmp, 16x16, bottom-right
    xb.src = B + 'textures/cancbtn1.png'; xb.className = 'coX'; xb.draggable = false;
    xb.style.left = ((W - br - 18) / W * 100) + '%'; xb.style.top = ((H - bb - 18) / H * 100) + '%';
    xb.style.width = (16 / W * 100) + '%';
    xb.onpointerdown = (e) => { e.stopPropagation(); xb.src = B + 'textures/cancbtn3.png'; tipDismiss(); }; // krepMouseDnOn face, then gone
    gob.appendChild(xb);
    studioEl.appendChild(gob);
    return gob;
  }
  return null;
}
export let tipEl = null, tipTimer = 0, tipSrc = null;
export const tipDismiss = () => { clearTimeout(tipTimer); tipTimer = 0; tipEl?.remove(); tipEl = null; tipSrc = null; };
export function tipShow(el) { // HBAL::PhbalNew — the control's topic balloon, arrow at the control
  tipDismiss();
  const tip = el.dataset?.tip;
  if (!tip) return;
  tipSrc = el;
  coblnReady.then(() => { if (tipSrc === el && !playing)
    tipEl = callout(el, typeof tip === 'string' // 'Title\nBody' -> title run + body
      ? tip.split('\n').map((l, i) => [l + '\n', i ? '' : 't']) : tip, false); });
}
document.addEventListener('pointermove', (e) => {
  if (tipEl?.classList.contains('sticky')) return; // guide stays until click/X
  const el = e.target?.closest?.('[data-tip]');
  if (el === tipSrc || (tipEl && e.target?.closest?.('.coBalloon') === tipEl)) return;
  clearTimeout(tipTimer); tipTimer = 0;
  tipEl?.remove(); tipEl = null;
  tipSrc = el;
  if (el && !playing && !e.buttons)
    tipTimer = setTimeout(() => { if (tipSrc === el && !playing) tipShow(el); }, 1200); // kdtimToolTipDelay ~1.5s
}, true);
document.addEventListener('pointerdown', tipDismiss, true);
export function guideTip() { // first-boot guide — the original's CO tip for the scenes cover
  const b = [...document.querySelectorAll('#studio .stBtn')]
    .find((x) => x.firstElementChild?.src.includes('/1back.'));
  if (!b) return; // guidhelp.cht CO__To_see_the_scenes, verbatim text + hot run
  coblnReady.then(() => { if (tipEl || player?.movie.scenes.length) return;
    tipEl = callout(b, [['To see the scenes you can choose from, click '], ['Scene Choices', 1], ['.']], true);
    if (tipEl) tipSrc = b;
    setTimeout(() => { if (tipEl?.classList.contains('sticky')) tipDismiss(); }, 15000); });
}
