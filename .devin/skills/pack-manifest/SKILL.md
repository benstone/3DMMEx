---
name: pack-manifest
description: Author or fix an assets.json expansion-pack manifest, or debug pack loading (wrong palette, missing thumbs, pack not applying).
---

Read `docs/asset-packs.md` first — it covers manifest shape, file types
(.CHK/.3CN/.NTH/.cht), merge order, and the GLCR palette rule.

Key facts:

- `assets.json` is a plain array of relative filenames (or `{"files":[...]}`)
  resolved against the manifest's own URL — bare directory URLs get
  `assets.json` appended automatically.
- Order = apply order; later packs win per resource basename.
- `.NTH` thumbnails are indexed against the pack's `GLCR` palette — inverted
  colors in a pack's thumbs almost always means the palette didn't load
  (missing `.CHK` with a `GLCR` chunk, or ordering).
- Dev-only local packs live under `expansions/<name>/` and are served by
  `vite.config.js`: test with `?packs=/expansions/<name>`.
- Pack load failures toast but never block boot (`packsP` in
  `src/app/packs.js`, results in `packNotes`).

Verify: `npm run dev` + `?packs=<url>` and check the actor/prop/background
browsers show the pack's cells with correct colors.
