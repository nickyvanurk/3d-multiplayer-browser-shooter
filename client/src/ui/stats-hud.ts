// A small always-on readout in the top-right corner: frames per second and the
// network round-trip time. Pure DOM overlay (no WebGL), updated each frame from
// the game loop. Single muted colour, slightly transparent so it stays
// unobtrusive over the scene.
export class StatsHud {
  private readonly el: HTMLDivElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly pingEl: HTMLSpanElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:30;pointer-events:none;' +
      'text-align:right;opacity:.55;' +
      'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'color:#cfe8ff;text-shadow:0 1px 2px #000;letter-spacing:.3px';

    this.fpsEl = document.createElement('span');
    this.pingEl = document.createElement('span');
    this.el.append(this.fpsEl, document.createTextNode('  '), this.pingEl);
    document.body.appendChild(this.el);

    this.update(0, 0, false);
  }

  // `fps` and `pingMs` are the smoothed values from the game loop; `synced` is
  // whether the clock has locked (before that, ping is not meaningful yet).
  update(fps: number, pingMs: number, synced: boolean): void {
    this.fpsEl.textContent = `${Math.round(fps)} fps`;
    this.pingEl.textContent = synced ? `${Math.round(pingMs)} ms` : '— ms';
  }
}
