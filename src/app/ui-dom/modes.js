import { playing, player, sounds, setModeSync, modeSync } from '../state.js';
import { $, texUrl } from '../res.js';
import { setPlaying } from '../loop.js';
import { showOptsDlg } from './browsers.js';
// --- theatre mode (?3mm=...&mode=theatre) ------------------------------------
// The building's cinema (bldghd.cht kgobTheatre1 + theatre.cht kgobMovie):
// theatre1.pbm room (the1dark.pbm while the movie plays), the MVU fills the
// screen rect (48,85)-(592,391), projector-lens rewind/play sit at (293/318,7)
// and a volume slider runs down the left wall (9,110 + 62px travel). The editor
// chrome stays mounted but is covered by the opaque room.
export const mkThBtn = (up, dn, act) => {
  const b = document.createElement('button');
  b.className = 'stBtn';
  const im = document.createElement('img');
  const face = () => texUrl(`${typeof up === 'function' ? up() : up}`);
  im.src = face(); im.draggable = false;
  b.appendChild(im);
  b.onmousedown = () => { if (dn) im.src = texUrl(`${dn}`); };
  b.onmouseup = b.onmouseleave = () => { im.src = face(); };
  b.onclick = act;
  return { b, im };
};
export const thRewind = () => { // kgobRewindButton: rewind then play
  if (!player?.movie.scenes.length) return;
  player.loadScene(0); player.gotoFrame(player.scene.nfrmFirst); setPlaying(true);
};
export const mkSetLink = (parent) => { // small settings link, top-left — toggles the render modal
  const s = document.createElement('button');
  s.className = 'thSet'; s.textContent = 'settings';
  s.onclick = showOptsDlg; parent.appendChild(s);
};
export const mkVol = () => { // kgobTheaterVolume slidepath + thumb
  const vpath = document.createElement('div');
  vpath.className = 'thVol';
  const vth = document.createElement('img');
  vth.src = texUrl('thvol'); vth.className = 'stImg thVolT'; vth.draggable = false;
  vpath.appendChild(vth);
  const setVol = (y) => { // _kdySlider: 62 units of travel on the 74-high path
    sounds.setVolume(1 - Math.max(0, Math.min(62, y)) / 62);
    const f = 1 - sounds.volume;
    vth.style.top = f * 100 + '%'; vth.style.transform = `translateY(${-f * 100}%)`;
    localStorage.setItem('vol3dmm', String(sounds.volume));
  };
  setVol((1 - sounds.volume) * 62);
  vpath.onpointerdown = (e) => {
    vpath.setPointerCapture(e.pointerId);
    const r = vpath.getBoundingClientRect();
    const mv = (ev) => setVol((ev.clientY - r.top) / r.height * 74);
    mv(e);
    vpath.onpointermove = mv;
    vpath.onpointerup = () => { vpath.onpointermove = vpath.onpointerup = null; };
  };
  return vpath;
};
export function enterTheatre() {
  const studio = $('studio'), view = $('view');
  const th = document.createElement('div');
  th.id = 'theatre';
  const place = (el, x, y, w, h) => {
    el.style.left = (x / 6.4) + '%'; el.style.top = (y / 4.8) + '%';
    el.style.width = (w / 6.4) + '%'; el.style.height = (h / 4.8) + '%';
  };
  const bg = document.createElement('img');
  bg.className = 'stImg'; bg.src = texUrl('theatre1'); bg.draggable = false;
  th.appendChild(bg); place(bg, 0, 0, 640, 480);
  const scr = document.createElement('div'); // kgobMovie workspace
  scr.className = 'thScr'; th.appendChild(scr); place(scr, 48, 85, 544, 306);
  scr.appendChild(view); // the stage canvas becomes the movie screen
  view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const veil = document.createElement('div'); // click filter — no editing in the theatre
  veil.className = 'thVeil'; scr.appendChild(veil);
  const playB = mkThBtn(() => playing ? 'thstop' : 'thplay', null, () => setPlaying(!playing)); // kgobPlayButton: kst1/kst2 are play/stop faces, not press states
  th.appendChild(playB.b); place(playB.b, 318, 7, 25, 51);
  const rewB = mkThBtn('threw', 'threwc', thRewind);
  th.appendChild(rewB.b); place(rewB.b, 293, 7, 24, 51);
  const vpath = mkVol(); th.appendChild(vpath); place(vpath, 9, 110, 12, 74);
  studio.appendChild(th); mkSetLink(th);
  setModeSync(() => { // lights dim while the movie rolls (kst3 -> the1dark)
    bg.src = texUrl(`${playing ? 'the1dark' : 'theatre1'}`);
    playB.im.src = texUrl(`${playing ? 'thstop' : 'thplay'}`);
    vpath.hidden = !playing;
  });
  modeSync?.();
}
export function enterEmbed() { // bare movie screen — controls float above the corners
  const studio = $('studio'), view = $('view');
  const em = document.createElement('div');
  em.id = 'embed';
  const scr = document.createElement('div');
  scr.className = 'emScr'; em.appendChild(scr);
  scr.appendChild(view);
  view.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const veil = document.createElement('div'); // click filter — no editing
  veil.className = 'thVeil'; scr.appendChild(veil);
  const vpath = mkVol(); vpath.classList.add('emVol'); em.appendChild(vpath);
  const rewB = mkThBtn('threw', 'threwc', thRewind); // rewind left, play right — same order as the projector lens
  rewB.b.classList.add('emRew'); em.appendChild(rewB.b);
  const playB = mkThBtn(() => playing ? 'thstop' : 'thplay', null, () => setPlaying(!playing));
  playB.b.classList.add('emPlay'); em.appendChild(playB.b);
  studio.appendChild(em); mkSetLink(em);
  setModeSync(() => { playB.im.src = texUrl(`${playing ? 'thstop' : 'thplay'}`); });
  modeSync?.();
}