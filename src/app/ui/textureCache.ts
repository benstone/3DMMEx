// Cached texture images for the canvas UI. textureCache.image() returns an Image
// that may still be loading — draw sites call it every frame and it becomes
// drawable when complete; Element.drawFrame() helpers skip incomplete images.
import { textureUrl } from '../resources.ts';

class TextureCache {
  cache = new Map();

  image = (name, onload?) => {
    let image = this.cache.get(name);
    if (!image) {
      image = new Image();
      image.src = textureUrl(`${name}`);
      image.draggable = false;
      this.cache.set(name, image);
      if (onload) { const f = () => onload(image); image.complete ? f() : (image.onload = f); }
    } else if (onload && !image.complete) { image.addEventListener('load', () => onload(image), { once: true }); }
    return image;
  };

  isReady = (image) => image.complete && image.naturalWidth > 0;

  /** Boot prewarm — create the cached Image now and await decode, so the first
   *  drawFrame() never sees a half-decoded texture (the flicker the old fetch-only
   *  warm had: bytes cached but no Image until first paint). */
  warm = async (name) => {
    const image = this.image(name);
    try { if (image.decode) await image.decode(); else if (!image.complete) await new Promise((r) => { image.onload = image.onerror = r; }); }
    catch { /* missing/corrupt texture — lazy path retries on draw */ }
  };
}
export const textureCache = new TextureCache();
