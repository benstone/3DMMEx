# Format notes — chunky files & friends

Working notes for the `src/format/` + `src/engine/` file-format code, ported
from the released Kauai/3DMM sources (`kauai/SRC/`). Read this before
touching anything in `format/`.

## CHN2 — the chunky container

Every `.3MM`, `.3TH`, `.CHK`, `.3CN`, `.NTH` file is a **chunky file** —
a tagged-chunk container, the same family as RIFF but Microsoft/Kauai's
variant. See `src/format/chunky.js`.

Layout:

```
'CHN2' magic (4 bytes, little-endian 'CHN2'; '2NHC' = byte-swapped)
creator ctg (4-byte tag, e.g. '3MM ')
dverCur i16, dverBack i16   — format versions
byteOrder, osk i16          — 'osk' is the OS kind
fpMac i32 (unused), fpIndex i32, cbIndex i32
...chunk data...
index at fpIndex: a GG of CRP records (chunk descriptors)
```

- **ctg** — a 4-byte chunk-type tag (`'MVIE'`, `'SCEN'`, `'GST '`, `'MBMP'`…).
  `binary.js` `ctgToStr`/`strToCtg` handle the trailing-space convention
  (a 3-char tag like `GST` is stored as `'GST '`).
- **cno** — the chunk number, a u32 "instance id" so multiple chunks share a
  ctg (e.g. one `SCEN` per scene). `ChunkyFile.key(ctg, cno)` addresses a
  chunk.
- **CRP** — the index record: ctg, cno, `fp`/`cb` (file offset+size of the
  payload), `grfcrp` flags, optional kid list (child ctg/cno/chid triples),
  optional long name.
- `grfcrp & FCRP_PACKED` — payload is **KCDC/KCD2 compressed**
  (`kcdc.js` decodes it in `data()`); `FCRP_FOREST` marks forest-group
  chunks. `writeChunkyFile` recompresses on save.

Read API: `cf.get(ctg,cno)` (metadata), `cf.data(ctg,cno)` (decoded bytes),
`cf.kid(ctg,cno,kidCtg,chid)` (child lookup — parents reference children by
chid), `cf.ofType(ctg)` (iterator).

## Group structures inside chunk payloads

`GG`, `GL`, `GST` are record containers stored *inside* chunk payloads
(`readGG`/`readGL`/`readGST`, `buildGG`/`buildGL`/`buildGST`):

- **GG** — group of variable records each with a fixed-size header +
  variable tail (`gg.le` = fixed-entry length).
- **GL** — flat list of same-size records.
- **GST** — group of **STN** strings + fixed data (used for the roll call:
  each entry is a name string plus its `MACTRF` fixed record).

`STN` (`binary.js` `readStn`/`writeStn`) is the length-prefixed string type.

`FIX` (`binary.js`) = 1/65536 — the engine stores most geometry as
**16.16 fixed-point**; multiply floats by 65536 going in, `* FIX` coming out.

## The .3MM movie (`format/movie.js`)

The top chunk is `MVIE`; its kids include:

- `GST ` kid **chid 0** — the **roll call**: `arid → actor name + TMPL tag`
  (the talent-book data). Read as a GST.
- `GST ` kid **chid 1** — string table carried along for localization
  (see "GST strings" below).
- `SCEN` kids — one per scene; each scene's `GGST` chid-1 child is the
  start-events list (`SEVT` records — PlaySnd etc.).
- Actors/props are `ACTR`/`PROP` chunks hung off scenes; backgrounds
  `BKGD`; text boxes `TBOX` children carry `TDF` (text definition) +
  `MTRL` (material) data.

## Content files (`.3CN` / `.CHK` / `.NTH`) — `format/content.js`

- `.3CN` — content: `TMPL` actor/prop templates, `BKGD`, `MTRL` materials,
  `TDF` font definitions, `SND ` sounds, `MBMP`/`TMAP` bitmaps.
- `.CHK` — expansion **patch**: merges new content + the pack's palette
  (`GLCR` color list) + `GST ` string tables.
- `.NTH` — thumbnail index: pre-rendered cell bitmaps the browsers show
  (scan via `thumbs.js` `scanThumbFile`; pack thumbs index the pack's own
  `GLCR` palette — wrong palette = inverted colors).

`parseTemplate(cf, cno)` walks a TMPL's kids: default `BRS ` browser info,
models per chid (`templateModel`), actions (`templateAction` → `CMTL`
common motion list → `MTRL`s), costumes, sounds.

## GST string chunks (future i18n hook)

Per decision 5 in `interface-overhaul.md`: the original shipped its UI text
as `GST ` chunks inside content/expansion files — expansions like NICK3D
carry their own tables, which is how the original localized pack names and
browser categories. The web port uses `src/lang/*.json` + `t()` instead and
does **not** read pack GSTs (v1). If per-pack localization is ever wanted,
the hook is: `readGST(cf.data('GST ', cno))` → `entries` = `{stn, fixed}`
pairs — feed them into `t()` as an override layer keyed by the pack.

## Gotchas

- Everything numeric in files is little-endian; the `Reader`/`Writer`
  classes take care of it — never `DataView` by hand.
- `'2NHC'` files are byte-swapped (Mac-authored) — `ChunkyFile` accepts them
  but treat writes as CHN2-only.
- Offsets in the index are absolute file positions (`fp`), not chunk-relative.
- Actor/actor-tool ids (`arid`), chunk ids (`chid`), tags (`ctg`), and chunk
  numbers (`cno`) are four different namespaces — don't conflate them.
