// Browser audio playback for 3DMM movie sounds (Web Audio).
// MSND chunks hold a WAVE kid (raw .wav bytes) or a MIDS kid (MIDI event
// stream — rendered through an SF2/DLS soundfont when one is available,
// with a small oscillator synth as fallback).
import { STY } from '../format/content.ts';
import { decodeWavAdpcm } from '../format/wav.ts';
import { parseMids } from '../format/mids.ts';

// rough GM program -> [wave, attack, sustain, release] for the MIDS preview synth
const _gm = (p) =>
  p < 8 ? ['triangle', 0.005, 0.35, 0.15] :  // piano family — percussive
  p < 16 ? ['triangle', 0.01, 0.4, 0.1] :    // chromatic percussion
  p < 24 ? ['square', 0.01, 0.9, 0.08] :     // organ
  p < 32 ? ['sawtooth', 0.005, 0.25, 0.1] :  // guitar pluck
  p < 40 ? ['triangle', 0.01, 0.85, 0.1] :   // bass
  p < 48 ? ['sawtooth', 0.06, 0.8, 0.35] :   // strings
  p < 56 ? ['sawtooth', 0.1, 0.8, 0.4] :     // ensemble
  p < 64 ? ['sawtooth', 0.04, 0.85, 0.2] :   // brass
  p < 72 ? ['square', 0.03, 0.8, 0.15] :     // reed
  p < 80 ? ['sine', 0.02, 0.85, 0.12] :      // pipe/flute
  p < 88 ? ['square', 0.01, 0.6, 0.12] :     // synth lead
  p < 96 ? ['sawtooth', 0.25, 0.8, 0.4] :    // pad
  p < 104 ? ['triangle', 0.02, 0.6, 0.2] :   // fx
  p < 112 ? ['triangle', 0.01, 0.7, 0.1] :   // ethnic
  p < 120 ? ['triangle', 0.005, 0.4, 0.1] :  // percussive
  ['sine', 0.02, 0.5, 0.1];                  // sfx

export class SoundQueue {
  [k: string]: any; // transient fields — real declarations can replace incrementally
  constructor(lib) {
    this.lib = lib;
    this.ctx = null;
    this.buffers = new Map();   // 'cf:cno' -> Promise<AudioBuffer|null>
    this.channels = new Map();  // class key -> { current, queue }
    this.warnings = [];
    /** @type {((cno: number) => Promise<any>) | null} */
    this.userSnd = null;
    this.volume = 1;
    this.master = null;
    this.enabled = typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  /** Create/resume the AudioContext — call from a user gesture. */
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (!this.master) { this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Master volume 0..1 (studio volume slider). */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  _warn(msg) {
    if (!this.warnings.includes(msg)) { this.warnings.push(msg); console.warn('[sound]', msg); }
  }

  _buffer(msnd) {
    const key = `${msnd.cf.name}:${msnd.cno}`;
    if (!this.buffers.has(key)) {
      if (msnd.wavCno != null) {
        const data = msnd.cf.data('WAVE', msnd.wavCno);
        this.buffers.set(key, this._decode(data));
      } else if (msnd.midiCno != null) {
        this.buffers.set(key, this._midiBuffer(msnd));
      } else {
        this.buffers.set(key, Promise.resolve(null));
      }
    }
    return this.buffers.get(key);
  }

  // The original played MIDI through the OS GM wavetable (gm.dls). We render
  // the same event stream through a real SF2/SF3/DLS bank via spessasynth_core
  // — bank lookup: ?sf=<url>, then data/gm.dls, data/soundfont.{dls,sf3,sf2}
  // under the app base. null when nothing loads -> _oscBuffer fallback.
  _sfBank() {
    if (this._bankP === undefined) {
      this._bankP = (async () => {
        const urls = [];
        const q = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sf');
        if (q) urls.push(q);
        const B = import.meta.env.BASE_URL;
        for (const n of ['gm.dls', 'soundfont.dls', 'soundfont.sf3', 'soundfont.sf2']) urls.push(`${B}data/${n}`);
        const { SoundBankLoader } = await import('spessasynth_core');
        for (const u of urls) {
          try {
            const r = await fetch(u);
            if (r.ok) return SoundBankLoader.fromArrayBuffer(await r.arrayBuffer());
          } catch { /* try the next candidate */ }
        }
        this._warn('MIDI: no soundfont (data/gm.dls or data/soundfont.sf2) — synth preview used');
        return null;
      })().catch(() => { this._warn('MIDI: soundfont synth unavailable — synth preview used'); return null; });
    }
    return this._bankP;
  }

  // Run parsed MIDS events through the soundfont into an AudioBuffer (or null).
  async _sfBuffer(evs) {
    const bank = await this._sfBank();
    if (!bank || !evs.length) return null;
    const { SpessaSynthProcessor } = await import('spessasynth_core');
    const rate = 44100, n = Math.ceil((evs[evs.length - 1].ts / 1000 + 1.5) * rate);
    const synth = new SpessaSynthProcessor(rate, { maxBufferSize: 256 });
    synth.soundBankManager.addSoundBank(bank, 'main');
    await synth.processorInitialized;
    const L = new Float32Array(n), R = new Float32Array(n);
    let done = 0;
    const run = (at) => { // render [done, at) in <=256-sample quanta
      while (done < at) { const c = Math.min(256, at - done); synth.process(L, R, done, c); done += c; }
    };
    for (const e of evs) {
      run(Math.min(n, Math.round((e.ts * rate) / 1000)));
      const [st, a, b] = e.msg, ch = st & 15;
      switch (st & 0xf0) {
        case 0x80: synth.noteOff(ch, a); break;
        case 0x90: b ? synth.noteOn(ch, a, b) : synth.noteOff(ch, a); break;
        case 0xa0: synth.polyPressure(ch, a, b); break;
        case 0xb0: synth.controllerChange(ch, a, b); break;
        case 0xc0: synth.programChange(ch, a); break;
        case 0xd0: synth.channelPressure(ch, a); break;
        case 0xe0: synth.pitchWheel(ch, a | (b << 7), -1); break;
      }
    }
    run(n);
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: rate });
    buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
    return buf;
  }

  // User-imported .mid files are SMF, not MIDS — render via the sequencer.
  async _sfSmfBuffer(bytes) {
    const bank = await this._sfBank();
    if (!bank) return null;
    const { BasicMIDI, SpessaSynthProcessor, SpessaSynthSequencer } = await import('spessasynth_core');
    let midi;
    try { midi = BasicMIDI.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
    catch { return null; }
    const rate = 44100, n = Math.ceil((midi.duration + 1.5) * rate);
    const synth = new SpessaSynthProcessor(rate, { maxBufferSize: 256 });
    synth.soundBankManager.addSoundBank(bank, 'main');
    await synth.processorInitialized;
    const seq = new SpessaSynthSequencer(synth);
    seq.loadNewSongList([midi]); seq.play();
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let done = 0; done < n;) { seq.processTick(); const c = Math.min(256, n - done); synth.process(L, R, done, c); done += c; }
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: rate });
    buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
    return buf;
  }

  // Render a MIDS event stream to an AudioBuffer with a small GM-ish synth.
  async _midiBuffer(msnd) {
    const data = msnd.cf.data('MIDS', msnd.midiCno);
    const smf = data[0] === 0x4d && data[1] === 0x54 && data[2] === 0x68 && data[3] === 0x64; // 'MThd'
    if (smf) return this._sfSmfBuffer(data);
    const evs = parseMids(data);
    if (!evs.length) return null;
    const sf = await this._sfBuffer(evs);
    if (sf) return sf;
    if (typeof OfflineAudioContext === 'undefined') { this._warn('MIDI: OfflineAudioContext unavailable'); return null; }
    return this._oscBuffer(evs);
  }

  // Fallback when no soundfont is present: the rough oscillator preview.
  _oscBuffer(evs) {
    const dur = evs[evs.length - 1].ts / 1000 + 1.5;
    const oc = new OfflineAudioContext(2, Math.ceil(dur * 44100), 44100);
    const prog = new Array(16).fill(0), vol = new Array(16).fill(1), pan = new Array(16).fill(0);
    const active = new Map(); // 'ch:note' -> {o, g, sus, rel, peak}
    const noise = oc.createBuffer(1, 4410, 44100), nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const drum = (note, vel, t) => {
      const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 120 + note * 50; bp.Q.value = 1.2;
      const g = oc.createGain(); g.gain.setValueAtTime(vel * 0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const src = oc.createBufferSource(); src.buffer = noise;
      src.connect(bp).connect(g).connect(oc.destination); src.start(t); src.stop(t + 0.2);
    };
    const noteOn = (ch, note, vel, t) => {
      const key = `${ch}:${note}`, old = active.get(key);
      if (old) { old.g.gain.setTargetAtTime(0, t, 0.02); old.o.stop(t + 0.3); }
      if (ch === 9) { drum(note, vel * vol[ch], t); return; }
      const [wave, atk, sus, rel] = _gm(prog[ch]);
      const o = oc.createOscillator(), g = oc.createGain(), p = oc.createStereoPanner();
      o.type = wave as OscillatorType; o.frequency.value = 440 * 2 ** ((+note - 69) / 12); p.pan.value = pan[ch];
      const peak = vel * vol[ch] * 0.22;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + atk);
      g.gain.setTargetAtTime(peak * +sus, t + atk, 0.4);
      o.connect(g).connect(p).connect(oc.destination); o.start(t);
      active.set(key, { o, g, sus, rel, peak });
    };
    const noteOff = (ch, note, t) => {
      const v = active.get(`${ch}:${note}`);
      if (!v) return;
      v.g.gain.setTargetAtTime(0, t, v.rel); v.o.stop(t + v.rel * 8); active.delete(`${ch}:${note}`);
    };
    for (const e of evs) {
      const [st, a, b] = e.msg, ch = st & 15, hi = st & 0xf0, t = e.ts / 1000;
      if (hi === 0xc0) prog[ch] = a;
      else if (hi === 0xb0 && a === 7) vol[ch] = b / 127;
      else if (hi === 0xb0 && a === 10) pan[ch] = (b - 64) / 64;
      else if (hi === 0x90 && b > 0) noteOn(ch, a, b / 127, t);
      else if (hi === 0x80 || (hi === 0x90 && b === 0)) noteOff(ch, a, t);
    }
    for (const [, v] of active) { v.g.gain.setTargetAtTime(0, dur - 0.8, 0.15); v.o.stop(dur); }
    return oc.startRendering();
  }

  async _decode(data) {
    const pcm = decodeWavAdpcm(data);
    if (pcm) {
      const buf = this.ctx.createBuffer(pcm.channels, pcm.frames, pcm.rate);
      pcm.out.forEach((ch, i) => buf.copyToChannel(ch, i));
      return buf;
    }
    try {
      return await this.ctx.decodeAudioData(data.slice().buffer); // detaches
    } catch {
      return null;
    }
  }

  /** One-shot preview for the sound browsers: MSND {cno} or user {buf}. */
  async preview(it) {
    if (this.muted || !this.ensure()) return;
    const seq = (this._previewSeq = (this._previewSeq || 0) + 1); // stopPreview bumps it — a slow MIDS render can't start after the modal closed
    let buf = it.buf;
    if (!buf && it.cno != null) {
      const msnd = this.lib.msnd({ ctg: 'MSND', cno: it.cno, sid: 2 });
      if (!msnd) { this._warn(`can't preview: ${it.name || `MSND ${it.cno}`}`); return; }
      buf = await this._buffer(msnd);
    }
    if (seq !== this._previewSeq) return; // stale preview — modal closed/another picked
    if (buf) this._enqueue('preview', buf, 1, false, false);
    else if (it.midi || it.cno == null) this._warn(`can't preview: ${it.name || 'sound'}`);
  }

  /** Stop the browser-preview channel (sound modal closed). */
  stopPreview() {
    this._previewSeq = (this._previewSeq || 0) + 1; // invalidate in-flight renders
    const ch = this.channels.get('preview');
    if (ch?.current) { try { ch.current.stop(); } catch { /* done */ } ch.current = null; }
    ch?.queue && (ch.queue.length = 0);
  }

  /** Stop every channel (movie closed/stopped). */
  stopAll() {
    for (const ch of this.channels.values()) {
      try { ch.current?.stop(); } catch { /* already stopped */ }
      ch.current = null;
      ch.queue.length = 0;
    }
  }

  /** Stop looping sources (scene change/seek); one-shots play out. */
  stopLoops() {
    for (const ch of this.channels.values()) {
      ch.queue = ch.queue.filter((q) => !q.loop);
      if (ch.current?.loop) { try { ch.current.stop(); } catch { /* done */ } }
    }
  }

  /** Pause/resume the output (movie paused). */
  suspend() { this.ctx?.suspend(); }

  /** Mute toggle: suspend everything now, resume only if playing. */
  setMuted(m, playing) {
    this.muted = m;
    if (!this.ctx) return;
    if (m) this.ctx.suspend();
    else if (playing) this.ctx.resume();
  }

  /** True while any non-preview channel has a live source or queued items (_pmsq->FPlaying). */
  playing() {
    for (const [k, ch] of this.channels) if (k !== 'preview' && (ch.current || ch.queue.length)) return true;
    return false;
  }

  /** Play one sound event. ev: {scope:'scene'|'actor', arid, data} */
  async play(ev) {
    if (this.muted) return;
    if (!this.ensure()) return;
    const d = ev.data;
    const tags = d.tags ? d.tags : [{ tag: d.tag }];
    const sty = d.sty;
    let i = 0;
    for (const t of tags) {
      const tag = t.tag || t;
      let buf = null, isMidi = false, vlm0 = 1;
      if (tag.sid === 'usr') { // user-imported/recorded — no MSND chunk to fetch
        const u = await this.userSnd?.(tag.cno);
        if (!u?.buf) { this._warn(`missing user sound ${tag.cno}`); continue; }
        buf = u.buf; isMidi = !!u.midi;
      } else {
        const msnd = this.lib.msnd(tag);
        if (!msnd || msnd.invalid) { this._warn(`missing/invalid MSND ${tag.ctg} ${tag.cno}`); continue; }
        buf = await this._buffer(msnd);
        if (!buf) { this._warn(`no audio data in MSND ${msnd.cno}`); continue; }
        isMidi = msnd.sty === STY.Midi; vlm0 = msnd.vlm || 1;
      }
      const vlm = Math.max(0, Math.min(1, (d.vlm || 1) * vlm0));
      const key = this._key(ev, sty);
      // motion-match re-enqueue is low-priority: skip while this exact sound still
      // plays on the channel (it re-fires when the cel comes around after it ends)
      if (d.mm) { const ch = this.channels.get(key); if (ch?.current && ch.curCno === tag.cno) continue; }
      this._enqueue(key, buf, vlm, d.fLoop || isMidi, i > 0 || d.fQueue, tag.cno);
      i++;
    }
  }

  // Sound "class": actor sounds queue on (arid, sty), scene sounds on (0, sty)
  _key(ev, sty) { return `${ev.scope === 'actor' ? `a${ev.arid}` : 's'}:${sty ?? 0}`; }

  _enqueue(key, buf, vlm, loop, queued, cno = 0) {
    let ch = this.channels.get(key);
    if (!ch) this.channels.set(key, (ch = { current: null, queue: [] }));
    if (ch.current && queued) { ch.queue.push({ buf, vlm, loop, cno }); return; }
    if (ch.current) { try { ch.current.stop(); } catch { /* done */ } ch.current = null; }
    ch.queue.length = 0;
    this._start(key, ch, { buf, vlm, loop, cno });
  }

  _start(key, ch, item) {
    const src = this.ctx.createBufferSource();
    src.buffer = item.buf;
    src.loop = !!item.loop;
    const gain = this.ctx.createGain();
    gain.gain.value = item.vlm;
    src.connect(gain).connect(this.master || this.ctx.destination);
    src.onended = () => {
      if (ch.current !== src) return;
      ch.current = null;
      const next = ch.queue.shift();
      if (next) this._start(key, ch, next);
    };
    ch.current = src;
    ch.curCno = item.cno;
    src.start();
  }
}
