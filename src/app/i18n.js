// Localization — bundled en.json is the fallback dictionary, so t() works
// synchronously at module-eval time. ?lang=xx loads public/lang/xx.json at
// boot and merges over en; missing keys fall back to English (then to the
// raw key, so a typo surfaces visibly rather than silently).
// Call sites: t('doc.saved', { name }) -> 'saved my.3mm'
import en from '../lang/en.json';
import { B } from './res.js';

let lang = 'en';
const dict = { ...en };

const deepMerge = (dst, src) => {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] = deepMerge(dst[k] || {}, v); }
    else dst[k] = v;
  }
  return dst;
};

const lookup = (d, key) => key.split('.').reduce((o, k) => o?.[k], d);

/** Translate key with {arg} interpolation; falls back to en then the key itself. */
export const t = (key, args) => {
  let s = lookup(dict, key) ?? lookup(en, key) ?? key;
  if (args) for (const [k, v] of Object.entries(args)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
};

export const getLang = () => lang;

/** Load ?lang=xx (or navigator language when ?lang=auto) over the bundled en. */
export const initLang = async () => {
  const q = new URLSearchParams(location.search).get('lang');
  const code = q === 'auto' ? navigator.language?.split('-')[0] : q;
  if (!code || code === 'en') return;
  try {
    const r = await fetch(`${B}lang/${code}.json`);
    if (!r.ok) throw new Error(`${r.status}`);
    deepMerge(dict, await r.json());
    lang = code;
  } catch (e) { console.warn(`lang ${code}:`, e.message); } // stay on en
};
