// Shared resources + micro-utils used across the whole app.
export const baseUrl = import.meta.env.BASE_URL; // vite base ('/' dev, './' pages build)
export const packTextures = new Map(); // asset-pack overrides: 'name.png'/'name.cur' -> blob URL (?packs=)
export const textureUrl = (name) => packTextures.get(`${name}.png`) || `${baseUrl}textures/${name}.png`;
export const cursorUrl = (name) => packTextures.get(`${name}.cur`) || `${baseUrl}cur/${name}.cur`;
export const elementById = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// toastHost.show() delegates to the canvas toast once the UI root registers —
// resources.ts is a leaf module so it can't import the ui cycle directly.
class ToastHost {
  handler = (msg) => console.log('[mms]', msg);
  setHandler = (f) => { this.handler = f; };
  show = (msg) => { console.log('[mms]', msg); this.handler(msg); };
}
export const toastHost = new ToastHost();
