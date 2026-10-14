import { $ } from './res.js';import { texUrl, B } from './res.js';
// --- boot splash -------------------------------------------------------------
// UTEST.CPP APP::_FInit: the Microsoft Home logo rides the early init, then the
// splash screen stays up while _FInitCrm reads the content chunkies; afterwards
// GetPortfolioDoc goes straight to the studio (autosaved doc) or the building's
// menu. Here: "loading..." (index.html) -> homelogo -> splash with a progress
// bar -> studio (autosave) or a menu (portfolo art).
export const bootEl = $('boot'), bootScr = $('bootScr'), bootTxt = $('bootTxt');
export const bootImg = document.createElement('img');
bootImg.id = 'bootImg'; bootImg.draggable = false;
bootImg.onload = () => bootTxt?.remove(); // keep "loading..." until art arrives
export const bootBar = document.createElement('div'); bootBar.className = 'bootBar'; bootBar.hidden = true;
export const bootFill = document.createElement('div'); bootFill.className = 'bootFill'; bootBar.appendChild(bootFill);
export const bootCap = document.createElement('div'); bootCap.className = 'bootCap';
bootScr?.append(bootImg, bootBar, bootCap);
export const bootShow = (n) => { bootImg.src = texUrl(`${n}`); };
export const bootDone = () => { bootEl?.classList.add('gone'); setTimeout(() => bootEl?.remove(), 400); };
export const bootSegs = [];
export const bootSeg = (w) => { // one weighted slice of the bar; cb updates its fraction
  const s = { w, f: 0 };
  bootSegs.push(s);
  return (f, cap) => {
    if (f > s.f) s.f = Math.min(1, f);
    const tot = bootSegs.reduce((a, x) => a + x.w * x.f, 0) / bootSegs.reduce((a, x) => a + x.w, 0);
    bootFill.style.width = (tot * 100).toFixed(1) + '%';
    if (cap != null) bootCap.textContent = cap;
  };
};
export const manifestP = fetch(`${B}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export const miscSeg = bootSeg(0.08);
export let miscN = 0;
export const miscTick = (cap) => miscSeg(++miscN / 6, cap); // pal + 5 thumbnail-file fetches