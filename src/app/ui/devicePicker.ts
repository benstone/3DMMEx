// Available-device picker — the "Play on" panel behind the theatre button.
// Lists the streaming paths this browser supports (local screen, AirPlay,
// remote-playback/cast targets, the CAF Chromecast app) via StreamHost.devices
// and routes each row to the matching pick* method.
import { EaselView } from './easel.ts';
import { modalSlot } from './modal.ts';
import { Element } from './element.ts';
import { localizer } from '../localization.ts';
import { streamer } from '../stream.ts';
import { CURSORS } from './cursorManager.ts';

const PW = 336, ROW_H = 36, ROW_GAP = 8; // panel width + row metrics

/** Panel background — a beveled dark-chrome plate (no baked-title texture
 *  fits this dialog, so it draws itself). */
class PanelPlate extends Element {
  constructor(x, y, w, h) { super(x, y, w, h); this.pickable = false; }
  /** Paint the plate: dark fill, outer shadow + inner highlight, title strip. */
  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = '#141414'; ctx.fillRect(2, 3, w, h);           // drop shadow
    ctx.fillStyle = '#3a3a3e'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0d0d0d'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = '#5c5c62'; ctx.beginPath();
    ctx.moveTo(3, h - 4); ctx.lineTo(3, 3); ctx.lineTo(w - 4, 3); ctx.stroke();
    // title strip
    ctx.fillStyle = '#26262a'; ctx.fillRect(6, 6, w - 12, 26);
    ctx.strokeStyle = '#1a1a1c'; ctx.lineWidth = 1; ctx.strokeRect(6.5, 6.5, w - 13, 25);
    ctx.fillStyle = '#d8d8dc';
    ctx.font = `bold 13px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(localizer.translate('ui.playOn'), w / 2, 19);
  }
}

/** One device row — beveled button with the target name and a status note. */
class DeviceRow extends Element {
  constructor(device, x, y, w) {
    super(x, y, w, ROW_H);
    this.device = device; this.cursor = CURSORS.pointer; this.hover = false;
    this.clickSound = 'sectool';
  }
  /** Paint the raised face — hover brightens. */
  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = this.hover ? '#fdf6d8' : '#f0e4c8';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a7a52'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = '#fff8e0'; ctx.beginPath();
    ctx.moveTo(2, h - 3); ctx.lineTo(2, 2); ctx.lineTo(w - 3, 2); ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.font = `bold 13px 'Comic Sans MS', cursive, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(this.device.name, 12, this.device.note ? h / 2 - 7 : h / 2, w - 20);
    if (this.device.note) {
      ctx.fillStyle = '#776'; ctx.font = `10px 'Comic Sans MS', cursive, sans-serif`;
      ctx.fillText(this.device.note, 12, h / 2 + 9, w - 20);
    }
  }
  onPointerEnter() { this.hover = true; this.dirty(); }
  onPointerLeave() { this.hover = false; this.dirty(); }
  /** Route to the row's target — each pick* runs, then the panel closes. */
  onClick() {
    const d = this.device.id;
    if (d === 'local') streamer.pickLocal();
    else if (d === 'airplay') streamer.pickAirPlay();
    else if (d === 'remote') streamer.pickRemote();
    else if (d === 'castapp') streamer.pickCastApp();
    modalSlot.close();
  }
}

/** The "available devices" easel — one row per target this browser offers. */
export class DevicePicker extends EaselView {
  static show = () => modalSlot.open(new DevicePicker());
  constructor() {
    super();
    const devices = streamer.devices();
    const ph = 42 + devices.length * (ROW_H + ROW_GAP) + 56; // title + rows + cancel strip
    const px = (640 - PW) / 2, py = (480 - ph) / 2;
    this.add(new PanelPlate(px, py, PW, ph));
    devices.forEach((d, i) => this.add(new DeviceRow(d, px + 20, py + 42 + (ROW_H + ROW_GAP) * i, PW - 40)));
    this.makeButton('cancel', 'cancelc', px + PW - 66, py + ph - 54, 50, 48, modalSlot.close);
  }
}
