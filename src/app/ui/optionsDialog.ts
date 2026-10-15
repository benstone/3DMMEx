import { appState } from '../appState.ts';
import { playbackLoop } from '../playbackLoop.ts';
import { renderOptions, renderOptionsPanel } from '../renderOptions.ts';
import { localizer } from '../localization.ts';
// --- render-settings modal — app chrome that deliberately lives OUTSIDE the
// 640x480 canvas (it's a draggable OS-style dialog, not a 3DMM bitmap panel).
class OptionsDialog {
  view = null;
  snapshot = null;

  show = () => { // book button + theatre/embed settings link -> render settings modal
    if (this.view) { this.close(true); return; } // it's a toggle — second call commits
    this.snapshot = structuredClone(renderOptions);
    const ov = this.view = document.createElement('div');
    ov.className = 'optModal';
    const box = document.createElement('div');
    box.className = 'optBox'; ov.appendChild(box);
    const bar = document.createElement('div');
    bar.className = 'optBar'; box.appendChild(bar);
    const ttl = document.createElement('span');
    ttl.textContent = localizer.translate('ui.renderSettings'); bar.appendChild(ttl);
    const x = document.createElement('button');
    x.className = 'optX'; x.textContent = '×'; x.onclick = () => this.close(true); bar.appendChild(x);
    renderOptionsPanel.build(); renderOptionsPanel.panel.hidden = false; box.appendChild(renderOptionsPanel.panel);
    const pos = JSON.parse(localStorage.getItem('optdlgpos') || 'null');
    if (pos) { box.style.position = 'fixed'; box.style.left = pos.x + 'px'; box.style.top = pos.y + 'px'; }
    bar.onpointerdown = (e) => { // drag the modal by its titlebar
      if (e.target === x) return;
      e.preventDefault();
      const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      box.style.position = 'fixed'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      const mv = (e2) => {
        box.style.left = Math.min(Math.max(e2.clientX - dx, 0), innerWidth - 60) + 'px';
        box.style.top = Math.min(Math.max(e2.clientY - dy, 0), innerHeight - 40) + 'px';
      };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        const r2 = box.getBoundingClientRect();
        localStorage.setItem('optdlgpos', JSON.stringify({ x: r2.left, y: r2.top }));
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    };
    document.body.appendChild(ov);
  };

  close = (keep) => { // OK commits; Cancel/Esc reverts the session's changes
    if (!this.view) return;
    this.view.remove(); this.view = null; renderOptionsPanel.panel.hidden = true;
    if (keep) return;
    Object.assign(renderOptions, this.snapshot);
    renderOptionsPanel.syncControls(); localStorage.setItem('opts3dmm', JSON.stringify(renderOptions));
    appState.sceneRenderer.setOpts(renderOptions);
    if (appState.playing) playbackLoop.setPlaying(true); playbackLoop.drawFrame();
  };

  installEscapeRoute = () => {
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.view) this.close(false); });
  };
}

export const optionsDialog = new OptionsDialog();
optionsDialog.installEscapeRoute();
