// Shared resources + micro-utils used across the whole app.
/** Vite base URL — '/' in dev, './' on pages builds. */
export const baseUrl = import.meta.env.BASE_URL;
/** Asset-pack overrides — 'name.png'/'name.cur' -> blob URL (see ?packs=). */
export const packTextures = new Map();
/** Texture URL by name — a pack override wins over the builtin textures/ dir. */
export const textureUrl = (name) => packTextures.get(`${name}.png`) || `${baseUrl}textures/${name}.png`;
/** Cursor URL by name — a pack override wins over the builtin cur/ dir. */
export const cursorUrl = (name) => packTextures.get(`${name}.cur`) || `${baseUrl}cur/${name}.cur`;
/** document.getElementById shorthand for the few DOM overlays. */
export const elementById = (id) => document.getElementById(id);
/** Promise-wrapped setTimeout. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Toast sink — `toastHost.show(msg)` delegates to the canvas toast once the
// UI root registers a handler; resources.ts is a leaf module so it can't
// import the ui cycle directly.
class ToastHost {
  /** The active toast renderer — console fallback until the UI root registers. */
  handler = (msg) => console.log('[mms]', msg);
  /** Register the real toast renderer — called by the UI root at boot. */
  setHandler = (f) => { this.handler = f; };
  /** Show a toast — always logs; the canvas toast renders it once registered. */
  show = (msg) => { console.log('[mms]', msg); this.handler(msg); };
}
export const toastHost = new ToastHost();
