# Asset packs (`?packs=`)

Expansion packs reskin the editor and add browsable content — the original
motivation for the UI overhaul. This expands the README's asset-packs
section; the implementation lives in `src/app/packs.ts`.

## Manifest

`?packs=` takes comma-separated URLs, each pointing to an `assets.json`
manifest (or a directory containing one — `assets.json` is appended
automatically). Every entry is resolved relative to the manifest's URL:

```json
["NICK3D.CHK","STUDIO.CHK","SHARED.CHK","BUILDING.CHK",
 "TMPLS.3CN","BKGDS.3CN","MTRLS.3CN","SNDS.3CN","TDFS.3CN",
 "ACTOR.NTH","PROP.NTH","BKGDS.NTH","ACTRESL.NTH","MTRL.NTH"]
```

The manifest may also be `{ "files": [...] }`. Order matters — files apply
in manifest order, and later packs win over earlier ones for the same
resource name.

## File types a pack can ship

| Ext | Contents |
|-----|----------|
| `.CHK` | Expansion patch — merges new TMPLs/BKGDs/MTRLs into the content library, plus the pack's `GLCR` palette and `GST ` string table |
| `.3CN` | Content file — actor/prop `TMPL`s, `BKGD`, `MTRL`, `TDF`, `SND `, `MBMP` |
| `.NTH` | Thumbnail index — the cell bitmaps shown in browsers (`ACTOR.NTH`, `PROP.NTH`, `BKGDS.NTH`, `ACTRESL.NTH`/`MTRL.NTH` per category) |
| `.cht`/`BMP`/cursors | Interface textures and cursors — matched by basename and hot-swapped over the builtins (that's how NICK3D reskins the studio) |

## Load order & merge semantics

1. Boot fetches all manifests up front (`bootSequence.manifestPromise` in `expansionPacks.ts`) — a bad URL
   toasts an error and doesn't block the app.
2. UI bitmaps + cursors apply first so the editor visibly reskins early.
3. Content files stream in and merge **additively** into the built-in
   library — pack content appears in the same actor/prop/background
   browsers; it never replaces builtin content.
4. Palette: the first 256-entry `GLCR` color list in a pack becomes *that
   pack's* palette — `.NTH` thumbs and pack bitmaps are indexed and must
   render against it (wrong palette = inverted colors). Built-in content
   keeps the builtin palette.
5. `packNotes` entries toast a per-pack summary after boot
   (`t('pack.loaded')`).

## Dev & deployment

- Local testing: drop a pack under `expansions/<name>/` — `vite.config.ts`
  serves that dir in dev: `?packs=/expansions/NICK3D`.
- Deployed: host the pack anywhere CORS-enabled; the receiver page
  (`receiver.html`) accepts `?packs=` too, and the sender includes the pack
  list in the Cast payload so a cast session renders with the same content.
- Movies saved with pack content keep their chunk references — opening
  them requires the same `?packs=` (the movie format has no embedding;
  same as the original requiring the expansion installed).

## Adding a new pack category

Browsers enumerate categories via `BROWSER_DEFS` (`ui/browser.ts`) +
`scanThumbFile` (`thumbnails.ts`). A pack only needs to ship the right `.NTH`
name to slot into an existing browser; a genuinely new category needs a
`BROWSER_DEFS` entry, a `kind` in `AssetBrowserView.show`, and the `.NTH` naming
convention — see the add-easel skill for the UI side.
