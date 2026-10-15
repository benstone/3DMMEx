// Render options — the settings object read by the renderer plus the
// RENDER_OPTION_DEFS layout the canvas OptionsEasel renders.
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
