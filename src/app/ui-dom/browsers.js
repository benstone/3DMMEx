import { playing } from '../state.js';import { $ } from '../res.js';import { editBkgd, editCam } from '../edit/movie.js';import { setSndTag } from '../edit/sound.js';import { setPlaying, draw } from '../loop.js';import { opts, optsPanel, optSync } from '../opts.js';import { texUrl } from '../res.js';import { getSndItems, addUserSnd, importSndFiles, previewItem } from '../sndsrc.js';import { sounds, renderer, player, setPendPlace } from '../state.js';import { bkthCaths, brwsTmpls, mbmpCanvas } from '../thumbs.js';import { showSpletter, showWords, showRecorder } from './easels.js';
// --- item browser dialogs (browser.cht): modal book panel + frame grid + page controls
export const BRWS_DEFS = {
  // kidBrwsBackground/kidBrwsSceneFrames: book1 at (62,48) via reg (258,370); frames 136x78, cells +4.
  // Cancel/OK bitmaps are bottom-anchored (kypregGenericCancel=48): source y368 -> top-left 320.
  scene: { book: 'book1', x: 62, y: 48, fw: 136, fh: 78, fr: 'frame1', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  bkgd: { book: 'book1', x: 62, y: 48, fw: 136, fh: 78, fr: 'frame1', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  // kidBrwsCamera: book2 at (62,100), same grid, frame2 cells
  cam:  { book: 'book2', x: 62, y: 100, fw: 136, fh: 78, fr: 'frame2', cols: 3, rows: 3, x0: 40, y0: 40, sx: 150, sy: 87, fwd: [303, 320], back: [155, 320], num: [226, 330], can: [437, 320] },
  actor: { book: 'book3', x: 62, y: 47, fw: 80, fh: 80, fr: 'frame3', cols: 5, rows: 3, x0: 30, y0: 38, sx: 94, sy: 94, fwd: [304, 322], back: [155, 322], num: [228, 327], can: [437, 320] },
  prop: { book: 'book4', x: 62, y: 47, fw: 80, fh: 80, fr: 'frame4', cols: 5, rows: 3, x0: 30, y0: 38, sx: 94, sy: 94, fwd: [304, 322], back: [155, 322], num: [228, 327], can: [437, 320] },
  // sound name-list browsers (browser.cht kidBrwsSounds*): book6=midi, book7=fx, book8=speech
  fx:     { book: 'book7', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], rec: [29, 320], imp: [79, 320] },
  speech: { book: 'book8', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], rec: [29, 320], imp: [79, 320] },
  music:  { book: 'book6', x: 62, y: 48, fw: 138, fh: 25, fr: 'frame5', cols: 3, rows: 10, colMajor: true, x0: 31, y0: 34, sx: 158, sy: 28, fwd: [303, 320], back: [154, 320], num: [230, 326], ok: [437, 320], can: [387, 320], imp: [79, 320] },
};

export let brwsEl = null, brwsCleanup = null;
export const setBrwsEl = (v) => (brwsEl = v);
export const setBrwsCleanup = (v) => (brwsCleanup = v);
export function closeBrowser() { sounds.stopPreview(); brwsCleanup?.(); brwsCleanup = null; brwsEl?.remove(); brwsEl = null; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && brwsEl) (brwsEl._onEsc || closeBrowser)(); }); // easel cidEaselCancel on Escape
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
  ttl.textContent = 'render settings'; bar.appendChild(ttl);
  const x = document.createElement('button');
  x.className = 'optX'; x.textContent = '×'; x.onclick = () => closeOptsDlg(true); bar.appendChild(x);
  optsPanel.hidden = false; box.appendChild(optsPanel);
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
export function showBrowser(kind, importItems = null) {
  if (kind === 'splt') return showSpletter();
  if (kind === 'words') return showWords();
  if (!player) return;
  const d = BRWS_DEFS[kind];
  const { place, mkImg, mkBtn } = brwsShell();
  const items = importItems || (kind === 'scene' ? player.movie.scenes.map((s, i) => ({ s, i }))
    : kind === 'cam' ? [...(bkthCaths.get(player.bkgd?.cno) ?? [])].sort((a, b) => a[0] - b[0]).map(([icam, mbmp]) => ({ icam, name: `camera ${icam}`, mbmp }))
    : d.fw === 138 ? getSndItems()[kind]
    : brwsTmpls[kind === 'bkgd' ? 'scene' : kind]);
  const perPage = d.cols * d.rows;
  mkImg(d.book, d.x, d.y, 516, 372);
  const num = document.createElement('div');
  num.className = 'brwsNum'; brwsEl.appendChild(num); place(num, d.x + d.num[0], d.y + d.num[1], 64, 29); // REP_RECT at gob pos
  let page = 0, sel = -1;
  const cells = [];
  for (let c = 0; c < d.cols; c++) for (let r = 0; r < d.rows; r++) { // sound lists fill column-major
    const b = document.createElement('button');
    b.className = 'stBtn brwsCell';
    const fim = document.createElement('img'); fim.src = texUrl(`${d.fr}`); fim.draggable = false;
    b.appendChild(fim); brwsEl.appendChild(b);
    place(b, d.x + d.x0 + c * d.sx, d.y + d.y0 + r * d.sy, d.fw, d.fh);
    const cv = document.createElement('canvas');
    cv.className = 'brwsCv'; brwsEl.appendChild(cv);
    place(cv, d.x + d.x0 + c * d.sx + 4, d.y + d.y0 + r * d.sy + 4, d.fw - 8, d.fh - 8);
    cells.push({ b, fim, cv });
  }
  const nPages = () => Math.max(1, Math.ceil(items.length / perPage));
  mkBtn('fwd', 'fwdc', d.x + d.fwd[0], d.y + d.fwd[1], 59, 46, () => { page = Math.min(nPages() - 1, page + 1); render(); });
  mkBtn('bback', 'bbackc', d.x + d.back[0], d.y + d.back[1], 59, 46, () => { page = Math.max(0, page - 1); render(); });
  if (d.ok) mkBtn('okay', 'okayc', d.x + d.ok[0], d.y + d.ok[1], 50, 48, () => {
    if (importItems) { // import pick -> into the browser's list
      if (sel < 0) return;
      addUserSnd(kind, items[sel]); showBrowser(kind); return;
    }
    setSndTag(kind, sel >= 0 ? items[sel] : null); // BRWN::FCmdOk -> MVU::SetTagTool
    closeBrowser();                              // (empty pick clears the tool sound)
  });
  mkBtn('cancel', 'cancelc', d.x + d.can[0], d.y + d.can[1], 50, 48, () => importItems ? showBrowser(kind) : closeBrowser());
  if (d.rec && !importItems) mkBtn('mike', 'mikes', d.x + d.rec[0], d.y + d.rec[1], 50, 48, () => showRecorder(kind));
  if (d.imp && !importItems) mkBtn('sndport', 'sndports', d.x + d.imp[0], d.y + d.imp[1], 50, 48, () => importSndFiles(kind));
  function render() {
    num.textContent = `${page + 1} / ${nPages()}`;
    for (let i = 0; i < cells.length; i++) {
      const it = items[page * perPage + i], { b, fim, cv } = cells[i];
      cv.width = d.fw - 8; cv.height = d.fh - 8;
      cv.style.display = b.style.display = it ? '' : 'none';
      if (!it) continue;
      const x = cv.getContext('2d');
      if (it.mbmp) x.drawImage(mbmpCanvas(it.mbmp, cv.width, cv.height), 0, 0);
      else if (it.s) { // scene cell: text label (index, name, length)
        x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 14px "Comic Sans MS", cursive, sans-serif';
        x.fillText(`${it.i + 1}`, cv.width / 2, 16);
        x.font = '11px "Comic Sans MS", cursive, sans-serif';
        x.fillText((it.s.name || 'scene').slice(0, 18), cv.width / 2, 40);
        x.fillText(`${it.s.nfrmLast - it.s.nfrmFirst + 1} frames`, cv.width / 2, 58);
      } else { // sound name cell
        x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '10px "Comic Sans MS", cursive, sans-serif';
        x.fillText(it.name, cv.width / 2, cv.height / 2);
      }
      b.onmousedown = () => { fim.src = texUrl(`${d.fr}h`); };
      b.onmouseup = b.onmouseleave = () => { fim.src = page * perPage + i === sel ? texUrl(`${d.fr}h`) : texUrl(`${d.fr}`); };
      b.onclick = d.ok
        ? () => { sel = page * perPage + i; for (const o of cells) o.fim.src = texUrl(`${d.fr}`); fim.src = texUrl(`${d.fr}h`); previewItem(it); }
        : () => {
            if (kind === 'bkgd') editBkgd(it.cno, it.name); // FSetBkgdCore: fill empty scene else insert new
            else if (kind === 'cam') editCam(it.icam); // kidBrwsCamera -> ChngCamera event
            else if (kind === 'actor' || kind === 'prop') { // pick template -> click stage to place
              setPendPlace({ cno: it.cno, name: it.name });
              $('view').style.cursor = 'crosshair';
            } else if (kind === 'scene') { setPlaying(false); player.loadScene(it.i); }
            closeBrowser(); draw();
          };
    }
  }
  render();
}