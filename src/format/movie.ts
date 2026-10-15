// Movie / scene / actor chunk parsing and serialization — turns a movie file
// into the runtime document shape the player and editor share, and back.
import { Reader, Writer, writeStn } from './binary.ts';
import { readGG, readGL, readGST, buildGG, buildGL, buildGST, writeChunkyFile } from './chunky.ts';
import { parseTbox } from './content.ts';

/** Scene-event type ids — recorded on GGFR/GGST entries. */
export const SEVT = { AddActr: 0, PlaySnd: 1, AddTbox: 2, ChngCamera: 3, SetBkgd: 4, Pause: 5 };
/** Actor-event type ids — recorded on GGAE entries. */
export const AET = {
  Add: 0, Actn: 1, Cost: 2, RotF: 3, Pull: 4, Size: 5, Snd: 6, Move: 7,
  Freeze: 8, Tweak: 9, Step: 10, Rem: 11, RotH: 12,
};

/** Parse a movie file into { name, scenes, rollCall, gstSource, chunkyFile } —
 *  scenes sorted by child id, roll-call names applied to actors. */
export function parseMovie(chunkyFile) {
  const mvie = chunkyFile.ofType('MVIE').next().value;
  if (!mvie) throw new Error('no MVIE chunk');
  const scenes = mvie.kids
    .filter((k) => k.ctg === 'SCEN')
    .sort((a, b) => a.chid - b.chid)
    .map((k) => parseScene(chunkyFile, k.cno));
  // Roll-call string table (MVIE kid chid 0): arid -> actor name/template
  const rollCall = new Map();
  const gstKid = mvie.kids.find((k) => k.ctg === 'GST ' && k.chid === 0);
  if (gstKid) {
    try {
      for (const e of readGST(chunkyFile.data('GST ', gstKid.cno)).entries) {
        if (!e || e.extra.length < 28) continue;
        const er = new Reader(e.extra);
        rollCall.set(er.i32(), { cactRef: er.i32(), grfbrws: er.u32(), tagTmpl: er.tag(), name: e.str });
      }
    } catch { /* tolerate a malformed roll call */ }
  }
  const gstSrc = mvie.kids.find((k) => k.ctg === 'GST ' && k.chid === 1);
  for (const s of scenes) for (const [, a] of s.actors) {
    const rc = rollCall.get(a.arid);
    if (rc && !a.name) a.name = rc.name;
  }
  return { chunkyFile, name: mvie.name, scenes, rollCall, gstSource: gstSrc ? chunkyFile.data('GST ', gstSrc.cno) : null };
}

/** Scene sound-event payload: volume, style, loop flag, and tag list. */
function readSse(vr) {
  const vlm = vr.brs();
  const sty = vr.i32();
  const fLoop = vr.i32() !== 0;
  const ctagc = vr.i32();
  const tags = [];
  for (let i = 0; i < ctagc; i++) {
    vr.i32(); // chidden
    tags.push(vr.tag());
  }
  return { vlm, sty, fLoop, tags };
}

/** Read a scene-event group (GGFR frame events or GGST start events) into
 *  [{ nfrm, sevt, data }]. */
function readSevs(chunkyFile, ctg, cno) {
  if (!cno && cno !== 0) return [];
  const gg = readGG(chunkyFile.data(ctg, cno));
  return gg.entries.filter(Boolean).map((e) => {
    const fr = new Reader(e.fixed, 0, gg.le);
    const nfrm = fr.i32();
    const sevt = fr.i32();
    const vr = new Reader(e.variable, 0, gg.le);
    let data = null;
    switch (sevt) {
      case SEVT.AddActr: case SEVT.AddTbox: data = vr.i32(); break; // chid
      case SEVT.ChngCamera: data = vr.i32(); break;
      case SEVT.SetBkgd: data = vr.tag(); break;
      case SEVT.Pause: data = { wit: vr.i32(), dts: vr.i32() }; break;
      case SEVT.PlaySnd: data = readSse(vr); break;
      default: data = e.variable;
    }
    return { nfrm, sevt, data };
  });
}

/** Parse one SCEN chunk — header, frame/start event groups, actors,
 *  textboxes, and the sorter thumbnail. */
export function parseScene(chunkyFile, cno) {
  const r = new Reader(chunkyFile.data('SCEN', cno));
  r.bo(); r.i16();
  const nfrmLast = r.i32();
  const nfrmFirst = r.i32();
  const trans = r.i32();
  const frm = chunkyFile.kid('SCEN', cno, 'GGFR', 0);
  const st = chunkyFile.kid('SCEN', cno, 'GGST', 1);
  const actors = new Map();
  for (const k of chunkyFile.kidsOf('SCEN', cno, 'ACTR')) actors.set(k.chid, parseActor(chunkyFile, k.cno));
  const textboxes = new Map();
  for (const k of chunkyFile.kidsOf('SCEN', cno, 'TBOX')) {
    try { textboxes.set(k.chid, parseTbox(chunkyFile, k.cno)); } catch { /* malformed tbox */ }
  }
  const th = chunkyFile.kid('SCEN', cno, 'THUM', 0);
  return {
    cno, name: chunkyFile.get('SCEN', cno).name, nfrmFirst, nfrmLast, trans,
    frameEvents: frm ? readSevs(chunkyFile, 'GGFR', frm.cno) : [],
    startEvents: st ? readSevs(chunkyFile, 'GGST', st.cno) : [],
    actors, textboxes,
    thumb: th ? chunkyFile.data('THUM', th.cno) : null, // scene-sorter thumbnail bitmap
  };
}

/** Read three fixed-point scalars as an {x,y,z} point. */
const xyz = (r) => ({ x: r.brs(), y: r.brs(), z: r.brs() });

/** Parse one ACTR chunk — route (PATH), event list (GGAE), template tag, id. */
export function parseActor(chunkyFile, cno) {
  const d = chunkyFile.data('ACTR', cno);
  const r = new Reader(d);
  r.bo(); r.i16();
  const dxyzFullRte = xyz(r);
  const arid = r.i32();
  const nfrmFirst = r.i32();
  let nfrmLast = null;
  if (d.length >= 44) nfrmLast = r.i32();
  const tagTmpl = r.tag();
  const kp = chunkyFile.kid('ACTR', cno, 'PATH', 0);
  const route = [];
  if (kp) {
    const gl = readGL(chunkyFile.data('PATH', kp.cno));
    for (const e of gl.entries) {
      const pr = new Reader(e, 0, gl.le);
      route.push({ ...xyz(pr), dwr: pr.brs() });
    }
  }
  const ke = chunkyFile.kid('ACTR', cno, 'GGAE', 0);
  const events = [];
  if (ke) {
    const gg = readGG(chunkyFile.data('GGAE', ke.cno));
    for (const e of gg.entries) {
      if (!e) continue;
      const fr = new Reader(e.fixed, 0, gg.le);
      const aet = fr.i32();
      const nfrm = fr.i32();
      const rtel = { irpt: fr.i32(), dwrOffset: fr.brs(), dnfrm: fr.i32() };
      const vr = new Reader(e.variable, 0, gg.le);
      let data = null;
      switch (aet) {
        case AET.Add: data = { ...xyz(vr), xa: vr.bra(), ya: vr.bra(), za: vr.bra() }; break;
        case AET.Actn: data = { anid: vr.i32(), celn: vr.i32() }; break;
        case AET.Cost: data = { ibset: vr.i32(), cmid: vr.i32(), fCmtl: vr.i32() !== 0, tag: vr.tag() }; break;
        case AET.RotF: case AET.RotH: data = vr.bmat34(); break;
        case AET.Pull: data = { x: vr.brs(), y: vr.brs(), z: vr.brs() }; break;
        case AET.Size: case AET.Step: data = vr.brs(); break;
        case AET.Freeze: data = vr.i32() !== 0; break;
        case AET.Move: case AET.Tweak: data = xyz(vr); break;
        case AET.Snd:
          // sound-event payload: flags, volume, cel, style, chid, tag
          data = {
            fLoop: vr.i32() !== 0, fQueue: vr.i32() !== 0, vlm: vr.brs(),
            celn: vr.i32(), sty: vr.i32(), fNoSound: vr.i32() !== 0,
            chid: vr.i32(), tag: vr.tag(),
          };
          break;
        default: data = null;
      }
      events.push({ aet, nfrm, rtel, data });
    }
  }
  return { cno, arid, nfrmFirst, nfrmLast, dxyzFullRte, tagTmpl, route, events, name: chunkyFile.get('ACTR', cno).name };
}

// ---- serialization ----------------------------------------------------------

const KLW_MAX = 0x7fffffff; // 'no bound' frame marker

/** Serialize a scene event's variable payload — the inverse of `readSevs`;
 *  `tagFor` maps a tag to its written form (embedding referenced chunks). */
function sevData(e, tagFor) {
  const w = new Writer();
  switch (e.sevt) {
    case SEVT.AddActr: case SEVT.AddTbox: case SEVT.ChngCamera: w.i32(e.data); break;
    case SEVT.SetBkgd: w.tag(tagFor(e.data).tag); break;
    case SEVT.Pause: w.i32(e.data.wit).i32(e.data.dts); break;
    case SEVT.PlaySnd: {
      w.brs(e.data.vlm ?? 1).i32(e.data.sty ?? 0).i32(e.data.fLoop ? 1 : 0);
      const tags = e.data.tags || [];
      w.i32(tags.length);
      for (const t of tags) { const r = tagFor(t); w.i32(r.chid ?? 0); w.tag(r.tag); }
      break;
    }
    default: if (e.data instanceof Uint8Array) w.bytes(e.data); break;
  }
  return w.out();
}

/** Serialize an actor event's variable payload — the inverse of `parseActor`. */
function aevData(e, tagFor) {
  const w = new Writer(), d = e.data;
  const xyz = (p) => w.brs(p.x).brs(p.y).brs(p.z);
  switch (e.aet) {
    case AET.Add: xyz(d); w.bra(d.xa).bra(d.ya).bra(d.za); break;
    case AET.Actn: w.i32(d.anid).i32(d.celn); break;
    case AET.Cost: w.i32(d.ibset).i32(d.cmid).i32(d.fCmtl ? 1 : 0).tag(d.tag ? tagFor(d.tag).tag : { sid: -1, ctg: 'MTRL', cno: 0 }); break;
    case AET.RotF: case AET.RotH: for (const v of d) w.brs(v); break;
    case AET.Pull: case AET.Move: case AET.Tweak: xyz(d); break;
    case AET.Size: case AET.Step: w.brs(d); break;
    case AET.Freeze: w.i32(d ? 1 : 0); break;
    case AET.Snd: {
      const r = tagFor(d.tag);
      w.i32(d.fLoop ? 1 : 0).i32(d.fQueue ? 1 : 0).brs(d.vlm).i32(d.celn).i32(d.sty)
        .i32(d.fNoSound ? 1 : 0).i32(r.chid ?? d.chid ?? 0).tag(r.tag);
      break;
    }
    default: if (d instanceof Uint8Array) w.bytes(d); break;
  }
  return w.out();
}

/**
 * Serialize a parsed/edited movie back to a chunky (.3MM) file — rebuilds the
 * MVIE/SCEN/ACTR/TBOX chunk tree, embedding 'rt' runtime templates and 'usr'
 * imported sounds, and copying embedded chunks across from the source file.
 * movie: {name, scenes, rollCall?, gstSource?, chunkyFile?}
 * opts.rtmpl(cno): runtime template for 'rt'-sid template tags
 * opts.userSnd(key): imported sound record {name, bytes, midi, kind} for 'usr' tags
 */
export function serializeMovie(movie, opts: any = {}) {
  const chunks = [];
  const byKey = new Map();
  let cnoNext = 0;
  if (movie.chunkyFile) for (const k of movie.chunkyFile.chunks.keys()) cnoNext = Math.max(cnoNext, +k.split(':')[1] + 1);
  /** Append a chunk to the output file, allocating a chunk number. */
  const mk = (ctg, data, kids = [], name = '', loner = false, cno = null) => {
    const c = { ctg, cno: cno ?? cnoNext++, data, kids, name, loner };
    chunks.push(c); byKey.set(`${ctg}:${c.cno}`, c);
    return c;
  };
  /** Verbatim copy of an existing chunk subtree (embedded MSNDs/TMPLs). */
  const copied = new Set();
  const copySubtree = (chunkyFile, ctg, cno) => {
    const key = `${ctg}:${cno}`;
    if (copied.has(key)) return byKey.get(key);
    const src = chunkyFile.get(ctg, cno);
    if (!src) return null;
    const kids = [];
    const c = mk(ctg, chunkyFile.data(ctg, cno), kids, src.name, false, cno);
    copied.add(key);
    for (const k of src.kids) {
      const kid = copySubtree(chunkyFile, k.ctg, k.cno);
      if (kid) kids.push({ ctg: kid.ctg, cno: kid.cno, chid: k.chid });
    }
    return c;
  };
  // tag -> written tag: 'rt' runtime templates get an embedded TMPL+TDT chunk;
  // 'usr'/sid-0 sounds get an embedded MSND adopted under the scene (handled by
  // tagFor in each scene)
  const wtag = (t) => {
    if (t.sid === 'rt') {
      const key = `rt:${t.cno}`;
      if (!byKey.has(key)) {
        const template = opts.rtmpl?.(t.cno);
        const tdt = mk('TDT ', new Writer().bo().u16(0x0303).i32(template?.tdts ?? 0)
          .tag(wtag(template?.tagTdf || { sid: 2, ctg: 'TDF ', cno: 0 })).out());
        const tm = mk('TMPL', new Writer().bo().u16(0x0303)
          .bra(template?.rest?.[0] || 0).bra(template?.rest?.[1] || 0).bra(template?.rest?.[2] || 0)
          .u16(0).u32(template?.grftmpl ?? 2).out(), [{ ctg: 'TDT ', cno: tdt.cno, chid: 0 }], template?.name || '');
        byKey.set(key, tm);
      }
      return { sid: 0, ctg: 'TMPL', cno: byKey.get(key).cno };
    }
    return { sid: t.sid, ctg: t.ctg, cno: t.cno };
  };

  const msndByUsr = new Map(); // 'usr' key -> msnd chunk (dedupe across scenes)
  const buildUsrMsnd = (key) => {
    if (msndByUsr.has(key)) return msndByUsr.get(key);
    const u = opts.userSnd?.(key);
    if (!u?.bytes) return null;
    const sty = u.kind === 'music' ? 4 : u.kind === 'speech' ? 3 : 2;
    const kids = [{ ctg: u.midi ? 'MIDS' : 'WAVE', cno: cnoNext, chid: 0 }];
    mk(u.midi ? 'MIDS' : 'WAVE', u.bytes, [], '', false);
    const m = mk('MSND', new Writer().bo().u16(0x0303).i32(sty).brs(u.vlm ?? 1).i32(0).out(), kids, u.name || '');
    msndByUsr.set(key, m);
    return m;
  };

  const scenKids = [];
  for (const s of movie.scenes) {
    const kids = [];
    // adopt embedded sounds: sid-0 chunks copy from the source movie file,
    // 'usr' sounds get a fresh MSND built from the imported bytes
    const soundKids = new Map(); // tagKey -> {tag:{sid:0,..cno}, chid}
    let soundChid = 0;
    const tagFor = (t) => {
      if (t.sid === 'usr' || (t.sid === 0 && t.ctg === 'MSND')) { // embedded sound -> MSND kid of SCEN
        const key = `${t.sid}:${t.cno}`;
        if (!soundKids.has(key)) {
          const m = t.sid === 'usr' ? buildUsrMsnd(t.cno) : movie.chunkyFile && copySubtree(movie.chunkyFile, 'MSND', t.cno);
          if (!m) return { tag: { sid: -1, ctg: t.ctg, cno: t.cno } }; // unresolvable -> invalid sid
          const chid = soundChid++;
          kids.push({ ctg: 'MSND', cno: m.cno, chid });
          soundKids.set(key, { tag: { sid: 0, ctg: 'MSND', cno: m.cno }, chid });
        }
        return soundKids.get(key);
      }
      if (t.sid === 0 && movie.chunkyFile) { // other embedded chunk (rare) — copy it across
        copySubtree(movie.chunkyFile, t.ctg, t.cno);
        return { tag: wtag(t) };
      }
      return { tag: wtag(t) };
    };
    const ggOf = (evs, dataFn) => buildGG(dataFn === sevData ? 8 : 20, evs.map((e) => ({
      fixed: dataFn === sevData
        ? new Writer().i32(e.nfrm).i32(e.sevt).out()
        : new Writer().i32(e.aet).i32(e.nfrm).i32(e.rtel?.irpt || 0).brs(e.rtel?.dwrOffset || 0).i32(e.rtel?.dnfrm || 0).out(),
      variable: dataFn(e, tagFor),
    })));
    kids.push({ ctg: 'GGFR', cno: mk('GGFR', ggOf(s.frameEvents, sevData)).cno, chid: 0 });
    kids.push({ ctg: 'GGST', cno: mk('GGST', ggOf(s.startEvents, sevData)).cno, chid: 1 });
    for (const [chid, a] of s.actors) {
      const ak = [
        { ctg: 'PATH', cno: mk('PATH', buildGL((a.route || []).map((p) => new Writer().brs(p.x).brs(p.y).brs(p.z).brs(p.dwr).out()))).cno, chid: 0 },
        { ctg: 'GGAE', cno: mk('GGAE', ggOf(a.events || [], aevData)).cno, chid: 0 },
      ];
      const tagTmpl = wtag(a.tagTmpl);
      if (a.tagTmpl.sid === 'rt') ak.push({ ctg: 'TMPL', cno: tagTmpl.cno, chid: 0 });
      else if (a.tagTmpl.sid === 0 && movie.chunkyFile) { // embedded template — copy + adopt
        const tm = copySubtree(movie.chunkyFile, 'TMPL', a.tagTmpl.cno);
        if (tm) ak.push({ ctg: 'TMPL', cno: tm.cno, chid: 0 });
      }
      const body = new Writer().bo().u16(0x0303)
        .brs(a.dxyzFullRte?.x || 0).brs(a.dxyzFullRte?.y || 0).brs(a.dxyzFullRte?.z || 0)
        .i32(a.arid).i32(a.nfrmFirst).i32(a.nfrmLast ?? KLW_MAX).tag(tagTmpl).out();
      kids.push({ ctg: 'ACTR', cno: mk('ACTR', body, ak, a.name || '').cno, chid });
    }
    for (const [chid, textbox] of s.textboxes) {
      const rtxt = textbox.rtxt || {};
      const rk = []; // kids of the RTXT chunk
      if (textbox.rtxt) rk.push({ ctg: 'TEXT', cno: mk('TEXT', new Writer().u16(0x0303)
        .bytes(Uint8Array.from([...(rtxt.text || '')].map((c) => c.charCodeAt(0) & 0xff))).out()).cno, chid: 0 });
      if (rtxt.mpes?.length) rk.push({ ctg: 'GLMP', cno: mk('GLMP', buildGL([...rtxt.mpes]
        .sort((a, b) => ((a.sprm << 24) | (a.cp & 0xffffff)) - ((b.sprm << 24) | (b.cp & 0xffffff)))
        .map((m) => new Writer().u32(((m.sprm & 0xff) << 24) | (m.cp & 0xffffff)).i32(m.lw).out()))).cno, chid: 0 });
      if (rtxt.fonts?.length) rk.push({ ctg: 'AGPA', cno: mk('AGPA', buildGG(4, rtxt.fonts.filter(Boolean).map((f, i) => ({
        fixed: new Writer().i32(i).out(), // font ordinal — remapped on load
        variable: new Writer().i32(i).u16(0x0303).bytes(writeStn(f)).out(),
      })))).cno, chid: 0 });
      const rtCno = mk('RTXT', new Writer().bo().u16(0x0303)
        .i32(rtxt.dxpDef || 0).i32(rtxt.dypFont || 14).u32(rtxt.acrBack ?? 0xffffffff)
        .bytes(writeStn(rtxt.font || 'Comic Sans MS')).out(), rk).cno;
      kids.push({ ctg: 'TBOX', cno: mk('TBOX', new Writer().bo().u16(0x0303)
        .i32(textbox.nfrmFirst).i32(textbox.nfrmMax ?? KLW_MAX)
        .i32(textbox.l).i32(textbox.r).i32(textbox.t).i32(textbox.b).i32(0).i32(textbox.fStory ? 1 : 0).out(),
        [{ ctg: 'RTXT', cno: rtCno, chid: 0 }]).cno, chid });
    }
    if (s.thumb) kids.push({ ctg: 'THUM', cno: mk('THUM', s.thumb).cno, chid: 0 }); // the scene thumbnail is preserved as-is
    scenKids.push({ ctg: 'SCEN', cno: mk('SCEN', new Writer().bo().u16(0x0303)
      .i32(s.nfrmLast).i32(s.nfrmFirst).i32(s.trans ?? 3).out(), kids, s.name || '').cno, chid: scenKids.length });
  }

  // roll-call string table (chid 0): {arid, refcount, browse flags, template tag} + actor name
  const rc = new Map(); // arid -> {name, cactRef, grfbrws, tagTmpl}
  for (const s of movie.scenes) for (const [, a] of s.actors) {
    const e = rc.get(a.arid) || { name: a.name || '', cactRef: 0, grfbrws: movie.rollCall?.get(a.arid)?.grfbrws || 0, tagTmpl: a.tagTmpl };
    if (!e.name && a.name) e.name = a.name;
    e.cactRef++; rc.set(a.arid, e);
  }
  for (const [arid, e] of rc) if (!e.name && movie.rollCall?.has(arid)) e.name = movie.rollCall.get(arid).name;
  const mvieKids = [
    { ctg: 'GST ', cno: mk('GST ', buildGST(32, [...rc.entries()].sort((a, b) => a[0] - b[0]).map(([arid, e]) => ({
      str: e.name,
      extra: new Writer().i32(arid).i32(e.cactRef).u32(e.grfbrws).tag(wtag(e.tagTmpl)).out(),
    })))).cno, chid: 0 },
  ];
  if (movie.gstSource) mvieKids.push({ ctg: 'GST ', cno: mk('GST ', movie.gstSource).cno, chid: 1 });
  if (movie.chunkyFile) { // preserve movie-level (music) MSNDs adopted under the MVIE chunk
    const mvie = movie.chunkyFile.ofType('MVIE').next().value;
    for (const k of (mvie?.kids || [])) if (k.ctg === 'MSND') {
      const m = copySubtree(movie.chunkyFile, 'MSND', k.cno);
      if (m) mvieKids.push({ ctg: 'MSND', cno: m.cno, chid: k.chid });
    }
  }
  for (const k of scenKids) mvieKids.push(k);
  mk('MVIE', new Uint8Array([1, 0, 3, 3, 2, 0, 2, 0]), mvieKids, movie.name || '', true, 0);
  return writeChunkyFile(chunks);
}
