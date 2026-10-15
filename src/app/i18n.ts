// Localization — bundled en.json is the fallback dictionary, so t() works
// synchronously at module-eval time. ?lang=xx loads public/lang/xx.json at
// boot and merges over en; missing keys fall back to English (then to the
// raw key, so a typo surfaces visibly rather than silently).
// Call sites: t('doc.saved', { name }) -> 'saved my.3mm'
import en from '../lang/en.json';
import { B } from './res.ts';

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
export const t = (key: string, args?: Record<string, any>) => {
  let s = lookup(dict, key) ?? lookup(en, key) ?? key;
  if (args) for (const [k, v] of Object.entries(args)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
};

export const getLang = () => lang;
// Languages with a dictionary shipped in public/lang/ — 'auto' resolves
// navigator.language at init. Add codes here when new json files land.
export const LANGS = ['en', 'auto'];

/** Swap the dictionary to <code>.json (merged over en); persists to
 *  localStorage so it survives across sessions. Falls back to en on miss. */
export const setLang = async (code) => {
  if (code === 'auto') code = navigator.language?.split('-')[0] || 'en';
  if (code === lang && code !== 'en') return lang;
  if (code === 'en') { for (const k of Object.keys(dict)) delete dict[k]; deepMerge(dict, en); lang = 'en'; }
  try {
    if (code !== 'en') {
      const r = await fetch(`${B}lang/${code}.json`);
      if (!r.ok) throw new Error(`${r.status}`);
      deepMerge(dict, await r.json());
      lang = code;
    }
    localStorage.setItem('lang3dmm', lang);
  } catch (e) { console.warn(`lang ${code}:`, e.message); } // stay on current
  return lang;
};

/** Resolve the dictionary: ?lang= > localStorage > navigator.language > en. */
export const initLang = async () => {
  const q = new URLSearchParams(location.search).get('lang');
  const code = q ?? localStorage.getItem('lang3dmm') ?? 'auto';
  await setLang(code);
};
