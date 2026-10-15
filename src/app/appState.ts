// Cross-module app state. The zustand stores (useAppState/useUiState/
// useEditState) are the source of truth and the subscription surface —
// elements subscribe to a single field and repaint only when it changes.
// `appState` is the singleton accessor facade: plain properties that read
// through to the stores and setter methods that write through.
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

// subscribeWithSelector enables store.subscribe(selector, cb[, opts]).
export const useAppState = createStore(subscribeWithSelector(() => ({
    contentLibrary: null, socialPalette: null, sceneRenderer: null, soundQueue: null, moviePlayer: null,
})));
export const useUiState = createStore(subscribeWithSelector(() => ({
    playing: false,
    modeSync: null, // theatre/embed UI follow-callback (set by enterTheatre/enterEmbed)
    topView: null,  // published by UiRoot._rebuild — selector surface for
    stackDepth: 0,  // "is a dialog open" (stackDepth > 1) / view transitions
})));
export const useEditState = createStore(subscribeWithSelector(() => ({
    selectedChildId: -1, pendingPlacement: null,
    selectedTextboxId: -1, focusedTextboxId: -1, textboxSelection: null,
    textboxAttachment: null, textboxSnapshot: null, lastViewPoint: null,
})));

class AppState {
  // --- engine objects (useAppState) -----------------------------------------
  get contentLibrary() { return useAppState.getState().contentLibrary; }
  setContentLibrary(v) { useAppState.setState({ contentLibrary: v }); return v; }
  get socialPalette() { return useAppState.getState().socialPalette; }
  setSocialPalette(v) { useAppState.setState({ socialPalette: v }); return v; }
  get sceneRenderer() { return useAppState.getState().sceneRenderer; }
  setSceneRenderer(v) { useAppState.setState({ sceneRenderer: v }); return v; }
  get soundQueue() { return useAppState.getState().soundQueue; }
  setSoundQueue(v) { useAppState.setState({ soundQueue: v }); return v; }
  get moviePlayer() { return useAppState.getState().moviePlayer; }
  setMoviePlayer(v) { useAppState.setState({ moviePlayer: v }); return v; }

  // --- ui surface (useUiState) ------------------------------------------------
  get playing() { return useUiState.getState().playing; }
  setPlaying(v) { useUiState.setState({ playing: v }); return v; }
  get modeSync() { return useUiState.getState().modeSync; }
  setModeSync(v) { useUiState.setState({ modeSync: v }); return v; }
  get topView() { return useUiState.getState().topView; }
  setTopView(v) { useUiState.setState({ topView: v }); return v; }
  get stackDepth() { return useUiState.getState().stackDepth; }
  setStackDepth(v) { useUiState.setState({ stackDepth: v }); return v; }

  // --- editor selections (useEditState) ---------------------------------------
  get selectedChildId() { return useEditState.getState().selectedChildId; }
  setSelectedChildId(v) { useEditState.setState({ selectedChildId: v }); return v; }
  get pendingPlacement() { return useEditState.getState().pendingPlacement; }
  setPendingPlacement(v) { useEditState.setState({ pendingPlacement: v }); return v; }
  get selectedTextboxId() { return useEditState.getState().selectedTextboxId; }
  setSelectedTextboxId(v) { useEditState.setState({ selectedTextboxId: v }); return v; }
  get focusedTextboxId() { return useEditState.getState().focusedTextboxId; }
  setFocusedTextboxId(v) { useEditState.setState({ focusedTextboxId: v }); return v; }
  get textboxSelection() { return useEditState.getState().textboxSelection; }
  setTextboxSelection(v) { useEditState.setState({ textboxSelection: v }); return v; }
  get textboxAttachment() { return useEditState.getState().textboxAttachment; }
  setTextboxAttachment(v) { useEditState.setState({ textboxAttachment: v }); return v; }
  get textboxSnapshot() { return useEditState.getState().textboxSnapshot; }
  setTextboxSnapshot(v) { useEditState.setState({ textboxSnapshot: v }); return v; }
  get lastViewPoint() { return useEditState.getState().lastViewPoint; }
  setLastViewPoint(v) { useEditState.setState({ lastViewPoint: v }); return v; }

  // Shared mutable objects — property changes are legal from any module.
  // They also live inside useEditState's initial state (same references).
  // (studio.cht kidBackground flags: fXYAxis/fRGround = fFalse)
  editorTools: { xy: boolean; ground: boolean; tool: string; soundTag: any; pauseSound: boolean; [k: string]: any } =
    { xy: false, ground: false, tool: 'compose', // tool = active secondary tool
      soundTag: null, pauseSound: false }; // _tagTool / fpseDown
  textboxPaint: { acr: number; dyp: number; grfont: number; font: any; [k: string]: any } =
    { acr: -1, dyp: 14, grfont: 0, font: null }; // AcrPaint/DypFontTextCur/GrfontStyleTextCur/OnnTextCur
  textboxSelections = new Map(); // each TBXG keeps its own caret/selection (_cpAnchor/_cpOther)
}

export const appState = new AppState();
useEditState.setState({ editorTools: appState.editorTools, textboxPaint: appState.textboxPaint, textboxSelections: appState.textboxSelections } as any);
