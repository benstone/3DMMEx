---
name: add-url-param
description: Add or change a ?param URL argument (lang, packs, mode, castid, etc.). Use when extending the app's URL-driven configuration.
---

Params are parsed once in `src/main.js` (`const qs = new
URLSearchParams(location.search)`) and threaded into boot wiring — follow
that pattern; don't re-parse `location.search` in modules (the `?packs=`
read in `packs.js` is the documented exception).

Checklist:

1. Parse in `src/main.js`, pass the value down through the existing
   import-graph wiring.
2. Shareable-playback params must round-trip: if the param affects movie
   playback or content (like `?packs=`, `?scene=`, `?frame=`, `?play`),
   include it in the Cast payload in `src/app/cast.js` and accept it in
   `src/receiver.js`/`receiver.html` — the sender's theatre URL and the
   receiver must see the same movie state.
3. Document it in `README.md`'s parameter table.
4. If it's user-visible text (labels, toasts), route strings through `t()`.

Existing params for reference: `?lang`, `?3mm`, `?mode=edit|theatre|embed`,
`?scene`, `?frame`, `?play`, `?opts`, `?menu`, `?packs`, `?sf`, `?castid`.

Verify: `npx vite build` then test the URL by hand against `npm run dev`.
