# 3DMM Web — agent guide

A web port of Microsoft 3D Movie Maker's studio/editor, reconstructed from the
original's behavior (`.cht` control positions, GORT tiling, TDT text boxes,
GUID-chunk actor references). The whole app renders into **one canvas at a
fixed 640×480 virtual space**, CSS-stretched to fit — coordinates are always
logical pixels, never percentages.

## Commands

- `npm run dev` — Vite dev server (expansion packs served from `/expansions`)
- `npm test` — Vitest (`test/*.test.js`, node env)
- `npx vite build` — production build (emits `index.html` + `receiver.html`)
- `npx tsc --noEmit` — JSDoc typecheck (`allowJs`+`checkJs`). ~14 errors remain
  in `app/doc.js`, `app/opts.js`, `app/state.js` (dynamic DOM props,
  `showSaveFilePicker`) — known baseline, don't "fix" by weakening types.

## Layout

```
src/main.js            boot orchestrator (only import graph + URL params)
src/receiver.js        Chromecast CAF receiver entry (receiver.html)
src/app/
  state.js             zustand stores (useApp/useUi/useEd) + `export let` facade + setters
  res.js               B/texUrl/curUrl/$/sleep/say
  undo.js  boot.js  packs.js  thumbs.js  doc.js  loop.js  opts.js  sndsrc.js  cast.js
  edit/                movie/sound/tbox mutations
  ui/                  canvas UI — the ONLY UI layer (ui-dom/ is gone)
    root.js            UiRoot: 640x480 canvas, view stack, pointer dispatch, toast, tips layer
    element.js         Element (hitTest/pickable/cursor/dirty), anim.js Animator
    widgets.js         Img ImgButton TextLink StBtn VSlider Txt MovieScreen
    studio.js          editor chrome + movie-view interaction (all pointer events)
    browser.js         book browsers (scene/actor/prop/sound pickers) + brwsView slot
    easel.js/easels.js EaselView shell + scene sorter, recorder, listener, spletter,
                       action browser, costume easel (GL previews blitted via CvEl)
    bio.js  tips.js  bootview.js  theatre.js  castview.js  optdlg.js
src/engine/            chunky-file parse, library, player, sound (spessasynth MIDI)
src/format/            .3mm/.3cn/.chk parsing + writing
src/render/            three.js renderer (renders into #view)
```

## Architecture rules

- **One canvas.** `#ui` (640×480) is the only interactive surface; `#view` is
  the WebGL canvas, blitted by `MovieScreen` (needs `preserveDrawingBuffer`).
  No absolutely-positioned DOM UI except: `#boot` splash, `optModal` settings
  dialog, `#rotMsg` rotate prompt, and easel `<input>` overlays (`domOverlay`,
  torn down on view pop via `EaselView.onExit`).
- **View stack.** `ui.push(view, 'none'|'fade')`, `ui.pop()`, `ui.replace()`.
  `onEnter`/`onExit` fire on cover/uncover AND push/pop — check
  `ui.stack.includes(this)` to distinguish.
- **Class-first UI.** Views and elements are named classes with behavior in
  methods — subclass `View`/`Element`/`StBtn` instead of assigning
  `el.draw = …`/`el.onPointerDown = …` closures or growing a function body.
  Free functions are thin factories (`showX()`), boot wiring, or pure
  utilities. If two sites need the same custom element, it's a missing
  widget subclass — add it to `widgets.js`/`easel.js`.
- **Modal slot.** `brwsView`/`brwsCleanup` in browser.js is the single
  browser-or-easel slot; `showEasel()` closes whatever is up; Escape routes
  through `brwsView._onEsc || closeBrowser`.
- **State.** Mutable singletons live in zustand stores; the `export let`
  bindings in state.js are a synced facade — write via the `set*` setters,
  never assign imports. Per-frame sim state stays out of the stores.
- **Hit testing.** `pickable=false` exempts only the element itself; children
  remain testable. Pointer events bubble up via `_walkUp` until a handler
  returns true.
- **i18n.** `t('section.key')` from `src/lang/en.json` (bundled) merged with
  `public/lang/<lang>.json` via `?lang=`. Sync both en.json files. Texture-
  baked text is art, not strings.
- **Type style.** JS + JSDoc. Ad-hoc element fields are declared as
  `/** @type {El & {_x: T}} */` or in constructors — keep the pattern.

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

- `open` in doc.js shadows `window.open` — always import it.
- `pop()` does NOT call `onExit` — callers that remove a view directly must
  call it (see `closeBrowser`).
- Tuple destructuring widens — annotate `[El, number, string][]` loops.
- `new Promise(r => r())` needs a `Promise<void>` JSDoc hint for tsc.
- Casting requires a URL-loadable movie (`lastMovieUrl` in doc.js) and a
  registered CAF app id; `receiver.html` also runs standalone via `?3mm=`.
- Test hooks for automation live on `window.__mms` (doc.js).
