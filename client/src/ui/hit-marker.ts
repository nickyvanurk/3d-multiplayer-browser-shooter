// The classic four-tick "X" hitmarker that flashes at the impact point when one
// of the local player's predicted shots strikes an enemy ship. Pure DOM overlay
// (no WebGL): trigger() snaps it to a screen position and restarts a short CSS
// opacity fade, so rapid hits re-pop cleanly.
export class HitMarker {
  private readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;opacity:0;pointer-events:none;z-index:20';
    this.el.innerHTML = [45, 135, 225, 315]
      .map(
        (a) =>
          '<div style="position:absolute;left:50%;top:50%;width:2px;height:8px;' +
          'margin:-4px 0 0 -1px;background:#fff;box-shadow:0 0 2px #000;' +
          `transform:rotate(${a}deg) translateY(-7px);transform-origin:center"></div>`,
      )
      .join('');
    document.body.appendChild(this.el);
  }

  // `x`/`y` are viewport pixels of the world impact point (projected by the
  // caller), so the marker pops where the bullet actually landed.
  trigger(x: number, y: number): void {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;

    // Restart the fade: kill the transition, snap to full, force reflow, then let
    // it ease back to 0. Without the reflow the browser coalesces both writes and
    // the flash never plays on a re-trigger.
    this.el.style.transition = 'none';
    this.el.style.opacity = '1';
    void this.el.offsetWidth;
    this.el.style.transition = 'opacity 250ms ease-out';
    this.el.style.opacity = '0';
  }
}
