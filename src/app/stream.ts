// Stream/cast host — plays the movie on another device. Three paths:
//  - canvas.captureStream() + a SoundQueue audio tap feed a hidden <video>;
//    Safari routes it to AirPlay (webkitShowPlaybackTargetPicker) and Chrome
//    to any cast/mirror target via the Remote Playback API
//    (video.remote.prompt()). The local player keeps driving — the TV just
//    mirrors the frame+audio — so theatre controls stay local.
//  - the CAF receiver app (receiver.html) re-renders the movie ON the TV —
//    better quality, Chromecast-only, URL-loaded movies only; while a
//    session lives the theatre becomes a remote (play/pause/seek commands).
//    Requires a registered CAF app id (cast.google.com/publish) — pass
//    ?castid= to override; unregistered sessions fail gracefully.
// The device picker (ui/devicePicker.ts) lists whatever this browser offers.
import { toastHost, elementById } from './resources.ts';
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
  _video = null;           // hidden <video> carrying the stage stream
  remotePlaying = false;   // an AirPlay/Remote Playback target is connected
  airPlayAvailable = null; // null = unknown, bool from the watch events
  remoteAvailable = null;

  /** True while a cast session is live — the theatre switches to remote mode. */
  isActive = () => this.state.active;

  // --- canvas-stream paths (AirPlay / Remote Playback) ----------------------

  /** The hidden video element streaming the stage — lazily built: the GL
   *  canvas's captureStream plus the SoundQueue's MediaStream audio tap. */
  streamVideo = () => {
    if (this._video) return this._video;
    const gl = elementById('view') as HTMLCanvasElement;
    if (!gl?.captureStream) return null;
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true; // muted until a remote target connects
    v.style.cssText = 'position:fixed;left:-9px;top:-9px;width:2px;height:2px;opacity:.01;pointer-events:none;';
    const vs = gl.captureStream(FPS);
    const dest = appState.soundQueue.mediaStreamDest();
    v.srcObject = new MediaStream([...vs.getVideoTracks(), ...(dest ? dest.stream.getAudioTracks() : [])]);
    v.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => { this.airPlayAvailable = (e as any).availability === 'available'; });
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => this._syncRemote());
    if (v.remote) {
      v.remote.watchAvailability?.((a) => { this.remoteAvailable = a; }).catch(() => {});
      v.remote.onconnect = v.remote.ondisconnect = () => this._syncRemote();
    }
    document.body.appendChild(v);
    v.play().catch(() => {});
    return this._video = v;
  };

  /** Reflect the remote-target state — while connected the video unmutes so
   *  the TV gets sound and the local speaker tap mutes (no double audio). */
  _syncRemote = () => {
    const v = this._video; if (!v) return;
    const on = v.webkitCurrentPlaybackTargetIsWireless === true || v.remote?.state === 'connected';
    this.remotePlaying = on;
    v.muted = !on;
    appState.soundQueue.setLocalMute?.(on);
  };

  /** Device rows for the picker — only mechanisms this browser supports,
   *  plus the CAF app (which lazily probes on click). */
  devices = () => {
    const probe = this.streamVideo() || document.createElement('video');
    const list = [{ id: 'local', name: localizer.translate('ui.streamLocal'), note: '' }];
    if (typeof probe.webkitShowPlaybackTargetPicker === 'function')
      list.push({ id: 'airplay', name: 'AirPlay', note: this.airPlayAvailable === false ? localizer.translate('ui.streamSearching') : '' });
    if (probe.remote)
      list.push({ id: 'remote', name: localizer.translate('ui.streamRemote'), note: this.remoteAvailable === false ? localizer.translate('ui.streamSearching') : '' });
    list.push({ id: 'castapp', name: localizer.translate('ui.streamCastApp'), note: movieDocument.lastMovieUrl ? '' : localizer.translate('ui.streamNeedsUrl') });
    return list;
  };

  /** Local screen — the old theatre button behavior (theatre in a new tab). */
  pickLocal = () => { const u = new URL(location.href); u.searchParams.set('mode', 'theatre'); window.open(u.href, '_blank'); };

  /** Safari — the system AirPlay device sheet on the streaming video. */
  pickAirPlay = () => {
    const v = this.streamVideo();
    if (!v?.webkitShowPlaybackTargetPicker) return toastHost.show(localizer.translate('ui.castUnavailable'));
    v.webkitShowPlaybackTargetPicker();
  };

  /** Chrome — the browser's remote-playback picker (cast/mirror targets). */
  pickRemote = async () => {
    const v = this.streamVideo();
    if (!v?.remote) return toastHost.show(localizer.translate('ui.castUnavailable'));
    try { await v.remote.prompt(); } catch { /* picker closed */ }
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
      const pos = appState.moviePlayer?.scene
        ? { scene: appState.moviePlayer.movie.scenes.indexOf(appState.moviePlayer.scene), frame: appState.moviePlayer.scene.nfrm - appState.moviePlayer.scene.nfrmFirst + 1 } : {};
      await sess.sendMessage(CAST_NS, {
        type: 'movie', url, ...pos, play: appState.playing,
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

  /** Fire-and-forget control message on the movie namespace. */
  sendCommand = async (type, data = {}) => {
    if (!this.session) return false;
    try { await this.session.sendMessage(CAST_NS, { type, ...data }); return true; }
    catch { return false; }
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
