import { thumbnails } from '../thumbnails.ts';
import { EaselView } from './easel.ts';
import { Element } from './element.ts';
import { TextElement } from './widgets.ts';
import { textureCache } from './textureCache.ts';
import { modalSlot } from './modal.ts';
import { localizer } from '../localization.ts';
// --- talent book (BIO_CREATEBOOK / biopage.cht + sharecd.cht) ---------------
// corkboard book (biopage.pbm) + per-page portrait collage (biopgN.png adopted
// cells on kgobBioActors) + spiral-ring overlay (biopanel.pbm). The original's
// pages were "found" collectibles gated behind the building hub (fBio1/fBio2)
// with a table-of-contents/instructions page 0 — with no hub to find them in,
// all 40 actor pages are browsable and the instructions page is dropped.
export const TALENT_BOOK_PAGE_COUNT = 41; // biopage.chh — bits 1..40 (bit 0 was the TOC)
// bit -> actor index in .3th order (Henry, S'kelly and the three mascots have
// no page; Ramu/Patrick swap order and Maribella sits with the late pages —
// matched visually: each biopgN.png shows that actor's 4 costume portraits)
// bit -> actor index in .3th order — the original's page sequence (BIOPAGE.CHT
// topic names): Mirabella(.3th 'Maribella') sits at 26 ahead of Nakita; Henry,
// S'kelly and the three mascots have no page.
export const TALENT_BOOK_ACTORS = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18, 19, 20, 21, 22, 24, 25, 26, 23, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41];
// page bitmap bounds (left,top,w,h) — deviations from the common 42,60 box
export const TALENT_PAGE_LAYOUT = { 3: [43, 60, 548, 359] };
export const TALENT_BOOK_BLURBS = { // short per-page line keyed by bit — name always shown
  4: 'is a mummy.', 12: 'is a robot.', 15: 'is a baby.', 20: 'is the bearded fellow.',
  36: 'is a vampire.', 37: 'is a vampire.', 38: 'is the golden robot.',
  39: 'is the purple elephant.', 40: 'is the masked bandit.',
};
class TalentBook {
  state: { page: number };
  constructor() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem('mmsbio')); } catch { /* bad record */ }
    this.state = st && st.page >= 1 ? st : { page: 1 }; // stale records may point at the removed TOC
  }
  saveState = () => { try { localStorage.setItem('mmsbio', JSON.stringify(this.state)); } catch { /* quota */ } };
  show = (pageIndex?) => modalSlot.open(new TalentBookView(pageIndex));
}
export const talentBook = new TalentBook();

class BioPage extends Element { // page collage over the backdrop
  constructor(pageIndex) { super(42, 60, 549, 359); this.pickable = false; this.pageIndex = pageIndex; }
  draw(ctx) {
    const image = textureCache.image(`biopg${this.pageIndex + 1}`, () => this.dirty());
    if (textureCache.isReady(image)) { ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, this.w, this.h); }
  }
}

class BioText extends TextElement { // bioTxt — name bold + blurb, crude rich lines
  constructor(page) { super('', 215, 58, 207, 349, { size: 11, align: 'left', bold: false }); this.page = page; }
  draw(ctx) {
    const actorIndex = TALENT_BOOK_ACTORS[this.page.pageIndex];
    if (actorIndex == null) return;
    const name = thumbnails.browserTemplates.actor[actorIndex]?.name || 'actor';
    ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = "bold 12px 'Comic Sans MS', cursive, sans-serif";
    ctx.fillText(name, 0, 0, 207);
    // The original rendered an RTXT help topic here — its shipped text was an
    // unfinished "text to come" placeholder on every page, so we show the
    // actor's name + our one-line blurb, word-wrapped to the column.
    const blurb = TALENT_BOOK_BLURBS[this.page.pageIndex];
    if (blurb) {
      ctx.font = "11px 'Comic Sans MS', cursive, sans-serif";
      const words = `${name} ${blurb}`.split(' ');
      let line = '', ly = 26;
      for (const w of words) {
        const cand = line ? `${line} ${w}` : w;
        if (ctx.measureText(cand).width > 190 && line) { ctx.fillText(line, 0, ly); line = w; ly += 14; }
        else line = cand;
      }
      if (line) ctx.fillText(line, 0, ly);
    }
  }
}

export class TalentBookView extends EaselView {
  constructor(pageIndex = talentBook.state.page) {
    super();
    this.makeImage('biopage', 0, 0, 640, 480);
    this.page = new BioPage(pageIndex);
    this.add(this.pg);
    this.makeImage('biopnl', 0, 0, 640, 480); // ring panel goes on top
    this.txt = new BioText(this.pg);
    this.add(this.txt);
    this.pageText = new TextElement('', 299, 427, 40, 22, { size: 12 }); // fits the gap between the nav arrows
    this.add(this.pageText);
    this.makeButton('bioback', 'biobackc', 229, 410, 69, 50, () => { // kxpBioBack/kypBioBack
      if (this.page.pageIndex > 1) { this.page.pageIndex--; this.render(); }
    });
    this.makeButton('biofwd', 'biofwdc', 339, 410, 69, 50, () => { // kxpBioFwd/kypBioFwd
      if (this.page.pageIndex < TALENT_BOOK_PAGE_COUNT - 1) { this.page.pageIndex++; this.render(); }
    });
    this.makeButton('biocan', 'biocanc', 511, 415, 48, 47, modalSlot.close); // kxpBioCancel
    this.render();
  }
  render() {
    talentBook.state.page = this.page.pageIndex; talentBook.saveState();
    const [px, py, pw, ph] = TALENT_PAGE_LAYOUT[this.page.pageIndex] ?? [42, 60, 549, 359];
    this.page.x = px; this.page.y = py; this.page.w = pw; this.page.h = ph;
    this.page.dirty(); this.txt.dirty();
    this.num.textContent = localizer.translate('ui.bioPage', { n: this.page.pageIndex, total: TALENT_BOOK_PAGE_COUNT - 1 });
  }
}

