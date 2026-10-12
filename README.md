# 3DMM Web

A web-based player and studio for **Microsoft 3D Movie Maker** (`.3mm`) movies,
running entirely in the browser. It parses the original Kauai "chunky" (CHN2)
file format — movies, content libraries, templates, actions, sounds and
bitmaps — and renders scenes with [three.js](https://threejs.org).

No plugins, no emulation: the file-format and scene-playback code is a pure
JavaScript port of the original 1995 engine behavior.

> **Status: early.** This is a work in progress — expect bugs, missing
> editor features and rough edges. Planned for future releases: support for
> expansion-pack content including **Frankie's 3DMM Expansion Pack 1**, the
> **Doraemon Expansion** and the **Nickelodeon Expansion**, and more TBD.

## Features

- **Movie player** — loads `.3mm` files, plays scenes with backgrounds,
  cameras, actors, actions, transitions, text boxes and sound (MS-ADPCM WAV
  and MIDS MIDI), including pause/scroll/loop semantics from the original.
- **Studio chrome** — recreations of the original editor UI (tool palettes,
  browsers, cursors, sound studio, scene sorter) built from the game's own
  artwork assets.
- **Movie saving** — serializes edited movies back to a valid CHN2 `.3mm`
  file that the original game can open.
- **Headless tools** — `tools/` scripts inspect, dump and step through
  movies under Node without a browser.

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
```

The app requires the original 3DMM data files in `public/` (the `.3CN`
content libraries, `.3th` thumbnail files, `socpal.pal`, cursors and UI
textures). These are copyrighted game assets — copy them from your own
3DMM installation if they are missing.

## URL parameters

You can deep-link to a movie and control how it opens:

| Param | Description |
| ----- | ----------- |
| `3mm` | Movie to load. A bare name (e.g. `?3mm=WHERE.3MM`) loads a bundled sample from `movies/`; a path or full URL loads a remote `.3mm` file (the remote host must allow CORS). A successful load replaces the autosaved working doc; failures fall back to normal boot and show an error. |
| `mode` | `edit` (default) opens the full studio editor. `theatre` recreates the original's cinema view — theatre backdrop, lights that dim on play, projector-lens play/rewind controls and a wall volume slider. `embed` shows only the movie screen (letterboxed) with minimal floating controls. Both screen modes autoplay; `Space` toggles play/pause. |
| `scene` | Scene index to open on (e.g. `?scene=2`). |
| `frame` | Frame within the scene (e.g. `?frame=30`). |
| `play` | Start playing immediately (`?play`). |
| `opts` | Comma-separated renderer flags — `fps24`, `modernLighting`, `shadows`, `castOnOthers`, `selfShadow`, `smoothTex`, `smoothVerts`, `scale2x`, `aa`, `wireframe` (e.g. `?opts=fps24,shadows`). |
| `menu` | Show the hidden options menu (`?menu`). |

### Remote movies & samples

`?3mm=` accepts any same-origin or CORS-enabled URL, so you can link to
movies hosted anywhere — for example the sample movies in the
[3DMMEx](https://github.com/benstone/3DMMEx) / 3dmm-web repos:

```
https://<host>/?3mm=https://raw.githubusercontent.com/permpkin/3dmm-web/main/samples/hospital.3mm
```

To watch it in the recreated theatre instead of the editor:

```
https://<host>/?3mm=https://raw.githubusercontent.com/permpkin/3dmm-web/main/samples/hospital.3mm&mode=theatre
```

## Commands

| Command         | Description                                    |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | Vite dev server                                |
| `npm test`      | `node:test` unit + integration tests (`test/`) |
| `npm run build` | Production build to `dist/`                    |

Tools (run with `node`, files relative to repo root):

```sh
node tools/dump.mjs public/movies/WHERE.3MM [CTG]   # chunky index / chunk listing
node tools/inspect.mjs public/movies/WHERE.3MM      # movie/scene/actor event dump
node tools/play.mjs public/movies/WHERE.3MM         # headless playthrough
node tools/calib.mjs                 # calibration helper
node tools/manifest.mjs              # regenerate public/manifest.json (boot preloader)
```

The boot sequence mirrors the original's `APP::_FInit` (`UTEST.CPP`): the
Microsoft Home logo, then the splash screen with a progress bar while the
content libraries, thumbnails and UI bitmaps load. Afterwards an autosaved
working doc opens straight into the studio (`GetPortfolioDoc`), otherwise a
new (sceneless) movie starts — the original's `FLoadMovie()` blank doc. A
normal reload restores the doc at the last scene+frame viewed; a hard
refresh (Cmd/Ctrl+Shift+R or Shift+F5) wipes the cache first.

## Deployment

The site is a static SPA. `vite.config.js` uses a relative `base`, so the
built `dist/` works under any mount point — including a GitHub Pages
project site at `https://<user>.github.io/<repo>/`.

`.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages on
pushes to `main`, but only when site-affecting files change (`src/`,
`public/`, `index.html`, `vite.config.js`, `package*.json`). To enable it:
**Settings → Pages → Source → GitHub Actions**.

Tests run on every PR and push via `.github/workflows/ci.yml`.

## Project layout

```
src/format/    pure-JS Kauai format ports (chunky, movie, content, kcdc, wav, mids)
src/engine/    scene/actor playback state, content library, sound queue, mat34
src/render/    three.js renderer + canvas textbox layout
src/main.js    app entry: player controls + studio editor chrome
tools/         node CLI helpers for inspecting .3mm/.3cn files
test/          node:test suite (unit + headless MoviePlayer integration)
public/        game data files (content libs, thumbnails, UI art, sample movies)
```

## Credits & references

This project exists thanks to the people who made, released and preserved
3D Movie Maker:

- **The original 3D Movie Maker team at Microsoft** (1995) — the "Kauai"
  engine and its wonderfully weird file formats. The structure comments in
  `src/` reference their source files (`CHUNK.CPP`, `MOVIE.CPP`,
  `SCENE.CPP`, `CODKAUAI.CPP`, `TXT`, etc.).
- **[microsoft/Microsoft-3D-Movie-Maker](https://github.com/microsoft/Microsoft-3D-Movie-Maker)** —
  Microsoft open-sourced the original code under MIT in May 2022. The format
  and playback code here is a port of that source.
- **[foone/3DMMForever](https://github.com/foone/3DMMForever)** — the
  modernized source release and community hub that keeps 3DMM running on
  modern systems.
- **[benstone/3DMMEx](https://github.com/benstone/3DMMEx)** — a source port
  preserving the classic experience with quality-of-life enhancements.
- **BRender** by Argonaut Software — the renderer used by the original game;
  the `mat34` transform conventions here mirror its 4x3 matrix layout.

## License & legal

Code is ISC (see `package.json`). The 3DMM data files under `public/`
(sounds, textures, cursors, thumbnails, `.3CN` libraries and sample movies)
are **Microsoft copyrighted game assets from 1995**, bundled here for
preservation/interoperability purposes only — they are *not* covered by the
code license. Distribute them at your own discretion; replace them with your
own install's files when in doubt.
