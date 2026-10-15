// Cross-module app state. The zustand stores (useAppState/useUiState/
// useEditState) are the source of truth and the subscription surface —
// elements subscribe to a single field and repaint only when it changes.
// `appState` is the singleton accessor facade: plain getters that read
// through to the stores, and set* methods that write through.
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

/** Engine-object store — library, palette, renderer, sound queue, player. */
export const useAppState = createStore(subscribeWithSelector(() => ({
    contentLibrary: null, socialPalette: null, sceneRenderer: null, soundQueue: null, moviePlayer: null,
})));
/** UI-shell store — playback flag, mode-sync callback, view-stack surface. */
export const useUiState = createStore(subscribeWithSelector(() => ({
    playing: false,
    modeSync: null, // theatre/embed UI follow-callback (set by enterTheatre/enterEmbed)
    topView: null,  // published by UiRoot._rebuild — selector surface for
    stackDepth: 0,  // "is a dialog open" (stackDepth > 1) / view transitions
})));
/** Editor-selection store — actor/textbox selection ids, caret state,
 *  pending placement, and the last view-space pointer point. */
export const useEditState = createStore(subscribeWithSelector(() => ({
    selectedChildId: -1, pendingPlacement: null,
    selectedTextboxId: -1, focusedTextboxId: -1, textboxSelection: null,
    textboxAttachment: null, textboxSnapshot: null, lastViewPoint: null,
})));

/** Singleton facade over the three stores — getters read through, `set*`
 *  methods write through. Read with `appState.moviePlayer`, write with
 *  `appState.setMoviePlayer(p)`. */
class AppState {
  // --- engine objects (useAppState) — each `x` getter reads the store field;
  //     each `setX(v)` writes it and returns v so callers can chain. ---------
  /** The content library (templates/sounds catalog). */
  get contentLibrary() { return useAppState.getState().contentLibrary; }
  /** Set the content library. */
  setContentLibrary(v) { useAppState.setState({ contentLibrary: v }); return v; }
  /** The social 8-bit palette used for swatches/textbox colors. */
  get socialPalette() { return useAppState.getState().socialPalette; }
  /** Set the social palette. */
  setSocialPalette(v) { useAppState.setState({ socialPalette: v }); return v; }
  /** The Three.js scene renderer. */
  get sceneRenderer() { return useAppState.getState().sceneRenderer; }
  /** Set the scene renderer. */
  setSceneRenderer(v) { useAppState.setState({ sceneRenderer: v }); return v; }
  /** The sound-effect/music queue. */
  get soundQueue() { return useAppState.getState().soundQueue; }
  /** Set the sound queue. */
  setSoundQueue(v) { useAppState.setState({ soundQueue: v }); return v; }
  /** The movie player (timeline state + scene runtime). */
  get moviePlayer() { return useAppState.getState().moviePlayer; }
  /** Set the movie player. */
  setMoviePlayer(v) { useAppState.setState({ moviePlayer: v }); return v; }

  // --- ui surface (useUiState) — same get/set* delegate pattern. -------------
  /** True while the movie is playing. */
  get playing() { return useUiState.getState().playing; }
  /** Set the playing flag. */
  setPlaying(v) { useUiState.setState({ playing: v }); return v; }
  /** Theatre/embed follow-callback — resyncs their chrome on mode changes. */
  get modeSync() { return useUiState.getState().modeSync; }
  /** Set the mode-sync callback. */
  setModeSync(v) { useUiState.setState({ modeSync: v }); return v; }
  /** The topmost view on the uiRoot stack (published for subscribers). */
  get topView() { return useUiState.getState().topView; }
  /** Set the published top view. */
  setTopView(v) { useUiState.setState({ topView: v }); return v; }
  /** View-stack depth — >1 means a modal/browser is open. */
  get stackDepth() { return useUiState.getState().stackDepth; }
  /** Set the published stack depth. */
  setStackDepth(v) { useUiState.setState({ stackDepth: v }); return v; }

  // --- editor selections (useEditState) — same get/set* delegate pattern. ----
  /** Selected actor/prop's child id (-1 = none). */
  get selectedChildId() { return useEditState.getState().selectedChildId; }
  /** Set the selected child id. */
  setSelectedChildId(v) { useEditState.setState({ selectedChildId: v }); return v; }
  /** Armed placement request — a picker's pending insert awaiting a stage click. */
  get pendingPlacement() { return useEditState.getState().pendingPlacement; }
  /** Set the pending placement. */
  setPendingPlacement(v) { useEditState.setState({ pendingPlacement: v }); return v; }
  /** Border-selected textbox's id (-1 = none). */
  get selectedTextboxId() { return useEditState.getState().selectedTextboxId; }
  /** Set the border-selected textbox id. */
  setSelectedTextboxId(v) { useEditState.setState({ selectedTextboxId: v }); return v; }
  /** Interior-focused (caret) textbox's id (-1 = none). */
  get focusedTextboxId() { return useEditState.getState().focusedTextboxId; }
  /** Set the focused textbox id. */
  setFocusedTextboxId(v) { useEditState.setState({ focusedTextboxId: v }); return v; }
  /** The focused box's {anchor, other} caret pair. */
  get textboxSelection() { return useEditState.getState().textboxSelection; }
  /** Set the caret pair. */
  setTextboxSelection(v) { useEditState.setState({ textboxSelection: v }); return v; }
  /** The box the tools popup is attached to (if any). */
  get textboxAttachment() { return useEditState.getState().textboxAttachment; }
  /** Set the tools-popup attachment. */
  setTextboxAttachment(v) { useEditState.setState({ textboxAttachment: v }); return v; }
  /** Pre-edit snapshot of the focused box's runs — undo seed. */
  get textboxSnapshot() { return useEditState.getState().textboxSnapshot; }
  /** Set the undo-seed snapshot. */
  setTextboxSnapshot(v) { useEditState.setState({ textboxSnapshot: v }); return v; }
  /** Last pointer position in view coords — drops land here. */
  get lastViewPoint() { return useEditState.getState().lastViewPoint; }
  /** Set the last view-space pointer point. */
  setLastViewPoint(v) { useEditState.setState({ lastViewPoint: v }); return v; }

  // Shared mutable objects — property changes are legal from any module.
  // They also live inside useEditState's initial state (same references).

  /** Editor tool state — xy = XY-plane drag (vs ground), ground = ground-plane
   *  drag, tool = active secondary tool, soundTag = tool's pending sound tag,
   *  pauseSound = pause-sounds toggle. */
  editorTools: { xy: boolean; ground: boolean; tool: string; soundTag: any; pauseSound: boolean; [k: string]: any } =
    { xy: false, ground: false, tool: 'compose',
      soundTag: null, pauseSound: false };
  /** Textbox paint state — pending color/size/style/font applied by the
   *  paint tools (acr -1 = inherit). */
  textboxPaint: { acr: number; dyp: number; grfont: number; font: any; [k: string]: any } =
    { acr: -1, dyp: 14, grfont: 0, font: null };
  /** Per-textbox caret/selection state — each focused box keeps its own
   *  anchor/caret pair, keyed by the textbox record. */
  textboxSelections = new Map();
}

/** The singleton facade — import this, not the stores, for plain reads/writes. */
export const appState = new AppState();
useEditState.setState({ editorTools: appState.editorTools, textboxPaint: appState.textboxPaint, textboxSelections: appState.textboxSelections } as any);
