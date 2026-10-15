// MIDS chunk parser — a raw MIDI event stream: varint delta times already in
// milliseconds, then status byte + params (running status allowed).

/** Parse a MIDS payload into [{ ts, msg }] — absolute millisecond timestamps
 *  and raw MIDI message bytes (status + 1-2 params). Sysex/meta events are
 *  skipped; an end-of-track meta terminates the stream. */
export function parseMids(d) {
  const evs = []; // {ts(ms, absolute), msg:[status, p1, p2?]}
  let i = 0, status = 0, ts = 0;
  const varint = () => { let v = 0, b; do { b = d[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && i < d.length); return v; };
  while (i < d.length) {
    ts += varint();
    let st = d[i];
    if (st & 0x80) { status = st; i++; } else st = status;
    if (!st) break;
    const hi = st & 0xf0;
    if (hi === 0x80 || hi === 0x90 || hi === 0xa0 || hi === 0xb0 || hi === 0xe0 || st === 0xf2) {
      if (i + 2 > d.length) break;
      evs.push({ ts, msg: [st, d[i], d[i + 1]] }); i += 2;
    } else if (hi === 0xc0 || hi === 0xd0 || st === 0xf1 || st === 0xf3) {
      if (i >= d.length) break;
      evs.push({ ts, msg: [st, d[i]] }); i += 1;
    } else if (st === 0xf0 || st === 0xf7) { // sysex — skip
      const n = varint(); i += n;
    } else if (st === 0xff) { // meta
      if (i >= d.length) break;
      const type = d[i++], n = varint();
      if (type === 0x2f) break; // end of track
      i += n;
    } else { // f6/f8/fa/fb/fc/fe: no params, running status cleared
      status = 0;
    }
  }
  return evs;
}
