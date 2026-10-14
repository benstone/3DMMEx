// Cached texture images for the canvas UI. texImg() returns an Image that may
// still be loading — draw sites call it every frame and it becomes drawable
// when complete; Element.draw() helpers skip incomplete images.
import { texUrl } from '../res.js';

const cache = new Map();
export const texImg = (name, onload) => {
  let im = cache.get(name);
  if (!im) {
    im = new Image();
    im.src = texUrl(`${name}`);
    im.draggable = false;
    cache.set(name, im);
    if (onload) { const f = () => onload(im); im.complete ? f() : (im.onload = f); }
  } else if (onload && !im.complete) { im.addEventListener('load', () => onload(im), { once: true }); }
  return im;
};
export const imgReady = (im) => im.complete && im.naturalWidth > 0;
