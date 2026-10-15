// MS-ADPCM (WAVE fmt tag 2) decoder — the movie content's WAVE chunks are
// mono 22050Hz ADPCM, which AudioContext.decodeAudioData can't read.

const ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
/** Big-endian RIFF chunk id ('RIFF', 'fmt ', 'data') as a u32. */
const ID = (s) => (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);

/**
 * Decode an MS-ADPCM RIFF to Float32 channel data.
 * Returns { rate, channels, frames, out: Float32Array[] } or null if not ADPCM.
 */
export function decodeWavAdpcm(d) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (d.length < 20 || dv.getUint32(0) !== ID('RIFF') || dv.getUint32(8) !== ID('WAVE')) return null;
  let fmt = null, dataOff = 0, dataCb = 0;
  for (let p = 12; p + 8 <= d.length;) {
    const id = dv.getUint32(p);
    const cb = dv.getUint32(p + 4, true);
    if (id === ID('fmt ')) fmt = p + 8;
    else if (id === ID('data')) { dataOff = p + 8; dataCb = cb; }
    p += 8 + cb + (cb & 1);
  }
  if (fmt == null || !dataOff) return null;
  if (dv.getUint16(fmt, true) !== 2) return null; // not ADPCM
  const ch = dv.getUint16(fmt + 2, true);
  const rate = dv.getUint32(fmt + 4, true);
  const blockAlign = dv.getUint16(fmt + 12, true);
  const ncoef = dv.getUint16(fmt + 20, true);
  const coef = [];
  for (let i = 0; i < ncoef; i++) coef.push([dv.getInt16(fmt + 22 + i * 4, true), dv.getInt16(fmt + 24 + i * 4, true)]);

  const chans = Array.from({ length: ch }, () => []);
  const end = dataOff + Math.min(dataCb, d.length - dataOff);
  for (let bp = dataOff; bp + blockAlign <= end; bp += blockAlign) {
    let q = bp;
    const pred = [], delta = [], s1 = [], s2 = [];
    for (let c = 0; c < ch; c++) pred.push(Math.min(d[q++], ncoef - 1));
    for (let c = 0; c < ch; c++) { delta.push(dv.getInt16(q, true)); q += 2; }
    for (let c = 0; c < ch; c++) { s1.push(dv.getInt16(q, true)); q += 2; }
    for (let c = 0; c < ch; c++) { s2.push(dv.getInt16(q, true)); q += 2; }
    for (let c = 0; c < ch; c++) chans[c].push(s2[c], s1[c]);
    let c = 0;
    for (; q < bp + blockAlign; q++) {
      const byte = d[q];
      for (const nib of [byte >> 4, byte & 15]) {
        const sn = nib >= 8 ? nib - 16 : nib;
        const predicted = (s1[c] * coef[pred[c]][0] + s2[c] * coef[pred[c]][1]) >> 8;
        const smp = Math.max(-32768, Math.min(32767, sn * delta[c] + predicted));
        s2[c] = s1[c];
        s1[c] = smp;
        delta[c] = (ADAPT[nib] * delta[c]) >> 8;
        if (delta[c] < 16) delta[c] = 16;
        chans[c].push(smp);
      }
      c = (c + 1) % ch;
    }
  }
  const frames = chans[0].length;
  const out = chans.map((a) => {
    const f = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) f[i] = a[i] / 32768;
    return f;
  });
  return { rate, channels: ch, frames, out };
}
