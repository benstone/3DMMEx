import { brwsTmpls } from '../thumbs.js';
import { EaselView, showEasel } from './easel.js';
import { Element } from './element.js';
import { Img, Txt } from './widgets.js';
import { texImg, imgReady } from './img.js';
import { closeBrowser } from './browser.js';
import { t } from '../i18n.js';
// --- talent book (BIO_CREATEBOOK / biopage.cht + sharecd.cht) ---------------
// corkboard book (biopage.pbm) + per-page portrait collage (biopgN.png adopted
// cells on kgobBioActors) + spiral-ring overlay (biopanel.pbm). The original's
// pages were "found" collectibles gated behind the building hub (fBio1/fBio2)
// with a table-of-contents/instructions page 0 — with no hub to find them in,
// all 40 actor pages are browsable and the instructions page is dropped.
export const NUM_BIOPAGES = 41; // biopage.chh — bits 1..40 (bit 0 was the TOC)
// bit -> actor index in .3th order (Henry, S'kelly and the three mascots have
// no page; Ramu/Patrick swap order and Maribella sits with the late pages —
// matched visually: each biopgN.png shows that actor's 4 costume portraits)
export const BIO_ACTOR = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18, 19, 20, 21, 22, 24, 25, 26, 27, 29, 28, 30, 31, 23, 33, 34, 35, 36, 37, 38, 39, 40, 41];
// page bitmap bounds (left,top,w,h) — deviations from the common 42,60 box
export const BIO_POS = { 3: [43, 60, 548, 359] };
export const BIO_BLURB = { // short per-page line keyed by bit — name always shown
  4: 'is a mummy.', 12: 'is a robot.', 15: 'is a baby.', 20: 'is the bearded fellow.',
  36: 'is a vampire.', 37: 'is a vampire.', 38: 'is the golden robot.',
  39: 'is the purple elephant.', 40: 'is the masked bandit.',
};
export let bioState = null;
try { bioState = JSON.parse(localStorage.getItem('mmsbio')); } catch { /* bad record */ }
if (!bioState) bioState = { page: 1 };
if (!(bioState.page >= 1)) bioState.page = 1; // stale records may point at the removed TOC
export const bioSave = () => { try { localStorage.setItem('mmsbio', JSON.stringify(bioState)); } catch { /* quota */ } };
export function showBio(bit = bioState.page) {
  const V = new EaselView();
  V.mkImg('biopage', 0, 0, 640, 480);
  const pageEl = /** @type {Element & {_bit: number}} */ (new Element(42, 60, 549, 359)); // page collage over the backdrop
  pageEl.pickable = false;
  pageEl._bit = bit;
  pageEl.draw = (ctx) => {
    const im = texImg(`biopg${pageEl._bit + 1}`, () => pageEl.dirty());
    if (imgReady(im)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, pageEl.w, pageEl.h); }
  };
  V.add(pageEl);
  V.mkImg('biopnl', 0, 0, 640, 480); // ring panel goes on top
  const txt = new Txt('', 215, 58, 207, 349, { size: 11, align: 'left', bold: false });
  txt.draw = (ctx) => { // bioTxt — name bold + blurb, crude rich lines
    const ai = BIO_ACTOR[pageEl._bit];
    if (ai == null) return;
    const name = brwsTmpls.actor[ai]?.name || 'actor';
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = "bold 11px 'Comic Sans MS', cursive, sans-serif";
    ctx.fillText(name, 0, 0, 207);
    if (BIO_BLURB[pageEl._bit]) {
      ctx.font = "11px 'Comic Sans MS', cursive, sans-serif";
      ctx.fillText(name + ' ' + BIO_BLURB[pageEl._bit], 0, 30, 207);
    }
  };
  V.add(txt);
  const num = new Txt('', 282, 424, 62, 27, { size: 15 });
  V.add(num);
  const render = () => {
    bioState.page = pageEl._bit; bioSave();
    const [l, tt, w, h] = BIO_POS[pageEl._bit] ?? [42, 60, 549, 359];
    pageEl.x = l; pageEl.y = tt; pageEl.w = w; pageEl.h = h;
    pageEl.dirty(); txt.dirty();
    num.textContent = t('ui.bioPage', { n: pageEl._bit });
  };
  V.mkBtn('bioback', 'biobackc', 229, 410, 69, 50, () => { // kxpBioBack/kypBioBack
    if (pageEl._bit > 1) { pageEl._bit--; render(); }
  });
  V.mkBtn('biofwd', 'biofwdc', 339, 410, 69, 50, () => { // kxpBioFwd/kypBioFwd
    if (pageEl._bit < NUM_BIOPAGES - 1) { pageEl._bit++; render(); }
  });
  V.mkBtn('biocan', 'biocanc', 511, 415, 48, 47, closeBrowser); // kxpBioCancel
  render();
  showEasel(V);
}
