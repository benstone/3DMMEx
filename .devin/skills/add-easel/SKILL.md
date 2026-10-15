---
name: add-easel
description: Add a new easel/modal surface to the canvas UI (e.g. a picker or editing dialog). Use when creating any screen that opens over the studio.
---

Read `AGENTS.md` and `docs/ui-framework.md` first — the framework rules
(class-first, root propagation, texture async) are non-negotiable.

Recipe:

1. Create a `View` subclass — modals extend `EaselView`
   (`src/app/ui/easel.js`) so they get the `brwsView` slot, Escape routing,
   and DOM-input teardown for free. `BrowserView` (`ui/browser.js`) is the
   right base for book-style paged pickers.
2. Build the element tree in the constructor: `this.mkImg(name, x,y,w,h)`
   for textures, `this.mkBtn(up,dn,x,y,w,h,act,tip)` for buttons,
   `this.domInp(x,y,w,h)` for text entry (stays real DOM — see "Modals and
   DOM overlays" in ui-framework.md). GL previews: render into `offCv()` and
   wrap in `CvEl` — never drawImage a live WebGL canvas mid-frame.
3. Textures via `texImg(name, () => this.dirty())` — async; guard every
   `drawImage` with `imgReady(im)`.
4. Export a thin factory next to the class:
   `export const showFoo = () => showEasel(new FooEasel());`
5. All user-visible strings go through `t('key')` — add keys to
   `src/lang/en.json` AND `public/lang/en.json`.
6. Element positions are absolute 640×480 pixels from the original's `.cht`
   coordinates — no percentages.
7. If the easel repeats a widget pattern seen elsewhere (paged grid, scroll
   arrows, therm), extract a shared subclass into `easel.js` instead of
   duplicating the closure.

Verify: `npx vite build`, `npx vitest run`, `npx tsc --noEmit` (14 baseline
errors are expected — don't add new ones).
