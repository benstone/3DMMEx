# 3DMM Web — agent guide

A web port of Microsoft 3D Movie Maker's studio/editor, reconstructed from the
original's behavior (`.cht` control positions, GORT tiling, TDT text boxes,
GUID-chunk actor references). The whole app renders into **one canvas at a
fixed 640×480 virtual space**, CSS-stretched to fit — coordinates are always
logical pixels, never percentages.

## Commands

- `npm run dev` — Vite dev server (expansion packs served from `/expansions`)
- `npm test` — Vitest (`test/*.test.ts`, node env)
- `npx vite build` — production build (emits `index.html` + `receiver.html`)
- `npx tsc --noEmit` — TypeScript typecheck, **clean** (all source is `.ts`,
  `allowImportingTsExtensions`; `strict:false`/`noImplicitAny:false` is the
  deliberate migration posture — don't weaken further).

## Layout

```
src/main.ts            boot orchestrator (only import graph + URL params)
src/receiver.ts        Chromecast CAF receiver entry (receiver.html)
src/app/
  appState.ts          `appState` singleton facade over zustand stores (useAppState/useUiState/useEditState)
  resources.ts         baseUrl/packTextures/textureUrl/cursorUrl/elementById/sleep + toastHost
  editHistory.ts  bootstrap.ts  expansionPacks.ts  thumbnails.ts  movieDocument.ts
  playbackLoop.ts  renderOptions.ts  soundSources.ts  stream.ts  localization.ts
  edit/                movieEdits.ts / soundEdits.ts / textboxEdits.ts (singleton classes)
  ui/                  canvas UI — the ONLY UI layer (ui-dom/ is gone)
    root.ts            UiRoot (`uiRoot`): 640x480 canvas, view stack, pointer dispatch, toast, tips layer
    element.ts         Element (hitTest/pickable/cursor/dirty), animator.ts Animator
    widgets.ts         ImageElement ImageButton TextLink StudioButton VerticalSlider TextElement MovieScreen
    studio.ts          StudioView + `studioHost` (chrome sync); all editor pointer events
    modal.ts           ModalView + `modalSlot` (leaf: no imports back into app/)
    assetBrowser.ts    AssetBrowserView book browsers (scene/actor/prop/sound pickers)
    easel.ts/easels.ts EaselView shell + easels, each with a static `.show()`:
                       SorterEasel RecorderEasel ListenerEasel WordsDialog
                       SpletterEasel ActionBrowser CostumeEasel (GL previews via CanvasEl)
    talentBook.ts  tooltips.ts  bootView.ts  theatre.ts  receiverView.ts  optionsDialog.ts
    textureCache.ts    `textureCache` singleton (image cache + decode prewarm)
    styles.ts          injectAppStyles() — all app CSS lives here (no style.css)
src/engine/            chunky-file parse, library, player, sound (spessasynth MIDI)
src/format/            .3mm/.3cn/.chk parsing + writing
src/render/            three.js renderer (renders into #view)
```

## Architecture rules

- **One canvas.** `#ui` (640×480) is the only interactive surface; `#view` is
  the WebGL canvas, blitted by `MovieScreen` (needs `preserveDrawingBuffer`).
  No absolutely-positioned DOM UI except: `#boot` splash, `optModal` settings
  dialog, `#rotMsg` rotate prompt, and easel `<input>` overlays
  (`EaselView.overlayElement`, torn down on view pop via `ModalView.onExit`).
- **View stack.** `uiRoot.push(view, 'none'|'fade')`, `uiRoot.pop()`,
  `uiRoot.replace()`. `onEnter`/`onExit` fire on cover/uncover AND push/pop —
  check `uiRoot.stack.includes(this)` to distinguish.
- **Class-first UI.** Views and elements are named classes with behavior in
  methods — subclass `View`/`Element`/`StudioButton` instead of assigning
  `el.draw = …`/`el.onPointerDown = …` closures or growing a function body.
  Stateful services are singleton classes (`appState`, `movieDocument`,
  `soundSources`, `thumbnails`, `editHistory`, `movieEdits`, `textboxEdits`,
  `soundEdits`, `studioHost`, `modalSlot`, `tooltips`, `talentBook`,
  `optionsDialog`, `toastHost`, `textureCache`, `bootSequence`, `bootView`,
  `playbackLoop`, `streamer`, `expansionPacks`, `renderOptionsPanel`).
  Modals open via `modalSlot.open(view)` or `SomeEasel.show()`. Free functions
  are factories, boot wiring, or pure utilities only.
- **Modal slot.** `modalSlot` in `modal.ts` (leaf module — never import app/ui
  modules from it) is the single browser-or-easel slot: `modalSlot.open(v)`
  closes whatever is up and pushes; `modalSlot.close()` tears down
  (`modalSlot.cleanup`); Escape routes through `modalSlot.view._onEsc`.
- **State.** Mutable singletons live in zustand stores behind the `appState`
  facade — write via the `set*` setters, never assign imports. Per-frame sim
  state stays out of the stores.
- **Hit testing.** `pickable=false` exempts only the element itself; children
  remain testable. Pointer events bubble up via `_walkUp` until a handler
  returns true.
- **i18n.** `localizer.translate('section.key', vars)` from `src/lang/en.json`
  (bundled) merged with `public/lang/<lang>.json` via `?lang=`. Sync both
  en.json files. Texture-baked text is art, not strings.
- **Type style.** TypeScript. Ad-hoc element fields ride on `Element`'s
  index signature (the codebase's documented transient-prop idiom);
  `Record<…,any>`/`any[]` annotations mark narrow-literal seams.

## URL params

`?3mm=<url>` remote movie · `?mode=theatre|embed` · `?scene= ?frame= ?play`
· `?packs=a,b` expansion pack paths · `?lang=` dictionary · `?opts=a,b`
render flags · `?menu` open settings · `?castid=` CAF receiver app id.

## Docs

`docs/interface-overhaul.md` (plan + locked decisions) ·
`docs/ui-framework.md` (canvas view/element API — read before UI work) ·
`docs/format-notes.md` (CHN2/chunky primer) · `docs/asset-packs.md`
(`?packs=` manifest + merge rules).

## Gotchas

- `pop()` does NOT call `onExit` — callers that remove a view directly must
  call it (see `modalSlot.close`).
- Tuple destructuring widens — annotate `[El, number, string][]` loops.
- `new Promise(r => r())` needs a `Promise<void>` type arg for tsc.
- Casting requires a URL-loadable movie (`movieDocument.lastMovieUrl`) and a
  registered CAF app id; `receiver.html` also runs standalone via `?3mm=`.
- Test hooks for automation live on `window.__mms` (movieDocument.ts).
