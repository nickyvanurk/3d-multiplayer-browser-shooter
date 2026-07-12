// A small always-on readout at the top centre: frames per second, the network
// round-trip time, and the outbound/inbound bandwidth. Pure DOM overlay (no
// WebGL), updated each frame from the game loop. Single muted colour, slightly
// transparent so it stays unobtrusive over the scene. Top-centre keeps it clear
// of the pilot HUD (top-left) and leaderboard (top-right).
export class StatsHud {
  private readonly el: HTMLDivElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly pingEl: HTMLSpanElement;
  private readonly txEl: HTMLSpanElement;
  private readonly rxEl: HTMLSpanElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
      'z-index:30;pointer-events:none;text-align:center;opacity:.55;' +
      'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'color:#cfe8ff;text-shadow:0 1px 2px #000;letter-spacing:.3px';

    this.fpsEl = document.createElement('span');
    this.pingEl = document.createElement('span');
    this.txEl = document.createElement('span');
    this.rxEl = document.createElement('span');
    this.el.append(
      this.fpsEl,
      document.createTextNode('  '),
      this.pingEl,
      document.createTextNode('  '),
      this.txEl,
      document.createTextNode('  '),
      this.rxEl,
    );
    document.body.appendChild(this.el);

    this.update(0, 0, false, 0, 0);
  }

  // `fps` and `pingMs` are the smoothed values from the game loop; `synced` is
  // whether the clock has locked (before that, ping is not meaningful yet).
  // `txBps`/`rxBps` are the sent/received rates in BYTES per second, sampled once
  // a second by the game loop.
  update(
    fps: number,
    pingMs: number,
    synced: boolean,
    txBps: number,
    rxBps: number,
  ): void {
    this.fpsEl.textContent = `${Math.round(fps)} fps`;
    this.pingEl.textContent = synced ? `${Math.round(pingMs)} ms` : '— ms';
    this.txEl.textContent = `↑ ${formatRate(txBps)}`;
    this.rxEl.textContent = `↓ ${formatRate(rxBps)}`;
  }
}

// Format a byte/second rate as network bandwidth: kbps below 1 mbps, otherwise
// mbps (decimal megabits, matching how link speeds are quoted). 1 byte/s = 8 bits/s.
function formatRate(bytesPerSec: number): string {
  const bitsPerSec = bytesPerSec * 8;
  if (bitsPerSec < 1_000_000) {
    return `${Math.round(bitsPerSec / 1000)} kbps`;
  }
  return `${(bitsPerSec / 1_000_000).toFixed(2)} mbps`;
}
