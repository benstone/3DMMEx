// Cross-module app state. `export let` gives live bindings — readers always
// see the current value; only the paired setter may assign (ESM rule).
// Setters return the value so `a = b = setX(v)` chains still work.
export let lib = null, pal = null, renderer = null, sounds = null;
export let selChid = -1, pendPlace = null;
export let selTbChid = -1, focusTbChid = -1, tbSel = null;
export let tbAttach = null, tbSnap = null, lastViewPt = null;
export const setLib = (v) => (lib = v);
export const setPal = (v) => (pal = v);
export const setRenderer = (v) => (renderer = v);
export const setSounds = (v) => (sounds = v);
export const setSelChid = (v) => (selChid = v);
export const setPendPlace = (v) => (pendPlace = v);
export const setSelTbChid = (v) => (selTbChid = v);
export const setFocusTbChid = (v) => (focusTbChid = v);
export const setTbSelVal = (v) => (tbSel = v);
export const setTbAttach = (v) => (tbAttach = v);
export const setTbSnap = (v) => (tbSnap = v);
export const setLastViewPt = (v) => (lastViewPt = v);

// Shared mutable objects — property changes are legal from any module.
// (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse)
export const ed = { xy: false, ground: false, tool: 'compose', // tool = active secondary tool
  sndTag: null, pauseSnd: false }; // _tagTool / fpseDown
export const tbPaint = { acr: -1, dyp: 14, grfont: 0, font: null }; // AcrPaint/DypFontTextCur/GrfontStyleTextCur/OnnTextCur
export const selTbSels = new Map(); // each TBXG keeps its own caret/selection (_cpAnchor/_cpOther)
