# Interface overhaul plan

Working plan for the `interface-updates` branch: single-canvas UI, i18n,
TypeScript + codebase split, LLM instructions, touch, and Chromecast.

**Status: all milestones M1–M10 shipped; every phase bullet is marked
✅ / ⏸️ below. The full codebase is `.ts` and `tsc --noEmit` is clean.**
The canvas UI is the only UI layer (`ui-dom/` deleted). Remaining
deferrals (all conscious, marked ⏸️): RTL, two-finger pan / pinch-zoom /
`touchScale`, a registered `?castid=` for live casting, `vite@7`, eslint.

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

- ✅ Add `typescript` devDep + `tsconfig.json` (`strict`, `moduleResolution:
  "bundler"`, `noEmit` — Vite transpiles TS natively; `tsc` is typecheck only).
- ✅ Script: `"typecheck": "tsc --noEmit"` in package.json. Deliberately
  **not** wired into `npm test` — the ~14 baseline errors would gate the
  suite; run explicitly or in CI.
- ✅ Rename bottom-up: **all `src/**/*.js` → `.ts`** (44 source modules plus
  `main`/`receiver` entries) and `test/*.js` → `.ts`; relative import
  specifiers rewritten `.js` → `.ts` via `allowImportingTsExtensions`;
  `index.html`/`receiver.html` entries updated. `strict:false` /
  `noImplicitAny:false` kept as the migration posture — errors were driven
  2,454 → 0 with index signatures on dynamic-prop classes (`Element`,
  engine/format/render classes), `Record<…,any>`/`any[]` annotations on
  inferred-narrow literals (`TB`, `OPT_DEFS`, `els`, `coblnImgs`…), optional
  params where JS arity was loose, and `Window` globals in `types.d.ts`.
  `tsc --noEmit` is **clean** (no remaining baseline).
- ✅ Shared interfaces → `src/types.d.ts` (ambient globals + `Window`
  declarations: `player`, `sounds`, `renderer`, `showSaveFilePicker`, …).
- ✅ three.js ships its own types — no extra deps.
- ✅ **Test runner: vitest (decided).** Replaces `node --test`; shares the
  Vite transform pipeline. Test files renamed to `.ts` with the sources.
- ✅ **State management: zustand (decided).** `zustand/vanilla` `createStore`
  (~1 kB, no React). **Landed** as stores-as-source-of-truth with a
  synchronous `export let` facade mirroring each field, so old call sites
  keep working while new code subscribes to slices.
  - ✅ Slices: `useApp` — runtime singletons (`player`, `lib`, `pal`,
    `renderer`, `sounds`; non-serializable refs set once at boot); `useEd` —
    editor state (`ed`/`tool`, `selChid`, `pendPlace`, `selTbChid`,
    `focusTbChid`, `tbSel`, `tbAttach`, `tbSnap`, `tbPaint`, `selTbSels`,
    `lastViewPt`); `useUi` — `playing`, `modeSync`, `topView`, `stackDepth`
    ("open dialog" = `stackDepth > 1`).
  - ✅ `subscribeWithSelector` middleware enabled on all three stores —
    `store.subscribe(selector, cb)` gives selector-based invalidation:
    StudioView repaints the play button on `useUi.playing` and re-keys the
    roll calls on `useEd.selChid` rather than relying on callers
    remembering `syncStudio()`.
  - ✅ Mutable hot-path state that changes per-frame (actor positions, drag
    deltas) stays out of the store — zustand holds UI-relevant state, not
    the simulation tick.

## Phase 3 — i18n

- ✅ `src/lang/en.json` (source of truth, bundled synchronously) +
  `src/app/i18n.js` exposing `t(key, args?)`, `setLang()`, `LANGS`,
  `initLang()`.
- ✅ Loader chain: `?lang=` URL param → `localStorage('lang3dmm')` →
  `navigator.language` (`?lang=auto`) → `en`. Lang JSONs live in
  `public/lang/` and are fetched on demand — landed *instead of*
  `import.meta.glob`, which keeps dictionaries entirely out of the JS
  chunks (better than code-split for the same goal).
- ✅ String extraction: tips, render-options labels, boot progress, pack
  toasts, browser/easel labels, theatre links, cast strings are all `t()`'d.
- ✅ Note: text baked into PNG textures (button faces, book covers) is art,
  not strings — out of scope for v1; the `GST` chunks in expansion files
  are the original's string tables (see `docs/format-notes.md`).
- ⏸️ RTL: deferred (documented).

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

- ✅ `UiRoot` — owns the 640×480 canvas, maps client coords → virtual coords,
  RAF-driven render loop that only repaints dirty regions (the UI is mostly
  static; don't redraw 60fps idle — the 3D view region repaints per-frame
  while playing).
- ✅ **State→render wiring** — elements subscribe to zustand store slices;
  `useEd`/`useUi` selectors mark their element's rect dirty on change
  (`subscribeWithSelector`; landed in StudioView for `playing`/`selChid`).
- ✅ `View` — a screen (studio / theatre / browser / easel / boot). Every
  surface is a `View` **subclass**: the constructor builds the element
  tree, lifecycle lives in `onEnter`/`onExit`, and view-local
  helpers are methods. View stack with push/pop/replace = the
  "routing" (modal dialogs push, back pops). The stack itself lives in the
  `useUi` store — view transitions and any "is a dialog open" checks are
  just selectors over it. **Landed as a published mirror:** `UiRoot` owns
  the stack array (cheap direct mutation) and mirrors `topView`/
  `stackDepth` into `useUi` on every `_rebuild` — selectors work, the hot
  path stays a plain array.
- ✅ `ModalView` (a `View` subclass in `modal.ts` — a leaf module, so the
  `extends` base can never be mid-init when subclasses evaluate; this
  replaced an in-browser.ts definition that sat inside an import cycle
  and caused a runtime TDZ) — shared modal semantics: the `modalView`
  slot, Escape routing (`_onEsc` → method), DOM-overlay teardown (`_dom`,
  hidden-when-covered / removed-when-popped). `EaselView` and
  `BrowserView` both extend it; `browser.ts` re-exports the slot under
  the `brws*` names.
- ✅ `Element` tree — retained-mode widgets. Rect layout in absolute 640×480
  coords, straight from the original `.cht` positions — no % anywhere.
  Element classes are **subclassed for behavior**: press-state faces,
  sliders, paging grids, custom-drawn plates each get a named class
  (`Img`, `StBtn`, `VSlider`, `Txt`, `MovieScreen`, `Toast`, `BrwsCell`,
  `RcCell`, `SCell`, `FrmCell`, `LisSlider`, `ScrollBtn`, `Therm`,
  `NamePlate`…). If two call sites override the same hooks, that's a
  missing subclass — extract it, don't copy the closure.
- ✅ `Input` — normalized pointer events → hit-test → capture model on
  `UiRoot` (pointerdown captures the hit element; click = up on the same
  element; events bubble to ancestors). Keyboard focus for text entry is
  delegated to the DOM overlay inputs (below).
- ✅ `Animator` — tween engine (`anim.js`, ~40 lines): `ui.anim.tween(
  target, {prop: end}, {dur, ease, done})` plus `el.animate(to, opts)` —
  the plan's element-level API. View in/out transitions run through
  `push`/`pop`/`replace` anim params; toasts/balloons fade via tweens.
- ✅ `Tooltip`/`Toast`/`Callout` — `ui.toast` layer + canvas callout
  balloons in `ui.tips` (GORT-sliced `coblln`, long-press on touch).
- ✅ `Theme` — texture atlas loading (`texUrl`/`curUrl`/`packTex` give
  per-pack override hooks — kept).
- ✅ Text inputs on canvas are the hard part: pragmatic approach is a real
  `<input>` floated over the canvas at logical coords by `domOverlay()` —
  IME, selection, paste, a11y for free; tracked per-view and torn down by
  `ModalView`. Same for the file picker — explicit DOM exceptions, not
  failures of "single canvas".

✅ **Deliverable landed:** boot screen + all surfaces on the framework.

Deliverable: the boot screen + one settings dialog running on the framework
before any mass port.

## Phase 5 — Port surfaces — ✅ done

Order by risk/value: boot → theatre/embed (smallest) → studio chrome →
browsers/grids → easels → talent book → callouts. No DOM-UI fallback flag —
the port was all-or-nothing per surface; `app/ui-dom/` is deleted.

Port convention landed: each surface is **one file exporting `View`
subclasses** (`studio.js` → `StudioView`, `easels.js` → `SorterEasel`/
`ListenerEasel`/`SpletterEasel`/`CostumeEasel`/`RecorderEasel`/`ActionBrowser`/
`WordsDlg`…). The `showFoo()` free functions remain as thin exported
factories so call sites didn't churn. Repeated patterns became shared
subclasses in `easel.js`/`widgets.js` (`ScrollBtn`, `FrmCell`, `LisSlider`,
`Therm`, `NamePlate`).

## Phase 6 — Touch

- ✅ Framework normalizes on Pointer Events — no `mouse*`/`onmouse*`
  handlers remain in `src/`.
- ⏸️ Hit-target minimums / `touchScale` theme factor — **deferred**: the UI
  renders a fixed 640×480 `.cht` layout; scaling hit rects independently
  would decouple them from the authored art. The whole canvas stretches to
  fit so physical target size scales with the window — editor is
  tablet-first as documented below.
- ✅ Gestures: tap vs. drag disambiguation comes free with the
  capture-on-pointerdown model; long-press = the hover/tooltip equivalent
  (implemented in `tips.js`). ⏸️ two-finger pan on the stage and pinch-zoom
  for camera move — **deferred**: there is nothing to pan in a fixed-fit
  640×480 layout, and camera dolly needs engine camera work — follow-up.
- ✅ Mobile phones in theatre mode: portrait + coarse pointer + small screen
  shows the "rotate device to watch" prompt; editor mode is allowed but
  tablet-first.
- ✅ `touch-action`/`user-select` CSS done; mobile browser chrome handled
  via `100dvh`/`62dvh` units (visualViewport equivalent without JS).

## Phase 7 — Chromecast

Honest constraint: **you can't cast a DOM element or a canvas stream to a
Chromecast**. CAF (Cast Application Framework) receivers are hosted web
pages; Chrome tab-mirroring casts everything. To cast "only the movie":

- ✅ **Receiver entry point** — `receiver.html`/`src/receiver.js`, a second
  Vite entry booting a `CastView`: movie render only, no editor chrome.
- ✅ Sender side (`src/app/cast.js`): Cast sender SDK loaded lazily, "Cast"
  link in theatre mode launches the receiver with `{url, scene, frame,
  play, packs}` on `urn:x-cast:com.3dmmweb.movie`.
- ✅ Playback control: receiver handles `play`/`pause`/`seek`/`movie`
  messages; the sender retains the session (`castState`) and the theatre
  controls send `play`/`pause`/`seek` while `castState.active` — the
  theatre literally becomes the remote; session-end clears it.
- ⏸️ Needs a Cast developer account to register the receiver app ID (~$5) —
  external prerequisite; pass `?castid=` once registered. Failure paths
  toast gracefully until then.
- ✅ Local movies (no URL): documented — casting requires a URL-loadable
  movie (`?3mm=` remote files refetch on the receiver; autosaved/local docs
  can't be handed off — future WebRTC relay is the stretch goal).
- ✅ Interaction with the single-canvas UI: none — the receiver is a
  separate page instantiating the player view only.

## Phase 8 — Build performance

- ✅ `manualChunks`: `three`/`synth`/`vendor`/`sound` split into their own
  chunks — all under the 500 kB warning, shared by both entries.
- ✅ `build.target: 'es2022'` (exceeds es2020) + `assetsInlineLimit: 0` —
  nothing runtime-fetched ever gets inlined.
- ✅ `rollup-plugin-visualizer` devDep — `ANALYZE=1 npx vite build` emits
  `dist/stats.html` (treemap, gzip sizes); gated so normal builds skip it.
- ✅ Fonts/data: `data/` + `textures/` stay in `public/` — no bundling.
- ⏸️ `vite@7`/`rolldown-vite` — deferred deliberately; Vite 5 is fine.
- ✅ TS typecheck runs `npx tsc --noEmit` / `npm run typecheck` (no emit
  cost). ⏸️ eslint — optional, not added.

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
8. **Source is `.ts`; `tsc --noEmit` is clean** (amends the earlier
   checkJs-only posture) — all source and test modules are TypeScript.
   Migration keeps `strict:false`/`noImplicitAny:false` so dynamic legacy
   patterns compile; index signatures and `Record`/`any` annotations mark
   the intentional-`any` seams for future tightening. JSDoc annotations
   remain but native annotations are preferred for new types.
