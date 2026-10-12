import fs from 'node:fs';
import { ChunkyFile } from '../src/format/chunky.js';
import { parseBkgd, parseCamera } from '../src/format/content.js';
const cf = new ChunkyFile(fs.readFileSync('public/data/BKGDS.3CN'), 'BKGDS');
// invert BRender 4x3 affine (row-vector)
function inv(m) {
  const [a,b,c,d,e,f,g,h,i,tx,ty,tz] = m;
  // rotation part R rows: [a b c],[d e f],[g h i]; assume orthonormal-ish -> general 3x3 inverse
  const A = e*i-f*h, B = -(d*i-f*g), C = d*h-e*g;
  const det = a*A + b*B + c*C;
  const r = [A/det, -(b*i-c*h)/det, (b*f-c*e)/det, B/det, (a*i-c*g)/det, -(a*f-c*d)/det, C/det, -(a*h-b*g)/det, (a*e-b*d)/det];
  const t = [-(tx*r[0]+ty*r[3]+tz*r[6]), -(tx*r[1]+ty*r[4]+tz*r[7]), -(tx*r[2]+ty*r[5]+tz*r[8])];
  return [...r, ...t];
}
const xf = (p, m) => [p[0]*m[0]+p[1]*m[3]+p[2]*m[6]+m[9], p[0]*m[1]+p[1]*m[4]+p[2]*m[7]+m[10], p[0]*m[2]+p[1]*m[5]+p[2]*m[8]+m[11]];
let n = 0;
for (const c of cf.ofType('BKGD')) {
  const bk = parseBkgd(cf, c.cno);
  for (const ccno of bk.cameras.slice(0, 2)) {
    const cam = parseCamera(cf, ccno);
    const W = cam.rgb.width, H = cam.rgb.height;
    if (n++ === 0) console.log('rgb', cam.rgb.left, cam.rgb.top, W, H, 'z', cam.z.width, cam.z.height, 'palette', bk.palette?.length, 'base', bk.indexBase, 'lights', JSON.stringify(bk.lights.map(l=>[l.type,l.intensity])));
    const vi = inv(cam.matrix);
    for (const p of [cam.apos, ...cam.extraApos].slice(0, 3)) {
      const q = xf(p, vi);
      const out = [];
      for (const mode of ['v', 'h']) {
        const t = Math.tan(cam.fov / 2);
        const fy = mode === 'v' ? (H / 2) / t : (W / 2) / t;
        const sx = Math.round(W / 2 + (q[0] / -q[2]) * fy), sy = Math.round(H / 2 - (q[1] / -q[2]) * fy);
        const zv = sx >= 0 && sy >= 0 && sx < W && sy < H ? cam.z.z[sy * cam.z.width + sx] : null;
        out.push(`${mode}:(${sx},${sy}) z=${zv}`);
      }
      const zc = -q[2], N = cam.hither, F = cam.yon;
      const pers = 65535 * (F * (zc - N)) / (zc * (F - N));
      console.log(bk.name.slice(0, 12), ccno, 'fov', (cam.fov * 180 / Math.PI).toFixed(1), 'N', N.toFixed(2), 'F', F.toFixed(0), 'zc', zc.toFixed(2), 'persPred', pers.toFixed(0), 'linPred', (65535*(zc-N)/(F-N)).toFixed(0), out.join(' '));
    }
  }
}
