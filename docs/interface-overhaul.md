# Interface overhaul plan

Working plan for the `interface-updates` branch: single-canvas UI, i18n,
TypeScript + codebase split, LLM instructions, touch, and Chromecast.

**Status: all milestones M1–M10 shipped.** The canvas UI is the only UI
layer (`ui-dom/` deleted); remaining work is debt and follow-ups noted
inline (`.ts` renames deferred — see amended decision 8; live casting needs
a registered `?castid=`; ~14 baseline `tsc` errors in doc/opts/state).

## Current state (baseline)

- `index.html` is nearly empty: `#stage > #studio > canvas#view` (the 544×306
  three.js viewport) + a boot overlay div. **All** UI is built imperatively in
  `main.js` — ~155 DOM nodes per session (37 `img`, 37 `div`, 22 `button`,
  15 `canvas`, 11 `input`, misc).
- `src/main.js` = 3,676 lines, roughly:
  - boot splash + asset pack loading (~200 lines)
  - editor undo/redo, movie mutations, text boxes (~500)
  - render loop / options / playback (~150)
  - portfolio: open/save/autosave/URL loading (~180)
  - **studio chrome (~1,200)** — the editor interface built node-by-node
  - browsers, sound tools, easels: sorter, recorder, listener, words,
    spletter, action browser, costume (~1,000)
  - talent book, callout tips, theatre/embed modes (~350)
- `src/format`, `src/engine`, `src/render` are already cleanly separated
  (~3,000 lines total) and mostly DOM-free — good TypeScript candidates.
- Input is already ~80% Pointer Events (`pointerdown/move/up/cancel`) — a good
  foundation for touch. Legacy `mouse*` handlers remain in spots.
- Build: Vite 5 + three 0.169, plain JS, `node --test` for tests. No types,
  no lint config.
- i18n surface: ~25 `textContent`/`title` call sites in main.js plus many
  inline string literals in UI construction; the original game stored UI text
  in `GST` string chunks (Nick's CHKs ship them) — worth noting but JSON is
  the practical path.

## Guiding order

Refactor in dependency order so each phase lands green:

1. **Module split** (pure JS, zero behavior change) — disentangle main.js
   while the DOM UI still works, so every later phase touches small files.
2. **TypeScript** — bottom-up: `format/` → `engine/` → `render/` → new
   `app/` modules → `main.js` last (it shrinks to an entry point by then).
3. **i18n scaffolding** — before the canvas port, so new UI code is written
   against `t()` from day one instead of re-extracting strings later.
4. **Canvas UI framework** — the new core: view stack, element tree,
   hit-testing, animation system.
5. **Surface ports** — one screen at a time onto the framework, DOM version
   kept behind a flag until parity.
6. **Touch** — after pointer input is unified inside the framework.
7. **Chromecast** — last; depends on a stable theatre-mode entry point.
8. **Build perf + LLM docs** — ongoing, finalized at the end.

---

## Phase 1 — Split `main.js` (pure refactor)

Target layout (new code under `src/app/`, existing dirs untouched):

```
src/
  main.ts                  entry only: boot orchestration, URL params, glue
  app/
    boot.ts                splash, progress ticks, library load, ?packs=
    doc.ts                 open/save/autosave/portfolio/file pickers
    undo.ts                hist/opExec + docMark wiring
    edit/
      movie.ts             editBkgd/editCam/insActr/cut/nuke/sceneChop
      sound.ts             sound tool, easels' sound logic, user imports
      tbox.ts              text box editing
    state.ts               zustand stores: runtime singletons + editor state
    ui-dom/                ← temporary home for current DOM UI, verbatim
      studio.ts            the ~1,200-line studio chrome block
      browsers.ts          showBrowser/brwsShell/scene sorter
      easels.ts            recorder/listener/words/spletter/action/costume
      bio.ts               talent book
      tips.ts              callouts/guide
      modes.ts             theatre/embed entry
  format/ engine/ render/  unchanged (converted in Phase 2)
```

Rules: move code verbatim, export what other modules need, keep a single
`state.ts` for cross-cutting singletons rather than threading params through
30 functions. Commit per region so `git log -S` still finds history.

Status: **done** — main.js is a ~130-line boot orchestrator; `app/state.js`
currently holds hand-rolled `export let` + setter pairs. That module becomes
the zustand store in Phase 2 (see below).

## Phase 2 — TypeScript

- Add `typescript` devDep + `tsconfig.json` (`strict`, `moduleResolution:
  "bundler"`, `noEmit` — Vite transpiles TS natively; `tsc` is typecheck only).
- Script: `"typecheck": "tsc --noEmit"`; wire into `npm test` or CI.
- Rename bottom-up: `format/*` → `engine/*` → `render/*` → `app/*` → `main`.
  The format/engine files are already typed-adjacent (JSDoc comments,
  consistent data shapes) — define shared interfaces in `src/types.ts`
  (ChunkyFile handles, MBMP, TMPL/actor descriptors, URL param object).
  **Amended (decision 8):** the codebase shipped as `.js` + `allowJs`/
  `checkJs` + JSDoc instead — full typecheck coverage without the
  import-specifier churn; renames remain available as a follow-up.
- three.js ships its own types — no extra deps.
- **Test runner: vitest (decided).** Replaces `node --test`; it handles
  `.ts` natively, shares the Vite transform pipeline, and the existing tests
  port mechanically (assert API is compatible). Migrate test files to `.ts`
  alongside their modules.
- **State management: zustand (decided).** Replace the hand-rolled
  `app/state.js` lets+setters with `zustand/vanilla` `createStore` — the UI
  is not React, so use the vanilla entry (~1 kB, no framework). Migration is
  mechanical: each `export let x` + `setX` pair becomes a store field written
  via `set()`; readers go through `useApp.getState().x` or a destructured
  `useApp()` selector. **Landed** as stores-as-source-of-truth with a
  synchronous `export let` facade mirroring each field, so old call sites
  keep working while new code subscribes to slices.
  - Proposed slices: `useApp` — runtime singletons (`player`, `lib`, `pal`,
    `renderer`, `sounds`; non-serializable objects held as plain refs set
    once at boot, no reactivity needed); `useEd` — editor state (`tool`,
    `selChid`, `pendPlace`, `selTbChid`, `focusTbChid`, `tbSel`, `tbAttach`,
    `tbSnap`, `ed`, `tbPaint`); `useUi` — UI state (`playing`, view stack,
    open dialog/easel, tooltip, `modeSync`) added as the canvas framework
    lands.
  - Why it pays off here (not just convention): `subscribe` /
    `subscribeWithSelector` gives selector-based invalidation — the canvas
    renderer only repaints the regions whose backing slice changed (see
    Phase 4's dirty-region model), and roll calls/browsers can subscribe to
    `player`/`ed` slices instead of today's manual `syncStudio()` calls.
  - Mutable hot-path state that changes per-frame (actor positions, drag
    deltas) stays out of the store — zustand holds UI-relevant state, not
    the simulation tick.

## Phase 3 — i18n

- `src/i18n/`: `en.json` (source of truth), `index.ts` exposing
  `t(key, params?)`, `setLang()`, `LANGS`.
- Loader: `?lang=` URL param → `localStorage` → `navigator.language` → `en`.
  Lang JSONs fetched at boot like other `data/` assets (bundled via
  `import.meta.glob` so they're code-split per language).
- String extraction: every user-visible literal in `app/ui-dom/` gets a
  `t('studio.newMovie')`-style key. Do it during the canvas port — don't
  bother translating the DOM UI that's being deleted; translate as each
  surface is rewritten.
- Note: text baked into PNG textures (button faces, book covers) is art, not
  strings — out of scope for v1; the `GST` chunks in expansion files are the
  original's string tables if we ever want per-pack localization.
- RTL: defer; note in the i18n README.

## Phase 4 — Canvas UI framework (`src/ui/`)

The heart of the overhaul. **One canvas, decided:** the entire interface —
3D viewport included — renders into a single `<canvas>` at a fixed **640×480**
backing size, stretched to fill the window (CSS transform / canvas CSS size,
nearest-pixel or smooth per setting). This is what the original does and it
matters for two concrete reasons: the bitmapped UI fonts only rasterize
correctly at 1:1 in the 640×480 space (any DPR-scaled layout smears them),
and every control position in `studio.cht`/`browser.cht`/`easels.cht` is
authored in that exact coordinate space — pixel-perfect rects, no percentage
layout anywhere.

Compositing: three.js renders into an offscreen `WebGLRenderer` canvas at its
own internal resolution (the existing 544×306 screen region, upscaled by the
AA/scale settings); each RAF tick the UI canvas `drawImage`s that canvas into
the movie-screen rect, then draws chrome/thumbs/text on top. Blit must happen
synchronously after `renderer.render()` in the same frame (or set
`preserveDrawingBuffer`) — a WebGL canvas is only guaranteed blit-able within
its render task.

Core pieces — **class-first, decided:** the framework is a class hierarchy,
not a bag of constructor functions. Behavior lives in methods on named
classes so it's inheritable and discoverable; ad-hoc `el.draw = …` /
`el.onPointerDown = …` closures are a port-time convenience to be collapsed
into named subclasses, not the end state (see the class refactor in
Phase 5 / milestone 10).

- `UiRoot` — owns the 640×480 canvas, maps client coords → virtual coords,
  RAF-driven render loop that only repaints dirty regions (the UI is mostly
  static; don't redraw 60fps idle — the 3D view region repaints per-frame
  while playing).
- **State→render wiring** — elements subscribe to zustand store slices;
  `useEd`/`useUi` selectors mark their element's rect dirty on change, so a
  selChid change repaints just the roll-call strip and the status bar
  instead of today's whole-UI `syncStudio()` pass.
- `View` — a screen (studio / theatre / browser / easel / boot). Every
  surface is a `View` **subclass**: the constructor builds the element
  tree, lifecycle lives in `onEnter`/`onExit`/`onFrame`, and view-local
  helpers become private methods. View stack with push/pop/replace = the
  "routing" (modal dialogs push, back pops). The stack itself lives in the
  `useUi` store — view transitions and any "is a dialog open" checks are
  just selectors over it. **Landed as a published mirror:** `UiRoot` owns
  the stack array (cheap direct mutation) and mirrors `topView`/
  `stackDepth` into `useUi` on every `_rebuild` — selectors work, the hot
  path stays a plain array.
- `ModalView` (a `View` subclass) — shared modal semantics: the `brwsView`
  slot, Escape routing (`_onEsc` → method), DOM-overlay teardown, dimming.
  `EaselView` and `BrowserView` both extend it.
- `Element` tree — retained-mode widgets. Rect layout in absolute 640×480
  coords, straight from the original `.cht` positions — no % anywhere.
  Element classes are **subclassed for behavior**: press-state faces,
  sliders, paging grids, custom-drawn plates each get a named class
  (`Img`, `StBtn`, `VSlider`, `Txt`, `MovieScreen`, `Toast`, `Balloon`,
  `SorterCell`, `PopupMenu`, `ScrollBar`…). If two call sites override the
  same hooks, that's a missing subclass — extract it, don't copy the
  closure.
- `Input` — normalized pointer events → hit-test → focus/capture model.
  One dispatcher on `UiRoot`; keyboard focus for text entry.
- `Animator` — tween engine (position/opacity/scale, easing). API:
  `view.show({ in: 'fade' })`, `el.animate('out', { ms: 200 })`. Views get
  in/out transitions; transient elements (tooltips, callouts, toasts) get
  pop-in/fade-out. Keep it dependency-free (~100 lines) — don't pull in a
  tween lib for this.
- `Tooltip`/`Toast`/`Callout` — built on the element system (replaces the
  current DOM balloons; the GORT flex math for balloon arrows ports as-is).
- `Theme` — texture atlas loading (`texUrl`/`curUrl`/`packTex` already give
  per-pack override hooks — keep them).
- Text inputs on canvas are the hard part: pragmatic approach is a hidden
  `<input>` synced to the focused field (IME, selection, paste, a11y for
  free). Same for the file picker (`<input type=file>`) and recorder UI —
  plan these as explicit DOM exceptions, not failures of "single canvas".

Deliverable: the boot screen + one settings dialog running on the framework
before any mass port.

## Phase 5 — Port surfaces

Order by risk/value: boot → theatre/embed (smallest) → studio chrome →
browsers/grids → easels → talent book → callouts. No DOM-UI fallback flag —
the port is all-or-nothing per surface, git history is the escape hatch.
Delete `app/ui-dom/` files as each is replaced.

Port convention: each surface lands as **one file exporting one `View`
subclass** (e.g. `studio.js` → `StudioView`, `easels.js` → `SorterEasel`,
`ListenerEasel`, `SpletterEasel`, `CostumeEasel`… each a small class, not
one 800-line function). The `showFoo()` free functions remain as thin
exported factories (`showX = () => ui.push(new FooView())`) so call sites
don't churn — but the surface's state, children, and handlers live on the
class. When porting a second easel reveals the same pattern (paged grid,
scroll buttons, preview panel), that pattern becomes a shared subclass in
`widgets.js`/`easel.js` rather than a copy-paste.

## Phase 6 — Touch

- Framework already normalizes on Pointer Events — audit the remaining
  `mouse*`/`onmouse*` handlers and unify.
- Hit targets: scale-independent minimums (~44px CSS); the 640×480 UI is
  dense on a 7" screen — a `touchScale` theme factor for tablets.
- Gestures (in `Input`): tap vs. drag disambiguation (the studio relies on
  click-place and drag-move), two-finger pan on the stage, pinch zoom for
  camera move in theatre. Long-press = the hover/tooltip equivalent.
- Mobile phones in theatre mode: when `mode=theatre` + portrait + small
  screen, show a canvas-rendered "rotate device to watch" view (the plan's
  spec); in editor mode, allow it but the UI is tablet-first — document that.
- `touch-action`/`user-select` CSS cleanup + visualViewport handling for
  mobile browser chrome.

## Phase 7 — Chromecast

Honest constraint: **you can't cast a DOM element or a canvas stream to a
Chromecast**. CAF (Cast Application Framework) receivers are hosted web
pages; Chrome tab-mirroring casts everything. To cast "only the movie":

- Build a **receiver entry point** — a second Vite entry
  (`receiver.html` / `receiver.ts`) that boots the same app in a
  `mode=cast` view: movie render only, no editor chrome. It's the same
  codebase, so chunk sharing keeps it small.
- Sender side (`src/cast/`): Google Cast sender SDK, "Cast" button in
  theatre mode → launches the receiver (hosted on the GitHub Pages URL —
  HTTPS requirement is already satisfied) with the movie's URL + scene/
  frame/playback state as the load payload.
- Playback control: receiver exposes play/pause/seek via Cast messages; the
  sender's theatre UI stays visible locally and acts as the remote —
  matching the "editor background stays client-side" requirement.
- Needs a Cast developer account to register the receiver app ID (~$5) —
  until then, dev testing works with the SDK's default/styled receiver only
  for plain media, so local validation will mostly be the sender-UI side.
- Local movies (no URL): for `?3mm=` remote files the receiver just refetches.
  For user-uploaded/autosaved docs, either export-and-host is out of scope —
  document that casting requires a URL-loadable movie (or a future
  WebRTC-based local relay).
- Interaction with the single-canvas UI: none — the receiver is a separate
  page that instantiates the scene/player view only (no chrome), so the
  sender's one-canvas app stays intact locally. The receiver entry reuses
  `format/`+`engine/`+`render/` and a `mode=cast` view; if it ever needs to
  take over an in-progress local edit, the movie buffer can be exported and
  pushed to the receiver over the Cast message channel (size permitting) —
  note as a stretch goal.

## Phase 8 — Build performance

- `manualChunks`: split `three` into its own chunk; split `format/`+`engine/`
  (shared by receiver entry).
- `build.target: 'es2020'`+, `assetsInlineLimit` for small textures.
- `rollup-plugin-visualizer` as devDep for a size report.
- Fonts/data: `data/` + `textures/` stay in `public/` (correct — they're
  runtime-fetched); confirm no accidental inlining of the .3cn/.3th blobs.
- Evaluate `vite@7`/`rolldown-vite` upgrade separately — Vite 5 is fine;
  don't churn it in the same branch.
- TS typecheck runs `tsc --noEmit` (no emit cost); add `eslint`? Optional —
  discuss before adding a lint gate mid-refactor.

## LLM instruction files

- `AGENTS.md` at repo root — **done**: commands (dev/build/test/typecheck),
  architecture map (one line per module), conventions (chunky-file naming,
  comment style, "port code verbatim" rule, no comments unless explanatory).
- `docs/` deep-dives — **done**: `format-notes.md` (chunky/CHN2 primer, ctg
  tables, GST note), `ui-framework.md` (as-built view stack + element API +
  z-order rules), `asset-packs.md` (README section expanded).
- `.devin/skills/` — **done**, thin as planned: `add-easel`, `add-url-param`,
  `pack-manifest` — each points at AGENTS.md + the right doc.
- Rule for the docs: commands verified, no aspirational APIs — LLMs
  hallucinate less when docs match the code, so write them *as* phases land.

## Milestones / rough sequencing

| # | Deliverable | Depends on |
|---|-------------|-----------|
| 1 | `app/` split, tests green, no DOM changes — **done** (`0ecab38` series) | — |
| 2 | `tsc --noEmit` clean on `format/`/`engine/` + vitest migration + zustand stores (`state.js` → `useApp`/`useEd`/`useUi`) — **done** (`124c36f`) | 1 |
| 3 | `en.json` + `t()` + `?lang=` + a couple of surfaces using it — **done** (`f44c1e4`) | 1 |
| 4 | Canvas framework (single 640×480 canvas) + boot/theatre on it — **done** (`8330ab0`) | 2, 3 |
| 5 | Studio chrome + browsers ported — **done** (`2af81fe`) | 4 |
| 6 | Easels + tips ported; `app/ui-dom/` deleted — **done** (`80527e9`) | 5 |
| 7 | Touch pass + rotate-to-view — **done** (`d1c5fef`) | 4 |
| 8 | Cast receiver entry (same repo, second Vite entry) + sender button — **done** (`363511c`; live casting still needs a registered `?castid=`) | 4, needs Cast dev account |
| 9 | Build perf + AGENTS.md/docs finalized — **done** (`81bfa81`; `docs/ui-framework.md` etc. below) | all |
| 10 | **Class refactor pass** — **done** (`1a5829d`): easels/studio/browser internals collapsed into named `Element`/`View` subclasses (`SorterEasel`, `StudioView`, `BioView`, `ScrollBtn`, `Therm`, `LisSlider`, `FrmCell`…); factories stay thin. Post-pass layering fix: `Element.root` propagates on attach + `leavingUnder` (`d35d128`, `f6c3a6b`) | 6 |

## Decisions (locked)

1. **One canvas, 640×480 fixed space stretched to fit** — imperative for
   bitmap-font fidelity and pixel-perfect `.cht` layout; no % positioning.
   The 3D view is blitted into its screen rect each frame. Cast unaffected:
   the receiver is a separate page rendering just the player view.
2. **Vitest** replaces `node --test`.
3. **`?lang=`** for language override. No `?ui=` param — the DOM UI has no
   alternate-UI loading feature and gets no port-time flag; it goes away as
   surfaces land.
4. **Cast receiver = same repo, second Vite entry point.**
5. **GST chunks**: skip for v1. The original's `GST` string tables inside
   expansion `.chk` files could later provide per-pack UI strings — a
   possible `t()` override layer — but JSON lang files cover the need; note
   in `format-notes.md` for the future.
6. **Zustand for state management** — `zustand/vanilla` stores replace the
   hand-rolled `export let`+setter pairs landed in Milestone 1. Slices:
   `useApp` (engine singletons), `useEd` (editor state), `useUi` (view stack/
   playback/dialogs). Selector subscriptions drive canvas dirty-region
   invalidation; per-frame simulation state stays out of the store.
7. **Class-first UI code** — interface elements and views are named classes
   with behavior in methods, so shared logic is inherited/overridden rather
   than duplicated. Free functions are only thin factories/wiring
   (`showX()`), boot orchestration, or pure utilities; new UI code should
   add or extend a class, not grow a function body.
8. **Type checking via `checkJs`, not `.ts` renames** (amends Phase 2) —
   the codebase stays `.js` with `tsconfig` `allowJs`+`checkJs` and JSDoc
   types; `tsc --noEmit` is the gate and runs clean except ~14 documented
   baseline errors. The full `.ts` rename described above remains a valid
   follow-up but wasn't worth the import-specifier churn for this branch.
