import { playing } from './state.js';import { draw, setPlaying } from './loop.js';import { renderer } from './state.js';
// --- options ---------------------------------------------------------------
export const opts = { fps24: false, modernLighting: false, shadows: false, castOnOthers: false, selfShadow: false, smoothTex: false, smoothVerts: false, scale2x: false, aa: false, aaMode: 4, wireframe: false, lightInt: 1, selfShadowOp: 0.65 };
try { Object.assign(opts, JSON.parse(localStorage.getItem('opts3dmm') || '{}')); delete opts.mute; } catch { /* bad saved opts */ }
if (opts.aa && typeof opts.aa !== 'boolean') { opts.aaMode = opts.aa; opts.aa = true; } // migrate old numeric aa value


export const OPT_DEFS = [
  ['playback', [
    ['fps24', 'smooth playback (24 fps)'],
  ]],
  ['lighting', [
    ['modernLighting', 'modern lighting (smooth shading)', [['lightInt', 'intensity', 0, 200]]],
  ]],
  ['shadows', [
    ['selfShadowOp', 'shadow opacity', 'range', [0, 100]],
    ['shadows', 'ground shadows'],
    ['castOnOthers', 'cast on others'],
    ['selfShadow', 'self shadows'],
  ]],
  ['textures', [
    ['smoothTex', 'smooth textures'],
    ['smoothVerts', 'vertex smoothing'],
  ]],
  ['rendering', [
    ['scale2x', '2x render resolution'],
    ['aa', 'antialiasing', [['aaMode', 'mode', 'sel', [[2, 'msaa 2x'], [4, 'msaa 4x'], [8, 'msaa 8x'], ['fsaa', 'fsaa (2x supersample)']]]]],
    ['wireframe', 'wireframe'],
  ]],
];
export const optCbs = {}, optInputs = []; // checkboxes + range/select controls, resynced on dialog revert
export const optSync = () => {
  for (const [k, cb] of Object.entries(optCbs)) { cb.checked = !!opts[k]; if (cb._sub) cb._sub.hidden = !cb.checked; }
  for (const [k, el] of optInputs) el.value = el.type === 'range' ? Math.round(opts[k] * 100) : String(opts[k]);
};
export const optsPanel = document.createElement('div'); // render-settings controls — shown in the book button's dialog
optsPanel.className = 'optPanel'; optsPanel.hidden = true;
{
  const menu = optsPanel;
  for (const [cat, defs] of OPT_DEFS) {
    const h = document.createElement('div');
    h.className = 'optCat'; h.textContent = cat;
    menu.appendChild(h);
    for (const [key, label, sliders, selOpts] of defs) {
      const l = document.createElement('label');
      if (sliders === 'range') { // standalone slider option (fraction 0-1 value)
        l.className = 'optRange';
        const r = document.createElement('input');
        r.type = 'range'; r.min = selOpts[0]; r.max = selOpts[1]; r.value = Math.round(opts[key] * 100);
        r.oninput = () => { opts[key] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
        optInputs.push([key, r]);
        l.append(label, r);
        menu.appendChild(l);
        continue;
      }
      const cb = document.createElement('input');
      optCbs[key] = cb;
      cb.type = 'checkbox'; cb.checked = !!opts[key];
      l.append(cb, label);
      menu.appendChild(l);
      let sub = null;
      if (sliders) {
        sub = document.createElement('div');
        sub.className = 'optSub'; sub.hidden = !cb.checked;
        for (const [skey, slabel, min, max] of sliders) {
          const sl = document.createElement('label');
          if (min === undefined) { // boolean sub-option
            sl.className = 'optCheck';
            const scb = document.createElement('input');
            scb.type = 'checkbox'; scb.checked = !!opts[skey];
            optCbs[skey] = scb;
            scb.onchange = () => { opts[skey] = scb.checked; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            sl.append(scb, slabel);
          } else if (min === 'sel') { // dropdown sub-option
            sl.className = 'optCheck';
            const sel = document.createElement('select');
            for (const [v, t] of max) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
            sel.value = String(opts[skey]);
            sel.onchange = () => { opts[skey] = isNaN(+sel.value) ? sel.value : +sel.value; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            optInputs.push([skey, sel]);
            sl.append(slabel, sel);
          } else {
            const r = document.createElement('input');
            r.type = 'range'; r.min = min; r.max = max; r.value = Math.round(opts[skey] * 100);
            r.oninput = () => { opts[skey] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(opts)); renderer.setOpts(opts); draw(); };
            optInputs.push([skey, r]);
            sl.append(slabel, r);
          }
          sub.appendChild(sl);
        }
        menu.appendChild(sub);
        cb._sub = sub;
      }
      cb.onchange = () => {
        opts[key] = cb.checked;
        localStorage.setItem('opts3dmm', JSON.stringify(opts));
        if (sub) sub.hidden = !cb.checked;
        renderer.setOpts(opts);
        if (key === 'fps24' && playing) setPlaying(true); // restart the loop in the new mode
        draw();
      };
    }
  }
}