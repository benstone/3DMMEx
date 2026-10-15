// Row-vector 4x3 affine matrices (v' = v * M), matching the engine convention.
// Stored as flat arrays [m00,m01,m02, m10,m11,m12, m20,m21,m22, m30,m31,m32].

/** Identity matrix — the neutral element for `mul`. */
export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

/** Matrix product `a * b` — transforms a point by `a` first, then `b`. */
export function mul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 4; i++) {
    const a0 = a[i * 3], a1 = a[i * 3 + 1], a2 = a[i * 3 + 2];
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a0 * b[j] + a1 * b[3 + j] + a2 * b[6 + j];
    if (i === 3) for (let j = 0; j < 3; j++) r[9 + j] += b[9 + j];
  }
  return r;
}

/** Rotation of `a` radians about the X axis. */
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c, 0, 0, 0]; }
/** Rotation of `a` radians about the Y axis. */
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c, 0, 0, 0]; }
/** Rotation of `a` radians about the Z axis. */
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0]; }
/** Non-uniform scale by (x, y, z). */
export function scale(x, y, z) { return [x, 0, 0, 0, y, 0, 0, 0, z, 0, 0, 0]; }
/** Translation by (x, y, z). */
export function translate(x, y, z) { return [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z]; }
