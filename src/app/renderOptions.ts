import { appState } from './appState.ts';
import { playbackLoop } from './playbackLoop.ts';
import { localizer } from './localization.ts';
// Render options — the settings object read by the renderer plus the DOM
// control panel inside the render-settings dialog.
/** Live render options — persisted to localStorage on every change, pushed
 *  into the renderer via `setOpts`. */
export const renderOptions: Record<string, any> = { fps24: false, modernLighting: false, shadows: false, castOnOthers: false, selfShadow: false, smoothTex: false, smoothVerts: false, scale2x: false, aa: false, aaMode: 4, wireframe: false, lightInt: 1, selfShadowOp: 0.65 };
try { Object.assign(renderOptions, JSON.parse(localStorage.getItem('opts3dmm') || '{}')); delete renderOptions.mute; } catch { /* bad saved options */ }
if (renderOptions.aa && typeof renderOptions.aa !== 'boolean') { renderOptions.aaMode = renderOptions.aa; renderOptions.aa = true; } // migrate the old numeric aa value


/** Settings-dialog layout — [categoryKey, [[optKey, label, subKind?, subDef?]]];
 *  'range' = standalone slider (fraction 0-1), array = checkbox sub-options,
 *  'sel' = dropdown. */
export const RENDER_OPTION_DEFS: any[] = [
  ['catPlayback', [
    ['fps24', ''],
  ]],
  ['catLighting', [
    ['modernLighting', '', [['lightInt', 'lightInt', 0, 200]]],
  ]],
  ['catShadows', [
    ['selfShadowOp', '', 'range', [0, 100]],
    ['shadows', ''],
    ['castOnOthers', ''],
    ['selfShadow', ''],
  ]],
  ['catTextures', [
    ['smoothTex', ''],
    ['smoothVerts', ''],
  ]],
  ['catRendering', [
    ['scale2x', ''],
    ['aa', '', [['aaMode', 'aaMode', 'sel', [[2, 'aaMsaa2'], [4, 'aaMsaa4'], [8, 'aaMsaa8'], ['fsaa', 'aaFsaa']]]]],
    ['', ''],
  ]],
];
/** The DOM controls inside the render-settings dialog — built lazily on
 *  first open so ?lang= has loaded. */
class RenderOptionsPanel {
  panel = Object.assign(document.createElement('div'), { className: 'optPanel', hidden: true });
  controls: Record<string, any> = {}; // checkboxes, resynced on dialog revert
  inputs: any[] = [];                 // range/select controls
  built = false;
  /** Push the live options back into the controls (dialog revert). */
  syncControls = () => {
    for (const [k, cb] of Object.entries(this.controls)) { cb.checked = !!renderOptions[k]; if (cb._sub) cb._sub.hidden = !cb.checked; }
    for (const [k, el] of this.inputs) el.value = el.type === 'range' ? Math.round(renderOptions[k] * 100) : String(renderOptions[k]);
  };
  /** Build the controls lazily so ?lang= has loaded by first open. */
  build = () => {
  if (this.built) return; this.built = true;
  const menu = this.panel;
  for (const [cat, defs] of RENDER_OPTION_DEFS) {
    const h = document.createElement('div');
    h.className = 'optCat'; h.textContent = localizer.translate('opt.' + cat);
    menu.appendChild(h);
    for (const [key, label, sliders, selOpts] of defs) {
      const l = document.createElement('label');
      if (sliders === 'range') { // standalone slider option (fraction 0-1 value)
        l.className = 'optRange';
        const r = document.createElement('input');
        r.type = 'range'; r.min = selOpts[0]; r.max = selOpts[1]; r.value = String(Math.round(renderOptions[key] * 100));
        r.oninput = () => { renderOptions[key] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(renderOptions)); appState.sceneRenderer.setOpts(renderOptions); playbackLoop.drawFrame(); };
        this.inputs.push([key, r]);
        l.append(localizer.translate('opt.' + key), r);
        menu.appendChild(l);
        continue;
      }
      const cb = document.createElement('input');
      this.controls[key] = cb;
      cb.type = 'checkbox'; cb.checked = !!renderOptions[key];
      l.append(cb, localizer.translate('opt.' + key));
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
            scb.type = 'checkbox'; scb.checked = !!renderOptions[skey];
            this.controls[skey] = scb;
            scb.onchange = () => { renderOptions[skey] = scb.checked; localStorage.setItem('opts3dmm', JSON.stringify(renderOptions)); appState.sceneRenderer.setOpts(renderOptions); playbackLoop.drawFrame(); };
            sl.append(scb, localizer.translate('opt.' + slabel));
          } else if (min === 'sel') { // dropdown sub-option
            sl.className = 'optCheck';
            const sel = document.createElement('select');
            for (const [v, lbl] of max) { const o = document.createElement('option'); o.value = String(v); o.textContent = localizer.translate('opt.' + lbl); sel.appendChild(o); }
            sel.value = String(renderOptions[skey]);
            sel.onchange = () => { renderOptions[skey] = isNaN(+sel.value) ? sel.value : +sel.value; localStorage.setItem('opts3dmm', JSON.stringify(renderOptions)); appState.sceneRenderer.setOpts(renderOptions); playbackLoop.drawFrame(); };
            this.inputs.push([skey, sel]);
            sl.append(localizer.translate('opt.' + slabel), sel);
          } else {
            const r = document.createElement('input');
            r.type = 'range'; r.min = min; r.max = max; r.value = String(Math.round(renderOptions[skey] * 100));
            r.oninput = () => { renderOptions[skey] = +r.value / 100; localStorage.setItem('opts3dmm', JSON.stringify(renderOptions)); appState.sceneRenderer.setOpts(renderOptions); playbackLoop.drawFrame(); };
            this.inputs.push([skey, r]);
            sl.append(localizer.translate('opt.' + slabel), r);
          }
          sub.appendChild(sl);
        }
        menu.appendChild(sub);
        (cb as any)._sub = sub;
      }
      cb.onchange = () => {
        renderOptions[key] = cb.checked;
        localStorage.setItem('opts3dmm', JSON.stringify(renderOptions));
        if (sub) sub.hidden = !cb.checked;
        appState.sceneRenderer.setOpts(renderOptions);
        if (key === 'fps24' && appState.playing) playbackLoop.setPlaying(true); // restart the loop in the new mode
        playbackLoop.drawFrame();
      };
    }
  }
  };
}
export const renderOptionsPanel = new RenderOptionsPanel();
