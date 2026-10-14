import { texUrl } from '../res.js';import { brwsTmpls } from '../thumbs.js';import { brwsShell, brwsEl, closeBrowser } from './browsers.js';
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
  const { place, mkImg, mkBtn } = brwsShell();
  mkImg('biopage', 0, 0, 640, 480);
  const pageIm = document.createElement('img'); // page collage over the backdrop
  pageIm.className = 'stImg'; pageIm.draggable = false; brwsEl.appendChild(pageIm);
  mkImg('biopnl', 0, 0, 640, 480); // ring panel goes on top
  const txt = document.createElement('div');
  txt.className = 'bioTxt'; brwsEl.appendChild(txt); place(txt, 215, 58, 207, 349); // kxpBioPage*
  const num = document.createElement('div');
  num.className = 'brwsNum bioNum'; brwsEl.appendChild(num); place(num, 282, 424, 62, 27); // kxpBioPageNum*
  const render = () => {
    bioState.page = bit; bioSave();
    const [l, t, w, h] = BIO_POS[bit] ?? [42, 60, 549, 359];
    pageIm.src = texUrl(`biopg${bit + 1}`); place(pageIm, l, t, w, h);
    const ai = BIO_ACTOR[bit];
    const name = ai == null ? '' : (brwsTmpls.actor[ai]?.name || 'actor');
    txt.innerHTML = `<b>${name}</b>${BIO_BLURB[bit] ? '<br><br>' + name + ' ' + BIO_BLURB[bit] : ''}`;
    num.textContent = `Page ${bit}`;
  };
  mkBtn('bioback', 'biobackc', 229, 410, 69, 50, () => { // kxpBioBack/kypBioBack
    if (bit > 1) { bit--; render(); }
  });
  mkBtn('biofwd', 'biofwdc', 339, 410, 69, 50, () => { // kxpBioFwd/kypBioFwd
    if (bit < NUM_BIOPAGES - 1) { bit++; render(); }
  });
  mkBtn('biocan', 'biocanc', 511, 415, 48, 47, closeBrowser); // kxpBioCancel
  render();
}