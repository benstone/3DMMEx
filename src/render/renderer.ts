// three.js renderer reproducing 3DMM's 8-bit palette pipeline at 544x306.
import * as THREE from 'three';
import { drawTextboxes } from './textbox.ts';

/** Scene render size — the camera's native resolution, upscaled by the UI. */
export const WIDTH = 544, HEIGHT = 306;

/** Convert a 3DMM 3x4 row-major matrix to a three.js Matrix4. */
export const toMatrix4 = (m) => new THREE.Matrix4().set(
  m[0], m[3], m[6], m[9], m[1], m[4], m[7], m[10], m[2], m[5], m[8], m[11], 0, 0, 0, 1);

const BG_VS = `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BG_FS = `precision highp float; in vec2 vUv; uniform sampler2D uIndex, uDepth, uPalette;
uniform float uSmooth;
uniform mat4 uInvVP, uSelfVP; uniform sampler2D uSelfMap; uniform float uBgShadow, uBgOp;
out vec4 outColor;
vec3 palette(float idx){ return texture(uPalette, vec2((idx + 0.5) / 256.0, 0.5)).rgb; }
float bgShade(vec3 wp){ // darken where the actor shadow map occludes the key light (soft PCF)
  vec4 lp = uSelfVP * vec4(wp, 1.0);
  vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z < 0.0 || sc.z > 1.0) return 1.0;
  vec2 ts = 1.0 / vec2(textureSize(uSelfMap, 0));
  float lit = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    lit += sc.z - 0.004 > texture(uSelfMap, sc.xy + vec2(x, y) * ts).r ? 0.0 : 1.0;
  return mix(1.0 - uBgOp, 1.0, lit / 9.0);
}
void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 col;
  if (uSmooth > 0.5) { // blend colors, not indices: 4-tap texelFetch + palette map + bilinear mix
    ivec2 ts = textureSize(uIndex, 0);
    vec2 t = uv * vec2(ts) - 0.5, f = fract(t);
    ivec2 i = ivec2(floor(t)), j = min(i + 1, ts - 1);
    col = mix(mix(palette(texelFetch(uIndex, i, 0).r * 255.0), palette(texelFetch(uIndex, ivec2(j.x, i.y), 0).r * 255.0), f.x),
              mix(palette(texelFetch(uIndex, ivec2(i.x, j.y), 0).r * 255.0), palette(texelFetch(uIndex, j, 0).r * 255.0), f.x), f.y);
  } else {
    col = palette(texture(uIndex, uv).r * 255.0);
  }
  vec2 zd = texture(uDepth, uv).rg * 255.0;
  float z = zd.y * 256.0 + zd.x;              // raw u16
  float zi = z > 32767.5 ? z - 65536.0 : z;   // BRender zb16 = -32768*ndc... stored signed
  if (uBgShadow > 0.5 && z < 65535.0) { // reconstruct world pos from depth, then shadow-test
    vec4 wp4 = uInvVP * vec4(vUv * 2.0 - 1.0, zi / 32768.0, 1.0);
    col *= bgShade(wp4.xyz / wp4.w);
  }
  outColor = vec4(col, 1.0);
  gl_FragDepth = z >= 65535.0 ? 1.0 : clamp((zi / 32768.0 + 1.0) * 0.5, 0.0, 1.0); // -1 = sky (far)
}`;
const ACT_VS = `out vec3 vN; out vec2 vUv; out vec3 vWp;
void main(){ vN = normalize(transpose(inverse(mat3(modelMatrix))) * normal); vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ACT_FS = `precision highp float; in vec3 vN; in vec2 vUv; in vec3 vWp;
uniform sampler2D uPalette, uTex; uniform bool uTextured; uniform float uBase, uRange, uKa, uKd, uSmooth, uModern;
uniform float uLightMul, uShadeMul;
uniform vec3 uLightDir[4]; uniform float uLightI[4]; uniform int uLights; uniform mat3 uTxxf;
uniform mat4 uSelfVP; uniform sampler2D uSelfMap, uSelfId; uniform float uSelfShadow, uOthersShadow, uSelfOp, uAid; uniform vec3 uSelfDir;
out vec4 outColor;
vec3 palette(float idx){ return texture(uPalette, vec2((idx + 0.5) / 256.0, 0.5)).rgb; }
float selfShade(){
  if (uSelfShadow < 0.5 && uOthersShadow < 0.5) return 1.0;
  vec4 lp = uSelfVP * vec4(vWp, 1.0);
  vec3 sc = lp.xyz / lp.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float bias = max(0.0035 * (1.0 - abs(dot(n, uSelfDir))), 0.0012); // slope-scaled anti-acne
  float lit = 0.0; // 3x3 PCF, per-tap actor-id discrimination (id 0 = no occluder)
  vec2 ts = 1.0 / vec2(textureSize(uSelfMap, 0));
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 tuv = sc.xy + vec2(x, y) * ts;
    bool occ = sc.z - bias > texture(uSelfMap, tuv).r;
    bool self = abs(texture(uSelfId, tuv).r * 255.0 - uAid) < 0.5;
    lit += occ && (self ? uSelfShadow > 0.5 : uOthersShadow > 0.5) ? 0.0 : 1.0;
  }
  return mix(1.0 - uSelfOp, 1.0, lit / 9.0);
}
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float ss = selfShade();
  if (uTextured) {
    vec2 t = (uTxxf * vec3(vUv, 1.0)).xy;
    vec3 col;
    if (uSmooth > 0.5) { // blend colors, not indices
      ivec2 ts = textureSize(uTex, 0);
      vec2 g = fract(t) * vec2(ts) - 0.5, f = fract(g);
      ivec2 i = ivec2(floor(g)), j = i + 1;
      i = (i % ts + ts) % ts; j = (j % ts + ts) % ts; // wrap
      col = mix(mix(palette(texelFetch(uTex, i, 0).r * 255.0), palette(texelFetch(uTex, ivec2(j.x, i.y), 0).r * 255.0), f.x),
                mix(palette(texelFetch(uTex, ivec2(i.x, j.y), 0).r * 255.0), palette(texelFetch(uTex, j, 0).r * 255.0), f.x), f.y);
    } else {
      col = palette(texture(uTex, fract(t)).r * 255.0);
    }
    // modern: shade textured parts with the scene lights instead of flat-bright
    float li = 0.0;
    for (int k = 0; k < 4; k++) if (k < uLights) li += max(0.0, dot(n, uLightDir[k])) * uLightI[k] * uLightMul;
    float lit = mix(1.0, clamp((0.45 + uKa * 0.5) * uShadeMul + li * uKd, 0.1, 1.5), uModern);
    outColor = vec4(col * ss * lit, 1.0);
    return;
  }
  float i = uKa * uShadeMul;
  for (int k = 0; k < 4; k++) if (k < uLights) i += uKd * uLightMul * max(0.0, dot(n, uLightDir[k])) * uLightI[k] * ss;
  float q = clamp(i, 0.0, 1.0) * uRange;
  float idx = uBase + (uSmooth > 0.5 ? q : floor(q)); // fractional index -> smooth ramp w/ linear palette
  outColor = vec4(palette(idx), 1.0);
}`;
const COPY_FS = `precision highp float; in vec2 vUv; uniform sampler2D uSrc; out vec4 outColor;
void main(){ outColor = texture(uSrc, vUv); }`;
// light-space depth pass: writes actor id to color, depth to the depth attachment
const DEPTH_VS = `void main(){ gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const DEPTH_FS = `precision highp float; uniform float uAid; out vec4 outColor;
void main(){ outColor = vec4(uAid / 255.0, 0.0, 0.0, 1.0); }`;

// smooth-shaded variant: average face normals across ALL coincident vertices,
// so lighting is continuous across index seams and UV-split duplicates
/** Clone a geometry with welded smooth normals — vertices sharing a position
 *  accumulate their face normals (area-weighted) and get the normalized sum.
 *  Used by the 'smooth verts' render option. */
function smoothNormalsGeometry(geo) {
  const g = geo.clone();
  const pos = g.getAttribute('position'), idx = g.index.array;
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const acc = new Map(); // poskey -> accumulated face normal
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b) - ax, by = pos.getY(b) - ay, bz = pos.getZ(b) - az;
    const cx = pos.getX(c) - ax, cy = pos.getY(c) - ay, cz = pos.getZ(c) - az;
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx; // area-weighted
    for (const v of [a, b, c]) {
      const k = key(v);
      let e = acc.get(k);
      if (!e) acc.set(k, e = [0, 0, 0]);
      e[0] += nx; e[1] += ny; e[2] += nz;
    }
  }
  const nrm = new Float32Array(pos.count * 3);
  const src = g.getAttribute('normal'); // keep the computed normal for verts no face references
  for (let i = 0; i < pos.count; i++) {
    const e = acc.get(key(i));
    if (!e) { nrm[i * 3] = src.getX(i); nrm[i * 3 + 1] = src.getY(i); nrm[i * 3 + 2] = src.getZ(i); continue; }
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    nrm[i * 3] = e[0] / l; nrm[i * 3 + 1] = e[1] / l; nrm[i * 3 + 2] = e[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
const TRANS_FS = `precision highp float; in vec2 vUv; uniform sampler2D uPrev, uCur;
uniform int uMode; uniform float uT;
out vec4 outColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec4 prev = texture(uPrev, vUv);
  vec4 cur = texture(uCur, vUv);
  if (uMode == 1) outColor = mix(prev, vec4(0.0, 0.0, 0.0, 1.0), uT);        // fade to black
  else if (uMode == 2) outColor = mix(prev, vec4(1.0, 1.0, 1.0, 1.0), uT);  // fade to white
  else if (uMode == 3) outColor = hash(gl_FragCoord.xy) < uT ? cur : prev;  // dissolve
  else if (uMode == 4) outColor = vec4(0.0, 0.0, 0.0, 1.0);                 // black
  else outColor = cur;
}`;

/** WebGL scene renderer reproducing 3DMM's 8-bit palette pipeline — indexed
 *  background image + depth, palette-mapped actor shading, light-space shadow
 *  maps, scene transitions, antialiasing, and the textbox overlay.
 *  `render(moviePlayer, t)` draws a frame; `beginFrame`/`snapshot` bracket
 *  interpolation and transitions; `pickActor`/`groundPoint`/`viewPlanePoint`/
 *  `actorScreenRect` are the editor's pointer helpers. */
export class Renderer {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  /** Build the GL pipeline on `canvas` — render targets, shader scenes, and
   *  caches. `basePalette` is the content file's 256-entry RGB table. */
  constructor(canvas, basePalette) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }); // preserve so the UI canvas can blit this canvas between renders
    this.gl.setPixelRatio(1);
    this.gl.setSize(WIDTH, HEIGHT, false);
    this.gl.autoClear = false;
    this.basePalette = basePalette;
    // light-space shadow map (created early: bgMat uniforms reference it)
    this.selfRT = new THREE.WebGLRenderTarget(2048, 2048, { depthTexture: new THREE.DepthTexture(2048, 2048, THREE.UnsignedIntType) });
    this._depthMats = new Map(); // per-actor-id depth-pass materials (avoids sampling uSelfMap while it's bound as the depth attachment)
    this.lightCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    this._lightVP = new THREE.Matrix4();
    this._selfDir = new THREE.Vector3(0, 1, 0); // toward the key light
    this._invVP = new THREE.Matrix4();          // camera inverse view-projection (bg world reconstruction)
    this.paletteData = new Uint8Array(256 * 4);
    this.palette = new THREE.DataTexture(this.paletteData, 256, 1);
    this.palette.magFilter = this.palette.minFilter = THREE.NearestFilter;
    this.setPalette(null);
    this.bgScene = new THREE.Scene();
    this.bgCam = new THREE.Camera();
    this.bgMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: BG_FS,
      uniforms: { uIndex: { value: null }, uDepth: { value: null }, uPalette: { value: this.palette }, uSmooth: { value: 0 },
        uInvVP: { value: this._invVP }, uSelfVP: { value: this._lightVP }, uSelfMap: { value: this.selfRT.depthTexture },
        uBgShadow: { value: 0 }, uBgOp: { value: 0.4 } },
      depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true });
    this.bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    this.bgMesh.frustumCulled = false;
    this.bgScene.add(this.bgMesh);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 1, 5000);
    this.camera.matrixAutoUpdate = false;
    this.lights = { dirs: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 0, 1)), intensity: [0, 0, 0, 0], count: 0 };
    this.geoms = new Map();
    this.geomsS = new Map(); // welded/smooth-normal variants
    this.mats = new Map();
    this.texs = new Map();
    this.meshPool = [];
    this.bgKey = null;
    // transition render targets + compositor
    this.prevRT = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true });
    this.curRT = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true });
    this.transMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: TRANS_FS,
      uniforms: { uPrev: { value: this.prevRT.texture }, uCur: { value: this.curRT.texture }, uMode: { value: 0 }, uT: { value: 0 } },
      depthTest: false, depthWrite: false });
    this.transMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.transMat);
    this.transMesh.frustumCulled = false;
    this.transScene = new THREE.Scene();
    this.transScene.add(this.transMesh);
    // antialiasing: MSAA render target resolved to screen via a copy pass
    this.aaRT = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true, samples: 4 });
    this.copyMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: COPY_FS,
      uniforms: { uSrc: { value: this.aaRT.texture } }, depthTest: false, depthWrite: false });
    this.copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat);
    this.copyMesh.frustumCulled = false;
    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyMesh);
    // text box overlay: 2d canvas drawn as a transparent fullscreen quad
    this.ovCanvas = document.createElement('canvas');
    this.ovCanvas.width = WIDTH; this.ovCanvas.height = HEIGHT;
    this.ovCtx = this.ovCanvas.getContext('2d');
    this.ovTex = new THREE.CanvasTexture(this.ovCanvas);
    this.ovTex.magFilter = this.ovTex.minFilter = THREE.NearestFilter;
    this.ovMat = new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthTest: false });
    this.ovMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ovMat);
    this.ovMesh.frustumCulled = false;
    this.ovScene = new THREE.Scene();
    this.ovScene.add(this.ovMesh);
    this.palColors = null;
    this.textboxChrome = null; // {textbox, a, b, caret} — tbox selection/caret chrome for the overlay
    // modern options
    this.opts = { fps24: false, modernLighting: false, shadows: false, castOnOthers: false, selfShadow: false, smoothTex: false, smoothVerts: false, scale2x: false, aa: 0, wireframe: false, lightInt: 1, shadeInt: 1, selfShadowOp: 0.65 };
    this._prevW = new Map(); this._curW = new Map();   // per-actor part world matrices (prev vs target step)
    this._prevCam = null; this._curCam = null;
    this._sceneIdx = -1;
    this._lightDir = new THREE.Vector3(0.3, -1, 0.3); // shadow cast direction (away from key light)
    this._ray = new THREE.Raycaster(); // editor picking/drag helpers
    this._ndc = new THREE.Vector2();
    this._pv = new THREE.Vector3(); this._pv2 = new THREE.Vector3();
    this._pm4 = new THREE.Matrix4();
    // selection: 3D bounding box in world space around the selected actor
    this.selActor = null;
    this._selHelper = new THREE.Box3Helper(new THREE.Box3(), 0xffffff);
    this._selHelper.visible = false;
    this.scene.add(this._selHelper);
    this._selUnion = new THREE.Box3(); this._selPartBox = new THREE.Box3();
  }

  /** Apply option changes (called from the options menu). */
  setOpts(o) {
    Object.assign(this.opts, o);
    const pf = this.opts.modernLighting ? THREE.LinearFilter : THREE.NearestFilter;
    this.palette.magFilter = this.palette.minFilter = pf; this.palette.needsUpdate = true;
    this.bgMat.uniforms.uSmooth.value = this.opts.smoothTex ? 1 : 0;
    this.bgMat.uniforms.uBgOp.value = this.opts.selfShadowOp; // shared shadow opacity for all shadow receivers
    for (const m of this.mats.values()) {
      m.wireframe = this.opts.wireframe;
      if (m.uniforms?.uSmooth) m.uniforms.uSmooth.value = (this.opts.modernLighting || this.opts.smoothTex) ? 1 : 0;
      if (m.uniforms?.uModern) m.uniforms.uModern.value = this.opts.modernLighting ? 1 : 0;
      if (m.uniforms?.uLightMul) m.uniforms.uLightMul.value = this.opts.lightInt;
      if (m.uniforms?.uShadeMul) m.uniforms.uShadeMul.value = this.opts.selfShadowOp;
      if (m.uniforms?.uSelfOp) m.uniforms.uSelfOp.value = this.opts.selfShadowOp;
    }
    const pr = this.opts.scale2x ? 2 : 1;
    this.gl.setPixelRatio(pr); this.gl.setSize(WIDTH, HEIGHT, false);
    this.prevRT.setSize(WIDTH * pr, HEIGHT * pr); this.curRT.setSize(WIDTH * pr, HEIGHT * pr);
    // antialiasing: opts.aa toggles, opts.aaMode selects 2/4/8=MSAA samples or 'fsaa'=2x supersample + linear downscale
    const fsaa = this.opts.aa && this.opts.aaMode === 'fsaa';
    const samples = fsaa ? 0 : (this.opts.aa ? (+this.opts.aaMode || 0) : 0);
    if (this.aaRT.samples !== samples) { this.aaRT.samples = Math.min(samples, this.gl.capabilities.maxSamples); this.aaRT.dispose(); }
    this.aaRT.setSize(WIDTH * pr * (fsaa ? 2 : 1), HEIGHT * pr * (fsaa ? 2 : 1));
    const af = fsaa ? THREE.LinearFilter : THREE.NearestFilter;
    if (this.aaRT.texture.magFilter !== af) { this.aaRT.texture.magFilter = this.aaRT.texture.minFilter = af; this.aaRT.texture.needsUpdate = true; }
  }

  /** Snapshot rendered state as the interpolation start (call right before moviePlayer.step()). */
  beginFrame() {
    this._prevW = this._curW; this._curW = new Map();
    this._prevCam = this._curCam;
  }

  /** Load the base palette plus a background's palette overlay (at indexBase)
   *  into the palette texture — also refreshes `palColors` for 2D drawing. */
  setPalette(bkgd) {
    const p = this.paletteData;
    for (let i = 0; i < 256; i++) { p[i * 4] = this.basePalette[i * 3]; p[i * 4 + 1] = this.basePalette[i * 3 + 1]; p[i * 4 + 2] = this.basePalette[i * 3 + 2]; p[i * 4 + 3] = 255; }
    if (bkgd?.palette) bkgd.palette.forEach((c, k) => { const i = bkgd.indexBase + k; if (i < 256) { p[i * 4] = c[0]; p[i * 4 + 1] = c[1]; p[i * 4 + 2] = c[2]; } });
    this.palette.needsUpdate = true;
    this.palColors = [];
    for (let i = 0; i < 256; i++) this.palColors.push([p[i * 4], p[i * 4 + 1], p[i * 4 + 2]]);
  }

  /** Point the background pass at a camera's index/depth images, upload its
   *  palette + lights, and set the camera's fov/clips/orientation. No-op while
   *  the camera chunk is unchanged. */
  _setBackground(bkgd, cam) {
    const key = `${bkgd.chunkyFile.name}:${cam.cno}`;
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.setPalette(bkgd);
    const { width: w, height: h, pixels } = cam.rgb;
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < idx.length; i++) idx[i] = pixels[i] < 0 ? 0 : pixels[i];
    const it = new THREE.DataTexture(idx, w, h, THREE.RedFormat);
    it.magFilter = it.minFilter = THREE.NearestFilter; // index data — always nearest; smoothing is manual in-shader
    const zd = new Uint8Array(w * h * 2);
    for (let i = 0; i < cam.z.z.length; i++) { zd[i * 2] = cam.z.z[i] & 255; zd[i * 2 + 1] = cam.z.z[i] >> 8; }
    const zt = new THREE.DataTexture(zd, cam.z.width, cam.z.height, THREE.RGFormat);
    for (const t of [it, zt]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.unpackAlignment = 1; t.needsUpdate = true; }
    this.bgMat.uniforms.uIndex.value?.dispose(); this.bgMat.uniforms.uDepth.value?.dispose();
    this.bgMat.uniforms.uIndex.value = it; this.bgMat.uniforms.uDepth.value = zt;
    const dirs = bkgd.lights.slice(0, 4);
    this.lights.count = dirs.length;
    dirs.forEach((l, k) => { this.lights.dirs[k].set(l.matrix[6], l.matrix[7], l.matrix[8]).normalize(); this.lights.intensity[k] = l.intensity; });
    if (dirs.length) { const l = dirs[0].matrix; this._lightDir.set(-l[6], -l[7], -l[8]).normalize(); }
    this.camera.fov = (cam.fov * 180) / Math.PI;
    this.camera.near = cam.hither; this.camera.far = cam.yon;
    this.camera.updateProjectionMatrix();
    this.camera.matrixWorld.copy(toMatrix4(cam.matrix));
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
  }

  /** three.js BufferGeometry for a parsed model — built once and cached. */
  _geometry(model) {
    let g = this.geoms.get(model);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(model.positions, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(model.uvs, 2));
      g.setIndex(new THREE.BufferAttribute(model.indices, 1));
      g.computeVertexNormals();
      this.geoms.set(model, g);
    }
    return g;
  }

  /** Index texture for a TMAP — rows unpacked from cbRow stride; cached by
   *  texture id. */
  _texture(tmap) {
    let t = this.texs.get(tmap.id);
    if (!t) {
      const data = new Uint8Array(tmap.width * tmap.height);
      for (let y = 0; y < tmap.height; y++) data.set(tmap.pixels.subarray(y * tmap.cbRow, y * tmap.cbRow + tmap.width), y * tmap.width);
      t = new THREE.DataTexture(data, tmap.width, tmap.height, THREE.RedFormat);
      t.magFilter = t.minFilter = THREE.NearestFilter; // index data — always nearest; smoothing is manual in-shader
      t.unpackAlignment = 1; t.needsUpdate = true;
      this.texs.set(tmap.id, t);
    }
    return t;
  }

  /** Depth-pass material stamping occluder id `aid` — per-id so a mesh never
   *  samples the shadow map it's currently writing. */
  _depthMat(aid) {
    let m = this._depthMats.get(aid);
    if (!m) { m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, uniforms: { uAid: { value: aid } } }); this._depthMats.set(aid, m); }
    return m;
  }

  /** Smooth-normal geometry variant — built once and cached. */
  _geometrySmooth(model) {
    let g = this.geomsS.get(model);
    if (!g) { g = smoothNormalsGeometry(this._geometry(model)); this.geomsS.set(model, g); }
    return g;
  }

  /** Shading material for a material chunk + occluder id pair — palette,
   *  texture, light and shadow uniforms. Cached; `uLights` is refreshed each
   *  use since the light count varies per scene. */
  _material(mtrl, aid) {
    const key = `${mtrl ? mtrl.id : 'default'}@${aid}`;
    let m = this.mats.get(key);
    if (!m) {
      const x = mtrl?.txxf;
      const txxf = x ? new THREE.Matrix3().set(x[0], x[2], x[4], x[1], x[3], x[5], 0, 0, 1) : new THREE.Matrix3();
      m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: ACT_VS, fragmentShader: ACT_FS, side: THREE.DoubleSide,
        uniforms: {
          uPalette: { value: this.palette }, uTex: { value: mtrl?.tmap ? this._texture(mtrl.tmap) : null },
          uTextured: { value: !!mtrl?.tmap }, uBase: { value: mtrl?.indexBase ?? 10 }, uRange: { value: mtrl?.indexRange ?? 15 },
          uKa: { value: mtrl?.ka ?? 0.3 }, uKd: { value: mtrl?.kd ?? 0.7 }, uTxxf: { value: txxf },
          uLightDir: { value: this.lights.dirs }, uLightI: { value: this.lights.intensity }, uLights: { value: 0 },
          uSmooth: { value: this.opts.modernLighting ? 1 : 0 }, uModern: { value: this.opts.modernLighting ? 1 : 0 },
          uLightMul: { value: this.opts.lightInt }, uShadeMul: { value: this.opts.selfShadowOp },
          uSelfVP: { value: this._lightVP }, uSelfMap: { value: this.selfRT.depthTexture }, uSelfId: { value: this.selfRT.texture },
          uSelfShadow: { value: 0 }, uOthersShadow: { value: 0 }, uSelfOp: { value: this.opts.selfShadowOp }, uAid: { value: aid }, uSelfDir: { value: this._selfDir },
        }, wireframe: this.opts.wireframe });
      this.mats.set(key, m);
    }
    m.uniforms.uLights.value = this.lights.count;
    return m;
  }

  /** Render bg + actors into the given target (or the screen). t in [0,1] interpolates toward the current step. */
  _drawScene(moviePlayer, target, t = 1) {
    const gl = this.gl;
    gl.setRenderTarget(target);
    gl.clear();
    if (moviePlayer.bkgd && moviePlayer.camera) {
      const cam = moviePlayer.camera;
      this._setBackground(moviePlayer.bkgd, cam);
      if (t < 1 && this._prevCam?.cno === cam.cno) { // smooth camera between steps
        const a = this._prevCam.m;
        this.camera.matrixWorld.copy(toMatrix4(cam.matrix.map((v, k) => a[k] + (v - a[k]) * t)));
        this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      }
      this._curCam = { cno: cam.cno, m: [...cam.matrix] };
      this._invVP.multiplyMatrices(this.camera.matrixWorld, this.camera.projectionMatrixInverse);
      let n = 0;
      const d = this._lightDir; // shadow dir = away from key light
      let aid = 0;
      for (const actor of moviePlayer.visibleActors) {
        aid++; // 1-based occluder id written into the shadow map's color channel
        const world = actor.partWorldMatrices();
        this._curW.set(actor, world);
        let mats = world;
        const prev = t < 1 && this._prevW.get(actor);
        if (prev && prev.length === world.length)
          mats = world.map((w, i) => w.map((v, k) => prev[i][k] + (v - prev[i][k]) * t));
        actor.parts.forEach((part, i) => {
          if (!part.model) return;
          let mesh = this.meshPool[n];
          if (!mesh) { mesh = this.meshPool[n] = new THREE.Mesh(); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; this.scene.add(mesh); }
          mesh.geometry = this.opts.smoothVerts ? this._geometrySmooth(part.model) : this._geometry(part.model);
          mesh._aid = aid;
          mesh._actor = actor; // lets pickActor resolve a clicked mesh back to its Actor
          mesh.material = mesh._mainMat = this._material(part.mtrl, aid);
          mesh.matrix.copy(toMatrix4(mats[i]));
          mesh.matrixWorld.copy(mesh.matrix);
          mesh.visible = true;
          n++;
        });
      }
      for (let k = n; k < this.meshPool.length; k++) this.meshPool[k].visible = false;
      // selection bounding box: union of the selected actor's part bounds, in world space
      const sa = this.selActor;
      if (sa && sa.onStage) {
        this._selUnion.makeEmpty();
        const world = sa.partWorldMatrices();
        sa.parts.forEach((part, i) => {
          if (!part.model) return;
          const g = this.opts.smoothVerts ? this._geometrySmooth(part.model) : this._geometry(part.model);
          if (!g.boundingBox) g.computeBoundingBox();
          this._selUnion.union(this._selPartBox.copy(g.boundingBox).applyMatrix4(toMatrix4(world[i])));
        });
        this._selHelper.visible = !this._selUnion.isEmpty();
        if (this._selHelper.visible) { this._selHelper.box.copy(this._selUnion); this._selHelper.updateMatrixWorld(true); }
      } else this._selHelper.visible = false;
      // light-space depth pass: render actors into depth+id maps from the key light's view
      let mapOk = false;
      if ((this.opts.shadows || this.opts.selfShadow || this.opts.castOnOthers) && n) {
        let cx = 0, cy = 0, cz = 0;
        for (const a of moviePlayer.visibleActors) { cx += a.rootMatrix[9]; cy += a.rootMatrix[10]; cz += a.rootMatrix[11]; }
        const c = moviePlayer.visibleActors.length;
        cx /= c; cy /= c; cz /= c;
        let r = 80; // generous margin: shadows can stretch well past the actor
        for (const a of moviePlayer.visibleActors)
          r = Math.max(r, Math.hypot(a.rootMatrix[9] - cx, a.rootMatrix[10] - cy, a.rootMatrix[11] - cz) + 250);
        const lc = this.lightCam;
        lc.position.set(cx - d.x * 800, cy - d.y * 800, cz - d.z * 800);
        lc.lookAt(cx, cy, cz);
        lc.left = -r; lc.right = r; lc.top = r; lc.bottom = -r; lc.near = Math.max(1, 800 - r * 2); lc.far = 800 + r * 2;
        lc.updateProjectionMatrix(); lc.updateMatrixWorld();
        this._lightVP.multiplyMatrices(lc.projectionMatrix, lc.matrixWorldInverse);
        this._selfDir.copy(d).negate();
        for (let k = 0; k < n; k++) this.meshPool[k].material = this._depthMat(this.meshPool[k]._aid);
        gl.setRenderTarget(this.selfRT); gl.clear();
        gl.render(this.scene, lc);
        gl.setRenderTarget(target);
        for (let k = 0; k < n; k++) this.meshPool[k].material = this.meshPool[k]._mainMat;
        mapOk = true;
      }
      for (const m of this.mats.values()) {
        m.uniforms.uSelfShadow.value = mapOk && this.opts.selfShadow ? 1 : 0;
        m.uniforms.uOthersShadow.value = mapOk && this.opts.castOnOthers ? 1 : 0;
      }
      this.bgMat.uniforms.uBgShadow.value = mapOk && this.opts.shadows ? 1 : 0;
      gl.render(this.bgScene, this.bgCam); // bg renders after the shadow map so it can darken occluded pixels
      gl.render(this.scene, this.camera);
    }
    gl.setRenderTarget(null);
  }

  // --- editor picking helpers ---------------------------------------------
  /** Actor under NDC point (nx,ny in -1..1), or null. */
  pickActor(nx, ny) {
    this._ray.setFromCamera(this._ndc.set(nx, ny), this.camera);
    const hits = this._ray.intersectObjects(this.meshPool.filter((m) => m.visible && m._actor), false);
    return hits.length ? hits[0].object._actor : null;
  }

  /** View-ray ∩ world ground plane y=y (XZ drag / placement). Live until next call. */
  groundPoint(nx, ny, y = 0) {
    this._ray.setFromCamera(this._ndc.set(nx, ny), this.camera);
    const { origin: o, direction: d } = this._ray.ray;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (y - o.y) / d.y;
    return t > 0 ? this._pv.copy(d).multiplyScalar(t).add(o) : null;
  }

  /** View-ray ∩ camera-facing plane through world point p (XY drag). Live until next call. */
  viewPlanePoint(nx, ny, p) {
    this._ray.setFromCamera(this._ndc.set(nx, ny), this.camera);
    const n = this._pv2.setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    const { origin: o, direction: d } = this._ray.ray;
    const den = n.dot(d);
    if (Math.abs(den) < 1e-6) return null;
    const t = (this._pv.set(p.x, p.y, p.z).sub(o).dot(n)) / den;
    return t > 0 ? this._pv.copy(d).multiplyScalar(t).add(o) : null;
  }

  /** Projected pixel rect (w,h viewport) of an actor's model bounding boxes, or null. */
  actorScreenRect(actor, w, h) {
    const vp = this._pm4.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const world = actor.partWorldMatrices();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
    actor.parts.forEach((part, i) => {
      if (!part.model) return;
      const g = this.opts.smoothVerts ? this._geometrySmooth(part.model) : this._geometry(part.model);
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, m = toMatrix4(world[i]);
      for (let c = 0; c < 8; c++) {
        const v = this._pv.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
        v.applyMatrix4(m).applyMatrix4(vp);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z < -1 || v.z > 1) continue;
        x0 = Math.min(x0, (v.x + 1) / 2 * w); y0 = Math.min(y0, (1 - v.y) / 2 * h);
        x1 = Math.max(x1, (v.x + 1) / 2 * w); y1 = Math.max(y1, (1 - v.y) / 2 * h);
        any = true;
      }
    });
    return any ? { x0, y0, x1, y1 } : null;
  }

  /** Capture the current frame into prevRT — the outgoing image a scene
   *  transition dissolves from. Call before loadScene. */
  snapshot(moviePlayer) { this._drawScene(moviePlayer, this.prevRT); }

  /** Render the player's current frame into a w×h 2D canvas — the sorter's
   *  scene-preview path. Draws through a private RT (curRT stays owned by
   *  transitions), reads the pixels back, and flips Y (GL rows are
   *  bottom-up); the selection box is suppressed. */
  frameCanvas(moviePlayer, w, h) {
    const rt = this._thumbRT ||= new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true });
    const sel = this.selActor; this.selActor = null;
    try { this._drawScene(moviePlayer, rt); } finally { this.selActor = sel; }
    const W = rt.width, H = rt.height;
    const buf = new Uint8Array(W * H * 4);
    this.gl.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H);
    for (let row = 0; row < H; row++) {
      const s = (H - 1 - row) * W * 4;
      img.data.set(buf.subarray(s, s + W * 4), row * W * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; // opaque frame, not clear-alpha
    x.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(c, 0, 0, w, h);
    return out;
  }

  /** Render a frame — scene + background into the target (through the
   *  transition compositor when one's active), then MSAA resolve and the
   *  textbox overlay. `t` in [0,1] interpolates toward the current step. */
  render(moviePlayer, t = 1) {
    const gl = this.gl;
    if (moviePlayer.sceneIndex !== this._sceneIdx) { this._sceneIdx = moviePlayer.sceneIndex; this._prevW.clear(); this._prevCam = null; }
    const out = this.opts.aa ? this.aaRT : null;
    const trans = moviePlayer.transition;
    if (trans) {
      this._drawScene(moviePlayer, this.curRT, t);
      gl.setRenderTarget(out);
      gl.clear();
      this.transMat.uniforms.uMode.value = trans.trans;
      this.transMat.uniforms.uT.value = Math.min(1, (trans.frame + t) / trans.dur);
      gl.render(this.transScene, this.bgCam);
    } else {
      this._drawScene(moviePlayer, out, t);
    }
    if (out) { gl.setRenderTarget(null); gl.clear(); gl.render(this.copyScene, this.bgCam); }
    // textbox overlay — suppressed during scene transitions
    const textboxes = trans ? [] : moviePlayer.textboxes || [];
    drawTextboxes(this.ovCtx, textboxes, this.palColors, WIDTH, HEIGHT, this.textboxChrome);
    if (textboxes.length) { this.ovTex.needsUpdate = true; gl.render(this.ovScene, this.bgCam); }
  }
}
