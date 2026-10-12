// Scene/movie state at a given frame (SRC/ENGINE/SCENE.CPP semantics).
import { parseMovie, SEVT } from '../format/movie.js';
import { Actor } from './actor.js';
import { measureTbox, SCROLL_PX_PER_S } from '../render/textbox.js';

export const FPS = 6;

// transition enum (inc/socutil.h) and durations in frames at FPS
export const TRANS = { Nil: -1, Cut: 0, FadeToBlack: 1, FadeToWhite: 2, Dissolve: 3, Black: 4 };
const TRANS_DUR = { [TRANS.FadeToBlack]: 12, [TRANS.FadeToWhite]: 12, [TRANS.Dissolve]: 24, [TRANS.Black]: 2 };
// wait types on sevtPause events (inc/scene.h WIT)
export const WIT = { Nil: 0, UntilClick: 1, UntilSnd: 2, ForTime: 3 };

export class MoviePlayer {
  constructor(movieFile, lib) {
    this.lib = lib;
    lib.setMovie(movieFile);
    this.movie = parseMovie(movieFile);
    this.sceneIndex = -1;
    this.frame = null;
    this.actors = new Map();
    this.visibleActors = [];
    this.tboxes = [];
    this.bkgd = this.camera = null;
    this.warnings = [];
    this.onSnd = null;      // ({scope, data}) => play a sound
    this.onSndStop = null;  // () => stop looping sounds (scene change/seek)
    this.sndPlaying = null; // () => true while the sound queue still has output
    this.wit = null;        // sevtPause applied at the current frame (WIT)
    this.clk = false;       // witUntilClick resume latch — set by any UI click
    this.onTransStart = null; // (trans) => snapshot outgoing frame before scene switch
    this.transition = null;
    this._sndDirty = false;
  }

  get scene() { return this.movie.scenes[this.sceneIndex]; }

  loadScene(i) {
    this.onSndStop?.();
    const s = this.movie.scenes[i];
    if (!s) { // _iscen = ivNil — a movie can be sceneless (new doc / all scenes nuked)
      this.sceneIndex = -1;
      this.actors = new Map();
      this.visibleActors = [];
      this.tboxes = [];
      this.bkgd = this.camera = null;
      this.frame = null; this.wit = null; this.transition = null;
      return;
    }
    this.sceneIndex = i;
    this.actors = new Map();
    for (const [chid, a] of s.actors) {
      let tmpl = null;
      try { tmpl = this.lib.template(a.tagTmpl); } catch (e) { this.warnings.push(`template ${a.tagTmpl.ctg} ${a.tagTmpl.cno}: ${e.message}`); }
      if (!tmpl) { this.warnings.push(`missing template ${a.tagTmpl.ctg} ${a.tagTmpl.cno}`); continue; }
      const actor = new Actor(a, tmpl, this.lib);
      actor.onSnd = (actr, d) => this.onSnd?.({ scope: 'actor', arid: actr.data.arid, data: d });
      this.actors.set(chid, actor);
    }
    this.frame = null;
    this.gotoFrame(s.nfrmFirst);
  }

  gotoFrame(nfrm) {
    if (!this.scene) return;
    this.onSndStop?.(); // seeking kills loops (original ties them to scene playback)
    this._sndDirty = true; // seeking: replay current-frame sounds on next play step
    this._applyFrame(nfrm, false);
  }

  _applyFrame(nfrm, fireSnd) {
    const s = this.scene;
    if (!s) return;
    nfrm = Math.max(s.nfrmFirst, Math.min(s.nfrmLast, nfrm));
    let bkgdTag = null, icam = 0, wit = null;
    const present = new Set();
    const tboxChids = new Set();
    const apply = (e) => {
      if (e.sevt === SEVT.SetBkgd) { bkgdTag = e.data; icam = 0; }
      else if (e.sevt === SEVT.ChngCamera) icam = e.data;
      else if (e.sevt === SEVT.AddActr) present.add(e.data);
      else if (e.sevt === SEVT.AddTbox) tboxChids.add(e.data);
      else if (e.sevt === SEVT.PlaySnd && fireSnd && e.nfrm === nfrm) this._fireSnd(e);
      else if (e.sevt === SEVT.Pause && e.nfrm === nfrm) wit = { ...e.data }; // SCEN::_FPlaySev -> PauseType
    };
    s.startEvents.forEach(apply);
    for (const e of s.frameEvents) if (e.nfrm <= nfrm) apply(e);
    this.bkgd = bkgdTag ? this.lib.bkgd(bkgdTag) : null;
    this.icam = icam;
    this.camera = this.bkgd ? this.lib.camera(this.bkgd, icam) : null;
    this.tboxes = [...tboxChids]
      .map((chid) => s.tboxes.get(chid))
      .filter((tb) => tb && nfrm >= tb.nfrmFirst && nfrm < tb.nfrmMax);
    for (const tb of this.tboxes) { // TBOX::FNeedToScroll inputs for the scroll hold
      if (tb._scv === undefined) tb._scv = 0; // persisted like _dypDisp — not reset by seeks
      if (!tb.fStory && typeof document !== 'undefined') // headless runs (tests/tools) skip scroll measurement
        tb._maxScroll = measureTbox(tb, this._tbCtx ||= document.createElement('canvas').getContext('2d')).maxScroll;
    }
    this.visibleActors = [];
    for (const [chid, actor] of this.actors) {
      // evaluate every actor so a seek below its AddActr clears stale onStage
      // state (e.g. the selection box); only `present` actors may render
      actor.gotoFrame(nfrm);
      if (present.has(chid) && actor.onStage) this.visibleActors.push(actor);
    }
    this.frame = nfrm;
    this.wit = wit;
  }

  _fireSnd(e) {
    if (e.sevt === SEVT.PlaySnd) this.onSnd?.({ scope: 'scene', data: e.data });
  }

  _replaySnd() {
    if (!this.scene) return;
    for (const e of this.scene.frameEvents) if (e.nfrm === this.frame) this._fireSnd(e);
  }

  /** Advance one frame, moving to the next scene at the end. Returns false at movie end. */
  step() {
    if (!this.scene) return false;
    if (this.transition) {
      if (++this.transition.frame >= this.transition.dur) this.transition = null;
      return true;
    }
    if (this._sndDirty && this.frame !== null) this._replaySnd();
    this._sndDirty = false;
    // MVIE::_FAdvance _fScrolling: non-story tboxes at their first frame hold
    // playback and scroll up 1px per kdtsScrolling (5ms) until the rest fits
    let scrollHold = false;
    const now = performance.now();
    const dt = Math.min(250, now - (this._scrollT || now));
    for (const tb of this.tboxes || []) {
      if (tb.fStory || this.frame !== tb.nfrmFirst) continue;
      const target = tb._maxScroll || 0;
      if ((tb._scv || 0) < target) {
        tb._scv = Math.min(target, (tb._scv || 0) + (dt / 1000) * SCROLL_PX_PER_S);
        if (tb._scv < target) scrollHold = true;
      }
    }
    this._scrollT = now;
    if (scrollHold) return true;
    if (this.wit) { // MVIE::_FAdvance LCheckForPause — hold the current frame
      const w = this.wit;
      if (w.wit === WIT.UntilClick) {
        if (this.clk) { this.clk = false; this.wit = null; } else return true;
      } else if (w.wit === WIT.UntilSnd) {
        if (this.sndPlaying?.()) return true; // _pmsq->FPlaying: wait for sounds to drain
        this.wit = null;
      } else if (w.wit === WIT.ForTime) {
        if (w.ticks === undefined) w.ticks = Math.max(1, Math.ceil(w.dts / 10)); // 60Hz ticks -> 6fps frames
        if (--w.ticks > 0) return true;
        this.wit = null;
      } else this.wit = null;
    }
    if (this.frame < this.scene.nfrmLast) { this._applyFrame(this.frame + 1, true); return true; }
    if (this.sceneIndex + 1 < this.movie.scenes.length) {
      const trans = this.scene.trans;
      this.onTransStart?.(trans);
      this.loadScene(this.sceneIndex + 1);
      this._sndDirty = false;
      this._replaySnd();
      const dur = TRANS_DUR[trans];
      if (dur) this.transition = { trans, frame: 0, dur };
      return true;
    }
    return false;
  }
}
