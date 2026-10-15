# Canvas UI framework

As-built reference for the retained-mode canvas UI in `src/app/ui/`. This
documents what the code does today — for the rationale see
`interface-overhaul.md` Phase 4.

## The one-canvas model

The entire interface is drawn into a single `<canvas id="ui">` with a fixed
**640×480** backing store, stretched to fill `#studio` by CSS. All element
positions are absolute virtual pixels in that space — no %, no DPR math.
The 3D viewport (`canvas#view`, a `WebGLRenderer` canvas kept offscreen)
is blitted into the UI each frame by `MovieScreen` (`studio`) or `CvEl`
(easel previews).

DOM survives only where the OS is needed: text `<input>`s floated over the
canvas by `domOverlay()` (z-index 57, inside `#studio`), the settings dialog
(`ui/optdlg.ts`, z-index 60), and the file picker. Everything else is canvas.

## Files

| File | Contents |
|------|----------|
| `element.ts` | `Element` — rect + children + paint/hit/invalidate |
| `root.ts` | `UiRoot` (singleton `uiRoot`), `View`, `Toast` |
| `animator.ts` | `Animator` — `tween(target, {prop:end}, {dur, ease, done})` |
| `textureCache.ts` | `textureCache.image(name, onload)` texture cache, `textureCache.isReady()` |
| `widgets.ts` | `ImageElement`, `StudioButton`, `TextElement`, `MovieScreen`, `VerticalSlider`, links |
| `easel.ts` | `EaselView`, `domOverlay`, `CvEl`, `offCv`, shared widgets (`ScrollButton`, `Thermometer`, `NamePlate`, `ListenerSlider`, `FramedCell`) |
| `modal.ts` | `ModalView` + the shared modal slot (`modalSlot.view`/`modalSlot.cleanup`/`modalSlot.close`) — leaf module, kept out of import cycles so `extends` bases always init first |
| `assetBrowser.ts` | `AssetBrowserView`, `AssetAssetBrowserView.show`; `modalSlot.view`/`modalSlot.close`/`modalSlot` re-export the modal.ts slot |
| `easels.ts` | `SorterEasel`, `RecorderEasel`, `ListenerEasel`, `WordsDlg`, `SpletterEasel`, `ActionBrowser`, `CostumeEasel` |
| `studio.ts` | `StudioView` (editor chrome), `studioEl`, `syncStudio`, `syncRollCall` |
| `talentBook.ts` | `TalentBookView`, `BioPage`, `BioText` |
| `theatre.ts` | `TheatreView`, `EmbedView`, `enterTheatre`, `enterEmbed` |
| `bootView.ts` | `BootView` splash |
| `castView.ts` | `CastView` sender-side remote |
| `tooltips.ts` | callout balloons in the `uiRoot.tips` layer |
| `optionsDialog.ts` | settings modal (DOM, outside the canvas) |

## Views and the stack

`uiRoot.stack` is the view stack; `stack.at(-1)` (`ui.topView`) is the only view
hit-tested for input. `ui.push(v, anim)` / `ui.pop(anim)` /
`ui.replace(v, anim)` with `anim ∈ 'fade'|'none'`.

Paint order inside `ui.children` is fixed by `_rebuild()`:

```
[...leavingUnder, ...stack, ...leaving, tips, toast]
```

- `leaving` — views popped with `'fade'`, painted **over** the stack while
  they fade out.
- `leavingUnder` — views removed by `replace()`, painted **under** the
  incoming view so full-screen views never appear behind the old chrome.
- `tips` — callout balloons, `pickable=false`.
- `toast` — `say()` notices, always topmost.

Lifecycle: `onEnter()` when pushed/uncovered, `onExit()` when
popped/covered. `EaselView.onExit` distinguishes the two (covers hide its
DOM inputs, pops remove them).

The studio is inserted under everything once at boot
(`uiRoot.stack.unshift(studioView)`). Easels/browsers share the `modalSlot.view` modal
slot — `modalSlot.open()`/`AssetAssetBrowserView.show()` `modalSlot.close()` first, then push.
Escape routes through `modalSlot.view._onEsc || modalSlot.close`.

`UiRoot._rebuild()` also mirrors `{topView, stackDepth}` into the `useUi`
store, so "is a dialog open" is `useUi.getState().stackDepth > 1` and view
transitions are observable via `useUi.subscribe`.

## Elements

```js
class Element {
  x, y, w, h          // virtual px, relative to parent
  children, parent
  root                // owning UiRoot — see "root propagation" below
  visible, opacity, pickable, cursor, tip
  draw(ctx)           // override — ctx already in local space
  frame(dt)           // per-frame hook while in the active tree
  hitTest(px, py)     // parent-local coords; deepest pickable wins
  dirty()             // mark this element's rect for repaint
  onPointerDown/Move/Up/Click/Enter/Leave(e)
}
```

- **Hit-testing recurses in parent-local space** (children before self,
  last-added first). `pickable=false` skips the element itself, not its
  children.
- **Events bubble**: `_walkUp` runs the hook on the hit element then each
  ancestor until one returns `true`. `pointerdown` captures the hit element
  (`ui.captured`) for drags; a click fires `onClick` only if up lands on the
  captured element.
- **Painting** is dirty-region based: `dirty()` unions into `ui.dirtyRects`,
  the RAF loop clips to the union and repaints the whole child list in
  order. Elements that animate call `dirty()` per state change;
  `MovieScreen.frame()` dirties every frame while playing.

### root propagation (invariant)

`el.root` is a setter that re-roots the **whole subtree**. Elements added
inside a view constructor before `ui.push` attach the view have `root=null`
until the push propagates it — that's fine *because* it propagates. If you
ever assign `.root` manually or splice `ui.children` without `add()`/
`_rebuild()`, children keep a stale root and `dirty()` silently no-ops —
the symptom is a view that paints once (with unloaded textures) and never
repaints, looking like a z-order bug. Never bypass the setter.

### Textures

`textureCache.image(name)` returns a cached `Image` that may still be loading — always
pass an `onload` that calls `this.dirty()` and guard draws with
`textureCache.isReady(im)`. Forgetting the guard paints a blank rect (drawImage on an
incomplete image throws).

## Modals and DOM overlays

`EaselView`/`AssetBrowserView` own the modal slot. Text entry uses real DOM:
`this.domInp(x, y, w, h)` creates an `<input class="spltInp">` floated at
logical coords via `domOverlay()`; inputs are tracked in `view._dom`,
hidden while the view is covered and removed when it leaves the stack.

## Animation

`ui.anim.tween(target, {prop: end}, {dur, ease, done})` —
ease defaults to `EASE.out`; `EASE.linear|in|out|inout` available.
`Animator` ticks inside `UiRoot`'s RAF (`ui.anim.active` keeps the loop
alive). View pushes/pops use opacity tweens.

## Rules for new UI code (class-first)

- One surface = one `View` subclass; constructor builds the tree, helpers
  are methods, state lives in fields.
- Two call sites with the same custom draw/behavior = a missing shared
  subclass — extract it into `widgets.ts`/`easel.ts`.
- `showFoo()` stays a thin `ui.push(new FooView())` factory.
- Transient element fields use `/** @type {any} */` declarations until the
  TS migration names them properly.
- State that affects painting belongs in a zustand store; elements/views
  subscribe and `dirty()` themselves (see `StudioView`'s
  `useUi.playing`/`useEd.selChid` subscriptions) rather than callers
  manually syncing chrome.
