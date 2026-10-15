// Rich-text (RTXT) layout + canvas drawing for movie text boxes — word wrap,
// style runs, selection/caret geometry, and chrome, all in 2D canvas space.
import { SPRM } from '../format/content.ts';

const K_BORDER = 5;   // textbox border band width (px)
const K_INDENT = 9;   // text inset from the border band (px)
const TEXTBOX_SCROLL_PIXELS_PER_SECOND = 200; // credits scroll rate
const KDEN = 256;     // line/paragraph spacing units per whole
const KDXP_TAB = 18;  // default tab/indent step (px)

/** Signed high word of a packed long — style deltas are signed. */
const swHigh = (lw) => lw >> 16;
/** Signed low word of a packed long. */
const swLow = (lw) => (lw << 16) >> 16;
/** Top byte of a packed long. */
const b3 = (lw) => (lw >>> 24) & 0xff;
/** Second byte of a packed long. */
const b2 = (lw) => (lw >>> 16) & 0xff;

// ACR (aggregate color ref) encoding: RGB colors carry top byte 0x01,
// palette-index references carry 0xfe, clear = 0xffffffff, invert = 0xff000000.
const KACR_BLACK = 0x01000000;

/** Decode an ACR (aggregate color ref) against the scene palette —
 *  returns a css color, 'invert', or null (clear). */
export function fontAttrToColor(lw, palette) {
  lw = lw >>> 0;
  const top = lw >>> 24;
  if (top === 0xff) {
    if (lw === 0xff000000) return 'invert';
    return null; // clear
  }
  if (top === 0xfe) {
    const i = lw & 0xff;
    const p = palette ? palette[i] : null;
    return p ? `rgb(${p[0]},${p[1]},${p[2]})` : null;
  }
  return `rgb(${(lw >> 16) & 255},${(lw >> 8) & 255},${lw & 255})`;
}

const KACR_YELLOW = 'rgb(255,255,0)'; // black text is drawn yellow — the default look

/** Base character properties of a document — font/size from the RTXT header,
 *  yellow-on-clear colors, no offset. */
function defaultChp(doc) {
  return {
    font: doc.font || 'Comic Sans MS', dyp: doc.dypFont || 14, grfont: 0,
    fore: KACR_YELLOW, back: null, off: 0,
  };
}
/** Black or unset foreground resolves to the default yellow. */
const fixFore = (c) => (c === 'rgb(0,0,0)' || !c) ? KACR_YELLOW : c;

/** Group a document's property entries by sprm id, each sorted by character
 *  position (the stored list is already sprm-major). */
function groupMpes(doc) {
  const groups = new Map();
  for (const m of doc.mpes) {
    let g = groups.get(m.sprm);
    if (!g) groups.set(m.sprm, (g = []));
    g.push(m);
  }
  return groups;
}

/**
 * Resolve per-character styles for a document — for each sprm group the value
 * comes from its latest entry at or before the character position (the entry's
 * lw is absolute; 0 restores the default). Fore/back colors are stored as
 * offsets from black/clear, which `fontAttrToColor` decodes.
 */
export function resolveTextStyles(doc, palette) {
  const def = defaultChp(doc);
  const len = doc.text.length;
  const chps = new Array(len);
  const cur = { ...def };
  const apply = {
    [SPRM.Style]: (lw) => { cur.grfont = lw & 0xff; cur.off = (lw << 16) >> 24; cur.dyp = def.dyp + swHigh(lw); },
    [SPRM.Font]: (lw) => { cur.font = lw > 0 ? doc.fonts[lw - 1] || def.font : def.font; },
    [SPRM.Fore]: (lw) => { const c = fontAttrToColor((KACR_BLACK + lw) | 0, palette); if (c !== 'invert') cur.fore = fixFore(c); },
    [SPRM.Back]: (lw) => { cur.back = fontAttrToColor((lw - 1) | 0, palette); }, // offsets sit on the 'clear' ref
  };
  const groups = groupMpes(doc);
  const pos = new Map();
  for (let i = 0; i < len; i++) {
    for (const [sprm, g] of groups) {
      const fn = apply[sprm];
      if (!fn) continue;
      let j = pos.get(sprm) || 0;
      let last = null;
      while (j < g.length && g[j].cp <= i) last = g[j++];
      pos.set(sprm, j);
      if (last) fn(last.lw);
    }
    chps[i] = { ...cur };
  }
  return chps;
}

/** Paragraph-property resolver — returns a function mapping a character
 *  position to the paragraph properties in effect there (justify, indent,
 *  tab step, line/after spacing). */
function resolvePaps(doc) {
  const def = { jc: 0, nd: 0, dxpTab: KDXP_TAB, numLine: KDEN, dypExtraLine: 0, numAfter: KDEN, dypExtraAfter: 0 };
  const apply = {
    [SPRM.Horz]: (pap, lw) => { pap.jc = b3(lw); pap.nd = b2(lw); pap.dxpTab = def.dxpTab + swLow(lw); },
    [SPRM.Vert]: (pap, lw) => { pap.numLine = KDEN + swHigh(lw); pap.dypExtraLine = swLow(lw); },
    [SPRM.After]: (pap, lw) => { pap.numAfter = KDEN + swHigh(lw); pap.dypExtraAfter = swLow(lw); },
  };
  const groups = groupMpes(doc);
  const cur = { ...def };
  const pos = new Map();
  return (cp) => {
    for (const [sprm, g] of groups) {
      const fn = apply[sprm];
      if (!fn) continue;
      let j = pos.get(sprm) || 0;
      let last = null;
      while (j < g.length && g[j].cp <= cp) last = g[j++];
      pos.set(sprm, j);
      if (last) fn(cur, last.lw);
    }
    return { ...cur };
  };
}

/** Canvas font string for a resolved style — italic/bold flags + size + family. */
const fontKey = (s) => `${s.grfont & 2 ? 'italic ' : ''}${s.grfont & 1 ? 'bold ' : ''}${s.dyp}px ${JSON.stringify(s.font)}, sans-serif`;

/** Lay a document out into lines of styled runs within its wrap width.
 *  Cached on the doc — invalidated when wrap width or palette changes. */
export function layoutTextDocument(doc, ctx, palette) {
  if (doc._layout && doc._layoutW === doc.wrapW && doc._layoutPal === palette) return doc._layout;
  const chps = doc.text.length ? resolveTextStyles(doc, palette) : [];
  const papAt = resolvePaps(doc);
  const wrapW = doc.wrapW;
  const lines = [];
  const paras = doc.text.split('\r');
  let cp = 0;
  const lineH = (runs) => runs.reduce((h, r) => Math.max(h, r.h), 0);

  for (const para of paras) {
    const pap = papAt(cp);
    // split paragraph into styled words
    const words = [];
    let i = 0;
    while (i < para.length) {
      const s = chps[cp + i] || defaultChp(doc);
      let j = i;
      const isSpace = para[i] === ' ';
      while (j < para.length && (para[j] === ' ') === isSpace && sameStyle(chps[cp + j], s)) j++;
      words.push({ text: para.slice(i, j), style: s, cp0: cp + i });
      i = j;
    }
    // greedy wrap
    let line = [];
    let lw = 0;
    let firstLine = true;
    const pushWord = (w) => {
      ctx.font = fontKey(w.style);
      const ww = ctx.measureText(w.text).width;
      const m = ctx.measureText('Mg');
      const h = (m.fontBoundingBoxAscent || w.style.dyp * 0.8) + (m.fontBoundingBoxDescent || w.style.dyp * 0.2);
      return { ...w, w: ww, h };
    };
    const flush = (endOfPara) => {
      if (!line.length) return;
      // nd: first-line vs rest-line indenting (dxpTab)
      const indent = pap.nd === 1 ? (firstLine ? pap.dxpTab : 0)
        : pap.nd === 2 ? (firstLine ? 0 : pap.dxpTab)
        : pap.nd === 3 ? pap.dxpTab : 0;
      let h = Math.round(lineH(line) * pap.numLine / KDEN) + pap.dypExtraLine;
      if (endOfPara) h = Math.round(h * pap.numAfter / KDEN) + pap.dypExtraAfter;
      lines.push({ runs: line, jc: pap.jc, indent, h: Math.max(1, h) });
      line = []; lw = 0; firstLine = false;
    };
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const run = pushWord(w);
      const space = w.text === ' ' || /^\s+$/.test(w.text);
      if (!space && lw > 0 && lw + run.w > wrapW) flush(false);
      if (space && line.length === 0) continue; // skip leading spaces on wrapped lines
      line.push(run);
      lw += run.w;
      if (!space && lw + run.w > wrapW && wi === words.length - 1) flush(false);
    }
    flush(true);
    cp += para.length + 1;
  }
  doc._layout = lines;
  doc._layoutW = doc.wrapW;
  doc._layoutPal = palette;
  return lines;
}

/** True when two resolved styles draw identically — used to merge word runs. */
function sameStyle(a, b) {
  if (!a || !b) return true;
  return a.font === b.font && a.dyp === b.dyp && a.grfont === b.grfont && a.fore === b.fore && a.back === b.back && a.off === b.off;
}

/** Position a textbox's lines/runs in box pixel space — applies wrap width,
 *  justification, indent, and the scroll offset. Shared by draw and hit-test. */
function positionLines(textbox, ctx, palette) {
  const doc = textbox.rtxt, w = textbox.r - textbox.l, h = textbox.b - textbox.t;
  doc.wrapW = w - 2 * (K_BORDER + K_INDENT);
  const lines = layoutTextDocument(doc, ctx, palette);
  const tx = textbox.l + K_BORDER + K_INDENT, tw = w - 2 * (K_BORDER + K_INDENT);
  let y = textbox.t + K_BORDER - (textbox._scv || 0);
  const out = [];
  for (const ln of lines) {
    let x = tx + (ln.indent || 0);
    const lwTotal = ln.runs.reduce((a, r) => a + r.w, 0);
    if (ln.jc === 1) x = tx + tw - lwTotal;
    else if (ln.jc === 2) x = tx + (tw - lwTotal) / 2;
    const pl = { y, h: ln.h, runs: [] };
    for (const r of ln.runs) { pl.runs.push({ ...r, x }); x += r.w; }
    out.push(pl);
    y += ln.h;
  }
  return out;
}

/** Document height and max scroll offset — used by the player to decide when
 *  a textbox needs to hold the frame and scroll (credits behavior). */
export function measureTextbox(textbox, ctx, palette?) {
  if (!textbox?.rtxt) return { docH: 0, maxScroll: 0 };
  const lines = positionLines(textbox, ctx, palette);
  const docH = lines.reduce((y, ln) => y + ln.h, 0);
  const inner = (textbox.b - textbox.t) - 2 * K_BORDER;
  return { docH, maxScroll: Math.max(0, docH - inner) };
}

/** Hit-test a view-space point to a character position in the document —
 *  clamps vertically to the nearest line, then binary-walks the hit run. */
export function hitTestTextbox(textbox, ctx, palette, px, py) {
  const doc = textbox.rtxt;
  const lines = positionLines(textbox, ctx, palette);
  if (!lines.length) return 0;
  // clamp to the line the point is closest to vertically (end of doc if below)
  let ln = null;
  for (const l of lines) { if (py < l.y + l.h) { ln = l; break; } ln = l; }
  let cp = doc.text.length;
  for (const r of ln.runs) {
    if (px < r.x) { cp = r.cp0; return cp; }
    if (px < r.x + r.w) { // binary walk the run for the closest cp boundary
      let lo = 0, hi = r.text.length;
      ctx.font = fontKey(r.style);
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (r.x + ctx.measureText(r.text.slice(0, mid)).width <= px) lo = mid; else hi = mid;
      }
      const wLo = ctx.measureText(r.text.slice(0, lo)).width, wHi = ctx.measureText(r.text.slice(0, hi)).width;
      return r.cp0 + (px - r.x - wLo < wHi - (px - r.x) ? lo : hi);
    }
    cp = r.cp0 + r.text.length;
  }
  return cp;
}

/** Caret geometry for a character position — {x,y,h} in view pixels, for
 *  drawing the editing caret and anchors. */
export function caretRect(textbox, ctx, palette, cp) {
  const doc = textbox.rtxt, lines = positionLines(textbox, ctx, palette);
  const defH = (doc.dypFont || 14) * 1.2;
  if (!lines.length) return { x: textbox.l + K_BORDER + K_INDENT, y: textbox.t + K_BORDER, h: defH };
  for (const ln of lines) {
    for (const r of ln.runs) {
      if (cp <= r.cp0 + r.text.length) {
        ctx.font = fontKey(r.style);
        return { x: r.x + ctx.measureText(r.text.slice(0, Math.max(0, cp - r.cp0))).width, y: ln.y, h: ln.h };
      }
    }
  }
  const last = lines[lines.length - 1], lr = last.runs[last.runs.length - 1];
  return { x: lr ? lr.x + lr.w : textbox.l + K_BORDER + K_INDENT, y: last.y, h: last.h };
}

/** Rects covering character range [a,b) — the selection highlight bands. */
export function caretRangeRects(textbox, ctx, palette, a, b) {
  const lines = positionLines(textbox, ctx, palette), rects = [];
  for (const ln of lines) {
    for (const r of ln.runs) {
      const r0 = r.cp0, r1 = r.cp0 + r.text.length;
      const s = Math.max(a, r0), e = Math.min(b, r1);
      if (s >= e) continue;
      ctx.font = fontKey(r.style);
      const x0 = r.x + ctx.measureText(r.text.slice(0, s - r0)).width;
      const x1 = r.x + ctx.measureText(r.text.slice(0, e - r0)).width;
      rects.push({ x: x0, y: ln.y, w: x1 - x0, h: ln.h });
    }
  }
  return rects;
}

/**
 * Draw all visible text boxes for a frame into a 2d context.
 * textbox._scv is the player-managed scroll offset — credits boxes hold the
 * frame and scroll at TEXTBOX_SCROLL_PIXELS_PER_SECOND.
 * sel: {chrome, textbox, a, b, caret} — `chrome` gets the border frame + resize
 * anchors (border click selection); `textbox` gets the text selection/caret
 * (interior click focus). The two are distinct: border selects, interior edits.
 */
export function drawTextboxes(ctx, textboxes, palette, W, H, sel) {
  ctx.clearRect(0, 0, W, H);
  for (const textbox of textboxes) {
    const doc = textbox.rtxt;
    if (!doc) continue;
    const l = textbox.l, t = textbox.t, w = textbox.r - textbox.l, h = textbox.b - textbox.t;
    const bg = fontAttrToColor(doc.acrBack, palette);
    if (bg && bg !== 'invert') { ctx.fillStyle = bg; ctx.fillRect(l, t, w, h); }
    const plines = positionLines(textbox, ctx, palette);
    ctx.save();
    ctx.beginPath();
    ctx.rect(l + K_BORDER, t + K_BORDER, w - 2 * K_BORDER, h - 2 * K_BORDER);
    ctx.clip();
    ctx.textBaseline = 'middle';
    for (const ln of plines) {
      for (const r of ln.runs) {
        const s = r.style;
        ctx.font = fontKey(s);
        const cy = ln.y + ln.h / 2 + (ln.h - r.h) / 2 - s.off;
        if (s.back && s.back !== 'invert') { ctx.fillStyle = s.back; ctx.fillRect(r.x, cy - r.h / 2, r.w, r.h); }
        if (s.fore !== 'invert') {
          ctx.fillStyle = s.fore;
          ctx.fillText(r.text, r.x, cy);
          if (s.grfont & 4) ctx.fillRect(r.x, cy + s.dyp / 2 - 1, r.w, Math.max(1, s.dyp / 14));
        }
      }
    }
    ctx.restore();
    if (sel && sel.tb === textbox) {
      // selection: invert the covered spans (classic highlight)
      const [a, b] = sel.a < sel.b ? [sel.a, sel.b] : [sel.b, sel.a];
      if (a !== b) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff';
        for (const r of caretRangeRects(textbox, ctx, palette, a, b)) ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      }
      if (sel.caret != null) {
        const c = caretRect(textbox, ctx, palette, sel.caret);
        ctx.fillStyle = '#000';
        ctx.fillRect(c.x, c.y, 1, c.h);
      }
    }
    if (sel && sel.chrome === textbox) { // chrome selection: frame + 8 resize anchors on the border band
      ctx.strokeStyle = textbox.fStory ? '#000' : '#ff0'; ctx.lineWidth = 1; // black frame for story, yellow for credits
      ctx.strokeRect(l + 0.5, t + 0.5, w - 1, h - 1);
      const hs = K_BORDER;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
      const cx = l + w / 2 - hs / 2, cy = t + h / 2 - hs / 2;
      for (const [hx, hy] of [[l, t], [cx, t], [l + w - hs, t], [l, cy], [l + w - hs, cy], [l, t + h - hs], [cx, t + h - hs], [l + w - hs, t + h - hs]]) {
        ctx.fillRect(hx, hy, hs, hs); ctx.strokeRect(hx + 0.5, hy + 0.5, hs - 1, hs - 1);
      }
    }
  }
}
export { TEXTBOX_SCROLL_PIXELS_PER_SECOND };
