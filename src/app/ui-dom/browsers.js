import { playing, sounds, renderer, player } from '../state.js';
import { $, texUrl } from '../res.js';
import { setPlaying, draw } from '../loop.js';
import { opts, optsPanel, optSync, buildOptsPanel } from '../opts.js';
import { t } from '../i18n.js';
import { closeBrowser } from '../ui/browser.js';
// --- easel shell + settings dialog (still DOM until easels are ported in M6).
// The book browsers moved to the canvas stack — see app/ui/browser.js.
export { showBrowser, closeBrowser, BRWS_DEFS } from '../ui/browser.js';

export let brwsEl = null, brwsCleanup = null;
export const setBrwsEl = (v) => (brwsEl = v);
export const setBrwsCleanup = (v) => (brwsCleanup = v);
export function brwsShell() { // shared: overlay div + % placement helper
  closeBrowser();
  brwsEl = document.createElement('div');
  brwsEl.id = 'brws';
  $('studio').appendChild(brwsEl);
  const place = (el, x, y, w, h) => {
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  };
  const mkImg = (n, x, y, w, h, cls = 'stImg') => {
    const im = document.createElement('img');
    im.src = texUrl(`${n}`); im.className = cls; im.draggable = false;
    brwsEl.appendChild(im); place(im, x, y, w, h);
    return im;
  };
  const mkBtn = (up, dn, x, y, w, h, act) => {
    const b = document.createElement('button');
    b.className = 'stBtn';
    const im = document.createElement('img');
    im.src = texUrl(`${up}`); im.draggable = false;
    b.appendChild(im); brwsEl.appendChild(b); place(b, x, y, w, h);
    b.onmousedown = () => { im.src = texUrl(`${dn}`); };
    b.onmouseup = b.onmouseleave = () => { im.src = texUrl(`${up}`); };
    if (act) b.onclick = act;
    return b;
  };
  return { place, mkImg, mkBtn };
}
export let optDlg = null, optSnap = null;
export function showOptsDlg() { // book button + theatre/embed settings link -> render settings modal
  if (optDlg) { closeOptsDlg(true); return; } // it's a toggle — second call commits
  optSnap = structuredClone(opts);
  const ov = optDlg = document.createElement('div');
  ov.className = 'optModal';
  const box = document.createElement('div');
  box.className = 'optBox'; ov.appendChild(box);
  const bar = document.createElement('div');
  bar.className = 'optBar'; box.appendChild(bar);
  const ttl = document.createElement('span');
  ttl.textContent = t('ui.renderSettings'); bar.appendChild(ttl);
  const x = document.createElement('button');
  x.className = 'optX'; x.textContent = '×'; x.onclick = () => closeOptsDlg(true); bar.appendChild(x);
  buildOptsPanel(); optsPanel.hidden = false; box.appendChild(optsPanel);
  const pos = JSON.parse(localStorage.getItem('optdlgpos') || 'null');
  if (pos) { box.style.position = 'fixed'; box.style.left = pos.x + 'px'; box.style.top = pos.y + 'px'; }
  bar.onpointerdown = (e) => { // drag the modal by its titlebar
    if (e.target === x) return;
    e.preventDefault();
    const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    box.style.position = 'fixed'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    const mv = (e2) => {
      box.style.left = Math.min(Math.max(e2.clientX - dx, 0), innerWidth - 60) + 'px';
      box.style.top = Math.min(Math.max(e2.clientY - dy, 0), innerHeight - 40) + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const r2 = box.getBoundingClientRect();
      localStorage.setItem('optdlgpos', JSON.stringify({ x: r2.left, y: r2.top }));
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  document.body.appendChild(ov);
}
export function closeOptsDlg(keep) { // OK commits; Cancel/Esc reverts the session's changes
  if (!optDlg) return;
  optDlg.remove(); optDlg = null; optsPanel.hidden = true;
  if (keep) return;
  Object.assign(opts, optSnap);
  optSync(); localStorage.setItem('opts3dmm', JSON.stringify(opts));
  renderer.setOpts(opts);
  if (playing) setPlaying(true); draw();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && optDlg) closeOptsDlg(false); });
