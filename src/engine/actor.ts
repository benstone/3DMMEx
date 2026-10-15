// Actor playback, ported from SRC/ENGINE/ACTOR.CPP (FGotoFrame/_FDoFrm/_FDoAevCore)
import { AET } from '../format/movie.ts';
import { templateAction, templateModel, templateCmtl } from '../format/content.ts';
import * as M from './mat34.ts';

export const DWR_NIL = -1;
const RTEL0 = () => ({ irpt: 0, dwrOffset: 0, dnfrm: 0 });
const cmpRtel = (a, b) => a.irpt - b.irpt || a.dwrOffset - b.dwrOffset || a.dnfrm - b.dnfrm;
const FACTN_ROTX = 1, FACTN_ROTY = 2, FACTN_ROTZ = 4, FACTN_STATIC = 8;
const faet = { Tweak: 1 << AET.Tweak, RotF: 1 << AET.RotF, Freeze: 1 << AET.Freeze, Step: 1 << AET.Step };

export class Actor {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(data, template, contentLibrary) {
    this.data = data;
    this.template = template;
    this.contentLibrary = contentLibrary;
    this.events = data.events;
    this.route = data.route.length ? data.route : [{ x: 0, y: 0, z: 0, dwr: 0 }];
    this.nfrmFirst = data.events.length ? data.events[0].nfrm : data.nfrmFirst;
    const n = template.parents.length;
    this.parts = Array.from({ length: n }, () => ({ model: null, mtrl: null, matrix: M.identity() }));
    this.rootMatrix = M.identity();
    /** @type {((actr: Actor, d: any) => void) | null} */
    this.onSound = null;
    this.nfrmCur = null;
    this._rewind();
  }

  _rewind() {
    this.onStage = false;
    this.frozen = false;
    this.anid = 0;
    this.celn = 0;
    this.ccel = 1;
    this.grfactn = 0;
    this.rtel = { irpt: 0, dwrOffset: 0, dnfrm: -1 };
    const p = this.route[0] || { x: 0, y: 0, z: 0 }; // route may be empty after a full delete
    this.xyz = { x: p.x, y: p.y, z: p.z };
    this.iaevCur = 0;
    this.iaevActnCur = -1;
    this.iaevAddCur = -1;
    this.iaevFrmMin = 0;
    this.smm = []; // _pglsmm: motion-match sounds latched for the current action
    this.dwrStep = 0;
    this.dxyzSubRte = { x: 0, y: 0, z: 0 };
    this.useCur = true;
    this.positionDirty = false;
    this.groundY = Infinity; // lowest rootMatrix y seen since rewind — used by ground shadows
    this._updateXyzRte();
    this._initXfrm();
    this._setDefaultCost();
  }

  _initXfrm() {
    this.xfrm = { fwd: M.identity(), cur: M.identity(), pull: { x: 1, y: 1, z: 1 }, scaleStep: 1 };
    this.pathAng = { xa: 0, ya: 0, za: 0 }; // _xfrm.xaPath/yaPath/zaPath — last path orientation applied
    if (!this._cost) this._cost = {}; // per-ibset costume state (_setDefaultCost fills it per Add)
  }

  _updateXyzRte() {
    const f = this.data.dxyzFullRte, s = this.dxyzSubRte;
    this.dxyzRte = { x: f.x + s.x, y: f.y + s.y, z: f.z + s.z };
  }

  gotoFrame(nfrm) {
    if (nfrm === this.nfrmCur) return;
    if (this.nfrmCur === null || nfrm < this.nfrmCur) {
      this._rewind();
      this.nfrmCur = Math.min(nfrm, this.nfrmFirst);
    } else {
      this.nfrmCur++;
      this.iaevFrmMin = this.iaevCur; // 1st event index of this frame
    }
    if (nfrm < this.nfrmFirst) { this.nfrmCur = nfrm; return; }
    if (!this.events.length) { this.nfrmCur = nfrm; return; }
    for (;;) {
      this._doFrm(this.nfrmCur === nfrm);
      if (this.nfrmCur === nfrm) break;
      this.nfrmCur++;
      this.iaevFrmMin = this.iaevCur;
    }
  }

  // --- template helpers -------------------------------------------------
  _actn(anid) { return templateAction(this.template, anid); }

  _setActnCel(anid, celn) {
    const actn = this._actn(anid);
    if (!actn || !actn.cels.length) return;
    let icel = celn % actn.cels.length;
    if (icel < 0) icel += actn.cels.length;
    const cel = actn.cels[icel];
    for (let i = 0; i < this.parts.length; i++) {
      const cps = cel.cps[i];
      if (!cps) continue;
      if (cps.chidModl !== -1) {
        const m = templateModel(this.template, cps.chidModl & 0xffff);
        if (m) this.parts[i].model = m;
      }
      this.parts[i].matrix = actn.matrices[cps.imat34] || M.identity();
    }
  }

  _celDwr(anid, celn) {
    const actn = this._actn(anid);
    if (!actn || !actn.cels.length) return 0;
    let icel = celn % actn.cels.length;
    if (icel < 0) icel += actn.cels.length;
    return actn.cels[icel].dwr;
  }

  _applyCmtl(cmtl) {
    if (!cmtl) return;
    let k = 0;
    for (let i = 0; i < this.parts.length; i++) {
      if (this.template.ibsets[i] !== cmtl.ibset) continue;
      const p = cmtl.parts[k++];
      if (!p) continue;
      if (p.model) this.parts[i].model = p.model;
      this.parts[i].mtrl = p.mtrl;
    }
  }

  _setDefaultCost() {
    for (let ibset = 0; ibset < this.template.cbset; ibset++) {
      const cmid = this.template.cmids[ibset]?.[0];
      if (cmid !== undefined) { this._applyCmtl(templateCmtl(this.template, cmid)); this._cost[ibset] = { fCmtl: true, cmid }; }
    }
  }

  // --- route --------------------------------------------------------------
  _xyzFromRtel(rtel) {
    const r = this.route;
    if (rtel.dwrOffset === 0 || rtel.irpt + 1 >= r.length) {
      const p = r[Math.min(rtel.irpt, r.length - 1)];
      return { x: p.x, y: p.y, z: p.z };
    }
    const a = r[rtel.irpt], b = r[rtel.irpt + 1];
    const f = rtel.dwrOffset / a.dwr;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
  }

  _advanceRtel(dwrStep) {
    const rtel = this.rtel;
    if (this.nfrmCur <= this.nfrmFirst) {
      this.rtel = RTEL0();
      return false;
    }
    if (dwrStep === 0) { rtel.dnfrm++; return false; }
    const rpt = (i) => this.route[Math.min(i, this.route.length - 1)];
    let dwrT = rpt(rtel.irpt).dwr - rtel.dwrOffset;
    if (dwrT === 0) { rtel.dnfrm++; return true; }
    let moved = true;
    while (dwrT <= dwrStep && dwrStep > 0) {
      if (dwrT === 0) { moved = false; break; }
      rtel.irpt++;
      rtel.dwrOffset = 0;
      dwrStep -= dwrT;
      dwrT = rpt(rtel.irpt).dwr;
    }
    if (moved) rtel.dwrOffset += dwrStep;
    rtel.dnfrm = 0;
    for (let i = this.iaevCur; i < this.events.length; i++) {
      const ev = this.events[i];
      if (cmpRtel(ev.rtel, rtel) <= 0 && (ev.aet === AET.Step || ev.aet === AET.Actn)) {
        this.rtel = { ...ev.rtel };
        break;
      }
      if (cmpRtel(ev.rtel, rtel) > 0) break;
    }
    return false;
  }

  _getDwrPlay() {
    const d = this.dwrStep === DWR_NIL ? this._celDwr(this.anid, this.celn) : this.dwrStep;
    return d * this.xfrm.scaleStep;
  }

  _isDoneAevSub(iaev, rtel) {
    for (; iaev < this.events.length; iaev++) {
      const ev = this.events[iaev];
      if (ev.aet === AET.Add) return true;
      if (cmpRtel(ev.rtel, rtel) > 0) return false;
    }
    return true;
  }

  // --- frame stepping -------------------------------------------------------
  _doFrm(fPositionBody) {
    this._fpb = fPositionBody;
    const xyzOld = this.xyz;
    let freezeThisCel = this.frozen;
    const dwr = this._getDwrPlay();
    const endRoute = this._advanceRtel(dwr);
    this.xyz = this._xyzFromRtel(this.rtel);
    this.useCur = dwr === 0 || (xyzOld.x === this.xyz.x && xyzOld.z === this.xyz.z);

    // Add events whose frame has arrived
    for (let i = this.iaevCur; i < this.events.length; i++) {
      if (this.events[i].aet !== AET.Add) continue;
      if (this.events[i].nfrm > this.nfrmCur) break;
      this.iaevCur = i;
      this._doAevCur();
      this.positionDirty = true;
    }

    while (this.iaevCur < this.events.length) {
      const ev = this.events[this.iaevCur];
      if (ev.aet === AET.Add) {
        if (ev.nfrm > this.nfrmCur) break;
        this._doAevCur();
        this.positionDirty = true;
        continue;
      }
      if (cmpRtel(ev.rtel, this.rtel) > 0) break;
      if (ev.aet === AET.RotF || ev.aet === AET.Size || ev.aet === AET.Pull || ev.aet === AET.RotH || ev.aet === AET.Move) {
        this.positionDirty = true;
      } else if (ev.aet === AET.Actn) {
        freezeThisCel = true;
        this.positionDirty = true;
      }
      this._doAevCur();
    }

    const endSub = this._isDoneAevSub(this.iaevCur, this.rtel);
    if (!freezeThisCel && !(endRoute && endSub)) {
      this.celn++;
      if (this.ccel > 1) this.positionDirty = true;
    }
    if (xyzOld.x !== this.xyz.x || xyzOld.y !== this.xyz.y || xyzOld.z !== this.xyz.z) this.positionDirty = true;

    if (fPositionBody) {
      // _FEnqueueSmmInMsq: fire latched motion-match sounds that hit this cel
      if (this.onStage && this.nfrmCur <= (this.data.nfrmLast ?? this.nfrmLast ?? Infinity)) this._enqueueSmm();
      if (this.positionDirty) {
        this._positionBody();
        this.positionDirty = false;
      }
      if (this.onStage) this._setActnCel(this.anid, this.celn);
    } else if (this.positionDirty) {
      this._matrixRotUpdate();
    }
    if (this.onStage) this.groundY = Math.min(this.groundY, this.dxyzRte.y + this.xyz.y);
  }

  _doAevCur() {
    this._doAevCore(this.iaevCur);
    this.iaevCur++;
  }

  // _FInsertSmm: latch a motion-match sound; one entry per (celn, sty)
  _insertSmm(iaev) {
    const data = this.events[iaev].data;
    const i = this.smm.findIndex((s) => s.data.celn === data.celn && s.data.sty === data.sty);
    if (i >= 0) this.smm[i] = { data };
    else this.smm.push({ data });
  }

  // _FEnqueueSmmInMsq: fire smm entries that land on the current cel
  _enqueueSmm() {
    const ccel = this.ccel || 1, celn = ((this.celn % ccel) + ccel) % ccel;
    for (const s of this.smm) if (s.data.celn === celn && !s.data.fNoSound) this.onSound?.(this, { ...s.data, mm: true });
  }

  // FReplayFrame: re-fire this frame's sounds — listener-tool hover audition
  replaySnd() {
    if (!this.onStage) return;
    for (let i = this.iaevFrmMin; i < this.iaevCur; i++) {
      const e = this.events[i];
      if (e.aet === AET.Snd && e.data.celn === -1 && !e.data.fNoSound) this.onSound?.(this, e.data);
    }
    this._enqueueSmm();
  }

  _doAevCore(iaev) {
    const ev = this.events[iaev];
    const d = ev.data;
    switch (ev.aet) {
      case AET.Actn: {
        // a changed action empties the motion-match sound list (_FDoAevCore)
        if (d.anid !== this.anid) this.smm.length = 0;
        this._setActnCel(d.anid, d.celn);
        this.celn = d.celn;
        this.anid = d.anid;
        const actn = this._actn(d.anid);
        this.ccel = actn ? actn.cels.length : 1;
        this.grfactn = actn ? actn.grfactn : 0;
        this.iaevActnCur = iaev;
        this.rtel = { ...ev.rtel };
        this.xyz = this._xyzFromRtel(this.rtel);
        break;
      }
      case AET.Add:
        this.smm.length = 0; // re-adding empties the motion-match sound list
        this._setDefaultCost();
        this._setActnCel(this.anid, this.celn);
        this.dxyzSubRte = { x: d.x, y: d.y, z: d.z };
        this._updateXyzRte();
        this._initXfrm();
        this.xfrm.cur = M.mul(M.mul(M.mul(M.identity(), M.rotX(d.xa)), M.rotY(d.ya)), M.rotZ(d.za));
        this.iaevFrmMin = this.iaevAddCur = iaev;
        this.rtel = { ...ev.rtel };
        this.xyz = this._xyzFromRtel(this.rtel);
        this.onStage = true;
        break;
      case AET.Rem:
        this.onStage = false;
        break;
      case AET.Cost:
        if (d.fCmtl) this._applyCmtl(templateCmtl(this.template, d.cmid));
        else {
          const mtrl = this.contentLibrary.mtrl(d.tag);
          if (mtrl) for (let i = 0; i < this.parts.length; i++) if (this.template.ibsets[i] === d.ibset) this.parts[i].mtrl = mtrl;
        }
        this._cost[d.ibset] = d;
        break;
      case AET.RotF: this.xfrm.fwd = d; this.useCur = false; break;
      case AET.RotH: this.xfrm.cur = d; this.useCur = true; break;
      case AET.Pull: this.xfrm.pull = d; break;
      case AET.Size: this.xfrm.scaleStep = d; break;
      case AET.Step:
        this.dwrStep = d;
        if (d === 0) { this.rtel = { ...ev.rtel }; this.xyz = this._xyzFromRtel(this.rtel); }
        break;
      case AET.Freeze: this.frozen = d; break;
      case AET.Tweak:
        if (ev.rtel.dnfrm === this.rtel.dnfrm) this.xyz = { ...d };
        break;
      case AET.Move:
        this.dxyzSubRte = { x: this.dxyzSubRte.x + d.x, y: this.dxyzSubRte.y + d.y, z: this.dxyzSubRte.z + d.z };
        this._updateXyzRte();
        break;
      case AET.Snd:
        // _FEnqueueSnd: motion-match sounds (celn != smmNil) latch into the smm
        // instead of playing now; plain sounds enqueue on the positioning frame
        if (d.celn !== -1) this._insertSmm(iaev);
        else if (this._fpb && !d.fNoSound) this.onSound?.(this, d);
        break;
      default:
        break;
    }
  }

  // --- event editing (actor.cpp _FAddDoAev/_MergeAev/FSetActionCore) ----------
  // Index bookkeeping so runtime cursors stay valid when events are spliced.
  _onInsertAev(i) {
    if (i < this.iaevCur) this.iaevCur++;
    if (i <= this.iaevActnCur) this.iaevActnCur++;
    if (i <= this.iaevAddCur) this.iaevAddCur++;
    if (i < this.iaevFrmMin) this.iaevFrmMin++;
  }

  _onRemoveAev(i) {
    if (i < this.iaevCur) this.iaevCur--;
    if (i < this.iaevActnCur) this.iaevActnCur--;
    if (i < this.iaevAddCur) this.iaevAddCur--;
    if (i < this.iaevFrmMin) this.iaevFrmMin--;
  }

  _removeAev(i) { this.events.splice(i, 1); this._onRemoveAev(i); }

  // _MergeAev: a same-aet event already processed this frame is consumed —
  // same rtel replaces its data, different rtel deletes it outright.
  _mergeAev(iaevFirst, iaevNew) {
    const evNew = this.events[iaevNew];
    for (let i = iaevFirst; i < iaevNew; i++) {
      const ev = this.events[i];
      if (ev.aet === AET.Rem && evNew.aet === AET.Add && evNew.nfrm !== ev.nfrm) { // re-add on a new
        this._removeAev(i); i--; iaevNew--; continue; // frame supersedes the Rem
      }
      if (ev.aet === AET.Add) continue; // never merge into an Add (costume/orientation info must survive)
      if (ev.aet === AET.RotH) { // RotF nukes same-frame RotH ("forward wins, visibly")
        if (evNew.aet === AET.RotF && evNew.nfrm === ev.nfrm) { this._removeAev(i); i--; iaevNew--; continue; }
        if (evNew.aet !== AET.RotH) continue;
      } else if (ev.aet === AET.RotF && evNew.aet === AET.RotF) { // forward-rotate replaces outright
        this._removeAev(i); i--; iaevNew--; continue;
      }
      if (ev.aet === AET.Snd && evNew.aet === AET.Snd) { // same SqnActr (sty) replaces —
        if (ev.data.sty !== evNew.data.sty) continue;   // queued newcomers coexist instead
        if (evNew.data.fQueue) continue;
        const k = this.smm.findIndex((s) => s.data.sty === ev.data.sty && s.data.celn === ev.data.celn);
        if (k >= 0) this.smm.splice(k, 1); // replaced sound leaves the mm list too
        this._removeAev(i); i--; iaevNew--; continue;
      }
      if (ev.aet !== evNew.aet) continue;
      if (ev.aet === AET.Cost && ev.data.ibset !== evNew.data.ibset) continue; // part sets don't mix
      if (ev.aet === AET.Move) {
        ev.data = { x: ev.data.x + evNew.data.x, y: ev.data.y + evNew.data.y, z: ev.data.z + evNew.data.z };
      } else if (cmpRtel(ev.rtel, evNew.rtel) !== 0) {
        this._removeAev(i);
        return iaevNew - 1;
      } else ev.data = evNew.data;
      this._removeAev(iaevNew);
      return i;
    }
    return iaevNew;
  }

  // _FAddDoAev: insert at the processing cursor, merge within the frame, execute now
  addDoAev(aet, data) {
    const iaev = this.iaevCur;
    this.events.splice(iaev, 0, { aet, nfrm: this.nfrmCur, rtel: { ...this.rtel }, data });
    this._onInsertAev(iaev);
    const iaevNew = this._mergeAev(this.iaevFrmMin, iaev);
    if (aet === AET.Move) { // BUG1870: merge accumulates Move data, so re-executing
      const d = this.dxyzSubRte; // the merged event would double-apply — add delta once
      this.dxyzSubRte = { x: d.x + data.x, y: d.y + data.y, z: d.z + data.z };
      this._updateXyzRte();
    } else this._doAevCore(iaevNew);
    if (this.iaevCur === iaevNew) this.iaevCur++;
    if (this.nfrmFirst > this.nfrmCur) this.data.nfrmFirst = this.nfrmFirst = this.nfrmCur;
    return iaevNew;
  }

  setStep(dwr) { return this.addDoAev(AET.Step, dwr); } // FSetStep

  // FSetActionCore — insert Actn at the cursor, drop superseded forward events,
  // then Freeze(done?) and Step(-1) so a paused actor resumes (_FRemoveAevMm/
  // _FAddAevDefMm motion-match sounds unported)
  setActionCore(anid, celn, fFreeze) {
    const fStatic = this.iaevActnCur < 0 || !!((this._actn(anid)?.grfactn || 0) & FACTN_STATIC);
    let anidChain = this.anid;
    for (let i = (this.iaevFrmMin === this.iaevAddCur ? this.iaevFrmMin + 1 : this.iaevFrmMin); i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.aet === AET.Add) break;
      if (ev.aet === AET.Actn) {
        if (ev.data.anid === anidChain || ev.data.anid === anid) {
          if (ev.data.anid === anid) anidChain = anid;
          this._removeAev(i); i--; continue;
        }
        break;
      }
      if (cmpRtel(ev.rtel, this.rtel) < 0) continue;
      if (ev.aet === AET.Tweak || (ev.aet === AET.Freeze && !this._isDoneAevSub(i, ev.rtel))) { this._removeAev(i); i--; }
    }
    this.addDoAev(AET.Actn, { anid, celn });
    const done = () => this._isDoneAevSub(this.iaevCur, this.rtel);
    this.addDoAev(AET.Freeze, fFreeze || done());
    if (!fStatic && !this.template.isTdt && !done()) this.setStep(DWR_NIL);
  }

  // --- transform fills (actor.cpp _PrepXfrmFill/_PrepCostFill) ----------------
  // _PrepXfrmFill: delete forward <aet> events the new value supersedes —
  // consecutive duplicates of the previous effective value, then duplicates of
  // the new value; stop at the first differing one. Bounded by the next Add.
  _prepXfrmFill(aet, pvVar, grfaet = 0) {
    let pvVarCmp, fReplacePrev = true;
    for (let i = 0; i < this.iaevCur - 1; i++) if (this.events[i].aet === aet) pvVarCmp = this.events[i].data;
    if (pvVarCmp === undefined) pvVarCmp = pvVar;
    const eq = (a, b) => a === b || (a && b && a.x === b.x && a.y === b.y && a.z === b.z) ||
      (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, k) => v === b[k]));
    for (let i = this.iaevCur; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.aet === AET.Add) break;
      let fDelete = false;
      if (ev.aet === aet && (aet === AET.Size || aet === AET.Pull || aet === AET.RotF)) {
        if (fReplacePrev) {
          if (eq(ev.data, pvVarCmp)) fDelete = true;
          else { fReplacePrev = false; pvVarCmp = pvVar; if (eq(ev.data, pvVarCmp)) fDelete = true; else break; }
        } else if (eq(ev.data, pvVarCmp)) fDelete = true; else break;
      } else if (ev.aet === AET.Tweak && (grfaet & faet.Tweak) && cmpRtel(ev.rtel, this.rtel) >= 0) fDelete = true;
      else if (ev.aet === AET.RotH && (grfaet & faet.RotF) && cmpRtel(ev.rtel, this.rtel) === 0) fDelete = true;
      else if (ev.aet === AET.Freeze && (grfaet & faet.Freeze) && cmpRtel(ev.rtel, this.rtel) >= 0) fDelete = true;
      else if (ev.aet === AET.Step && (grfaet & faet.Step) && cmpRtel(ev.rtel, this.rtel) >= 0) fDelete = true;
      if (fDelete) { this._removeAev(i); i--; }
    }
  }

  // _PrepCostFill: same dedup, scoped to Cost events for this ibset
  _prepCostFill(iaevMin, aevcost) {
    let cmp = this._cost[aevcost.ibset], fReplacePrev = true;
    const same = (e) => e.fCmtl === cmp?.fCmtl && (e.fCmtl ? e.cmid === cmp.cmid : e.tag === cmp.tag);
    for (let i = iaevMin; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.aet === AET.Add) break;
      if (ev.aet !== AET.Cost || ev.data.ibset !== aevcost.ibset) continue;
      if (fReplacePrev && same(ev.data)) { this._removeAev(i); i--; continue; }
      if (fReplacePrev) { fReplacePrev = false; cmp = aevcost; }
      if (same(ev.data)) { this._removeAev(i); i--; } else break;
    }
  }

  // FSetCostumeCore: cmtl costumes take their ibset from the CMTL itself;
  // dedup forward costumes for the part set, then insert+execute at the cursor
  setCostumeCore(ibsetClicked, tag, cmid, fCmtl) {
    let ibsetApply = ibsetClicked;
    if (fCmtl) {
      const cmtl = templateCmtl(this.template, cmid);
      if (!cmtl) return false;
      ibsetApply = cmtl.ibset;
    }
    const aevcost = { ibset: ibsetApply, tag: tag || null, cmid, fCmtl: !!fCmtl };
    this._prepCostFill(this.iaevCur, aevcost);
    this.addDoAev(AET.Cost, aevcost);
    return true;
  }

  // FRotate: xa/ya/za are radians on the rotated axis (only one non-zero per
  // call). fFromHereFwd (cmd) writes aetRotF — forward rotation with path
  // orientation applied concurrently; otherwise aetRotH — this frame only.
  fRotate(xa, ya, za, fFromHereFwd) {
    let aet, m;
    if (fFromHereFwd) {
      aet = AET.RotF;
      if (this.useCur) { // bmat34Cur was last used — back the path orientation out
        m = this.xfrm.cur.slice();
        if (this.pathAng.za) m = M.mul(m, M.rotZ(-this.pathAng.za));
        if (this.pathAng.ya) m = M.mul(m, M.rotY(-this.pathAng.ya));
        if (this.pathAng.xa) m = M.mul(m, M.rotX(-this.pathAng.xa));
      } else m = this.xfrm.fwd.slice();
    } else { aet = AET.RotH; m = this.xfrm.cur.slice(); }
    if (xa) m = M.mul(M.rotX(xa), m);
    if (ya) m = M.mul(M.rotY(ya), m);
    if (za) m = M.mul(M.rotZ(za), m);
    if (fFromHereFwd) this._prepXfrmFill(AET.RotF, m);
    this.addDoAev(aet, m);
    this._positionBody();
    return true;
  }

  // FNormalizeCore(fnormRotate): reset both rotation matrices to identity and
  // write a RotF so the reset applies forward (single-frame RotH isn't enough —
  // the actor must stay normalized on later frames too)
  fNormalizeRot() {
    this.xfrm.fwd = M.identity();
    this.xfrm.cur = M.identity();
    this._prepXfrmFill(AET.RotF, this.xfrm.fwd);
    this.addDoAev(AET.RotF, this.xfrm.fwd.slice());
    this._positionBody();
    return true;
  }

  // FPull: squash/stretch — per-call factors bounded [0.1,10], accumulated pull
  // bounded [0.25,4] (krScaleMinFactor/krScaleMaxFactor, krPullMin/krPullMax)
  fPull(rx, ry, rz) {
    const B = (v) => Math.min(10, Math.max(0.1, v));
    const P = (v) => Math.min(4, Math.max(0.25, v));
    rx = B(rx); ry = B(ry); rz = B(rz);
    this.xfrm.pull = { x: P(this.xfrm.pull.x * rx), y: P(this.xfrm.pull.y * ry), z: P(this.xfrm.pull.z * rz) };
    this._prepXfrmFill(AET.Pull, this.xfrm.pull);
    this.addDoAev(AET.Pull, { ...this.xfrm.pull });
    this._positionBody();
    return true;
  }

  // FScale: uniform scale — per-call [0.1,10], accumulated rScaleStep [0.25,10];
  // a size change that clamps removes forward Tweaks (faetTweak)
  fScale(rScale) {
    rScale = Math.min(10, Math.max(0.1, rScale));
    this.xfrm.scaleStep = Math.min(10, Math.max(0.25, this.xfrm.scaleStep * rScale));
    const grfaet = this.xfrm.scaleStep !== rScale ? faet.Tweak : 0;
    this._prepXfrmFill(AET.Size, this.xfrm.scaleStep, grfaet);
    this.addDoAev(AET.Size, this.xfrm.scaleStep);
    this._positionBody();
    return true;
  }

  // FNormalizeCore(fnormSize): pull -> 1,1,1 and rScaleStep -> 1 via aetPull+aetSize
  fNormalizeSize() {
    const step0 = this.xfrm.scaleStep;
    this.xfrm.pull = { x: 1, y: 1, z: 1 };
    const grfaet = step0 !== 1 ? faet.Tweak : 0;
    this.xfrm.scaleStep = 1;
    this._prepXfrmFill(AET.Pull, this.xfrm.pull);
    this._prepXfrmFill(AET.Size, this.xfrm.scaleStep, grfaet);
    this.addDoAev(AET.Pull, { ...this.xfrm.pull });
    this.addDoAev(AET.Size, this.xfrm.scaleStep);
    this._positionBody();
    return true;
  }

  // FSoonerLater: slide the actor's schedule dnfrm frames in time. Sooner (dnfrm<0)
  // walks the already-processed events backward; later walks the current subroute
  // and beyond forward — subroute gaps between Add events eat into the shift.
  fSoonerLater(dnfrm) {
    if (!dnfrm) return true;
    const evs = this.events;
    if (dnfrm < 0) {
      let dnfrmT = -dnfrm;
      for (let i = this.iaevCur - 1; dnfrmT > 0 && i >= 0; i--) {
        const ev = evs[i];
        if (ev.aet !== AET.Add || i === 0) { ev.nfrm -= dnfrmT; continue; }
        const dnfrmSub = ev.nfrm - evs[i - 1].nfrm; // gap before this subroute
        ev.nfrm -= dnfrmT;
        dnfrmT -= (dnfrmSub - 1);
      }
    } else {
      let dnfrmT = dnfrm, nfrmSav;
      for (let i = this.iaevAddCur; dnfrmT > 0 && i < evs.length; i++) {
        const ev = evs[i];
        if (ev.aet !== AET.Add || i === this.iaevAddCur) { nfrmSav = ev.nfrm; ev.nfrm += dnfrmT; continue; }
        const dnfrmSub = ev.nfrm - nfrmSav;
        dnfrmT -= (dnfrmSub - 1);
        if (dnfrmT <= 0) break;
        ev.nfrm += dnfrmT;
      }
    }
    this.nfrmFirst = this.data.nfrmFirst = evs[0].nfrm;
    this.nfrmLast = this.data.nfrmLast = evs[evs.length - 1].nfrm;
    this.nfrmCur += dnfrm;
    return true;
  }

  // --- deletion (actor.cpp _DeleteFwdCore/FDelete/_FDeleteEntireSubrte) ---------
  // _AdjustAevForRteDel: retarget event rtels for a route point about to be
  // deleted. Events anchored on the point itself die with it when it was a
  // subroute end (dwr 0); otherwise they fold into the previous segment.
  _adjustAevForRteDel(irptAdjust, iaevMin) {
    const dwrBack = irptAdjust > 0 ? this.route[irptAdjust - 1].dwr : 0;
    const dwrFwd = this.route[irptAdjust].dwr;
    for (let i = iaevMin; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.rtel.irpt > irptAdjust) ev.rtel.irpt--;
      else if (ev.rtel.irpt === irptAdjust) {
        if (dwrFwd === 0) { this._removeAev(i); i--; continue; }
        ev.rtel.dwrOffset += dwrBack;
        ev.rtel.irpt--;
      }
    }
  }

  // _TruncateSubRte: rtel is mid-segment — shorten the segment to the current
  // offset, move the next node onto the cut point, and drop the rest of the
  // subroute up to irptDelLim.
  _truncateSubRte(irptDelLim) {
    if (this.rtel.dwrOffset === 0) return;
    const irpt = this.rtel.irpt;
    const dwr1 = this.rtel.dwrOffset;
    this.route[irpt].dwr = dwr1;
    const p = this._xyzFromRtel(this.rtel);
    this.route[irpt + 1] = { x: p.x, y: p.y, z: p.z, dwr: 0 };
    this.rtel = { irpt: irpt + 1, dwrOffset: 0, dnfrm: 0 };
    for (let i = this.iaevCur - 1; i >= 0; i--) { // processed events past the cut jump to the tip
      const ev = this.events[i];
      if (ev.rtel.irpt < irpt) break;
      if (ev.rtel.dwrOffset >= dwr1) { ev.rtel.dwrOffset = 0; ev.rtel.irpt++; }
    }
    for (let i = irptDelLim - 1; i > this.rtel.irpt; i--) {
      this._adjustAevForRteDel(i, 0);
      this.route.splice(i, 1);
    }
  }

  // _DeleteFwdCore: delete all events forward of the cursor (bounded by the
  // next Add unless fAll) plus the route points they governed. Returns whether
  // the actor still has events (alive).
  _deleteFwdCore(fAll, iaevScan = this.iaevCur) {
    let iaevDelLim = this.events.length, irptDelLim = this.route.length;
    if (!fAll) {
      fAll = true;
      for (let i = iaevScan; i < this.events.length; i++) {
        if (this.events[i].aet === AET.Add) { fAll = false; irptDelLim = this.events[i].rtel.irpt; iaevDelLim = i; break; }
      }
    }
    for (let i = iaevDelLim - 1; i >= this.iaevCur; i--) this._removeAev(i);
    let irptDelFirst = this.rtel.irpt + 1;
    if (irptDelLim > 0) {
      if (this.iaevCur <= 0 && fAll) { // deleting from the very start — nothing survives
        this.route.length = 0;
        this.rtel.irpt = -1;
        this.nfrmCur = null; // _InitState — actor is dead; force full rewind on next eval
        return true;
      }
      if (this.rtel.dwrOffset > 0) { this._truncateSubRte(irptDelLim); irptDelFirst++; }
      else for (let i = irptDelLim - 1; i >= irptDelFirst; i--) { this._adjustAevForRteDel(i, 0); this.route.splice(i, 1); }
      if (this.rtel.irpt >= 0 && this.route[this.rtel.irpt]) this.route[this.rtel.irpt].dwr = 0;
    }
    return true;
  }

  // _DelAddFrame: delete the remaining Add-frame events [iaevAdd, iaevLim) and
  // the Add's route point unless the previous event still references it.
  _delAddFrame(iaevAdd, iaevLim) {
    const irptAdd = this.events[iaevAdd].rtel.irpt;
    for (let i = iaevLim - 1; i >= iaevAdd; i--) this._removeAev(i);
    if (iaevAdd > 0) {
      const prev = this.events[iaevAdd - 1];
      if (prev.rtel.irpt === irptAdd || (prev.rtel.irpt === irptAdd - 1 && prev.rtel.dwrOffset > 0)) return;
    }
    this._adjustAevForRteDel(irptAdd, iaevAdd);
    this.route.splice(irptAdd, 1);
    if (this.rtel.irpt > irptAdd) this.rtel.irpt--;
  }

  // _FDeleteEntireSubrte: delete the whole current subroute (called when the
  // current frame is the subroute's Add frame).
  _deleteEntireSubrte() {
    this._deleteFwdCore(false);
    this._delAddFrame(this.iaevAddCur, this.iaevCur);
    this.onStage = false;
    this._setDefaultCost();
    const nfrmSav = this.nfrmCur;
    this.nfrmCur = null;
    if (this.events.length) {
      this.nfrmFirst = this.data.nfrmFirst = this.events[0].nfrm;
      this.gotoFrame(nfrmSav);
    }
  }

  // FDelete: delete forward from the current frame — rewinds one frame first so
  // the cut removes "from this point on". fAll (shift) extends the cut across
  // the next Add boundary. Returns whether the actor still has events.
  fDelete(fAll) {
    const addEv = this.iaevAddCur >= 0 ? this.events[this.iaevAddCur] : null;
    if (addEv && !fAll && this.nfrmCur === addEv.nfrm) {
      this._deleteEntireSubrte();
      return this.events.length > 0;
    }
    const iaevSav = this.iaevCur;
    this.gotoFrame(this.nfrmCur - 1);
    this._deleteFwdCore(fAll, iaevSav);
    if (this.nfrmCur !== null) this.gotoFrame(this.nfrmCur + 1);
    return this.events.length > 0;
  }

  // FRemFromStageCore: an actor added on this very frame loses its subroute
  // outright; otherwise a Rem event hides it from here on.
  remFromStageCore() {
    if (!this.onStage) return;
    const addEv = this.iaevAddCur >= 0 ? this.events[this.iaevAddCur] : null;
    if (addEv && this.nfrmCur === addEv.nfrm) this._deleteEntireSubrte();
    if (this.onStage) this.addDoAev(AET.Rem, undefined);
  }

  // --- orientation ------------------------------------------------------------
  _matrixRotUpdate() {
    const [xa, ya, za] = this.template.rest;
    let ts = M.mul(M.mul(M.rotX(xa), M.rotY(ya)), M.rotZ(za));
    const p = this.xfrm.pull, s = this.xfrm.scaleStep;
    if (p.x !== 1 || p.y !== 1 || p.z !== 1 || s !== 1) {
      ts = M.mul(ts, M.scale(p.x, p.y, p.z));
      if (s !== 1) ts = M.mul(ts, M.scale(s, s, s));
    }
    if (this.useCur || this.iaevAddCur < 0) return M.mul(ts, this.xfrm.cur);
    let tr = this.xfrm.fwd.slice();
    const add = this.events[this.iaevAddCur];
    const rpt = this.route[add.rtel.irpt] || this.route[0];
    if (this.template.isTdt || add.nfrm === this.nfrmCur || rpt.dwr === 0) {
      tr = M.mul(M.mul(M.mul(tr, M.rotX(add.data.xa)), M.rotY(add.data.ya)), M.rotZ(add.data.za));
      this.pathAng = { xa: add.data.xa, ya: add.data.ya, za: add.data.za }; // path part = Add's orientation
    } else {
      tr = this._calcRteOrient(tr); // sets pathAng to the tangent-derived angles
    }
    this.xfrm.cur = tr;
    return M.mul(ts, tr);
  }

  _calcRteOrient(m) {
    this.pathAng = { xa: 0, ya: 0, za: 0 }; // _CalcRteOrient aZeros the path angles up front
    const irptAdd = this.events[this.iaevAddCur].rtel.irpt;
    let irptPrev = this.rtel.dwrOffset > 0 || this.rtel.irpt === irptAdd ? this.rtel.irpt : this.rtel.irpt - 1;
    if (this.route[irptPrev] && this.route[irptPrev].dwr === 0) irptPrev--;
    if (irptPrev < irptAdd) return m;
    const v = { x: 0, y: 0, z: 0 };
    this._updateXyzTan(v, irptPrev, 4);
    if (irptPrev > irptAdd) {
      this._updateXyzTan(v, irptPrev - 1, 2);
      if (irptPrev - 1 > irptAdd) this._updateXyzTan(v, irptPrev - 2, 1);
    }
    return this._applyRotFromVec(v, m);
  }

  _updateXyzTan(v, irpt, w) {
    const a = this.route[irpt], b = this.route[irpt + 1];
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    // BrsAbsMax3 is the unsigned max; the signed equality tests intentionally
    // fall through to `else` when the dominant delta is negative (dwr stays > 0)
    let dwr = Math.max(ax, ay, az);
    if (dx === dwr) dwr += Math.max(ay, az) / 2;
    else if (dy === dwr) dwr += Math.max(ax, az) / 2;
    else dwr += Math.max(ax, ay) / 2;
    const c = (x) => (dwr === 0 ? 1 : Math.max(-1, Math.min(1, x / dwr)));
    v.x += c(dx) * w; v.y += c(dy) * w; v.z += c(dz) * w;
  }

  _applyRotFromVec(v, m) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    const dwr = Math.max(ax, ay, az) + 1;
    const rX = v.x / dwr, rY = v.y / dwr, rZ = v.z / dwr;
    let aRot = 0;
    if (this.grfactn & FACTN_ROTY && (v.x !== 0 || v.z !== 0)) { aRot = Math.atan2(rX, rZ); m = M.mul(m, M.rotY(aRot)); }
    this.pathAng.ya = aRot; // *pya = aRot (yaw)
    if (this.grfactn & FACTN_ROTX && v.y !== 0) { aRot = Math.atan2(-rY, Math.abs(rX) + Math.abs(rZ)); m = M.mul(M.rotX(aRot), m); }
    this.pathAng.xa = aRot; // original: *pxa = aRot — the tilt if ROTX ran, else the leftover yaw
    // *pza is never written in the original (it writes *pxa = aZero twice) — stays 0
    return m;
  }

  _positionBody() {
    const m = this._matrixRotUpdate();
    const t = this.dxyzRte;
    this.rootMatrix = M.mul(m, M.translate(t.x + this.xyz.x, t.y + this.xyz.y, t.z + this.xyz.z));
    this.groundY = Math.min(this.groundY, this.rootMatrix[10]);
  }

  /** World matrices of all body parts (BRender 4x3) */
  partWorldMatrices() {
    const out = new Array(this.parts.length);
    const { parents } = this.template;
    for (let i = 0; i < this.parts.length; i++) {
      const par = parents[i];
      const pm = par < 0 ? this.rootMatrix : out[par];
      out[i] = M.mul(this.parts[i].matrix, pm);
    }
    return out;
  }

  // --- sound editing (actrsnd.cpp FSetSndCore/FQuerySnd/FSetVlmSnd/FDeleteSndCore) ---
  // FSetSndCore: attach a sound event at the cursor. sty 4 (Midi) can't go on
  // actors; fMM latches it to the current cel (motion-match) instead of playing
  // at this frame. Inserted via _FAddDoAev so same-sty sounds merge per _MergeAev.
  fSetSnd(tag, fLoop, fQueue, fMM, vlm, sty) {
    if (sty === 4) return false; // STY.Midi — ercSocNoActrMidi
    const ccel = this.ccel || 1;
    const aevsnd = { fLoop: !!fLoop, fQueue: !!fQueue, vlm,
      celn: fMM ? ((this.celn % ccel) + ccel) % ccel : -1, sty, fNoSound: false, chid: 0, tag };
    this.addDoAev(AET.Snd, aevsnd);
    for (let i = this.iaevCur; i < this.events.length; i++) { // drop fNoSound placeholders of
      const e = this.events[i];                                // this sty up to the next real one
      if (e.aet === AET.Add) break;
      if (e.aet !== AET.Snd || e.data.sty !== sty) continue;
      if (!e.data.fNoSound) break;
      this._removeAev(i); i--;
    }
    this._enqueueSmm();
    return true;
  }

  // FQuerySnd: the sty's sound(s) at the current frame — tags + vlm + loop, or null.
  // Non-MM = plain Snd events applied this frame; MM = the smm entry latched to this cel.
  fQuerySnd(sty, fMM) {
    const tags = [];
    let vlm = 0, fLoop = false;
    if (!fMM) {
      for (let i = this.iaevFrmMin; i < this.iaevCur; i++) {
        const e = this.events[i];
        if (e.aet !== AET.Snd || e.data.sty !== sty || e.data.celn !== -1) continue;
        tags.push(e.data.tag); vlm = e.data.vlm; fLoop = e.data.fLoop;
      }
    } else {
      const ccel = this.ccel || 1, celn = ((this.celn % ccel) + ccel) % ccel;
      for (const s of this.smm) {
        if (s.data.sty !== sty || s.data.celn !== celn) continue;
        tags.push(s.data.tag); vlm = s.data.vlm; fLoop = s.data.fLoop; break;
      }
    }
    return tags.length ? { tags, vlm, fLoop } : null;
  }

  // FSetVlmSnd: re-target this frame's sty-matching sounds to vlm (MM also fixes
  // the latched smm entry plus the matching event back to the last action change)
  fSetVlmSnd(sty, fMM, vlm) {
    const ccel = this.ccel || 1, celn = ((this.celn % ccel) + ccel) % ccel;
    let fActnThisFrame = false, nfrmMM = null;
    for (let i = this.iaevFrmMin; i < this.iaevCur; i++) {
      const ev = this.events[i];
      if (ev.aet === AET.Actn) fActnThisFrame = true;
      if (ev.aet !== AET.Snd) continue;
      const d = ev.data;
      if ((d.celn !== -1) !== fMM || d.sty !== sty) continue;
      d.vlm = vlm;
    }
    if (fMM && !fActnThisFrame) { // earlier mm events landing on this cel
      for (let i = this.iaevFrmMin - 1; i > 0; i--) {
        const ev = this.events[i];
        if (ev.aet === AET.Actn || (nfrmMM !== null && nfrmMM > ev.nfrm)) break;
        if (ev.aet !== AET.Snd) continue;
        const d = ev.data;
        if (d.sty !== sty || d.celn !== celn) continue;
        d.vlm = vlm; nfrmMM = ev.nfrm;
        break; // no queued mm sounds by spec
      }
    }
    if (fMM) for (const s of this.smm) if (s.data.sty === sty && s.data.celn === celn) s.data.vlm = vlm;
    return true;
  }

  // FDeleteSndCore: remove this frame's sty-matching sounds (non-MM) or the
  // current cel's latched sounds back to the last action change (MM + smm)
  fDeleteSndCore(sty, fMM) {
    const ccel = this.ccel || 1, celn = ((this.celn % ccel) + ccel) % ccel;
    const lo = fMM ? this.iaevActnCur : this.iaevFrmMin;
    let nfrmMM = null;
    for (let i = this.iaevCur - 1; i >= lo && i >= 0; i--) {
      const ev = this.events[i];
      if (fMM && nfrmMM !== null && nfrmMM > ev.nfrm) break;
      if (ev.aet !== AET.Snd) continue;
      const d = ev.data;
      if (d.sty !== sty || (d.celn !== -1) !== fMM) continue;
      if (fMM && d.celn !== celn) continue;
      this._removeAev(i);
      nfrmMM = ev.nfrm;
    }
    if (fMM) for (let i = this.smm.length - 1; i >= 0; i--)
      if (this.smm[i].data.sty === sty && this.smm[i].data.celn === celn) this.smm.splice(i, 1);
    return true;
  }
}
