// Shared resources + micro-utils used across the whole app.
export const B = import.meta.env.BASE_URL; // vite base ('/' dev, './' pages build)
export const packTex = new Map(); // asset-pack overrides: 'name.png'/'name.cur' -> blob URL (?packs=)
export const texUrl = (n) => packTex.get(`${n}.png`) || `${B}textures/${n}.png`;
export const curUrl = (n) => packTex.get(`${n}.cur`) || `${B}cur/${n}.cur`;
export const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// say() delegates to the canvas toast once the UI root registers — res.js is a
// leaf module so it can't import the ui cycle directly.
let sayImpl = (msg) => console.log('[mms]', msg);
export const setSayImpl = (f) => { sayImpl = f; };
export function say(msg) { console.log('[mms]', msg); sayImpl(msg); }
