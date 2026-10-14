// Shared resources + micro-utils used across the whole app.
export const B = import.meta.env.BASE_URL; // vite base ('/' dev, './' pages build)
export const packTex = new Map(); // asset-pack overrides: 'name.png'/'name.cur' -> blob URL (?packs=)
export const texUrl = (n) => packTex.get(`${n}.png`) || `${B}textures/${n}.png`;
export const curUrl = (n) => packTex.get(`${n}.cur`) || `${B}cur/${n}.cur`;
export const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let sayEl = null, sayTm = null;
export function say(msg) { // PushErc-style notice: transient toast on the stage (errors, saves)
  console.log('[mms]', msg);
  if (!sayEl) { sayEl = document.createElement('div'); sayEl.id = 'say'; $('studio').appendChild(sayEl); }
  sayEl.textContent = msg; sayEl.classList.add('show');
  clearTimeout(sayTm); sayTm = setTimeout(() => sayEl.classList.remove('show'), 3000);
}
