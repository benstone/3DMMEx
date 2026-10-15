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
  state.ts             zustand stores (useApp/useUi/useEd) + `export let` facade + setters
  res.ts               B/texUrl/curUrl/$/sleep/say
  undo.ts  boot.ts  packs.ts  thumbs.ts  doc.ts  loop.ts  opts.ts  sndsrc.ts  cast.ts
  edit/                movie/sound/tbox mutations
  ui/                  canvas UI — the ONLY UI layer (ui-dom/ is gone)
    root.ts            UiRoot: 640x480 canvas, view stack, pointer dispatch, toast, tips layer
    element.ts         Element (hitTest/pickable/cursor/dirty), anim.ts Animator
    widgets.ts         Img ImgButton TextLink StBtn VSlider Txt MovieScreen
    studio.ts          editor chrome + movie-view interaction (all pointer events)
    browser.ts         book browsers (scene/actor/prop/sound pickers) + brwsView slot
    easel.ts/easels.ts EaselView shell + scene sorter, recorder, listener, spletter,
                       action browser, costume easel (GL previews blitted via CvEl)
    bio.ts  tips.ts  bootview.ts  theatre.ts  castview.ts  optdlg.ts
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
  widget subclass — add it to `widgets.ts`/`easel.ts`.
- **Modal slot.** `brwsView`/`brwsCleanup` in browser.ts is the single
  browser-or-easel slot; `showEasel()` closes whatever is up; Escape routes
  through `brwsView._onEsc || closeBrowser`.
- **State.** Mutable singletons live in zustand stores; the `export let`
  bindings in state.ts are a synced facade — write via the `set*` setters,
  never assign imports. Per-frame sim state stays out of the stores.
- **Hit testing.** `pickable=false` exempts only the element itself; children
  remain testable. Pointer events bubble up via `_walkUp` until a handler
  returns true.
- **i18n.** `t('section.key')` from `src/lang/en.json` (bundled) merged with
  `public/lang/<lang>.json` via `?lang=`. Sync both en.json files. Texture-
  baked text is art, not strings.
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

- `open` in doc.ts shadows `window.open` — always import it.
- `pop()` does NOT call `onExit` — callers that remove a view directly must
  call it (see `closeBrowser`).
- Tuple destructuring widens — annotate `[El, number, string][]` loops.
- `new Promise(r => r())` needs a `Promise<void>` type arg for tsc.
- Casting requires a URL-loadable movie (`lastMovieUrl` in doc.ts) and a
  registered CAF app id; `receiver.html` also runs standalone via `?3mm=`.
- Test hooks for automation live on `window.__mms` (doc.ts).
