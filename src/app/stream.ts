// Stream/cast host — plays the movie on another device. Three paths:
//  - AirPlay (Safari): canvas.captureStream() + the SoundQueue audio tap feed
//    a MediaRecorder → fragmented MP4 → MSE → a hidden <video>. srcObject
//    streams can't be AirPlayed, so the video gets a real media resource and
//    webkitShowPlaybackTargetPicker() works; the TV mirrors frame+audio ~1s
//    behind the local player.
//  - Chromecast/cast targets (Chrome): the Presentation API opens
//    receiver.html ON the device (no Cast SDK or registered app id) and the
//    connection carries the movie — by URL when the doc came from one, or
//    serialized bytes otherwise. The movie re-renders on the TV; theatre
//    controls become remote commands. Remote Playback (video.remote.prompt())
//    remains as a last-resort fallback, but only mirrors audio for streams.
//  - the CAF receiver app — same native-render idea but through a registered
//    CAF app id (cast.google.com/publish) — pass ?castid= to override; a
//    configured id gets the Cast SDK's own Chrome cast menu.
// pick() routes straight to the native picker — no in-app device list.
import { toastHost, elementById, baseUrl } from './resources.ts';
import { localizer } from './localization.ts';
import { movieDocument } from './movieDocument.ts';
import { appState } from './appState.ts';
import { playbackLoop } from './playbackLoop.ts';
import { FPS } from '../engine/player.ts';

export const CAST_NS = 'urn:x-cast:com.3dmmweb.movie';
// CAF app id — register your own receiver at cast.google.com/publish ($5) and
// override via ?castid=<id>. The default below is a placeholder.
export const CAST_APP_ID = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('castid') : null)
  || (typeof localStorage !== 'undefined' ? localStorage.getItem('castAppId') : null) || '3DMMWEB1';

class StreamHost {
  session = null;
  /** Mirrors the receiver — while a CAF session is live the theatre is a
   *  remote: its play/rewind controls send play/pause/seek messages instead
   *  of driving the local moviePlayer (the movie is on the TV). */
  state = { active: false, playing: false };
  apiPromise = null;
  conn = null;              // Presentation API connection (Chromecast path)
  _video = null;           // hidden <video> — MSE-fed (AirPlay) or srcObject (fallback)
  _rec = null;             // MediaRecorder feeding the MSE video
  _stage = null;           // canvas+audio MediaStream, shared by both feeders
  remotePlaying = false;   // an AirPlay/Remote Playback target is connected
  airPlayAvailable = null; // null = unknown, bool from the watch events
  remoteAvailable = null;

  /** Pre-warm the AirPlay pipeline on the first real user gesture —
   *  webkitShowPlaybackTargetPicker() silently no-ops on an element that
   *  isn't a loaded media resource yet, so the hidden MSE video must exist
   *  BEFORE the cast click (building it inside the click leaves the picker
   *  nothing to attach to — the first click appeared dead). Deferred a
   *  tick so the sound queue's own gesture handlers run first and the
   *  audio track makes it into the stream. */
  constructor() {
    if (typeof document === 'undefined') return;
    const probe: any = document.createElement('video');
    if (typeof probe.webkitShowPlaybackTargetPicker === 'function')
      document.addEventListener('pointerdown', () => setTimeout(() => this._mseVideo(), 0), { once: true });
  }

  /** True while a cast session is live — the theatre switches to remote mode. */
  isActive = () => this.state.active;

  // --- shared stage stream --------------------------------------------------

  /** Canvas video + master-bus audio as one MediaStream — the source the
   *  MediaRecorder (AirPlay) and the srcObject fallback both consume. */
  _stageStream = () => {
    if (this._stage) return this._stage;
    const gl = elementById('view') as HTMLCanvasElement;
    if (!gl?.captureStream) return null;
    const vs = gl.captureStream(FPS);
    const dest = appState.soundQueue.mediaStreamDest();
    return this._stage = new MediaStream([...vs.getVideoTracks(), ...(dest ? dest.stream.getAudioTracks() : [])]);
  };

  /** First mimeType MediaRecorder can produce AND MSE can append — null when
   *  the record→MSE path (needed for AirPlay) isn't supported here. */
  /** First mimeType MediaRecorder can produce AND MSE can append — null when
   *  the record→MSE path (needed for AirPlay) isn't supported here. The codec
   *  list must match the stream's actual tracks: declaring audio when the
   *  stream has none makes the demuxer reject the init segment. */
  /** iPhone Safari ships ManagedMediaSource, not MediaSource. */
  _mseClass = () => (window as any).MediaSource || (window as any).ManagedMediaSource || null;

  _mseMime = (stream?: MediaStream) => {
    const MS = this._mseClass();
    if (typeof MediaRecorder === 'undefined' || !MS) return null;
    const audio = !stream || stream.getAudioTracks().length > 0; // assume audio for the pick() probe
    const cands = audio
      ? ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs="avc1.42E01E"', 'video/webm;codecs=vp8', 'video/webm'];
    return cands.find((m) => MediaRecorder.isTypeSupported(m) && MS.isTypeSupported(m)) || null;
  };

  // --- AirPlay (Safari) -----------------------------------------------------

  /** The hidden video fed by MediaRecorder → MSE — a real media resource, so
   *  the AirPlay picker accepts it (srcObject MediaStreams can't AirPlay).
   *  ~1s behind live; buffer is trimmed to 15s behind the playhead. */
  _mseVideo = () => {
    if (this._video) return this._video;
    const stream = this._stageStream();
    const mime = stream && this._mseMime(stream);
    if (!mime || !stream) return null;
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true; // muted until a remote target connects
    v.style.cssText = 'position:fixed;left:-9px;top:-9px;width:2px;height:2px;opacity:.01;pointer-events:none;';
    const ms = new (this._mseClass() as any)();
    v.src = URL.createObjectURL(ms);
    const queue = [];
    let sb = null;
    const drain = () => {
      if (!sb || sb.updating || !queue.length) return;
      const end = sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0;
      if (end > 30) { try { sb.remove(0, end - 15); } catch { /* buffer busy */ } return; } // keep a 15s live backlog
      sb.appendBuffer(queue.shift());
    };
    ms.addEventListener('sourceopen', () => {
      // the recorder's reported mime wins when MSE accepts it (its codec
      // params may differ from the request); else the probed candidate
      const sm = rec.mimeType && this._mseClass().isTypeSupported(rec.mimeType) ? rec.mimeType : mime;
      try { sb = ms.addSourceBuffer(sm); } catch { return; } // unsupported mid-flight — nothing streams
      sb.mode = 'sequence';
      sb.addEventListener('updateend', drain);
      drain();
    });
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.addEventListener('dataavailable', (e) => { e.data.arrayBuffer().then((b) => { if (b.byteLength) { queue.push(b); drain(); } }); });
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => this._syncRemote());
    v.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => { this.airPlayAvailable = (e as any).availability === 'available'; });
    document.body.appendChild(v);
    v.play().catch(() => {});
    rec.start(800);
    playbackLoop.drawFrame?.(); // captureStream only emits on repaint — seed a frame so paused casting still has video
    this._rec = rec;
    // Warmup only needs the element loaded — once it's had a moment to
    // buffer, pause the recorder + playback so an idle pre-warmed video
    // costs nothing. Both resume when a wireless target connects.
    setTimeout(() => { if (!this.remotePlaying && this._rec === rec) { try { rec.pause(); } catch { /* unsupported */ } v.pause(); } }, 2500);
    return this._video = v;
  };

  /** Reflect the remote-target state — while connected the video unmutes so
   *  the TV gets sound and the local speaker tap mutes (no double audio).
   *  On disconnect the pipeline idles (paused, not torn down) so the next
   *  picker click still has a ready element. */
  _syncRemote = () => {
    const v = this._video; if (!v) return;
    const on = v.webkitCurrentPlaybackTargetIsWireless === true || v.remote?.state === 'connected';
    const was = this.remotePlaying; this.remotePlaying = on;
    v.muted = !on;
    appState.soundQueue.setLocalMute?.(on);
    if (on) {
      try { this._rec?.resume?.(); } catch { /* not paused */ }
      v.play().catch(() => {});
      if (!was && v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1); // join at the live edge
    } else if (was && this._rec) {
      try { this._rec.pause(); } catch { /* already stopped */ }
      v.pause();
    }
  };

  /** The srcObject video — Remote Playback fallback for browsers without the
   *  Presentation API (audio-only on most targets — Presentation is better). */
  streamVideo = () => {
    if (this._video) return this._video;
    const stream = this._stageStream();
    if (!stream) return null;
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true;
    v.style.cssText = 'position:fixed;left:-9px;top:-9px;width:2px;height:2px;opacity:.01;pointer-events:none;';
    v.srcObject = stream;
    if (v.remote) {
      v.remote.watchAvailability?.((a) => { this.remoteAvailable = a; }).catch(() => {});
      v.remote.onconnect = v.remote.ondisconnect = () => this._syncRemote();
    }
    document.body.appendChild(v);
    v.play().catch(() => {});
    playbackLoop.drawFrame?.(); // seed a capture frame
    return this._video = v;
  };

  /** Straight to the browser's native device picker — the AirPlay sheet on
   *  Safari, the Chrome cast menu on Chrome (the Cast SDK's own picker when
   *  a CAF app id is configured, else the Presentation API device dialog),
   *  and the local theatre tab when the browser offers nothing. */
  pick = () => {
    const probe: any = document.createElement('video');
    if (typeof probe.webkitShowPlaybackTargetPicker === 'function' && this._mseMime()) return this.pickAirPlay();
    const qp = new URLSearchParams(location.search);
    if (qp.get('castid') || localStorage.getItem('castAppId')) return this.pickCastApp();
    if ((window as any).PresentationRequest || probe.remote) return this.pickRemote();
    return this.pickLocal();
  };

  /** Local screen — the old theatre button behavior (theatre in a new tab). */
  pickLocal = () => { const u = new URL(location.href); u.searchParams.set('mode', 'theatre'); window.open(u.href, '_blank'); };

  /** Safari — the system AirPlay device sheet on the MSE-streaming video. */
  pickAirPlay = () => {
    const v = this._mseVideo();
    if (!v?.webkitShowPlaybackTargetPicker) return toastHost.show(localizer.translate('ui.castUnavailable'));
    v.webkitShowPlaybackTargetPicker();
    // If the pipeline only just started (no warmup), the element may not be
    // a loaded resource yet — retry once it can play; still inside the
    // click's transient-activation window on current Safari.
    if (!v.webkitCurrentPlaybackTargetIsWireless && v.readyState < 2)
      v.addEventListener('canplay', () => setTimeout(() => {
        if (!v.webkitCurrentPlaybackTargetIsWireless) v.webkitShowPlaybackTargetPicker();
      }, 60), { once: true });
  };

  /** Chrome — Presentation API first (opens receiver.html on the device);
   *  Remote Playback on the srcObject video as a last-resort fallback. */
  pickRemote = async () => {
    if ((window as any).PresentationRequest) return this.pickPresent();
    const v = this.streamVideo();
    if (!v?.remote) return toastHost.show(localizer.translate('ui.castUnavailable'));
    try { await v.remote.prompt(); } catch { /* picker closed */ }
  };

  /** Current playhead position for the movie hand-off message. */
  _pos = () => appState.moviePlayer?.scene
    ? { scene: appState.moviePlayer.movie.scenes.indexOf(appState.moviePlayer.scene), frame: appState.moviePlayer.scene.nfrm - appState.moviePlayer.scene.nfrmFirst + 1 } : {};

  /** Presentation API — opens receiver.html on the cast device and hands the
   *  movie over the connection (URL when the doc has one, bytes otherwise). */
  pickPresent = async () => {
    try {
      const u = new URL(`${baseUrl}receiver.html`, location.href);
      const packs = new URLSearchParams(location.search).get('packs');
      if (packs) u.searchParams.set('packs', packs);
      const req = new (window as any).PresentationRequest([u.href]);
      const conn = await req.start();
      this.conn = conn; this.state.active = true; this.state.playing = appState.playing;
      conn.onclose = conn.onterminate = () => {
        if (this.conn === conn) { this.conn = null; this.state.active = false; this.state.playing = false; appState.modeSync?.(); }
      };
      const url = movieDocument.lastMovieUrl;
      if (url) conn.send(JSON.stringify({ type: 'movie', url, ...this._pos(), play: appState.playing }));
      else {
        conn.send(JSON.stringify({ type: 'movieBytes', name: appState.moviePlayer?.movie?.name, ...this._pos(), play: appState.playing }));
        conn.send(movieDocument.movieBytes());
      }
      playbackLoop.setPlaying(false); // the movie moves to the TV — theatre stays as the remote
      appState.modeSync?.();
      toastHost.show(localizer.translate('ui.casting'));
    } catch (e) {
      if (e?.name !== 'NotAllowedError') toastHost.show(localizer.translate('ui.castFailed')); // user closed the picker — not an error
    }
  };

  /** Chromecast app — hands the movie URL to the CAF receiver. */
  pickCastApp = async () => {
    const url = movieDocument.lastMovieUrl;
    if (!url) return toastHost.show(localizer.translate('ui.castNeedsUrl')); // autosave/local docs can't be handed off
    if (!(await this._loadApi())) return toastHost.show(localizer.translate('ui.castUnavailable'));
    try {
      const ctx = (globalThis as any).cast.framework.CastContext.getInstance();
      ctx.addEventListener((globalThis as any).cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
        if (e.sessionState === (globalThis as any).cast.framework.SessionState.ENDED) {
          this.session = null; this.state.active = false; this.state.playing = false; appState.modeSync?.();
        }
      });
      const sess = await ctx.requestSession();
      this.session = sess; this.state.active = true; this.state.playing = appState.playing;
      await sess.sendMessage(CAST_NS, {
        type: 'movie', url, ...this._pos(), play: appState.playing,
        packs: new URLSearchParams(location.search).get('packs') || undefined,
      });
      playbackLoop.setPlaying(false); // the movie moves to the TV — theatre stays as the remote
      appState.modeSync?.();
      toastHost.show(localizer.translate('ui.casting'));
    } catch (e) {
      if (e?.code !== 'cancel') toastHost.show(localizer.translate('ui.castFailed')); // user closed the picker — not an error
    }
  };

  // --- CAF receiver session (remote-control mode) ---------------------------

  /** Fire-and-forget control message on whichever session is live —
   *  the Presentation connection or the CAF namespace. */
  sendCommand = async (type, data = {}) => {
    try {
      if (this.conn) { this.conn.send(JSON.stringify({ type, ...data })); return true; }
      if (this.session) { await this.session.sendMessage(CAST_NS, { type, ...data }); return true; }
    } catch { /* session gone */ }
    return false;
  };

  /** Toggle play/pause on the receiver and mirror the new state locally. */
  togglePlayback = async () => {
    const p = !this.state.playing;
    if (await this.sendCommand(p ? 'play' : 'pause')) { this.state.playing = p; appState.modeSync?.(); }
    return this.state.playing;
  };

  /** Seek the receiver to frame 1, then keep/start playback. */
  rewind = async () => {
    await this.sendCommand('seek', { frame: 1 });
    if (!this.state.playing) await this.togglePlayback();
  };

  /** Lazily inject the Cast sender framework — resolves true once the
   *  framework is ready (Chrome only; false when unavailable). */
  _loadApi = () => {
    if (this.apiPromise) return this.apiPromise;
    this.apiPromise = new Promise((res) => {
      (window as any).__onGCastApiAvailable = (ok) => {
        if (!ok) return res(false);
        try {
          (globalThis as any).cast.framework.CastContext.getInstance().setOptions({
            receiverApplicationId: CAST_APP_ID,
            autoJoinPolicy: (globalThis as any).chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          res(true);
        } catch { res(false); }
      };
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      s.onerror = () => res(false);
      document.head.appendChild(s);
      setTimeout(() => res(false), 8000); // API missing -> no cast on this browser
    });
    return this.apiPromise;
  };
}

export const streamer = new StreamHost();
