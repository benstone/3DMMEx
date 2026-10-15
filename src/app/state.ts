// Cross-module app state — zustand stores are the source of truth.
// `useApp`/`useEd`/`useUi` are the real stores (zustand/vanilla, no React).
// The `export let` bindings below are a compatibility facade: a store
// subscription mirrors every set() into them synchronously, so existing
// call sites keep working while new code subscribes to slices directly.
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

// subscribeWithSelector enables store.subscribe(selector, cb[, opts]) —
// elements subscribe to a single field and repaint only when it changes.
export const useApp = createStore(subscribeWithSelector(() => ({
    lib: null, pal: null, renderer: null, sounds: null, player: null,
})));
export const useUi = createStore(subscribeWithSelector(() => ({
    playing: false,
    modeSync: null, // theatre/embed UI follow-callback (set by enterTheatre/enterEmbed)
    topView: null,  // published by UiRoot._rebuild — selector surface for
    stackDepth: 0,  // "is a dialog open" (stackDepth > 1) / view transitions
})));
export const useEd = createStore(subscribeWithSelector(() => ({
    selChid: -1, pendPlace: null,
    selTbChid: -1, focusTbChid: -1, tbSel: null,
    tbAttach: null, tbSnap: null, lastViewPt: null,
})));

// Facade bindings — kept in sync by store subscriptions so legacy imports
// always read the current value (setters return the value so `a = setX(v)`
// chains still work).
export let lib = null, pal = null, renderer = null, sounds = null, player = null;
export let playing = false, modeSync = null;
export let selChid = -1, pendPlace = null;
export let selTbChid = -1, focusTbChid = -1, tbSel = null;
export let tbAttach = null, tbSnap = null, lastViewPt = null;

useApp.subscribe((s) => { lib = s.lib; pal = s.pal; renderer = s.renderer; sounds = s.sounds; player = s.player; });
useUi.subscribe((s) => { playing = s.playing; modeSync = s.modeSync; });
useEd.subscribe((s) => { selChid = s.selChid; pendPlace = s.pendPlace; selTbChid = s.selTbChid; focusTbChid = s.focusTbChid; tbSel = s.tbSel; tbAttach = s.tbAttach; tbSnap = s.tbSnap; lastViewPt = s.lastViewPt; });

export const setLib = (v) => (useApp.setState({ lib: v }), v);
export const setPal = (v) => (useApp.setState({ pal: v }), v);
export const setRenderer = (v) => (useApp.setState({ renderer: v }), v);
export const setSounds = (v) => (useApp.setState({ sounds: v }), v);
export const setPlayer = (v) => (useApp.setState({ player: v }), v);
export const setPlaying = (v) => (useUi.setState({ playing: v }), v);
export const setModeSync = (v) => (useUi.setState({ modeSync: v }), v);
export const setSelChid = (v) => (useEd.setState({ selChid: v }), v);
export const setPendPlace = (v) => (useEd.setState({ pendPlace: v }), v);
export const setSelTbChid = (v) => (useEd.setState({ selTbChid: v }), v);
export const setFocusTbChid = (v) => (useEd.setState({ focusTbChid: v }), v);
export const setTbSelVal = (v) => (useEd.setState({ tbSel: v }), v);
export const setTbAttach = (v) => (useEd.setState({ tbAttach: v }), v);
export const setTbSnap = (v) => (useEd.setState({ tbSnap: v }), v);
export const setLastViewPt = (v) => (useEd.setState({ lastViewPt: v }), v);

// Shared mutable objects — property changes are legal from any module.
// They also live inside useEd's initial state (same references).
// (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse)
export const ed: { xy: boolean; ground: boolean; tool: string; sndTag: any; pauseSnd: boolean; [k: string]: any } =
  { xy: false, ground: false, tool: 'compose', // tool = active secondary tool
  sndTag: null, pauseSnd: false }; // _tagTool / fpseDown
export const tbPaint: { acr: number; dyp: number; grfont: number; font: any; [k: string]: any } =
  { acr: -1, dyp: 14, grfont: 0, font: null }; // AcrPaint/DypFontTextCur/GrfontStyleTextCur/OnnTextCur
export const selTbSels = new Map(); // each TBXG keeps its own caret/selection (_cpAnchor/_cpOther)
useEd.setState({ ed, tbPaint, selTbSels } as any);
