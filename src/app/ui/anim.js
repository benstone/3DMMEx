// Animator — tween manager driven by UiRoot's RAF. Supports view transitions
// (animate-in/out) and element property tweens (tooltips, easels, buttons).
export const EASE = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) * (1 - t),          // easeOutQuad
  in: (t) => t * t,                            // easeInQuad
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
};

export class Animator {
  constructor(onTick) { this.onTick = onTick; this.jobs = new Set(); }

  /**
   * Add a tween — fn gets the eased 0..1 each tick.
   * @param {{dur: number, ease?: (t: number) => number, fn: (t: number) => void, done?: () => void, t0?: number}} job
   */
  add(job) { job.t0 = performance.now(); job.ease ??= EASE.out; this.jobs.add(job); this.onTick?.(); return job; }
  cancel(job) { this.jobs.delete(job); }

  /**
   * Convenience: tween numeric props on a target. to: {prop: end}
   * @param {object} target
   * @param {Object.<string, number>} to
   * @param {{dur?: number, ease?: (t: number) => number, done?: () => void}} [opts]
   */
  tween(target, to, { dur = 200, ease = EASE.out, done } = {}) {
    const from = Object.fromEntries(Object.keys(to).map((k) => [k, target[k]]));
    return this.add({
      dur, ease,
      fn: (t) => { for (const k of Object.keys(to)) target[k] = from[k] + (to[k] - from[k]) * t; },
      done,
    });
  }

  tick(now) {
    if (!this.jobs.size) return;
    for (const j of [...this.jobs]) {
      const t = Math.min(1, (now - j.t0) / j.dur);
      j.fn(j.ease(t));
      if (t >= 1) { this.jobs.delete(j); j.done?.(); }
    }
  }
  get active() { return this.jobs.size > 0; }
}
