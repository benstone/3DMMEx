# Contributing

## Setup

```sh
npm install
npm run dev
```

The app needs the original 3DMM content files in `public/data/` (the `.3CN`
libraries, `.3th` thumbnail files, `socpal.pal`, etc.) — see the README.

## Rules of thumb

- `src/format/` is a pure-JS port of the Kauai chunky/CHN2 formats — keep it
  free of DOM, three.js and `import.meta.env` so it stays testable under Node.
- `src/engine/` holds playback/scene logic. Keep it headless-compatible where
  practical (guard `document`/`window` access) — the tests drive MoviePlayer
  directly under Node.
- `src/render/` and `src/main.js` may use the DOM/three.js freely.
- Asset URLs under `public/` must be prefixed with `import.meta.env.BASE_URL`
  (the `B` helper in `main.js`) so the site works when hosted under a subpath.
- Match the existing comment style — structure/behavior notes usually cite the
  original Kauai source file or constant they mirror (e.g. `// see CHUNK.CPP`).

## Before opening a PR

```sh
npm test        # node:test unit + integration tests (test/)
npm run build   # vite build must succeed
```

PRs run the same checks in CI. Site deployment only happens on pushes to
`main` that touch files under `src/`, `public/` or the build config.
