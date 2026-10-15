// Localization — bundled en.json is the fallback dictionary, so translate()
// works synchronously at module-eval time. ?lang=xx loads public/lang/xx.json
// at boot and merges over en; missing keys fall back to English (then to the
// raw key, so a typo surfaces visibly rather than silently).
// Call sites: translate('doc.saved', { name }) -> 'saved my.3mm'
import en from '../lang/en.json';
import { baseUrl } from './resources.ts';

class Localizer {
  language = 'en';
  dictionary: Record<string, any> = { ...en };
  /** Languages with a dictionary shipped in public/lang/ — 'auto' resolves
   *  navigator.language at init. Add codes here when new json files land. */
  languages = ['en', 'auto'];

  _deepMerge(dst, src) {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] = this._deepMerge(dst[k] || {}, v); }
      else dst[k] = v;
    }
    return dst;
  }

  _lookup(d, key) { return key.split('.').reduce((o, k) => o?.[k], d); }

  /** Translate key with {arg} interpolation; falls back to en then the key itself. */
  translate = (key: string, args?: Record<string, any>) => {
    let s = this._lookup(this.dictionary, key) ?? this._lookup(en, key) ?? key;
    if (args) for (const [k, v] of Object.entries(args)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  /** Swap the dictionary to <code>.json (merged over en); persists to
   *  localStorage so it survives across sessions. Falls back to en on miss. */
  setLanguage = async (code) => {
    if (code === 'auto') code = navigator.language?.split('-')[0] || 'en';
    if (code === this.language && code !== 'en') return this.language;
    if (code === 'en') { for (const k of Object.keys(this.dictionary)) delete this.dictionary[k]; this._deepMerge(this.dictionary, en); this.language = 'en'; }
    try {
      if (code !== 'en') {
        const r = await fetch(`${baseUrl}lang/${code}.json`);
        if (!r.ok) throw new Error(`${r.status}`);
        this._deepMerge(this.dictionary, await r.json());
        this.language = code;
      }
      localStorage.setItem('lang3dmm', this.language);
    } catch (e) { console.warn(`lang ${code}:`, e.message); } // stay on current
    return this.language;
  };

  /** Resolve the dictionary: ?lang= > localStorage > navigator.language > en. */
  initialize = async () => {
    const q = new URLSearchParams(location.search).get('lang');
    const code = q ?? localStorage.getItem('lang3dmm') ?? 'auto';
    await this.setLanguage(code);
  };
}

export const localizer = new Localizer();
