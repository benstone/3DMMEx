// Scene/movie state at a given frame — which actors and textboxes are present,
// which background + camera, which sounds fire, and pause/scroll holds.
import { parseMovie, SEVT } from '../format/movie.ts';
import { Actor } from './actor.ts';
import { measureTextbox, TEXTBOX_SCROLL_PIXELS_PER_SECOND } from '../render/textbox.ts';

/** Playback rate — the movie format's frame clock. */
export const FPS = 6;

// Scene-transition ids and their durations in frames at FPS.
export const TRANS = { Nil: -1, Cut: 0, FadeToBlack: 1, FadeToWhite: 2, Dissolve: 3, Black: 4 };
const TRANS_DUR = { [TRANS.FadeToBlack]: 12, [TRANS.FadeToWhite]: 12, [TRANS.Dissolve]: 24, [TRANS.Black]: 2 };
/** Pause-event wait kinds carried by scene Pause events. */
export const WIT = { Nil: 0, UntilClick: 1, UntilSnd: 2, ForTime: 3 };

/** Movie playback state — the current scene, frame, actors, textboxes,
 *  background, camera, and any pause/transition hold.
 *  `loadScene(i)` rebuilds actor state; `gotoFrame(n)` seeks; `step()` advances
 *  one playback frame (returning false at movie end). Sound output goes through
 *  the `onSound`/`onSoundStop`/`isSoundPlaying` callbacks. */
export class MoviePlayer {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(movieFile, contentLibrary) {
    this.contentLibrary = contentLibrary;
    contentLibrary.setMovie(movieFile);
    this.movie = parseMovie(movieFile);
    this.sceneIndex = -1;
    this.frame = null;
    this.actors = new Map();
    this.visibleActors = [];
    this.textboxes = [];
    this.bkgd = this.camera = null;
    this.warnings = [];
    this.onSound = null;      // ({scope, data}) => play a sound
    this.onSoundStop = null;  // () => stop looping sounds (scene change/seek)
    this.isSoundPlaying = null; // () => true while the sound queue still has output
    this.wit = null;        // Pause event applied at the current frame
    this.clk = false;       // UntilClick resume latch — set by any UI click
    this.onTransStart = null; // (trans) => snapshot outgoing frame before scene switch
    /** @type {CanvasRenderingContext2D | null} */
    this._tbCtx = null;
    this.transition = null;
    this._sndDirty = false;
  }

  /** The current scene record, or undefined when sceneless. */
  get scene() { return this.movie.scenes[this.sceneIndex]; }

  /** Load scene `i` — stops sounds, rebuilds actors from the scene's actor
   *  records, and seeks to its first frame. A missing index yields the
   *  sceneless state (empty stage). */
  loadScene(i) {
    this.onSoundStop?.();
    const s = this.movie.scenes[i];
    if (!s) { // sceneless — a movie can have no scenes (new doc / all removed)
      this.sceneIndex = -1;
      this.actors = new Map();
      this.visibleActors = [];
      this.textboxes = [];
      this.bkgd = this.camera = null;
      this.frame = null; this.wit = null; this.transition = null;
      return;
    }
    this.sceneIndex = i;
    this.actors = new Map();
    for (const [chid, a] of s.actors) {
      let template = null;
      try { template = this.contentLibrary.template(a.tagTmpl); } catch (e) { this.warnings.push(`template ${a.tagTmpl.ctg} ${a.tagTmpl.cno}: ${e.message}`); }
      if (!template) { this.warnings.push(`missing template ${a.tagTmpl.ctg} ${a.tagTmpl.cno}`); continue; }
      const actor = new Actor(a, template, this.contentLibrary);
      actor.onSound = (actr, d) => this.onSound?.({ scope: 'actor', arid: actr.data.arid, data: d });
      this.actors.set(chid, actor);
    }
    this.frame = null;
    this.gotoFrame(s.nfrmFirst);
  }

  /** Seek to frame `nfrm` of the current scene — clamps to the scene bounds,
   *  stops looping sounds, and flags current-frame sounds for replay. */
  gotoFrame(nfrm) {
    if (!this.scene) return;
    this.onSoundStop?.(); // seeking kills loops — they're tied to scene playback
    this._sndDirty = true; // replay current-frame sounds on the next play step
    this._applyFrame(nfrm, false);
  }

  /** Recompute scene state at frame `nfrm`: replays every scene event up to
   *  that frame (background, camera, actor presence, textbox presence), asks
   *  each actor to evaluate itself, and fires frame-landed sounds when
   *  `fireSnd` is set (play) versus silent (seek). */
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
      else if (e.sevt === SEVT.Pause && e.nfrm === nfrm) wit = { ...e.data }; // pause events only hold on their own frame
    };
    s.startEvents.forEach(apply);
    for (const e of s.frameEvents) if (e.nfrm <= nfrm) apply(e);
    this.bkgd = bkgdTag ? this.contentLibrary.bkgd(bkgdTag) : null;
    this.icam = icam;
    this.camera = this.bkgd ? this.contentLibrary.camera(this.bkgd, icam) : null;
    this.textboxes = [...tboxChids]
      .map((chid) => s.textboxes.get(chid))
      .filter((textbox) => textbox && nfrm >= textbox.nfrmFirst && nfrm < textbox.nfrmMax);
    for (const textbox of this.textboxes) { // measure credit-scroll height for the scroll hold
      if (textbox._scv === undefined) textbox._scv = 0; // scroll position persists across seeks
      if (!textbox.fStory && typeof document !== 'undefined') // headless runs (tests/tools) skip scroll measurement
        textbox._maxScroll = measureTextbox(textbox, this._tbCtx ||= document.createElement('canvas').getContext('2d')).maxScroll;
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

  /** Fire a scene-level sound event through `onSound`. */
  _fireSnd(e) {
    if (e.sevt === SEVT.PlaySnd) this.onSound?.({ scope: 'scene', data: e.data });
  }

  /** Re-fire every sound event that lands on the current frame — used after a
   *  seek so the sounded frame isn't lost. */
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
    // Credit-scroll hold: a non-story textbox on its first frame holds
    // playback and scrolls upward until its remaining text has passed through
    let scrollHold = false;
    const now = performance.now();
    const dt = Math.min(250, now - (this._scrollT || now));
    for (const textbox of this.textboxes || []) {
      if (textbox.fStory || this.frame !== textbox.nfrmFirst) continue;
      const target = textbox._maxScroll || 0;
      if ((textbox._scv || 0) < target) {
        textbox._scv = Math.min(target, (textbox._scv || 0) + (dt / 1000) * TEXTBOX_SCROLL_PIXELS_PER_SECOND);
        if (textbox._scv < target) scrollHold = true;
      }
    }
    this._scrollT = now;
    if (scrollHold) return true;
    if (this.wit) { // pause event active — hold the current frame until its condition clears
      const w = this.wit;
      if (w.wit === WIT.UntilClick) {
        if (this.clk) { this.clk = false; this.wit = null; } else return true;
      } else if (w.wit === WIT.UntilSnd) {
        if (this.isSoundPlaying?.()) return true; // hold until the sound queue drains
        this.wit = null;
      } else if (w.wit === WIT.ForTime) {
        if (w.ticks === undefined) w.ticks = Math.max(1, Math.ceil(w.dts / 10)); // stored 60Hz ticks -> 6fps frames
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
